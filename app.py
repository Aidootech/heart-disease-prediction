"""CardioCare — Heart Disease Prediction System (Streamlit entry point)."""

from __future__ import annotations

import warnings

import streamlit as st

warnings.filterwarnings("ignore", category=FutureWarning, message=".*deprecated.*")

st.set_page_config(
    page_title="CardioCare · Heart Disease Prediction",
    page_icon="🫀",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={
        "About": (
            "CardioCare is an academic machine-learning prototype trained on a "
            "synthetic hospital dataset. It is not a medical device."
        )
    },
)

from views import about, dashboard, data_overview, evaluation, prediction, training  # noqa: E402
from views.common import inject_css, sidebar_brand  # noqa: E402

pages = [
    st.Page(
        dashboard.render,
        title="Dashboard",
        icon=":material/space_dashboard:",
        url_path="dashboard",
        default=True,
    ),
    st.Page(
        data_overview.render,
        title="Dataset Overview",
        icon=":material/table_view:",
        url_path="dataset",
    ),
    st.Page(
        training.render,
        title="Model Training",
        icon=":material/model_training:",
        url_path="training",
    ),
    st.Page(
        evaluation.render,
        title="Model Evaluation",
        icon=":material/analytics:",
        url_path="evaluation",
    ),
    st.Page(
        prediction.render,
        title="Heart Disease Prediction",
        icon=":material/monitor_heart:",
        url_path="prediction",
    ),
    st.Page(
        about.render,
        title="About the Project",
        icon=":material/info:",
        url_path="about",
    ),
]

pg = st.navigation(pages, position="hidden")
inject_css()
sidebar_brand(pages)
pg.run()
