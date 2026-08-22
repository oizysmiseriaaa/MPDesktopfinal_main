"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSheetSyncScheduled = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const googleSheetSync_1 = require("../services/googleSheetSync");
// ponytail: scheduled Master Sheet → Firestore sync for staff spreadsheet workflow.
const syncSchedule = process.env.GOOGLE_SHEETS_SYNC_SCHEDULE || 'every 30 minutes';
exports.googleSheetSyncScheduled = (0, scheduler_1.onSchedule)({
    schedule: syncSchedule,
    region: 'asia-southeast1',
    timeZone: 'Asia/Manila',
    secrets: [
        'SERVICE_ACCOUNT_KEY',
        'GOOGLE_SHEETS_SPREADSHEET_ID',
    ],
}, async () => {
    const result = await (0, googleSheetSync_1.runGoogleSheetSync)();
    console.log('[googleSheetSyncScheduled] Completed run.', {
        duration: result.duration,
        bookingsFailed: result.bookings.failed,
        expensesFailed: result.expenses.failed,
        depositsFailed: result.deposits.failed,
        unitsFailed: result.units.failed,
        agentsFailed: result.agents.failed,
    });
});
