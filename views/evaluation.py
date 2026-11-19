"""Model evaluation page."""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st
import matplotlib.pyplot as plt
import seaborn as sns

from heart_ml.config import METRIC_LABELS, METRIC_ORDER
from heart_ml.export import load_edge_bundle

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
    kpi_row,
    new_figure,
    pretty_dt,
    section,
    show_figure,
)


def _metric_mini_chart(meta, metric, best_key):
    fig, ax = new_figure(2.35, 2.55)
    models = sorted(meta["models"].values(), key=lambda item: item["metrics"][metric])
    values = [item["metrics"][metric] for item in models]
    labels = [item["acronym"] for item in models]
    colors = [CORAL if item["key"] == best_key else "#A9CFD3" for item in models]
    bars = ax.bar(labels, values, color=colors, width=0.62)
    for bar, value in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value + 0.035,
            f"{value:.2f}",
            ha="center",
            fontsize=7.5,
            color=MUTED,
        )
    ax.set_ylim(0, 1.12)
    ax.set_yticks([0, 0.25, 0.5, 0.75, 1.0])
    ax.tick_params(axis="x", labelsize=8)
    ax.set_title(METRIC_LABELS[metric], fontsize=9, color=MUTED, pad=8)
    ax.grid(axis="y", color="#EAF1F4")
    return fig


def render() -> None:
    meta = get_metadata()

    hero(
        "Evidence, not impressions.",
        "Accuracy, precision, recall, F1 and ROC-AUC are computed from the held-out test "
        "partition. Confusion matrices, ROC curves and classification reports come from the "
        "same saved predictions.",
        eyebrow="Model evaluation",
        badges=[
            "Independent 100-patient test set",
            "5 metrics",
            "4 classifiers",
            "Parity-verified artifacts",
        ],
    )

    if not meta:
        callout(
            "No trained models are available yet. Open <strong>Model Training</strong> and fit "
            "the pipelines first.",
            tone="warn",
        )
        footer()
        return

    criterion_labels = {METRIC_LABELS[m]: m for m in METRIC_ORDER}
    default_criterion = meta["best_model"].get("criterion", "f1")
    default_label = METRIC_LABELS[default_criterion]
    selected_label = st.selectbox(
        "Selection criterion (cross-validated on the training set)",
        list(criterion_labels.keys()),
        index=list(criterion_labels.keys()).index(default_label),
        key="evaluation_criterion",
    )
    criterion = criterion_labels[selected_label]
    best_key = max(
        meta["models"],
        key=lambda key: meta["models"][key]["cv"][criterion]["mean"],
    )
    best = meta["models"][best_key]

    kpi_row(
        [
            ("Selected model", best["name"], f"CV {selected_label} {best['cv'][criterion]['mean']:.3f}", best["color"]),
            ("Test F1", f"{best['metrics']['f1']:.3f}", "Held-out patients", CORAL),
            ("Test ROC-AUC", f"{best['metrics']['roc_auc']:.3f}", "Discrimination", PRIMARY),
            ("Test accuracy", f"{best['metrics']['accuracy']:.3f}", f"{best['test_samples']} patients", AMBER),
        ]
    )

    section("Model comparison", f"Selection uses {meta['selection_basis']}.")
    rows = []
    for key, result in meta["models"].items():
        rows.append(
            {
                "Model": result["name"],
                f"CV {selected_label}": result["cv"][criterion]["mean"],
                "Accuracy": result["metrics"]["accuracy"],
                "Precision": result["metrics"]["precision"],
                "Recall": result["metrics"]["recall"],
                "F1-Score": result["metrics"]["f1"],
                "ROC-AUC": result["metrics"]["roc_auc"],
            }
        )
    comparison = pd.DataFrame(rows).sort_values(
        f"CV {selected_label}", ascending=False
    )
    st.dataframe(
        comparison,
        hide_index=True,
        width="stretch",
        column_config={
            column: st.column_config.NumberColumn(column, format="%.3f")
            for column in comparison.columns
            if column != "Model"
        },
    )

    with st.container(border=True):
        card_title(
            "Metric-by-metric comparison",
            "Held-out test performance · best value in each panel is highlighted",
        )
        columns = st.columns(5)
        best_by_test = {
            metric: max(meta["models"], key=lambda key: meta["models"][key]["metrics"][metric])
            for metric in METRIC_ORDER
        }
        for column, metric in zip(columns, METRIC_ORDER):
            with column:
                fig = _metric_mini_chart(meta, metric, best_by_test[metric])
                st.pyplot(fig, width="stretch")
                plt.close(fig)

    # ------------------------------------------------------------- details
    tabs = st.tabs(
        [
            "Confusion matrices",
            "ROC curves",
            "Classification reports",
            "Feature importance",
            "Cross-validation",
        ]
    )

    with tabs[0]:
        card_title(
            "Confusion matrices",
            f"Decision rule: P(heart disease) ≥ {best['threshold']:.2f} · rows are actual classes",
        )
        model_list = list(meta["models"].values())
        for start in range(0, len(model_list), 2):
            columns = st.columns(2)
            for column, model in zip(columns, model_list[start : start + 2]):
                with column:
                    with st.container(border=True):
                        card_title(model["name"], f"Test n = {model['test_samples']}")
                        matrix = np.array(model["confusion_matrix"]["matrix"])
                        fig, ax = plt.subplots(figsize=(4.3, 3.3), dpi=160)
                        fig.patch.set_alpha(0)
                        sns.heatmap(
                            matrix,
                            annot=True,
                            fmt="d",
                            cmap=sns.light_palette(model["color"], as_cmap=True),
                            cbar=False,
                            linewidths=2,
                            linecolor="#FFFFFF",
                            annot_kws={"fontsize": 15, "fontweight": "700"},
                            ax=ax,
                        )
                        ax.set_xticklabels(["Predicted no", "Predicted yes"], fontsize=8.5)
                        ax.set_yticklabels(["Actual no", "Actual yes"], fontsize=8.5, rotation=0)
                        ax.set_xlabel("")
                        ax.set_ylabel("")
                        ax.tick_params(length=0)
                        st.pyplot(fig, width="stretch")
                        plt.close(fig)
                        cm = model["confusion_matrix"]
                        st.caption(
                            f"TN {cm['tn']} · FP {cm['fp']} · FN {cm['fn']} · TP {cm['tp']}"
                        )

    with tabs[1]:
        with st.container(border=True):
            card_title("Receiver operating characteristic", "Test-set ROC curves with AUC")
            fig, ax = new_figure(8.4, 4.5)
            for key, model in meta["models"].items():
                points = model["roc_curve"]
                ax.plot(
                    [point["fpr"] for point in points],
                    [point["tpr"] for point in points],
                    color=model["color"],
                    linewidth=2.1,
                    label=f"{model['name']} (AUC = {model['metrics']['roc_auc']:.3f})",
                )
            ax.plot([0, 1], [0, 1], linestyle=(0, (4, 4)), color="#A8B7BF", linewidth=1)
            ax.set_xlabel("False positive rate")
            ax.set_ylabel("True positive rate")
            ax.set_xlim(-0.01, 1.01)
            ax.set_ylim(-0.01, 1.01)
            ax.legend(loc="lower right", fontsize=8.5)
            ax.grid(color="#EAF1F4")
            show_figure(fig)
        callout(
            "A curve close to the diagonal indicates discrimination near chance. In this synthetic "
            "sample all four AUCs are close to 0.50, which is an honest property of the data.",
            tone="warn",
        )

    with tabs[2]:
        model_name = st.selectbox(
            "Classification report",
            [model["name"] for model in meta["models"].values()],
            key="report_model",
        )
        result = next(
            model for model in meta["models"].values() if model["name"] == model_name
        )
        report = pd.DataFrame(result["classification_report"]).rename(
            columns={
                "label": "Class",
                "precision": "Precision",
                "recall": "Recall",
                "f1": "F1-score",
                "support": "Support",
            }
        )
        st.dataframe(
            report,
            hide_index=True,
            width="stretch",
            column_config={
                "Precision": st.column_config.NumberColumn(format="%.3f"),
                "Recall": st.column_config.NumberColumn(format="%.3f"),
                "F1-score": st.column_config.NumberColumn(format="%.3f"),
                "Support": st.column_config.NumberColumn(format="%d"),
            },
        )
        st.caption(
            f"{result['name']} · evaluated on {result['test_samples']} patients "
            f"({result['test_positives']} positive, {result['test_negatives']} negative)."
        )

    with tabs[3]:
        importance_models = [
            model
            for model in meta["models"].values()
            if model.get("feature_importance")
        ]
        if importance_models:
            model_name = st.selectbox(
                "Feature importance / coefficients",
                [model["name"] for model in importance_models],
                key="importance_model",
            )
            result = next(
                model for model in importance_models if model["name"] == model_name
            )
            items = result["feature_importance"][:12][::-1]
            fig, ax = new_figure(8.0, 4.4)
            labels = [item["feature"] for item in items]
            magnitudes = [item["magnitude"] for item in items]
            if result["key"] == "logistic_regression":
                colors = [
                    CORAL if item["value"] > 0 else PRIMARY for item in items
                ]
            else:
                colors = [result["color"]] * len(items)
            bars = ax.barh(labels, magnitudes, color=colors, height=0.6)
            for bar, item in zip(bars, items):
                ax.text(
                    bar.get_width() + max(magnitudes) * 0.015,
                    bar.get_y() + bar.get_height() / 2,
                    f"{item['value']:+.3f}"
                    if result["key"] == "logistic_regression"
                    else f"{item['value']:.3f}",
                    va="center",
                    fontsize=8,
                    color=MUTED,
                )
            ax.set_xlabel(
                "Standardised coefficient magnitude"
                if result["key"] == "logistic_regression"
                else "Feature importance"
            )
            ax.grid(axis="x", color="#EAF1F4")
            ax.grid(axis="y", visible=False)
            show_figure(fig)
            if result["key"] == "logistic_regression":
                st.caption(
                    "Positive coefficients (coral) increase the log-odds of heart disease; "
                    "negative coefficients (teal) decrease it."
                )
        else:
            st.info(
                "The SVM uses a kernel decision function and does not expose a native "
                "linear feature-importance ranking."
            )

    with tabs[4]:
        with st.container(border=True):
            card_title(
                "Stratified cross-validation",
                f"{meta['cv']['folds']} folds on the training partition · mean ± standard deviation",
            )
            cv_rows = []
            for key, model in meta["models"].items():
                row = {"Model": model["name"]}
                for metric in METRIC_ORDER:
                    row[METRIC_LABELS[metric]] = (
                        f"{model['cv'][metric]['mean']:.3f} ± {model['cv'][metric]['std']:.3f}"
                    )
                cv_rows.append(row)
            st.dataframe(pd.DataFrame(cv_rows), hide_index=True, width="stretch")

        with st.container(border=True):
            card_title("Cross-validated ROC-AUC", "Error bars show one standard deviation across folds")
            fig, ax = new_figure(8.4, 3.4)
            names = [model["name"] for model in meta["models"].values()]
            means = [model["cv"]["roc_auc"]["mean"] for model in meta["models"].values()]
            stds = [model["cv"]["roc_auc"]["std"] for model in meta["models"].values()]
            colors = [model["color"] for model in meta["models"].values()]
            positions = np.arange(len(names))
            bars = ax.bar(positions, means, color=colors, width=0.5, yerr=stds,
                          capsize=5, error_kw={"ecolor": "#8AA0A9", "lw": 1.1})
            for bar, value in zip(bars, means):
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    value + 0.055,
                    f"{value:.3f}",
                    ha="center",
                    fontsize=8.5,
                    color=MUTED,
                )
            ax.axhline(0.5, color=CORAL, linestyle=(0, (4, 4)), linewidth=1)
            ax.text(
                len(names) - 0.45,
                0.515,
                "chance",
                fontsize=7.5,
                color=CORAL,
                ha="right",
            )
            ax.set_xticks(positions)
            ax.set_xticklabels(names, fontsize=9)
            ax.set_ylim(0, 1.0)
            ax.set_ylabel("Mean CV ROC-AUC")
            show_figure(fig)

    assessment = meta.get("signal_assessment", {})
    if assessment:
        callout(
            "<strong>Interpretation.</strong> "
            + assessment.get("interpretation", "")
            + f" The highest cross-validated ROC-AUC is <strong>{assessment.get('best_cv_roc_auc', 0):.3f}</strong>.",
            tone="warn",
        )

    with st.expander("How to read these metrics", expanded=False):
        st.markdown(
            """
**Accuracy** — share of all test patients classified correctly.

**Precision** — of the patients predicted to have heart disease, the share who actually do.

**Recall (sensitivity)** — of the patients who actually have heart disease, the share detected.

**F1-score** — harmonic mean of precision and recall; useful when both error types matter.

**ROC-AUC** — probability that a randomly chosen patient with heart disease receives a higher
risk score than a randomly chosen patient without it. 0.5 is chance, 1.0 is perfect separation.

The **confusion matrix** shows true negatives, false positives, false negatives and true positives
at the 0.50 probability threshold. Model selection uses cross-validation on the training set, never
the test set, so the test metrics remain an unbiased final check.
            """
        )

    footer()
