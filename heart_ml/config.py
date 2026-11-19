"""Central configuration for the Heart Disease Prediction System.

Everything that describes the dataset schema, the modelling contract and
where artifacts live is defined here so that the training script, the
Streamlit application and the export layer stay in sync.
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "hospital_synthetic_dataset.xlsx"

ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
METADATA_PATH = ARTIFACTS_DIR / "metadata.json"
EDGE_MODELS_PATH = ARTIFACTS_DIR / "edge_models.json"
PARITY_PATH = ARTIFACTS_DIR / "parity_reference.json"

PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"
API_MODEL_PATH = BASE_DIR / "api" / "model_data.json"

# ---------------------------------------------------------------------------
# Dataset contract
# ---------------------------------------------------------------------------
TARGET = "heart_disease"

NUMERIC_FEATURES = [
    "age",
    "blood_pressure",
    "cholesterol",
    "bmi",
    "physical_activity",
    "stress_level",
]

CATEGORICAL_FEATURES = ["sex", "smoker", "diabetes", "family_history"]

FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

COLUMN_LABELS = {
    "age": "Age",
    "sex": "Sex",
    "blood_pressure": "Blood Pressure",
    "cholesterol": "Cholesterol",
    "bmi": "BMI",
    "smoker": "Smoking Status",
    "diabetes": "Diabetes",
    "physical_activity": "Physical Activity",
    "family_history": "Family History",
    "stress_level": "Stress Level",
    "heart_disease": "Heart Disease",
}

UNITS = {
    "age": "years",
    "blood_pressure": "mmHg",
    "cholesterol": "mg/dL",
    "bmi": "kg/m²",
    "physical_activity": "sessions / week",
    "stress_level": "score (1–10)",
}

CATEGORY_OPTIONS = {
    "sex": ["Female", "Male"],
    "smoker": ["No", "Yes"],
    "diabetes": ["No", "Yes"],
    "family_history": ["No", "Yes"],
}

FEATURE_HELP = {
    "age": "Patient age in completed years.",
    "sex": "Biological sex recorded in the hospital dataset.",
    "blood_pressure": "Systolic blood pressure in millimetres of mercury (mmHg).",
    "cholesterol": "Total serum cholesterol in milligrams per decilitre (mg/dL).",
    "bmi": "Body mass index in kg/m².",
    "smoker": "Whether the patient currently smokes.",
    "diabetes": "Whether the patient has a recorded diabetes diagnosis.",
    "physical_activity": "Number of moderate-to-vigorous activity sessions per week (0–4 in the dataset).",
    "family_history": "Whether a first-degree relative has a history of heart disease.",
    "stress_level": "Self-reported stress score from 1 (low) to 10 (high).",
}

# Allowed range used by the input validation layer.  The reference range is
# the observed range in the training data; the wider accepted range keeps the
# form usable for values that fall just outside the synthetic sample while
# still rejecting impossible measurements.
INPUT_BOUNDS = {
    "age": (18, 100),
    "blood_pressure": (70, 250),
    "cholesterol": (100, 600),
    "bmi": (10.0, 60.0),
    "physical_activity": (0, 7),
    "stress_level": (1, 10),
}

# ---------------------------------------------------------------------------
# Training configuration
# ---------------------------------------------------------------------------
RANDOM_STATE = 42
TEST_SIZE = 0.20
CV_FOLDS = 5
DECISION_THRESHOLD = 0.5

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
MODEL_SPECS = [
    {
        "key": "logistic_regression",
        "name": "Logistic Regression",
        "acronym": "LR",
        "family": "Linear model",
        "color": "#0E7C86",
        "description": (
            "A linear classifier that estimates the log-odds of heart disease "
            "and converts them into calibrated probabilities. It is highly "
            "interpretable and provides a strong baseline for clinical risk "
            "screening."
        ),
        "strengths": "Interpretable coefficients · fast · well-calibrated probabilities",
    },
    {
        "key": "decision_tree",
        "name": "Decision Tree",
        "acronym": "DT",
        "family": "Tree-based model",
        "color": "#E4572E",
        "description": (
            "Recursively partitions patients into risk groups using feature "
            "thresholds. The resulting rules are easy to read and explain to "
            "non-technical audiences, although a single tree can overfit."
        ),
        "strengths": "Transparent decision rules · no scaling required",
    },
    {
        "key": "random_forest",
        "name": "Random Forest",
        "acronym": "RF",
        "family": "Ensemble model",
        "color": "#2F6B8F",
        "description": (
            "An ensemble of decorrelated decision trees whose votes are "
            "averaged. It captures non-linear interactions, is robust to "
            "outliers and usually delivers the strongest tabular performance."
        ),
        "strengths": "High accuracy · robust · feature importance ranking",
    },
    {
        "key": "svm",
        "name": "Support Vector Machine",
        "acronym": "SVM",
        "family": "Kernel model",
        "color": "#8A5CF6",
        "description": (
            "Finds a maximum-margin boundary in a radial-basis-function "
            "feature space. It performs well on compact, scaled clinical "
            "datasets and produces probability estimates via Platt scaling."
        ),
        "strengths": "Effective in high dimensions · strong margin separation",
    },
]

MODEL_KEYS = [spec["key"] for spec in MODEL_SPECS]
MODEL_NAMES = {spec["key"]: spec["name"] for spec in MODEL_SPECS}
MODEL_BY_KEY = {spec["key"]: spec for spec in MODEL_SPECS}

METRIC_LABELS = {
    "accuracy": "Accuracy",
    "precision": "Precision",
    "recall": "Recall",
    "f1": "F1-Score",
    "roc_auc": "ROC-AUC",
}

METRIC_ORDER = ["accuracy", "precision", "recall", "f1", "roc_auc"]

DEFAULT_CRITERION = "f1"

PALETTE = {
    "primary": "#0E7C86",
    "primary_dark": "#0A5C63",
    "navy": "#123047",
    "coral": "#E4572E",
    "mint": "#6FCF97",
    "amber": "#F2B134",
    "slate": "#64748B",
    "surface": "#FFFFFF",
    "background": "#F4F7F9",
    "border": "#E3EAEE",
    "text": "#152B36",
    "muted": "#667C87",
}

PROJECT = {
    "title": "Heart Disease Prediction System",
    "short_title": "CardioCare Analytics",
    "tagline": "Machine-learning decision support for cardiovascular risk screening",
    "version": "1.0.0",
    "author": "Academic Machine Learning Project",
    "institution": "Department of Computer Science",
}
