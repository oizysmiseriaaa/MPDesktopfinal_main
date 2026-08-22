"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUnitsFromSheet = syncUnitsFromSheet;
const googleSheets = require("./googleSheets");
const route_helpers_1 = require("../lib/route-helpers");
const sync_helpers_1 = require("../lib/sync-helpers");
// ponytail: synchronize Units section from Master Sheet → Firestore `units`.
const UNIT_SECTION_TITLES = ['Unit Record', 'Units Record', 'Units'];
exports.UNIT_SECTION_TITLES = UNIT_SECTION_TITLES;
const UNIT_COLUMN_ALIASES = {
    unitId: ['unit id', 'unitid', 'firestore unit id', 'document id', 'id'],
    unitNumber: ['unit number', 'unit no', 'unit #', 'unit number/name'],
    name: ['unit name', 'name', 'unit'],
    property: ['property', 'property name', 'building', 'property type', 'type'],
    capacity: ['capacity', 'max capacity', 'occupancy', 'max occupancy'],
    rate: ['nightly rate', 'rate', 'rate per night', 'nightly', 'price per night'],
    status: ['status', 'unit status', 'availability'],
    extraGuestFee: ['extra guest fee', 'extra guest charge'],
    wifiNetwork: ['wifi network', 'wifi name', 'wifi ssid'],
    wifiPassword: ['wifi password', 'wifi pass'],
};
exports.UNIT_COLUMN_ALIASES = UNIT_COLUMN_ALIASES;
function getCell(row, index) {
    if (index === undefined || index < 0)
        return '';
    return String(row[index] ?? '').trim();
}
function resolveSectionHeaderRow(values, sectionMatch) {
    const titleRowIndex = sectionMatch.rowIndex;
    const titleRow = values[titleRowIndex] || [];
    const nonEmptyTitleCells = titleRow.filter((cell) => String(cell ?? '').trim()).length;
    const nextRow = values[titleRowIndex + 1] || [];
    const nonEmptyNextCells = nextRow.filter((cell) => String(cell ?? '').trim()).length;
    if (nonEmptyTitleCells <= 2 && nonEmptyNextCells >= 3) {
        return {
            headerRowIndex: titleRowIndex + 1,
            headerRow: nextRow.map((cell) => String(cell ?? '').trim()),
        };
    }
    return {
        headerRowIndex: titleRowIndex,
        headerRow: titleRow.map((cell) => String(cell ?? '').trim()),
    };
}
function findUnitSection(values) {
    for (const title of UNIT_SECTION_TITLES) {
        const match = googleSheets.findHeader(values, title);
        if (match)
            return match;
    }
    return null;
}
function readUnitDataRows(values, headerRowIndex, keyColumnIndex = 0) {
    const rows = [];
    const currentSection = UNIT_SECTION_TITLES[0];
    for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
        const row = values[rowIndex] || [];
        if (googleSheets.isRowEmpty(row, keyColumnIndex))
            break;
        if ((0, sync_helpers_1.isOtherSectionBoundaryRow)(row, currentSection))
            break;
        rows.push({ rowIndex, row });
    }
    return rows;
}
function buildUnitLookup(units) {
    const byId = new Map();
    const byName = new Map();
    units.forEach((unit) => {
        const id = String(unit.id || '');
        if (id)
            byId.set(id, unit);
        [unit.name, unit.unitNumber, unit.title]
            .filter(Boolean)
            .forEach((label) => {
            byName.set((0, sync_helpers_1.normalizeHeaderLabel)(String(label)), unit);
        });
    });
    return { byId, byName };
}
function buildUnitSyncKey(fields) {
    const label = String(fields.unitNumber || fields.name || '').trim().toLowerCase();
    if (!label)
        return '';
    return label;
}
function pickChangedFields(before, after, keys) {
    const changed = {};
    keys.forEach((key) => {
        if ((0, route_helpers_1.stableStringify)(before?.[key]) !== (0, route_helpers_1.stableStringify)(after[key])) {
            changed[key] = after[key];
        }
    });
    return changed;
}
function parseInteger(value, fallback = 0) {
    const n = parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : fallback;
}
function parseUnitRow(row, headerIndexMap) {
    const unitNumber = getCell(row, headerIndexMap.unitNumber);
    const name = getCell(row, headerIndexMap.name) || unitNumber;
    const property = getCell(row, headerIndexMap.property) || 'Unit';
    const capacity = parseInteger(getCell(row, headerIndexMap.capacity), 2);
    const rate = (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.rate));
    const status = getCell(row, headerIndexMap.status);
    const extraGuestFee = (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.extraGuestFee));
    const parsed = {
        unitIdFromSheet: getCell(row, headerIndexMap.unitId),
        unitNumber: unitNumber || name,
        name: name || unitNumber,
        type: property,
        property,
        capacity,
        maxOccupancy: capacity,
        baseOccupancy: capacity,
        rate,
        extraGuestFee,
    };
    if (status)
        parsed.status = status;
    const wifiNetwork = getCell(row, headerIndexMap.wifiNetwork);
    const wifiPassword = getCell(row, headerIndexMap.wifiPassword);
    if (wifiNetwork)
        parsed.wifiNetwork = wifiNetwork;
    if (wifiPassword)
        parsed.wifiPassword = wifiPassword;
    return parsed;
}
function validateParsedUnit(parsed) {
    if (!parsed.name && !parsed.unitNumber) {
        return 'Missing unit number or unit name.';
    }
    if (!Number.isFinite(parsed.capacity) || parsed.capacity < 0) {
        return 'Invalid capacity.';
    }
    if (!Number.isFinite(parsed.rate) || parsed.rate < 0) {
        return 'Invalid nightly rate.';
    }
    return null;
}
function buildFirestoreUnitPayload(parsed) {
    const payload = {
        name: parsed.name || parsed.unitNumber,
        unitNumber: parsed.unitNumber || parsed.name,
        type: parsed.type || parsed.property || 'Unit',
        capacity: parsed.capacity,
        maxOccupancy: parsed.maxOccupancy,
        baseOccupancy: parsed.baseOccupancy,
        rate: parsed.rate,
        extraGuestFee: parsed.extraGuestFee || 0,
    };
    if (parsed.status)
        payload.status = parsed.status;
    if (parsed.wifiNetwork)
        payload.wifiNetwork = parsed.wifiNetwork;
    if (parsed.wifiPassword)
        payload.wifiPassword = parsed.wifiPassword;
    return payload;
}
async function syncUnitsFromSheet(options = {}) {
    const stats = (0, sync_helpers_1.createSyncStats)();
    const startedAt = Date.now();
    console.log('[syncUnits] Synchronization started.');
    const db = (0, route_helpers_1.getDb)();
    const rangeA1 = options.rangeA1 || 'A1:ZZ5000';
    const sheetRead = await googleSheets.readRange(rangeA1, options.spreadsheetId, options.worksheetName, options.worksheetGid);
    const values = sheetRead.values;
    const sectionMatch = findUnitSection(values);
    if (!sectionMatch) {
        throw new Error(`[syncUnits] Section "${UNIT_SECTION_TITLES.join('" or "')}" not found in worksheet.`);
    }
    const { headerRowIndex, headerRow } = resolveSectionHeaderRow(values, sectionMatch);
    const headerIndexMap = (0, sync_helpers_1.buildHeaderIndexMap)(headerRow, UNIT_COLUMN_ALIASES);
    const keyColumnIndex = headerIndexMap.unitNumber
        ?? headerIndexMap.name
        ?? headerIndexMap.unitId
        ?? 0;
    const dataRows = readUnitDataRows(values, headerRowIndex, keyColumnIndex);
    const existingUnits = await (0, route_helpers_1.getCollection)('units');
    const unitLookup = buildUnitLookup(existingUnits);
    const pendingWrites = [];
    for (const { rowIndex, row } of dataRows) {
        try {
            const parsed = parseUnitRow(row, headerIndexMap);
            const validationError = validateParsedUnit(parsed);
            if (validationError) {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: validationError });
                continue;
            }
            const payload = buildFirestoreUnitPayload(parsed);
            const syncKey = buildUnitSyncKey(parsed);
            let existing = null;
            let docId = '';
            const nameKey = (0, sync_helpers_1.normalizeHeaderLabel)(parsed.unitNumber || parsed.name);
            if (parsed.unitIdFromSheet && unitLookup.byId.has(parsed.unitIdFromSheet)) {
                existing = unitLookup.byId.get(parsed.unitIdFromSheet);
                docId = parsed.unitIdFromSheet;
            }
            else if (parsed.unitIdFromSheet) {
                docId = parsed.unitIdFromSheet;
            }
            else if (nameKey && unitLookup.byName.has(nameKey)) {
                existing = unitLookup.byName.get(nameKey);
                docId = String(existing.id);
            }
            else if (syncKey) {
                docId = (0, sync_helpers_1.buildDeterministicId)('sheet-unit', syncKey);
            }
            else {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: 'Unable to derive unit document id.' });
                continue;
            }
            const syncFieldKeys = Object.keys(payload);
            const docRef = db.collection('units').doc(docId);
            if (!existing) {
                const createPayload = {
                    ...payload,
                    id: docId,
                    calendars: {
                        airbnb: '',
                        bookingCom: '',
                        direct: '',
                    },
                    source: 'google-sheet-sync',
                };
                pendingWrites.push({ type: 'set', ref: docRef, data: createPayload, options: { merge: false } });
                stats.imported += 1;
                unitLookup.byId.set(docId, createPayload);
                unitLookup.byName.set(nameKey, createPayload);
                continue;
            }
            const changedFields = pickChangedFields(existing, payload, syncFieldKeys);
            if (!Object.keys(changedFields).length) {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: 'No changes detected.' });
                continue;
            }
            const updatePayload = {
                ...changedFields,
                id: existing.id || docId,
            };
            pendingWrites.push({ type: 'set', ref: docRef, data: updatePayload, options: { merge: true } });
            stats.updated += 1;
        }
        catch (err) {
            stats.failed += 1;
            stats.failedRecords.push({
                row: rowIndex + 1,
                error: err?.message || String(err),
            });
            console.error(`[syncUnits] Row ${rowIndex + 1} failed:`, err);
        }
    }
    await (0, sync_helpers_1.commitBatchWrites)(db, pendingWrites);
    const durationMs = Date.now() - startedAt;
    console.log('[syncUnits] Synchronization finished.', {
        imported: stats.imported,
        updated: stats.updated,
        skipped: stats.skipped,
        failed: stats.failed,
        durationMs,
    });
    return {
        ...stats,
        durationMs,
        section: sectionMatch.matchText,
        worksheetTitle: sheetRead.worksheetTitle,
        rowsProcessed: dataRows.length,
    };
}
