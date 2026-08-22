import { describe, it, expect } from 'vitest';
import {
  normalizeHeaderLabel,
  buildHeaderIndexMap,
  isOtherSectionBoundaryRow,
  buildDeterministicId,
} from '../sync-helpers.js';

describe('normalizeHeaderLabel', () => {
  it('normalizes spacing and punctuation', () => {
    expect(normalizeHeaderLabel('  Check-In Date ')).toBe('check in date');
    expect(normalizeHeaderLabel('Unit_Number')).toBe('unit number');
  });
});

describe('buildHeaderIndexMap', () => {
  it('maps known booking headers to column indexes', () => {
    const headerRow = ['Guest Name', 'Check-in', 'Unit', 'Total Amount'];
    const aliasMap = {
      guestName: ['guest name', 'guest'],
      checkinDate: ['check in', 'check-in'],
      unitName: ['unit', 'unit name'],
      totalAmount: ['total amount', 'total'],
    };
    const map = buildHeaderIndexMap(headerRow, aliasMap);
    expect(map.guestName).toBe(0);
    expect(map.checkinDate).toBe(1);
    expect(map.unitName).toBe(2);
    expect(map.totalAmount).toBe(3);
  });
});

describe('isOtherSectionBoundaryRow', () => {
  it('detects the next spreadsheet section', () => {
    const row = ['Expenses Record', '', ''];
    expect(isOtherSectionBoundaryRow(row, 'Booking Calendar')).toBe(true);
    expect(isOtherSectionBoundaryRow(row, 'Expenses Record')).toBe(false);
  });
});

describe('buildDeterministicId', () => {
  it('returns stable ids for the same key material', () => {
    const first = buildDeterministicId('sheet-booking', 'unit-1|2026-01-01|2026-01-03|jane|doe');
    const second = buildDeterministicId('sheet-booking', 'unit-1|2026-01-01|2026-01-03|jane|doe');
    expect(first).toBe(second);
    expect(first.startsWith('sheet-booking-')).toBe(true);
  });
});
