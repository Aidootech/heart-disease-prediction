"""About the project page."""

from __future__ import annotations

import streamlit as st

from heart_ml.config import MODEL_SPECS, PROJECT

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
    hero,
    section,
)


def _info_card(title: str, body: str, accent: str = PRIMARY) -> None:
    with st.container(border=True):
        st.markdown(
            f"""
            <div style="height:4px;width:46px;border-radius:999px;background:{accent};margin:2px 0 12px 0"></div>
            <div class="cc-card-title">{title}</div>
            <div style="font-size:.82rem;line-height:1.7;color:#4E6873">{body}</div>
            """,
            unsafe_allow_html=True,
        )


def render() -> None:
    meta = get_metadata()

    hero(
        PROJECT["title"],
        "An academic machine-learning system that estimates heart-disease probability from ten "
        "clinical inputs, compares four classifiers and exposes the whole workflow through a "
        "healthcare analytics interface.",
        eyebrow="About the project",
        badges=[
            PROJECT["author"],
            f"Version {PROJECT['version']}",
            "Python · scikit-learn · Streamlit",
            "Synthetic hospital data",
        ],
    )

    section("Project objective", "What the system is designed to demonstrate")
    left, right = st.columns([1.5, 1.0])
    with left:
        with st.container(border=True):
            st.markdown(
                """
                <div style="font-size:.9rem;line-height:1.8;color:#3D5763">
                    The objective is to build a complete, reproducible classification pipeline that
                    learns from a synthetic hospital dataset and estimates whether a patient is
                    likely to have heart disease. The project covers the full applied machine-learning
                    lifecycle: data inspection, leakage-safe preprocessing, model training,
                    stratified cross-validation, independent testing, persistence and interactive
                    deployment.
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
                    <div style="background:#F4F9FA;border-radius:10px;padding:12px 14px">
                        <div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:#7A919A;font-weight:700">Learning type</div>
                        <div style="font-weight:700;margin-top:3px;color:#16313D">Supervised classification</div>
                    </div>
                    <div style="background:#F4F9FA;border-radius:10px;padding:12px 14px">
                        <div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:#7A919A;font-weight:700">Target</div>
                        <div style="font-weight:700;margin-top:3px;color:#16313D">heart_disease (0 / 1)</div>
                    </div>
                    <div style="background:#F4F9FA;border-radius:10px;padding:12px 14px">
                        <div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:#7A919A;font-weight:700">Records</div>
                        <div style="font-weight:700;margin-top:3px;color:#16313D">500 patients · 10 features</div>
                    </div>
                    <div style="background:#F4F9FA;border-radius:10px;padding:12px 14px">
                        <div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:#7A919A;font-weight:700">Evaluation</div>
                        <div style="font-weight:700;margin-top:3px;color:#16313D">Stratified 80/20 hold-out</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    with right:
        _info_card(
            "Dataset",
            "The real <strong>hospital_synthetic_dataset.xlsx</strong> supplied with the project: "
            "500 observations, 11 columns, no missing values. Ten independent variables and one "
            "binary target. No replacement or generated data is used.",
            "#2F6B8F",
        )
        _info_card(
            "Algorithms",
            "Logistic Regression, Decision Tree, Random Forest and Support Vector Machine — "
            "each wrapped in the same preprocessing pipeline and compared under identical "
            "stratified cross-validation.",
            CORAL,
        )

    section("The four classifiers", "Different inductive biases, one evaluation protocol")
    for start in range(0, len(MODEL_SPECS), 2):
        columns = st.columns(2)
        for column, spec in zip(columns, MODEL_SPECS[start : start + 2]):
            with column:
                with st.container(border=True):
                    st.markdown(
                        f"""
                        <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
                            <div style="width:36px;height:36px;border-radius:10px;background:{spec['color']};
                                color:white;display:flex;align-items:center;justify-content:center;
                                font-family:Manrope,sans-serif;font-weight:800;font-size:.75rem">
                                {spec['acronym']}
                            </div>
                            <div>
                                <div class="cc-card-title" style="margin:0">{spec['name']}</div>
                                <div style="font-size:.68rem;letter-spacing:.07em;text-transform:uppercase;color:{MUTED}">
                                    {spec['family']}
                                </div>
                            </div>
                        </div>
                        <div style="font-size:.81rem;line-height:1.65;color:#4E6873">{spec['description']}</div>
                        <div style="font-size:.72rem;color:{spec['color']};font-weight:600;margin-top:10px">
                            {spec['strengths']}
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

    section("Technology stack", "Open-source tools used end to end")
    stack = [
        ("Python", "Application and modelling language", PRIMARY),
        ("Pandas", "Tabular data loading and profiling", "#2F6B8F"),
        ("NumPy", "Numerical arrays and histogramming", "#6C8EBF"),
        ("Scikit-learn", "Pipelines, models, metrics, CV", CORAL),
        ("Streamlit", "Interactive analytics application", "#E4572E"),
        ("Matplotlib", "Publication-quality static charts", "#F2B134"),
        ("Seaborn", "Statistical visualisation layer", "#6FCF97"),
        ("Joblib", "Pipeline persistence", "#8A5CF6"),
        ("Openpyxl", "Excel dataset ingestion", "#2E8B57"),
    ]
    columns = st.columns(3)
    for index, (name, purpose, color) in enumerate(stack):
        with columns[index % 3]:
            st.markdown(
                f"""
                <div style="display:flex;gap:10px;align-items:center;background:#FFFFFF;
                    border:1px solid #E3EAEE;border-radius:12px;padding:10px 13px;margin-bottom:8px;
                    box-shadow:0 4px 14px rgba(18,48,71,.03)">
                    <span style="width:8px;height:8px;border-radius:50%;background:{color};flex:0 0 auto"></span>
                    <div>
                        <div style="font-size:.8rem;font-weight:700;color:#203A46">{name}</div>
                        <div style="font-size:.68rem;color:#7A919A">{purpose}</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    section("What is classification?", "From features to a probability")
    steps = [
        (
            "01",
            "Learn from labelled examples",
            "Each training record contains ten inputs and a known outcome (0 or 1). The algorithm "
            "learns a mapping from inputs to the probability of the positive class.",
        ),
        (
            "02",
            "Apply the same preprocessing",
            "Numerical features are standardised and categorical features are one-hot encoded. "
            "These transformations are fitted inside the pipeline on training data only, then reused "
            "for every test or prediction input.",
        ),
        (
            "03",
            "Estimate a probability",
            "Logistic Regression uses a linear log-odds model, trees partition the feature space, "
            "Random Forest averages many trees, and the SVM uses a radial-basis kernel with Platt "
            "probability calibration.",
        ),
        (
            "04",
            "Apply an explicit decision rule",
            "Heart disease is predicted when the estimated probability is at least 0.50. The same rule "
            "is applied to test-set metrics and to live predictions, so the reported numbers and the "
            "interface agree.",
        ),
    ]
    columns = st.columns(4)
    for column, (number, title, body) in zip(columns, steps):
        with column:
            st.markdown(
                f"""
                <div style="background:#FFFFFF;border:1px solid #E3EAEE;border-radius:14px;
                    padding:16px 16px 18px 16px;height:100%;box-shadow:0 6px 20px rgba(18,48,71,.04)">
                    <div style="font-family:Manrope,sans-serif;font-weight:800;color:#CFE7E9;
                        font-size:1.4rem;line-height:1">{number}</div>
                    <div style="font-weight:700;font-size:.87rem;color:#17323E;margin:8px 0 6px 0">{title}</div>
                    <div style="font-size:.75rem;line-height:1.6;color:#5B737E">{body}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    section("Methodology and integrity", "Choices that keep the evaluation trustworthy")
    left, right = st.columns(2)
    with left:
        _info_card(
            "Leakage-safe preprocessing",
            "StandardScaler and OneHotEncoder live inside a scikit-learn Pipeline. During "
            "cross-validation they are fitted separately on each training fold; for the final "
            "evaluation they are fitted only on the training split. The test partition never "
            "influences scaling or encoding.",
            PRIMARY,
        )
        _info_card(
            "Model selection",
            "Algorithms are compared with stratified 5-fold cross-validation on the training data. "
            "The default ranking criterion is F1-score; the interface allows switching between "
            "accuracy, precision, recall, F1 and ROC-AUC. Test metrics are never used to choose the "
            "model.",
            "#2F6B8F",
        )
        _info_card(
            "Persistence and parity",
            "Fitted pipelines are stored with Joblib and loaded by the Streamlit app. For the "
            "serverless Vercel edition, the same pipelines are exported to a compact arithmetic "
            "representation and verified against scikit-learn predictions on all 500 records.",
            "#8A5CF6",
        )
    with right:
        _info_card(
            "Reproducibility",
            "The split, cross-validation folds and every estimator use random_state=42. "
            "Dependencies and the training timestamp are recorded in the artifact metadata, and "
            "training can be repeated from the UI or with <code>python train_models.py</code>.",
            AMBER,
        )
        _info_card(
            "Honest reporting",
            "All metrics shown in this application come from actual model evaluation on the provided "
            "file. The synthetic sample has very weak feature–target association, so discrimination "
            "is close to chance. Those values are displayed unchanged.",
            CORAL,
        )
        if meta:
            _info_card(
                "Current artifacts",
                f"Trained {meta['trained_at']} · {len(meta['models'])} pipelines · "
                f"selected model: <strong>{meta['best_model']['name']}</strong> · "
                f"training time {meta['duration_seconds']:.1f}s.",
                MINT,
            )

    callout(
        "<strong>Limitations and responsible use.</strong> This is an academic prototype trained on a "
        "synthetic 500-record dataset. It has not been externally validated, calibrated on real "
        "patients, or reviewed as a medical device. Predictions must not be used for diagnosis, "
        "triage or treatment. A real deployment would require a representative clinical cohort, "
        "prospective validation, fairness auditing, calibration analysis, privacy safeguards and "
        "regulatory review.",
        tone="coral",
    )

    section("Project structure", "How the repository is organised")
    st.code(
        """Heart-disease-prediction/
├── app.py                     # Streamlit entry point
├── train_models.py            # Reproducible training CLI
├── heart_ml/                  # Data, preprocessing, modelling, export, validation
├── views/                     # Six Streamlit pages + shared design system
├── artifacts/                 # Joblib pipelines, metrics, inference bundle
├── public/                    # Static Vercel frontend and published data
├── api/                       # Dependency-free serverless prediction endpoint
├── hospital_synthetic_dataset.xlsx
└── requirements.txt""",
        language="text",
    )
    st.caption(
        f"{PROJECT['title']} · {PROJECT['author']} · {PROJECT['institution']} · v{PROJECT['version']}"
    )
    footer()
