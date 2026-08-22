"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncDepositsFromSheet = syncDepositsFromSheet;
const googleSheets = require("./googleSheets");
const route_helpers_1 = require("../lib/route-helpers");
const sync_helpers_1 = require("../lib/sync-helpers");
// ponytail: synchronize Security Deposit Record section → Firestore `security-deposits`.
const DEPOSIT_SECTION_TITLES = ['Security Deposit Record', 'Security Deposit'];
exports.DEPOSIT_SECTION_TITLES = DEPOSIT_SECTION_TITLES;
const DEPOSIT_COLUMN_ALIASES = {
    depositId: ['deposit id', 'depositid', 'security deposit id', 'document id', 'id'],
    guestName: ['guest', 'guest name', 'name'],
    bookingId: ['booking id', 'bookingid', 'firestore booking id'],
    bookingReference: ['booking', 'booking reference', 'reservation'],
    unitId: ['unit id', 'unitid', 'firestore unit id'],
    unitName: ['unit', 'unit name', 'unit number', 'property unit'],
    amount: ['deposit amount', 'amount', 'security deposit', 'deposit'],
    status: ['status', 'deposit status'],
    dateCollected: ['date collected', 'collected date', 'collection date', 'date received', 'received date', 'paid date'],
    dateRefunded: ['date refunded', 'refund date', 'refunded date'],
    type: ['type', 'transaction type', 'deposit type'],
    method: ['method', 'payment method', 'collection method'],
    refundMethod: ['refund method'],
    reference: ['reference', 'receipt no', 'receipt number'],
    refundReference: ['refund reference'],
    notes: ['notes', 'remarks', 'comment', 'comments'],
    refundNotes: ['refund notes'],
};
exports.DEPOSIT_COLUMN_ALIASES = DEPOSIT_COLUMN_ALIASES;
function getCell(row, index) {
    if (index === undefined || index < 0)
        return '';
    return String(row[index] ?? '').trim();
}
function parseSheetDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw)
        return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(raw))
        return raw.slice(0, 10);
    const slashMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (slashMatch) {
        const month = slashMatch[1].padStart(2, '0');
        const day = slashMatch[2].padStart(2, '0');
        let year = slashMatch[3];
        if (year.length === 2)
            year = `20${year}`;
        return `${year}-${month}-${day}`;
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return '';
}
function toIsoDateTime(value) {
    const dateOnly = parseSheetDate(value);
    if (!dateOnly)
        return '';
    return `${dateOnly}T00:00:00.000Z`;
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
function findDepositSection(values) {
    for (const title of DEPOSIT_SECTION_TITLES) {
        const match = googleSheets.findHeader(values, title);
        if (match)
            return match;
    }
    return null;
}
function readDepositDataRows(values, headerRowIndex, keyColumnIndex = 0) {
    const rows = [];
    const currentSection = DEPOSIT_SECTION_TITLES[0];
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
        byId.set(String(unit.id), unit);
        [unit.name, unit.unitNumber, unit.title]
            .filter(Boolean)
            .forEach((name) => {
            byName.set((0, sync_helpers_1.normalizeHeaderLabel)(String(name)), unit);
        });
    });
    return { byId, byName };
}
function buildBookingLookup(bookings) {
    const byId = new Map();
    const byGuestUnit = new Map();
    bookings.forEach((booking) => {
        const id = String(booking.id || booking.bookingId || '');
        if (id)
            byId.set(id, booking);
        const guestName = `${booking.guestFirstName || ''} ${booking.guestLastName || ''}`.trim()
            || String(booking.guestName || '').trim();
        const unitId = String(booking.unitId || '');
        if (guestName && unitId) {
            byGuestUnit.set(`${(0, sync_helpers_1.normalizeHeaderLabel)(guestName)}|${unitId}`, booking);
        }
    });
    return { byId, byGuestUnit };
}
function buildDepositLookup(deposits) {
    const byId = new Map();
    const byBookingType = new Map();
    deposits.forEach((deposit) => {
        const id = String(deposit.id || '');
        if (id)
            byId.set(id, deposit);
        const bookingId = String(deposit.bookingId || '');
        const type = String(deposit.type || 'receive');
        if (bookingId) {
            byBookingType.set(`${bookingId}|${type}`, deposit);
        }
    });
    return { byId, byBookingType };
}
function resolveUnitId(row, headerIndexMap, unitLookup, booking) {
    const directUnitId = getCell(row, headerIndexMap.unitId);
    if (directUnitId && unitLookup.byId.has(directUnitId))
        return directUnitId;
    const unitName = getCell(row, headerIndexMap.unitName);
    if (unitName) {
        const unit = unitLookup.byName.get((0, sync_helpers_1.normalizeHeaderLabel)(unitName));
        if (unit?.id)
            return String(unit.id);
    }
    return String(booking?.unitId || '');
}
function resolveBookingId(row, headerIndexMap, bookingLookup, unitId) {
    const directBookingId = getCell(row, headerIndexMap.bookingId);
    if (directBookingId && bookingLookup.byId.has(directBookingId)) {
        return { bookingId: directBookingId, booking: bookingLookup.byId.get(directBookingId) };
    }
    const guestName = getCell(row, headerIndexMap.guestName)
        || getCell(row, headerIndexMap.bookingReference);
    if (guestName && unitId) {
        const booking = bookingLookup.byGuestUnit.get(`${(0, sync_helpers_1.normalizeHeaderLabel)(guestName)}|${unitId}`);
        if (booking) {
            const bookingId = String(booking.id || booking.bookingId);
            return { bookingId, booking };
        }
    }
    return { bookingId: '', booking: null };
}
function parseDepositType(value) {
    const raw = (0, sync_helpers_1.normalizeHeaderLabel)(value);
    if (raw.includes('refund'))
        return 'refund';
    return 'receive';
}
function resolveDepositStatus(statusValue, dateRefunded, type) {
    if (dateRefunded) {
        return (0, route_helpers_1.resolveSecurityDepositStatus)({ securityDepositStatus: 'Refunded' });
    }
    const resolved = (0, route_helpers_1.resolveSecurityDepositStatus)({
        securityDepositStatus: statusValue,
        securityDeposit: { status: statusValue },
    });
    if (type === 'refund')
        return 'Refunded';
    if (resolved === 'Refunded')
        return 'Refunded';
    if (resolved === 'Received')
        return 'Paid';
    return resolved === 'Unpaid' ? 'Unpaid' : 'Paid';
}
function buildDepositSyncKey(fields) {
    const bookingId = String(fields.bookingId || '').trim();
    const type = String(fields.type || 'receive').trim();
    const amount = String((0, route_helpers_1.toNumber)(fields.amount));
    const paidAt = String(fields.paidAt || '').trim();
    if (!bookingId)
        return '';
    return `${type}|${bookingId}|${amount}|${paidAt}`;
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
function parseDepositRow(row, headerIndexMap, unitLookup, bookingLookup) {
    const provisionalUnitName = getCell(row, headerIndexMap.unitName);
    let provisionalUnitId = getCell(row, headerIndexMap.unitId);
    if (!provisionalUnitId && provisionalUnitName) {
        const unit = unitLookup.byName.get((0, sync_helpers_1.normalizeHeaderLabel)(provisionalUnitName));
        provisionalUnitId = unit?.id ? String(unit.id) : '';
    }
    const { bookingId, booking } = resolveBookingId(row, headerIndexMap, bookingLookup, provisionalUnitId);
    const unitId = resolveUnitId(row, headerIndexMap, unitLookup, booking);
    const unit = unitLookup.byId.get(unitId);
    const guestName = getCell(row, headerIndexMap.guestName)
        || `${booking?.guestFirstName || ''} ${booking?.guestLastName || ''}`.trim()
        || String(booking?.guestName || '').trim();
    const amount = (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.amount));
    const dateCollected = getCell(row, headerIndexMap.dateCollected);
    const dateRefunded = getCell(row, headerIndexMap.dateRefunded);
    const type = parseDepositType(getCell(row, headerIndexMap.type));
    const status = resolveDepositStatus(getCell(row, headerIndexMap.status), dateRefunded, type);
    const paidAt = toIsoDateTime(dateCollected) || toIsoDateTime(dateRefunded) || new Date().toISOString();
    const refundPaidAt = toIsoDateTime(dateRefunded);
    return {
        depositIdFromSheet: getCell(row, headerIndexMap.depositId),
        bookingId,
        unitId,
        unitName: provisionalUnitName || unit?.name || booking?.unitName || 'Unknown Unit',
        guestName,
        amount,
        type,
        status,
        paidAt,
        refundPaidAt,
        method: getCell(row, headerIndexMap.method) || null,
        refundMethod: getCell(row, headerIndexMap.refundMethod) || null,
        reference: getCell(row, headerIndexMap.reference) || null,
        refundReference: getCell(row, headerIndexMap.refundReference) || null,
        notes: getCell(row, headerIndexMap.notes) || null,
        refundNotes: getCell(row, headerIndexMap.refundNotes) || null,
    };
}
function validateParsedDeposit(parsed) {
    if (!parsed.bookingId) {
        return 'Unable to resolve booking for security deposit row.';
    }
    if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
        return 'Invalid deposit amount.';
    }
    if (!parsed.guestName) {
        return 'Missing guest name.';
    }
    return null;
}
function buildFirestoreDepositPayload(parsed) {
    const payload = {
        bookingId: parsed.bookingId,
        unitId: parsed.unitId,
        unitName: parsed.unitName,
        guestName: parsed.guestName,
        type: parsed.type,
        amount: parsed.amount,
        paidAt: parsed.paidAt,
        method: parsed.method,
        reference: parsed.reference,
        notes: parsed.notes,
        status: parsed.status,
        source: 'google-sheet-sync',
        managedByBooking: false,
    };
    if (parsed.refundPaidAt) {
        payload.refundPaidAt = parsed.refundPaidAt;
        payload.refundMethod = parsed.refundMethod;
        payload.refundReference = parsed.refundReference;
        payload.refundNotes = parsed.refundNotes;
        payload.status = 'Refunded';
    }
    return payload;
}
async function syncDepositsFromSheet(options = {}) {
    const stats = (0, sync_helpers_1.createSyncStats)();
    const startedAt = Date.now();
    console.log('[syncDeposits] Synchronization started.');
    const db = (0, route_helpers_1.getDb)();
    const rangeA1 = options.rangeA1 || 'A1:ZZ5000';
    const sheetRead = await googleSheets.readRange(rangeA1, options.spreadsheetId, options.worksheetName, options.worksheetGid);
    const values = sheetRead.values;
    const sectionMatch = findDepositSection(values);
    if (!sectionMatch) {
        throw new Error(`[syncDeposits] Section "${DEPOSIT_SECTION_TITLES.join('" or "')}" not found in worksheet.`);
    }
    const { headerRowIndex, headerRow } = resolveSectionHeaderRow(values, sectionMatch);
    const headerIndexMap = (0, sync_helpers_1.buildHeaderIndexMap)(headerRow, DEPOSIT_COLUMN_ALIASES);
    const keyColumnIndex = headerIndexMap.guestName
        ?? headerIndexMap.bookingId
        ?? headerIndexMap.unitName
        ?? headerIndexMap.amount
        ?? 0;
    const dataRows = readDepositDataRows(values, headerRowIndex, keyColumnIndex);
    const [units, bookings, existingDeposits] = await Promise.all([
        (0, route_helpers_1.getCollection)('units'),
        (0, route_helpers_1.getCollection)('bookings'),
        (0, route_helpers_1.getCollection)('security-deposits'),
    ]);
    const unitLookup = buildUnitLookup(units);
    const bookingLookup = buildBookingLookup(bookings);
    const depositLookup = buildDepositLookup(existingDeposits);
    const pendingWrites = [];
    for (const { rowIndex, row } of dataRows) {
        try {
            const parsed = parseDepositRow(row, headerIndexMap, unitLookup, bookingLookup);
            const validationError = validateParsedDeposit(parsed);
            if (validationError) {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: validationError });
                continue;
            }
            const payload = buildFirestoreDepositPayload(parsed);
            const syncKey = buildDepositSyncKey(payload);
            let existing = null;
            let docId = '';
            const canonicalReceiveId = `security-deposit-${parsed.bookingId}`;
            if (parsed.depositIdFromSheet && depositLookup.byId.has(parsed.depositIdFromSheet)) {
                existing = depositLookup.byId.get(parsed.depositIdFromSheet);
                docId = parsed.depositIdFromSheet;
            }
            else if (parsed.depositIdFromSheet) {
                docId = parsed.depositIdFromSheet;
            }
            else if (parsed.type === 'receive' && depositLookup.byBookingType.has(`${parsed.bookingId}|receive`)) {
                existing = depositLookup.byBookingType.get(`${parsed.bookingId}|receive`);
                docId = String(existing.id);
            }
            else if (parsed.type === 'receive') {
                docId = canonicalReceiveId;
                existing = depositLookup.byId.get(canonicalReceiveId) || null;
            }
            else if (depositLookup.byBookingType.has(`${parsed.bookingId}|refund`)) {
                existing = depositLookup.byBookingType.get(`${parsed.bookingId}|refund`);
                docId = String(existing.id);
            }
            else if (syncKey) {
                docId = (0, sync_helpers_1.buildDeterministicId)('sheet-deposit', syncKey);
            }
            else {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: 'Unable to derive security deposit document id.' });
                continue;
            }
            const syncFieldKeys = Object.keys(payload);
            const docRef = db.collection('security-deposits').doc(docId);
            const now = new Date().toISOString();
            if (!existing) {
                const createPayload = {
                    ...payload,
                    id: docId,
                    createdAt: now,
                    updatedAt: now,
                };
                pendingWrites.push({ type: 'set', ref: docRef, data: createPayload, options: { merge: false } });
                stats.imported += 1;
                depositLookup.byId.set(docId, createPayload);
                depositLookup.byBookingType.set(`${parsed.bookingId}|${parsed.type}`, createPayload);
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
                updatedAt: now,
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
            console.error(`[syncDeposits] Row ${rowIndex + 1} failed:`, err);
        }
    }
    await (0, sync_helpers_1.commitBatchWrites)(db, pendingWrites);
    const durationMs = Date.now() - startedAt;
    console.log('[syncDeposits] Synchronization finished.', {
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
