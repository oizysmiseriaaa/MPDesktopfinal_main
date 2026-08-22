const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://asia-southeast1-unified-booker.cloudfunctions.net/api';
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_EMAIL = process.env.FIREBASE_EMAIL;
const FIREBASE_PASSWORD = process.env.FIREBASE_PASSWORD;

function exitWithError(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeDate(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw.includes('T')) {
    return raw.split('T')[0];
  }
  return raw;
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
  if (!FIREBASE_API_KEY) exitWithError('Missing NEXT_PUBLIC_FIREBASE_API_KEY in .env.local or environment');
  if (!FIREBASE_EMAIL) exitWithError('Missing FIREBASE_EMAIL in .env.local or environment');
  if (!FIREBASE_PASSWORD) exitWithError('Missing FIREBASE_PASSWORD in .env.local or environment');

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const body = {
    email: FIREBASE_EMAIL,
    password: FIREBASE_PASSWORD,
    returnSecureToken: true,
  };

  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildSignature(item) {
  const bookingId = normalizeText(item.bookingId || item.id || '');
  const type = normalizeText(item.type || item._type || '').toLowerCase();
  const amount = Number(item.amount || 0);
  const paidAt = normalizeDate(item.paidAt || item.date || '');
  const method = normalizeText(item.method || '');
  const reference = normalizeText(item.reference || '');
  const status = normalizeText(item.status || '');

  return `${bookingId}|${type}|${amount}|${paidAt}|${method}|${reference}|${status}`;
}

function buildBookingPaymentCandidate(booking) {
  const amount = Number(booking?.bookingPayment?.amount ?? 0);
  if (!(amount > 0)) return null;

  const paidAt = booking?.bookingPayment?.paidAt || booking?.bookingPayment?.date || booking?.checkinDate || booking?.bookingDate || new Date().toISOString().split('T')[0];
  return {
    uid: booking?.uid || '',
    bookingId: booking.id,
    unitId: booking?.unitId || '',
    unitName: booking?.unitName || booking?.unitName || '',
    guestName: `${normalizeText(booking?.guestFirstName)} ${normalizeText(booking?.guestLastName)}`.trim(),
    type: 'income',
    amount,
    paidAt: normalizeDate(paidAt),
    method: booking?.bookingPayment?.method || 'CASH',
    notes: booking?.bookingPayment?.notes || 'Backfilled payment from booking record.',
    reference: booking?.bookingPayment?.reference || '',
    status: booking?.bookingPayment?.status || booking?.paymentStatus || booking?.bookingPaymentStatus || 'Paid',
  };
}

function buildDepositReceiptCandidate(booking) {
  const amount = Number(booking?.securityDepositReceipt?.amount ?? 0);
  if (!(amount > 0)) return null;

  const paidAt = booking?.securityDepositReceipt?.paidAt || booking?.checkinDate || booking?.bookingDate || new Date().toISOString().split('T')[0];
  return {
    uid: booking?.uid || '',
    bookingId: booking.id,
    unitId: booking?.unitId || '',
    unitName: booking?.unitName || booking?.unitName || '',
    guestName: `${normalizeText(booking?.guestFirstName)} ${normalizeText(booking?.guestLastName)}`.trim(),
    type: 'receive',
    amount,
    paidAt: normalizeDate(paidAt),
    method: booking?.securityDepositReceipt?.method || 'CASH',
    notes: booking?.securityDepositReceipt?.notes || 'Backfilled deposit receipt from booking record.',
    reference: booking?.securityDepositReceipt?.reference || '',
    status: booking?.securityDepositReceipt?.status || booking?.securityDepositStatus || 'Received',
  };
}

function buildRefundCandidate(booking) {
  const amount = Number(booking?.securityDepositReceipt?.refundAmount ?? 0);
  if (!(amount > 0)) return null;

  const paidAt = booking?.securityDepositReceipt?.refundPaidAt || booking?.securityDepositReceipt?.paidAt || booking?.checkinDate || booking?.bookingDate || new Date().toISOString().split('T')[0];
  return {
    uid: booking?.uid || '',
    bookingId: booking.id,
    unitId: booking?.unitId || '',
    unitName: booking?.unitName || booking?.unitName || '',
    guestName: `${normalizeText(booking?.guestFirstName)} ${normalizeText(booking?.guestLastName)}`.trim(),
    type: 'refund',
    amount,
    paidAt: normalizeDate(paidAt),
    method: booking?.securityDepositReceipt?.refundMethod || booking?.securityDepositReceipt?.method || 'CASH',
    notes: booking?.securityDepositReceipt?.refundNotes || 'Backfilled deposit refund from booking record.',
    reference: booking?.securityDepositReceipt?.refundReference || booking?.securityDepositReceipt?.reference || '',
    status: 'Refunded',
  };
}

function uniqueCandidates(candidates) {
  const seen = new Map();
  return candidates.filter((candidate) => {
    const key = buildSignature(candidate);
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const shouldExecute = args.includes('--run') || args.includes('--execute');

  console.log('Booking payments backfill tool');
  console.log(`API base URL: ${API_BASE_URL}`);
  console.log(`Mode: ${shouldExecute ? 'EXECUTE (writes enabled)' : 'DRY RUN only'}`);

  const auth = await signIn();
  if (!auth?.idToken) exitWithError('Unable to obtain Firebase ID token.');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.idToken}`,
  };

  const [bookings, existingPayments, existingDeposits] = await Promise.all([
    fetchJson(`${API_BASE_URL}/bookings`, { headers }),
    fetchJson(`${API_BASE_URL}/booking-payments`, { headers }),
    fetchJson(`${API_BASE_URL}/security-deposits`, { headers }),
  ]);

  if (!Array.isArray(bookings)) exitWithError('Expected GET /bookings to return an array.');
  if (!Array.isArray(existingPayments)) exitWithError('Expected GET /booking-payments to return an array.');
  if (!Array.isArray(existingDeposits)) exitWithError('Expected GET /security-deposits to return an array.');

  const paymentSignatures = new Set(existingPayments.map(buildSignature));
  const depositSignatures = new Set(existingDeposits.map(buildSignature));

  const proposed = [];
  const duplicateSkipped = [];
  const skippedNoCandidate = [];

  for (const booking of bookings) {
    if (!booking?.id) continue;
    const paymentCandidate = buildBookingPaymentCandidate(booking);
    const depositCandidate = buildDepositReceiptCandidate(booking);
    const refundCandidate = buildRefundCandidate(booking);

    if (!paymentCandidate && !depositCandidate && !refundCandidate) {
      skippedNoCandidate.push({ bookingId: booking.id, reason: 'No embedded payment or deposit data' });
      continue;
    }

    if (paymentCandidate) {
      const signature = buildSignature(paymentCandidate);
      if (paymentSignatures.has(signature)) {
        duplicateSkipped.push({ bookingId: booking.id, type: 'payment', reason: 'Matching booking-payment ledger entry exists' });
      } else {
        proposed.push({ recordType: 'booking-payment', bookingId: booking.id, payload: paymentCandidate });
      }
    }

    if (depositCandidate) {
      const signature = buildSignature(depositCandidate);
      if (depositSignatures.has(signature)) {
        duplicateSkipped.push({ bookingId: booking.id, type: 'deposit-receipt', reason: 'Matching security-deposit ledger entry exists' });
      } else {
        proposed.push({ recordType: 'security-deposit', bookingId: booking.id, payload: depositCandidate });
      }
    }

    if (refundCandidate) {
      const signature = buildSignature(refundCandidate);
      if (depositSignatures.has(signature)) {
        duplicateSkipped.push({ bookingId: booking.id, type: 'deposit-refund', reason: 'Matching security-deposit refund entry exists' });
      } else {
        proposed.push({ recordType: 'security-deposit', bookingId: booking.id, payload: refundCandidate });
      }
    }
  }

  const uniqueProposed = uniqueCandidates(proposed.map((item) => ({ ...item.payload, recordType: item.recordType })));
  const writeItems = proposed.filter((item) => uniqueProposed.some((unique) => buildSignature(unique) === buildSignature(item.payload)));

  console.log('--- Summary ---');
  console.log(`Bookings scanned: ${bookings.length}`);
  console.log(`Existing booking-payments: ${existingPayments.length}`);
  console.log(`Existing security-deposits: ${existingDeposits.length}`);
  console.log(`Proposed new ledger records: ${writeItems.length}`);
  console.log(`Duplicate/skipped records: ${duplicateSkipped.length}`);
  console.log(`Bookings with no candidate: ${skippedNoCandidate.length}`);
  console.log('');

  if (writeItems.length === 0) {
    console.log('No new backfill records found. Nothing to write.');
    return;
  }

  writeItems.slice(0, 20).forEach((item, index) => {
    console.log(`${index + 1}. [${item.recordType}] bookingId=${item.bookingId} amount=${item.payload.amount} paidAt=${item.payload.paidAt} type=${item.payload.type} status=${item.payload.status}`);
  });
  if (writeItems.length > 20) {
    console.log(`...and ${writeItems.length - 20} more proposed records.`);
  }

  console.log('');
  if (!shouldExecute) {
    console.log('Dry run complete. To execute writes, rerun with --run or --execute.');
    return;
  }

  console.log('Executing writes...');
  const results = [];
  for (const item of writeItems) {
    const endpoint = item.recordType === 'booking-payment' ? '/booking-payment' : '/security-deposit';
    try {
      const record = await fetchJson(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(item.payload),
      });
      results.push({ bookingId: item.bookingId, recordType: item.recordType, success: true, id: record?.id || '(unknown)' });
      console.log(`Created ${item.recordType} for bookingId=${item.bookingId} amount=${item.payload.amount}`);
    } catch (error) {
      results.push({ bookingId: item.bookingId, recordType: item.recordType, success: false, error: String(error) });
      console.error(`Failed ${item.recordType} for bookingId=${item.bookingId}:`, error?.message || error);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;
  console.log('--- Execution complete ---');
  console.log(`Successful writes: ${successCount}`);
  console.log(`Failed writes: ${failureCount}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
