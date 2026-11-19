"""Dependency-light inference engine for exported model artifacts.

The Streamlit application uses the original scikit-learn/joblib pipelines.
The Vercel deployment cannot ship scikit-learn (its native dependencies exceed
the serverless bundle limit), so the trained pipelines are exported into a
compact JSON representation and evaluated by the pure-Python/JavaScript
implementations in this module.  Parity with scikit-learn is verified against
the held-out predictions by ``scripts/verify_export.py``.

Nothing in this module is used to train models; it only replays the arithmetic
of the already-fitted preprocessing and classifiers.
"""

from __future__ import annotations

import json
import math
import struct
from typing import Any

from .validation import clinical_indicators, risk_band

_F32 = struct.Struct("f")


def _f32(value: float) -> float:
    """Round a double to IEEE-754 float32, matching scikit-learn's trees."""
    return _F32.unpack(_F32.pack(value))[0]


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    exp_z = math.exp(z)
    return exp_z / (1.0 + exp_z)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _binary_multiclass_probability(q: float) -> float:
    """Replicate libsvm's ``multiclass_probability`` for two classes.

    scikit-learn delegates SVC probability estimation to libsvm, which solves
    a small coupling problem iteratively.  Replicating the iteration (instead
    of using the closed-form sigmoid) keeps parity to machine precision.
    """
    q = _clamp(q, 1e-7, 1.0 - 1e-7)
    r01 = q
    r10 = 1.0 - q

    qmatrix = [
        [r10 * r10, -r10 * r01],
        [-r10 * r01, r01 * r01],
    ]
    p = [0.5, 0.5]
    eps = 0.005 / 2.0

    for _ in range(100):
        qp = [
            sum(qmatrix[t][j] * p[j] for j in range(2)) for t in range(2)
        ]
        pqp = sum(p[t] * qp[t] for t in range(2))
        max_error = max(abs(qp[t] - pqp) for t in range(2))
        if max_error < eps:
            break
        for t in range(2):
            diff = (-qp[t] + pqp) / qmatrix[t][t]
            p[t] += diff
            pqp = (
                pqp + diff * (diff * qmatrix[t][t] + 2.0 * qp[t])
            ) / (1.0 + diff) / (1.0 + diff)
            for j in range(2):
                qp[j] = (qp[j] + diff * qmatrix[t][j]) / (1.0 + diff)
                p[j] /= 1.0 + diff

    return p[1]


class EdgePredictor:
    """Replay an exported preprocessing + classification pipeline."""

    def __init__(self, bundle: dict[str, Any]):
        self.bundle = bundle
        pre = bundle["preprocessing"]
        self.numeric_columns: list[str] = pre["numeric"]["columns"]
        self.numeric_mean: list[float] = pre["numeric"]["mean"]
        self.numeric_scale: list[float] = pre["numeric"]["scale"]
        self.categorical_columns: list[str] = pre["categorical"]["columns"]
        self.categories: list[list[str]] = pre["categorical"]["categories"]
        self.drop_idx: list[int | None] = pre["categorical"].get("drop_idx", [])
        self.models: dict[str, Any] = bundle["models"]
        self.feature_names: list[str] = bundle.get("feature_names", [])
        self.model_order: list[str] = bundle.get(
            "model_order", list(self.models.keys())
        )

    # -- preprocessing -----------------------------------------------------
    def design_vector(self, patient: dict[str, Any]) -> list[float]:
        vector: list[float] = []
        for index, col in enumerate(self.numeric_columns):
            value = float(patient[col])
            scale = self.numeric_scale[index] or 1.0
            vector.append((value - self.numeric_mean[index]) / scale)

        for index, col in enumerate(self.categorical_columns):
            value = str(patient[col])
            drop = (
                self.drop_idx[index]
                if index < len(self.drop_idx)
                else None
            )
            for cat_index, category in enumerate(self.categories[index]):
                if drop is not None and cat_index == drop:
                    continue
                vector.append(1.0 if value == category else 0.0)

        return vector

    # -- classifier replay -------------------------------------------------
    def _tree_probability(self, tree: dict[str, Any], x: list[float]) -> float:
        node = 0
        left = tree["children_left"]
        right = tree["children_right"]
        feature = tree["feature"]
        threshold = tree["threshold"]
        while left[node] != -1:
            if _f32(x[feature[node]]) <= threshold[node]:
                node = left[node]
            else:
                node = right[node]
        values = tree["value"][node]
        total = values[0] + values[1]
        return values[1] / total if total else 0.0

    def predict_proba(self, model_key: str, patient: dict[str, Any]) -> float:
        """Return P(heart_disease = 1) for a validated patient record."""
        model = self.models[model_key]
        x = self.design_vector(patient)
        kind = model["type"]

        if kind == "logistic":
            z = float(model["intercept"][0])
            for coefficient, value in zip(model["coef"], x):
                z += coefficient * value
            return _clamp(_sigmoid(z), 0.0, 1.0)

        if kind == "tree":
            return self._tree_probability(model, x)

        if kind == "forest":
            total = 0.0
            for tree in model["trees"]:
                total += self._tree_probability(tree, x)
            return total / len(model["trees"])

        if kind == "svc":
            gamma = float(model["gamma"])
            decision = float(model["intercept"][0])
            for dual, support in zip(model["dual_coef"], model["support_vectors"]):
                squared = 0.0
                for value, sv in zip(x, support):
                    diff = value - sv
                    squared += diff * diff
                decision += dual * math.exp(-gamma * squared)
            argument = float(model["probA"][0]) * decision + float(model["probB"][0])
            if argument > 700:
                q = 0.0
            elif argument < -700:
                q = 1.0
            else:
                q = 1.0 / (1.0 + math.exp(argument))
            return _clamp(_binary_multiclass_probability(q), 0.0, 1.0)

        raise ValueError(f"Unsupported exported model type: {kind}")

    # -- explanations ------------------------------------------------------
    def drivers(self, model_key: str, patient: dict[str, Any]) -> list[dict[str, Any]]:
        """Return patient-specific or model-level factors behind the score."""
        model = self.models[model_key]
        x = self.design_vector(patient)

        if model["type"] == "logistic":
            contributions = []
            for name, coefficient, value in zip(
                self.feature_names, model["coef"], x
            ):
                contributions.append(
                    {
                        "feature": name,
                        "contribution": coefficient * value,
                    }
                )
            contributions.sort(key=lambda item: abs(item["contribution"]), reverse=True)
            drivers = []
            for item in contributions[:5]:
                drivers.append(
                    {
                        "feature": item["feature"],
                        "impact": (
                            "increases" if item["contribution"] > 0 else "decreases"
                        ),
                        "strength": round(abs(item["contribution"]), 3),
                        "basis": "patient_contribution",
                    }
                )
            return drivers

        top = model.get("top_features", [])[:4]
        return [
            {
                "feature": item["feature"],
                "impact": "associated",
                "strength": round(float(item["value"]), 3),
                "basis": "global_importance",
            }
            for item in top
        ]

    def predict(self, model_key: str, patient: dict[str, Any]) -> dict[str, Any]:
        probability = self.predict_proba(model_key, patient)
        probability = _clamp(probability, 0.0, 1.0)
        label = int(probability >= 0.5)
        band = risk_band(probability)
        model = self.models[model_key]

        return {
            "model": model_key,
            "model_name": model["name"],
            "prediction": label,
            "label": "Heart Disease Detected" if label == 1 else "No Heart Disease Detected",
            "probability": round(probability, 6),
            "probability_no_disease": round(1.0 - probability, 6),
            "threshold": 0.5,
            "risk_band": band,
            "drivers": self.drivers(model_key, patient),
            "clinical_indicators": clinical_indicators(patient),
            "inputs": patient,
        }

    def predict_all(self, patient: dict[str, Any]) -> dict[str, Any]:
        return {
            key: self.predict(key, patient)
            for key in self.model_order
            if key in self.models
        }


def load_edge_predictor(path) -> EdgePredictor:
    with open(path, "r", encoding="utf-8") as handle:
        return EdgePredictor(json.load(handle))
