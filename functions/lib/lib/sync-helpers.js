"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSyncStats = createSyncStats;
exports.normalizeHeaderLabel = normalizeHeaderLabel;
exports.buildHeaderIndexMap = buildHeaderIndexMap;
exports.commitBatchWrites = commitBatchWrites;
exports.isOtherSectionBoundaryRow = isOtherSectionBoundaryRow;
const crypto_1 = require("crypto");
// ponytail: shared helpers for Google Sheet → Firestore sync services.
const FIRESTORE_BATCH_LIMIT = 500;
const OTHER_SECTION_MARKERS = [
  "booking calendar",
  "expenses record",
  "security deposit record",
  "security deposit",
  "agent record",
  "agents record",
  "unit record",
  "units record",
];
function createSyncStats() {
  return {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    skippedRecords: [],
    failedRecords: [],
  };
}
function normalizeHeaderLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
}
function buildHeaderIndexMap(headerRow, aliasMap) {
  const normalizedHeaders = (headerRow || []).map((cell) =>
    normalizeHeaderLabel(cell),
  );
  const indexMap = {};
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const normalizedAliases = aliases.map((alias) =>
      normalizeHeaderLabel(alias),
    );
    const colIndex = normalizedHeaders.findIndex((header) =>
      normalizedAliases.some(
        (alias) => header === alias || header.includes(alias),
      ),
    );
    if (colIndex >= 0) {
      indexMap[field] = colIndex;
    }
  }
  return indexMap;
}
function isOtherSectionBoundaryRow(row, currentSectionMarker) {
  if (!Array.isArray(row)) return false;
  const rowText = row
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!rowText) return false;
  const current = normalizeHeaderLabel(currentSectionMarker);
  return OTHER_SECTION_MARKERS.some((marker) => {
    if (marker === current || rowText.includes(current)) return false;
    return rowText.includes(marker);
  });
}
async function commitBatchWrites(db, writes, options = {}) {
  if (!writes.length) return;
  if (options?.dryRun || process.env.GOOGLE_SHEETS_DRY_RUN === "true") {
    console.log(
      `[syncHelpers] Dry run enabled; skipped ${writes.length} Firestore write(s).`,
    );
    return;
  }
  for (
    let offset = 0;
    offset < writes.length;
    offset += FIRESTORE_BATCH_LIMIT
  ) {
    const chunk = writes.slice(offset, offset + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((entry) => {
      if (entry.type === "set") {
        batch.set(entry.ref, entry.data, entry.options || {});
      } else if (entry.type === "update") {
        batch.update(entry.ref, entry.data);
      }
    });
    await batch.commit();
  }
}
function buildDeterministicId(prefix, keyMaterial) {
  const hash = (0, crypto_1.createHash)("sha256")
    .update(keyMaterial)
    .digest("hex")
    .slice(0, 20);
  return `${prefix}-${hash}`;
}
exports.buildDeterministicId = buildDeterministicId;
