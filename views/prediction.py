"""Heart disease prediction page."""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from heart_ml.config import (
    CATEGORICAL_FEATURES,
    FEATURE_HELP,
    FEATURES,
    MODEL_BY_KEY,
    NUMERIC_FEATURES,
)
from heart_ml.modeling import expand_feature_label
from heart_ml.validation import clinical_indicators, risk_band, validate_patient

from .common import (
    AMBER,
    CORAL,
    MINT,
    MUTED,
    PRIMARY,
    callout,
    card_title,
    footer,
    get_metadata,
    get_models,
    hero,
    metric_card,
    pretty_dt,
    section,
)


def _load_drivers(pipe, model_key: str, payload: dict, metadata: dict) -> tuple[list[dict], str]:
    """Patient-specific contributions for LR, model-level ranks otherwise."""
    classifier = pipe.named_steps["classifier"]
    preprocessor = pipe.named_steps["preprocessor"]
    if hasattr(classifier, "coef_"):
        frame = pd.DataFrame([payload])[FEATURES]
        transformed = preprocessor.transform(frame)[0]
        names = preprocessor.get_feature_names_out()
        coefficients = np.ravel(classifier.coef_)
        contributions = coefficients * transformed
        order = np.argsort(-np.abs(contributions))[:6]
        drivers = [
            {
                "feature": expand_feature_label(str(names[index])),
                "value": float(contributions[index]),
                "direction": "increases" if contributions[index] > 0 else "decreases",
                "basis": "patient",
            }
            for index in order
        ]
        return drivers, "patient"

    importance = metadata["models"][model_key].get("feature_importance", [])[:6]
    drivers = [
        {
            "feature": item["feature"],
            "value": float(item["value"]),
            "direction": "associated",
            "basis": "global",
        }
        for item in importance
    ]
    return drivers, "global"


def _driver_rows(drivers: list[dict]) -> str:
    if not drivers:
        return ""
    maximum = max(abs(item["value"]) for item in drivers) or 1.0
    rows = []
    for item in drivers:
        width = min(abs(item["value"]) / maximum * 100, 100)
        positive = item["value"] >= 0
        color = CORAL if positive else PRIMARY
        if item["direction"] == "associated":
            color = "#2F6B8F"
        sign = "+" if positive else "−"
        rows.append(
            f"""
            <div style="margin:9px 0">
                <div style="display:flex;justify-content:space-between;font-size:.78rem;
                    color:#3F5863;margin-bottom:4px">
                    <span>{item['feature']}</span>
                    <span style="font-weight:700;color:{color}">{sign}{abs(item['value']):.3f}</span>
                </div>
                <div style="height:6px;border-radius:999px;background:#EEF4F6;overflow:hidden">
                    <div style="height:100%;width:{width:.1f}%;border-radius:999px;background:{color}"></div>
                </div>
            </div>
            """
        )
    return "".join(rows)


def render() -> None:
    meta = get_metadata()

    hero(
        "Estimate risk for a single patient.",
        "Enter the ten clinical inputs used during training. The saved pipeline applies the exact "
        "same scaling and encoding before the selected classifier returns a probability.",
        eyebrow="Heart disease prediction",
        badges=[
            "Saved joblib pipelines",
            "No manual preprocessing",
            "Probability + explanation",
            "Academic prototype",
        ],
    )

    if not meta:
        callout(
            "No trained models are available. Open <strong>Model Training</strong> and fit the "
            "four pipelines before requesting a prediction.",
            tone="warn",
        )
        footer()
        return

    models = get_models()
    schema = meta["feature_schema"]
    numeric_schema = {item["name"]: item for item in schema["numeric"]}
    categorical_schema = {item["name"]: item for item in schema["categorical"]}
    reference_ranges = meta.get("reference_ranges", {})

    model_order = meta["model_order"] if "model_order" in meta else list(meta["models"])
    default_key = meta["best_model"]["key"]
    options = [key for key in model_order if key in models]
    labels = {
        key: (
            f"{meta['models'][key]['name']}  ·  test F1 "
            f"{meta['models'][key]['metrics']['f1']:.3f}  ·  AUC "
            f"{meta['models'][key]['metrics']['roc_auc']:.3f}"
        )
        for key in options
    }
    selected_key = st.selectbox(
        "Classification algorithm",
        options,
        index=options.index(default_key) if default_key in options else 0,
        format_func=lambda key: labels[key],
        key="prediction_model",
    )
    selected_model = meta["models"][selected_key]
    spec = MODEL_BY_KEY[selected_key]

    section("Patient information", "All ten fields are required · values outside the training range produce a warning")
    with st.container(border=True):
        with st.form("heart_disease_prediction_form", clear_on_submit=False):
            st.markdown("##### Patient profile")
            col1, col2, col3 = st.columns(3)
            with col1:
                age = st.number_input(
                    "Age (years)",
                    min_value=int(numeric_schema["age"]["min"]),
                    max_value=int(numeric_schema["age"]["max"]),
                    value=55,
                    step=1,
                    help=FEATURE_HELP["age"],
                )
            with col2:
                sex = st.radio(
                    "Sex",
                    categorical_schema["sex"]["options"],
                    horizontal=True,
                    help=FEATURE_HELP["sex"],
                )
            with col3:
                st.caption(
                    "The form mirrors the training schema exactly. Numerical inputs are scaled by "
                    "the saved StandardScaler; categorical inputs are one-hot encoded by the saved encoder."
                )

            st.markdown("##### Clinical measurements")
            col4, col5, col6 = st.columns(3)
            with col4:
                blood_pressure = st.number_input(
                    "Blood pressure (mmHg)",
                    min_value=int(numeric_schema["blood_pressure"]["min"]),
                    max_value=int(numeric_schema["blood_pressure"]["max"]),
                    value=132,
                    step=1,
                    help=FEATURE_HELP["blood_pressure"],
                )
            with col5:
                cholesterol = st.number_input(
                    "Cholesterol (mg/dL)",
                    min_value=int(numeric_schema["cholesterol"]["min"]),
                    max_value=int(numeric_schema["cholesterol"]["max"]),
                    value=222,
                    step=1,
                    help=FEATURE_HELP["cholesterol"],
                )
            with col6:
                bmi = st.number_input(
                    "BMI (kg/m²)",
                    min_value=float(numeric_schema["bmi"]["min"]),
                    max_value=float(numeric_schema["bmi"]["max"]),
                    value=28.0,
                    step=0.1,
                    format="%.1f",
                    help=FEATURE_HELP["bmi"],
                )

            st.markdown("##### Lifestyle and history")
            col7, col8, col9 = st.columns(3)
            with col7:
                physical_activity = st.slider(
                    "Physical activity (sessions/week)",
                    min_value=0,
                    max_value=4,
                    value=2,
                    help=FEATURE_HELP["physical_activity"],
                )
            with col8:
                smoker = st.radio(
                    "Smoking status",
                    categorical_schema["smoker"]["options"],
                    horizontal=True,
                    help=FEATURE_HELP["smoker"],
                )
            with col9:
                diabetes = st.radio(
                    "Diabetes",
                    categorical_schema["diabetes"]["options"],
                    horizontal=True,
                    help=FEATURE_HELP["diabetes"],
                )

            col10, col11, col12 = st.columns(3)
            with col10:
                family_history = st.radio(
                    "Family history",
                    categorical_schema["family_history"]["options"],
                    horizontal=True,
                    help=FEATURE_HELP["family_history"],
                )
            with col11:
                stress_level = st.slider(
                    "Stress level (1–10)",
                    min_value=1,
                    max_value=10,
                    value=5,
                    help=FEATURE_HELP["stress_level"],
                )
            with col12:
                st.markdown(
                    f"""
                    <div style="background:#F6FAFB;border:1px solid #E3EEF1;border-radius:10px;
                        padding:10px 12px;font-size:.74rem;color:#4F6A75;line-height:1.55;margin-top:6px">
                        <strong>Selected model</strong><br>
                        {selected_model['name']}<br>
                        Threshold: {selected_model['threshold']:.2f} · test ROC-AUC {selected_model['metrics']['roc_auc']:.3f}
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

            submitted = st.form_submit_button(
                "Predict heart disease risk",
                type="primary",
                width="stretch",
            )

        if submitted:
            payload = {
                "age": float(age),
                "sex": sex,
                "blood_pressure": float(blood_pressure),
                "cholesterol": float(cholesterol),
                "bmi": float(bmi),
                "physical_activity": float(physical_activity),
                "smoker": smoker,
                "diabetes": diabetes,
                "family_history": family_history,
                "stress_level": float(stress_level),
            }
            validation = validate_patient(payload, reference_ranges)
            if not validation["valid"]:
                st.error("Please correct the following:\n\n- " + "\n- ".join(validation["errors"]))
            else:
                try:
                    pipe = models[selected_key]
                    frame = pd.DataFrame([validation["values"]])[FEATURES]
                    probabilities = pipe.predict_proba(frame)[0]
                    probability = float(probabilities[1])
                    prediction = int(probability >= selected_model["threshold"])
                    drivers, basis = _load_drivers(
                        pipe, selected_key, validation["values"], meta
                    )
                    st.session_state["prediction_result"] = {
                        "model_key": selected_key,
                        "model_name": selected_model["name"],
                        "model_color": selected_model["color"],
                        "prediction": prediction,
                        "probability": probability,
                        "probability_no_disease": float(probabilities[0]),
                        "threshold": selected_model["threshold"],
                        "risk_band": risk_band(probability),
                        "indicators": clinical_indicators(validation["values"]),
                        "drivers": drivers,
                        "driver_basis": basis,
                        "warnings": validation["warnings"],
                        "inputs": validation["values"],
                        "metrics": selected_model["metrics"],
                    }
                except Exception as exc:  # pragma: no cover - UI surface
                    st.error(f"The prediction could not be generated: {exc}")

    # ------------------------------------------------------------- result
    result = st.session_state.get("prediction_result")
    if not result:
        with st.container(border=True):
            card_title("Prediction result", "Complete the form and select Predict")
            st.markdown(
                f"""
                <div style="display:flex;gap:14px;align-items:flex-start;padding:8px 2px 14px 2px">
                    <div style="width:42px;height:42px;border-radius:12px;background:#E8F4F5;
                        display:flex;align-items:center;justify-content:center;font-size:1.2rem">🫀</div>
                    <div style="font-size:.83rem;color:#4F6A75;line-height:1.65;max-width:760px">
                        The result will show the predicted class, the probability of each class,
                        the decision threshold, rule-based clinical indicators and the factors that
                        most influenced the selected model.
                        <br><strong style="color:#35505C">Academic prototype — not a diagnosis.</strong>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        footer()
        return

    if result["model_key"] != selected_key:
        st.info(
            "You changed the algorithm. Submit the form again to generate a prediction "
            f"with {selected_model['name']}."
        )

    for warning in result["warnings"]:
        st.warning(warning)

    probability = result["probability"]
    prediction = result["prediction"]
    band = result["risk_band"]
    tone = "bad" if prediction == 1 else "ok"
    label = "Heart Disease Detected" if prediction == 1 else "No Heart Disease Detected"
    headline_color = "#FFD9CC" if prediction == 1 else "#C9F1EA"

    section("Prediction result", f"{result['model_name']} · threshold {result['threshold']:.2f}")
    st.markdown(
        f"""
        <div class="cc-result {tone}">
            <div class="label">Prediction · {result['model_name']}</div>
            <div class="headline" style="color:{headline_color}">{label}</div>
            <div class="prob">{probability * 100:.1f}<small>%</small>
                <small style="display:block;font-size:.72rem;font-weight:600;opacity:.8;margin-top:4px">
                    estimated probability of heart disease
                </small>
            </div>
            <div class="cc-meter"><span style="width:{probability * 100:.1f}%"></span></div>
            <div class="cc-result-legend">
                <span>0%</span><span>decision threshold 50%</span><span>100%</span>
            </div>
            <div class="caption">{band['label']} · {band['description']}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    col_a, col_b, col_c = st.columns(3)
    with col_a:
        metric_card(
            "P(heart disease)",
            f"{probability * 100:.1f}%",
            "Class 1 probability",
            CORAL,
        )
    with col_b:
        metric_card(
            "P(no heart disease)",
            f"{result['probability_no_disease'] * 100:.1f}%",
            "Class 0 probability",
            PRIMARY,
        )
    with col_c:
        metric_card(
            "Decision",
            "Class 1" if prediction == 1 else "Class 0",
            f"threshold {result['threshold']:.2f}",
            result["model_color"],
        )

    left, right = st.columns([1.05, 1.0])
    with left:
        with st.container(border=True):
            card_title(
                "Model drivers",
                "Patient-specific log-odds contributions"
                if result["driver_basis"] == "patient"
                else "Model-level feature importance",
            )
            if result["drivers"]:
                st.markdown(_driver_rows(result["drivers"]), unsafe_allow_html=True)
                if result["driver_basis"] == "patient":
                    st.caption(
                        "Contribution = standardised feature value × logistic-regression coefficient. "
                        "Positive values push the estimate toward heart disease."
                    )
                else:
                    st.caption(
                        "This kernel/tree model does not provide additive per-patient contributions; "
                        "the bars show the features it relies on most overall."
                    )
            else:
                st.info(
                    "No native feature-importance ranking is available for this kernel model. "
                    "Use the clinical indicators for interpretation."
                )

            with st.expander("Model and preprocessing details", expanded=False):
                st.markdown(
                    f"""
                    - **Algorithm:** {result['model_name']} ({spec['family']})
                    - **Pipeline:** saved with Joblib and loaded from `artifacts/models/{selected_key}.joblib`
                    - **Preprocessing:** StandardScaler → OneHotEncoder, fitted on training data only
                    - **Decision rule:** P(heart disease) ≥ {result['threshold']:.2f}
                    - **Test metrics:** accuracy {result['metrics']['accuracy']:.3f}, precision {result['metrics']['precision']:.3f}, recall {result['metrics']['recall']:.3f}, F1 {result['metrics']['f1']:.3f}, ROC-AUC {result['metrics']['roc_auc']:.3f}
                    """
                )
    with right:
        with st.container(border=True):
            card_title("Clinical indicators", "Rule-based flags · not model attribution")
            indicators = result["indicators"]
            if indicators:
                chips = "".join(
                    f'<span class="cc-chip"><span class="dot" style="--dot:'
                    f'{"#E4572E" if item["severity"] == "high" else "#F2B134"}"></span>'
                    f'<strong>{item["label"]}</strong>&nbsp;·&nbsp;{item["detail"]}</span>'
                    for item in indicators
                )
                st.markdown(chips, unsafe_allow_html=True)
            else:
                st.markdown(
                    '<div class="cc-chip"><span class="dot" style="--dot:#6FCF97"></span>'
                    "No rule-based risk flags triggered</div>",
                    unsafe_allow_html=True,
                )
            st.markdown(
                f"""
                <div style="margin-top:10px;font-size:.76rem;color:{MUTED};line-height:1.6">
                    These indicators use common clinical thresholds (for example systolic BP ≥ 140 mmHg,
                    cholesterol ≥ 240 mg/dL, BMI ≥ 30 kg/m²). They explain the input profile and are
                    independent of the classifier's probability.
                </div>
                """,
                unsafe_allow_html=True,
            )

    with st.expander("What does this result mean?", expanded=False):
        st.markdown(
            f"""
The model estimates a **{probability * 100:.1f}%** probability that this patient belongs to the
heart-disease class. Using the project-wide 0.50 decision threshold, the predicted class is
**{label.lower()}**.

A probability is not a diagnosis. The estimate reflects patterns in a 500-record synthetic dataset,
and this sample shows little discriminative signal (test ROC-AUC values are close to 0.50). The
result should be treated as an academic demonstration of a machine-learning workflow.

**Next steps in a real clinical setting:** review modifiable risk factors, repeat measurements,
order confirmatory tests and involve a qualified clinician. Do not use this prototype for triage
or treatment decisions.
            """
        )

    st.caption(
        f"Prediction generated from {result['model_name']} · preprocessing loaded from the saved "
        "pipeline · no values were scaled or encoded manually."
    )
    footer()
