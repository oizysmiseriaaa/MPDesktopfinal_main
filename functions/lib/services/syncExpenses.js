"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncExpensesFromSheet = syncExpensesFromSheet;
const googleSheets = require("./googleSheets");
const route_helpers_1 = require("../lib/route-helpers");
const sync_helpers_1 = require("../lib/sync-helpers");
// ponytail: synchronize Expenses Record section from Master Sheet → Firestore `expenses`.
const EXPENSE_SECTION_TITLE = 'Expenses Record';
exports.EXPENSE_SECTION_TITLE = EXPENSE_SECTION_TITLE;
const SUPPORTED_EXPENSE_CATEGORIES = [
    'Utilities',
    'Repairs',
    'Supplies',
    'Rent',
    'Agent Commission',
    'Other Expenses',
    'Shared Expense',
    'Staff Salaries / Wages',
];
const EXPENSE_COLUMN_ALIASES = {
    expenseId: ['expense id', 'expenseid', 'firestore expense id', 'document id', 'id'],
    title: ['title', 'expense title', 'expense name', 'name', 'particulars', 'description'],
    // The August booking worksheet uses Supplier as the transaction's only title.
    supplier: ['supplier', 'vendor', 'payee'],
    category: ['category', 'expense category', 'type'],
    amount: ['amount', 'expense amount', 'total amount', 'cost', 'price'],
    amountMode: ['amount mode', 'amount type', 'allocation mode'],
    frequency: ['frequency', 'expense frequency', 'recurrence'],
    date: ['date', 'expense date', 'transaction date', 'paid date'],
    recurringDay: ['recurring day', 'recurrence day', 'day of month'],
    unitIds: ['unit ids', 'unitids', 'units', 'affected units'],
    unitId: ['unit id', 'unitid'],
    unitName: ['unit', 'unit name', 'unit number', 'room number', 'property unit'],
    description: ['details', 'receipt details', 'long description', 'memo'],
    status: ['status', 'payment status', 'paid status'],
    agentId: ['agent id', 'agentid'],
    agentName: ['agent', 'agent name'],
    bookingId: ['booking id', 'bookingid'],
    commissionStatus: ['commission status', 'release status'],
    paymentMethod: ['payment method', 'type of payment', 'method', 'mode of payment'],
    notes: ['notes', 'remarks', 'comment', 'comments'],
    recordedByName: ['recorded by', 'recorded by name', 'entered by'],
    recordedByEmail: ['recorded by email', 'recorder email'],
};
exports.EXPENSE_COLUMN_ALIASES = EXPENSE_COLUMN_ALIASES;
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
    const nextRow = values[titleRowIndex + 1] || [];
    const titleHeaderMap = (0, sync_helpers_1.buildHeaderIndexMap)(titleRow, EXPENSE_COLUMN_ALIASES);
    const nextHeaderMap = (0, sync_helpers_1.buildHeaderIndexMap)(nextRow, EXPENSE_COLUMN_ALIASES);
    const titleScore = Object.keys(titleHeaderMap).length;
    const nextScore = Object.keys(nextHeaderMap).length;
    // Some monthly worksheets put summary pivot labels on the section title
    // row. Choose the adjacent row when it is the more complete expense
    // header, rather than treating those summary labels as transaction fields.
    if (nextScore > titleScore) {
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
function readExpenseDataRows(values, headerRowIndex, keyColumnIndex = 0) {
    const rows = [];
    for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
        const row = values[rowIndex] || [];
        if (googleSheets.isRowEmpty(row, keyColumnIndex))
            break;
        if ((0, sync_helpers_1.isOtherSectionBoundaryRow)(row, EXPENSE_SECTION_TITLE))
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
            const normalized = (0, sync_helpers_1.normalizeHeaderLabel)(String(name));
            byName.set(normalized, unit);
            // Sheet labels may pad a unit number (S3T1-0372) while the
            // Firestore unit uses the same identifier without padding
            // (S3T1-372). Preserve the source label but resolve its unit ID.
            byName.set(normalized.replace(/\d+/g, (digits) => String(Number(digits))), unit);
        });
    });
    return { byId, byName };
}
function buildAgentLookup(agents) {
    const byId = new Map();
    const byName = new Map();
    agents.forEach((agent) => {
        byId.set(String(agent.id), agent);
        if (agent.name) {
            byName.set((0, sync_helpers_1.normalizeHeaderLabel)(String(agent.name)), agent);
        }
    });
    return { byId, byName };
}
function resolveUnitToken(token, unitLookup) {
    const trimmed = String(token ?? '').trim();
    if (!trimmed)
        return null;
    if (unitLookup.byId.has(trimmed))
        return trimmed;
    const normalized = (0, sync_helpers_1.normalizeHeaderLabel)(trimmed);
    const byName = unitLookup.byName.get(normalized) || unitLookup.byName.get(normalized.replace(/\d+/g, (digits) => String(Number(digits))));
    return byName?.id ? String(byName.id) : null;
}
function parseUnitIds(row, headerIndexMap, unitLookup) {
    const resolved = [];
    const directUnitId = getCell(row, headerIndexMap.unitId);
    if (directUnitId) {
        const id = resolveUnitToken(directUnitId, unitLookup);
        if (id)
            resolved.push(id);
    }
    const unitsCell = getCell(row, headerIndexMap.unitIds);
    if (unitsCell) {
        unitsCell
            .split(/[,;|]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((token) => {
            const id = resolveUnitToken(token, unitLookup);
            if (id)
                resolved.push(id);
        });
    }
    const unitNameCell = getCell(row, headerIndexMap.unitName);
    if (unitNameCell) {
        const id = resolveUnitToken(unitNameCell, unitLookup);
        if (id)
            resolved.push(id);
    }
    return [...new Set(resolved)];
}
function parseAmountMode(value) {
    const raw = (0, sync_helpers_1.normalizeHeaderLabel)(value);
    if (raw.includes('per unit') || raw.includes('per_unit') || raw === 'perunit') {
        return 'per_unit';
    }
    return 'total';
}
function parseFrequency(value) {
    const raw = (0, sync_helpers_1.normalizeHeaderLabel)(value);
    if (raw.includes('recurring') || raw.includes('monthly') || raw.includes('repeat')) {
        return 'recurring';
    }
    return 'one_time';
}
function parseStatus(value, fallback = 'Paid') {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw)
        return fallback;
    return raw === 'paid' || raw === 'yes' || raw === 'complete' ? 'Paid' : 'Unpaid';
}
function resolveExpenseCategory(rawCategory, fields = {}) {
    const source = String(rawCategory ?? '').trim();
    const normalized = (0, sync_helpers_1.normalizeHeaderLabel)(source).replace(/[^a-z0-9]/g, '');
    const directCategories = {
        utilities: 'Utilities',
        utility: 'Utilities',
        electricbill: 'Utilities',
        waterbill: 'Utilities',
        repairs: 'Repairs',
        repair: 'Repairs',
        supplies: 'Supplies',
        supply: 'Supplies',
        rent: 'Rent',
        agentcommission: 'Agent Commission',
        commission: 'Agent Commission',
        otherexpenses: 'Other Expenses',
        otherexpense: 'Other Expenses',
        sharedexpense: 'Shared Expense',
        sharedexpenses: 'Shared Expense',
        staffsalarieswages: 'Staff Salaries / Wages',
        staffsalarywages: 'Staff Salaries / Wages',
        salary: 'Staff Salaries / Wages',
        wages: 'Staff Salaries / Wages',
    };
    if (directCategories[normalized]) {
        return { category: directCategories[normalized], ambiguous: false };
    }
    // Only infer a category when the transaction's own source fields provide
    // clear evidence. Otherwise retain it as the explicit catch-all category.
    const evidence = [fields.title, fields.supplier, fields.description, fields.unitName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    if (/\b(rent|rental|lease)\b/.test(evidence))
        return { category: 'Rent', ambiguous: false };
    if (/\b(salary|salaries|wage|payroll|tuition)\b/.test(evidence))
        return { category: 'Staff Salaries / Wages', ambiguous: false };
    if (/\b(commission|agent)\b/.test(evidence))
        return { category: 'Agent Commission', ambiguous: false };
    if (/\b(electric|electricity|water|internet|wifi|utility)\b/.test(evidence))
        return { category: 'Utilities', ambiguous: false };
    if (/\b(repair|maintenance|construction|hardware)\b/.test(evidence))
        return { category: 'Repairs', ambiguous: false };
    if (/\b(supply|supplies|grocery|materials)\b/.test(evidence))
        return { category: 'Supplies', ambiguous: false };
    if (/\b(shared)\b/.test(evidence))
        return { category: 'Shared Expense', ambiguous: false };
    return { category: 'Other Expenses', ambiguous: Boolean(source) };
}
function buildExpenseSyncKey(fields) {
    const sourceWorksheet = String(fields.sourceWorksheet || '').trim();
    const title = String(fields.title || '').trim().toLowerCase();
    const date = String(fields.date || '').trim();
    const category = String(fields.category || '').trim().toLowerCase();
    const amount = String((0, route_helpers_1.toNumber)(fields.amount));
    const unitIds = Array.isArray(fields.unitIds)
        ? [...fields.unitIds].map(String).sort().join(',')
        : '';
    const sourceRow = String(fields.sourceRow || '').trim();
    if (!title || !date)
        return '';
    if (sourceRow)
        return sourceWorksheet
            ? `sheet-expense-row|${sourceWorksheet}|${sourceRow}`
            : `sheet-expense-row|${sourceRow}`;
    return `${title}|${date}|${category}|${amount}|${unitIds}|${sourceRow}`;
}
function buildLegacyExpenseSyncKey(fields) {
    const title = String(fields.title || '').trim().toLowerCase();
    const date = String(fields.date || '').trim();
    const category = String(fields.category || '').trim().toLowerCase();
    if (!title || !date)
        return '';
    return `${title}|${date}|${category}`;
}
function buildExpenseLookupMaps(expenses) {
    const byId = new Map();
    const bySyncKey = new Map();
    const byLegacySyncKey = new Map();
    expenses.forEach((expense) => {
        const id = String(expense.id || '');
        if (id)
            byId.set(id, expense);
        const syncKey = buildExpenseSyncKey(expense);
        if (syncKey)
            bySyncKey.set(syncKey, expense);
        const legacySyncKey = buildLegacyExpenseSyncKey(expense);
        if (id.startsWith('sheet-expense-') && legacySyncKey && !byLegacySyncKey.has(legacySyncKey))
            byLegacySyncKey.set(legacySyncKey, expense);
    });
    return { byId, bySyncKey, byLegacySyncKey };
}
function buildLegacyExpenseSourceKey(fields) {
    return buildExpenseSyncKey({ ...fields, sourceWorksheet: '' });
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
function resolveUnitName(unitIds, unitLookup, fallback = '') {
    if (!unitIds.length)
        return fallback || 'General/Unassigned';
    const names = unitIds
        .map((id) => unitLookup.byId.get(id)?.name || unitLookup.byId.get(id)?.unitNumber || id)
        .filter(Boolean);
    return names.length ? names.join(', ') : fallback || 'General/Unassigned';
}
function parseExpenseRow(row, headerIndexMap, unitLookup, agentLookup, sourceRow) {
    // Supplier is the authoritative transaction label when this sheet has no
    // dedicated expense-title column. Never reject otherwise valid expenses
    // merely because that optional column is absent.
    const title = getCell(row, headerIndexMap.title) || getCell(row, headerIndexMap.supplier);
    const rawCategory = getCell(row, headerIndexMap.category);
    const amount = (0, route_helpers_1.toNumber)(getCell(row, headerIndexMap.amount));
    const amountMode = parseAmountMode(getCell(row, headerIndexMap.amountMode));
    const frequency = parseFrequency(getCell(row, headerIndexMap.frequency));
    const date = parseSheetDate(getCell(row, headerIndexMap.date));
    const recurringDayRaw = getCell(row, headerIndexMap.recurringDay);
    const recurringDay = recurringDayRaw ? (0, route_helpers_1.clampInt)(recurringDayRaw, 1, 31) : undefined;
    const unitIds = parseUnitIds(row, headerIndexMap, unitLookup);
    const sourceUnitName = getCell(row, headerIndexMap.unitName);
    const unitName = /^(shared|general)(\s+expense)?$/i.test(sourceUnitName)
        ? 'General/Unassigned'
        : sourceUnitName || resolveUnitName(unitIds, unitLookup);
    const categoryResolution = resolveExpenseCategory(rawCategory, {
        title,
        supplier: getCell(row, headerIndexMap.supplier),
        description: getCell(row, headerIndexMap.description),
        unitName,
    });
    let agentId = getCell(row, headerIndexMap.agentId);
    const agentName = getCell(row, headerIndexMap.agentName);
    let resolvedAgentName = agentName;
    if (!agentId && agentName) {
        const agent = agentLookup.byName.get((0, sync_helpers_1.normalizeHeaderLabel)(agentName));
        if (agent?.id)
            agentId = String(agent.id);
        resolvedAgentName = agent?.name || agentName;
    }
    else if (agentId && agentLookup.byId.has(agentId)) {
        resolvedAgentName = agentLookup.byId.get(agentId)?.name || agentName;
    }
    const body = {
        title,
        category: categoryResolution.category,
        categoryAmbiguous: categoryResolution.ambiguous,
        amount,
        amountMode,
        frequency,
        date,
        recurringDay,
        unitIds,
        description: getCell(row, headerIndexMap.description),
        status: parseStatus(getCell(row, headerIndexMap.status)),
        notes: getCell(row, headerIndexMap.notes),
        unitName,
        paymentMethod: getCell(row, headerIndexMap.paymentMethod) || 'CASH',
        recordedByName: getCell(row, headerIndexMap.recordedByName),
        recordedByEmail: getCell(row, headerIndexMap.recordedByEmail),
        expenseIdFromSheet: getCell(row, headerIndexMap.expenseId),
        sourceRow,
    };
    // Firestore rejects undefined field values. This sheet has no recurring
    // day for one-time transactions, so omit the optional field entirely.
    if (recurringDay === undefined)
        delete body.recurringDay;
    if (agentId)
        body.agentId = agentId;
    if (resolvedAgentName)
        body.agentName = resolvedAgentName;
    const bookingId = getCell(row, headerIndexMap.bookingId);
    if (bookingId)
        body.bookingId = bookingId;
    const commissionStatus = getCell(row, headerIndexMap.commissionStatus);
    if (commissionStatus)
        body.commissionStatus = commissionStatus;
    if (unitIds.length === 1)
        body.unitId = unitIds[0];
    return body;
}
function validateParsedExpense(parsed) {
    if (!parsed.title) {
        return 'Missing expense title.';
    }
    if (!parsed.date) {
        return 'Missing or invalid expense date.';
    }
    if (!Number.isFinite(parsed.amount) || parsed.amount < 0) {
        return 'Invalid expense amount.';
    }
    if (parsed.amountMode === 'per_unit' && parsed.unitIds.length === 0) {
        return 'amountMode is per_unit but no units could be resolved.';
    }
    return null;
}
async function syncExpensesFromSheet(options = {}) {
    const stats = (0, sync_helpers_1.createSyncStats)();
    const startedAt = Date.now();
    console.log('[syncExpenses] Synchronization started.');
    const db = (0, route_helpers_1.getDb)();
    const rangeA1 = options.rangeA1 || 'A1:ZZ5000';
    const sheetRead = await googleSheets.readRange(rangeA1, options.spreadsheetId, options.worksheetName, options.worksheetGid);
    const values = sheetRead.values;
    const sectionMatch = googleSheets.findHeader(values, EXPENSE_SECTION_TITLE);
    if (!sectionMatch) {
        throw new Error(`[syncExpenses] Section "${EXPENSE_SECTION_TITLE}" not found in worksheet.`);
    }
    const { headerRowIndex, headerRow } = resolveSectionHeaderRow(values, sectionMatch);
    const headerIndexMap = (0, sync_helpers_1.buildHeaderIndexMap)(headerRow, EXPENSE_COLUMN_ALIASES);
    const keyColumnIndex = headerIndexMap.title
        ?? headerIndexMap.date
        ?? headerIndexMap.amount
        ?? 0;
    const dataRows = readExpenseDataRows(values, headerRowIndex, keyColumnIndex);
    const [units, agents, existingExpenses] = await Promise.all([
        (0, route_helpers_1.getCollection)('units'),
        (0, route_helpers_1.getCollection)('agents'),
        (0, route_helpers_1.getCollection)('expenses'),
    ]);
    const unitLookup = buildUnitLookup(units);
    const agentLookup = buildAgentLookup(agents);
    const expenseLookup = buildExpenseLookupMaps(existingExpenses);
    const pendingWrites = [];
    const categoryTotals = {};
    const ambiguousCategoryRecords = [];
    const duplicateRecords = [];
    const seenSourceIdentities = new Set();
    let totalAmountDetected = 0;
    for (const { rowIndex, row } of dataRows) {
        try {
            const parsed = parseExpenseRow(row, headerIndexMap, unitLookup, agentLookup, rowIndex + 1);
            const validationError = validateParsedExpense(parsed);
            if (validationError) {
                stats.skipped += 1;
                stats.invalidRows = (stats.invalidRows || 0) + 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: validationError });
                continue;
            }
            totalAmountDetected += parsed.amount;
            const categoryStats = categoryTotals[parsed.category] || { count: 0, amount: 0 };
            categoryStats.count += 1;
            categoryStats.amount += parsed.amount;
            categoryTotals[parsed.category] = categoryStats;
            if (parsed.categoryAmbiguous) {
                ambiguousCategoryRecords.push({
                    row: rowIndex + 1,
                    title: parsed.title,
                    sourceCategory: getCell(row, headerIndexMap.category),
                    resolvedCategory: parsed.category,
                    reason: 'Unrecognized source category; no reliable field evidence for a supported category.',
                });
            }
            if (parsed.categoryAmbiguous && options.excludeAmbiguousExpenses) {
                stats.skipped += 1;
                stats.manualReview = (stats.manualReview || 0) + 1;
                stats.skippedRecords.push({
                    row: rowIndex + 1,
                    reason: 'Manual review required: ambiguous expense category.',
                });
                continue;
            }
            let normalized;
            try {
                normalized = (0, route_helpers_1.normalizeExpenseInput)(parsed);
                // The normalizer preserves this optional field as undefined;
                // remove it before constructing a Firestore document.
                if (normalized.recurringDay === undefined)
                    delete normalized.recurringDay;
            }
            catch (err) {
                stats.skipped += 1;
                stats.skippedRecords.push({
                    row: rowIndex + 1,
                    reason: err?.message || 'Failed to normalize expense row.',
                });
                continue;
            }
            const { unitCount, calculatedTotal } = (0, route_helpers_1.computeExpenseTotals)(normalized);
            const sourceWorksheet = sheetRead.worksheetTitle;
            const syncKey = buildExpenseSyncKey({ ...normalized, sourceRow: parsed.sourceRow, sourceWorksheet });
            if (syncKey && seenSourceIdentities.has(syncKey)) {
                duplicateRecords.push({ row: rowIndex + 1, title: parsed.title, reason: 'Duplicate Google Sheet source identity.' });
                stats.skipped += 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: 'Duplicate Google Sheet source identity.' });
                continue;
            }
            if (syncKey)
                seenSourceIdentities.add(syncKey);
            let existing = null;
            let docId = '';
            if (parsed.expenseIdFromSheet && expenseLookup.byId.has(parsed.expenseIdFromSheet)) {
                existing = expenseLookup.byId.get(parsed.expenseIdFromSheet);
                docId = parsed.expenseIdFromSheet;
            }
            else if (parsed.expenseIdFromSheet) {
                docId = parsed.expenseIdFromSheet;
            }
            else if (syncKey && expenseLookup.bySyncKey.has(syncKey)) {
                existing = expenseLookup.bySyncKey.get(syncKey);
                docId = String(existing.id);
            }
            // August existed before worksheet-aware identities. Only the
            // configured legacy worksheet may claim those row-only records.
            else if (options.legacyWorksheetName === sourceWorksheet &&
                expenseLookup.bySyncKey.has(buildLegacyExpenseSourceKey({ ...normalized, sourceRow: parsed.sourceRow }))) {
                existing = expenseLookup.bySyncKey.get(buildLegacyExpenseSourceKey({ ...normalized, sourceRow: parsed.sourceRow }));
                docId = String(existing.id);
            }
            else {
                // Claim a pre-fix record once and update it in place. This
                // prevents legacy zero-amount records from becoming duplicates.
                const legacySyncKey = options.legacyWorksheetName === sourceWorksheet
                    ? buildLegacyExpenseSyncKey(parsed)
                    : '';
                const legacy = legacySyncKey ? expenseLookup.byLegacySyncKey.get(legacySyncKey) : null;
                if (legacy) {
                    existing = legacy;
                    docId = String(legacy.id);
                    expenseLookup.byLegacySyncKey.delete(legacySyncKey);
                }
                else if (syncKey) {
                    docId = (0, sync_helpers_1.buildDeterministicId)('sheet-expense', syncKey);
                }
                else {
                    stats.skipped += 1;
                    stats.skippedRecords.push({ row: rowIndex + 1, reason: 'Unable to derive expense document id.' });
                    continue;
                }
            }
            const payload = {
                ...normalized,
                unitCount,
                calculatedTotal,
                sourceRow: parsed.sourceRow,
                sourceWorksheet,
            };
            // Do not turn the new provenance field itself into a change for
            // pre-existing August documents that use the former row-only key.
            if (existing && !existing.sourceWorksheet)
                delete payload.sourceWorksheet;
            if (parsed.unitName)
                payload.unitName = parsed.unitName;
            if (parsed.paymentMethod)
                payload.paymentMethod = parsed.paymentMethod;
            if (parsed.recordedByName)
                payload.recordedByName = parsed.recordedByName;
            if (parsed.recordedByEmail) {
                payload.recordedByEmail = parsed.recordedByEmail;
                payload.recordedBy = parsed.recordedByEmail;
            }
            const syncFieldKeys = Object.keys(payload);
            const docRef = db.collection('expenses').doc(docId);
            if (!existing) {
                const createPayload = {
                    ...payload,
                    id: docId,
                    createdAt: new Date().toISOString(),
                };
                pendingWrites.push({ type: 'set', ref: docRef, data: createPayload, options: { merge: false } });
                stats.imported += 1;
                expenseLookup.byId.set(docId, createPayload);
                if (syncKey)
                    expenseLookup.bySyncKey.set(syncKey, createPayload);
                continue;
            }
            const changedFields = pickChangedFields(existing, payload, syncFieldKeys);
            if (!Object.keys(changedFields).length) {
                stats.skipped += 1;
                stats.alreadyExisting = (stats.alreadyExisting || 0) + 1;
                stats.skippedRecords.push({ row: rowIndex + 1, reason: 'No changes detected.' });
                continue;
            }
            stats.skipped += 1;
            stats.skippedRecords.push({
                row: rowIndex + 1,
                reason: 'Existing record with changes: manual review required.',
            });
            stats.changesRequiringReview = (stats.changesRequiringReview || 0) + 1;
            stats.changedRecords = stats.changedRecords || [];
            stats.changedRecords.push({
                row: rowIndex + 1,
                worksheet: sourceWorksheet,
                id: existing.id || docId,
                fields: Object.keys(changedFields),
            });
        }
        catch (err) {
            stats.failed += 1;
            stats.failedRecords.push({
                row: rowIndex + 1,
                error: err?.message || String(err),
            });
            console.error(`[syncExpenses] Row ${rowIndex + 1} failed:`, err);
        }
    }
    await (0, sync_helpers_1.commitBatchWrites)(db, pendingWrites);
    const durationMs = Date.now() - startedAt;
    console.log('[syncExpenses] Synchronization finished.', {
        imported: stats.imported,
        updated: stats.updated,
        skipped: stats.skipped,
        failed: stats.failed,
        durationMs,
    });
    return {
        ...stats,
        durationMs,
        section: EXPENSE_SECTION_TITLE,
        worksheetTitle: sheetRead.worksheetTitle,
        rowsProcessed: dataRows.length,
        totalAmountDetected,
        categoryTotals,
        ambiguousCategoryRecords,
        duplicateRecords,
        changesRequiringReview: stats.changesRequiringReview || 0,
        changedRecords: stats.changedRecords || [],
        alreadyExisting: stats.alreadyExisting || 0,
        invalidRows: stats.invalidRows || 0,
        manualReview: stats.manualReview || 0,
    };
}
