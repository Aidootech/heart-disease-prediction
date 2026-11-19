"""Export fitted pipelines to compact JSON for dependency-free inference.

The joblib pipelines remain the canonical artifacts used by Streamlit.  This
module produces a faithful arithmetic replay for the Vercel deployment and a
reference file used to prove parity.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from .config import (
    API_MODEL_PATH,
    ARTIFACTS_DIR,
    CATEGORICAL_FEATURES,
    DECISION_THRESHOLD,
    EDGE_MODELS_PATH,
    MODEL_KEYS,
    MODEL_SPECS,
    NUMERIC_FEATURES,
    PARITY_PATH,
    PROJECT,
)
from .modeling import expand_feature_label


def _tree_payload(estimator) -> dict[str, Any]:
    tree = estimator.tree_
    return {
        "children_left": tree.children_left.tolist(),
        "children_right": tree.children_right.tolist(),
        "feature": tree.feature.tolist(),
        "threshold": [float(v) for v in tree.threshold],
        "value": [
            [round(float(component), 12) for component in row]
            for row in tree.value.reshape(tree.node_count, -1)
        ],
    }


def _preprocessing_payload(pipe: Pipeline) -> tuple[dict[str, Any], list[str]]:
    preprocessor = pipe.named_steps["preprocessor"]
    numeric_pipe = preprocessor.named_transformers_["numeric"]
    categorical_pipe = preprocessor.named_transformers_["categorical"]
    scaler = numeric_pipe.named_steps["scaler"]
    encoder = categorical_pipe.named_steps["onehot"]

    scale = [float(value) if float(value) != 0.0 else 1.0 for value in scaler.scale_]

    drop_idx = encoder.drop_idx_
    if drop_idx is None:
        drops = [None] * len(CATEGORICAL_FEATURES)
    else:
        drops = [None if value is None else int(value) for value in drop_idx]

    payload = {
        "numeric": {
            "columns": list(NUMERIC_FEATURES),
            "mean": [float(value) for value in scaler.mean_],
            "scale": scale,
        },
        "categorical": {
            "columns": list(CATEGORICAL_FEATURES),
            "categories": [
                [str(value) for value in categories]
                for categories in encoder.categories_
            ],
            "drop_idx": drops,
        },
    }

    try:
        feature_names = [
            expand_feature_label(str(name))
            for name in preprocessor.get_feature_names_out()
        ]
    except Exception:  # pragma: no cover - defensive
        feature_names = []

    return payload, feature_names


def _top_features(metadata: dict[str, Any], key: str) -> list[dict[str, Any]]:
    model = metadata["models"][key]
    importance = model.get("feature_importance", [])
    return [
        {"feature": item["feature"], "value": item["value"]}
        for item in importance[:6]
    ]


def build_edge_bundle(
    pipelines: dict[str, Pipeline], metadata: dict[str, Any]
) -> dict[str, Any]:
    # Every pipeline shares the same preprocessing configuration.
    preprocessing, feature_names = _preprocessing_payload(
        pipelines[MODEL_KEYS[0]]
    )

    models: dict[str, Any] = {}
    for spec in MODEL_SPECS:
        key = spec["key"]
        pipe = pipelines[key]
        estimator = pipe.named_steps["classifier"]
        base = {
            "name": spec["name"],
            "acronym": spec["acronym"],
            "threshold": 0.5,
            "probability_supported": True,
            "top_features": _top_features(metadata, key),
        }

        if key == "logistic_regression":
            base.update(
                {
                    "type": "logistic",
                    "coef": [float(value) for value in estimator.coef_.ravel()],
                    "intercept": [float(value) for value in estimator.intercept_],
                }
            )
        elif key == "decision_tree":
            base.update({"type": "tree", **_tree_payload(estimator)})
        elif key == "random_forest":
            base.update(
                {
                    "type": "forest",
                    "trees": [
                        _tree_payload(tree) for tree in estimator.estimators_
                    ],
                }
            )
        elif key == "svm":
            base.update(
                {
                    "type": "svc",
                    "support_vectors": [
                        [round(float(value), 12) for value in row]
                        for row in estimator.support_vectors_
                    ],
                    "dual_coef": [
                        round(float(value), 15)
                        for value in estimator._dual_coef_.ravel()
                    ],
                    "intercept": [
                        round(float(value), 15) for value in estimator._intercept_
                    ],
                    "gamma": float(estimator._gamma),
                    "probA": [round(float(value), 15) for value in estimator._probA],
                    "probB": [round(float(value), 15) for value in estimator._probB],
                }
            )
        else:
            raise ValueError(f"Unsupported model: {key}")

        models[key] = base

    return {
        "schema_version": 1,
        "created_at": metadata["trained_at"],
        "project": PROJECT,
        "model_order": MODEL_KEYS,
        "feature_names": feature_names,
        "trained_ranges": metadata.get("reference_ranges", {}),
        "preprocessing": preprocessing,
        "models": models,
        "source": {
            "estimator": "scikit-learn",
            "export_note": (
                "Arithmetic replay of the fitted preprocessing and classifier. "
                "Verified against scikit-learn predictions on the full dataset."
            ),
        },
    }


def build_parity_reference(
    pipelines: dict[str, Pipeline], df: pd.DataFrame
) -> dict[str, Any]:
    from .config import FEATURES

    X = df[FEATURES]
    rows = [
        {col: (float(row[col]) if col in NUMERIC_FEATURES else str(row[col])) for col in FEATURES}
        for _, row in X.iterrows()
    ]
    reference: dict[str, Any] = {
        "rows": rows,
        "models": {},
    }
    for key, pipe in pipelines.items():
        probabilities = [float(value) for value in pipe.predict_proba(X)[:, 1]]
        reference["models"][key] = {
            "prediction": [
                int(probability >= DECISION_THRESHOLD)
                for probability in probabilities
            ],
            "probability": [round(probability, 12) for probability in probabilities],
        }
    return reference


def export_all(
    pipelines: dict[str, Pipeline], metadata: dict[str, Any], df: pd.DataFrame
) -> dict[str, Any]:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = build_edge_bundle(pipelines, metadata)
    reference = build_parity_reference(pipelines, df)

    EDGE_MODELS_PATH.write_text(
        json.dumps(bundle, ensure_ascii=False), encoding="utf-8"
    )
    API_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    API_MODEL_PATH.write_text(
        json.dumps(bundle, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    PARITY_PATH.write_text(
        json.dumps(reference, separators=(",", ":")), encoding="utf-8"
    )
    return bundle


def load_edge_bundle() -> dict[str, Any]:
    if not EDGE_MODELS_PATH.exists():
        raise FileNotFoundError(
            "Exported inference bundle is missing. Run `python train_models.py`."
        )
    return json.loads(EDGE_MODELS_PATH.read_text(encoding="utf-8"))
