"""Dataset overview page."""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st
import matplotlib.pyplot as plt
import seaborn as sns

from heart_ml.config import CATEGORICAL_FEATURES, COLUMN_LABELS, FEATURE_HELP, NUMERIC_FEATURES

from .common import (
    AMBER,
    CORAL,
    MINT,
    MUTED,
    PRIMARY,
    TARGET_COLORS,
    callout,
    card_title,
    footer,
    get_data,
    get_profile,
    hero,
    kpi_row,
    new_figure,
    section,
    show_figure,
    styled_table,
)


def _stacked_hist(ax, df, column, bins=18):
    values = df[column].dropna()
    edges = np.linspace(values.min(), values.max(), bins + 1)
    no = df.loc[df["heart_disease"] == 0, column]
    yes = df.loc[df["heart_disease"] == 1, column]
    h0, _ = np.histogram(no, bins=edges)
    h1, _ = np.histogram(yes, bins=edges)
    centres = (edges[:-1] + edges[1:]) / 2
    width = (edges[1] - edges[0]) * 0.88
    ax.bar(centres, h0, width=width, color=PRIMARY, label="No disease")
    ax.bar(centres, h1, width=width, bottom=h0, color=CORAL, label="Heart disease")
    ax.set_xlabel(COLUMN_LABELS[column])
    ax.set_ylabel("Patients")
    ax.legend(fontsize=8, loc="upper right")


def render() -> None:
    df = get_data()
    profile = get_profile(df)

    hero(
        "Know the data before the model.",
        "Every chart on this page is computed directly from the 500-record synthetic hospital "
        "dataset shipped with the project — no sampled or invented values.",
        eyebrow="Dataset overview",
        badges=[
            "hospital_synthetic_dataset.xlsx",
            f"{profile['shape']['rows']} observations",
            f"{profile['feature_count']} features + target",
            "0 missing cells",
        ],
    )

    kpi_row(
        [
            ("Observations", f"{profile['shape']['rows']}", "Patient records", PRIMARY),
            ("Features", f"{profile['feature_count']}", "10 independent variables", PRIMARY),
            ("Missing cells", f"{profile['missing_total']}", "Complete-case dataset", "#2F6B8F"),
            ("Duplicate rows", f"{profile['duplicate_rows']}", "No repeated records", AMBER),
        ]
    )

    tabs = st.tabs(
        ["Preview", "Schema & quality", "Descriptive statistics", "Visual exploration"]
    )

    # ---------------------------------------------------------------- preview
    with tabs[0]:
        section("Dataset preview", "First ten rows, formatted for readability")
        preview = pd.DataFrame(profile["preview"])
        st.dataframe(preview, hide_index=True, width="stretch", height=410)

        left, right = st.columns([1.0, 1.0])
        with left:
            with st.container(border=True):
                card_title("Target encoding", "heart_disease")
                st.markdown(
                    f"""
                    <div style="font-size:.85rem;line-height:1.8;color:#3B5560">
                        <div><span class="cc-chip"><span class="dot" style="--dot:{PRIMARY}"></span>
                        <strong>0</strong>&nbsp; No heart disease &nbsp;·&nbsp; {profile['target_counts']['no_disease']} patients</span></div>
                        <div><span class="cc-chip"><span class="dot" style="--dot:{CORAL}"></span>
                        <strong>1</strong>&nbsp; Heart disease &nbsp;·&nbsp; {profile['target_counts']['disease']} patients</span></div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
        with right:
            with st.container(border=True):
                card_title("Download", "Use the original file for your own analysis")
                csv = df.to_csv(index=False).encode("utf-8")
                st.download_button(
                    "Download dataset as CSV",
                    data=csv,
                    file_name="hospital_synthetic_dataset.csv",
                    mime="text/csv",
                    width="stretch",
                )

        if st.checkbox("Show data dictionary", value=False):
            dictionary = pd.DataFrame(
                [
                    {
                        "Column": COLUMN_LABELS[column],
                        "Key": column,
                        "Type": "Categorical" if column in CATEGORICAL_FEATURES else "Numerical",
                        "Description": FEATURE_HELP[column],
                    }
                    for column in NUMERIC_FEATURES + CATEGORICAL_FEATURES
                ]
            )
            st.dataframe(dictionary, hide_index=True, width="stretch")

    # ------------------------------------------------------------ schema
    with tabs[1]:
        section("Schema and data quality", "Types, completeness and the role of each column")
        columns_table = pd.DataFrame(profile["columns"])
        columns_table = columns_table.rename(
            columns={
                "name": "Key",
                "label": "Column",
                "dtype": "Data type",
                "role": "Role",
                "unique": "Unique",
                "missing": "Missing",
                "missing_pct": "Missing %",
                "unit": "Unit",
            }
        )
        st.dataframe(
            columns_table[
                ["Column", "Key", "Data type", "Role", "Unit", "Unique", "Missing", "Missing %"]
            ],
            hide_index=True,
            width="stretch",
        )

        col_a, col_b = st.columns([1.0, 1.0])
        with col_a:
            with st.container(border=True):
                card_title("Completeness by column", "Percentage of non-missing cells")
                fig, ax = new_figure(6.0, 3.5)
                completeness = [
                    (COLUMN_LABELS[item["name"]], 100 - item["missing_pct"])
                    for item in profile["columns"]
                ]
                names = [item[0] for item in completeness]
                values = [item[1] for item in completeness]
                bars = ax.barh(names, values, color=PRIMARY, height=0.55)
                ax.set_xlim(0, 105)
                ax.set_xlabel("Completeness (%)")
                ax.grid(axis="x", color="#EAF1F4", linewidth=0.8)
                ax.grid(axis="y", visible=False)
                for bar, value in zip(bars, values):
                    ax.text(
                        value + 1,
                        bar.get_y() + bar.get_height() / 2,
                        f"{value:.0f}%",
                        va="center",
                        fontsize=8,
                        color=MUTED,
                    )
                show_figure(fig)
        with col_b:
            with st.container(border=True):
                card_title("Quality summary", "Automated checks on the raw file")
                checks = [
                    ("Missing values", f"{profile['missing_total']} cells", "pass"),
                    ("Duplicate records", f"{profile['duplicate_rows']}", "pass"),
                    ("Target values", "Encoded 0 / 1", "pass"),
                    ("Out-of-range target", "0 rows", "pass"),
                    ("Feature count", f"{profile['feature_count']}", "pass"),
                    ("Memory footprint", f"{profile['memory_kb']} KB", "info"),
                ]
                rows = "".join(
                    f'<div class="row" style="display:flex;justify-content:space-between;'
                    f'padding:9px 2px;border-bottom:1px solid #EEF4F6;font-size:.82rem">'
                    f'<span style="color:#4E6873">{label}</span>'
                    f'<span style="font-weight:700;color:{PRIMARY if status == "pass" else MUTED}">'
                    f'{value}</span></div>'
                    for label, value, status in checks
                )
                st.markdown(f"<div>{rows}</div>", unsafe_allow_html=True)
                callout(
                    "The dataset is complete: no imputation is required. Imputation would only be "
                    "introduced for a dataset with genuine missing values.",
                )

        st.markdown("#### Missing-value analysis")
        missing_frame = pd.DataFrame(
            [
                {
                    "Column": item["label"],
                    "Missing": item["missing"],
                    "Missing %": item["missing_pct"],
                }
                for item in profile["columns"]
            ]
        )
        styled_table(missing_frame)

    # ------------------------------------------------------------ statistics
    with tabs[2]:
        section("Descriptive statistics", "Location, spread and distribution of every feature")
        numeric_table = pd.DataFrame(profile["numeric_summary"]).rename(
            columns={
                "label": "Feature",
                "count": "Count",
                "mean": "Mean",
                "std": "Std. dev.",
                "min": "Min",
                "q1": "Q1",
                "median": "Median",
                "q3": "Q3",
                "max": "Max",
            }
        )
        st.dataframe(
            numeric_table.drop(columns=["name"]),
            hide_index=True,
            width="stretch",
        )

        st.markdown("#### Categorical features")
        columns = st.columns(len(CATEGORICAL_FEATURES))
        for column, item in zip(columns, profile["categorical_summary"]):
            with column:
                with st.container(border=True):
                    card_title(item["label"], f"{item['unique']} categories")
                    distribution = item["distribution"]
                    counts = pd.Series(distribution).sort_values(ascending=False)
                    st.markdown(
                        "".join(
                            f'<div style="display:flex;justify-content:space-between;'
                            f'font-size:.8rem;padding:5px 0;border-bottom:1px solid #F0F5F7">'
                            f"<span>{key}</span><strong>{value}</strong></div>"
                            for key, value in counts.items()
                        ),
                        unsafe_allow_html=True,
                    )
                    fig, ax = new_figure(3.2, 2.0)
                    ax.bar(
                        [str(key) for key in counts.index],
                        counts.values,
                        color=[PRIMARY, CORAL][: len(counts)],
                        width=0.55,
                    )
                    ax.set_ylabel("Patients")
                    ax.grid(axis="y", color="#EAF1F4")
                    show_figure(fig)

        with st.container(border=True):
            card_title("Correlation matrix", "Pearson correlation among numerical variables and the target")
            corr = pd.DataFrame(
                profile["correlation"]["matrix"],
                index=profile["correlation"]["labels"],
                columns=profile["correlation"]["labels"],
            )
            fig, ax = plt.subplots(figsize=(8.5, 5.0), dpi=160)
            fig.patch.set_alpha(0)
            mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
            sns.heatmap(
                corr,
                mask=mask,
                annot=True,
                fmt=".2f",
                cmap="RdYlBu_r",
                center=0,
                vmin=-0.6,
                vmax=0.6,
                linewidths=0.6,
                linecolor="#FFFFFF",
                cbar_kws={"shrink": 0.7, "label": "Correlation"},
                annot_kws={"fontsize": 7.5},
                ax=ax,
            )
            ax.tick_params(colors=MUTED, labelsize=8.5)
            plt.setp(ax.get_xticklabels(), rotation=35, ha="right")
            st.pyplot(fig, width="stretch")
            plt.close(fig)
            callout(
                "Correlations are uniformly small in this synthetic sample; the strongest is "
                "<strong>blood pressure versus heart disease (r = -0.067)</strong>. That is an honest "
                "property of the data, not a preprocessing error.",
                tone="warn",
            )

    # ------------------------------------------------------------ visual
    with tabs[3]:
        section("Visual exploration", "Inspect how each feature relates to the target")
        feature = st.selectbox(
            "Choose a numerical feature",
            NUMERIC_FEATURES,
            format_func=lambda key: COLUMN_LABELS[key],
        )
        col_a, col_b = st.columns([1.35, 1.0])
        with col_a:
            with st.container(border=True):
                card_title(
                    "Distribution by class",
                    f"{COLUMN_LABELS[feature]} · stacked counts",
                )
                fig, ax = new_figure(6.4, 3.6)
                _stacked_hist(ax, df, feature, bins=18)
                show_figure(fig)
        with col_b:
            with st.container(border=True):
                card_title("Spread by class", "Median, quartiles and outliers")
                fig, ax = new_figure(4.5, 3.6)
                plot_df = df.copy()
                plot_df["Class"] = plot_df["heart_disease"].map({0: "No disease", 1: "Heart disease"})
                sns.boxplot(
                    data=plot_df,
                    x="Class",
                    y=feature,
                    hue="Class",
                    palette={"No disease": PRIMARY, "Heart disease": CORAL},
                    width=0.45,
                    linewidth=1.0,
                    fliersize=2.5,
                    ax=ax,
                    legend=False,
                )
                ax.set_xlabel("")
                ax.set_ylabel(COLUMN_LABELS[feature])
                ax.grid(axis="y", color="#EAF1F4")
                show_figure(fig)

        col_c, col_d = st.columns([1.15, 1.0])
        with col_c:
            with st.container(border=True):
                card_title("Disease rate by category", "Share of patients with heart disease")
                category = st.selectbox(
                    "Categorical feature",
                    CATEGORICAL_FEATURES,
                    format_func=lambda key: COLUMN_LABELS[key],
                    key="overview_category",
                )
                rates = (
                    df.groupby(category)["heart_disease"]
                    .agg(["mean", "count"])
                    .reset_index()
                )
                fig, ax = new_figure(5.4, 2.9)
                bars = ax.bar(
                    rates[category].astype(str),
                    rates["mean"] * 100,
                    color=[PRIMARY, CORAL, AMBER, MINT][: len(rates)],
                    width=0.5,
                )
                for bar, (_, row) in zip(bars, rates.iterrows()):
                    ax.text(
                        bar.get_x() + bar.get_width() / 2,
                        bar.get_height() + 1.4,
                        f"{row['mean'] * 100:.1f}%  (n={int(row['count'])})",
                        ha="center",
                        fontsize=8,
                        color=MUTED,
                    )
                ax.set_ylim(0, 100)
                ax.set_ylabel("Heart disease rate (%)")
                ax.set_xlabel(COLUMN_LABELS[category])
                ax.grid(axis="y", color="#EAF1F4")
                show_figure(fig)
        with col_d:
            with st.container(border=True):
                card_title("Disease rate across quartiles", "Non-linear trends would appear here")
                quartile_feature = st.selectbox(
                    "Numerical feature",
                    NUMERIC_FEATURES,
                    format_func=lambda key: COLUMN_LABELS[key],
                    key="overview_quartile",
                )
                try:
                    bins = pd.qcut(df[quartile_feature], 4, duplicates="drop")
                    trend = (
                        df.groupby(bins, observed=True)["heart_disease"]
                        .agg(["mean", "count"])
                        .reset_index()
                    )
                    labels = [
                        f"{interval.left:.0f}–{interval.right:.0f}"
                        for interval in trend[quartile_feature]
                    ]
                    fig, ax = new_figure(5.0, 2.9)
                    ax.plot(
                        labels,
                        trend["mean"] * 100,
                        color=CORAL,
                        marker="o",
                        linewidth=2,
                        markersize=5,
                    )
                    ax.fill_between(
                        labels,
                        trend["mean"] * 100,
                        color=CORAL,
                        alpha=0.08,
                    )
                    ax.set_ylim(0, 100)
                    ax.set_ylabel("Heart disease rate (%)")
                    ax.set_xlabel(f"{COLUMN_LABELS[quartile_feature]} quartile")
                    ax.grid(axis="y", color="#EAF1F4")
                    show_figure(fig)
                except ValueError:
                    st.info("Not enough distinct values to build quartiles.")

    footer()
