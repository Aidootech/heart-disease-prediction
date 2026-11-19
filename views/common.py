"""Shared UI primitives for the CardioCare Streamlit application."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import streamlit as st

from heart_ml.config import (
    METRIC_LABELS,
    MODELS_DIR,
    MODEL_KEYS,
    PALETTE,
    PROJECT,
)
from heart_ml.data import dataset_profile, load_dataset
from heart_ml.modeling import artifacts_available, load_metadata, load_models

# ---------------------------------------------------------------------------
# Palette
# ---------------------------------------------------------------------------
PRIMARY = PALETTE["primary"]
PRIMARY_DARK = PALETTE["primary_dark"]
NAVY = PALETTE["navy"]
CORAL = PALETTE["coral"]
MINT = PALETTE["mint"]
AMBER = PALETTE["amber"]
SLATE = PALETTE["slate"]
BORDER = PALETTE["border"]
TEXT = PALETTE["text"]
MUTED = PALETTE["muted"]

TARGET_COLORS = {0: PRIMARY, 1: CORAL}
TARGET_LABELS = {0: "No heart disease", 1: "Heart disease"}

sns.set_theme(style="whitegrid")
plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 10,
        "axes.titlesize": 11,
        "axes.titleweight": "600",
        "axes.titlecolor": TEXT,
        "axes.labelsize": 9.5,
        "axes.labelcolor": MUTED,
        "axes.edgecolor": "#DCE6EA",
        "axes.linewidth": 0.9,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "grid.color": "#EAF1F4",
        "grid.linewidth": 0.8,
        "legend.frameon": False,
        "legend.fontsize": 9,
        "figure.facecolor": "none",
        "axes.facecolor": "none",
    }
)


# ---------------------------------------------------------------------------
# Data access
# ---------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def get_data() -> pd.DataFrame:
    return load_dataset()


@st.cache_data(show_spinner=False)
def get_profile(df: pd.DataFrame) -> dict[str, Any]:
    return dataset_profile(df)


@st.cache_data(show_spinner=False)
def get_metadata() -> dict[str, Any] | None:
    if not artifacts_available():
        return None
    try:
        return load_metadata()
    except Exception:
        return None


@st.cache_resource(show_spinner=False)
def get_models() -> dict[str, Any]:
    return load_models()


@st.cache_data(show_spinner=False)
def get_edge_bundle() -> dict[str, Any] | None:
    path = MODELS_DIR.parent / "edge_models.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def models_ready() -> bool:
    return artifacts_available()


def clear_app_caches() -> None:
    st.cache_data.clear()
    st.cache_resource.clear()


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------
def pct(value: float, digits: int = 1) -> str:
    return f"{value * 100:.{digits}f}%"


def pretty_dt(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso).strftime("%d %b %Y · %H:%M UTC")
    except ValueError:
        return iso


def metric_value(meta: dict[str, Any] | None, key: str, metric: str) -> float | None:
    if not meta or key not in meta.get("models", {}):
        return None
    return meta["models"][key]["metrics"].get(metric)


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------
_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

:root {
    --cc-primary: #0E7C86;
    --cc-primary-dark: #0A5C63;
    --cc-navy: #123047;
    --cc-coral: #E4572E;
    --cc-mint: #6FCF97;
    --cc-amber: #F2B134;
    --cc-slate: #64748B;
    --cc-border: #E3EAEE;
    --cc-text: #152B36;
    --cc-muted: #667C87;
    --cc-surface: #FFFFFF;
    --cc-bg: #F4F7F9;
}

html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--cc-text);
}

h1, h2, h3, h4, h5, .cc-title, .metric-value {
    font-family: 'Manrope', 'Inter', sans-serif;
    letter-spacing: -0.02em;
}

.stApp {
    background:
        radial-gradient(1100px 520px at 85% -10%, rgba(14,124,134,0.10), transparent 60%),
        radial-gradient(800px 400px at 0% 0%, rgba(228,87,46,0.05), transparent 55%),
        var(--cc-bg);
}

[data-testid="stHeader"] {
    background: transparent;
}

footer { visibility: hidden; }

.block-container {
    padding-top: 1.7rem;
    padding-bottom: 3rem;
    max-width: 1280px;
}

/* Sidebar ---------------------------------------------------------------- */
[data-testid="stSidebar"] {
    background: linear-gradient(178deg, #0A1F2A 0%, #0C2C39 48%, #081A23 100%);
    border-right: 1px solid rgba(255,255,255,0.04);
}
[data-testid="stSidebar"] > div:first-child {
    padding-top: 1.1rem;
}
[data-testid="stSidebar"] * {
    color: #DCE9EC;
}
[data-testid="stSidebar"] .cc-brand-sub,
[data-testid="stSidebar"] .cc-side-label {
    color: #7FA2AC !important;
}
[data-testid="stSidebar"] hr {
    border-color: rgba(255,255,255,0.08);
}

.cc-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 2px 18px 2px;
}
.cc-brand-mark {
    width: 42px; height: 42px;
    border-radius: 13px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(145deg, #1499A5, #0A5C63);
    box-shadow: 0 8px 18px rgba(0,0,0,0.28);
    flex: 0 0 auto;
}
.cc-brand-name {
    font-family: 'Manrope', sans-serif;
    font-size: 1.02rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: #FFFFFF !important;
}
.cc-brand-sub {
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-top: 3px;
}

.cc-side-label {
    font-size: 0.63rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 700;
    margin: 10px 0 4px 8px;
}

[data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] {
    border-radius: 10px;
    padding: 0.52rem 0.7rem;
    margin: 1px 0;
    transition: background 120ms ease;
}
[data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"]:hover {
    background: rgba(255,255,255,0.08);
    text-decoration: none;
}
[data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] p {
    font-size: 0.88rem;
    font-weight: 500;
}

.cc-side-status {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 12px 13px;
    margin: 14px 2px 0 2px;
}
.cc-side-status .row {
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 0.72rem; padding: 2px 0;
}
.cc-side-status .k { color: #7FA2AC; }
.cc-side-status .v { color: #EAF4F6; font-weight: 600; text-align: right; }
.cc-side-note {
    font-size: 0.68rem;
    line-height: 1.5;
    color: #6F929C !important;
    margin: 14px 8px 0 8px;
}

/* Hero ------------------------------------------------------------------- */
.cc-hero {
    position: relative;
    overflow: hidden;
    border-radius: 22px;
    padding: 32px 36px;
    margin-bottom: 1.4rem;
    color: #FFFFFF;
    background:
        linear-gradient(115deg, #0A2230 0%, #0C3A47 52%, #0E7C86 120%);
    box-shadow: 0 18px 44px rgba(10, 34, 48, 0.18);
}
.cc-hero::after {
    content: "";
    position: absolute;
    right: -90px; top: -120px;
    width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(255,255,255,0.16), transparent 64%);
    pointer-events: none;
}
.cc-hero::before {
    content: "";
    position: absolute;
    right: 30px; bottom: -10px;
    width: 360px; height: 130px;
    opacity: 0.16;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120'><path d='M0 70 H90 L108 70 L122 34 L142 96 L160 58 L174 70 H230 L246 70 L260 46 L278 88 L294 64 L306 70 H400' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-size: contain;
}
.cc-eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8FD3D9;
    margin-bottom: 10px;
}
.cc-hero h1 {
    font-size: clamp(1.55rem, 2.6vw, 2.25rem);
    font-weight: 800;
    margin: 0 0 8px 0;
    color: #FFFFFF;
    line-height: 1.14;
}
.cc-hero p {
    color: #BFD9DE;
    font-size: 0.94rem;
    max-width: 780px;
    margin: 0;
    line-height: 1.6;
}
.cc-hero .cc-badges {
    display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px;
}
.cc-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 0.7rem; font-weight: 600;
    padding: 5px 11px; border-radius: 999px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.14);
    color: #DDF1F3;
}

/* Metric cards ----------------------------------------------------------- */
.metric-card {
    position: relative;
    background: var(--cc-surface);
    border: 1px solid var(--cc-border);
    border-radius: 16px;
    padding: 17px 18px 15px 18px;
    box-shadow: 0 8px 24px rgba(18, 48, 71, 0.05);
    overflow: hidden;
    min-height: 116px;
}
.metric-card::before {
    content: "";
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 4px;
    background: var(--accent, var(--cc-primary));
}
.metric-label {
    font-size: 0.67rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cc-muted);
    font-weight: 700;
    margin-bottom: 9px;
    padding-left: 2px;
}
.metric-value {
    font-size: 1.72rem;
    font-weight: 800;
    line-height: 1.05;
    color: var(--cc-text);
    padding-left: 2px;
}
.metric-sub {
    font-size: 0.74rem;
    color: var(--cc-muted);
    margin-top: 8px;
    line-height: 1.4;
    padding-left: 2px;
}
.metric-sub strong { color: var(--accent, var(--cc-primary)); }

/* Cards ------------------------------------------------------------------ */
[data-testid="stVerticalBlockBorderWrapper"] {
    background: var(--cc-surface);
    border: 1px solid var(--cc-border);
    border-radius: 18px;
    box-shadow: 0 10px 28px rgba(18, 48, 71, 0.045);
}
[data-testid="stVerticalBlockBorderWrapper"] > div {
    padding: 0.35rem 0.45rem;
}
.cc-card-title {
    font-family: 'Manrope', sans-serif;
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--cc-text);
    margin: 2px 0 2px 0;
    letter-spacing: -0.01em;
}
.cc-card-sub {
    font-size: 0.76rem;
    color: var(--cc-muted);
    margin: 0 0 8px 0;
    line-height: 1.45;
}

/* Section headers -------------------------------------------------------- */
.cc-section {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 16px; margin: 1.35rem 0 0.65rem 0;
}
.cc-section h2 {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--cc-text);
}
.cc-section p {
    margin: 3px 0 0 0;
    font-size: 0.8rem;
    color: var(--cc-muted);
}
.cc-rule {
    height: 1px; background: var(--cc-border); margin: 1.2rem 0;
}

/* Pills, chips, callouts -------------------------------------------------- */
.cc-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    font-size: 0.68rem; font-weight: 700;
    letter-spacing: 0.02em;
    background: var(--bg, #E8F4F5);
    color: var(--fg, #0E7C86);
    border: 1px solid var(--bd, #CFE7E9);
    white-space: nowrap;
}
.cc-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #F6F9FA;
    border: 1px solid var(--cc-border);
    color: #35505C;
    font-size: 0.75rem;
    padding: 6px 10px;
    border-radius: 9px;
    margin: 0 6px 6px 0;
}
.cc-chip .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--dot, var(--cc-primary));
    flex: 0 0 auto;
}
.cc-callout {
    border-radius: 14px;
    padding: 15px 17px;
    background: #F2F8F9;
    border: 1px solid #D8EAEC;
    font-size: 0.83rem;
    line-height: 1.6;
    color: #33505A;
}
.cc-callout.warn {
    background: #FFF7EC;
    border-color: #F6E1BE;
    color: #6B4B16;
}
.cc-callout.coral {
    background: #FFF3EF;
    border-color: #F6D7CC;
    color: #7A3420;
}
.cc-callout strong { font-weight: 700; }

/* Result ----------------------------------------------------------------- */
.cc-result {
    border-radius: 18px;
    padding: 24px 26px;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
}
.cc-result.ok { background: linear-gradient(125deg, #0A5C63, #0E7C86); }
.cc-result.bad { background: linear-gradient(125deg, #A63C1E, #E4572E); }
.cc-result .label {
    font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase;
    color: rgba(255,255,255,0.72); font-weight: 700;
}
.cc-result .headline {
    font-family: 'Manrope', sans-serif;
    font-size: clamp(1.35rem, 2.2vw, 1.85rem);
    font-weight: 800;
    margin: 5px 0 2px 0;
    line-height: 1.15;
}
.cc-result .prob {
    font-family: 'Manrope', sans-serif;
    font-size: 2.5rem; font-weight: 800; line-height: 1;
    margin-top: 12px;
}
.cc-result .prob small { font-size: 0.9rem; font-weight: 600; opacity: 0.75; }
.cc-result .caption { font-size: 0.78rem; opacity: 0.82; margin-top: 6px; }
.cc-meter {
    height: 9px; border-radius: 999px;
    background: rgba(255,255,255,0.2);
    overflow: hidden; margin-top: 14px;
}
.cc-meter > span {
    display: block; height: 100%; border-radius: 999px;
    background: rgba(255,255,255,0.92);
}
.cc-result-legend {
    display: flex; justify-content: space-between;
    font-size: 0.68rem; color: rgba(255,255,255,0.7); margin-top: 6px;
}

/* Tables and tabs -------------------------------------------------------- */
[data-testid="stDataFrame"] {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--cc-border);
}
.stTabs [data-baseweb="tab-list"] {
    gap: 4px;
    background: #EDF3F5;
    padding: 4px;
    border-radius: 11px;
    border: 1px solid #E1EAEE;
}
.stTabs [data-baseweb="tab"] {
    height: 36px;
    border-radius: 8px;
    padding: 0 14px;
    font-size: 0.82rem;
    font-weight: 600;
    color: #56707B;
}
.stTabs [aria-selected="true"] {
    background: #FFFFFF !important;
    color: #123047 !important;
    box-shadow: 0 2px 8px rgba(18,48,71,0.08);
}
.stTabs [data-baseweb="tab-highlight"] { display: none; }

/* Inputs ----------------------------------------------------------------- */
[data-baseweb="input"] > div,
[data-baseweb="select"] > div,
.stNumberInput input,
.stTextInput input {
    border-radius: 10px !important;
    border-color: #DCE6EA !important;
    background: #FFFFFF !important;
}
[data-baseweb="input"]:focus-within,
[data-baseweb="select"]:focus-within {
    border-color: var(--cc-primary) !important;
    box-shadow: 0 0 0 2px rgba(14,124,134,0.12) !important;
}
.stSlider [data-baseweb="slider"] { padding-top: 6px; }

.stButton > button {
    border-radius: 10px;
    border: 1px solid #D7E2E7;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0.55rem 1rem;
    transition: all 140ms ease;
}
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #0E7C86, #0A5C63);
    border: 0;
    color: #FFFFFF;
    box-shadow: 0 8px 20px rgba(14,124,134,0.24);
}
.stButton > button[kind="primary"]:hover {
    transform: translateY(-1px);
    box-shadow: 0 11px 24px rgba(14,124,134,0.30);
}
.stFormSubmitButton > button {
    background: linear-gradient(135deg, #0E7C86, #0A5C63) !important;
    border: 0 !important;
    color: white !important;
    border-radius: 10px !important;
    font-weight: 700 !important;
    box-shadow: 0 8px 20px rgba(14,124,134,0.24);
}

/* Expander / misc -------------------------------------------------------- */
[data-testid="stExpander"] {
    border: 1px solid var(--cc-border);
    border-radius: 12px;
    background: #FFFFFF;
}
[data-testid="stAlert"] { border-radius: 12px; }

.cc-footer {
    margin-top: 2.2rem;
    padding-top: 1.1rem;
    border-top: 1px solid var(--cc-border);
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 0.7rem; color: #8AA0A9;
    flex-wrap: wrap;
}

@media (max-width: 720px) {
    .cc-hero { padding: 24px 22px; }
    .metric-card { min-height: 100px; }
    .block-container { padding-left: 1rem; padding-right: 1rem; }
}
"""


def inject_css() -> None:
    st.markdown(f"<style>{_CSS}</style>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
_LOGO_SVG = """
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 20.2s-7.1-4.4-7.1-9.3A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.1 2.7c0 4.9-7.1 9.3-7.1 9.3Z"
        stroke="white" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M5.2 12.2h3.1l1.1-2.2 2 4.4 1.5-2.6h4.9"
        stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""


def sidebar_brand(pages) -> None:
    st.sidebar.markdown(
        f"""
        <div class="cc-brand">
            <div class="cc-brand-mark">{_LOGO_SVG}</div>
            <div>
                <div class="cc-brand-name">CardioCare</div>
                <div class="cc-brand-sub">Clinical Analytics</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.sidebar.markdown('<div class="cc-side-label">Workspace</div>', unsafe_allow_html=True)
    for page in pages:
        st.sidebar.page_link(page, label=page.title, icon=page.icon)

    st.sidebar.markdown('<div class="cc-rule" style="opacity:.15"></div>', unsafe_allow_html=True)

    meta = get_metadata()
    if meta:
        best = meta["best_model"]
        best_metric = meta["models"][best["key"]]["metrics"]
        st.sidebar.markdown(
            f"""
            <div class="cc-side-status">
              <div class="row"><span class="k">Models</span><span class="v">4 trained</span></div>
              <div class="row"><span class="k">Selected</span><span class="v">{best['name']}</span></div>
              <div class="row"><span class="k">Test F1</span><span class="v">{best_metric['f1']:.3f}</span></div>
              <div class="row"><span class="k">Updated</span><span class="v">{pretty_dt(meta['trained_at'])}</span></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.sidebar.markdown(
            '<div class="cc-side-status"><div class="row">'
            '<span class="k">Status</span><span class="v">No trained models</span>'
            "</div></div>",
            unsafe_allow_html=True,
        )

    st.sidebar.markdown(
        """
        <div class="cc-side-note">
            Academic decision-support prototype trained on a synthetic hospital
            dataset. Not a medical device and not a substitute for clinical
            judgement.
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.sidebar.markdown(
        f'<div class="cc-side-note">CardioCare v{PROJECT["version"]} · Streamlit edition</div>',
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------
def hero(title: str, subtitle: str, eyebrow: str = "", badges: list[str] | None = None) -> None:
    badge_html = ""
    if badges:
        badge_html = '<div class="cc-badges">' + "".join(
            f'<span class="cc-badge">{badge}</span>' for badge in badges
        ) + "</div>"
    st.markdown(
        f"""
        <div class="cc-hero">
            <div class="cc-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            {badge_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def section(title: str, subtitle: str = "") -> None:
    st.markdown(
        f"""
        <div class="cc-section">
            <div><h2>{title}</h2><p>{subtitle}</p></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def metric_card(
    label: str,
    value: str,
    sub: str = "",
    accent: str = PRIMARY,
) -> None:
    st.markdown(
        f"""
        <div class="metric-card" style="--accent:{accent}">
            <div class="metric-label">{label}</div>
            <div class="metric-value">{value}</div>
            <div class="metric-sub">{sub}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def card_title(title: str, subtitle: str = "") -> None:
    subtitle_html = f'<div class="cc-card-sub">{subtitle}</div>' if subtitle else ""
    st.markdown(
        f'<div class="cc-card-title">{title}</div>{subtitle_html}',
        unsafe_allow_html=True,
    )


def pill(text: str, color: str = PRIMARY, background: str = "#E8F4F5", border: str = "#CFE7E9") -> str:
    return (
        f'<span class="cc-pill" style="--bg:{background};--fg:{color};--bd:{border}">'
        f"{text}</span>"
    )


def callout(text: str, tone: str = "") -> None:
    tone_class = f" {tone}" if tone else ""
    st.markdown(f'<div class="cc-callout{tone_class}">{text}</div>', unsafe_allow_html=True)


def footer() -> None:
    st.markdown(
        f"""
        <div class="cc-footer">
            <span>{PROJECT['title']} · {PROJECT['author']}</span>
            <span>Built with Python, scikit-learn &amp; Streamlit · v{PROJECT['version']}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Charts
# ---------------------------------------------------------------------------
def new_figure(width: float = 6.0, height: float = 3.4):
    fig, ax = plt.subplots(figsize=(width, height), dpi=160)
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color("#DCE6EA")
    ax.grid(axis="y", color="#EAF1F4", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED, labelsize=9, length=0)
    return fig, ax


def show_figure(fig, caption: str = "") -> None:
    st.pyplot(fig, width="stretch")
    if caption:
        st.caption(caption)
    plt.close(fig)


def donut_chart(values: list[int], labels: list[str], colors: list[str], centre: str, sub: str) -> None:
    fig, ax = plt.subplots(figsize=(4.4, 3.5), dpi=160)
    fig.patch.set_alpha(0)
    wedges, _ = ax.pie(
        values,
        colors=colors,
        startangle=90,
        counterclock=False,
        wedgeprops=dict(width=0.30, edgecolor="#FFFFFF", linewidth=3),
    )
    ax.text(0, 0.08, centre, ha="center", va="center", fontsize=20, fontweight="800", color=TEXT)
    ax.text(0, -0.19, sub, ha="center", va="center", fontsize=8.5, color=MUTED)
    ax.legend(
        wedges,
        [f"{label}  ·  {value}" for label, value in zip(labels, values)],
        loc="lower center",
        bbox_to_anchor=(0.5, -0.14),
        ncol=2,
        fontsize=8.5,
        handlelength=1.1,
        columnspacing=1.5,
    )
    ax.set_aspect("equal")
    st.pyplot(fig, width="stretch")
    plt.close(fig)


def kpi_row(items: list[tuple[str, str, str, str]]) -> None:
    columns = st.columns(len(items))
    for column, (label, value, sub, accent) in zip(columns, items):
        with column:
            metric_card(label, value, sub, accent)


def model_color(key: str, meta: dict[str, Any] | None = None) -> str:
    if meta and key in meta.get("models", {}):
        return meta["models"][key].get("color", PRIMARY)
    return PRIMARY


def styled_table(frame: pd.DataFrame, format_map: dict[str, str] | None = None) -> None:
    config: dict[str, Any] = {}
    for column in frame.columns:
        if format_map and column in format_map:
            config[column] = st.column_config.TextColumn(column)
        elif pd.api.types.is_float_dtype(frame[column]):
            config[column] = st.column_config.NumberColumn(column, format="%.3f")
        elif pd.api.types.is_integer_dtype(frame[column]):
            config[column] = st.column_config.NumberColumn(column, format="%d")
    st.dataframe(frame, hide_index=True, width="stretch", column_config=config)
