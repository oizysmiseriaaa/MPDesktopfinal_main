const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://asia-southeast1-unified-booker.cloudfunctions.net/api';
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_EMAIL = process.env.FIREBASE_EMAIL;
const FIREBASE_PASSWORD = process.env.FIREBASE_PASSWORD;

const defaultCsvLocations = [
  path.resolve(process.cwd(), 'expenses_record.csv'),
  path.resolve(process.cwd(), '../expenses_record.csv'),
  path.resolve(process.cwd(), '../../expenses_record.csv'),
];
const CSV_PATH = process.env.CSV_PATH || defaultCsvLocations.find((candidate) => fs.existsSync(candidate)) || defaultCsvLocations[2];

function exitWithError(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseDate(value) {
  const cleaned = normalizeText(value);
  const parts = cleaned.split('/').map((segment) => normalizeText(segment));
  if (parts.length !== 3) return null;

  const [month, day, year] = parts;
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericYear = Number(year);
  if (!Number.isInteger(numericMonth) || !Number.isInteger(numericDay) || !Number.isInteger(numericYear)) {
    return null;
  }

  return new Date(`${numericYear}-${pad(numericMonth)}-${pad(numericDay)}T00:00:00.000Z`).toISOString();
}

function mapPaymentMethod(value) {
  const raw = normalizeKey(value);
  if (!raw) return 'CASH';
  if (raw.includes('cash')) return 'CASH';
  if (raw.includes('gcash')) return 'GCASH';
  if (raw.includes('bdo') || raw.includes('bank') || raw.includes('transfer')) return 'BANK_TRANSFER';
  return 'CASH';
}

function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length === 0) return rows;

  const headerLine = lines.shift();
  const headers = headerLine.split(',').map((header) => normalizeText(header));

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    const values = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < rawLine.length; i += 1) {
      const char = rawLine[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }
      if (char === ',' && !insideQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    values.push(current);
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = values[i] === undefined ? '' : normalizeText(values[i]);
    }

    rows.push(record);
  }

  return rows;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => 'Unable to read response body');
    throw new Error(`${response.status} ${response.statusText} - ${body}`);
  }
  return response.status === 204 ? null : response.json();
}

async function signIn() {
  if (!FIREBASE_API_KEY) exitWithError('Missing NEXT_PUBLIC_FIREBASE_API_KEY in .env.local');
  if (!FIREBASE_EMAIL) exitWithError('Missing FIREBASE_EMAIL environment variable');
  if (!FIREBASE_PASSWORD) exitWithError('Missing FIREBASE_PASSWORD environment variable');

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const body = {
    email: FIREBASE_EMAIL,
    password: FIREBASE_PASSWORD,
    returnSecureToken: true,
  };

  const result = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!result.idToken) {
    exitWithError('Authentication failed: no idToken returned');
  }

  return { idToken: result.idToken, uid: result.localId };
}

function findUnitByRoom(units, roomNumber) {
  const normalizedRoom = normalizeKey(roomNumber);
  if (!normalizedRoom) return null;

  const exactMatch = units.find((unit) => {
    const name = normalizeKey(unit.name || unit.unitName || '');
    const number = normalizeKey(unit.unitNumber || unit.unit_id || unit.unitId || '');
    return [name, number].some((value) => value && value === normalizedRoom);
  });
  if (exactMatch) return exactMatch;

  const trimmedRoom = normalizedRoom.replace(/[\s\-\(\)]+/g, '');
  return units.find((unit) => {
    const name = normalizeKey(unit.name || unit.unitName || '');
    const number = normalizeKey(unit.unitNumber || unit.unit_id || unit.unitId || '');
    return [name, number].some((value) => value.replace(/[\s\-\(\)]+/g, '') === trimmedRoom);
  }) || null;
}

function buildExpensePayload(row, units) {
  const rawRoom = normalizeText(row.room_number || row.room || '');
  const category = normalizeText(row.category || 'Other Expenses');
  const paymentMethod = mapPaymentMethod(row.payment_type || row.payment || 'CASH');
  const amount = Number(row.amount || row.Amount || 0);
  const date = parseDate(row.date || row.Date || '');
  const notes = [row.supplier, row.receipt_details, row.remarks].filter(Boolean).join(' • ');

  const isShared = /shared expense/i.test(rawRoom);
  const unitMatch = isShared ? null : findUnitByRoom(units, rawRoom);
  const allUnitIds = units.map((unit) => String(unit.id));

  const unitIds = isShared ? allUnitIds : (unitMatch ? [String(unitMatch.id)] : []);
  const unitName = isShared ? rawRoom || 'Shared Expense' : (unitMatch ? normalizeText(unitMatch.name || unitMatch.unitNumber || rawRoom) : rawRoom || 'General/Unassigned');
  const unitSelectionMode = isShared ? 'all' : 'single';
  const distributionMode = 'equal';

  return {
    title: normalizeText(row.receipt_details || row.supplier || category || unitName),
    category,
    paymentMethod,
    amount,
    date: date ?? new Date().toISOString(),
    notes,
    unitIds: unitIds.length > 0 ? unitIds : [],
    unitId: unitIds.length === 1 ? unitIds[0] : undefined,
    unitName,
    unitSelectionMode,
    distributionMode,
    distributionValues: {},
    createdAt: date ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildSignature(expense) {
  return [
    expense.date || '',
    String(expense.amount || ''),
    expense.category || '',
    expense.paymentMethod || '',
    expense.unitIds?.join(',') || '',
    expense.notes || '',
  ].join('|');
}

async function main() {
  console.log('Starting expenses migration script...');
  console.log('Starting expenses migration script...');
  console.log(`API base URL: ${API_BASE_URL}`);
  console.log(`CSV path: ${CSV_PATH}`);

  if (!fs.existsSync(CSV_PATH)) exitWithError(`CSV file not found at ${CSV_PATH}`);

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csvText);
  if (!rows.length) exitWithError('CSV file is empty or invalid.');

  const auth = await signIn();
  console.log(`Authenticated as ${FIREBASE_EMAIL}`);

  const unitsResponse = await fetchJson(`${API_BASE_URL}/units`, {
    headers: { Authorization: `Bearer ${auth.idToken}` },
  });
  const units = Array.isArray(unitsResponse) ? unitsResponse : [];
  console.log(`Loaded ${units.length} units from /units endpoint.`);

  const existingExpensesResponse = await fetchJson(`${API_BASE_URL}/expenses`, {
    headers: { Authorization: `Bearer ${auth.idToken}` },
  });
  const existingExpenses = Array.isArray(existingExpensesResponse) ? existingExpensesResponse : [];
  const existingSignatures = new Set(existingExpenses.map((expense) => buildSignature(expense)));
  console.log(`Loaded ${existingExpenses.length} existing expenses from /expenses endpoint.`);

  const payloads = [];
  const seenRows = new Set();
  const skipped = [];
  const duplicates = [];

  for (const [index, row] of rows.entries()) {
    const amount = Number(row.amount || row.Amount || 0);
    if (!amount || Number.isNaN(amount)) {
      skipped.push({ index: index + 2, reason: 'Invalid amount', row });
      continue;
    }

    const date = parseDate(row.date || row.Date || '');
    if (!date) {
      skipped.push({ index: index + 2, reason: 'Invalid date', row });
      continue;
    }

    const payload = buildExpensePayload(row, units);
    if (payload.unitIds.length === 0 && !/shared expense/i.test(normalizeText(row.room_number || row.room || ''))) {
      skipped.push({ index: index + 2, reason: 'Unit not matched', row });
      continue;
    }

    const signature = buildSignature(payload);
    if (seenRows.has(signature)) {
      skipped.push({ index: index + 2, reason: 'Duplicate row in CSV', row });
      continue;
    }

    if (existingSignatures.has(signature)) {
      duplicates.push({ index: index + 2, reason: 'Already exists in database', row });
      continue;
    }

    seenRows.add(signature);
    payloads.push(payload);
  }

  console.log(`Prepared ${payloads.length} expenses for import.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} rows:`);
    skipped.slice(0, 10).forEach((entry) => {
      console.log(`  Row ${entry.index}: ${entry.reason} - ${normalizeText(entry.row.room_number || entry.row.room || entry.row.receipt_details || entry.row.category)}`);
    });
  }

  let importedCount = 0;
  const failed = [];

  for (const [index, payload] of payloads.entries()) {
    const body = {
      ...payload,
      uid: auth.uid,
    };

    try {
      await fetchJson(`${API_BASE_URL}/expense`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.idToken}`,
        },
        body: JSON.stringify(body),
      });
      importedCount += 1;
      if (importedCount % 25 === 0) {
        console.log(`Imported ${importedCount}/${payloads.length} expenses...`);
      }
    } catch (error) {
      failed.push({ index: index + 2, reason: error.message || 'Create failed', payload });
    }
  }

  console.log(`Imported ${importedCount} expense records successfully.`);
  console.log(`Skipped ${skipped.length} records due to validation/unit matching or duplicate CSV rows.`);
  console.log(`Duplicate records already present in database: ${duplicates.length}.`);
  console.log(`Failed records during API create: ${failed.length}.`);

  if (skipped.length > 0) {
    console.log('\nSkipped records:');
    skipped.forEach((entry) => {
      console.log(`  Row ${entry.index}: ${entry.reason} - ${normalizeText(entry.row.room_number || entry.row.room || entry.row.receipt_details || entry.row.category)}`);
    });
  }

  if (duplicates.length > 0) {
    console.log('\nDuplicate records in DB:');
    duplicates.forEach((entry) => {
      console.log(`  Row ${entry.index}: ${entry.reason} - ${normalizeText(entry.row.room_number || entry.row.room || entry.row.receipt_details || entry.row.category)}`);
    });
  }

  if (failed.length > 0) {
    console.log('\nFailed records:');
    failed.forEach((entry) => {
      console.log(`  Payload row ${entry.index}: ${entry.reason}`);
    });
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message || error);
  process.exit(1);
});
