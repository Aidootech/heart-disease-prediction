"""Train every classifier, persist the pipelines and publish web artifacts.

Usage:
    python train_models.py
"""

from __future__ import annotations

import sys
import time
import warnings

from heart_ml.data import load_dataset
from heart_ml.training_service import run_training
from heart_ml.verify import format_parity_report


def main() -> int:
    warnings.filterwarnings("ignore", category=FutureWarning, message=".*deprecated.*")
    print("Heart Disease Prediction System — model training")
    print("=" * 62)
    df = load_dataset()
    print(
        f"Dataset: {len(df)} records · {df.shape[1] - 1} features · "
        f"target prevalence {(df['heart_disease'].mean() * 100):.1f}%"
    )

    last = {"step": -1}

    def progress(done: int, total: int, message: str) -> None:
        if done != last["step"]:
            print(f"  [{done}/{total}] {message}")
            last["step"] = done

    started = time.perf_counter()
    metadata, verification = run_training(progress=progress)
    elapsed = time.perf_counter() - started

    print("\nHeld-out test performance")
    print("-" * 62)
    header = f"{'Model':<24}{'Acc':>7}{'Prec':>7}{'Rec':>7}{'F1':>7}{'AUC':>7}"
    print(header)
    ranked = sorted(
        metadata["models"].values(),
        key=lambda item: item["metrics"]["roc_auc"],
        reverse=True,
    )
    for model in ranked:
        m = model["metrics"]
        print(
            f"{model['name']:<24}"
            f"{m['accuracy']:>7.3f}{m['precision']:>7.3f}{m['recall']:>7.3f}"
            f"{m['f1']:>7.3f}{m['roc_auc']:>7.3f}"
        )

    best = metadata["best_model"]
    print(
        f"\nSelected model (highest mean CV ROC-AUC): {best['name']} "
        f"({best['score']:.3f})"
    )
    print(f"Training time: {elapsed:.1f}s")
    print()
    print(format_parity_report(verification))
    print("\nArtifacts written to artifacts/ and public/data/.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - CLI surface
        print(f"Training failed: {exc}", file=sys.stderr)
        raise
