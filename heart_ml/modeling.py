"""Model construction, stratified cross-validation, evaluation and persistence."""

from __future__ import annotations

import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from .config import (
    CATEGORICAL_FEATURES,
    CATEGORY_OPTIONS,
    COLUMN_LABELS,
    CV_FOLDS,
    DECISION_THRESHOLD,
    DEFAULT_CRITERION,
    FEATURE_HELP,
    INPUT_BOUNDS,
    METRIC_LABELS,
    METRIC_ORDER,
    METADATA_PATH,
    MODEL_KEYS,
    MODEL_SPECS,
    MODELS_DIR,
    NUMERIC_FEATURES,
    RANDOM_STATE,
    TARGET,
    TEST_SIZE,
    UNITS,
)
from .data import reference_ranges, split_features_target
from .preprocessing import build_preprocessor

ProgressCallback = Callable[[int, int, str], None]


# ---------------------------------------------------------------------------
# Pipeline construction
# ---------------------------------------------------------------------------
def _make_estimator(key: str):
    if key == "logistic_regression":
        return LogisticRegression(
            C=1.0, max_iter=2000, solver="lbfgs", random_state=RANDOM_STATE
        )
    if key == "decision_tree":
        return DecisionTreeClassifier(
            max_depth=5,
            min_samples_leaf=8,
            random_state=RANDOM_STATE,
        )
    if key == "random_forest":
        return RandomForestClassifier(
            n_estimators=300,
            max_features="sqrt",
            min_samples_leaf=2,
            n_jobs=-1,
            random_state=RANDOM_STATE,
        )
    if key == "svm":
        return SVC(
            C=1.0,
            kernel="rbf",
            gamma="scale",
            probability=True,
            random_state=RANDOM_STATE,
        )
    raise ValueError(f"Unknown model key: {key}")


def build_pipelines() -> dict[str, Pipeline]:
    """Create one unfitted preprocessing + classifier pipeline per algorithm."""
    return {
        key: Pipeline(
            steps=[
                ("preprocessor", build_preprocessor()),
                ("classifier", _make_estimator(key)),
            ]
        )
        for key in MODEL_KEYS
    }


# ---------------------------------------------------------------------------
# Interpretation helpers
# ---------------------------------------------------------------------------
def expand_feature_label(raw_name: str) -> str:
    if raw_name in COLUMN_LABELS:
        return COLUMN_LABELS[raw_name]
    for col in CATEGORICAL_FEATURES:
        prefix = f"{col}_"
        if raw_name.startswith(prefix):
            value = raw_name[len(prefix):]
            return f"{COLUMN_LABELS[col]} = {value}"
    return raw_name.replace("_", " ").title()


def _public_params(estimator) -> dict[str, Any]:
    """Small, JSON-safe view of the hyperparameters shown in the UI."""
    keep = (
        "C",
        "max_depth",
        "min_samples_leaf",
        "n_estimators",
        "max_features",
        "kernel",
        "gamma",
        "probability",
        "solver",
        "max_iter",
    )
    params: dict[str, Any] = {}
    for key in keep:
        if hasattr(estimator, key):
            value = getattr(estimator, key)
            if isinstance(value, np.integer):
                value = int(value)
            elif isinstance(value, np.floating):
                value = float(value)
            params[key] = value
    return params


def _feature_importance(pipe: Pipeline) -> list[dict[str, Any]]:
    preprocessor = pipe.named_steps["preprocessor"]
    classifier = pipe.named_steps["classifier"]
    try:
        names = list(preprocessor.get_feature_names_out())
    except Exception:  # pragma: no cover - defensive
        return []

    values: np.ndarray | None = None
    kind = ""
    if hasattr(classifier, "coef_"):
        values = np.ravel(classifier.coef_)
        kind = "coefficient"
    elif hasattr(classifier, "feature_importances_"):
        values = np.ravel(classifier.feature_importances_)
        kind = "importance"

    if values is None or len(values) != len(names):
        return []

    items = [
        {
            "feature": expand_feature_label(name),
            "raw": name,
            "value": round(float(value), 4),
            "magnitude": round(float(abs(value)), 4),
            "direction": (
                "increases risk" if value > 0 else "decreases risk"
            )
            if kind == "coefficient"
            else "",
        }
        for name, value in zip(names, values)
    ]
    items.sort(key=lambda item: item["magnitude"], reverse=True)
    return items


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------
def _evaluate(pipe: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> dict[str, Any]:
    y_proba = pipe.predict_proba(X_test)[:, 1]
    # One explicit operating rule for every algorithm and for both the hosted
    # and local prediction screens.  SVM's margin-based predict() is not used
    # because its Platt probabilities would otherwise contradict the label.
    y_pred = (y_proba >= DECISION_THRESHOLD).astype(int)

    metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_proba)), 4),
    }

    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])
    report = classification_report(
        y_test, y_pred, labels=[0, 1], output_dict=True, zero_division=0
    )
    report_rows = []
    for label, key in [
        ("No heart disease", "0"),
        ("Heart disease", "1"),
        ("Macro average", "macro avg"),
        ("Weighted average", "weighted avg"),
    ]:
        entry = report.get(key, {})
        report_rows.append(
            {
                "label": label,
                "precision": round(float(entry.get("precision", 0)), 4),
                "recall": round(float(entry.get("recall", 0)), 4),
                "f1": round(float(entry.get("f1-score", 0)), 4),
                "support": int(entry.get("support", 0)),
            }
        )

    fpr, tpr, _ = roc_curve(y_test, y_proba)
    step = max(1, len(fpr) // 120)
    roc_points = [
        {"fpr": round(float(f), 4), "tpr": round(float(t), 4)}
        for f, t in list(zip(fpr, tpr))[::step]
    ]
    if roc_points[-1] != {"fpr": 1.0, "tpr": 1.0}:
        roc_points.append({"fpr": 1.0, "tpr": 1.0})

    positives = int((y_test == 1).sum())
    negatives = int((y_test == 0).sum())
    tn, fp, fn, tp = (int(v) for v in cm.ravel())

    return {
        "metrics": metrics,
        "confusion_matrix": {
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "tp": tp,
            "matrix": [[tn, fp], [fn, tp]],
            "labels": ["No disease", "Heart disease"],
        },
        "classification_report": report_rows,
        "roc_curve": roc_points,
        "test_samples": int(len(y_test)),
        "test_positives": positives,
        "test_negatives": negatives,
        "threshold": DECISION_THRESHOLD,
    }


def _cross_validate(
    pipe: Pipeline, X_train: pd.DataFrame, y_train: pd.Series
) -> dict[str, Any]:
    cv = StratifiedKFold(
        n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE
    )
    scoring = {
        "accuracy": "accuracy",
        "precision": "precision",
        "recall": "recall",
        "f1": "f1",
        "roc_auc": "roc_auc",
    }
    scores = cross_validate(
        pipe,
        X_train,
        y_train,
        cv=cv,
        scoring=scoring,
        n_jobs=None,
        error_score="raise",
        return_train_score=False,
    )
    summary = {}
    for metric in METRIC_ORDER:
        values = scores[f"test_{metric}"]
        summary[metric] = {
            "mean": round(float(np.mean(values)), 4),
            "std": round(float(np.std(values)), 4),
            "folds": [round(float(value), 4) for value in values],
        }
    return summary


# ---------------------------------------------------------------------------
# Training orchestration
# ---------------------------------------------------------------------------
def train_all(
    df: pd.DataFrame, progress: ProgressCallback | None = None
) -> tuple[dict[str, Any], dict[str, Pipeline]]:
    """Train all algorithms and return metadata plus fitted pipelines.

    Preprocessing lives inside each pipeline, so the scaler and encoder are
    fitted only on the training partition of every fold.
    """
    X, y = split_features_target(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        stratify=y,
        random_state=RANDOM_STATE,
    )

    pipelines = build_pipelines()
    total = len(MODEL_KEYS)
    results: dict[str, Any] = {}
    started = time.perf_counter()

    for index, spec in enumerate(MODEL_SPECS):
        key = spec["key"]
        name = spec["name"]
        if progress:
            progress(index, total, f"Training {name}…")

        pipe = pipelines[key]
        cv_results = _cross_validate(pipe, X_train, y_train)
        pipe.fit(X_train, y_train)
        evaluation = _evaluate(pipe, X_test, y_test)

        results[key] = {
            "key": key,
            "name": name,
            "acronym": spec["acronym"],
            "family": spec["family"],
            "color": spec["color"],
            "description": spec["description"],
            "strengths": spec["strengths"],
            "cv": cv_results,
            "cv_roc_auc": cv_results["roc_auc"]["mean"],
            **evaluation,
            "hyperparameters": _public_params(pipe.named_steps["classifier"]),
            "feature_importance": _feature_importance(pipe)[:14],
            "probability_supported": True,
        }
        if progress:
            progress(index + 1, total, f"{name} trained")

    duration = time.perf_counter() - started

    # Model selection uses cross-validated performance on the training set only,
    # never the held-out test set, to keep the evaluation unbiased.
    best_by = {
        metric: max(
            results,
            key=lambda k: results[k]["cv"][metric]["mean"],
        )
        for metric in METRIC_ORDER
    }
    best_key = best_by[DEFAULT_CRITERION]
    best_cv_auc = results[best_by["roc_auc"]]["cv"]["roc_auc"]["mean"]
    if best_cv_auc < 0.60:
        signal_text = (
            "Discrimination is close to chance on this synthetic sample. "
            "Feature associations are very weak, so the reported metrics "
            "should be read as a demonstration of the modelling workflow, "
            "not as clinical evidence."
        )
    elif best_cv_auc < 0.75:
        signal_text = (
            "The sample shows modest discrimination. Results should be "
            "validated on a larger, clinically realistic cohort."
        )
    else:
        signal_text = (
            "The models show useful discrimination on this sample; external "
            "validation is still required before any clinical use."
        )

    observed_ranges = reference_ranges(df)
    feature_schema = {
        "numeric": [
            {
                "name": col,
                "label": COLUMN_LABELS[col],
                "unit": UNITS.get(col, ""),
                "help": FEATURE_HELP.get(col, ""),
                "min": INPUT_BOUNDS[col][0],
                "max": INPUT_BOUNDS[col][1],
                "observed_min": observed_ranges[col]["min"],
                "observed_max": observed_ranges[col]["max"],
                "mean": observed_ranges[col]["mean"],
                "median": round(float(df[col].median()), 2),
                "step": 0.1 if col in {"bmi"} else 1,
            }
            for col in NUMERIC_FEATURES
        ],
        "categorical": [
            {
                "name": col,
                "label": COLUMN_LABELS[col],
                "help": FEATURE_HELP.get(col, ""),
                "options": CATEGORY_OPTIONS[col],
            }
            for col in CATEGORICAL_FEATURES
        ],
    }

    metadata: dict[str, Any] = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "duration_seconds": round(duration, 2),
        "dataset": {
            "rows": int(len(df)),
            "features": int(X.shape[1]),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "positive": int((y == 1).sum()),
            "negative": int((y == 0).sum()),
        },
        "split": {
            "test_size": TEST_SIZE,
            "train_size": 1 - TEST_SIZE,
            "stratified": True,
            "random_state": RANDOM_STATE,
        },
        "cv": {
            "folds": CV_FOLDS,
            "shuffle": True,
            "random_state": RANDOM_STATE,
            "strategy": "StratifiedKFold",
        },
        "target": TARGET,
        "features": list(X.columns),
        "reference_ranges": observed_ranges,
        "feature_schema": feature_schema,
        "models": results,
        "best_model": {
            "key": best_key,
            "name": results[best_key]["name"],
            "criterion": DEFAULT_CRITERION,
            "score": results[best_key]["cv"][DEFAULT_CRITERION]["mean"],
        },
        "best_by": best_by,
        "selection_basis": (
            f"mean cross-validated {METRIC_LABELS[DEFAULT_CRITERION]} "
            "on the training set"
        ),
        "signal_assessment": {
            "best_cv_roc_auc": round(float(best_cv_auc), 4),
            "interpretation": signal_text,
        },
        "decision_rule": (
            "Heart disease is predicted when P(heart disease) >= 0.50. "
            "The same rule is used for test-set metrics and live predictions."
        ),
        "environment": {
            "python": platform.python_version(),
            "scikit_learn": sklearn.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "joblib": joblib.__version__,
        },
    }

    if progress:
        progress(total, total, "Training complete")

    return metadata, pipelines


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def save_artifacts(
    pipelines: dict[str, Pipeline], metadata: dict[str, Any]
) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for key, pipe in pipelines.items():
        joblib.dump(pipe, MODELS_DIR / f"{key}.joblib", compress=3)
    METADATA_PATH.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def artifacts_available() -> bool:
    if not METADATA_PATH.exists():
        return False
    return all(
        (MODELS_DIR / f"{key}.joblib").exists() for key in MODEL_KEYS
    )


def load_metadata() -> dict[str, Any]:
    if not METADATA_PATH.exists():
        raise FileNotFoundError(
            "No trained model metadata found. Run `python train_models.py` "
            "or use the Model Training page."
        )
    return json.loads(METADATA_PATH.read_text(encoding="utf-8"))


def load_models() -> dict[str, Pipeline]:
    missing = [
        key
        for key in MODEL_KEYS
        if not (MODELS_DIR / f"{key}.joblib").exists()
    ]
    if missing:
        raise FileNotFoundError(
            "Missing saved model(s): "
            + ", ".join(missing)
            + ". Retrain from the Model Training page."
        )
    return {
        key: joblib.load(MODELS_DIR / f"{key}.joblib") for key in MODEL_KEYS
    }


def metadata_age_seconds() -> float | None:
    if not METADATA_PATH.exists():
        return None
    return time.time() - METADATA_PATH.stat().st_mtime
