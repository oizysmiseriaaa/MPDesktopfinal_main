"use client";

import { jsPDF } from "jspdf";

const imageData = async (source: string) => {
  const normalized = source.startsWith("/")
    ? new URL(
        source,
        typeof window !== "undefined"
          ? window.location.href
          : "http://localhost",
      ).toString()
    : source;

  const response = await fetch(normalized);
  if (!response.ok) throw new Error(`Unable to load ${source}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const safeName = (value: string) =>
  value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "guest";

export const normalizeGuestAuthorizationSource = (
  booking: any,
  unit?: any,
  options: { issuedOn?: string | Date } = {},
) => {
  const guestName =
    `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
    booking?.guestName ||
    booking?.name ||
    "Guest";

  const issued = options.issuedOn ? new Date(options.issuedOn) : new Date();
  const checkin = toInputDate(booking?.checkinDate || booking?.arrivalDate);
  const checkout = toInputDate(booking?.checkoutDate || booking?.departureDate);

  return {
    id: String(booking?.id || booking?.bookingId || ""),
    guestName,
    guestFirstName: booking?.guestFirstName || guestName.split(" ")[0] || "",
    guestLastName:
      booking?.guestLastName || guestName.split(" ").slice(1).join(" ") || "",
    tower:
      booking?.tower ||
      booking?.towerName ||
      unit?.tower ||
      unit?.towerName ||
      "",
    unitName: getBookingUnitName(booking, unit),
    unitId: String(booking?.unitId || unit?.id || ""),
    checkinDate: checkin,
    checkoutDate: checkout,
    issuedOn: issued.toISOString().slice(0, 10),
    createdAt: booking?.createdAt || new Date().toISOString(),
    updatedAt: booking?.updatedAt || new Date().toISOString(),
  };
};

export const buildGuestAuthorizationFileName = ({
  booking,
  guestName,
  issuedOn,
}: {
  booking?: any;
  guestName?: string;
  issuedOn?: string | Date;
}) => {
  const baseGuest = safeName(guestName || getBookingGuestName(booking || {}));
  const bookingIdentifier =
    String(booking?.id || booking?.bookingId || "").trim() ||
    String(booking?.bookingNumber || booking?.bookingNo || "").trim();
  const issued = issuedOn ? new Date(issuedOn).toISOString().slice(0, 10) : "";
  const prefix = bookingIdentifier
    ? `Guest-Authorization-${bookingIdentifier}`
    : "Guest-Authorization";
  return issued
    ? `${prefix}-${baseGuest}-${issued}.pdf`
    : `${prefix}-${baseGuest}.pdf`;
};

const toInputDate = (value?: string | Date) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).split("T")[0];
};

const toMonthDayYear = (value?: string | Date) => {
  if (!value) return { day: "", month: "", year: "" };
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    const parts = String(value).split("-");
    if (parts.length === 3) {
      return {
        day: parts[2] || "",
        month: new Date(
          `${parts[0]}-${parts[1]}-01T00:00:00`,
        ).toLocaleDateString("en-US", { month: "long" }),
        year: parts[0] || "",
      };
    }
    return { day: "", month: "", year: "" };
  }

  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString("en-US", { month: "long" }),
    year: String(date.getFullYear()),
  };
};

const ordinal = (value: number) => {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

const getBookingTower = (booking: any, unit: any) =>
  booking?.tower || booking?.towerName || unit?.tower || unit?.towerName || "";

const getBookingUnitName = (booking: any, unit: any) =>
  booking?.unitName ||
  booking?.unitNumber ||
  unit?.name ||
  unit?.unitNumber ||
  "";

const getBookingGuestName = (booking: any) =>
  `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
  booking?.guestName ||
  booking?.name ||
  "Guest";

const getBookingDateRange = (booking: any) => {
  const checkin = toInputDate(booking?.checkinDate || booking?.arrivalDate);
  const checkout = toInputDate(booking?.checkoutDate || booking?.departureDate);
  return { checkin, checkout };
};

const wrapText = (pdf: jsPDF, text: string, width: number) =>
  pdf.splitTextToSize(text, width);

const drawParagraphBlock = ({
  pdf,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  fontSize,
  fontStyle = "normal",
  fontName = "helvetica",
  color = [0, 0, 0],
}: {
  pdf: jsPDF;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  fontSize: number;
  fontStyle?: "normal" | "bold" | "italic";
  fontName?: string;
  color?: [number, number, number];
}) => {
  pdf.setFont(fontName, fontStyle);
  pdf.setFontSize(fontSize);
  pdf.setTextColor(color[0], color[1], color[2]);
  const lines = wrapText(pdf, text, maxWidth);
  const arr = Array.isArray(lines) ? lines : [lines];
  pdf.text(arr, x, y);
  return { lines: arr, height: arr.length * lineHeight };
};

const drawMixedWeightedParagraph = ({
  pdf,
  runs,
  x,
  y,
  maxWidth,
  lineHeight,
  fontSize,
  color = [0, 0, 0],
}: {
  pdf: jsPDF;
  runs: Array<{ text: string; bold?: boolean }>;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  fontSize: number;
  color?: [number, number, number];
}) => {
  const lines: Array<Array<{ text: string; bold: boolean; width: number }>> =
    [];
  let currentLine: Array<{ text: string; bold: boolean; width: number }> = [];
  let currentWidth = 0;

  for (const run of runs) {
    pdf.setFont("helvetica", run.bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    const width = pdf.getTextWidth(run.text);

    if (currentLine.length > 0 && currentWidth + width > maxWidth) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }

    currentLine.push({ text: run.text, bold: Boolean(run.bold), width });
    currentWidth += width;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  let maxLineCount = 0;
  for (const line of lines) {
    const lineHeightThisLine = line.length ? lineHeight : 0;
    maxLineCount = Math.max(maxLineCount, lineHeightThisLine);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let cursorX = x;
    for (const run of line) {
      pdf.setFont("helvetica", run.bold ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      pdf.setTextColor(color[0], color[1], color[2]);
      pdf.text(run.text, cursorX, y + index * lineHeight);
      cursorX += run.width;
    }
  }

  return { height: Math.max(lines.length * lineHeight, lineHeight), lines };
};

const drawGuestTable = ({
  pdf,
  x,
  y,
  width,
  guestName,
}: {
  pdf: jsPDF;
  x: number;
  y: number;
  width: number;
  guestName: string;
}) => {
  const headerHeight = 24;
  const rowHeight = 34;
  const totalHeight = headerHeight + rowHeight * 3;
  const columnRatios = [0.25, 0.25, 0.25, 0.25];
  const colPositions = [
    x,
    x + width * columnRatios[0],
    x + width * (columnRatios[0] + columnRatios[1]),
    x + width * (columnRatios[0] + columnRatios[1] + columnRatios[2]),
  ];

  pdf.setDrawColor(120, 120, 120);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, width, totalHeight, "S");

  pdf.line(x, y + headerHeight, x + width, y + headerHeight);
  pdf.line(
    x,
    y + headerHeight + rowHeight,
    x + width,
    y + headerHeight + rowHeight,
  );
  pdf.line(
    x,
    y + headerHeight + rowHeight * 2,
    x + width,
    y + headerHeight + rowHeight * 2,
  );

  pdf.line(colPositions[1], y, colPositions[1], y + totalHeight);
  pdf.line(colPositions[2], y, colPositions[2], y + totalHeight);
  pdf.line(colPositions[3], y, colPositions[3], y + totalHeight);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Name of Guest(s)", x + 8, y + 16);
  pdf.text("Signature of Guest(s)", colPositions[1] + 8, y + 16);
  pdf.text("Proof of Identification", colPositions[2] + 8, y + 16);
  pdf.text("Relationship with Unit", colPositions[3] + 8, y + 12);
  pdf.text("Owner", colPositions[3] + 38, y + 22);

  const nameCellWidth = colPositions[1] - x - 10;
  const guestLines = wrapText(pdf, guestName || "Guest", nameCellWidth);
  const guestLineArray = Array.isArray(guestLines) ? guestLines : [guestLines];
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const guestTextY = y + headerHeight + 18;
  pdf.text(guestLineArray, x + 8, guestTextY);

  return totalHeight;
};

const drawDateAndSignatureSection = async ({
  pdf,
  x,
  y,
  width,
  dateParts,
  signatureImage,
}: {
  pdf: jsPDF;
  x: number;
  y: number;
  width: number;
  dateParts: { day: string; month: string; year: string };
  signatureImage: string;
}) => {
  const leftColWidth = 260;
  const rightColX = x + leftColWidth + 22;
  const rightColWidth = width - leftColWidth - 22;
  const blockHeight = 74;

  const dateArea = { x, y, width: leftColWidth, height: blockHeight };
  const sigBox = {
    x: rightColX,
    y,
    width: rightColWidth,
    height: blockHeight,
  };

  const dayText = `${ordinal(Number(dateParts.day || 1))}`;
  const monthText = dateParts.month || "__________";
  const yearText = dateParts.year ? String(dateParts.year).slice(-2) : "__";
  const dateText = `${dayText} day of ${monthText}, 20${yearText}`;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text(`Given this ${dateText}`, dateArea.x, dateArea.y + 16);

  const img = await imageData(signatureImage);
  const signatureImageWidth = 160;
  const signatureImageHeight = 32;
  const imageX = sigBox.x + (sigBox.width - signatureImageWidth) / 2;
  const imageY = sigBox.y + 2;

  pdf.addImage(
    img,
    "PNG",
    imageX,
    imageY,
    signatureImageWidth,
    signatureImageHeight,
  );

  pdf.setDrawColor(120, 120, 120);
  pdf.line(
    sigBox.x + 10,
    sigBox.y + 40,
    sigBox.x + sigBox.width - 10,
    sigBox.y + 40,
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.2);
  const labelText =
    "Signature over Printed Name of\nUnit owner or Authorized Representative (with SPA)";
  const labelLines = wrapText(pdf, labelText, sigBox.width - 18);
  const labelArray = Array.isArray(labelLines) ? labelLines : [labelLines];
  const labelStartY = sigBox.y + 48;
  pdf.text(labelArray, sigBox.x + 8, labelStartY);

  return blockHeight;
};

export async function createGuestAuthorizationPdf({
  booking,
  unit,
  issuedOn,
  source,
}: {
  booking: any;
  unit?: any;
  issuedOn?: string | Date;
  source?: ReturnType<typeof normalizeGuestAuthorizationSource>;
}) {
  if (!booking) {
    throw new Error(
      "A booking is required to generate the guest authorization form.",
    );
  }

  const pdf = new jsPDF({ unit: "pt", format: [612, 792] });
  const pageWidth = 612;
  const pageHeight = 792;
  const left = 58;
  const bodyFont = "helvetica";
  const boldFont = "helvetica";

  const editableSource =
    source || normalizeGuestAuthorizationSource(booking, unit, { issuedOn });
  const guestName = editableSource.guestName;
  const tower = editableSource.tower;
  const unitName = editableSource.unitName;
  const checkin = editableSource.checkinDate;
  const checkout = editableSource.checkoutDate;
  const issued = new Date(editableSource.issuedOn || issuedOn || new Date());
  const dateParts = toMonthDayYear(issued);

  const shoreLogo = await imageData("/shore.png");
  const signatureImage = "/name_signature.png";

  const PAGE_MARGIN_X = 58;
  const PAGE_MARGIN_TOP = 20;
  const BOTTOM_MARGIN = 30;
  const SECTION_SPACING = 12;

  let currentY = PAGE_MARGIN_TOP;

  pdf.addImage(shoreLogo, "PNG", 50, 14, 130, 30);
  currentY += 42;

  pdf.setFillColor(18, 64, 106);
  pdf.roundedRect(72, currentY + 6, 468, 30, 2, 2, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(boldFont, "bold");
  pdf.setFontSize(18);
  pdf.text("GUEST AUTHORIZATION FORM", pageWidth / 2, currentY + 26, {
    align: "center",
  });
  currentY += 34 + SECTION_SPACING;

  const authorizationBlock = drawMixedWeightedParagraph({
    pdf,
    runs: [
      {
        text: "This is to authorize the following guest(s) to occupy and use my unit located at ",
        bold: false,
      },
      {
        text: `Tower Unit ${unitName || "__________"}`,
        bold: true,
      },
      {
        text: " for the period covering from ",
        bold: false,
      },
      {
        text: `${checkin || "__________"} to ${checkout || "__________"}.`,
        bold: true,
      },
    ],
    x: left,
    y: currentY + 8,
    maxWidth: 490,
    lineHeight: 12,
    fontSize: 9.5,
    color: [0, 0, 0],
  });
  currentY += authorizationBlock.height + 14;

  const guestTableX = 60;
  const guestTableWidth = 492;
  const guestTableHeight = drawGuestTable({
    pdf,
    x: guestTableX,
    y: currentY,
    width: guestTableWidth,
    guestName,
  });
  currentY += guestTableHeight + 18;

  const certificationText =
    "This is to certify that I have oriented my guest(s) on the existing house rules and regulations of the Condominium Corporation (including some of the most applicable house rules itemized below) and that any violations that will be committed by my guest(s) will be my liability to the Condominium Corporation.";
  const certificationBlock = drawParagraphBlock({
    pdf,
    text: certificationText,
    x: left,
    y: currentY + 6,
    maxWidth: 500,
    lineHeight: 11.5,
    fontSize: 9.5,
    color: [0, 0, 0],
  });
  currentY += certificationBlock.height + 16;

  const signatureSectionHeight = await drawDateAndSignatureSection({
    pdf,
    x: left,
    y: currentY,
    width: 492,
    dateParts,
    signatureImage,
  });
  currentY += signatureSectionHeight + 18;

  const sectionTitleY = currentY + 2;
  pdf.setFont(boldFont, "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("HOUSE RULES AND REGULATIONS:", left, sectionTitleY);
  pdf.setDrawColor(18, 64, 106);
  pdf.line(left, sectionTitleY + 4, 520, sectionTitleY + 4);
  currentY += 18;

  const houseRules = [
    "1. Unit owners, tenants and/or their guests are not allowed to house or keep pets of any kind in the project, even on temporary basis.",
    "2. Except for designated smoking areas, smoking is strictly prohibited within the project.",
    "3. Swimming pool may be used by the authorized guest(s) provided they pay the corresponding fees (Php 150.00 for REGULAR days and Php 300.00 for HOLIDAYS). Posted swimming pool rules and regulations shall be strictly followed by all authorized guests.",
    "4. Usage of other amenities is subject to applicable fees, except for those that are for exclusive use of registered unit owners/ residents (e.g., gym, student lounge).",
    "5. Parking accommodation will not be provided to the guests by the Condominium Corporation.",
  ];

  pdf.setFont(bodyFont, "normal");
  pdf.setFontSize(8.6);
  let houseY = currentY;
  for (const rule of houseRules) {
    const wrapped = wrapText(pdf, rule, 500);
    const lines = Array.isArray(wrapped) ? wrapped : [wrapped];
    pdf.text(lines, 72, houseY);
    houseY += Math.max(lines.length, 1) * 10 + 2;
  }
  currentY = houseY + 18;

  pdf.setFont(boldFont, "bold");
  pdf.setFontSize(11);
  pdf.text("GUEST HANDLING POLICY AND PROCEDURE:", left, currentY);
  pdf.line(left, currentY + 4, 520, currentY + 4);
  currentY += 20;

  const guestHandlingRules = [
    "1. The Guest Authorization Form (GAF) should be filled out by the unit owner or authorized representative, issued with a Special Power of Attorney (SPA).",
    "2. The GAF should be submitted at least one (1) day prior to the arrival of guest.",
    "3. At least one (1) valid proof of identification (Copy of the passport for foreigners) of the guest/s should be presented and used as an attachment for the GAF.",
    "4. The guest shall not be allowed to move in unless the GAF is submitted and acknowledged by the Property Manager.",
    "5. The unit owner / authorized representative is responsible for the welfare of the guest/s during the duration of the stay inside the unit.",
    "6. For security and safety purposes, guests will go through bag check procedures upon arrival at the project.",
    '7. For safety and security purposes, the residential units shall not be used as an office, recruitment agency, teaching facility of any sort, shop, manufacturing facility, boarding house, dormitory, transient or other "bed space type" establishment.',
    "8. All unit owners, tenants, and/or residents of the building, guest, building personnel, contractors and service providers are REQUIRED to follow and comply with the governing House Rules and Regulations to avoid property and personal risk as well as inconvenience as a consequence of violation/s of the provisions of the House Rules.",
  ];

  pdf.setFont(bodyFont, "normal");
  pdf.setFontSize(8.6);
  let policyY = currentY;
  for (const rule of guestHandlingRules) {
    const wrapped = wrapText(pdf, rule, 500);
    const lines = Array.isArray(wrapped) ? wrapped : [wrapped];
    pdf.text(lines, 72, policyY);
    policyY += Math.max(lines.length, 1) * 10 + 2;
  }

  if (policyY > pageHeight - BOTTOM_MARGIN) {
    const overflowAmount = policyY - (pageHeight - BOTTOM_MARGIN);
    const shrinkRatio = Math.max(0.82, 1 - overflowAmount / 220);
    pdf.setFontSize(8.6 * shrinkRatio);
  }

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    fileName: buildGuestAuthorizationFileName({
      booking,
      guestName,
      issuedOn: editableSource.issuedOn,
    }),
    source: editableSource,
  };
}

export default createGuestAuthorizationPdf;
