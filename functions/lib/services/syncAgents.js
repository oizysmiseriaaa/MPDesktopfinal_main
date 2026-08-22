"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAgentsFromSheet = syncAgentsFromSheet;
const googleSheets = require("./googleSheets");
const route_helpers_1 = require("../lib/route-helpers");
const sync_helpers_1 = require("../lib/sync-helpers");
// ponytail: synchronize Agents section from Master Sheet → Firestore `agents`.
const AGENT_SECTION_TITLES = ['Agent Record', 'Agents Record', 'Agents'];
exports.AGENT_SECTION_TITLES = AGENT_SECTION_TITLES;
const AGENT_COLUMN_ALIASES = {
    agentId: ['agent id', 'agentid', 'firestore agent id', 'document id', 'id'],
    name: ['agent name', 'name', 'agent'],
    email: ['email', 'email address', 'agent email'],
    phone: ['phone', 'contact', 'contact number', 'mobile', 'agent phone'],
    commissionType: ['commission type', 'commission model', 'commission structure'],
    commissionRate: ['commission rate', 'commission %', 'commission percent', 'rate'],
    assignedUnits: ['assigned units', 'units assigned', 'units', 'unit assignment', 'assigned unit'],
    status: ['status', 'agent status'],
    joinDate: ['join date', 'date joined', 'joined date', 'start date'],
    totalBookings: ['total bookings', 'bookings'],
    totalCommissions: ['total commissions', 'commissions total'],
    notes: ['notes', 'remarks', 'comments'],
};
exports.AGENT_COLUMN_ALIASES = AGENT_COLUMN_ALIASES;
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
function findAgentSection(values) {
    for (const title of AGENT_SECTION_TITLES) {
        const match = googleSheets.findHeader(values, title);
        if (match)
            return match;
    }
    return null;
}
function readAgentDataRows(values, headerRowIndex, keyColumnIndex = 0) {
    const rows = [];
    const currentSection = AGENT_SECTION_TITLES[0];
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
    const byName = new Map();
    units.forEach((unit) => {
        [unit.name, unit.unitNumber, unit.title]
            .filter(Boolean)
            .forEach((label) => {
            byName.set((0, sync_helpers_1.normalizeHeaderLabel)(String(label)), unit);
        });
    });
    return { byName };
}
function buildAgentLookup(agents) {
    const byId = new Map();
    const byName = new Map();
    const byEmail = new Map();
    agents.forEach((agent) => {
        const id = String(agent.id || '');
        if (id)
            byId.set(id, agent);
        if (agent.name) {
            byName.set((0, sync_helpers_1.normalizeHeaderLabel)(String(agent.name)), agent);
        }
        if (agent.email) {
            byEmail.set(String(agent.email).trim().toLowerCase(), agent);
        }
    });
    return { byId, byName, byEmail };
}
function parseCommissionType(value) {
    const raw = (0, sync_helpers_1.normalizeHeaderLabel)(value);
    if (raw.includes('percent') || raw.includes('percentage') || raw.includes('%')) {
        return 'percentage';
    }
    return 'fixed_commission';
}
function parseAssignedUnitIds(value, unitLookup) {
    const raw = String(value ?? '').trim();
    if (!raw)
        return [];
    const resolved = [];
    raw
        .split(/[,;|]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((token) => {
        const unit = unitLookup.byName.get((0, sync_helpers_1.normalizeHeaderLabel)(token));
        if (unit?.id)
            resolved.push(String(unit.id));
    });
    return [...new Set(resolved)];
}
function buildAgentSyncKey(fields) {
    const name = String(fields.name || '').trim().toLowerCase();
    const email = String(fields.email || '').trim().toLowerCase();
    if (!name && !email)
        return '';
    return `${name}|${email}`;
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
function parseAgentRow(row, headerIndexMap, unitLookup) {
    const name = getCell(row, headerIndexMap.name);
    const email = getCell(row, headerIndexMap.email);
    const phone = getCell(row, headerIndexMap.phone);
    const commissionType = parseCommissionType(getCell(row, headerIndexMap.commissionType));
    const commissionRate = (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.commissionRate));
    const unitIds = parseAssignedUnitIds(getCell(row, headerIndexMap.assignedUnits), unitLookup);
    const joinDate = parseSheetDate(getCell(row, headerIndexMap.joinDate));
    const statusRaw = getCell(row, headerIndexMap.status);
    const status = statusRaw ? statusRaw.toLowerCase() : 'active';
    const parsed = {
        agentIdFromSheet: getCell(row, headerIndexMap.agentId),
        name,
        email,
        phone,
        commissionType,
        commissionRate,
        unitIds,
        joinDate,
        status,
        totalBookings: (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.totalBookings)),
        totalCommissions: (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.totalCommissions)),
        notes: getCell(row, headerIndexMap.notes),
    };
    return parsed;
}
function validateParsedAgent(parsed) {
    if (!parsed.name) {
        return 'Missing agent name.';
    }
    return null;
}
function buildFirestoreAgentPayload(parsed) {
    const payload = {
        name: parsed.name,
        email: parsed.email || '',
        phone: parsed.phone || '',
        commissionType: parsed.commissionType,
        commissionRate: parsed.commissionRate,
        status: parsed.status || 'active',
        joinDate: parsed.joinDate || new Date().toISOString().slice(0, 10),
        totalBookings: parsed.totalBookings || 0,
        totalCommissions: parsed.totalCommissions || 0,
    };
    if (parsed.unitIds.length)
        payload.unitIds = parsed.unitIds;
    if (parsed.notes)
        payload.notes = parsed.notes;
    return payload;
}
async function syncAgentsFromSheet(options = {}) {
    const stats = (0, sync_helpers_1.createSyncStats)();
    const startedAt = Date.now();
    console.log('[syncAgents] Synchronization started.');
    const db = (0, route_helpers_1.getDb)();
    const rangeA1 = options.rangeA1 || 'A1:ZZ5000';
    const sheetRead = await googleSheets.readRange(rangeA1, options.spreadsheetId, options.worksheetName, options.worksheetGid);
    const values = sheetRead.values;
    const sectionMatch = findAgentSection(values);
    if (!sectionMatch) {
        throw new Error(`[syncAgents] Section "${AGENT_SECTION_TITLES.join('" or "')}" not found in worksheet.`);
    }
    const { headerRowIndex, headerRow } = resolveSectionHeaderRow(values, sectionMatch);
    const headerIndexMap = (0, sync_helpers_1.buildHeaderIndexMap)(headerRow, AGENT_COLUMN_ALIASES);
    const keyColumnIndex = headerIndexMap.name
        ?? headerIndexMap.email
        ?? headerIndexMap.agentId
        ?? 0;
    const dataRows = readAgentDataRows(values, headerRowIndex, keyColumnIndex);
    const [units, existingAgents] = await Promise.all([
        (0, route_helpers_1.getCollection)('units'),
        (0, route_helpers_1.getCollection)('agents'),
    ]);
    const unitLookup = buildUnitLookup(units);
    const agentLookup = buildAgentLookup(existingAgents);
    const pendingWrites = [];
    for (const { rowIndex, row } of dataRows) {
        try {
            const parsed = parseAgentRow(row, headerIndexMap, unitLookup);
            const validationError = validateParsedAgent(parsed);
            if (validationError) {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: validationError });
                continue;
            }
            const payload = buildFirestoreAgentPayload(parsed);
            const syncKey = buildAgentSyncKey(parsed);
            let existing = null;
            let docId = '';
            if (parsed.agentIdFromSheet && agentLookup.byId.has(parsed.agentIdFromSheet)) {
                existing = agentLookup.byId.get(parsed.agentIdFromSheet);
                docId = parsed.agentIdFromSheet;
            }
            else if (parsed.agentIdFromSheet) {
                docId = parsed.agentIdFromSheet;
            }
            else if (parsed.email && agentLookup.byEmail.has(parsed.email.toLowerCase())) {
                existing = agentLookup.byEmail.get(parsed.email.toLowerCase());
                docId = String(existing.id);
            }
            else if (parsed.name && agentLookup.byName.has((0, sync_helpers_1.normalizeHeaderLabel)(parsed.name))) {
                existing = agentLookup.byName.get((0, sync_helpers_1.normalizeHeaderLabel)(parsed.name));
                docId = String(existing.id);
            }
            else if (syncKey) {
                docId = (0, sync_helpers_1.buildDeterministicId)('sheet-agent', syncKey);
            }
            else {
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: 'Unable to derive agent document id.' });
                continue;
            }
            const syncFieldKeys = Object.keys(payload);
            const docRef = db.collection('agents').doc(docId);
            if (!existing) {
                const createPayload = {
                    ...payload,
                    id: docId,
                };
                pendingWrites.push({ type: 'set', ref: docRef, data: createPayload, options: { merge: false } });
                stats.imported += 1;
                agentLookup.byId.set(docId, createPayload);
                if (parsed.name) {
                    agentLookup.byName.set((0, sync_helpers_1.normalizeHeaderLabel)(parsed.name), createPayload);
                }
                if (parsed.email) {
                    agentLookup.byEmail.set(parsed.email.toLowerCase(), createPayload);
                }
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
            console.error(`[syncAgents] Row ${rowIndex + 1} failed:`, err);
        }
    }
    await (0, sync_helpers_1.commitBatchWrites)(db, pendingWrites);
    const durationMs = Date.now() - startedAt;
    console.log('[syncAgents] Synchronization finished.', {
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
