"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfiguredSpreadsheetId = getConfiguredSpreadsheetId;
exports.getSheetsClient = getSheetsClient;
exports.getSpreadsheet = getSpreadsheet;
exports.getWorksheet = getWorksheet;
exports.readRange = readRange;
exports.findHeader = findHeader;
exports.readUntilEmptyRow = readUntilEmptyRow;
exports.isRowEmpty = isRowEmpty;
const fs = require("fs");
const path = require("path");
const googleapis_1 = require("googleapis");
// ponytail: generic Google Sheets reader — no HostFlow business logic here.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const CREDENTIAL_ENV_KEYS = [
  "GOOGLE_SHEETS_SERVICE_ACCOUNT",
  "GOOGLE_SERVICE_ACCOUNT",
  "SERVICE_ACCOUNT_KEY",
];
const CREDENTIAL_FILE_ENV_KEYS = [
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE",
  "SERVICE_ACCOUNT_FILE",
];
const DEFAULT_CREDENTIAL_FILE_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "service-account.json"),
];
const __compromisedKeyFileName =
  "unified-booker-firebase-adminsdk-fbsvc-c376d2b0e6.json";
const __functionsDir = path.resolve(__dirname, "..", "..");
try {
  for (const fileName of fs.readdirSync(__functionsDir)) {
    if (
      fileName.startsWith("unified-booker-firebase-adminsdk-") &&
      fileName.endsWith(".json") &&
      fileName !== __compromisedKeyFileName
    ) {
      DEFAULT_CREDENTIAL_FILE_CANDIDATES.push(
        path.resolve(__functionsDir, fileName),
      );
    }
  }
} catch {
  // Ignore discovery errors; fall through to the thrown error below if nothing resolves.
}
const SPREADSHEET_ID_ENV_KEYS = [
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "MASTER_SHEET_SPREADSHEET_ID",
  "GOOGLE_SHEET_ID",
];
let sheetsClient = null;
let spreadsheetMetaCache = null;
let spreadsheetMetaCacheId = null;
/**
 * Resolve service-account JSON from Secret Manager / environment variables.
 * Never hardcodes credentials.
 */
function loadServiceAccountCredentials() {
  for (const envKey of CREDENTIAL_ENV_KEYS) {
    const raw = process.env[envKey];
    if (!raw || !String(raw).trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.client_email && parsed?.private_key) {
        return { credentials: parsed, source: envKey };
      }
      console.warn(
        `[googleSheets] ${envKey} is set but missing client_email or private_key.`,
      );
    } catch (err) {
      console.error(
        `[googleSheets] Failed to parse ${envKey}:`,
        err?.message ?? err,
      );
    }
  }
  for (const envKey of CREDENTIAL_FILE_ENV_KEYS) {
    const filePath = process.env[envKey];
    if (!filePath || !String(filePath).trim()) continue;
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(
        `[googleSheets] Credential file path from ${envKey} does not exist: ${resolvedPath}`,
      );
      continue;
    }
    try {
      const rawContents = fs.readFileSync(resolvedPath, "utf8");
      const parsed = JSON.parse(rawContents);
      if (parsed?.client_email && parsed?.private_key) {
        return { credentials: parsed, source: `file:${resolvedPath}` };
      }
      console.warn(
        `[googleSheets] ${resolvedPath} is missing client_email or private_key.`,
      );
    } catch (err) {
      console.error(
        `[googleSheets] Failed to read credential file ${resolvedPath}:`,
        err?.message ?? err,
      );
    }
  }
  for (const candidatePath of DEFAULT_CREDENTIAL_FILE_CANDIDATES) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      const rawContents = fs.readFileSync(candidatePath, "utf8");
      const parsed = JSON.parse(rawContents);
      if (parsed?.client_email && parsed?.private_key) {
        return { credentials: parsed, source: `file:${candidatePath}` };
      }
      console.warn(
        `[googleSheets] ${candidatePath} is missing client_email or private_key.`,
      );
    } catch (err) {
      console.error(
        `[googleSheets] Failed to read credential file ${candidatePath}:`,
        err?.message ?? err,
      );
    }
  }
  throw new Error(
    "[googleSheets] Service account not configured. Set GOOGLE_SHEETS_SERVICE_ACCOUNT, GOOGLE_SERVICE_ACCOUNT, SERVICE_ACCOUNT_KEY, or point GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE to a local JSON file.",
  );
}
function getConfiguredSpreadsheetId() {
  for (const envKey of SPREADSHEET_ID_ENV_KEYS) {
    const value = process.env[envKey];
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }
  throw new Error(
    "[googleSheets] Spreadsheet ID not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID (or MASTER_SHEET_SPREADSHEET_ID).",
  );
}
function getConfiguredWorksheetName() {
  const fromEnv =
    process.env.GOOGLE_SHEETS_WORKSHEET_NAME ||
    process.env.MASTER_SHEET_WORKSHEET_NAME;
  return fromEnv && String(fromEnv).trim() ? String(fromEnv).trim() : null;
}
function getConfiguredWorksheetGid() {
  const fromEnv =
    process.env.GOOGLE_SHEETS_WORKSHEET_GID ||
    process.env.MASTER_SHEET_WORKSHEET_GID;
  if (!fromEnv || !String(fromEnv).trim()) return null;
  const gid = parseInt(String(fromEnv).trim(), 10);
  return Number.isFinite(gid) ? gid : null;
}
function getSheetsClient() {
  if (!sheetsClient) {
    const { credentials, source } = loadServiceAccountCredentials();
    const auth = new googleapis_1.google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: SCOPES,
    });
    sheetsClient = googleapis_1.google.sheets({ version: "v4", auth });
    console.log(`[googleSheets] Client initialized using ${source}.`);
  }
  return sheetsClient;
}
function escapeSheetTitle(title) {
  const safe = String(title).replace(/'/g, "''");
  return `'${safe}'`;
}
function buildRangeA1(sheetTitle, a1Range) {
  const trimmed = String(a1Range || "").trim();
  if (!trimmed) throw new Error("[googleSheets] Range is required.");
  if (trimmed.includes("!")) return trimmed;
  return `${escapeSheetTitle(sheetTitle)}!${trimmed}`;
}
async function getSpreadsheet(spreadsheetId) {
  const id = spreadsheetId || getConfiguredSpreadsheetId();
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: id,
    includeGridData: false,
  });
  spreadsheetMetaCache = response.data;
  spreadsheetMetaCacheId = id;
  return response.data;
}
async function resolveWorksheet(spreadsheetId, worksheetName, worksheetGid) {
  const id = spreadsheetId || getConfiguredSpreadsheetId();
  const requestedName = worksheetName || getConfiguredWorksheetName();
  const requestedGid = worksheetGid ?? getConfiguredWorksheetGid();
  let meta = spreadsheetMetaCache;
  if (!meta || spreadsheetMetaCacheId !== id) {
    meta = await getSpreadsheet(id);
  }
  const sheetList = meta.sheets || [];
  if (!sheetList.length) {
    throw new Error(`[googleSheets] Spreadsheet ${id} has no worksheets.`);
  }
  if (requestedGid !== null && requestedGid !== undefined) {
    const matchByGid = sheetList.find(
      (entry) => entry.properties?.sheetId === requestedGid,
    );
    if (!matchByGid?.properties) {
      throw new Error(
        `[googleSheets] Worksheet gid ${requestedGid} not found in spreadsheet ${id}.`,
      );
    }
    return matchByGid.properties;
  }
  if (requestedName) {
    const match = sheetList.find(
      (entry) => entry.properties?.title === requestedName,
    );
    if (!match?.properties) {
      throw new Error(
        `[googleSheets] Worksheet "${requestedName}" not found in spreadsheet ${id}.`,
      );
    }
    return match.properties;
  }
  const first = sheetList[0]?.properties;
  if (!first?.title) {
    throw new Error(
      `[googleSheets] Unable to resolve default worksheet for spreadsheet ${id}.`,
    );
  }
  return first;
}
async function getWorksheet(spreadsheetId, worksheetName, worksheetGid) {
  return resolveWorksheet(spreadsheetId, worksheetName, worksheetGid);
}
async function readRange(rangeA1, spreadsheetId, worksheetName, worksheetGid) {
  const id = spreadsheetId || getConfiguredSpreadsheetId();
  const worksheet = await resolveWorksheet(id, worksheetName, worksheetGid);
  const title = worksheet.title;
  if (!title) throw new Error("[googleSheets] Worksheet title is missing.");
  const fullRange = buildRangeA1(title, rangeA1);
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: fullRange,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return {
    spreadsheetId: id,
    worksheetTitle: title,
    range: fullRange,
    values: response.data.values || [],
  };
}
/**
 * Scan a 2D values grid for a header label (e.g. "Booking Calendar").
 * Returns row index, column index, and the full header row cells.
 */
function findHeader(values, headerText, options = {}) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }
  const needleRaw = String(headerText ?? "").trim();
  if (!needleRaw) return null;
  const exact = Boolean(options.exact);
  const caseInsensitive = options.caseInsensitive !== false;
  const needle = caseInsensitive ? needleRaw.toLowerCase() : needleRaw;
  const searchRows = Array.isArray(options.searchRows)
    ? options.searchRows
    : null;
  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    if (searchRows && !searchRows.includes(rowIndex)) continue;
    const row = values[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const cellText = String(row[colIndex] ?? "").trim();
      if (!cellText) continue;
      const haystack = caseInsensitive ? cellText.toLowerCase() : cellText;
      const matched = exact ? haystack === needle : haystack.includes(needle);
      if (matched) {
        return {
          rowIndex,
          colIndex,
          headerRow: row.map((cell) => String(cell ?? "").trim()),
          matchText: cellText,
        };
      }
    }
  }
  return null;
}
function isRowEmpty(row, keyColumnIndex = 0) {
  if (!Array.isArray(row) || !row.length) return true;
  const keyCell = String(row[keyColumnIndex] ?? "").trim();
  if (keyCell) return false;
  return row.every((cell) => String(cell ?? "").trim() === "");
}
/**
 * Read consecutive data rows until the first empty row.
 * `startRowIndex` is the first data row (typically header row index + 1).
 */
function readUntilEmptyRow(values, startRowIndex, keyColumnIndex = 0) {
  if (!Array.isArray(values) || startRowIndex < 0) {
    return [];
  }
  const rows = [];
  for (let rowIndex = startRowIndex; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    if (isRowEmpty(row, keyColumnIndex)) break;
    rows.push(row);
  }
  return rows;
}
