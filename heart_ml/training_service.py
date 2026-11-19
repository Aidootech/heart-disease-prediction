"""One-call training orchestration shared by the CLI and the Streamlit UI."""

from __future__ import annotations

import json
from typing import Any, Callable

from .config import ARTIFACTS_DIR, PARITY_PATH
from .data import dataset_profile, load_dataset
from .export import export_all
from .modeling import save_artifacts, train_all
from .publish import publish_web_data
from .verify import verify_python_parity

ProgressCallback = Callable[[int, int, str], None]


def run_training(
    progress: ProgressCallback | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Train, persist, export, verify and publish in a single transaction."""
    df = load_dataset()
    profile = dataset_profile(df)

    metadata, pipelines = train_all(df, progress)
    save_artifacts(pipelines, metadata)
    bundle = export_all(pipelines, metadata, df)

    reference = json.loads(PARITY_PATH.read_text(encoding="utf-8"))
    verification = verify_python_parity(bundle, reference)
    verification["checked_at"] = metadata["trained_at"]
    (ARTIFACTS_DIR / "verification.json").write_text(
        json.dumps(verification, indent=2), encoding="utf-8"
    )

    if not verification["passed"]:
        raise RuntimeError(
            "The exported inference bundle does not match scikit-learn. "
            "Training artifacts were written but the deployment export is not "
            "safe to publish. Inspect artifacts/verification.json."
        )

    publish_web_data(metadata, profile, verification)
    return metadata, verification
