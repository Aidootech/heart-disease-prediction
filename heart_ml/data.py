"""Dataset loading, validation and profiling.

The project uses the real hospital_synthetic_dataset.xlsx file that ships with
the repository.  No synthetic data is generated anywhere in this module.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .config import (
    CATEGORICAL_FEATURES,
    CATEGORY_OPTIONS,
    COLUMN_LABELS,
    DATA_FILE,
    FEATURES,
    NUMERIC_FEATURES,
    TARGET,
    UNITS,
)


class DatasetError(RuntimeError):
    """Raised when the supplied dataset does not match the expected schema."""


def load_dataset(path=DATA_FILE) -> pd.DataFrame:
    """Load and normalise the hospital dataset.

    The Excel file is the single source of truth.  Column names are
    normalised (lower-case, underscores) and numeric columns are coerced so
    that both numeric cells and text-formatted numbers work.
    """
    path = str(path)
    try:
        raw = pd.read_excel(path, engine="openpyxl")
    except FileNotFoundError as exc:
        raise DatasetError(
            f"Dataset not found at {path}. Place hospital_synthetic_dataset.xlsx "
            "in the project root and retry."
        ) from exc

    raw.columns = [
        str(col).strip().lower().replace(" ", "_").replace("-", "_")
        for col in raw.columns
    ]

    missing = [col for col in FEATURES + [TARGET] if col not in raw.columns]
    if missing:
        raise DatasetError(
            "The dataset is missing required column(s): " + ", ".join(missing)
        )

    df = raw[FEATURES + [TARGET]].copy()
    df = df.dropna(how="all").reset_index(drop=True)

    for col in NUMERIC_FEATURES + [TARGET]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in CATEGORICAL_FEATURES:
        df[col] = df[col].astype("string").str.strip()

    invalid_target = df[TARGET].isna() | ~df[TARGET].isin([0, 1])
    if invalid_target.any():
        raise DatasetError(
            f"{int(invalid_target.sum())} row(s) have an invalid target value. "
            "heart_disease must be encoded as 0 or 1."
        )
    df[TARGET] = df[TARGET].astype(int)
    df = df.dropna(subset=NUMERIC_FEATURES).reset_index(drop=True)

    if df.empty:
        raise DatasetError("The dataset contains no usable rows.")

    return df


def split_features_target(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Return the independent variables and the encoded target."""
    X = df[FEATURES].copy()
    y = df[TARGET].astype(int).copy()
    return X, y


def _histogram(values: pd.Series, bins: int = 20) -> dict[str, list[float]]:
    counts, edges = np.histogram(values.dropna().to_numpy(), bins=bins)
    centres = (edges[:-1] + edges[1:]) / 2
    return {
        "edges": [round(float(v), 2) for v in edges],
        "centres": [round(float(v), 2) for v in centres],
        "counts": [int(v) for v in counts],
    }


def _histogram_by_class(
    df: pd.DataFrame, column: str, bins: int = 18
) -> dict[str, list[float]]:
    """Histogram of one feature split by target class (shared bin edges)."""
    values = df[column].dropna()
    edges = np.linspace(float(values.min()), float(values.max()), bins + 1)
    no_disease, _ = np.histogram(df.loc[df[TARGET] == 0, column], bins=edges)
    disease, _ = np.histogram(df.loc[df[TARGET] == 1, column], bins=edges)
    centres = (edges[:-1] + edges[1:]) / 2
    return {
        "edges": [round(float(v), 2) for v in edges],
        "centres": [round(float(v), 2) for v in centres],
        "no_disease": [int(v) for v in no_disease],
        "disease": [int(v) for v in disease],
    }


def dataset_profile(df: pd.DataFrame) -> dict[str, Any]:
    """Build a JSON-safe profile used by the dataset overview pages."""
    n_rows, n_cols = df.shape
    target_counts = {
        "no_disease": int((df[TARGET] == 0).sum()),
        "disease": int((df[TARGET] == 1).sum()),
    }

    columns = []
    for col in FEATURES + [TARGET]:
        series = df[col]
        columns.append(
            {
                "name": col,
                "label": COLUMN_LABELS.get(col, col),
                "dtype": "Categorical (text)"
                if col in CATEGORICAL_FEATURES
                else "Numeric (float64)",
                "role": "Target" if col == TARGET else (
                    "Categorical feature"
                    if col in CATEGORICAL_FEATURES
                    else "Numerical feature"
                ),
                "missing": int(series.isna().sum()),
                "missing_pct": round(float(series.isna().mean() * 100), 2),
                "unique": int(series.nunique(dropna=True)),
                "unit": UNITS.get(col, ""),
            }
        )

    numeric_summary = []
    describe = df[NUMERIC_FEATURES].describe().T
    for col in NUMERIC_FEATURES:
        row = describe.loc[col]
        numeric_summary.append(
            {
                "name": col,
                "label": COLUMN_LABELS[col],
                "count": int(row["count"]),
                "mean": round(float(row["mean"]), 2),
                "std": round(float(row["std"]), 2),
                "min": round(float(row["min"]), 2),
                "q1": round(float(row["25%"]), 2),
                "median": round(float(row["50%"]), 2),
                "q3": round(float(row["75%"]), 2),
                "max": round(float(row["max"]), 2),
            }
        )

    categorical_summary = []
    for col in CATEGORICAL_FEATURES:
        counts = df[col].value_counts(dropna=False)
        mode = counts.index[0]
        categorical_summary.append(
            {
                "name": col,
                "label": COLUMN_LABELS[col],
                "unique": int(df[col].nunique()),
                "top": str(mode),
                "freq": int(counts.iloc[0]),
                "distribution": {
                    str(k): int(v) for k, v in counts.items()
                },
            }
        )

    category_target: dict[str, list[dict[str, Any]]] = {}
    for col in CATEGORICAL_FEATURES:
        table = (
            df.groupby([col, TARGET])
            .size()
            .unstack(fill_value=0)
        )
        rows = []
        for category in CATEGORY_OPTIONS[col]:
            if category in table.index:
                no_value = int(table.loc[category].get(0, 0))
                yes_value = int(table.loc[category].get(1, 0))
            else:
                no_value = yes_value = 0
            total = no_value + yes_value
            rows.append(
                {
                    "category": category,
                    "no_disease": no_value,
                    "disease": yes_value,
                    "total": total,
                    "rate": round(yes_value / total * 100, 2) if total else 0.0,
                }
            )
        category_target[col] = rows

    histogram_columns = [
        "age",
        "cholesterol",
        "blood_pressure",
        "bmi",
        "physical_activity",
        "stress_level",
    ]
    histograms = {
        col: _histogram(df[col], bins=18) for col in histogram_columns
    }
    histograms_by_class = {
        col: _histogram_by_class(df, col) for col in histogram_columns
    }

    by_sex = (
        df.groupby(["sex", TARGET]).size().unstack(fill_value=0).reindex(
            ["Female", "Male"], fill_value=0
        )
    )
    sex_distribution = {
        "labels": ["Female", "Male"],
        "no_disease": [int(by_sex.loc[s, 0]) if s in by_sex.index else 0 for s in ["Female", "Male"]],
        "disease": [int(by_sex.loc[s, 1]) if s in by_sex.index else 0 for s in ["Female", "Male"]],
    }

    corr_cols = NUMERIC_FEATURES + [TARGET]
    corr = df[corr_cols].corr(numeric_only=True).round(3)
    correlation = {
        "labels": [COLUMN_LABELS[c] for c in corr_cols],
        "matrix": corr.fillna(0).to_numpy().tolist(),
    }

    preview = df.head(10).copy()
    preview_records = []
    for _, row in preview.iterrows():
        preview_records.append(
            {
                COLUMN_LABELS[c]: (
                    int(row[c])
                    if c == TARGET
                    else (round(float(row[c]), 1) if c in NUMERIC_FEATURES else str(row[c]))
                )
                for c in FEATURES + [TARGET]
            }
        )

    target_prevalence = (
        target_counts["disease"] / n_rows * 100 if n_rows else 0.0
    )

    return {
        "shape": {"rows": int(n_rows), "columns": int(n_cols)},
        "feature_count": len(FEATURES),
        "target": TARGET,
        "target_counts": target_counts,
        "target_prevalence": round(float(target_prevalence), 2),
        "columns": columns,
        "numeric_summary": numeric_summary,
        "categorical_summary": categorical_summary,
        "category_target": category_target,
        "histograms": histograms,
        "histograms_by_class": histograms_by_class,
        "sex_distribution": sex_distribution,
        "correlation": correlation,
        "preview": preview_records,
        "missing_total": int(df.isna().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "memory_kb": round(float(df.memory_usage(deep=True).sum() / 1024), 1),
    }


def reference_ranges(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Observed training ranges, used to flag extrapolation in the UI."""
    ranges: dict[str, dict[str, float]] = {}
    for col in NUMERIC_FEATURES:
        ranges[col] = {
            "min": round(float(df[col].min()), 2),
            "max": round(float(df[col].max()), 2),
            "mean": round(float(df[col].mean()), 2),
            "std": round(float(df[col].std()), 2),
        }
    return ranges
