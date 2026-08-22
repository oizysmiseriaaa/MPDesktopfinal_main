"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncRouter = void 0;
const express_1 = __importDefault(require("express"));
const route_helpers_1 = require("../lib/route-helpers");
const googleSheetSync_1 = require("../services/googleSheetSync");
// ponytail: orchestrate Master Sheet → Firestore synchronization endpoints.
exports.syncRouter = express_1.default.Router();
function authorizeSyncRequest(req, res, next) {
    const configuredKey = String(process.env.SYNC_API_KEY || '').trim();
    if (!configuredKey) {
        return res.status(503).json({ success: false, error: 'Google Sheets sync is not configured.' });
    }
    const providedKey = String(req.headers['x-sync-key'] || req.body?.syncKey || '').trim();
    if (providedKey && providedKey === configuredKey)
        return next();
    return res.status(401).json({ success: false, error: 'Unauthorized sync request.' });
}
exports.syncRouter.post('/sync/google-sheet', route_helpers_1.authenticate, route_helpers_1.requireOperationsStaff, authorizeSyncRequest, async (req, res) => {
    try {
        const result = await (0, googleSheetSync_1.runGoogleSheetSync)({
            spreadsheetId: req.body?.spreadsheetId,
            worksheetName: req.body?.worksheetName,
            worksheetGid: req.body?.worksheetGid,
            rangeA1: req.body?.rangeA1,
        });
        return res.status(200).json(result);
    }
    catch (err) {
        console.error('[syncRoute] Google Sheet synchronization failed:', err);
        return res.status(500).json({
            success: false,
            error: err?.message || 'Google Sheet synchronization failed.',
        });
    }
});
