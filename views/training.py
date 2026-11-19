"""Model training page."""

from __future__ import annotations

import json
import time
import warnings

import pandas as pd
import streamlit as st

from heart_ml.config import (
    CV_FOLDS,
    METRIC_LABELS,
    METRIC_ORDER,
    MODEL_SPECS,
    RANDOM_STATE,
    TEST_SIZE,
)
from heart_ml.training_service import run_training

from .common import (
    AMBER,
    CORAL,
    MINT,
    MUTED,
    PRIMARY,
    callout,
    card_title,
    clear_app_caches,
    footer,
    get_data,
    get_metadata,
    get_profile,
    hero,
    kpi_row,
    new_figure,
    pretty_dt,
    section,
    show_figure,
    pill,
)


def _format_params(params: dict) -> str:
    labels = {
        "C": "C",
        "max_depth": "max depth",
        "min_samples_leaf": "min leaf",
        "n_estimators": "trees",
        "max_features": "max features",
        "kernel": "kernel",
        "gamma": "gamma",
        "probability": "probability",
        "solver": "solver",
        "max_iter": "max iter",
    }
    parts = []
    for key, value in params.items():
        if key in {"probability"}:
            continue
        if isinstance(value, float):
            value = f"{value:g}"
        parts.append(f"{labels.get(key, key)} = {value}")
    return "  ·  ".join(parts)


def render() -> None:
    df = get_data()
    profile = get_profile(df)
    meta = get_metadata()

    hero(
        "Train, compare, and persist the classifiers.",
        "Four pipelines share one leakage-safe preprocessing design. Stratified cross-validation "
        "compares them on the training partition, then each final pipeline is scored once on the "
        "untouched 20% test set.",
        eyebrow="Model training",
        badges=[
            "80 / 20 stratified split",
            f"{CV_FOLDS}-fold StratifiedKFold",
            "random_state = 42",
            "Joblib persistence",
        ],
    )

    if meta:
        kpi_row(
            [
                ("Algorithms trained", str(len(meta["models"])), "All pipelines persisted", PRIMARY),
                ("Training time", f"{meta['duration_seconds']:.1f}s", "Latest run", AMBER),
                ("Training rows", f"{meta['dataset']['train_rows']}", "Used for fitting + CV", PRIMARY),
                ("Test rows", f"{meta['dataset']['test_rows']}", "Held out until evaluation", CORAL),
            ]
        )
    else:
        kpi_row(
            [
                ("Algorithms available", "4", "LR · DT · RF · SVM", PRIMARY),
                ("Training rows", f"{int(profile['shape']['rows'] * (1 - TEST_SIZE))}", "80% stratified", PRIMARY),
                ("Test rows", f"{int(profile['shape']['rows'] * TEST_SIZE)}", "20% held out", CORAL),
                ("Status", "Not trained", "Start a run below", CORAL),
            ]
        )

    section("Available algorithms", "Current configuration and recorded cross-validated performance")
    specs = MODEL_SPECS
    for row_start in range(0, len(specs), 2):
        columns = st.columns(2)
        for column, spec in zip(columns, specs[row_start : row_start + 2]):
            key = spec["key"]
            with column:
                with st.container(border=True):
                    result = meta["models"][key] if meta else None
                    params = result["hyperparameters"] if result else {}
                    st.markdown(
                        f"""
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                            <div style="width:38px;height:38px;border-radius:11px;display:flex;
                                align-items:center;justify-content:center;font-family:Manrope,sans-serif;
                                font-weight:800;font-size:.78rem;color:white;background:{spec['color']}">
                                {spec['acronym']}
                            </div>
                            <div>
                                <div class="cc-card-title" style="margin:0">{spec['name']}</div>
                                <div style="font-size:.7rem;color:{MUTED};letter-spacing:.06em;text-transform:uppercase">
                                    {spec['family']}
                                </div>
                            </div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                    st.markdown(
                        f'<div style="font-size:.8rem;line-height:1.6;color:#4E6873;min-height:76px">{spec["description"]}</div>',
                        unsafe_allow_html=True,
                    )
                    if params:
                        st.markdown(
                            f'<div style="font-size:.71rem;color:{MUTED};background:#F6F9FA;border:1px solid #E7EFF2;'
                            f'border-radius:8px;padding:7px 9px;margin:4px 0 8px 0">'
                            f"{_format_params(params)}</div>",
                            unsafe_allow_html=True,
                        )
                    if result:
                        c1, c2, c3 = st.columns(3)
                        c1.metric("CV F1", f"{result['cv']['f1']['mean']:.3f}", f"±{result['cv']['f1']['std']:.3f}", delta_color="off")
                        c2.metric("CV ROC-AUC", f"{result['cv']['roc_auc']['mean']:.3f}", f"±{result['cv']['roc_auc']['std']:.3f}", delta_color="off")
                        c3.metric("Test F1", f"{result['metrics']['f1']:.3f}", "held-out", delta_color="off")
                    else:
                        st.caption("Scores appear after the first training run.")

    section("Training control", "One click fits all four pipelines and refreshes the artifacts")
    with st.container(border=True):
        left, right = st.columns([1.55, 1.0])
        with left:
            card_title("Fit all models", "Preprocessing is re-fitted inside every fold and every final pipeline.")
            st.markdown(
                f"""
                <div style="font-size:.8rem;color:#4E6873;line-height:1.65;margin-bottom:10px">
                    The run will load <strong>hospital_synthetic_dataset.xlsx</strong>,
                    build the stratified split, cross-validate each algorithm, fit the final
                    pipelines, evaluate the {int(TEST_SIZE * 100)} held-out patients, save
                    Joblib artifacts and verify the exported inference layer.
                </div>
                """,
                unsafe_allow_html=True,
            )
            run = st.button(
                "Train all four models" if not meta else "Retrain all four models",
                type="primary",
                width="stretch",
            )
            if run:
                warnings.filterwarnings("ignore", category=FutureWarning, message=".*deprecated.*")
                progress_bar = st.progress(0.0, text="Loading dataset…")
                status_line = st.empty()
                started = time.perf_counter()

                def progress(done: int, total: int, message: str) -> None:
                    progress_bar.progress(min(done / total, 1.0), text=message)
                    if done < total:
                        status_line.caption(
                            f"Step {done + 1} of {total} · {message}"
                        )

                try:
                    with st.spinner("Training and verifying pipelines…"):
                        new_meta, verification = run_training(progress=progress)
                    progress_bar.progress(1.0, text="Training and parity verification complete")
                    status_line.caption(
                        f"Finished in {time.perf_counter() - started:.1f}s · "
                        f"parity {'passed' if verification['passed'] else 'failed'}"
                    )
                    clear_app_caches()
                    st.success(
                        f"All four pipelines trained. Selected model: "
                        f"{new_meta['best_model']['name']}."
                    )
                    time.sleep(0.7)
                    st.rerun()
                except Exception as exc:  # pragma: no cover - UI surface
                    st.error(f"Training failed: {exc}")
        with right:
            card_title("Reproducibility", "Fixed seeds and explicit split")
            st.markdown(
                f"""
                <div style="font-size:.8rem;line-height:1.9;color:#4E6873">
                    <div style="display:flex;justify-content:space-between"><span>Test size</span><strong>{TEST_SIZE:.0%}</strong></div>
                    <div style="display:flex;justify-content:space-between"><span>Stratified</span><strong>Yes</strong></div>
                    <div style="display:flex;justify-content:space-between"><span>CV folds</span><strong>{CV_FOLDS}</strong></div>
                    <div style="display:flex;justify-content:space-between"><span>Random state</span><strong>{RANDOM_STATE}</strong></div>
                    <div style="display:flex;justify-content:space-between"><span>Leakage control</span><strong>Pipeline</strong></div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.caption(
                "Retraining also refreshes the static JSON used by the Vercel edition."
            )

    if meta:
        section("Latest training results", f"Completed {pretty_dt(meta['trained_at'])}")
        rows = []
        for key, result in meta["models"].items():
            rows.append(
                {
                    "Model": result["name"],
                    "CV ROC-AUC": result["cv"]["roc_auc"]["mean"],
                    "CV F1": result["cv"]["f1"]["mean"],
                    "Test Accuracy": result["metrics"]["accuracy"],
                    "Test Precision": result["metrics"]["precision"],
                    "Test Recall": result["metrics"]["recall"],
                    "Test F1": result["metrics"]["f1"],
                    "Test ROC-AUC": result["metrics"]["roc_auc"],
                }
            )
        results = pd.DataFrame(rows).sort_values("Test F1", ascending=False)
        st.dataframe(
            results,
            hide_index=True,
            width="stretch",
            column_config={
                column: st.column_config.NumberColumn(column, format="%.3f")
                for column in results.columns
                if column != "Model"
            },
        )

        col_a, col_b = st.columns([1.25, 1.0])
        with col_a:
            with st.container(border=True):
                card_title("Cross-validation vs. test", "F1-score by model")
                fig, ax = new_figure(6.2, 3.2)
                import numpy as np

                names = [item["name"] for item in meta["models"].values()]
                cv = [item["cv"]["f1"]["mean"] for item in meta["models"].values()]
                test = [item["metrics"]["f1"] for item in meta["models"].values()]
                positions = np.arange(len(names))
                width = 0.36
                ax.bar(positions - width / 2, cv, width, color="#B9DDE0", label="CV F1")
                ax.bar(positions + width / 2, test, width, color=PRIMARY, label="Test F1")
                ax.set_xticks(positions)
                ax.set_xticklabels(
                    [item["acronym"] for item in meta["models"].values()],
                    fontsize=9,
                )
                ax.set_ylim(0, 1.0)
                ax.set_ylabel("F1-score")
                ax.legend(fontsize=8)
                show_figure(fig)
        with col_b:
            with st.container(border=True):
                card_title("Selected model", meta["selection_basis"])
                best = meta["best_model"]
                result = meta["models"][best["key"]]
                st.markdown(
                    f"""
                    <div style="font-family:Manrope,sans-serif;font-size:1.2rem;font-weight:800;
                        color:{result['color']};margin:6px 0 2px 0">{best['name']}</div>
                    <div style="font-size:.76rem;color:{MUTED};margin-bottom:8px">
                        {METRIC_LABELS[best['criterion']]} (CV) = <strong>{best['score']:.3f}</strong>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                for metric in ["accuracy", "precision", "recall", "f1", "roc_auc"]:
                    st.markdown(
                        f'<div style="display:flex;justify-content:space-between;font-size:.78rem;'
                        f'padding:5px 0;border-bottom:1px solid #EFF4F6">'
                        f'<span style="color:#5D7580">{METRIC_LABELS[metric]}</span>'
                        f'<strong>{result["metrics"][metric]:.3f}</strong></div>',
                        unsafe_allow_html=True,
                    )
                st.download_button(
                    "Download training metadata",
                    data=json.dumps(meta, indent=2),
                    file_name="heart_disease_training_metadata.json",
                    mime="application/json",
                    width="stretch",
                )

        with st.expander("Training pipeline and environment", expanded=False):
            steps = [
                (
                    "Dataset ingestion",
                    f"{meta['dataset']['rows']} records · {meta['dataset']['features']} features · "
                    f"{meta['dataset']['positive']} positive / {meta['dataset']['negative']} negative",
                ),
                (
                    "Stratified hold-out",
                    f"{meta['dataset']['train_rows']} train · {meta['dataset']['test_rows']} test · "
                    f"random_state={meta['split']['random_state']}",
                ),
                (
                    "Preprocessing (in-pipeline)",
                    "StandardScaler for numerical features · OneHotEncoder for categorical features · "
                    "fitted on training folds only",
                ),
                (
                    "Cross-validation",
                    f"{meta['cv']['folds']}-fold {meta['cv']['strategy']} · accuracy, precision, recall, "
                    "F1 and ROC-AUC recorded for every fold",
                ),
                (
                    "Final fit and test evaluation",
                    "One fit on the full training partition · one evaluation on the held-out test set",
                ),
                (
                    "Persistence and verification",
                    "Joblib pipelines · JSON metrics · exported arithmetic replay verified to < 1e-8",
                ),
            ]
            for index, (title, detail) in enumerate(steps, start=1):
                st.markdown(
                    f"""
                    <div style="display:flex;gap:12px;padding:9px 2px">
                        <div style="width:24px;height:24px;border-radius:50%;background:#E8F4F5;
                            color:{PRIMARY};font-weight:800;font-size:.72rem;display:flex;
                            align-items:center;justify-content:center;flex:0 0 auto">{index}</div>
                        <div>
                            <div style="font-size:.82rem;font-weight:700;color:#203A46">{title}</div>
                            <div style="font-size:.75rem;color:{MUTED};line-height:1.5">{detail}</div>
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
            environment = meta["environment"]
            st.caption(
                "Environment · "
                + " · ".join(f"{key}: {value}" for key, value in environment.items())
            )

        if meta.get("signal_assessment"):
            callout(
                "<strong>Signal check.</strong> "
                + meta["signal_assessment"]["interpretation"],
                tone="warn",
            )
    else:
        callout(
            "No saved models were found. Run the training job above, or execute "
            "<code>python train_models.py</code> in the project environment.",
            tone="warn",
        )

    footer()
