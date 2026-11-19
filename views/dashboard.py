"""Dashboard page."""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from heart_ml.config import METRIC_LABELS, METRIC_ORDER

from .common import (
    AMBER,
    CORAL,
    MINT,
    MUTED,
    PRIMARY,
    TARGET_COLORS,
    callout,
    card_title,
    donut_chart,
    footer,
    get_data,
    get_metadata,
    get_profile,
    hero,
    kpi_row,
    metric_card,
    new_figure,
    section,
    show_figure,
)


def _histogram_by_class(ax, df: pd.DataFrame, column: str, bins: int = 18, reference: float | None = None):
    values = df[column].dropna()
    edges = np.linspace(values.min(), values.max(), bins + 1)
    no = df.loc[df["heart_disease"] == 0, column]
    yes = df.loc[df["heart_disease"] == 1, column]
    h0, _ = np.histogram(no, bins=edges)
    h1, _ = np.histogram(yes, bins=edges)
    centres = (edges[:-1] + edges[1:]) / 2
    width = (edges[1] - edges[0]) * 0.88
    ax.bar(centres, h0, width=width, color=PRIMARY, label="No disease", edgecolor="none")
    ax.bar(centres, h1, width=width, bottom=h0, color=CORAL, label="Heart disease", edgecolor="none")
    if reference is not None and values.min() <= reference <= values.max():
        ax.axvline(reference, color=AMBER, linestyle=(0, (4, 3)), linewidth=1.0)
        ax.annotate(
            f"{reference:g}",
            xy=(reference, ax.get_ylim()[1] * 0.94),
            xytext=(3, 0),
            textcoords="offset points",
            fontsize=7.5,
            color=AMBER,
        )
    ax.set_xlabel(column.replace("_", " ").title())
    ax.set_ylabel("Patients")
    ax.legend(loc="upper right", fontsize=8)
    return ax


def render() -> None:
    df = get_data()
    profile = get_profile(df)
    meta = get_metadata()

    hero(
        "Cardiovascular risk, made measurable.",
        "A machine-learning workspace for exploring a synthetic hospital cohort, comparing four "
        "classification algorithms and estimating an individual patient's probability of heart disease.",
        eyebrow="Clinical intelligence dashboard",
        badges=[
            f"{profile['shape']['rows']} patient records",
            f"{profile['feature_count']} clinical features",
            "4 classification algorithms",
            "Reproducible · seed 42",
        ],
    )

    target = profile["target_counts"]
    prevalence = profile["target_prevalence"]

    if meta:
        best = meta["best_model"]
        best_model = meta["models"][best["key"]]
        best_value = best["name"]
        best_sub = (
            f"<strong>CV {METRIC_LABELS[best['criterion']]} {best['score']:.3f}</strong> · "
            f"test F1 {best_model['metrics']['f1']:.3f}"
        )
    else:
        best_value = "Not trained"
        best_sub = "Open Model Training to fit the pipelines"

    kpi_row(
        [
            ("Total patients", f"{profile['shape']['rows']}", "Clean records · no missing values", PRIMARY),
            ("Heart disease", f"{target['disease']}", f"<strong>{prevalence:.1f}%</strong> of the cohort", CORAL),
            ("No heart disease", f"{target['no_disease']}", f"{100 - prevalence:.1f}% of the cohort", PRIMARY),
            ("Algorithms", "4", "LR · DT · RF · SVM", AMBER),
            ("Best model", best_value, best_sub, MINT),
        ]
    )

    section("Cohort at a glance", "Distributions from the actual hospital_synthetic_dataset.xlsx file.")

    col_a, col_b = st.columns([1.0, 1.55])
    with col_a:
        with st.container(border=True):
            card_title("Heart disease distribution", "Target class balance across 500 patients")
            donut_chart(
                [target["no_disease"], target["disease"]],
                ["No disease", "Heart disease"],
                [PRIMARY, CORAL],
                f"{prevalence:.0f}%",
                "heart disease",
            )
    with col_b:
        with st.container(border=True):
            card_title("Age distribution", "Patients by age and target class")
            fig, ax = new_figure(6.6, 3.45)
            _histogram_by_class(ax, df, "age", bins=16)
            show_figure(fig)

    col_c, col_d, col_e = st.columns([1.0, 1.0, 1.0])
    with col_c:
        with st.container(border=True):
            card_title("Cholesterol", "Total cholesterol, mg/dL")
            fig, ax = new_figure(4.2, 3.1)
            _histogram_by_class(ax, df, "cholesterol", bins=16, reference=240)
            show_figure(fig)
    with col_d:
        with st.container(border=True):
            card_title("Blood pressure", "Systolic pressure, mmHg")
            fig, ax = new_figure(4.2, 3.1)
            _histogram_by_class(ax, df, "blood_pressure", bins=16, reference=140)
            show_figure(fig)
    with col_e:
        with st.container(border=True):
            card_title("Heart disease by sex", "Counts per class")
            fig, ax = new_figure(4.2, 3.1)
            sex = profile["sex_distribution"]
            positions = np.arange(len(sex["labels"]))
            width = 0.36
            ax.bar(
                positions - width / 2,
                sex["no_disease"],
                width,
                color=PRIMARY,
                label="No disease",
            )
            ax.bar(
                positions + width / 2,
                sex["disease"],
                width,
                color=CORAL,
                label="Heart disease",
            )
            for index, (no_value, yes_value) in enumerate(
                zip(sex["no_disease"], sex["disease"])
            ):
                ax.text(index - width / 2, no_value + 4, str(no_value), ha="center", fontsize=8, color=MUTED)
                ax.text(index + width / 2, yes_value + 4, str(yes_value), ha="center", fontsize=8, color=MUTED)
            ax.set_xticks(positions)
            ax.set_xticklabels(sex["labels"])
            ax.set_ylabel("Patients")
            ax.legend(loc="upper right", fontsize=8)
            show_figure(fig)

    section("Model performance", "Selection uses stratified cross-validation on the training set only.")

    col_f, col_g = st.columns([1.55, 1.0])
    with col_f:
        with st.container(border=True):
            card_title("Test-set F1 by algorithm", "Higher is better · evaluated on the 100 held-out patients")
            if meta:
                fig, ax = new_figure(6.6, 3.0)
                models = sorted(
                    meta["models"].values(), key=lambda item: item["metrics"]["f1"]
                )
                names = [item["name"] for item in models]
                values = [item["metrics"]["f1"] for item in models]
                colors = [
                    CORAL if item["key"] == meta["best_model"]["key"] else PRIMARY
                    for item in models
                ]
                bars = ax.barh(names, values, color=colors, height=0.55)
                for bar, value in zip(bars, values):
                    ax.text(
                        value + 0.012,
                        bar.get_y() + bar.get_height() / 2,
                        f"{value:.3f}",
                        va="center",
                        fontsize=8.5,
                        color=MUTED,
                    )
                ax.set_xlim(0, 1.0)
                ax.set_xlabel("F1-score")
                ax.grid(axis="x", color="#EAF1F4", linewidth=0.8)
                ax.grid(axis="y", visible=False)
                show_figure(fig)
            else:
                callout("No trained models found. Use the <strong>Model Training</strong> page to fit the four pipelines.")
    with col_g:
        with st.container(border=True):
            card_title("Model snapshot", "Best model under the selected criterion")
            if meta:
                criteria = {METRIC_LABELS[m]: m for m in METRIC_ORDER}
                default_index = list(criteria.values()).index(
                    meta["best_model"].get("criterion", "f1")
                )
                chosen_label = st.selectbox(
                    "Evaluation criterion",
                    list(criteria.keys()),
                    index=default_index,
                    key="dashboard_criterion",
                    label_visibility="collapsed",
                )
                criterion = criteria[chosen_label]
                best_key = max(
                    meta["models"],
                    key=lambda key: meta["models"][key]["cv"][criterion]["mean"],
                )
                best = meta["models"][best_key]
                cv_value = best["cv"][criterion]["mean"]
                st.markdown(
                    f"""
                    <div style="padding:6px 2px 2px 2px">
                        <div class="cc-pill" style="--bg:{best['color']}18;--fg:{best['color']};--bd:{best['color']}33">
                            Selected model
                        </div>
                        <div style="font-family:Manrope,sans-serif;font-size:1.2rem;font-weight:800;margin-top:10px;color:#152B36">
                            {best['name']}
                        </div>
                        <div style="font-size:.76rem;color:#667C87;margin-top:2px">
                            Cross-validated {chosen_label.lower()} = <strong>{cv_value:.3f}</strong>
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                mini1, mini2, mini3 = st.columns(3)
                with mini1:
                    metric_card("Accuracy", f"{best['metrics']['accuracy']:.3f}", "test set", best["color"])
                with mini2:
                    metric_card("F1-score", f"{best['metrics']['f1']:.3f}", "test set", best["color"])
                with mini3:
                    metric_card("ROC-AUC", f"{best['metrics']['roc_auc']:.3f}", "test set", best["color"])
            else:
                st.info("Train the models to see a performance snapshot.")

    assessment = (meta or {}).get("signal_assessment", {})
    if assessment:
        callout(
            "<strong>Signal check.</strong> "
            + assessment.get("interpretation", "")
            + f" Best cross-validated ROC-AUC: <strong>{assessment.get('best_cv_roc_auc', 0):.3f}</strong>.",
            tone="warn",
        )

    footer()
