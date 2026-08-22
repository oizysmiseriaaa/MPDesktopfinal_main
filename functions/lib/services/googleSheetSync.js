"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGoogleSheetSync = runGoogleSheetSync;
const syncBookings = require("./syncBookings");
const syncExpenses = require("./syncExpenses");
const syncDeposits = require("./syncDeposits");
const syncUnits = require("./syncUnits");
const syncAgents = require("./syncAgents");
// ponytail: shared orchestrator for Master Sheet → Firestore synchronization.
async function runSyncStep(label, fn) {
    try {
        return await fn();
    }
    catch (err) {
        const message = err?.message || String(err);
        if (/section .* not found in worksheet/i.test(message)) {
            console.log(`[googleSheetSync] ${label} is inactive for this worksheet.`);
            return {
                imported: 0, updated: 0, skipped: 0, failed: 0,
                skippedRecords: [], failedRecords: [], durationMs: 0,
                inactive: true,
            };
        }
        console.error(`[googleSheetSync] ${label} failed:`, err);
        return {
            imported: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            skippedRecords: [],
            failedRecords: [],
            durationMs: 0,
            error: message,
        };
    }
}
function summarizeSection(result) {
    return {
        detected: result.rowsProcessed || 0,
        new: result.imported || 0,
        imported: result.imported || 0,
        alreadyExisting: result.alreadyExisting || 0,
        skipped: result.skipped || 0,
        changesRequiringReview: result.changesRequiringReview || 0,
        duplicates: Array.isArray(result.duplicateRecords) ? result.duplicateRecords.length : 0,
        invalid: result.invalidRows || 0,
        failed: result.failed || 0,
        rateOnlyRowsRejected: result.rateOnlyRowsRejected || 0,
    };
}
function sumReports(reports, key) {
    return reports.reduce((total, report) => {
        const section = report[key] || {};
        Object.entries(section).forEach(([field, value]) => {
            if (typeof value === 'number')
                total[field] = (total[field] || 0) + value;
        });
        return total;
    }, {});
}
async function runSingleWorksheetSync(options = {}) {
    const startedAt = Date.now();
    const sections = new Set(options.sections || ['bookings', 'expenses', 'deposits', 'units', 'agents']);
    const skippedSection = () => ({ imported: 0, updated: 0, skipped: 0, failed: 0, skippedRecords: [], failedRecords: [], durationMs: 0, disabled: true });
    const bookings = sections.has('bookings') ? await runSyncStep('bookings', () => syncBookings.syncBookingsFromSheet(options)) : skippedSection();
    const expenses = sections.has('expenses') ? await runSyncStep('expenses', () => syncExpenses.syncExpensesFromSheet(options)) : skippedSection();
    const deposits = sections.has('deposits') ? await runSyncStep('deposits', () => syncDeposits.syncDepositsFromSheet(options)) : skippedSection();
    const units = sections.has('units') ? await runSyncStep('units', () => syncUnits.syncUnitsFromSheet(options)) : skippedSection();
    const agents = sections.has('agents') ? await runSyncStep('agents', () => syncAgents.syncAgentsFromSheet(options)) : skippedSection();
    const duration = Date.now() - startedAt;
    const result = {
        success: true,
        worksheetTitle: bookings.worksheetTitle || expenses.worksheetTitle || options.worksheetName || '',
        bookings,
        expenses,
        deposits,
        units,
        agents,
        duration,
    };
    console.log('[googleSheetSync] Worksheet synchronization finished.', {
        worksheet: result.worksheetTitle,
        duration,
        bookings: { imported: bookings.imported, updated: bookings.updated, skipped: bookings.skipped, failed: bookings.failed },
        expenses: { imported: expenses.imported, updated: expenses.updated, skipped: expenses.skipped, failed: expenses.failed },
        deposits: { imported: deposits.imported, updated: deposits.updated, skipped: deposits.skipped, failed: deposits.failed },
        units: { imported: units.imported, updated: units.updated, skipped: units.skipped, failed: units.failed },
        agents: { imported: agents.imported, updated: agents.updated, skipped: agents.skipped, failed: agents.failed },
    });
    return result;
}
async function runGoogleSheetSync(options = {}) {
    console.log('[googleSheetSync] Synchronization started.');
    const worksheetNames = Array.isArray(options.worksheetNames)
        ? options.worksheetNames.map((name) => String(name || '').trim()).filter(Boolean)
        : [];
    if (!worksheetNames.length) {
        return runSingleWorksheetSync(options);
    }
    const worksheets = [];
    for (const worksheetName of worksheetNames) {
        const result = await runSingleWorksheetSync({ ...options, worksheetName, worksheetGid: undefined });
        worksheets.push(result);
    }
    const reports = worksheets.map((worksheet) => ({
        worksheet: worksheet.worksheetTitle,
        expenses: summarizeSection(worksheet.expenses),
        bookings: summarizeSection(worksheet.bookings),
        expenseDetails: worksheet.expenses,
        bookingDetails: worksheet.bookings,
    }));
    const result = {
        success: true,
        worksheets,
        worksheetReports: reports,
        totals: {
            expenses: sumReports(reports, 'expenses'),
            bookings: sumReports(reports, 'bookings'),
        },
    };
    console.log('[googleSheetSync] Multi-worksheet synchronization finished.', result.totals);
    return result;
}
