/**
 * Export labeled phishing/legitimate samples from the 3 CSV datasets
 * into JSON files that can be used to train machine-learning models
 * (e.g. Random Forest in Python).
 *
 * Datasets used:
 *   1. Phishing_Email.csv           (~18,000+ emails)
 *   2. PhiUSIIL_Phishing_URL_Dataset.csv (~235,000+ URLs)
 *   3. zimbabwe_phishing_dataset.csv (local, ~20 rows)
 *
 * Run from the backend folder with:
 *   node export_training_data.js
 */

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const DATASETS_DIR = path.join(__dirname, "data", "datasets");
const OUT_DIR = path.join(__dirname, "data", "ml");

/**
 * Read a CSV file and return rows as an array of objects.
 * @param {string} filePath
 * @param {number} maxRows - optional cap
 */
function readCSV(filePath, maxRows = Infinity) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = fs.createReadStream(filePath)
      .pipe(csv({ bom: true }))
      .on("data", (row) => {
        if (rows.length >= maxRows) { stream.destroy(); return; }
        rows.push(row);
      })
      .on("end", () => resolve(rows))
      .on("close", () => resolve(rows))
      .on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // ─── Email samples ───────────────────────────────────────
  const emailSamples = [];

  // Dataset 1: Phishing_Email.csv  (columns: "Email Text", "Email Type")
  const emailCSV = path.join(DATASETS_DIR, "Phishing_Email.csv");
  if (fs.existsSync(emailCSV)) {
    console.log("Reading Phishing_Email.csv ...");
    const emailRows = await readCSV(emailCSV);
    for (const row of emailRows) {
      const text = row["Email Text"];
      const type = row["Email Type"];
      if (text && type) {
        emailSamples.push({
          label: type.toLowerCase().includes("phishing") ? 1 : 0,
          text: text.trim(),
          source: "Phishing_Email.csv",
        });
      }
    }
    console.log(`  → ${emailSamples.length} email samples from Phishing_Email.csv`);
  }

  // Dataset 3: zimbabwe_phishing_dataset.csv  (columns: "text", "label")
  const zwCSV = path.join(DATASETS_DIR, "zimbabwe_phishing_dataset.csv");
  if (fs.existsSync(zwCSV)) {
    console.log("Reading zimbabwe_phishing_dataset.csv ...");
    const zwRows = await readCSV(zwCSV);
    let zwCount = 0;
    for (const row of zwRows) {
      const text = row["text"];
      const label = row["label"];
      if (text && label) {
        emailSamples.push({
          label: label.toLowerCase() === "phishing" ? 1 : 0,
          text: text.trim(),
          source: "zimbabwe_phishing_dataset.csv",
        });
        zwCount++;
      }
    }
    console.log(`  → ${zwCount} email samples from zimbabwe_phishing_dataset.csv`);
  }

  // ─── URL samples ──────────────────────────────────────────
  const urlSamples = [];

  // Dataset 2: PhiUSIIL_Phishing_URL_Dataset.csv  (columns: "URL", "label")
  const urlCSV = path.join(DATASETS_DIR, "PhiUSIIL_Phishing_URL_Dataset.csv");
  if (fs.existsSync(urlCSV)) {
    console.log("Reading PhiUSIIL_Phishing_URL_Dataset.csv ...");
    const urlRows = await readCSV(urlCSV);
    for (const row of urlRows) {
      const url = row["URL"];
      const label = row["label"];
      if (url && label !== undefined) {
        urlSamples.push({
          label: parseInt(label, 10),
          url: url.trim(),
          source: "PhiUSIIL_Phishing_URL_Dataset.csv",
        });
      }
    }
    console.log(`  → ${urlSamples.length} URL samples from PhiUSIIL_Phishing_URL_Dataset.csv`);
  }

  // ─── Write output ─────────────────────────────────────────
  fs.writeFileSync(
    path.join(OUT_DIR, "email_samples.json"),
    JSON.stringify(emailSamples, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "url_samples.json"),
    JSON.stringify(urlSamples, null, 2),
    "utf8"
  );

  console.log(`\nExported email samples: ${emailSamples.length}`);
  console.log(`Exported URL samples:  ${urlSamples.length}`);
  console.log(`Output directory: ${OUT_DIR}`);
}

main().catch(console.error);
