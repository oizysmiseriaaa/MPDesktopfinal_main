"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const envCandidates = [
    path_1.resolve(process.cwd(), '.env'),
    path_1.resolve(process.cwd(), '.env.local'),
    path_1.resolve(process.cwd(), '..', '.env'),
    path_1.resolve(process.cwd(), '..', '.env.local'),
];
for (const envPath of envCandidates) {
    (0, dotenv_1.config)({ path: envPath, override: false });
}
function mask(value) {
    const text = String(value || '').trim();
    if (!text)
        return '(missing)';
    if (text.length <= 8)
        return '***';
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
}
function parseServiceAccount() {
    const keys = ['SERVICE_ACCOUNT_KEY', 'GOOGLE_SHEETS_SERVICE_ACCOUNT', 'GOOGLE_SERVICE_ACCOUNT'];
    for (const key of keys) {
        const raw = process.env[key];
        if (!raw || !String(raw).trim())
            continue;
        try {
            const parsed = JSON.parse(raw);
            if (parsed?.client_email && parsed?.private_key) {
                return { source: key, email: parsed.client_email };
            }
        }
        catch (_err) {
            return { source: key, email: '(invalid JSON)' };
        }
    }
    return null;
}
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || process.env.MASTER_SHEET_SPREADSHEET_ID
    || process.env.GOOGLE_SHEET_ID;
const worksheetName = process.env.GOOGLE_SHEETS_WORKSHEET_NAME
    || process.env.MASTER_SHEET_WORKSHEET_NAME
    || '(default first tab)';
const worksheetGid = process.env.GOOGLE_SHEETS_WORKSHEET_GID
    || process.env.MASTER_SHEET_WORKSHEET_GID
    || '(not set)';
const serviceAccount = parseServiceAccount();
console.log('HostFlow Google Sheet sync — environment check');
console.log('------------------------------------------------');
console.log(`Spreadsheet ID: ${mask(spreadsheetId)}`);
console.log(`Worksheet name: ${worksheetName}`);
console.log(`Worksheet gid: ${worksheetGid}`);
console.log(`Service account: ${serviceAccount ? `${serviceAccount.email} via ${serviceAccount.source}` : '(missing)'}`);
const ready = Boolean(spreadsheetId && serviceAccount?.email && serviceAccount.email !== '(invalid JSON)');
console.log('------------------------------------------------');
if (ready) {
    console.log('Status: READY — run `npm run sync:sheet`');
    process.exit(0);
}
console.log('Status: NOT READY');
console.log('');
console.log('Create functions/.env from .env.example with:');
console.log('  1. GOOGLE_SHEETS_SPREADSHEET_ID=<id from sheet URL>');
console.log('  2. SERVICE_ACCOUNT_KEY=<full Firebase service account JSON on one line>');
console.log('  3. Optional GOOGLE_SHEETS_WORKSHEET_NAME=<tab name>');
console.log('');
console.log('Then share the Master Final sheet with the service account email as Viewer.');
process.exit(1);
