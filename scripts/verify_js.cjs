/**
 * Verify the JavaScript inference engine against the scikit-learn reference.
 *
 * Usage:
 *   node scripts/verify_js.cjs
 */

const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const { predictProbability, validatePatient, BUNDLE } = require(
  path.join(root, "api", "_engine.js")
);

const reference = JSON.parse(
  fs.readFileSync(path.join(root, "artifacts", "parity_reference.json"), "utf8")
);

const tolerance = 1e-8;
let overall = true;
const rows = reference.rows;

console.log(
  `JavaScript inference parity over ${rows.length} patient records (tolerance ${tolerance}):`
);

for (const [key, expected] of Object.entries(reference.models)) {
  let maxDiff = 0;
  let labelMismatches = 0;

  rows.forEach((row, index) => {
    const probability = predictProbability(key, row);
    maxDiff = Math.max(maxDiff, Math.abs(probability - expected.probability[index]));
    const label = probability >= 0.5 ? 1 : 0;
    if (label !== expected.prediction[index]) {
      labelMismatches += 1;
    }
  });

  const passed = maxDiff <= tolerance && labelMismatches === 0;
  overall = overall && passed;
  console.log(
    `  ${passed ? "PASS" : "FAIL"}  ${key.padEnd(22)} ` +
      `max |dp| = ${maxDiff.toExponential(3)}, label mismatches = ${labelMismatches}`
  );
}

// Also prove that the shared validation layer accepts the real rows.
const sample = rows[0];
const validation = validatePatient(sample);
if (!validation.valid) {
  overall = false;
  console.log(`  FAIL  validation rejected a real dataset row: ${validation.errors.join("; ")}`);
} else {
  console.log("  PASS  validation accepted a real dataset row");
}

console.log(`Overall: ${overall ? "PASS" : "FAIL"}`);
if (!overall) {
  process.exitCode = 1;
}
