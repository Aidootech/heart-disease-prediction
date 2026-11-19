"""Publish real artifacts to the static data files used by the Vercel app."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import (
    CATEGORY_OPTIONS,
    COLUMN_LABELS,
    DATA_FILE,
    FEATURE_HELP,
    METRIC_LABELS,
    METRIC_ORDER,
    MODEL_KEYS,
    MODEL_SPECS,
    PROJECT,
    PUBLIC_DATA_DIR,
    TARGET,
)


def _write(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    else:
        text = json.dumps(payload, indent=2, ensure_ascii=False)
    path.write_text(text, encoding="utf-8")


def publish_web_data(
    metadata: dict[str, Any],
    profile: dict[str, Any],
    verification: dict[str, Any] | None = None,
) -> dict[str, str]:
    run = {
        "trained_at": metadata["trained_at"],
        "duration_seconds": metadata["duration_seconds"],
        "environment": metadata["environment"],
        "dataset": metadata["dataset"],
        "split": metadata["split"],
        "cv": metadata["cv"],
        "selection_basis": metadata["selection_basis"],
        "decision_rule": metadata.get("decision_rule", ""),
        "signal_assessment": metadata.get("signal_assessment", {}),
        "verification": verification,
    }

    dataset_payload = {
        "project": PROJECT,
        "source_file": DATA_FILE.name,
        "shape": profile["shape"],
        "profile": profile,
        "column_labels": COLUMN_LABELS,
        "feature_help": FEATURE_HELP,
        "category_options": CATEGORY_OPTIONS,
        "target": TARGET,
        "target_meaning": {"0": "No heart disease", "1": "Heart disease"},
        "feature_count": profile["feature_count"],
    }

    models_payload = {
        "project": PROJECT,
        "run": run,
        "model_order": MODEL_KEYS,
        "models": metadata["models"],
        "best_model": metadata["best_model"],
        "best_by": metadata["best_by"],
        "selection_basis": metadata["selection_basis"],
        "metric_labels": METRIC_LABELS,
        "metric_order": METRIC_ORDER,
        "decision_rule": metadata.get("decision_rule", ""),
        "signal_assessment": metadata.get("signal_assessment", {}),
        "feature_schema": metadata["feature_schema"],
        "reference_ranges": metadata["reference_ranges"],
    }

    algorithms = []
    for spec in MODEL_SPECS:
        key = spec["key"]
        result = metadata["models"][key]
        algorithms.append(
            {
                "key": key,
                "name": spec["name"],
                "acronym": spec["acronym"],
                "family": spec["family"],
                "color": spec["color"],
                "description": spec["description"],
                "strengths": spec["strengths"],
                "hyperparameters": result["hyperparameters"],
                "cv": result["cv"],
                "metrics": result["metrics"],
                "confusion_matrix": result["confusion_matrix"],
                "roc_curve": result["roc_curve"],
                "classification_report": result["classification_report"],
                "feature_importance": result["feature_importance"],
            }
        )

    training_payload = {
        "project": PROJECT,
        "run": run,
        "algorithms": algorithms,
        "pipeline_steps": [
            {
                "title": "Dataset ingestion",
                "detail": (
                    f"{metadata['dataset']['rows']} patient records and "
                    f"{metadata['dataset']['features']} clinical features loaded "
                    f"from {DATA_FILE.name}."
                ),
            },
            {
                "title": "Feature/target separation",
                "detail": (
                    "heart_disease (0 = no disease, 1 = disease) was separated "
                    "from the ten independent variables."
                ),
            },
            {
                "title": "Stratified hold-out split",
                "detail": (
                    f"{int(metadata['split']['train_size'] * 100)}% training / "
                    f"{int(metadata['split']['test_size'] * 100)}% testing, "
                    "stratified on the target, random_state=42."
                ),
            },
            {
                "title": "Leakage-safe preprocessing",
                "detail": (
                    "StandardScaler for numerical features and OneHotEncoder for "
                    "categorical features, fitted inside each pipeline on the "
                    "training partition only."
                ),
            },
            {
                "title": "Stratified cross-validation",
                "detail": (
                    f"{metadata['cv']['folds']}-fold StratifiedKFold on the training "
                    "set compared all four algorithms before the final fit."
                ),
            },
            {
                "title": "Independent test evaluation",
                "detail": (
                    f"{metadata['dataset']['test_rows']} held-out patients were used "
                    "for accuracy, precision, recall, F1, ROC-AUC, confusion "
                    "matrices and ROC curves."
                ),
            },
            {
                "title": "Artifact persistence",
                "detail": (
                    "Fitted pipelines saved with Joblib; metrics and a verified "
                    "inference export written for the web deployment."
                ),
            },
        ],
        "retrain": {
            "command": "python train_models.py",
            "note": (
                "Training runs in the Python environment where scikit-learn and "
                "the dataset live. The hosted dashboard serves the saved, verified "
                "artifacts; it does not retrain inside a serverless function."
            ),
        },
    }

    targets = {
        "dataset.json": (dataset_payload, False),
        "models.json": (models_payload, False),
        "training.json": (training_payload, False),
    }
    written: dict[str, str] = {}
    for filename, (payload, compact) in targets.items():
        path = PUBLIC_DATA_DIR / filename
        _write(path, payload, compact=compact)
        written[filename] = str(path)
    return written
