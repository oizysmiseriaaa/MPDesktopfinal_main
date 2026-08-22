"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const googleSheetSync_1 = require("../services/googleSheetSync");
// ponytail: manual local runner for Master Sheet synchronization.
const envCandidates = [
  path_1.resolve(process.cwd(), ".env"),
  path_1.resolve(process.cwd(), ".env.local"),
  path_1.resolve(process.cwd(), "..", ".env"),
  path_1.resolve(process.cwd(), "..", ".env.local"),
];
for (const envPath of envCandidates) {
  (0, dotenv_1.config)({ path: envPath, override: false });
}
function hasCredentialConfigured() {
  if (
    process.env.SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT ||
    process.env.GOOGLE_SERVICE_ACCOUNT
  ) {
    return true;
  }
  const fileBasedCandidates = ["service-account.json"];
  const compromisedKeyFileName =
    "unified-booker-firebase-adminsdk-fbsvc-c376d2b0e6.json";
  try {
    for (const fileName of fs.readdirSync(process.cwd())) {
      if (
        fileName.startsWith("unified-booker-firebase-adminsdk-") &&
        fileName.endsWith(".json") &&
        fileName !== compromisedKeyFileName
      ) {
        fileBasedCandidates.push(fileName);
      }
    }
  } catch {
    // Ignore discovery errors.
  }
  const directCandidates = [
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE,
    process.env.SERVICE_ACCOUNT_FILE,
    ...fileBasedCandidates.map((fileName) =>
      path_1.resolve(process.cwd(), fileName),
    ),
  ].filter(Boolean);
  return directCandidates.some((candidate) => {
    if (!candidate) return false;
    const resolved = path_1.resolve(candidate);
    return fs.existsSync(resolved);
  });
}
async function main() {
  const dryRun =
    process.argv.includes("--dry-run") ||
    process.argv.includes("--dryRun") ||
    process.env.GOOGLE_SHEETS_DRY_RUN === "true";
  if (dryRun) {
    process.env.GOOGLE_SHEETS_DRY_RUN = "true";
    console.log(
      "[runGoogleSheetSync] Dry run enabled; Firestore writes will be skipped.",
    );
  }
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.MASTER_SHEET_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error(
      "Set GOOGLE_SHEETS_SPREADSHEET_ID before running the sync script.",
    );
  }
  if (!hasCredentialConfigured()) {
    throw new Error(
      "Set SERVICE_ACCOUNT_KEY, GOOGLE_SHEETS_SERVICE_ACCOUNT, or point GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE to a local service-account JSON before running the sync script.",
    );
  }
  const worksheetGidRaw =
    process.env.GOOGLE_SHEETS_WORKSHEET_GID ||
    process.env.MASTER_SHEET_WORKSHEET_GID;
  const worksheetGid = worksheetGidRaw
    ? parseInt(String(worksheetGidRaw).trim(), 10)
    : undefined;
  const worksheetNames = String(process.env.GOOGLE_SHEETS_WORKSHEETS || '')
    .split(',')
    .map((worksheetName) => worksheetName.trim())
    .filter(Boolean);
  const result = await (0, googleSheetSync_1.runGoogleSheetSync)({
    spreadsheetId,
    worksheetName:
      process.env.GOOGLE_SHEETS_WORKSHEET_NAME ||
      process.env.MASTER_SHEET_WORKSHEET_NAME,
    worksheetGid: Number.isFinite(worksheetGid) ? worksheetGid : undefined,
    worksheetNames,
    // Existing August records used the previous row-only identity. Retain
    // compatibility only for the configured legacy single worksheet.
    legacyWorksheetName:
      process.env.GOOGLE_SHEETS_WORKSHEET_NAME ||
      process.env.MASTER_SHEET_WORKSHEET_NAME,
    dryRun,
    // This worksheet contains only booking and expense sections. Keep absent
    // optional sections out of the manual production sync.
    sections: (process.env.GOOGLE_SHEETS_SYNC_SECTIONS || "bookings,expenses")
      .split(",")
      .map((section) => section.trim())
      .filter(Boolean),
  });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((err) => {
  console.error("[runGoogleSheetSync] Failed:", err);
  process.exit(1);
});
