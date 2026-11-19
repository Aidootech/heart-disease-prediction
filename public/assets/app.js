/* CardioCare web edition — vanilla JavaScript, no build step. */
(function () {
  "use strict";

  const METRIC_ORDER = ["accuracy", "precision", "recall", "f1", "roc_auc"];
  const ROUTE_TITLES = {
    dashboard: "Dashboard",
    dataset: "Dataset Overview",
    training: "Model Training",
    evaluation: "Model Evaluation",
    prediction: "Heart Disease Prediction",
    about: "About the Project",
  };
  const PALETTE = {
    primary: "#0e7c86",
    coral: "#e4572e",
    mint: "#6fcf97",
    amber: "#f2b134",
    blue: "#2f6b8f",
    violet: "#8a5cf6",
    muted: "#667c87",
  };

  const APP = {
    dataset: null,
    models: null,
    training: null,
    route: "dashboard",
    ui: {
      dashboardCriterion: null,
      evaluationCriterion: null,
      datasetTab: "preview",
      datasetFeature: "age",
      datasetCategory: "sex",
      reportModel: null,
      importanceModel: null,
      selectedModel: null,
      predictionResult: null,
      predictionError: null,
      predicting: false,
    },
  };

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */
  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );
  }

  function num(value, digits) {
    const d = digits === undefined ? 3 : digits;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(d) : "—";
  }

  function pct(value, digits) {
    const d = digits === undefined ? 1 : digits;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? (parsed * 100).toFixed(d) + "%" : "—";
  }

  function dateLabel(iso) {
    if (!iso) return "—";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const time = parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    return date + " · " + time + " UTC";
  }

  function metricLabel(key) {
    return (APP.models && APP.models.metric_labels && APP.models.metric_labels[key]) || key;
  }

  function modelColor(key) {
    const model = APP.models && APP.models.models[key];
    return (model && model.color) || PALETTE.primary;
  }

  function modelList() {
    if (!APP.models) return [];
    return APP.models.model_order.map((key) => APP.models.models[key]);
  }

  function bestKeyFor(criterion) {
    const models = APP.models.models;
    const order = APP.models.model_order;
    let best = order[0];
    order.forEach((key) => {
      const current = models[key].cv[criterion].mean;
      if (current > models[best].cv[criterion].mean) best = key;
    });
    return best;
  }

  function project() {
    return (APP.dataset && APP.dataset.project) || { version: "1.0.0" };
  }

  function toast(message) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => {
      node.hidden = true;
    }, 4200);
  }

  /* ------------------------------------------------------------------ *
   * UI primitives
   * ------------------------------------------------------------------ */
  function hero(options) {
    const badges = (options.badges || [])
      .map((badge) => '<span class="hero-badge">' + esc(badge) + "</span>")
      .join("");
    return (
      '<div class="hero">' +
      '<div class="hero-eyebrow">' + esc(options.eyebrow || "") + "</div>" +
      "<h1>" + esc(options.title) + "</h1>" +
      "<p>" + options.text + "</p>" +
      (badges ? '<div class="hero-badges">' + badges + "</div>" : "") +
      "</div>"
    );
  }

  function sectionHeader(title, subtitle) {
    return (
      '<div class="section"><div><h2>' + esc(title) + "</h2>" +
      (subtitle ? "<p>" + esc(subtitle) + "</p>" : "") +
      "</div></div>"
    );
  }

  function metricCard(options) {
    const accent = options.accent || PALETTE.primary;
    return (
      '<div class="metric" style="--accent:' + accent + '">' +
      '<div class="metric-label">' + esc(options.label) + "</div>" +
      '<div class="metric-value' + (options.small ? " sm" : "") + '">' + esc(options.value) + "</div>" +
      (options.sub ? '<div class="metric-sub">' + options.sub + "</div>" : "") +
      "</div>"
    );
  }

  function cardHead(title, subtitle) {
    return (
      '<div class="card-head"><div class="card-title">' + esc(title) + "</div>" +
      (subtitle ? '<div class="card-sub">' + esc(subtitle) + "</div>" : "") +
      "</div>"
    );
  }

  function callout(html, tone) {
    return '<div class="callout' + (tone ? " " + tone : "") + '">' + html + "</div>";
  }

  function pill(text, color, background, border) {
    const fg = color || PALETTE.primary;
    return (
      '<span class="pill" style="--pill-fg:' + fg + ";--pill-bg:" + (background || fg + "14") +
      ";--pill-bd:" + (border || fg + "33") + '">' + esc(text) + "</span>"
    );
  }

  function scoreBlock(label, value, sub) {
    return (
      '<div class="score"><div class="k">' + esc(label) + "</div>" +
      '<div class="v">' + esc(value) + "</div>" +
      (sub ? '<div class="s">' + esc(sub) + "</div>" : "") +
      "</div>"
    );
  }

  function kvRows(pairs) {
    return (
      '<div class="kv">' +
      pairs
        .map(
          (pair) =>
            '<div class="kv-row"><span class="k">' + esc(pair[0]) +
            '</span><span class="v">' + pair[1] + "</span></div>"
        )
        .join("") +
      "</div>"
    );
  }

  function dataTable(headers, rows, numericIndexes) {
    const numeric = numericIndexes || [];
    const head = headers
      .map(
        (header, index) =>
          '<th class="' + (numeric.includes(index) ? "num" : "") + '">' + esc(header) + "</th>"
      )
      .join("");
    const body = rows
      .map(
        (row) =>
          "<tr>" +
          row
            .map(
              (cell, index) =>
                '<td class="' + (numeric.includes(index) ? "num" : "") + '">' + cell + "</td>"
            )
            .join("") +
          "</tr>"
      )
      .join("");
    return (
      '<div class="table-wrap"><table class="table"><thead><tr>' + head +
      "</tr></thead><tbody>" + body + "</tbody></table></div>"
    );
  }

  function hbars(items) {
    return (
      '<div class="hbars">' +
      items
        .map(
          (item) =>
            '<div class="hbar-row">' +
            '<span class="hbar-label" title="' + esc(item.label) + '">' + esc(item.label) + "</span>" +
            '<span class="hbar-track"><span class="hbar-fill" style="width:' +
            Math.max(0, Math.min(100, item.percent)) + "%;--bar:" + (item.color || PALETTE.primary) +
            '"></span></span>' +
            '<span class="hbar-value">' + esc(item.value) + "</span>" +
            "</div>"
        )
        .join("") +
      "</div>"
    );
  }

  /* ------------------------------------------------------------------ *
   * Charts
   * ------------------------------------------------------------------ */
  function donutChart(values, colors, centre, sub) {
    const size = 176;
    const stroke = 20;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    let offset = 0;
    const segments = values
      .map((value, index) => {
        const length = (value / total) * circumference;
        const segment =
          '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + radius +
          '" fill="none" stroke="' + colors[index] + '" stroke-width="' + stroke +
          '" stroke-dasharray="' + length + " " + (circumference - length) +
          '" stroke-dashoffset="' + -offset + '"></circle>';
        offset += length;
        return segment;
      })
      .join("");
    return (
      '<svg viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size +
      '" role="img" aria-label="Distribution chart">' +
      '<g transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')">' + segments + "</g>" +
      '<text x="' + size / 2 + '" y="' + (size / 2 - 1) +
      '" text-anchor="middle" style="font-family:Manrope,sans-serif;font-size:24px;font-weight:800;fill:#152b36">' +
      esc(centre) + "</text>" +
      '<text x="' + size / 2 + '" y="' + (size / 2 + 18) +
      '" text-anchor="middle" style="font-size:9px;fill:#667c87">' + esc(sub) + "</text>" +
      "</svg>"
    );
  }

  function histogramByClass(hist) {
    const width = 640;
    const height = 268;
    const pad = { l: 40, r: 12, t: 14, b: 34 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const centres = hist.centres || [];
    const no = hist.no_disease || [];
    const disease = hist.disease || [];
    const totals = centres.map((_, index) => (no[index] || 0) + (disease[index] || 0));
    const rawMax = Math.max(1, ...totals);
    const step = Math.max(1, Math.ceil(rawMax / 4));
    const maxY = step * 4;
    const slot = innerW / Math.max(1, centres.length);
    const barWidth = Math.max(2, slot * 0.76);
    const scaleY = (value) => pad.t + innerH - (value / maxY) * innerH;

    let grid = "";
    for (let i = 0; i <= 4; i += 1) {
      const value = (maxY / 4) * i;
      const y = scaleY(value);
      grid +=
        '<line class="grid-line" x1="' + pad.l + '" y1="' + y + '" x2="' + (width - pad.r) +
        '" y2="' + y + '"></line><text x="' + (pad.l - 8) + '" y="' + (y + 3) +
        '" text-anchor="end" style="font-size:9px">' + Math.round(value) + "</text>";
    }

    let bars = "";
    centres.forEach((centre, index) => {
      const x = pad.l + slot * index + (slot - barWidth) / 2;
      const noValue = no[index] || 0;
      const yesValue = disease[index] || 0;
      const noHeight = (noValue / maxY) * innerH;
      const yesHeight = (yesValue / maxY) * innerH;
      const baseY = pad.t + innerH;
      if (noHeight > 0) {
        bars +=
          '<rect x="' + x + '" y="' + (baseY - noHeight) + '" width="' + barWidth +
          '" height="' + noHeight + '" rx="1.5" fill="' + PALETTE.primary + '"></rect>';
      }
      if (yesHeight > 0) {
        bars +=
          '<rect x="' + x + '" y="' + (baseY - noHeight - yesHeight) + '" width="' + barWidth +
          '" height="' + yesHeight + '" rx="1.5" fill="' + PALETTE.coral + '"></rect>';
      }
    });

    const tickIndexes = [0, Math.floor(centres.length / 3), Math.floor((2 * centres.length) / 3), centres.length - 1];
    let xLabels = "";
    Array.from(new Set(tickIndexes)).forEach((index) => {
      const x = pad.l + slot * index + slot / 2;
      xLabels +=
        '<text x="' + x + '" y="' + (height - 10) +
        '" text-anchor="middle" style="font-size:9px">' + esc(centres[index]) + "</text>";
    });

    return (
      '<svg class="chart" viewBox="0 0 ' + width + " " + height +
      '" role="img" aria-label="Distribution by class">' + grid + bars +
      '<line class="axis-line" x1="' + pad.l + '" y1="' + (pad.t + innerH) + '" x2="' +
      (width - pad.r) + '" y2="' + (pad.t + innerH) + '"></line>' + xLabels + "</svg>" +
      '<div class="legend"><span class="legend-item"><span class="legend-swatch" style="--swatch:' +
      PALETTE.primary + '"></span>No disease</span><span class="legend-item">' +
      '<span class="legend-swatch" style="--swatch:' + PALETTE.coral + '"></span>Heart disease</span></div>'
    );
  }

  function groupedBars(categories, series, options) {
    const opts = options || {};
    const width = 640;
    const height = 272;
    const pad = { l: 42, r: 12, t: 14, b: 40 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const allValues = series.reduce((acc, item) => acc.concat(item.values), []);
    const rawMax = Math.max.apply(null, allValues.concat([0.1]));
    const axisMax = opts.axisMax || (rawMax <= 1.05 ? 1 : Math.ceil(rawMax / 5) * 5);
    const groupWidth = innerW / Math.max(1, categories.length);
    const barWidth = Math.min(46, (groupWidth * 0.66) / series.length);
    const scaleY = (value) => pad.t + innerH - (value / axisMax) * innerH;

    let grid = "";
    for (let i = 0; i <= 4; i += 1) {
      const value = (axisMax / 4) * i;
      const y = scaleY(value);
      grid +=
        '<line class="grid-line" x1="' + pad.l + '" y1="' + y + '" x2="' + (width - pad.r) +
        '" y2="' + y + '"></line><text x="' + (pad.l - 8) + '" y="' + (y + 3) +
        '" text-anchor="end" style="font-size:9px">' +
        (axisMax <= 1.05 ? value.toFixed(2) : Math.round(value)) + "</text>";
    }

    let bars = "";
    let labels = "";
    categories.forEach((category, categoryIndex) => {
      const groupStart =
        pad.l + groupWidth * categoryIndex + (groupWidth - barWidth * series.length) / 2;
      series.forEach((seriesItem, seriesIndex) => {
        const value = seriesItem.values[categoryIndex] || 0;
        const x = groupStart + seriesIndex * barWidth;
        const y = scaleY(value);
        const barHeight = pad.t + innerH - y;
        bars +=
          '<rect x="' + x + '" y="' + y + '" width="' + Math.max(1, barWidth - 2) +
          '" height="' + Math.max(0, barHeight) + '" rx="3" fill="' + seriesItem.color +
          '"></rect>';
      });
      labels +=
        '<text x="' + (pad.l + groupWidth * categoryIndex + groupWidth / 2) + '" y="' +
        (height - 14) + '" text-anchor="middle" style="font-size:9.5px">' +
        esc(category) + "</text>";
    });

    const legend = series
      .map(
        (item) =>
          '<span class="legend-item"><span class="legend-swatch" style="--swatch:' + item.color +
          '"></span>' + esc(item.label) + "</span>"
      )
      .join("");

    return (
      '<svg class="chart" viewBox="0 0 ' + width + " " + height +
      '" role="img" aria-label="Comparison chart">' + grid + bars +
      '<line class="axis-line" x1="' + pad.l + '" y1="' + (pad.t + innerH) + '" x2="' +
      (width - pad.r) + '" y2="' + (pad.t + innerH) + '"></line>' + labels + "</svg>" +
      '<div class="legend">' + legend + "</div>"
    );
  }

  function rocChart() {
    const width = 640;
    const height = 348;
    const pad = { l: 46, r: 14, t: 14, b: 40 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const xScale = (value) => pad.l + value * innerW;
    const yScale = (value) => pad.t + innerH - value * innerH;

    let grid = "";
    [0, 0.25, 0.5, 0.75, 1].forEach((value) => {
      const x = xScale(value);
      const y = yScale(value);
      grid +=
        '<line class="grid-line" x1="' + x + '" y1="' + pad.t + '" x2="' + x + '" y2="' +
        (pad.t + innerH) + '"></line>' +
        '<line class="grid-line" x1="' + pad.l + '" y1="' + y + '" x2="' + (width - pad.r) +
        '" y2="' + y + '"></line>' +
        '<text x="' + x + '" y="' + (height - 14) + '" text-anchor="middle" style="font-size:9px">' +
        value + "</text>" +
        '<text x="' + (pad.l - 9) + '" y="' + (y + 3) + '" text-anchor="end" style="font-size:9px">' +
        value + "</text>";
    });

    let lines = "";
    let legend = "";
    modelList().forEach((model) => {
      const points = model.roc_curve
        .map((point) => xScale(point.fpr) + "," + yScale(point.tpr))
        .join(" ");
      lines +=
        '<polyline points="' + points + '" fill="none" stroke="' + model.color +
        '" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"></polyline>';
      legend +=
        '<span class="legend-item"><span class="legend-swatch" style="--swatch:' + model.color +
        '"></span>' + esc(model.name) + " · AUC " + num(model.metrics.roc_auc, 3) + "</span>";
    });

    return (
      '<svg class="chart" viewBox="0 0 ' + width + " " + height +
      '" role="img" aria-label="ROC curves">' + grid +
      '<line x1="' + pad.l + '" y1="' + (pad.t + innerH) + '" x2="' + (width - pad.r) +
      '" y2="' + pad.t + '" stroke="#a8b7bf" stroke-width="1" stroke-dasharray="5 5"></line>' +
      lines +
      '<line class="axis-line" x1="' + pad.l + '" y1="' + (pad.t + innerH) + '" x2="' +
      (width - pad.r) + '" y2="' + (pad.t + innerH) + '"></line>' +
      '<line class="axis-line" x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' +
      (pad.t + innerH) + '"></line>' +
      '<text x="' + (pad.l + innerW / 2) + '" y="' + (height - 1) +
      '" text-anchor="middle" style="font-size:9.5px">False positive rate</text>' +
      '<text x="12" y="' + (pad.t + innerH / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' +
      (pad.t + innerH / 2) + ')" style="font-size:9.5px">True positive rate</text>' +
      "</svg>" +
      '<div class="legend">' + legend + "</div>"
    );
  }

  function heatmapTable(labels, matrix) {
    const colorFor = (value) => {
      const magnitude = Math.min(1, Math.abs(value));
      if (value >= 0) {
        return "rgba(14,124,134," + (0.08 + magnitude * 0.72) + ")";
      }
      return "rgba(228,87,46," + (0.08 + magnitude * 0.72) + ")";
    };
    const head =
      "<tr><th></th>" +
      labels.map((label) => "<th>" + esc(label) + "</th>").join("") +
      "</tr>";
    const rows = labels
      .map(
        (label, rowIndex) =>
          '<tr><th class="row-head">' + esc(label) + "</th>" +
          matrix[rowIndex]
            .map(
              (value, columnIndex) =>
                '<td style="background:' + colorFor(value) + '">' +
                (rowIndex === columnIndex ? "1.00" : Number(value).toFixed(2)) + "</td>"
            )
            .join("") +
          "</tr>"
      )
      .join("");
    return (
      '<div style="overflow-x:auto"><table class="heatmap"><thead>' + head +
      "</thead><tbody>" + rows + "</tbody></table></div>"
    );
  }

  function miniMetricPanel(title, metric) {
    const models = modelList();
    const best = models.reduce(
      (a, b) => (b.metrics[metric] > a.metrics[metric] ? b : a),
      models[0]
    );
    const rows = models
      .slice()
      .sort((a, b) => a.metrics[metric] - b.metrics[metric])
      .map(
        (model) =>
          '<div class="hbar-row" style="grid-template-columns:32px minmax(0,1fr) 36px;gap:6px;font-size:.66rem">' +
          '<span class="hbar-label">' + esc(model.acronym) + "</span>" +
          '<span class="hbar-track"><span class="hbar-fill" style="width:' +
          Math.max(2, model.metrics[metric] * 100) + "%;--bar:" +
          (model.key === best.key ? PALETTE.coral : "#a9cfd3") + '"></span></span>' +
          '<span class="hbar-value">' + num(model.metrics[metric], 3) + "</span>" +
          "</div>"
      )
      .join("");
    return (
      '<div class="mini-metric"><div class="name">' + esc(title) + "</div>" +
      '<div class="hbars" style="gap:7px;margin-top:6px">' + rows + "</div></div>"
    );
  }

  function confusionMatrix(model) {
    const cm = model.confusion_matrix;
    const cell = (value, label, tone) =>
      '<div class="cm-cell" style="--cm-bg:' + (tone === "bad" ? "#fdf1ed" : "#f1f9fa") +
      ";--cm-bd:" + (tone === "bad" ? "#f4d7cd" : "#d9ecee") +
      ";--cm-fg:" + (tone === "bad" ? "#a63c1e" : "#0a5c63") + '">' +
      '<div class="n">' + value + "</div><div class=\"t\">" + label + "</div></div>";
    return (
      '<div class="cm-grid">' + cell(cm.tn, "True negative", "good") +
      cell(cm.fp, "False positive", "bad") + cell(cm.fn, "False negative", "bad") +
      cell(cm.tp, "True positive", "good") + "</div>" +
      '<div class="cm-axis"><span>← Predicted no</span><span>Predicted yes →</span></div>' +
      '<div class="center tiny muted" style="margin-top:8px">Actual: no · yes (top to bottom)</div>'
    );
  }

  /* ------------------------------------------------------------------ *
   * Page: Dashboard
   * ------------------------------------------------------------------ */
  function renderDashboard() {
    const profile = APP.dataset.profile;
    const models = APP.models;
    const criterion = APP.ui.dashboardCriterion || models.best_model.criterion;
    const bestKey = bestKeyFor(criterion);
    const best = models.models[bestKey];
    const prevalence = profile.target_prevalence;
    const signal = models.signal_assessment || {};
    const sex = profile.sex_distribution;

    const kpis =
      '<div class="grid grid-5">' +
      metricCard({
        label: "Total patients",
        value: profile.shape.rows,
        sub: "Clean records · no missing values",
        accent: PALETTE.primary,
      }) +
      metricCard({
        label: "Heart disease",
        value: profile.target_counts.disease,
        sub: "<strong>" + prevalence.toFixed(1) + "%</strong> of the cohort",
        accent: PALETTE.coral,
      }) +
      metricCard({
        label: "No heart disease",
        value: profile.target_counts.no_disease,
        sub: (100 - prevalence).toFixed(1) + "% of the cohort",
        accent: PALETTE.primary,
      }) +
      metricCard({
        label: "Algorithms",
        value: "4",
        sub: "LR · DT · RF · SVM",
        accent: PALETTE.amber,
      }) +
      metricCard({
        label: "Best model",
        value: best.name,
        small: true,
        sub: "<strong>CV " + metricLabel(criterion) + " " + num(best.cv[criterion].mean, 3) +
          "</strong> · test F1 " + num(best.metrics.f1, 3),
        accent: PALETTE.mint,
      }) +
      "</div>";

    const distributionCard =
      '<div class="card"><div class="card-head"><div class="card-title">Heart disease distribution</div>' +
      '<div class="card-sub">Target class balance across ' + profile.shape.rows + " patients</div></div>" +
      '<div class="donut-wrap"><div>' +
      donutChart(
        [profile.target_counts.no_disease, profile.target_counts.disease],
        [PALETTE.primary, PALETTE.coral],
        Math.round(prevalence) + "%",
        "heart disease"
      ) +
      "</div><div class=\"donut-caption\"><div class=\"donut-legend\">" +
      '<div class="donut-legend-row"><span class="legend-swatch" style="--swatch:' +
      PALETTE.primary + '"></span>No heart disease <b>' + profile.target_counts.no_disease +
      "</b></div>" +
      '<div class="donut-legend-row"><span class="legend-swatch" style="--swatch:' +
      PALETTE.coral + '"></span>Heart disease <b>' + profile.target_counts.disease +
      "</b></div></div>" +
      '<div class="tiny muted" style="margin-top:12px;line-height:1.55">A near-balanced binary target. ' +
      "The 80/20 stratified split preserves this ratio in both partitions.</div>" +
      "</div></div></div>";

    const ageCard =
      '<div class="card"><div class="card-head"><div class="card-title">Age distribution</div>' +
      '<div class="card-sub">Patients by age and target class</div></div>' +
      histogramByClass(profile.histograms_by_class.age) + "</div>";

    const factorCards =
      '<div class="grid grid-3">' +
      '<div class="card"><div class="card-head"><div class="card-title">Cholesterol</div>' +
      '<div class="card-sub">Total cholesterol, mg/dL</div></div>' +
      histogramByClass(profile.histograms_by_class.cholesterol) + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Blood pressure</div>' +
      '<div class="card-sub">Systolic pressure, mmHg</div></div>' +
      histogramByClass(profile.histograms_by_class.blood_pressure) + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Heart disease by sex</div>' +
      '<div class="card-sub">Counts per class</div></div>' +
      groupedBars(sex.labels, [
        { label: "No disease", color: PALETTE.primary, values: sex.no_disease },
        { label: "Heart disease", color: PALETTE.coral, values: sex.disease },
      ]) +
      "</div></div>";

    const f1Items = modelList()
      .slice()
      .sort((a, b) => b.metrics.f1 - a.metrics.f1)
      .map((model) => ({
        label: model.name,
        value: num(model.metrics.f1, 3),
        percent: model.metrics.f1 * 100,
        color: model.key === bestKey ? PALETTE.coral : model.color,
      }));

    const criterionOptions = METRIC_ORDER.map(
      (key) =>
        '<option value="' + key + '"' + (key === criterion ? " selected" : "") + ">" +
        esc(metricLabel(key)) + " (CV)</option>"
    ).join("");

    const snapshot =
      '<div class="card"><div class="card-head"><div class="card-title">Model snapshot</div>' +
      '<div class="card-sub">Best model under the selected criterion</div></div>' +
      '<select class="select" id="dashboardCriterion" aria-label="Evaluation criterion">' +
      criterionOptions + "</select>" +
      '<div style="margin-top:14px">' + pill("Selected model", best.color) + "</div>" +
      '<div style="font-family:Manrope,sans-serif;font-size:1.2rem;font-weight:800;margin-top:9px;color:#152b36">' +
      esc(best.name) + "</div>" +
      '<div class="tiny muted" style="margin-top:3px">Cross-validated ' +
      esc(metricLabel(criterion).toLowerCase()) + " = <b>" + num(best.cv[criterion].mean, 3) +
      "</b></div>" +
      '<div class="score-row">' +
      scoreBlock("Accuracy", num(best.metrics.accuracy, 3), "test set") +
      scoreBlock("F1-score", num(best.metrics.f1, 3), "test set") +
      scoreBlock("ROC-AUC", num(best.metrics.roc_auc, 3), "test set") +
      "</div></div>";

    return (
      hero({
        eyebrow: "Clinical intelligence dashboard",
        title: "Cardiovascular risk, made measurable.",
        text:
          "A machine-learning workspace for exploring a synthetic hospital cohort, comparing four " +
          "classification algorithms and estimating an individual patient's probability of heart disease.",
        badges: [
          profile.shape.rows + " patient records",
          profile.feature_count + " clinical features",
          "4 classification algorithms",
          "Reproducible · seed 42",
        ],
      }) +
      kpis +
      sectionHeader(
        "Cohort at a glance",
        "Distributions from the actual hospital_synthetic_dataset.xlsx file."
      ) +
      '<div class="grid grid-2-1">' + ageCard + distributionCard + "</div>" +
      '<div class="mt-2"></div>' + factorCards +
      sectionHeader(
        "Model performance",
        "Selection uses stratified cross-validation on the training set only."
      ) +
      '<div class="grid grid-main-side">' +
      '<div class="card"><div class="card-head"><div class="card-title">Test-set F1 by algorithm</div>' +
      '<div class="card-sub">Higher is better · evaluated on the 100 held-out patients</div></div>' +
      hbars(f1Items) + "</div>" + snapshot + "</div>" +
      '<div class="mt-2"></div>' +
      callout(
        "<strong>Signal check.</strong> " + esc(signal.interpretation || "") +
          " Best cross-validated ROC-AUC: <strong>" + num(signal.best_cv_roc_auc, 3) + "</strong>.",
        "warn"
      )
    );
  }

  /* ------------------------------------------------------------------ *
   * Page: Dataset overview
   * ------------------------------------------------------------------ */
  function tabBlock(id, tabs, activeKey) {
    const strip =
      '<div class="tabs" data-tabs="' + id + '">' +
      tabs
        .map(
          (tab) =>
            '<button class="tab' + (tab.key === activeKey ? " active" : "") + '" data-tab="' +
            tab.key + '">' + esc(tab.label) + "</button>"
        )
        .join("") +
      "</div>";
    const panels = tabs
      .map(
        (tab) =>
          '<div class="tab-panel" data-panel="' + tab.key + '"' +
          (tab.key === activeKey ? "" : " hidden") + ">" + tab.html + "</div>"
      )
      .join("");
    return '<div class="tab-container">' + strip + panels + "</div>";
  }

  function renderDataset() {
    const profile = APP.dataset.profile;
    const schema = APP.models.feature_schema;

    const kpis =
      '<div class="grid grid-4">' +
      metricCard({ label: "Observations", value: profile.shape.rows, sub: "Patient records", accent: PALETTE.primary }) +
      metricCard({ label: "Features", value: profile.feature_count, sub: "10 independent variables", accent: PALETTE.primary }) +
      metricCard({ label: "Missing cells", value: profile.missing_total, sub: "Complete-case dataset", accent: PALETTE.blue }) +
      metricCard({ label: "Duplicate rows", value: profile.duplicate_rows, sub: "No repeated records", accent: PALETTE.amber }) +
      "</div>";

    const previewKeys = Object.keys(profile.preview[0] || {});
    const previewRows = profile.preview.map((row) =>
      previewKeys.map((key) => esc(row[key]))
    );
    const preview =
      '<div class="card"><div class="card-head"><div class="card-title">Dataset preview</div>' +
      '<div class="card-sub">First ten rows, formatted for readability</div></div>' +
      dataTable(previewKeys, previewRows) + "</div>" +
      '<div class="grid grid-2 mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Target encoding</div>' +
      '<div class="card-sub">heart_disease</div></div>' +
      '<div class="row"><span class="chip"><span class="dot" style="--dot:' + PALETTE.primary +
      '"></span><b>0</b>&nbsp; No heart disease · ' + profile.target_counts.no_disease +
      ' patients</span><span class="chip"><span class="dot" style="--dot:' + PALETTE.coral +
      '"></span><b>1</b>&nbsp; Heart disease · ' + profile.target_counts.disease +
      " patients</span></div></div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Source and completeness</div>' +
      '<div class="card-sub">Read directly from the supplied Excel file</div></div>' +
      kvRows([
        ["Source file", esc(APP.dataset.source_file)],
        ["Rows × columns", profile.shape.rows + " × " + profile.shape.columns],
        ["Missing cells", String(profile.missing_total)],
        ["Duplicate rows", String(profile.duplicate_rows)],
        ["Memory footprint", profile.memory_kb + " KB"],
      ]) + "</div></div>";

    const schemaRows = profile.columns.map((column) => [
      esc(column.label),
      '<span class="tiny muted">' + esc(column.name) + "</span>",
      esc(column.dtype),
      esc(column.role),
      esc(column.unit || "—"),
      String(column.unique),
      String(column.missing),
      column.missing_pct.toFixed(1) + "%",
    ]);
    const completeness = profile.columns
      .map((column) => ({
        label: column.label,
        value: (100 - column.missing_pct).toFixed(0) + "%",
        percent: 100 - column.missing_pct,
        color: PALETTE.primary,
      }));

    const schemaTab =
      '<div class="card"><div class="card-head"><div class="card-title">Schema and data quality</div>' +
      '<div class="card-sub">Types, completeness and the role of each column</div></div>' +
      dataTable(
        ["Column", "Key", "Data type", "Role", "Unit", "Unique", "Missing", "Missing %"],
        schemaRows
      ) + "</div>" +
      '<div class="grid grid-2 mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Completeness by column</div>' +
      '<div class="card-sub">Percentage of non-missing cells</div></div>' + hbars(completeness) + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Quality summary</div>' +
      '<div class="card-sub">Automated checks on the raw file</div></div>' +
      kvRows([
        ["Missing values", profile.missing_total + " cells"],
        ["Duplicate records", String(profile.duplicate_rows)],
        ["Target values", "Encoded 0 / 1"],
        ["Out-of-range target", "0 rows"],
        ["Feature count", String(profile.feature_count)],
      ]) +
      '<div class="mt-2"></div>' +
      callout("The dataset is complete: no imputation is required. Imputation would only be introduced for a dataset with genuine missing values.") +
      "</div></div>";

    const numericRows = profile.numeric_summary.map((item) => [
      esc(item.label),
      String(item.count),
      num(item.mean, 2),
      num(item.std, 2),
      num(item.min, 2),
      num(item.q1, 2),
      num(item.median, 2),
      num(item.q3, 2),
      num(item.max, 2),
    ]);
    const categoricalCards = profile.categorical_summary
      .map((item) => {
        const counts = Object.entries(item.distribution).sort((a, b) => b[1] - a[1]);
        const max = Math.max.apply(null, counts.map((entry) => entry[1]));
        return (
          '<div class="card"><div class="card-head"><div class="card-title">' + esc(item.label) +
          '</div><div class="card-sub">' + item.unique + " categories</div></div>" +
          hbars(
            counts.map((entry) => ({
              label: entry[0],
              value: String(entry[1]),
              percent: (entry[1] / max) * 100,
              color: PALETTE.primary,
            }))
          ) + "</div>"
        );
      })
      .join("");
    const correlation = profile.correlation;

    const statsTab =
      '<div class="card"><div class="card-head"><div class="card-title">Descriptive statistics</div>' +
      '<div class="card-sub">Location, spread and distribution of every numerical feature</div></div>' +
      dataTable(
        ["Feature", "Count", "Mean", "Std. dev.", "Min", "Q1", "Median", "Q3", "Max"],
        numericRows,
        [1, 2, 3, 4, 5, 6, 7, 8]
      ) + "</div>" +
      sectionHeader("Categorical features", "Counts per category") +
      '<div class="grid grid-4">' + categoricalCards + "</div>" +
      '<div class="card mt-2"><div class="card-head"><div class="card-title">Correlation matrix</div>' +
      '<div class="card-sub">Pearson correlation among numerical variables and the target</div></div>' +
      heatmapTable(correlation.labels, correlation.matrix) +
      '<div class="mt-2"></div>' +
      callout(
        "Correlations are uniformly small in this synthetic sample; the strongest is " +
          "<strong>blood pressure versus heart disease (r = −0.067)</strong>. That is an honest " +
          "property of the data, not a preprocessing error.",
        "warn"
      ) + "</div>";

    const numericOptions = schema.numeric
      .map(
        (item) =>
          '<option value="' + item.name + '"' +
          (item.name === APP.ui.datasetFeature ? " selected" : "") + ">" + esc(item.label) +
          "</option>"
      )
      .join("");
    const categoryOptions = schema.categorical
      .map(
        (item) =>
          '<option value="' + item.name + '"' +
          (item.name === APP.ui.datasetCategory ? " selected" : "") + ">" + esc(item.label) +
          "</option>"
      )
      .join("");
    const hist = profile.histograms_by_class[APP.ui.datasetFeature] || profile.histograms_by_class.age;
    const categoryRows = profile.category_target[APP.ui.datasetCategory] || [];
    const categoryBars = categoryRows.map((row) => ({
      label: row.category + " (n=" + row.total + ")",
      value: row.rate.toFixed(1) + "%",
      percent: row.rate,
      color: PALETTE.coral,
    }));

    const visualTab =
      '<div class="card"><div class="card-head"><div class="card-title">Visual exploration</div>' +
      '<div class="card-sub">Inspect how each feature relates to the target</div></div>' +
      '<div class="grid grid-2">' +
      '<div class="field"><label class="field-label" for="featureSelect">Numerical feature</label>' +
      '<select class="select" id="featureSelect">' + numericOptions + "</select></div>" +
      '<div class="field"><label class="field-label" for="categorySelect">Categorical feature</label>' +
      '<select class="select" id="categorySelect">' + categoryOptions + "</select></div>" +
      "</div></div>" +
      '<div class="grid grid-2 mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Distribution by class</div>' +
      '<div class="card-sub">Stacked counts for the selected numerical feature</div></div>' +
      histogramByClass(hist) + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Disease rate by category</div>' +
      '<div class="card-sub">Share of patients with heart disease in each group</div></div>' +
      hbars(categoryBars) +
      '<div class="tiny muted mt-2">All rates sit close to the overall prevalence of ' +
      profile.target_prevalence.toFixed(1) + "%, which illustrates the weak association in this sample.</div>" +
      "</div></div>";

    return (
      hero({
        eyebrow: "Dataset overview",
        title: "Know the data before the model.",
        text:
          "Every chart on this page is computed directly from the 500-record synthetic hospital " +
          "dataset shipped with the project — no sampled or invented values.",
        badges: [
          "hospital_synthetic_dataset.xlsx",
          profile.shape.rows + " observations",
          profile.feature_count + " features + target",
          "0 missing cells",
        ],
      }) +
      kpis +
      sectionHeader("Explore the cohort", "Preview, schema, statistics and visual relationships") +
      tabBlock(
        "dataset",
        [
          { key: "preview", label: "Preview", html: preview },
          { key: "schema", label: "Schema & quality", html: schemaTab },
          { key: "stats", label: "Descriptive statistics", html: statsTab },
          { key: "visual", label: "Visual exploration", html: visualTab },
        ],
        APP.ui.datasetTab
      )
    );
  }

  /* ------------------------------------------------------------------ *
   * Page: Model training
   * ------------------------------------------------------------------ */
  function parameterText(params) {
    const labels = {
      C: "C",
      max_depth: "max depth",
      min_samples_leaf: "min leaf",
      n_estimators: "trees",
      max_features: "max features",
      kernel: "kernel",
      gamma: "gamma",
      probability: "probability",
      solver: "solver",
      max_iter: "max iter",
    };
    return Object.keys(params)
      .filter((key) => key !== "probability")
      .map((key) => {
        const value = params[key];
        return labels[key] + " = " + (typeof value === "number" ? String(value) : esc(value));
      })
      .join("  ·  ");
  }

  function algorithmCard(algorithm) {
    return (
      '<div class="card"><div class="algorithm">' +
      '<div class="acronym" style="--acronym:' + algorithm.color + '">' + esc(algorithm.acronym) + "</div>" +
      '<div style="min-width:0"><div class="card-title">' + esc(algorithm.name) + "</div>" +
      '<div class="tiny" style="text-transform:uppercase;letter-spacing:.07em;color:#8aa0a9">' +
      esc(algorithm.family) + "</div></div></div>" +
      "<p>" + esc(algorithm.description) + "</p>" +
      '<div class="param-box">' + parameterText(algorithm.hyperparameters || {}) + "</div>" +
      '<div class="strengths" style="--accent:' + algorithm.color + '">' + esc(algorithm.strengths) + "</div>" +
      '<div class="score-row">' +
      scoreBlock("CV F1", num(algorithm.cv.f1.mean, 3), "± " + num(algorithm.cv.f1.std, 3)) +
      scoreBlock("CV ROC-AUC", num(algorithm.cv.roc_auc.mean, 3), "± " + num(algorithm.cv.roc_auc.std, 3)) +
      scoreBlock("Test F1", num(algorithm.metrics.f1, 3), "held out") +
      "</div></div>"
    );
  }

  function renderTraining() {
    const training = APP.training;
    const models = APP.models;
    const run = training.run;
    const algorithms = training.algorithms;
    const best = models.best_model;
    const bestModel = models.models[best.key];

    const kpis =
      '<div class="grid grid-4">' +
      metricCard({ label: "Algorithms trained", value: algorithms.length, sub: "All pipelines persisted", accent: PALETTE.primary }) +
      metricCard({ label: "Training time", value: run.duration_seconds.toFixed(1) + "s", sub: "Latest verified run", accent: PALETTE.amber }) +
      metricCard({ label: "Training rows", value: run.dataset.train_rows, sub: "Used for fitting + CV", accent: PALETTE.primary }) +
      metricCard({ label: "Test rows", value: run.dataset.test_rows, sub: "Held out until evaluation", accent: PALETTE.coral }) +
      "</div>";

    const cards = algorithms.map(algorithmCard).join("");

    const pipeline = training.pipeline_steps
      .map(
        (step, index) =>
          '<div class="timeline-item"><div class="timeline-num">' + (index + 1) + "</div>" +
          '<div><div class="timeline-title">' + esc(step.title) + "</div>" +
          '<div class="timeline-detail">' + esc(step.detail) + "</div></div></div>"
      )
      .join("");

    const resultRows = algorithms.map((algorithm) => [
      '<span class="cell-dot" style="--dot:' + algorithm.color + '"></span>' + esc(algorithm.name),
      num(algorithm.cv.roc_auc.mean, 3),
      num(algorithm.cv.f1.mean, 3),
      num(algorithm.metrics.accuracy, 3),
      num(algorithm.metrics.precision, 3),
      num(algorithm.metrics.recall, 3),
      num(algorithm.metrics.f1, 3),
      num(algorithm.metrics.roc_auc, 3),
    ]);

    const cvTestChart = groupedBars(
      algorithms.map((algorithm) => algorithm.acronym),
      [
        { label: "CV F1", color: "#b9dde0", values: algorithms.map((a) => a.cv.f1.mean) },
        { label: "Test F1", color: PALETTE.primary, values: algorithms.map((a) => a.metrics.f1) },
      ],
      { axisMax: 1 }
    );

    const verification = run.verification || {};
    const maxDiff = verification.models
      ? Math.max.apply(
          null,
          Object.values(verification.models).map((item) => item.max_abs_probability_diff)
        )
      : null;

    const selectedCard =
      '<div class="card"><div class="card-head"><div class="card-title">Selected model</div>' +
      '<div class="card-sub">' + esc(models.selection_basis) + "</div></div>" +
      '<div style="font-family:Manrope,sans-serif;font-size:1.2rem;font-weight:800;color:' +
      bestModel.color + ';margin:4px 0 2px">' + esc(best.name) + "</div>" +
      '<div class="tiny muted">' + esc(metricLabel(best.criterion)) + " (CV) = <b>" +
      num(best.score, 3) + "</b></div>" +
      '<div class="mt-2">' +
      kvRows(
        METRIC_ORDER.map((metric) => [
          metricLabel(metric),
          num(bestModel.metrics[metric], 3),
        ])
      ) +
      "</div>" +
      '<div class="mt-2">' +
      (verification.passed
        ? pill("Parity verified", PALETTE.mint, "#eefaf2", "#cdeddb")
        : pill("Verification pending", PALETTE.amber, "#fff8ea", "#f4e3bd")) +
      "</div>" +
      '<div class="tiny muted" style="margin-top:8px;line-height:1.55">' +
      (maxDiff !== null
        ? "JavaScript replay matches scikit-learn over " + verification.rows +
          " records · max |Δp| = " + maxDiff.toExponential(1) + "."
        : "Run the training script to refresh verification.") +
      "</div></div>";

    return (
      hero({
        eyebrow: "Model training",
        title: "Train, compare, and persist the classifiers.",
        text:
          "Four pipelines share one leakage-safe preprocessing design. Stratified cross-validation " +
          "compares them on the training partition, then each final pipeline is scored once on the " +
          "untouched 20% test set.",
        badges: [
          "80 / 20 stratified split",
          run.cv.folds + "-fold StratifiedKFold",
          "random_state = 42",
          "Joblib persistence",
        ],
      }) +
      kpis +
      sectionHeader("Available algorithms", "Current configuration and recorded cross-validated performance") +
      '<div class="grid grid-2">' + cards + "</div>" +
      sectionHeader("Training pipeline", "Each step runs inside the Python training environment") +
      '<div class="grid grid-main-side">' +
      '<div class="card"><div class="card-head"><div class="card-title">End-to-end workflow</div>' +
      '<div class="card-sub">Applied in order by train_models.py</div></div>' +
      '<div class="timeline">' + pipeline + "</div></div>" + selectedCard + "</div>" +
      sectionHeader("Latest training results", "Completed " + dateLabel(run.trained_at)) +
      dataTable(
        ["Model", "CV ROC-AUC", "CV F1", "Accuracy", "Precision", "Recall", "F1", "ROC-AUC"],
        resultRows,
        [1, 2, 3, 4, 5, 6, 7]
      ) +
      '<div class="grid grid-main-side mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Cross-validation vs. test</div>' +
      '<div class="card-sub">F1-score by model · a gap indicates optimistic CV or sample noise</div></div>' +
      cvTestChart + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Retraining</div>' +
      '<div class="card-sub">The hosted page serves saved artifacts</div></div>' +
      '<div class="code-block">python train_models.py</div>' +
      '<div class="tiny muted" style="margin-top:10px;line-height:1.6">Training uses the local Python ' +
      "environment where scikit-learn and the dataset live. It rewrites the Joblib pipelines, " +
      "refreshes the JSON published to this site and re-runs inference parity verification.</div>" +
      '<div class="mt-2">' + pill("No retraining inside serverless", PALETTE.primary) + "</div>" +
      "</div></div>" +
      '<div class="mt-2"></div>' +
      callout(
        "<strong>Signal check.</strong> " + esc((models.signal_assessment || {}).interpretation || ""),
        "warn"
      )
    );
  }

  /* ------------------------------------------------------------------ *
   * Page: Model evaluation
   * ------------------------------------------------------------------ */
  function renderEvaluation() {
    const models = APP.models;
    const criterion = APP.ui.evaluationCriterion || models.best_model.criterion;
    const bestKey = bestKeyFor(criterion);
    const best = models.models[bestKey];

    const criterionOptions = METRIC_ORDER.map(
      (key) =>
        '<option value="' + key + '"' + (key === criterion ? " selected" : "") + ">" +
        esc(metricLabel(key)) + "</option>"
    ).join("");

    const kpis =
      '<div class="grid grid-4">' +
      metricCard({ label: "Selected model", value: best.name, small: true, sub: "CV " + esc(metricLabel(criterion)) + " " + num(best.cv[criterion].mean, 3), accent: best.color }) +
      metricCard({ label: "Test F1", value: num(best.metrics.f1, 3), sub: "Held-out patients", accent: PALETTE.coral }) +
      metricCard({ label: "Test ROC-AUC", value: num(best.metrics.roc_auc, 3), sub: "Discrimination", accent: PALETTE.primary }) +
      metricCard({ label: "Test accuracy", value: num(best.metrics.accuracy, 3), sub: best.test_samples + " patients", accent: PALETTE.amber }) +
      "</div>";

    const comparisonRows = modelList()
      .slice()
      .sort((a, b) => b.cv[criterion].mean - a.cv[criterion].mean)
      .map((model) => [
        '<span class="cell-dot" style="--dot:' + model.color + '"></span>' + esc(model.name) +
          (model.key === bestKey ? '<span class="best-tag">selected</span>' : ""),
        num(model.cv[criterion].mean, 3),
        num(model.metrics.accuracy, 3),
        num(model.metrics.precision, 3),
        num(model.metrics.recall, 3),
        num(model.metrics.f1, 3),
        num(model.metrics.roc_auc, 3),
      ]);

    const miniPanels =
      '<div class="grid grid-5">' +
      METRIC_ORDER.map((metric) => miniMetricPanel(metricLabel(metric), metric)).join("") +
      "</div>";

    const confusionCards = modelList()
      .map(
        (model) =>
          '<div class="card"><div class="card-head"><div class="card-title">' + esc(model.name) +
          '</div><div class="card-sub">Test n = ' + model.test_samples + "</div></div>" +
          confusionMatrix(model) +
          '<div class="tiny muted center" style="margin-top:8px">TN ' + model.confusion_matrix.tn +
          " · FP " + model.confusion_matrix.fp + " · FN " + model.confusion_matrix.fn +
          " · TP " + model.confusion_matrix.tp + "</div></div>"
      )
      .join("");

    const reportModel = models.models[APP.ui.reportModel] || best;
    const reportRows = reportModel.classification_report.map((row) => [
      esc(row.label),
      num(row.precision, 3),
      num(row.recall, 3),
      num(row.f1, 3),
      String(row.support),
    ]);

    const importanceModels = modelList().filter(
      (model) => model.feature_importance && model.feature_importance.length
    );
    const importanceModel =
      importanceModels.find((model) => model.key === APP.ui.importanceModel) || importanceModels[0];
    const importanceItems = importanceModel
      ? importanceModel.feature_importance
          .slice(0, 12)
          .slice()
          .reverse()
          .map((item) => ({
            label: item.feature,
            value:
              importanceModel.key === "logistic_regression"
                ? (item.value > 0 ? "+" : "") + num(item.value, 3)
                : num(item.value, 3),
            percent: (item.magnitude / Math.max.apply(null, importanceModel.feature_importance.map((i) => i.magnitude))) * 100,
            color:
              importanceModel.key === "logistic_regression"
                ? item.value > 0
                  ? PALETTE.coral
                  : PALETTE.primary
                : importanceModel.color,
          }))
      : [];

    const cvRows = modelList().map((model) => [
      '<span class="cell-dot" style="--dot:' + model.color + '"></span>' + esc(model.name),
      METRIC_ORDER.map(
        (metric) =>
          num(model.cv[metric].mean, 3) + " ± " + num(model.cv[metric].std, 3)
      ),
    ].flat());
    const cvHeaders = ["Model"].concat(METRIC_ORDER.map((metric) => metricLabel(metric)));

    const cvAucChart = groupedBars(
      modelList().map((model) => model.acronym),
      [
        {
          label: "Mean CV ROC-AUC",
          color: PALETTE.primary,
          values: modelList().map((model) => model.cv.roc_auc.mean),
        },
      ],
      { axisMax: 1 }
    );

    const reportOptions = modelList()
      .map(
        (model) =>
          '<option value="' + model.key + '"' +
          (model.key === reportModel.key ? " selected" : "") + ">" + esc(model.name) + "</option>"
      )
      .join("");
    const importanceOptions = importanceModels
      .map(
        (model) =>
          '<option value="' + model.key + '"' +
          (model.key === (importanceModel && importanceModel.key) ? " selected" : "") + ">" +
          esc(model.name) + "</option>"
      )
      .join("");

    return (
      hero({
        eyebrow: "Model evaluation",
        title: "Evidence, not impressions.",
        text:
          "Accuracy, precision, recall, F1 and ROC-AUC are computed from the held-out test partition. " +
          "Confusion matrices, ROC curves and classification reports come from the same saved predictions.",
        badges: [
          "Independent 100-patient test set",
          "5 metrics",
          "4 classifiers",
          "Parity-verified artifacts",
        ],
      }) +
      '<div class="card compact"><div class="row"><div class="field" style="max-width:330px;flex:1">' +
      '<label class="field-label" for="evaluationCriterion">Selection criterion <span class="field-unit">cross-validated</span></label>' +
      '<select class="select" id="evaluationCriterion">' + criterionOptions + "</select></div>" +
      '<div class="tiny muted" style="max-width:520px;line-height:1.55;margin-left:auto">' +
      "Model selection uses cross-validation on the training set only; the test metrics stay an " +
      "unbiased final check.</div></div></div>" +
      '<div class="mt-2"></div>' + kpis +
      sectionHeader("Model comparison", models.selection_basis) +
      dataTable(
        ["Model", "CV " + metricLabel(criterion), "Accuracy", "Precision", "Recall", "F1", "ROC-AUC"],
        comparisonRows,
        [1, 2, 3, 4, 5, 6]
      ) +
      '<div class="card mt-2"><div class="card-head"><div class="card-title">Metric-by-metric comparison</div>' +
      '<div class="card-sub">Held-out test performance · best value in each panel is highlighted</div></div>' +
      miniPanels + "</div>" +
      sectionHeader("Confusion matrices", "Decision rule: P(heart disease) ≥ 0.50 · rows are actual classes") +
      '<div class="grid grid-2">' + confusionCards + "</div>" +
      sectionHeader("ROC curves and reports", "Discrimination and per-class performance") +
      '<div class="card"><div class="card-head"><div class="card-title">Receiver operating characteristic</div>' +
      '<div class="card-sub">Test-set ROC curves with AUC</div></div>' + rocChart() + "</div>" +
      '<div class="mt-2"></div>' +
      callout(
        "A curve close to the diagonal indicates discrimination near chance. In this synthetic sample " +
          "all four AUCs are close to 0.50, which is an honest property of the data.",
        "warn"
      ) +
      '<div class="grid grid-2 mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Classification report</div>' +
      '<div class="card-sub">Per-class precision, recall and F1</div></div>' +
      '<select class="select" id="reportModel" aria-label="Classification report model">' +
      reportOptions + "</select>" +
      '<div class="mt-2"></div>' +
      dataTable(["Class", "Precision", "Recall", "F1-score", "Support"], reportRows, [1, 2, 3, 4]) +
      '<div class="tiny muted mt-2">' + esc(reportModel.name) + " · evaluated on " +
      reportModel.test_samples + " patients (" + reportModel.test_positives + " positive, " +
      reportModel.test_negatives + " negative).</div></div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Feature importance / coefficients</div>' +
      '<div class="card-sub">What each model relies on most</div></div>' +
      '<select class="select" id="importanceModel" aria-label="Feature importance model">' +
      importanceOptions + "</select>" +
      '<div class="mt-2"></div>' +
      (importanceItems.length
        ? hbars(importanceItems) +
          '<div class="tiny muted mt-2">' +
          (importanceModel.key === "logistic_regression"
            ? "Positive coefficients (coral) increase the log-odds of heart disease; negative coefficients (teal) decrease it."
            : "Impurity-based importance from the fitted tree ensemble.") +
          "</div>"
        : callout("This kernel model does not expose a native linear feature-importance ranking.")) +
      "</div></div>" +
      sectionHeader("Cross-validation", models.run.cv.folds + "-fold stratified cross-validation on the training partition") +
      dataTable(cvHeaders, cvRows) +
      '<div class="grid grid-main-side mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Cross-validated ROC-AUC</div>' +
      '<div class="card-sub">Mean across folds; the 0.50 line is chance</div></div>' + cvAucChart + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">How to read these metrics</div></div>' +
      '<div class="tiny" style="line-height:1.75;color:#4e6873">' +
      "<b>Accuracy</b> — share of all test patients classified correctly.<br>" +
      "<b>Precision</b> — of patients predicted positive, the share who actually are.<br>" +
      "<b>Recall</b> — of patients who actually have disease, the share detected.<br>" +
      "<b>F1</b> — harmonic mean of precision and recall.<br>" +
      "<b>ROC-AUC</b> — probability that a random positive patient scores above a random negative " +
      "patient. 0.5 is chance, 1.0 is perfect separation.</div></div></div>" +
      '<div class="mt-2"></div>' +
      callout(
        "<strong>Interpretation.</strong> " +
          esc((models.signal_assessment || {}).interpretation || "") +
          " The highest cross-validated ROC-AUC is <strong>" +
          num((models.signal_assessment || {}).best_cv_roc_auc, 3) + "</strong>.",
        "warn"
      )
    );
  }

  /* ------------------------------------------------------------------ *
   * Page: Prediction
   * ------------------------------------------------------------------ */
  function numericField(item) {
    const step = item.step || 1;
    let value = item.median !== undefined ? item.median : item.mean;
    value = step < 1 ? Number(value).toFixed(1) : Math.round(Number(value));
    return (
      '<div class="field" data-field="' + item.name + '">' +
      '<label class="field-label" for="field-' + item.name + '"><span>' + esc(item.label) +
      '</span><span class="field-unit">' + esc(item.unit || "") + "</span></label>" +
      '<input type="number" id="field-' + item.name + '" name="' + item.name +
      '" min="' + item.min + '" max="' + item.max + '" step="' + step + '" value="' + value +
      '" inputmode="decimal" required />' +
      '<div class="field-hint">Observed ' + item.observed_min + "–" + item.observed_max +
      " · " + esc(item.help) + "</div>" +
      '<div class="field-error">Enter a value between ' + item.min + " and " + item.max + ".</div>" +
      "</div>"
    );
  }

  function categoricalField(item) {
    const options = item.options
      .map(
        (option, index) =>
          '<label><input type="radio" name="' + item.name + '" value="' + esc(option) + '"' +
          (index === 0 ? " checked" : "") + ' /><span>' + esc(option) + "</span></label>"
      )
      .join("");
    return (
      '<div class="field" data-field="' + item.name + '">' +
      '<div class="field-label"><span>' + esc(item.label) + "</span></div>" +
      '<div class="segmented">' + options + "</div>" +
      '<div class="field-hint">' + esc(item.help) + "</div>" +
      '<div class="field-error">Choose an option.</div>' +
      "</div>"
    );
  }

  function modelSelectMarkup() {
    const models = APP.models;
    const selected = APP.ui.selectedModel || models.best_model.key;
    const options = modelList()
      .map(
        (model) =>
          '<option value="' + model.key + '"' + (model.key === selected ? " selected" : "") + ">" +
          esc(model.name) + " · test F1 " + num(model.metrics.f1, 3) + " · AUC " +
          num(model.metrics.roc_auc, 3) + "</option>"
      )
      .join("");
    const model = models.models[selected];
    return (
      '<div class="card"><div class="card-head"><div class="card-title">Classification algorithm</div>' +
      '<div class="card-sub">The saved pipeline for this model is replayed by the serverless API.</div></div>' +
      '<select class="select" id="predictionModel" aria-label="Classification algorithm">' + options +
      "</select>" +
      '<div class="row mt-2" id="predictionModelMeta">' +
      pill(model.name, model.color) +
      '<span class="tiny muted">Decision rule: P(heart disease) ≥ 0.50 · test ROC-AUC ' +
      num(model.metrics.roc_auc, 3) + "</span></div></div>"
    );
  }

  function predictionPlaceholder() {
    return (
      '<div class="card"><div class="card-head"><div class="card-title">Prediction result</div>' +
      '<div class="card-sub">Complete the form and select Predict</div></div>' +
      '<div style="display:flex;gap:14px;align-items:flex-start;padding:8px 2px 14px">' +
      '<div style="width:42px;height:42px;border-radius:12px;background:#e8f4f5;display:grid;place-items:center;font-size:1.2rem">🫀</div>' +
      '<div class="small" style="color:#4f6a75;line-height:1.65;max-width:760px">' +
      "The result will show the predicted class, the probability of each class, the decision " +
      "threshold, rule-based clinical indicators and the factors that most influenced the selected model." +
      '<br><b style="color:#35505c">Academic prototype — not a diagnosis.</b></div></div></div>'
    );
  }

  function predictionResultHTML(result) {
    const probability = result.probability;
    const prediction = result.prediction;
    const tone = prediction === 1 ? "bad" : "ok";
    const headlineColor = prediction === 1 ? "#ffd9cc" : "#c9f1ea";
    const band = result.risk_band;

    const warnings = (result.warnings || [])
      .map((warning) => '<div class="warning-item">' + esc(warning) + "</div>")
      .join("");
    const indicators = (result.clinical_indicators || [])
      .map(
        (item) =>
          '<span class="chip"><span class="dot" style="--dot:' +
          (item.severity === "high" ? PALETTE.coral : PALETTE.amber) + '"></span><b>' +
          esc(item.label) + "</b>&nbsp;·&nbsp;" + esc(item.detail) + "</span>"
      )
      .join("");
    const drivers = result.drivers || [];
    const maxDriver = drivers.reduce((acc, item) => Math.max(acc, item.strength), 0) || 1;
    const driverHTML = drivers
      .map((item) => {
        const color =
          item.basis === "patient_contribution"
            ? item.impact === "increases"
              ? PALETTE.coral
              : PALETTE.primary
            : PALETTE.blue;
        return (
          '<div class="driver"><div class="driver-head"><span>' + esc(item.feature) +
          "</span><b style=\"color:" + color + "\">" +
          (item.basis === "patient_contribution"
            ? (item.impact === "increases" ? "+" : "−") + num(item.strength, 3)
            : num(item.strength, 3)) +
          "</b></div>" +
          '<div class="driver-track"><div class="driver-fill" style="width:' +
          Math.min(100, (item.strength / maxDriver) * 100) + "%;--driver:" + color + '"></div></div></div>'
        );
      })
      .join("");

    const comparison = result.comparison
      ? dataTable(
          ["Model", "P(heart disease)", "Predicted class"],
          APP.models.model_order
            .filter((key) => result.comparison[key])
            .map((key) => {
              const entry = result.comparison[key];
              return [
                '<span class="cell-dot" style="--dot:' + modelColor(key) + '"></span>' +
                  esc(entry.name) + (key === result.model ? '<span class="best-tag">selected</span>' : ""),
                (entry.probability * 100).toFixed(1) + "%",
                entry.prediction === 1 ? "Heart disease" : "No disease",
              ];
            }),
          [1]
        )
      : "";

    const metrics = APP.models.models[result.model].metrics;

    return (
      (warnings ? '<div class="warning-list">' + warnings + "</div>" : "") +
      '<div class="result ' + tone + '">' +
      '<div class="result-label">Prediction · ' + esc(result.model_name) + "</div>" +
      '<div class="result-headline" style="color:' + headlineColor + '">' + esc(result.label) + "</div>" +
      '<div class="result-prob">' + (probability * 100).toFixed(1) +
      '<small>%</small><span class="caption">estimated probability of heart disease</span></div>' +
      '<div class="meter"><span style="width:' + (probability * 100).toFixed(1) + '%"></span></div>' +
      '<div class="result-legend"><span>0%</span><span>decision threshold 50%</span><span>100%</span></div>' +
      '<div class="result-caption"><b>' + esc(band.label) + "</b> · " + esc(band.description) + "</div>" +
      "</div>" +
      '<div class="grid grid-3 mt-2">' +
      metricCard({ label: "P(heart disease)", value: (probability * 100).toFixed(1) + "%", sub: "Class 1 probability", accent: PALETTE.coral }) +
      metricCard({ label: "P(no heart disease)", value: (result.probability_no_disease * 100).toFixed(1) + "%", sub: "Class 0 probability", accent: PALETTE.primary }) +
      metricCard({ label: "Decision", value: prediction === 1 ? "Class 1" : "Class 0", sub: "threshold " + result.threshold.toFixed(2), accent: modelColor(result.model) }) +
      "</div>" +
      '<div class="grid grid-2 mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">Model drivers</div>' +
      '<div class="card-sub">' +
      (drivers.length && drivers[0].basis === "patient_contribution"
        ? "Patient-specific log-odds contributions"
        : "Model-level feature importance") +
      "</div></div>" +
      (driverHTML ||
        '<div class="empty">No native feature-importance ranking is available for this kernel model.</div>') +
      '<div class="tiny muted mt-2">' +
      (drivers.length && drivers[0].basis === "patient_contribution"
        ? "Contribution = standardised feature value × logistic-regression coefficient. Positive values push the estimate toward heart disease."
        : "This model does not provide additive per-patient contributions; the bars show the features it relies on most overall.") +
      "</div></div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Clinical indicators</div>' +
      '<div class="card-sub">Rule-based flags · not model attribution</div></div>' +
      (indicators ||
        '<span class="chip"><span class="dot" style="--dot:' + PALETTE.mint +
          '"></span>No rule-based risk flags triggered</span>') +
      '<div class="tiny muted mt-2" style="line-height:1.6">These indicators use common clinical ' +
      "thresholds (for example systolic BP ≥ 140 mmHg, cholesterol ≥ 240 mg/dL, BMI ≥ 30 kg/m²). " +
      "They explain the input profile and are independent of the classifier's probability.</div></div></div>" +
      '<div class="grid grid-main-side mt-2">' +
      '<div class="card"><div class="card-head"><div class="card-title">All models on this patient</div>' +
      '<div class="card-sub">The same inputs scored by each saved classifier</div></div>' + comparison + "</div>" +
      '<div class="card"><div class="card-head"><div class="card-title">Model and preprocessing details</div></div>' +
      kvRows([
        ["Algorithm", esc(result.model_name)],
        ["Pipeline", "Joblib → verified arithmetic replay"],
        ["Preprocessing", "StandardScaler → OneHotEncoder"],
        ["Decision rule", "P(heart disease) ≥ 0.50"],
        ["Test accuracy", num(metrics.accuracy, 3)],
        ["Test recall", num(metrics.recall, 3)],
        ["Test ROC-AUC", num(metrics.roc_auc, 3)],
      ]) + "</div></div>" +
      '<div class="mt-2"></div>' +
      callout(
        "<strong>A probability is not a diagnosis.</strong> This estimate reflects patterns in a " +
          "500-record synthetic dataset whose discrimination is close to chance. It is an academic " +
          "demonstration of a machine-learning workflow, not a clinical tool. Do not use it for triage " +
          "or treatment decisions.",
        "coral"
      )
    );
  }

  function renderPrediction() {
    const models = APP.models;
    const schema = models.feature_schema;
    const numerical = schema.numeric.reduce((map, item) => {
      map[item.name] = item;
      return map;
    }, {});
    const categorical = schema.categorical.reduce((map, item) => {
      map[item.name] = item;
      return map;
    }, {});

    const form =
      '<form id="predictionForm" novalidate>' +
      '<div class="card"><div class="card-head"><div class="card-title">Patient information</div>' +
      '<div class="card-sub">All ten fields are required · values outside the training range produce a warning</div></div>' +
      '<div class="form-section-title">Patient profile</div>' +
      '<div class="form-grid">' + numericField(numerical.age) + categoricalField(categorical.sex) +
      numericField(numerical.stress_level) + "</div>" +
      '<div class="form-section-title">Clinical measurements</div>' +
      '<div class="form-grid">' + numericField(numerical.blood_pressure) +
      numericField(numerical.cholesterol) + numericField(numerical.bmi) + "</div>" +
      '<div class="form-section-title">Lifestyle</div>' +
      '<div class="form-grid">' + numericField(numerical.physical_activity) +
      categoricalField(categorical.smoker) + categoricalField(categorical.diabetes) + "</div>" +
      '<div class="form-section-title">History</div>' +
      '<div class="form-grid">' + categoricalField(categorical.family_history) +
      '<div class="field" style="grid-column:span 2"><div class="field-label">How this works</div>' +
      '<div class="callout" style="font-size:.76rem;line-height:1.6">Numerical inputs are standardised ' +
      "with the saved scaler and categorical inputs are one-hot encoded with the saved encoder. " +
      "No value is preprocessed by hand. The API validates the same bounds as the Streamlit form.</div></div></div>" +
      '<div class="mt-3"></div>' +
      '<button class="btn primary wide" id="predictionSubmit" type="submit">Predict heart disease risk</button>' +
      "</div></form>";

    return (
      hero({
        eyebrow: "Heart disease prediction",
        title: "Estimate risk for a single patient.",
        text:
          "Enter the ten clinical inputs used during training. The saved pipeline applies the exact " +
          "same scaling and encoding before the selected classifier returns a probability.",
        badges: [
          "Saved joblib pipelines",
          "Verified browser/API replay",
          "Probability + explanation",
          "Academic prototype",
        ],
      }) +
      modelSelectMarkup() +
      '<div class="grid grid-main-side mt-2">' +
      '<div>' + form + "</div>" +
      '<div><div id="predictionOutput">' +
      (APP.ui.predictionError
        ? '<div class="error-item">' + esc(APP.ui.predictionError) + "</div>"
        : APP.ui.predictionResult
        ? predictionResultHTML(APP.ui.predictionResult)
        : predictionPlaceholder()) +
      "</div></div></div>"
    );
  }

  /* ------------------------------------------------------------------ *
   * Page: About
   * ------------------------------------------------------------------ */
  function infoCard(title, body, accent) {
    return (
      '<div class="card"><div style="height:4px;width:46px;border-radius:999px;background:' +
      (accent || PALETTE.primary) + ';margin:2px 0 12px"></div>' +
      '<div class="card-title">' + esc(title) + "</div>" +
      '<div class="small" style="line-height:1.7;color:#4e6873;margin-top:6px">' + body + "</div></div>"
    );
  }

  function renderAbout() {
    const models = APP.models;
    const profile = APP.dataset.profile;
    const project = APP.dataset.project;

    const algorithmCards = modelList()
      .map(
        (model) =>
          '<div class="card"><div class="algorithm">' +
          '<div class="acronym" style="--acronym:' + model.color + '">' + esc(model.acronym) + "</div>" +
          '<div><div class="card-title">' + esc(model.name) + "</div>" +
          '<div class="tiny" style="text-transform:uppercase;letter-spacing:.07em;color:#8aa0a9">' +
          esc(model.family) + "</div></div></div>" +
          '<div class="small" style="line-height:1.65;color:#4e6873;margin-top:9px">' +
          esc(model.description) + "</div>" +
          '<div class="strengths" style="--accent:' + model.color + '">' + esc(model.strengths) +
          "</div></div>"
      )
      .join("");

    const stack = [
      ["Python", "Application and modelling language", PALETTE.primary],
      ["Pandas", "Tabular data loading and profiling", PALETTE.blue],
      ["NumPy", "Numerical arrays and histogramming", "#6c8ebf"],
      ["Scikit-learn", "Pipelines, models, metrics, CV", PALETTE.coral],
      ["Streamlit", "Interactive analytics application", "#e4572e"],
      ["Matplotlib", "Publication-quality static charts", PALETTE.amber],
      ["Seaborn", "Statistical visualisation layer", PALETTE.mint],
      ["Joblib", "Pipeline persistence", PALETTE.violet],
      ["Openpyxl", "Excel dataset ingestion", "#2e8b57"],
    ]
      .map(
        (item) =>
          '<div class="tech"><span class="tech-dot" style="--dot:' + item[2] + '"></span>' +
          '<div><div class="tech-name">' + esc(item[0]) + "</div>" +
          '<div class="tech-use">' + esc(item[1]) + "</div></div></div>"
      )
      .join("");

    const steps = [
      ["01", "Learn from labelled examples", "Each training record contains ten inputs and a known outcome (0 or 1). The algorithm learns a mapping from inputs to the probability of the positive class."],
      ["02", "Apply the same preprocessing", "Numerical features are standardised and categorical features are one-hot encoded. These transformations are fitted inside the pipeline on training data only, then reused for test or prediction inputs."],
      ["03", "Estimate a probability", "Logistic Regression uses a linear log-odds model, trees partition the feature space, Random Forest averages many trees, and the SVM uses a radial-basis kernel with Platt probability calibration."],
      ["04", "Apply an explicit decision rule", "Heart disease is predicted when the estimated probability is at least 0.50. The same rule is applied to test-set metrics and live predictions, so the reported numbers and the interface agree."],
    ]
      .map(
        (step) =>
          '<div class="step-card"><div class="step-num">' + step[0] + "</div>" +
          '<div class="step-title">' + esc(step[1]) + "</div>" +
          '<div class="step-body">' + esc(step[2]) + "</div></div>"
      )
      .join("");

    return (
      hero({
        eyebrow: "About the project",
        title: project.title || "Heart Disease Prediction System",
        text:
          "An academic machine-learning system that estimates heart-disease probability from ten " +
          "clinical inputs, compares four classifiers and exposes the whole workflow through a " +
          "healthcare analytics interface.",
        badges: [
          project.author || "Academic Machine Learning Project",
          "Version " + (project.version || "1.0.0"),
          "Python · scikit-learn · Streamlit",
          "Synthetic hospital data",
        ],
      }) +
      sectionHeader("Project objective", "What the system is designed to demonstrate") +
      '<div class="grid grid-main-side">' +
      '<div class="card"><div class="small" style="line-height:1.8;color:#3d5763">' +
      "The objective is to build a complete, reproducible classification pipeline that learns from a " +
      "synthetic hospital dataset and estimates whether a patient is likely to have heart disease. " +
      "The project covers the full applied machine-learning lifecycle: data inspection, leakage-safe " +
      "preprocessing, model training, stratified cross-validation, independent testing, persistence " +
      "and interactive deployment.</div>" +
      '<div class="grid grid-2 mt-2">' +
      '<div class="card compact" style="box-shadow:none"><div class="tiny muted">Learning type</div><div class="strong mt-1">Supervised classification</div></div>' +
      '<div class="card compact" style="box-shadow:none"><div class="tiny muted">Target</div><div class="strong mt-1">heart_disease (0 / 1)</div></div>' +
      '<div class="card compact" style="box-shadow:none"><div class="tiny muted">Records</div><div class="strong mt-1">' +
      profile.shape.rows + " patients · " + profile.feature_count + " features</div></div>" +
      '<div class="card compact" style="box-shadow:none"><div class="tiny muted">Evaluation</div><div class="strong mt-1">Stratified 80/20 hold-out</div></div>' +
      "</div></div>" +
      '<div class="stack">' +
      infoCard("Dataset", "The real <b>hospital_synthetic_dataset.xlsx</b> supplied with the project: 500 observations, 11 columns, no missing values. Ten independent variables and one binary target. No replacement or generated data is used.", PALETTE.blue) +
      infoCard("Algorithms", "Logistic Regression, Decision Tree, Random Forest and Support Vector Machine — each wrapped in the same preprocessing pipeline and compared under identical stratified cross-validation.", PALETTE.coral) +
      "</div></div>" +
      sectionHeader("The four classifiers", "Different inductive biases, one evaluation protocol") +
      '<div class="grid grid-4">' + algorithmCards + "</div>" +
      sectionHeader("Technology stack", "Open-source tools used end to end") +
      '<div class="tech-grid">' + stack + "</div>" +
      sectionHeader("What is classification?", "From features to a probability") +
      '<div class="steps">' + steps + "</div>" +
      sectionHeader("Methodology and integrity", "Choices that keep the evaluation trustworthy") +
      '<div class="grid grid-2">' +
      '<div class="stack">' +
      infoCard("Leakage-safe preprocessing", "StandardScaler and OneHotEncoder live inside a scikit-learn Pipeline. During cross-validation they are fitted separately on each training fold; for the final evaluation they are fitted only on the training split. The test partition never influences scaling or encoding.") +
      infoCard("Model selection", "Algorithms are compared with stratified 5-fold cross-validation on the training data. The default ranking criterion is F1-score; the interface allows switching between accuracy, precision, recall, F1 and ROC-AUC. Test metrics are never used to choose the model.", PALETTE.blue) +
      infoCard("Persistence and parity", "Fitted pipelines are stored with Joblib and loaded by the Streamlit app. For the serverless Vercel edition, the same pipelines are exported to a compact arithmetic representation and verified against scikit-learn predictions on all 500 records.", PALETTE.violet) +
      "</div><div class=\"stack\">" +
      infoCard("Reproducibility", "The split, cross-validation folds and every estimator use random_state=42. Dependencies and the training timestamp are recorded in the artifact metadata, and training can be repeated with <code>python train_models.py</code>.", PALETTE.amber) +
      infoCard("Honest reporting", "All metrics shown in this application come from actual model evaluation on the provided file. The synthetic sample has very weak feature–target association, so discrimination is close to chance. Those values are displayed unchanged.", PALETTE.coral) +
      infoCard("Current artifacts", "Trained " + dateLabel(models.run.trained_at) + " · " +
        modelList().length + " pipelines · selected model: <b>" + esc(models.best_model.name) +
        "</b> · training time " + models.run.duration_seconds.toFixed(1) + "s.", PALETTE.mint) +
      "</div></div>" +
      '<div class="mt-2"></div>' +
      callout(
        "<strong>Limitations and responsible use.</strong> This is an academic prototype trained on a " +
          "synthetic 500-record dataset. It has not been externally validated, calibrated on real " +
          "patients, or reviewed as a medical device. Predictions must not be used for diagnosis, " +
          "triage or treatment. A real deployment would require a representative clinical cohort, " +
          "prospective validation, fairness auditing, calibration analysis, privacy safeguards and " +
          "regulatory review.",
        "coral"
      ) +
      sectionHeader("Project structure", "How the repository is organised") +
      '<div class="code-block">Heart-disease-prediction/\n' +
      "├── app.py                     # Streamlit entry point\n" +
      "├── train_models.py            # Reproducible training CLI\n" +
      "├── heart_ml/                  # Data, preprocessing, modelling, export, validation\n" +
      "├── views/                     # Six Streamlit pages + shared design system\n" +
      "├── artifacts/                 # Joblib pipelines, metrics, inference bundle\n" +
      "├── public/                    # Static Vercel frontend and published data\n" +
      "├── api/                       # Dependency-free serverless prediction endpoint\n" +
      "├── hospital_synthetic_dataset.xlsx\n" +
      "└── requirements.txt</div>" +
      '<div class="tiny muted mt-2">' + esc(project.title || "") + " · " +
      esc(project.author || "") + " · " + esc(project.institution || "") + "</div>"
    );
  }

  /* ------------------------------------------------------------------ *
   * Prediction form behaviour
   * ------------------------------------------------------------------ */
  function bindPrediction() {
    const modelSelect = document.getElementById("predictionModel");
    if (modelSelect) {
      modelSelect.addEventListener("change", function () {
        APP.ui.selectedModel = modelSelect.value;
        const model = APP.models.models[modelSelect.value];
        const meta = document.getElementById("predictionModelMeta");
        if (meta) {
          meta.innerHTML =
            pill(model.name, model.color) +
            '<span class="tiny muted">Decision rule: P(heart disease) ≥ 0.50 · test ROC-AUC ' +
            num(model.metrics.roc_auc, 3) + "</span>";
        }
      });
    }

    const form = document.getElementById("predictionForm");
    if (form) {
      form.addEventListener("submit", submitPrediction);
    }
  }

  async function submitPrediction(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const schema = APP.models.feature_schema;
    const patient = {};
    let valid = true;

    schema.numeric.forEach((item) => {
      const field = form.querySelector('[data-field="' + item.name + '"]');
      const input = form.querySelector('[name="' + item.name + '"]');
      const raw = input ? input.value.trim() : "";
      const value = Number(raw);
      const bad =
        raw === "" ||
        !Number.isFinite(value) ||
        value < item.min ||
        value > item.max;
      if (field) field.classList.toggle("invalid", bad);
      if (bad) {
        valid = false;
      } else {
        patient[item.name] = value;
      }
    });

    schema.categorical.forEach((item) => {
      const field = form.querySelector('[data-field="' + item.name + '"]');
      const selected = form.querySelector('input[name="' + item.name + '"]:checked');
      const bad = !selected;
      if (field) field.classList.toggle("invalid", bad);
      if (bad) {
        valid = false;
      } else {
        patient[item.name] = selected.value;
      }
    });

    if (!valid) {
      toast("Please correct the highlighted fields.");
      return;
    }

    const button = document.getElementById("predictionSubmit");
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> Scoring patient…';
    }
    APP.ui.predictionError = null;

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: APP.ui.selectedModel,
          patient: patient,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        const message =
          payload.error +
          (payload.errors && payload.errors.length
            ? " " + payload.errors.join(" ")
            : "") +
          (payload.warnings && payload.warnings.length
            ? " " + payload.warnings.join(" ")
            : "");
        APP.ui.predictionResult = null;
        APP.ui.predictionError = message || "The prediction request failed.";
      } else {
        APP.ui.predictionResult = payload;
        APP.ui.predictionError = null;
      }
    } catch (error) {
      APP.ui.predictionResult = null;
      APP.ui.predictionError =
        "The prediction service could not be reached. When running locally, start the full app " +
        "with `vercel dev` so /api/predict is available.";
    } finally {
      APP.ui.predicting = false;
      if (button) {
        button.disabled = false;
        button.textContent = "Predict heart disease risk";
      }
      const output = document.getElementById("predictionOutput");
      if (output) {
        output.innerHTML = APP.ui.predictionError
          ? '<div class="error-item">' + esc(APP.ui.predictionError) + "</div>"
          : predictionResultHTML(APP.ui.predictionResult);
        output.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Binding & routing
   * ------------------------------------------------------------------ */
  function bindTabs() {
    document.querySelectorAll("[data-tabs]").forEach((strip) => {
      const container = strip.parentElement;
      strip.querySelectorAll(".tab").forEach((button) => {
        button.addEventListener("click", () => {
          strip.querySelectorAll(".tab").forEach((item) => {
            item.classList.toggle("active", item === button);
          });
          container.querySelectorAll(".tab-panel").forEach((panel) => {
            panel.hidden = panel.dataset.panel !== button.dataset.tab;
          });
          if (strip.dataset.tabs === "dataset") {
            APP.ui.datasetTab = button.dataset.tab;
          }
        });
      });
    });
  }

  function afterRender() {
    bindTabs();

    const dashboardCriterion = document.getElementById("dashboardCriterion");
    if (dashboardCriterion) {
      dashboardCriterion.addEventListener("change", () => {
        APP.ui.dashboardCriterion = dashboardCriterion.value;
        renderRoute();
      });
    }

    const featureSelect = document.getElementById("featureSelect");
    if (featureSelect) {
      featureSelect.addEventListener("change", () => {
        APP.ui.datasetFeature = featureSelect.value;
        renderRoute();
      });
    }

    const categorySelect = document.getElementById("categorySelect");
    if (categorySelect) {
      categorySelect.addEventListener("change", () => {
        APP.ui.datasetCategory = categorySelect.value;
        renderRoute();
      });
    }

    const evaluationCriterion = document.getElementById("evaluationCriterion");
    if (evaluationCriterion) {
      evaluationCriterion.addEventListener("change", () => {
        APP.ui.evaluationCriterion = evaluationCriterion.value;
        renderRoute();
      });
    }

    const reportModel = document.getElementById("reportModel");
    if (reportModel) {
      reportModel.addEventListener("change", () => {
        APP.ui.reportModel = reportModel.value;
        renderRoute();
      });
    }

    const importanceModel = document.getElementById("importanceModel");
    if (importanceModel) {
      importanceModel.addEventListener("change", () => {
        APP.ui.importanceModel = importanceModel.value;
        renderRoute();
      });
    }

    if (APP.route === "prediction") {
      bindPrediction();
    }
  }

  const RENDERERS = {
    dashboard: renderDashboard,
    dataset: renderDataset,
    training: renderTraining,
    evaluation: renderEvaluation,
    prediction: renderPrediction,
    about: renderAbout,
  };

  function currentRoute() {
    const raw = (window.location.hash || "").replace(/^#\/?/, "").split("?")[0];
    return Object.prototype.hasOwnProperty.call(RENDERERS, raw) ? raw : "dashboard";
  }

  function renderRoute() {
    if (!APP.dataset) return;
    APP.route = currentRoute();
    document.querySelectorAll(".nav-item").forEach((link) => {
      link.classList.toggle("active", link.dataset.route === APP.route);
    });
    const title = document.getElementById("topbarTitle");
    if (title) title.textContent = ROUTE_TITLES[APP.route];
    const view = document.getElementById("view");
    if (!view) return;
    try {
      view.innerHTML = RENDERERS[APP.route]();
      afterRender();
      window.scrollTo(0, 0);
    } catch (error) {
      view.innerHTML =
        '<div class="card"><div class="card-title">This page could not be rendered</div>' +
        '<div class="error-item mt-2">' + esc(error.message) + "</div></div>";
    }
  }

  function hydrateChrome() {
    const models = APP.models;
    const best = models.best_model;
    const bestModel = models.models[best.key];
    const dataset = APP.dataset;
    const verification = models.run.verification || {};

    const status = document.getElementById("sideStatus");
    if (status) {
      status.innerHTML =
        '<div class="side-status-row"><span class="k">Models</span><span class="v">' +
        modelList().length + " trained</span></div>" +
        '<div class="side-status-row"><span class="k">Selected</span><span class="v">' +
        esc(best.name) + "</span></div>" +
        '<div class="side-status-row"><span class="k">Test F1</span><span class="v">' +
        num(bestModel.metrics.f1, 3) + "</span></div>" +
        '<div class="side-status-row"><span class="k">Updated</span><span class="v">' +
        dateLabel(models.run.trained_at).replace(" UTC", "") + "</span></div>";
    }

    const sideVersion = document.getElementById("sideVersion");
    if (sideVersion) {
      sideVersion.textContent =
        "CardioCare v" + (dataset.project.version || "1.0.0") + " · web edition";
    }

    const pillNode = document.getElementById("topStatusPill");
    if (pillNode) {
      pillNode.innerHTML =
        '<span class="dot"></span> ' + modelList().length + " models · " +
        (verification.passed ? "parity verified" : "verification pending");
    }
  }

  function bindChrome() {
    const menuButton = document.getElementById("menuButton");
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("sidebarScrim");

    function closeSidebar() {
      if (sidebar) sidebar.classList.remove("open");
      if (scrim) scrim.hidden = true;
      if (menuButton) menuButton.setAttribute("aria-expanded", "false");
    }

    if (menuButton && sidebar && scrim) {
      menuButton.addEventListener("click", () => {
        const open = sidebar.classList.toggle("open");
        scrim.hidden = !open;
        menuButton.setAttribute("aria-expanded", open ? "true" : "false");
      });
      scrim.addEventListener("click", closeSidebar);
    }

    document.querySelectorAll(".nav-item").forEach((link) => {
      link.addEventListener("click", closeSidebar);
    });
  }

  async function boot() {
    bindChrome();
    try {
      const responses = await Promise.all([
        fetch("data/dataset.json", { cache: "no-cache" }),
        fetch("data/models.json", { cache: "no-cache" }),
        fetch("data/training.json", { cache: "no-cache" }),
      ]);
      if (responses.some((response) => !response.ok)) {
        throw new Error("A published data file could not be loaded.");
      }
      const payloads = await Promise.all(responses.map((response) => response.json()));
      APP.dataset = payloads[0];
      APP.models = payloads[1];
      APP.training = payloads[2];

      const criterion = APP.models.best_model.criterion || "f1";
      APP.ui.dashboardCriterion = criterion;
      APP.ui.evaluationCriterion = criterion;
      APP.ui.reportModel = APP.models.best_model.key;
      APP.ui.importanceModel = APP.models.best_model.key;
      APP.ui.selectedModel = APP.models.best_model.key;

      hydrateChrome();
      window.addEventListener("hashchange", renderRoute);
      renderRoute();
    } catch (error) {
      const view = document.getElementById("view");
      if (view) {
        view.innerHTML =
          '<div class="card"><div class="card-title">The workspace could not be loaded</div>' +
          '<div class="error-item mt-2">' + esc(error.message) + "</div>" +
          '<div class="small muted mt-2">Run <code>python train_models.py</code> to publish the ' +
          "dataset and model artifacts, then reload this page.</div></div>";
      }
      const status = document.getElementById("topStatusPill");
      if (status) status.innerHTML = '<span class="dot" style="background:#e4572e"></span> Offline';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
