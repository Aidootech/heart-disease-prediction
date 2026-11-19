/**
 * Dependency-free inference engine for the Vercel deployment.
 *
 * The trained scikit-learn pipelines are exported to model_data.json and the
 * exact arithmetic (standardisation, one-hot encoding, tree traversal with
 * float32 feature values, libsvm Platt calibration) is replayed here.
 *
 * Parity with scikit-learn is verified over all 500 patient records by
 * scripts/verify_js.cjs. This module never trains anything.
 */

const BUNDLE = require("./model_data.json");

const BOUNDS = {
  age: [18, 100],
  blood_pressure: [70, 250],
  cholesterol: [100, 600],
  bmi: [10, 60],
  physical_activity: [0, 7],
  stress_level: [1, 10],
};

const LABELS = {
  age: "Age",
  blood_pressure: "Blood Pressure",
  cholesterol: "Cholesterol",
  bmi: "BMI",
  physical_activity: "Physical Activity",
  stress_level: "Stress Level",
  sex: "Sex",
  smoker: "Smoking Status",
  diabetes: "Diabetes",
  family_history: "Family History",
};

const UNITS = {
  age: "years",
  blood_pressure: "mmHg",
  cholesterol: "mg/dL",
  bmi: "kg/m²",
  physical_activity: "sessions/week",
  stress_level: "score",
};

const CATEGORY_OPTIONS = {
  sex: ["Female", "Male"],
  smoker: ["No", "Yes"],
  diabetes: ["No", "Yes"],
  family_history: ["No", "Yes"],
};

const NUMERIC = BUNDLE.preprocessing.numeric.columns;
const CATEGORICAL = BUNDLE.preprocessing.categorical.columns;

const CLINICAL_FLAGS = [
  { field: "age", test: (v) => v >= 60, label: "Older age", detail: "60 years or older", severity: "moderate" },
  { field: "blood_pressure", test: (v) => v >= 140, label: "High blood pressure", detail: "Systolic BP ≥ 140 mmHg", severity: "high" },
  { field: "blood_pressure", test: (v) => v >= 130 && v < 140, label: "Elevated blood pressure", detail: "Systolic BP 130–139 mmHg", severity: "moderate" },
  { field: "cholesterol", test: (v) => v >= 240, label: "High cholesterol", detail: "Total cholesterol ≥ 240 mg/dL", severity: "high" },
  { field: "cholesterol", test: (v) => v >= 200 && v < 240, label: "Borderline cholesterol", detail: "Total cholesterol 200–239 mg/dL", severity: "moderate" },
  { field: "bmi", test: (v) => v >= 30, label: "Obesity-range BMI", detail: "BMI ≥ 30 kg/m²", severity: "high" },
  { field: "bmi", test: (v) => v >= 25 && v < 30, label: "Overweight BMI", detail: "BMI 25–29.9 kg/m²", severity: "moderate" },
  { field: "smoker", test: (v) => v === "Yes", label: "Current smoker", detail: "Active smoking exposure", severity: "high" },
  { field: "diabetes", test: (v) => v === "Yes", label: "Diabetes", detail: "Recorded diabetes diagnosis", severity: "high" },
  { field: "physical_activity", test: (v) => v <= 1, label: "Low physical activity", detail: "≤ 1 activity session per week", severity: "moderate" },
  { field: "family_history", test: (v) => v === "Yes", label: "Family history", detail: "First-degree relative with heart disease", severity: "moderate" },
  { field: "stress_level", test: (v) => v >= 7, label: "High stress", detail: "Stress score ≥ 7 out of 10", severity: "moderate" },
];

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function sigmoid(z) {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }
  const expZ = Math.exp(z);
  return expZ / (1 + expZ);
}

/**
 * Replicate libsvm's iterative two-class multiclass_probability routine.
 * scikit-learn delegates SVC probability estimation to this exact loop.
 */
function binaryMulticlassProbability(input) {
  const q = clamp(input, 1e-7, 1 - 1e-7);
  const r01 = q;
  const r10 = 1 - q;

  const matrix = [
    [r10 * r10, -r10 * r01],
    [-r10 * r01, r01 * r01],
  ];
  const p = [0.5, 0.5];
  const eps = 0.005 / 2;

  for (let iter = 0; iter < 100; iter += 1) {
    const qp = [
      matrix[0][0] * p[0] + matrix[0][1] * p[1],
      matrix[1][0] * p[0] + matrix[1][1] * p[1],
    ];
    let pqp = p[0] * qp[0] + p[1] * qp[1];
    const maxError = Math.max(Math.abs(qp[0] - pqp), Math.abs(qp[1] - pqp));
    if (maxError < eps) {
      break;
    }
    for (let t = 0; t < 2; t += 1) {
      const diff = (-qp[t] + pqp) / matrix[t][t];
      p[t] += diff;
      pqp = (pqp + diff * (diff * matrix[t][t] + 2 * qp[t])) / (1 + diff) / (1 + diff);
      for (let j = 0; j < 2; j += 1) {
        qp[j] = (qp[j] + diff * matrix[t][j]) / (1 + diff);
        p[j] /= 1 + diff;
      }
    }
  }
  return p[1];
}

function designVector(patient) {
  const numeric = BUNDLE.preprocessing.numeric;
  const categorical = BUNDLE.preprocessing.categorical;
  const vector = [];

  for (let index = 0; index < numeric.columns.length; index += 1) {
    const value = Number(patient[numeric.columns[index]]);
    const scale = numeric.scale[index] || 1;
    vector.push((value - numeric.mean[index]) / scale);
  }

  for (let index = 0; index < categorical.columns.length; index += 1) {
    const value = String(patient[categorical.columns[index]]);
    const drop = categorical.drop_idx[index];
    const categories = categorical.categories[index];
    for (let catIndex = 0; catIndex < categories.length; catIndex += 1) {
      if (drop !== null && drop !== undefined && catIndex === drop) {
        continue;
      }
      vector.push(value === categories[catIndex] ? 1 : 0);
    }
  }
  return vector;
}

function treeProbability(tree, x) {
  let node = 0;
  while (tree.children_left[node] !== -1) {
    const feature = tree.feature[node];
    // scikit-learn casts the input matrix to float32 before traversal, while
    // thresholds stay float64. Mirroring that keeps splits on the boundary exact.
    const value = Math.fround(x[feature]);
    node = value <= tree.threshold[node]
      ? tree.children_left[node]
      : tree.children_right[node];
  }
  const values = tree.value[node];
  const total = values[0] + values[1];
  return total ? values[1] / total : 0;
}

function predictProbability(modelKey, patient) {
  const model = BUNDLE.models[modelKey];
  if (!model) {
    throw new Error(`Unknown model: ${modelKey}`);
  }
  const x = designVector(patient);

  if (model.type === "logistic") {
    let z = model.intercept[0];
    for (let index = 0; index < model.coef.length; index += 1) {
      z += model.coef[index] * x[index];
    }
    return clamp(sigmoid(z), 0, 1);
  }

  if (model.type === "tree") {
    return clamp(treeProbability(model, x), 0, 1);
  }

  if (model.type === "forest") {
    let total = 0;
    for (const tree of model.trees) {
      total += treeProbability(tree, x);
    }
    return clamp(total / model.trees.length, 0, 1);
  }

  if (model.type === "svc") {
    let decision = model.intercept[0];
    for (let index = 0; index < model.dual_coef.length; index += 1) {
      const dual = model.dual_coef[index];
      const support = model.support_vectors[index];
      let squared = 0;
      for (let j = 0; j < x.length; j += 1) {
        const diff = x[j] - support[j];
        squared += diff * diff;
      }
      decision += dual * Math.exp(-model.gamma * squared);
    }
    const argument = model.probA[0] * decision + model.probB[0];
    let q;
    if (argument > 700) {
      q = 0;
    } else if (argument < -700) {
      q = 1;
    } else {
      q = 1 / (1 + Math.exp(argument));
    }
    return clamp(binaryMulticlassProbability(q), 0, 1);
  }

  throw new Error(`Unsupported model type: ${model.type}`);
}

function riskBand(probability) {
  if (probability < 0.35) {
    return {
      key: "low",
      label: "Lower probability",
      description:
        "The model estimates a lower likelihood of heart disease for this profile. This is not a diagnosis; routine screening and clinical judgement still apply.",
    };
  }
  if (probability < 0.65) {
    return {
      key: "moderate",
      label: "Intermediate probability",
      description:
        "The model places this patient near the decision boundary. Consider additional clinical tests and a review of modifiable risk factors.",
    };
  }
  return {
    key: "high",
    label: "Higher probability",
    description:
      "The model estimates a higher likelihood of heart disease. A qualified clinician should review this result and arrange confirmatory assessment.",
  };
}

function clinicalIndicators(patient) {
  const flags = [];
  for (const flag of CLINICAL_FLAGS) {
    const value = patient[flag.field];
    if (value === undefined || value === null) {
      continue;
    }
    try {
      if (flag.test(value)) {
        flags.push({ label: flag.label, detail: flag.detail, severity: flag.severity });
      }
    } catch (error) {
      // Non-comparable values are skipped, matching the Python implementation.
    }
  }
  return flags;
}

function drivers(modelKey, patient) {
  const model = BUNDLE.models[modelKey];
  if (model.type === "logistic") {
    const x = designVector(patient);
    const contributions = BUNDLE.feature_names.map((name, index) => ({
      feature: name,
      contribution: model.coef[index] * x[index],
    }));
    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return contributions.slice(0, 5).map((item) => ({
      feature: item.feature,
      impact: item.contribution > 0 ? "increases" : "decreases",
      strength: Math.round(Math.abs(item.contribution) * 1000) / 1000,
      basis: "patient_contribution",
    }));
  }
  return (model.top_features || []).slice(0, 4).map((item) => ({
    feature: item.feature,
    impact: "associated",
    strength: Math.round(Number(item.value) * 1000) / 1000,
    basis: "global_importance",
  }));
}

function coerceCategory(name, value) {
  if (typeof value === "boolean") {
    value = value ? "Yes" : "No";
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  for (const option of CATEGORY_OPTIONS[name]) {
    if (text.toLowerCase() === option.toLowerCase()) {
      return option;
    }
  }
  const lowered = text.toLowerCase();
  if (name !== "sex") {
    if (["true", "1", "y"].includes(lowered)) {
      return "Yes";
    }
    if (["false", "0", "n"].includes(lowered)) {
      return "No";
    }
  }
  return null;
}

function validatePatient(payload) {
  const values = {};
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      valid: false,
      values: {},
      errors: ["The patient payload must be a JSON object."],
      warnings: [],
    };
  }

  for (const column of NUMERIC) {
    const raw = payload[column];
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
      errors.push(`${LABELS[column]} is required.`);
      continue;
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      errors.push(`${LABELS[column]} must be a finite number.`);
      continue;
    }
    const [lower, upper] = BOUNDS[column];
    if (number < lower || number > upper) {
      const unit = UNITS[column] ? ` ${UNITS[column]}` : "";
      errors.push(`${LABELS[column]} must be between ${lower} and ${upper}${unit}.`);
      continue;
    }
    values[column] = Math.round(number * 100) / 100;

    const observed = BUNDLE.trained_ranges[column];
    if (observed && (number < observed.min || number > observed.max)) {
      warnings.push(
        `${LABELS[column]} (${number}) is outside the observed training range ` +
          `(${observed.min}–${observed.max}); the prediction is an extrapolation.`
      );
    }
  }

  for (const column of CATEGORICAL) {
    const raw = payload[column];
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
      errors.push(`${LABELS[column]} is required.`);
      continue;
    }
    const option = coerceCategory(column, raw);
    if (option === null) {
      errors.push(`${LABELS[column]} must be one of: ${CATEGORY_OPTIONS[column].join(", ")}.`);
      continue;
    }
    values[column] = option;
  }

  return { valid: errors.length === 0, values, errors, warnings };
}

function predict(modelKey, patient) {
  const model = BUNDLE.models[modelKey];
  if (!model) {
    throw new Error(`Unknown model: ${modelKey}`);
  }
  const probability = clamp(predictProbability(modelKey, patient), 0, 1);
  const label = probability >= 0.5 ? 1 : 0;

  return {
    model: modelKey,
    model_name: model.name,
    prediction: label,
    label: label === 1 ? "Heart Disease Detected" : "No Heart Disease Detected",
    probability: Math.round(probability * 1e6) / 1e6,
    probability_no_disease: Math.round((1 - probability) * 1e6) / 1e6,
    threshold: 0.5,
    risk_band: riskBand(probability),
    drivers: drivers(modelKey, patient),
    clinical_indicators: clinicalIndicators(patient),
    inputs: patient,
  };
}

function predictAll(patient) {
  const results = {};
  for (const key of BUNDLE.model_order) {
    results[key] = predict(key, patient);
  }
  return results;
}

function modelCatalog() {
  return BUNDLE.model_order.map((key) => ({
    key,
    name: BUNDLE.models[key].name,
    acronym: BUNDLE.models[key].acronym,
    threshold: BUNDLE.models[key].threshold,
    probability_supported: BUNDLE.models[key].probability_supported,
  }));
}

module.exports = {
  predict,
  predictAll,
  predictProbability,
  validatePatient,
  clinicalIndicators,
  riskBand,
  modelCatalog,
  BUNDLE,
};
