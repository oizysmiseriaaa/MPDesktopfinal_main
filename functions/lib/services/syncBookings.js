"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncBookingsFromSheet = syncBookingsFromSheet;
exports.parseCalendarWorksheetBookings = parseCalendarWorksheetBookings;
exports.resolveCalendarBookingValidation = resolveCalendarBookingValidation;
const googleSheets = require("./googleSheets");
const route_helpers_1 = require("../lib/route-helpers");
const sync_helpers_1 = require("../lib/sync-helpers");
const DEBUG_CALENDAR_PARSER = Boolean(process.env.DEBUG_CALENDAR_PARSER);
// ponytail: synchronize Booking Calendar section from Master Sheet → Firestore `bookings`.
const BOOKING_SECTION_TITLE = "Booking Calendar";
exports.BOOKING_SECTION_TITLE = BOOKING_SECTION_TITLE;
const BOOKING_COLUMN_ALIASES = {
  bookingId: [
    "booking id",
    "bookingid",
    "firestore booking id",
    "document id",
    "id",
  ],
  guestFirstName: [
    "guest first name",
    "first name",
    "guest first",
    "firstname",
  ],
  guestLastName: ["guest last name", "last name", "guest last", "lastname"],
  guestName: ["guest name", "guest", "name"],
  guestPhone: ["guest phone", "phone", "contact number", "mobile", "contact"],
  guestEmail: ["guest email", "email"],
  unitId: ["unit id", "unitid", "firestore unit id"],
  unitName: [
    "unit",
    "unit name",
    "unit number",
    "unit no",
    "unit #",
    "property unit",
  ],
  checkinDate: [
    "check in",
    "check-in",
    "checkin",
    "check in date",
    "arrival",
    "check-in date",
  ],
  checkoutDate: [
    "check out",
    "check-out",
    "checkout",
    "check out date",
    "departure",
    "check-out date",
  ],
  adults: ["adults", "adult", "pax adults"],
  children: ["children", "kids", "child", "pax children"],
  totalAmount: ["total amount", "total", "amount", "total paid", "grand total"],
  paymentStatus: [
    "payment status",
    "booking payment status",
    "paid status",
    "payment",
  ],
  bookingPaymentStatus: ["booking payment status"],
  securityDepositStatus: ["security deposit status", "deposit status"],
  agentId: ["agent id", "agentid"],
  agentName: ["agent", "agent name"],
  notes: ["notes", "remarks", "comment", "comments"],
  bookingDate: ["booking date", "date booked", "reservation date"],
  nightlyRate: ["nightly rate", "rate per night", "nightly"],
  isCustomAmount: ["custom amount", "is custom amount"],
};
exports.BOOKING_COLUMN_ALIASES = BOOKING_COLUMN_ALIASES;
function getCell(row, index) {
  if (index === undefined || index < 0) return "";
  return String(row[index] ?? "").trim();
}
function parseSheetDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const slashMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    let year = slashMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}
function parseInteger(value, fallback = 0) {
  const n = parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
function parseBoolean(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "yes" || raw === "1" || raw === "y";
}
function splitGuestName(guestName) {
  const text = String(guestName ?? "").trim();
  if (!text) return { guestFirstName: "", guestLastName: "" };
  const parts = text.split(/\s+/);
  if (parts.length === 1)
    return { guestFirstName: parts[0], guestLastName: "" };
  return {
    guestFirstName: parts[0],
    guestLastName: parts.slice(1).join(" "),
  };
}
function normalizeCalendarHeaderText(text) {
  return (0, sync_helpers_1.normalizeHeaderLabel)(String(text ?? ""));
}
function parseMonthYearFromWorksheetTitle(title) {
  const raw = String(title ?? "").trim();
  const match = raw.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b[\s\S]*?(\d{4})/i,
  );
  if (!match) return null;
  const monthNames = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const month = monthNames[match[1].toLowerCase()];
  const year = parseInt(match[2], 10);
  if (!month || !year) return null;
  return { month, year };
}
function parseCalendarRowDate(value, worksheetTitle) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const monthYear = parseMonthYearFromWorksheetTitle(worksheetTitle);
  const digits = raw.match(/^(\d{1,2})$/);
  if (digits && monthYear) {
    const day = digits[1].padStart(2, "0");
    return `${monthYear.year}-${String(monthYear.month).padStart(2, "0")}-${day}`;
  }
  if (
    /^\d{4}-\d{2}-\d{2}/.test(raw) ||
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.test(raw)
  ) {
    return parseSheetDate(raw);
  }
  return "";
}
function parseCalendarNumberValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[,\s]/g, "")
    .replace(/₱/g, "")
    .replace(/\$/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k?)$/i);
  if (!match) return 0;
  let amount = Number(match[1]);
  if (match[2].toLowerCase() === "k") {
    amount *= 1000;
  }
  return Number.isFinite(amount) ? amount : 0;
}
function resolveUnitByHeaderLabel(headerName, unitLookup) {
  const normalized = normalizeCalendarHeaderText(headerName);
  if (!normalized) return null;
  const direct = unitLookup.byName.get(normalized);
  if (direct) return direct;
  const simpleHeader = normalized.replace(/[^a-z0-9]/g, "");
  for (const unit of unitLookup.byId.values()) {
    const candidates = [unit.name, unit.unitNumber, unit.title].filter(Boolean);
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeCalendarHeaderText(
        candidate,
      ).replace(/[^a-z0-9]/g, "");
      if (normalizedCandidate && normalizedCandidate === simpleHeader) {
        return unit;
      }
    }
  }
  return null;
}
function findCalendarHeaderRow(values, worksheetTitle, unitLookup) {
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 10); rowIndex++) {
    const row = values[rowIndex] || [];
    const cells = row.map((cell) => String(cell ?? "").trim());
    const nonEmptyCount = cells.filter(Boolean).length;
    if (nonEmptyCount < 3) continue;
    const normalizedCells = cells.map((cell) =>
      normalizeCalendarHeaderText(cell),
    );
    const hasDateHeader = normalizedCells.some(
      (cell) =>
        cell.includes("date") ||
        cell.includes("day") ||
        cell.includes("day no") ||
        cell.includes("day number"),
    );
    const hasUnitHeader = normalizedCells.some(
      (cell) => resolveUnitByHeaderLabel(cell, unitLookup) != null,
    );
    const nextRow = values[rowIndex + 1] || [];
    const nextFirstCell = String(nextRow[0] ?? "").trim();
    const nextHasDate =
      nextFirstCell && !!parseCalendarRowDate(nextFirstCell, worksheetTitle);
    if (hasDateHeader || hasUnitHeader || nextHasDate) {
      return rowIndex;
    }
  }
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 10); rowIndex++) {
    const row = values[rowIndex] || [];
    const nonEmptyCount = row.filter((cell) =>
      String(cell ?? "").trim(),
    ).length;
    if (nonEmptyCount >= 3) return rowIndex;
  }
  return null;
}
function findDateColumnIndex(values, headerRowIndex, worksheetTitle) {
  const headerRow = values[headerRowIndex] || [];
  let bestIndex = 0;
  let bestScore = -Infinity;
  const maxColumns = Math.min(headerRow.length, 6);
  for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
    const headerText = normalizeCalendarHeaderText(headerRow[colIndex]);
    let score = 0;
    if (headerText.includes("date") || headerText.includes("day")) {
      score += 20;
    }
    if (
      headerText.includes("unit") ||
      headerText.includes("room") ||
      headerText.includes("property")
    ) {
      score -= 5;
    }
    for (
      let rowIndex = headerRowIndex + 1;
      rowIndex < Math.min(values.length, headerRowIndex + 20);
      rowIndex++
    ) {
      const row = values[rowIndex] || [];
      const dateCandidate = parseCalendarRowDate(row[colIndex], worksheetTitle);
      if (dateCandidate) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = colIndex;
    }
  }
  return bestIndex;
}
function isCalendarTotalsRow(row) {
  const text = row
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return false;
  return (
    text.includes("total") ||
    text.includes("summary") ||
    text.includes("monthly bookings") ||
    text.includes("grand total")
  );
}
function parseCalendarBookingCellText(cellText) {
  const rawText = String(cellText ?? "").trim();
  const normalized = rawText.replace(/\r/g, " ").replace(/\n/g, " / ");
  const tokens = normalized
    .split(/\s*[/|–—-]\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
  const parsed = {
    raw: rawText,
    guestName: "",
    source: "",
    paymentStatus: "",
    agentName: "",
    notes: rawText,
    amountValues: [],
    invalidGuestIdentity: /^\d+$/.test(rawText),
  };
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (
      !parsed.paymentStatus &&
      (lower === "paid" ||
        lower === "yes" ||
        lower === "complete" ||
        lower === "received")
    ) {
      parsed.paymentStatus = "Paid";
      continue;
    }
    if (
      !parsed.paymentStatus &&
      (lower === "unpaid" || lower === "no" || lower === "pending")
    ) {
      parsed.paymentStatus = "Unpaid";
      continue;
    }
    if (!parsed.paymentStatus && lower === "partial") {
      parsed.paymentStatus = "Partial";
      continue;
    }
    if (
      !parsed.source &&
      /(airbnb|booking\.com|booking|agoda|direct|walk ?in|guest)/i.test(token)
    ) {
      parsed.source = token.replace(/\s+/g, " ").trim();
      if (!parsed.guestName) parsed.guestName = parsed.source;
      continue;
    }
    if (/^agent\s*[:\-]/i.test(token)) {
      parsed.agentName = token.replace(/^agent\s*[:\-]\s*/i, "").trim();
      continue;
    }
    const amount = parseCalendarNumberValue(token);
    if (amount > 0) {
      parsed.amountValues.push(amount);
      continue;
    }
    if (!parsed.guestName) {
      parsed.guestName = token;
    }
  }
  if (!parsed.guestName && parsed.source) {
    parsed.guestName = parsed.source;
  }
  return parsed;
}
function buildBookingBlockKey(parsed) {
  return normalizeCalendarHeaderText(
    `${parsed.guestName || ""}|${parsed.source || ""}|${parsed.agentName || ""}|${parsed.paymentStatus || ""}`,
  );
}
function dayAfter(dateString) {
  // Treat calendar dates as date-only values. Formatting a Philippine-local
  // midnight with toISOString() previously moved it back one day in UTC.
  const parsed = new Date(`${dateString}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}
function collectSheetTotals(values, startRowIndex, unitColumns) {
  const candidateRows = [];
  for (let rowIndex = startRowIndex; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    const rowText = row
      .map((cell) => String(cell ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    // Do not let the Expenses Record's pivot/summary table participate in
    // booking validation just because it also contains the word "total".
    if (rowText.includes("expenses record")) break;
    if (!isCalendarTotalsRow(row)) continue;
    candidateRows.push(row);
  }
  const selected = candidateRows.reduce(
    (best, row) => {
      const totalCount = unitColumns.reduce((sum, unitColumn) => {
        const amount = parseCalendarNumberValue(row[unitColumn.rateColIndex]);
        return sum + (amount > 0 ? 1 : 0);
      }, 0);
      return totalCount > best.count ? { row, count: totalCount } : best;
    },
    { row: null, count: -1 },
  );
  const totals = new Map();
  if (!selected.row) return totals;
  for (const unitColumn of unitColumns) {
    const amount = parseCalendarNumberValue(selected.row[unitColumn.rateColIndex]);
    if (amount > 0) {
      totals.set(unitColumn.unitId, amount);
    }
  }
  return totals;
}
function parseCalendarWorksheetBookings(values, worksheetTitle, unitLookup) {
  const headerRowIndex = findCalendarHeaderRow(
    values,
    worksheetTitle,
    unitLookup,
  );
  if (headerRowIndex === null || headerRowIndex < 0)
    return {
      bookings: [],
      totalsByUnit: new Map(),
      footerRowIndex: values.length,
    };
  const headerRow = values[headerRowIndex] || [];
  const dateColumnIndex = findDateColumnIndex(
    values,
    headerRowIndex,
    worksheetTitle,
  );
  const unitColumns = [];
  for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
    if (colIndex === dateColumnIndex) continue;
    const unit = resolveUnitByHeaderLabel(headerRow[colIndex], unitLookup);
    if (unit) {
      unitColumns.push({
        colIndex,
        sourceColIndex: colIndex + 1,
        rateColIndex: colIndex + 2,
        unitId: String(unit.id),
        unitLabel: String(headerRow[colIndex] ?? ""),
      });
    }
  }
  if (!unitColumns.length)
    return {
      bookings: [],
      totalsByUnit: new Map(),
      footerRowIndex: values.length,
    };
  const dataRows = [];
  let footerRowIndex = values.length;
  for (
    let rowIndex = headerRowIndex + 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex] || [];
    const dateText = String(row[dateColumnIndex] ?? "").trim();
    const rowDate = parseCalendarRowDate(dateText, worksheetTitle);
    if (!rowDate) {
      if (isCalendarTotalsRow(row)) {
        footerRowIndex = rowIndex;
        break;
      }
      if ((0, googleSheets.isRowEmpty)(row, dateColumnIndex)) {
        footerRowIndex = rowIndex;
        break;
      }
      continue;
    }
    const hasOccupancy = unitColumns.some((unitColumn) =>
      String(row[unitColumn.colIndex] ?? "").trim(),
    );
    if (!hasOccupancy && (0, googleSheets.isRowEmpty)(row, dateColumnIndex)) {
      footerRowIndex = rowIndex;
      break;
    }
    dataRows.push({ rowIndex, row, rowDate });
  }
  const bookings = [];
  const unitTotals = new Map();
  let rateOnlyRowsRejected = 0;
  const invalidGuestRecords = [];
  for (const unitColumn of unitColumns) {
    let currentBlock = null;
    let previousInvalidNumericGuest = "";
    for (const { rowIndex, row, rowDate } of dataRows) {
      const guestCell = String(row[unitColumn.colIndex] ?? "").trim();
      const sourceCell = String(row[unitColumn.sourceColIndex] ?? "").trim();
      const rate = parseCalendarNumberValue(row[unitColumn.rateColIndex]);
      // A rate-only cell is not a reservation. It may extend the named
      // reservation directly above it, but it must never start a new booking
      // with the unit label as a synthetic guest.
      if (!guestCell) {
        previousInvalidNumericGuest = "";
        const hasContinuationSignal = rate > 0 || Boolean(sourceCell);
        if (!currentBlock || !hasContinuationSignal) {
          if (!currentBlock && hasContinuationSignal) rateOnlyRowsRejected += 1;
          if (currentBlock) {
            bookings.push(currentBlock);
            currentBlock = null;
          }
          continue;
        }
        const sourceStatus = sourceCell.toLowerCase();
        currentBlock.checkoutDate = dayAfter(rowDate);
        if (rate > 0) currentBlock.amountValues.push(rate);
        currentBlock.rowIndices.push(rowIndex);
        if (
          currentBlock.paymentStatus === "Unpaid" &&
          (sourceStatus.includes("fully paid") || sourceStatus === "paid")
        ) {
          currentBlock.paymentStatus = "Paid";
        }
        continue;
      }
      const parsedCell = parseCalendarBookingCellText(guestCell);
      if (parsedCell.invalidGuestIdentity) {
        // Numeric-only cells are reference values, not a reliable guest
        // identity. They must neither start nor extend a booking block.
        if (currentBlock) {
          bookings.push(currentBlock);
          currentBlock = null;
        }
        if (previousInvalidNumericGuest !== guestCell) {
          invalidGuestRecords.push({
            row: rowIndex + 1,
            unitId: unitColumn.unitId,
            unitName: unitColumn.unitLabel,
            rawGuest: guestCell,
            reason: "Numeric-only guest identity.",
          });
        }
        previousInvalidNumericGuest = guestCell;
        continue;
      }
      previousInvalidNumericGuest = "";
      const sourceStatus = sourceCell.toLowerCase();
      if (sourceStatus.includes("fully paid") || sourceStatus === "paid") {
        parsedCell.paymentStatus = "Paid";
      } else if (sourceStatus.includes("awaiting") || sourceStatus.includes("unpaid")) {
        parsedCell.paymentStatus = "Unpaid";
      }
      if (rate > 0) parsedCell.amountValues.push(rate);
      const blockKey = buildBookingBlockKey(parsedCell);
      if (!currentBlock || currentBlock.blockKey !== blockKey) {
        if (currentBlock) {
          bookings.push(currentBlock);
        }
        currentBlock = {
          unitId: unitColumn.unitId,
          unitName: unitColumn.unitLabel,
          checkinDate: rowDate,
          checkoutDate: dayAfter(rowDate),
          guestName: parsedCell.guestName || parsedCell.source,
          agentName: parsedCell.agentName || "",
          paymentStatus: parsedCell.paymentStatus || "Unpaid",
          bookingDate: rowDate,
          notes: parsedCell.notes,
          amountValues: [...parsedCell.amountValues],
          rowIndices: [rowIndex],
          blockKey,
        };
        continue;
      }
      currentBlock.checkoutDate = dayAfter(rowDate);
      currentBlock.amountValues.push(...parsedCell.amountValues);
      currentBlock.rowIndices.push(rowIndex);
      if (!currentBlock.agentName && parsedCell.agentName) {
        currentBlock.agentName = parsedCell.agentName;
      }
      if (currentBlock.paymentStatus === "Unpaid" && parsedCell.paymentStatus) {
        currentBlock.paymentStatus = parsedCell.paymentStatus;
      }
    }
    if (currentBlock) {
      bookings.push(currentBlock);
    }
  }
  const normalizedBookings = bookings.map((block) => {
    const nights = Math.max(
      1,
      Math.round(
        (new Date(`${block.checkoutDate}T00:00:00`).getTime() -
          new Date(`${block.checkinDate}T00:00:00`).getTime()) /
          86400000,
      ),
    );
    const dailyAmounts = block.amountValues.filter(
      (value) => Number.isFinite(value) && value > 0,
    );
    let totalAmount = 0;
    let nightlyRate = 0;
    if (dailyAmounts.length) {
      const uniqueAmounts = Array.from(new Set(dailyAmounts));
      if (uniqueAmounts.length === 1 && nights > 1) {
        nightlyRate = uniqueAmounts[0];
        totalAmount = nightlyRate * nights;
      } else {
        totalAmount = dailyAmounts.reduce((sum, amount) => sum + amount, 0);
        nightlyRate = totalAmount / nights;
      }
    }
    const guestName = String(block.guestName || "").trim();
    const split = splitGuestName(guestName);
    if (!block.agentName) {
      block.agentName = "";
    }
    const parsed = {
      guestFirstName: split.guestFirstName,
      guestLastName: split.guestLastName,
      guestPhone: "",
      guestEmail: "",
      unitId: block.unitId,
      unitName: block.unitName,
      checkinDate: block.checkinDate,
      checkoutDate: block.checkoutDate,
      adults: 1,
      children: 0,
      totalAmount,
      nightlyRate,
      bookingDate: block.bookingDate,
      agentId: "",
      agentName: block.agentName,
      notes: block.notes,
      paymentStatus: block.paymentStatus || "Unpaid",
      bookingPaymentStatus: block.paymentStatus || "Unpaid",
      securityDepositStatus: "Unpaid",
      isCustomAmount: totalAmount > 0,
      // Calendar rows are unique only within a unit column. Persist this
      // source coordinate so changes to the guest or dates update the same
      // Sheet-backed booking instead of creating a second document.
      sourceRow: block.rowIndices[0] + 1,
    };
    const unitTotal = unitTotals.get(block.unitId) || 0;
    unitTotals.set(block.unitId, unitTotal + parsed.totalAmount);
    return parsed;
  });
  const validatedTotals = collectSheetTotals(
    values,
    footerRowIndex,
    unitColumns,
  );
  return {
    bookings: normalizedBookings,
    totalsByUnit: validatedTotals,
    footerRowIndex: footerRowIndex,
    rateOnlyRowsRejected,
    invalidGuestRecords,
  };
}
function resolveCalendarBookingValidation(
  importedTotals,
  sheetTotals,
  unitLookup,
) {
  const mismatches = [];
  for (const [unitId, sheetTotal] of sheetTotals.entries()) {
    const importedTotal = importedTotals.get(unitId) || 0;
    const diff = Math.round((importedTotal - sheetTotal) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      const unit = unitLookup.byId.get(unitId);
      mismatches.push({
        unitId,
        unitName: unit?.name || unit?.unitNumber || "Unknown Unit",
        sheetTotal,
        importedTotal,
        difference: diff,
        reason:
          importedTotal === 0
            ? "No bookings were imported for this unit."
            : "Imported booking total does not match sheet total.",
      });
    }
  }
  return mismatches;
}
function resolveSectionHeaderRow(values, sectionMatch) {
  const titleRowIndex = sectionMatch.rowIndex;
  const titleRow = values[titleRowIndex] || [];
  const nonEmptyTitleCells = titleRow.filter((cell) =>
    String(cell ?? "").trim(),
  ).length;
  const nextRow = values[titleRowIndex + 1] || [];
  const nonEmptyNextCells = nextRow.filter((cell) =>
    String(cell ?? "").trim(),
  ).length;
  if (nonEmptyTitleCells <= 2 && nonEmptyNextCells >= 3) {
    return {
      headerRowIndex: titleRowIndex + 1,
      headerRow: nextRow.map((cell) => String(cell ?? "").trim()),
    };
  }
  return {
    headerRowIndex: titleRowIndex,
    headerRow: titleRow.map((cell) => String(cell ?? "").trim()),
  };
}
function readBookingDataRows(values, headerRowIndex, keyColumnIndex = 0) {
  const rows = [];
  for (
    let rowIndex = headerRowIndex + 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex] || [];
    if ((0, googleSheets.isRowEmpty)(row, keyColumnIndex)) break;
    if (
      (0, sync_helpers_1.isOtherSectionBoundaryRow)(row, BOOKING_SECTION_TITLE)
    )
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
    const names = [unit.name, unit.unitNumber, unit.title].filter(Boolean);
    names.forEach((name) => {
      byName.set((0, sync_helpers_1.normalizeHeaderLabel)(String(name)), unit);
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
      byName.set(
        (0, sync_helpers_1.normalizeHeaderLabel)(String(agent.name)),
        agent,
      );
    }
  });
  return { byId, byName };
}
function buildBookingLookupMaps(bookings) {
  const byId = new Map();
  const bySyncKey = new Map();
  const byLegacySyncKey = new Map();
  const bySourceKey = new Map();
  bookings.forEach((booking) => {
    const id = String(booking.id || booking.bookingId || "");
    if (id) byId.set(id, booking);
    const syncKey = buildBookingSyncKey({
      unitId: booking.unitId,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      guestFirstName: booking.guestFirstName,
      guestLastName: booking.guestLastName,
      sourceWorksheet: booking.sourceWorksheet,
    });
    if (syncKey) bySyncKey.set(syncKey, booking);
    // Legacy records created before worksheet provenance was stored still
    // represent the same reservation. Keep this fallback separate from the
    // worksheet-aware key so it can prevent duplicate creation without
    // collapsing records from different source worksheets by default.
    const legacySyncKey = buildLegacyBookingSyncKey({
      unitId: booking.unitId,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      guestFirstName: booking.guestFirstName,
      guestLastName: booking.guestLastName,
    });
    if (legacySyncKey) byLegacySyncKey.set(legacySyncKey, booking);
    const sourceKey = buildBookingSourceSyncKey({
      unitId: booking.unitId,
      sourceRow: booking.sourceRow,
      sourceWorksheet: booking.sourceWorksheet,
    });
    if (sourceKey) bySourceKey.set(sourceKey, booking);
  });
  return { byId, bySyncKey, byLegacySyncKey, bySourceKey };
}
function buildBookingSourceSyncKey(fields) {
  const unitId = String(fields.unitId || "").trim();
  const sourceRow = Number(fields.sourceRow);
  if (!unitId || !Number.isInteger(sourceRow) || sourceRow < 1) return "";
  const sourceWorksheet = String(fields.sourceWorksheet || "").trim();
  return sourceWorksheet
    ? `${unitId}|sheet:${sourceWorksheet}|row:${sourceRow}`
    : `${unitId}|sheet-row:${sourceRow}`;
}
function buildBookingSyncKey(fields) {
  const unitId = String(fields.unitId || "").trim();
  const checkinDate = String(fields.checkinDate || "").trim();
  const checkoutDate = String(fields.checkoutDate || "").trim();
  const guestFirstName = String(fields.guestFirstName || "")
    .trim()
    .toLowerCase();
  const guestLastName = String(fields.guestLastName || "")
    .trim()
    .toLowerCase();
  const sourceWorksheet = String(fields.sourceWorksheet || "").trim();
  if (!unitId || !checkinDate || !checkoutDate || !guestFirstName) return "";
  return `${unitId}|${checkinDate}|${checkoutDate}|${guestFirstName}|${guestLastName}|${sourceWorksheet}`;
}
function buildLegacyBookingSourceSyncKey(fields) {
  return buildBookingSourceSyncKey({ ...fields, sourceWorksheet: "" });
}
function buildLegacyBookingSyncKey(fields) {
  return buildBookingSyncKey({ ...fields, sourceWorksheet: "" });
}
function pickChangedFields(before, after, keys) {
  const changed = {};
  keys.forEach((key) => {
    if (
      (0, route_helpers_1.stableStringify)(before?.[key]) !==
      (0, route_helpers_1.stableStringify)(after[key])
    ) {
      changed[key] = after[key];
    }
  });
  return changed;
}
function parseBookingRow(row, headerIndexMap, unitLookup, agentLookup) {
  let guestFirstName = getCell(row, headerIndexMap.guestFirstName);
  let guestLastName = getCell(row, headerIndexMap.guestLastName);
  const guestNameCell = getCell(row, headerIndexMap.guestName);
  if (!guestFirstName && guestNameCell) {
    const split = splitGuestName(guestNameCell);
    guestFirstName = split.guestFirstName;
    guestLastName = guestLastName || split.guestLastName;
  }
  const checkinDate = parseSheetDate(getCell(row, headerIndexMap.checkinDate));
  const checkoutDate = parseSheetDate(
    getCell(row, headerIndexMap.checkoutDate),
  );
  let unitId = getCell(row, headerIndexMap.unitId);
  const unitNameRaw = getCell(row, headerIndexMap.unitName);
  if (!unitId && unitNameRaw) {
    const unit = unitLookup.byName.get(
      (0, sync_helpers_1.normalizeHeaderLabel)(unitNameRaw),
    );
    if (unit?.id) unitId = String(unit.id);
  }
  const adults = parseInteger(getCell(row, headerIndexMap.adults), 1);
  const children = parseInteger(getCell(row, headerIndexMap.children), 0);
  const totalAmount = (0, route_helpers_1.toNumber)(
    getCell(row, headerIndexMap.totalAmount),
  );
  const nightlyRate = (0, route_helpers_1.toNumber)(
    getCell(row, headerIndexMap.nightlyRate),
  );
  const bookingDate = parseSheetDate(getCell(row, headerIndexMap.bookingDate));
  let agentId = getCell(row, headerIndexMap.agentId);
  const agentName = getCell(row, headerIndexMap.agentName);
  let resolvedAgentName = agentName;
  if (!agentId && agentName) {
    const agent = agentLookup.byName.get(
      (0, sync_helpers_1.normalizeHeaderLabel)(agentName),
    );
    if (agent?.id) agentId = String(agent.id);
    resolvedAgentName = agent?.name || agentName;
  } else if (agentId && agentLookup.byId.has(agentId)) {
    resolvedAgentName = agentLookup.byId.get(agentId)?.name || agentName;
  }
  const paymentStatus = (0, route_helpers_1.resolveBookingPaymentStatus)({
    paymentStatus: getCell(row, headerIndexMap.paymentStatus),
    bookingPaymentStatus: getCell(row, headerIndexMap.bookingPaymentStatus),
  });
  const securityDepositStatus = (0,
  route_helpers_1.resolveSecurityDepositStatus)({
    securityDepositStatus: getCell(row, headerIndexMap.securityDepositStatus),
  });
  const bookingIdFromSheet = getCell(row, headerIndexMap.bookingId);
  const isCustomAmount =
    parseBoolean(getCell(row, headerIndexMap.isCustomAmount)) ||
    totalAmount > 0;
  const parsed = {
    guestFirstName,
    guestLastName,
    guestPhone: getCell(row, headerIndexMap.guestPhone),
    guestEmail: getCell(row, headerIndexMap.guestEmail),
    unitId,
    unitName: unitNameRaw,
    checkinDate,
    checkoutDate,
    adults,
    children,
    totalAmount,
    nightlyRate,
    bookingDate,
    agentId: agentId || "",
    agentName: resolvedAgentName || "",
    notes: getCell(row, headerIndexMap.notes),
    paymentStatus,
    bookingPaymentStatus: paymentStatus,
    securityDepositStatus,
    isCustomAmount,
    bookingIdFromSheet,
  };
  return parsed;
}
function validateParsedBooking(parsed) {
  if (!parsed.guestFirstName) {
    return "Missing guest first name (or guest name).";
  }
  if (!parsed.checkinDate || !parsed.checkoutDate) {
    return "Missing or invalid check-in / check-out date.";
  }
  if (parsed.checkoutDate <= parsed.checkinDate) {
    return "Check-out must be after check-in.";
  }
  if (!parsed.unitId) {
    return "Unable to resolve unit (missing unit id/name match in Firestore).";
  }
  return null;
}
function buildFirestoreBookingPayload(parsed, unitLookup, existing) {
  const unit = unitLookup.byId.get(parsed.unitId);
  const unitName = parsed.unitName || unit?.name || existing?.unitName || "";
  const paymentStatus = parsed.paymentStatus;
  const depositStatus = parsed.securityDepositStatus;
  const configuredDepositAmount =
    (0, route_helpers_1.toNumber)(existing?.securityDeposit?.amount) || 1000;
  const payload = {
    guestFirstName: parsed.guestFirstName,
    guestLastName: parsed.guestLastName || "",
    guestPhone: parsed.guestPhone || "",
    guestEmail: parsed.guestEmail || "",
    unitId: parsed.unitId,
    unitName,
    checkinDate: parsed.checkinDate,
    checkoutDate: parsed.checkoutDate,
    adults: parsed.adults,
    children: parsed.children,
    totalAmount: parsed.totalAmount,
    nightlyRate:
      parsed.nightlyRate || (0, route_helpers_1.toNumber)(unit?.rate),
    bookingDate: parsed.bookingDate || parsed.checkinDate,
    agentId: parsed.agentId || "",
    agentName: parsed.agentName || "",
    notes: parsed.notes || "",
    paymentStatus,
    bookingPaymentStatus: paymentStatus,
    securityDepositStatus: depositStatus,
    isCustomAmount: parsed.isCustomAmount,
    bookingPayment: {
      ...(existing?.bookingPayment || {}),
      status: paymentStatus,
      paymentStatus,
    },
    securityDeposit: {
      amount: configuredDepositAmount,
      status: depositStatus,
    },
    securityDepositReceipt: {
      ...(existing?.securityDepositReceipt || {}),
      status: depositStatus,
    },
  };
  if (Number.isInteger(parsed.sourceRow) && parsed.sourceRow > 0) {
    payload.sourceRow = parsed.sourceRow;
  }
  if (parsed.sourceWorksheet) {
    payload.sourceWorksheet = parsed.sourceWorksheet;
  }
  if (parsed.totalAmount > 0) {
    payload.baseRate = parsed.totalAmount;
  }
  return payload;
}
async function syncBookingsFromSheet(options = {}) {
  const stats = (0, sync_helpers_1.createSyncStats)();
  const startedAt = Date.now();
  console.log("[syncBookings] Synchronization started.");
  const db = (0, route_helpers_1.getDb)();
  const rangeA1 = options.rangeA1 || "A1:ZZ5000";
  const sheetRead = await googleSheets.readRange(
    rangeA1,
    options.spreadsheetId,
    options.worksheetName,
    options.worksheetGid,
  );
  const values = sheetRead.values;
  const [units, agents, existingBookings] = await Promise.all([
    (0, route_helpers_1.getCollection)("units"),
    (0, route_helpers_1.getCollection)("agents"),
    (0, route_helpers_1.getCollection)("bookings"),
  ]);
  const unitLookup = buildUnitLookup(units);
  const agentLookup = buildAgentLookup(agents);
  const bookingLookup = buildBookingLookupMaps(existingBookings);
  const sectionMatch = googleSheets.findHeader(values, BOOKING_SECTION_TITLE);
  let parsedBookings = [];
  let rowsProcessed = 0;
  let validationMismatches = [];
  let invalidGuestRecords = [];
  if (sectionMatch) {
    const { headerRowIndex, headerRow } = resolveSectionHeaderRow(
      values,
      sectionMatch,
    );
    const headerIndexMap = (0, sync_helpers_1.buildHeaderIndexMap)(
      headerRow,
      BOOKING_COLUMN_ALIASES,
    );
    const keyColumnIndex =
      headerIndexMap.guestFirstName ??
      headerIndexMap.guestName ??
      headerIndexMap.unitName ??
      0;
    const dataRows = readBookingDataRows(
      values,
      headerRowIndex,
      keyColumnIndex,
    );
    rowsProcessed = dataRows.length;
    for (const { rowIndex, row } of dataRows) {
      const parsed = parseBookingRow(
        row,
        headerIndexMap,
        unitLookup,
        agentLookup,
      );
      parsed.sourceRow = rowIndex + 1;
      parsedBookings.push({ parsed, rowIndex });
    }
  } else {
    const calendarResult = parseCalendarWorksheetBookings(
      values,
      sheetRead.worksheetTitle,
      unitLookup,
    );
    if (!calendarResult.bookings.length) {
      throw new Error(
        `[syncBookings] Section "${BOOKING_SECTION_TITLE}" not found in worksheet and calendar worksheet parsing produced no bookings.`,
      );
    }
    parsedBookings = calendarResult.bookings.map((parsed) => ({
      parsed,
      rowIndex: -1,
    }));
    rowsProcessed = parsedBookings.length;
    const importedTotals = parsedBookings.reduce((totals, entry) => {
      const current = totals.get(entry.parsed.unitId) || 0;
      totals.set(entry.parsed.unitId, current + entry.parsed.totalAmount);
      return totals;
    }, new Map());
    validationMismatches = resolveCalendarBookingValidation(
      importedTotals,
      calendarResult.totalsByUnit,
      unitLookup,
    );
    var rateOnlyRowsRejected = calendarResult.rateOnlyRowsRejected || 0;
    invalidGuestRecords = calendarResult.invalidGuestRecords || [];
    for (const record of invalidGuestRecords) {
      stats.skipped += 1;
      stats.invalidRows = (stats.invalidRows || 0) + 1;
      stats.skippedRecords.push({ row: record.row, reason: record.reason });
    }
  }
  const pendingWrites = [];
  const seenSourceIdentities = new Set();
  const duplicateRecords = [];
  for (const { rowIndex, parsed } of parsedBookings) {
    try {
      const validationError = validateParsedBooking(parsed);
      if (validationError) {
        stats.skipped += 1;
        stats.invalidRows = (stats.invalidRows || 0) + 1;
        stats.skippedRecords.push({
          row: rowIndex >= 0 ? rowIndex + 1 : null,
          reason: validationError,
        });
        continue;
      }
      const sourceWorksheet = sheetRead.worksheetTitle;
      parsed.sourceWorksheet = sourceWorksheet;
      const syncKey = buildBookingSyncKey(parsed);
      const sourceSyncKey = buildBookingSourceSyncKey(parsed);
      if (sourceSyncKey && seenSourceIdentities.has(sourceSyncKey)) {
        duplicateRecords.push({
          row: rowIndex >= 0 ? rowIndex + 1 : null,
          worksheet: sourceWorksheet,
          reason: "Duplicate Google Sheet source identity.",
        });
        stats.skipped += 1;
        stats.skippedRecords.push({
          row: rowIndex >= 0 ? rowIndex + 1 : null,
          reason: "Duplicate Google Sheet source identity.",
        });
        continue;
      }
      if (sourceSyncKey) seenSourceIdentities.add(sourceSyncKey);
      let existing = null;
      let docId = "";
      if (
        parsed.bookingIdFromSheet &&
        bookingLookup.byId.has(parsed.bookingIdFromSheet)
      ) {
        existing = bookingLookup.byId.get(parsed.bookingIdFromSheet);
        docId = parsed.bookingIdFromSheet;
      } else if (parsed.bookingIdFromSheet) {
        docId = parsed.bookingIdFromSheet;
      } else if (sourceSyncKey && bookingLookup.bySourceKey.has(sourceSyncKey)) {
        existing = bookingLookup.bySourceKey.get(sourceSyncKey);
        docId = String(existing.id || existing.bookingId);
      } else if (
        options.legacyWorksheetName === sourceWorksheet &&
        bookingLookup.bySourceKey.has(buildLegacyBookingSourceSyncKey(parsed))
      ) {
        existing = bookingLookup.bySourceKey.get(buildLegacyBookingSourceSyncKey(parsed));
        docId = String(existing.id || existing.bookingId);
      } else if (syncKey && bookingLookup.bySyncKey.has(syncKey)) {
        existing = bookingLookup.bySyncKey.get(syncKey);
        docId = String(existing.id || existing.bookingId);
      } else if (
        syncKey &&
        bookingLookup.byLegacySyncKey.has(buildLegacyBookingSyncKey(parsed))
      ) {
        // A source-backed record may be reconciled to a pre-provenance
        // Firestore booking by immutable reservation fields. Differences in
        // notes, source, payment, rate, or agent remain manual review; they
        // must never trigger a second booking document.
        existing = bookingLookup.byLegacySyncKey.get(
          buildLegacyBookingSyncKey(parsed),
        );
        docId = String(existing.id || existing.bookingId);
      } else if (sourceSyncKey || syncKey) {
        docId = (0, sync_helpers_1.buildDeterministicId)(
          "sheet-booking",
          sourceSyncKey || syncKey,
        );
      } else {
        stats.skipped += 1;
        stats.skippedRecords.push({
          row: rowIndex + 1,
          reason: "Unable to derive booking document id.",
        });
        continue;
      }
      const payload = buildFirestoreBookingPayload(
        parsed,
        unitLookup,
        existing,
      );
      // Do not mark legacy August records as changed only because they lack
      // the new worksheet provenance field.
      if (existing && !existing.sourceWorksheet) {
        delete payload.sourceWorksheet;
      }
      const syncFieldKeys = Object.keys(payload);
      const docRef = db.collection("bookings").doc(docId);
      if (!existing) {
        const createPayload = {
          ...payload,
          id: docId,
          bookingId: docId,
          createdAt: new Date().toISOString(),
        };
        pendingWrites.push({
          type: "set",
          ref: docRef,
          data: createPayload,
          options: { merge: false },
        });
        stats.imported += 1;
        bookingLookup.byId.set(docId, createPayload);
        if (syncKey) bookingLookup.bySyncKey.set(syncKey, createPayload);
        if (sourceSyncKey) bookingLookup.bySourceKey.set(sourceSyncKey, createPayload);
        continue;
      }
      const changedFields = pickChangedFields(existing, payload, syncFieldKeys);
      if (!Object.keys(changedFields).length) {
        stats.skipped += 1;
        stats.alreadyExisting = (stats.alreadyExisting || 0) + 1;
        stats.skippedRecords.push({
          row: rowIndex + 1,
          reason: "No changes detected.",
        });
        continue;
      }
      stats.skipped += 1;
      stats.skippedRecords.push({
        row: rowIndex + 1,
        reason: "Existing record with changes: manual review required.",
      });
      stats.changesRequiringReview = (stats.changesRequiringReview || 0) + 1;
      stats.changedRecords = stats.changedRecords || [];
      stats.changedRecords.push({
        row: rowIndex + 1,
        worksheet: sourceWorksheet,
        id: existing.id || docId,
        fields: Object.keys(changedFields),
      });
    } catch (err) {
      stats.failed += 1;
      stats.failedRecords.push({
        row: rowIndex + 1,
        error: err?.message || String(err),
      });
      console.error(`[syncBookings] Row ${rowIndex + 1} failed:`, err);
    }
  }
  await (0, sync_helpers_1.commitBatchWrites)(db, pendingWrites, {
    dryRun: Boolean(options?.dryRun),
  });
  const durationMs = Date.now() - startedAt;
  console.log("[syncBookings] Synchronization finished.", {
    imported: stats.imported,
    updated: stats.updated,
    skipped: stats.skipped,
    failed: stats.failed,
    durationMs,
  });
  return {
    ...stats,
    durationMs,
    section: BOOKING_SECTION_TITLE,
    worksheetTitle: sheetRead.worksheetTitle,
    rowsProcessed,
    validationMismatches,
    rateOnlyRowsRejected: typeof rateOnlyRowsRejected === "number" ? rateOnlyRowsRejected : 0,
    alreadyExisting: stats.alreadyExisting || 0,
    invalidRows: stats.invalidRows || 0,
    changesRequiringReview: stats.changesRequiringReview || 0,
    changedRecords: stats.changedRecords || [],
    duplicateRecords,
    invalidGuestRecords,
  };
}
