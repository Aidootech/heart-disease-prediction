"""Input validation shared by the Streamlit form and the serverless API.

Keeping this logic in one place guarantees that a patient entered in either
interface is validated against the same bounds and encoded identically.
"""

from __future__ import annotations

from typing import Any

from .config import (
    CATEGORICAL_FEATURES,
    CATEGORY_OPTIONS,
    COLUMN_LABELS,
    INPUT_BOUNDS,
    NUMERIC_FEATURES,
    UNITS,
)


def _coerce_category(name: str, value: Any) -> str | None:
    if isinstance(value, bool):
        value = "Yes" if value else "No"
    text = str(value).strip()
    if not text:
        return None
    for option in CATEGORY_OPTIONS[name]:
        if text.lower() == option.lower():
            return option
    # Common aliases for binary clinical fields.
    lowered = text.lower()
    if name != "sex":
        if lowered in {"true", "1", "y"}:
            return "Yes"
        if lowered in {"false", "0", "n"}:
            return "No"
    return None


def validate_patient(
    payload: dict[str, Any], reference_ranges: dict[str, dict[str, float]] | None = None
) -> dict[str, Any]:
    """Validate a raw patient dictionary.

    Returns a dict with ``valid``, ``values`` (fully encoded strings/numbers),
    ``errors`` and ``warnings``.  Warnings flag values outside the observed
    training range without blocking the prediction.
    """
    values: dict[str, Any] = {}
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(payload, dict):
        return {
            "valid": False,
            "values": {},
            "errors": ["The patient payload must be a JSON object."],
            "warnings": [],
        }

    for col in NUMERIC_FEATURES:
        raw = payload.get(col)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            errors.append(f"{COLUMN_LABELS[col]} is required.")
            continue
        try:
            number = float(raw)
        except (TypeError, ValueError):
            errors.append(f"{COLUMN_LABELS[col]} must be a number.")
            continue
        if number != number or number in (float("inf"), float("-inf")):
            errors.append(f"{COLUMN_LABELS[col]} must be a finite number.")
            continue

        lower, upper = INPUT_BOUNDS[col]
        if number < lower or number > upper:
            unit = UNITS.get(col, "")
            errors.append(
                f"{COLUMN_LABELS[col]} must be between {lower:g} and {upper:g}"
                + (f" {unit}" if unit else "")
                + "."
            )
            continue

        values[col] = round(number, 2)

        if reference_ranges and col in reference_ranges:
            observed_min = reference_ranges[col]["min"]
            observed_max = reference_ranges[col]["max"]
            if number < observed_min or number > observed_max:
                warnings.append(
                    f"{COLUMN_LABELS[col]} ({number:g}) is outside the observed "
                    f"training range ({observed_min:g}–{observed_max:g}); "
                    "the prediction is an extrapolation."
                )

    for col in CATEGORICAL_FEATURES:
        raw = payload.get(col)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            errors.append(f"{COLUMN_LABELS[col]} is required.")
            continue
        option = _coerce_category(col, raw)
        if option is None:
            errors.append(
                f"{COLUMN_LABELS[col]} must be one of: "
                + ", ".join(CATEGORY_OPTIONS[col])
                + "."
            )
            continue
        values[col] = option

    return {
        "valid": not errors,
        "values": values,
        "errors": errors,
        "warnings": warnings,
    }


CLINICAL_FLAGS = [
    {
        "field": "age",
        "test": lambda v: v >= 60,
        "label": "Older age",
        "detail": "60 years or older",
        "severity": "moderate",
    },
    {
        "field": "blood_pressure",
        "test": lambda v: v >= 140,
        "label": "High blood pressure",
        "detail": "Systolic BP ≥ 140 mmHg",
        "severity": "high",
    },
    {
        "field": "blood_pressure",
        "test": lambda v: 130 <= v < 140,
        "label": "Elevated blood pressure",
        "detail": "Systolic BP 130–139 mmHg",
        "severity": "moderate",
    },
    {
        "field": "cholesterol",
        "test": lambda v: v >= 240,
        "label": "High cholesterol",
        "detail": "Total cholesterol ≥ 240 mg/dL",
        "severity": "high",
    },
    {
        "field": "cholesterol",
        "test": lambda v: 200 <= v < 240,
        "label": "Borderline cholesterol",
        "detail": "Total cholesterol 200–239 mg/dL",
        "severity": "moderate",
    },
    {
        "field": "bmi",
        "test": lambda v: v >= 30,
        "label": "Obesity-range BMI",
        "detail": "BMI ≥ 30 kg/m²",
        "severity": "high",
    },
    {
        "field": "bmi",
        "test": lambda v: 25 <= v < 30,
        "label": "Overweight BMI",
        "detail": "BMI 25–29.9 kg/m²",
        "severity": "moderate",
    },
    {
        "field": "smoker",
        "test": lambda v: v == "Yes",
        "label": "Current smoker",
        "detail": "Active smoking exposure",
        "severity": "high",
    },
    {
        "field": "diabetes",
        "test": lambda v: v == "Yes",
        "label": "Diabetes",
        "detail": "Recorded diabetes diagnosis",
        "severity": "high",
    },
    {
        "field": "physical_activity",
        "test": lambda v: v <= 1,
        "label": "Low physical activity",
        "detail": "≤ 1 activity session per week",
        "severity": "moderate",
    },
    {
        "field": "family_history",
        "test": lambda v: v == "Yes",
        "label": "Family history",
        "detail": "First-degree relative with heart disease",
        "severity": "moderate",
    },
    {
        "field": "stress_level",
        "test": lambda v: v >= 7,
        "label": "High stress",
        "detail": "Stress score ≥ 7 out of 10",
        "severity": "moderate",
    },
]


def clinical_indicators(patient: dict[str, Any]) -> list[dict[str, str]]:
    """Return interpretable clinical flags for a validated patient record."""
    flags = []
    for flag in CLINICAL_FLAGS:
        value = patient.get(flag["field"])
        if value is None:
            continue
        try:
            if flag["test"](value):
                flags.append(
                    {
                        "label": flag["label"],
                        "detail": flag["detail"],
                        "severity": flag["severity"],
                    }
                )
        except TypeError:
            continue
    return flags


def risk_band(probability: float) -> dict[str, str]:
    """Map a class-1 probability to a presentation band."""
    if probability < 0.35:
        return {
            "key": "low",
            "label": "Lower probability",
            "description": (
                "The model estimates a lower likelihood of heart disease for "
                "this profile. This is not a diagnosis; routine screening and "
                "clinical judgement still apply."
            ),
        }
    if probability < 0.65:
        return {
            "key": "moderate",
            "label": "Intermediate probability",
            "description": (
                "The model places this patient near the decision boundary. "
                "Consider additional clinical tests and a review of modifiable "
                "risk factors."
            ),
        }
    return {
        "key": "high",
        "label": "Higher probability",
        "description": (
            "The model estimates a higher likelihood of heart disease. "
            "A qualified clinician should review this result and arrange "
            "confirmatory assessment."
        ),
    }
