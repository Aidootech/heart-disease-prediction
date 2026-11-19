/**
 * POST /api/predict
 *
 * Body: { "model": "logistic_regression", "patient": { ...ten fields... } }
 * Response: validated prediction, class probabilities, risk band, clinical
 * indicators and model drivers. Nothing is retrained inside this function.
 */

const { predict, predictAll, validatePatient, modelCatalog, BUNDLE } = require("./_engine");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    json(res, 200, {
      ok: true,
      service: "CardioCare heart-disease prediction API",
      trained_at: BUNDLE.created_at,
      decision_rule: "Heart disease is predicted when P(heart disease) >= 0.50.",
      models: modelCatalog(),
      note: "POST { model, patient } to receive a prediction.",
    });
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed. Use POST." });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    json(res, 400, { ok: false, error: error.message });
    return;
  }

  const modelKey = body.model || (BUNDLE.model_order.includes("logistic_regression")
    ? "logistic_regression"
    : BUNDLE.model_order[0]);

  if (!BUNDLE.models[modelKey]) {
    json(res, 400, {
      ok: false,
      error: `Unknown model "${modelKey}".`,
      available: BUNDLE.model_order,
    });
    return;
  }

  const validation = validatePatient(body.patient || {});
  if (!validation.valid) {
    json(res, 422, {
      ok: false,
      error: "Validation failed.",
      errors: validation.errors,
      warnings: validation.warnings,
    });
    return;
  }

  try {
    const result = predict(modelKey, validation.values);
    const all = predictAll(validation.values);
    const comparison = Object.fromEntries(
      Object.entries(all).map(([key, value]) => [
        key,
        {
          name: value.model_name,
          probability: value.probability,
          prediction: value.prediction,
        },
      ])
    );
    json(res, 200, {
      ok: true,
      ...result,
      comparison,
      warnings: validation.warnings,
    });
  } catch (error) {
    json(res, 500, { ok: false, error: `Prediction failed: ${error.message}` });
  }
};
