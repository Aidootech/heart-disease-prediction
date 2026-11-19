"""Parity checks between scikit-learn and the exported inference bundle."""

from __future__ import annotations

from typing import Any

from .inference import EdgePredictor


def verify_python_parity(
    bundle: dict[str, Any],
    reference: dict[str, Any],
    tolerance: float = 1e-8,
) -> dict[str, Any]:
    predictor = EdgePredictor(bundle)
    rows = reference["rows"]

    report: dict[str, Any] = {
        "tolerance": tolerance,
        "rows": len(rows),
        "models": {},
        "passed": True,
    }

    for key, expected in reference["models"].items():
        probabilities = expected["probability"]
        predictions = expected["prediction"]
        max_diff = 0.0
        label_mismatches = 0
        for row, expected_probability, expected_prediction in zip(
            rows, probabilities, predictions
        ):
            probability = predictor.predict_proba(key, row)
            max_diff = max(max_diff, abs(probability - expected_probability))
            label = int(probability >= 0.5)
            if label != expected_prediction:
                label_mismatches += 1

        passed = max_diff <= tolerance and label_mismatches == 0
        report["models"][key] = {
            "max_abs_probability_diff": max_diff,
            "label_mismatches": label_mismatches,
            "passed": passed,
        }
        if not passed:
            report["passed"] = False

    return report


def format_parity_report(report: dict[str, Any]) -> str:
    lines = [
        f"Inference parity over {report['rows']} patient records "
        f"(tolerance {report['tolerance']:g}):"
    ]
    for key, result in report["models"].items():
        status = "PASS" if result["passed"] else "FAIL"
        lines.append(
            f"  {status}  {key:<22} max |Δp| = "
            f"{result['max_abs_probability_diff']:.3e}, "
            f"label mismatches = {result['label_mismatches']}"
        )
    lines.append(f"Overall: {'PASS' if report['passed'] else 'FAIL'}")
    return "\n".join(lines)
