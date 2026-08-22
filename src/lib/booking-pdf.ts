"use client";

import { jsPDF } from "jspdf";

export type BookingDocumentType = "quotation" | "statement";

const numeric = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const money = (value: unknown) =>
  `PHP ${numeric(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const displayDate = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value).split("T")[0]
    : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
};

const imageData = async (source: string) => {
  const response = await fetch(source);
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
  value.replace(/[^a-z0-9]+/gi, "").slice(0, 80) || "Guest";

const documentSequence = (booking: any) => {
  const explicit =
    booking?.bookingNumber || booking?.bookingNo || booking?.sequence;
  if (explicit && /\d+/.test(String(explicit)))
    return String(explicit).match(/\d+/)?.[0].padStart(4, "0") || "0001";
  const id = String(booking?.id || "1");
  let hash = 0;
  for (let index = 0; index < id.length; index += 1)
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return String((hash % 9999) + 1).padStart(4, "0");
};

export async function createBookingPdf({
  type,
  booking,
  unit,
  preparedBy,
}: {
  type: BookingDocumentType;
  booking: any;
  unit: any;
  preparedBy?: string | null;
}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const left = 18;
  const right = 192;
  const year = new Date().getFullYear();
  const prefix = type === "quotation" ? "QUO" : "SOA";
  const number = `${prefix}-${year}-${documentSequence(booking)}`;
  const guest =
    `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
    booking?.guestName ||
    "Valued Guest";
  const nights = Math.max(
    0,
    Math.round(
      (new Date(booking?.checkoutDate).getTime() -
        new Date(booking?.checkinDate).getTime()) /
        86400000,
    ),
  );
  const pax = numeric(booking?.adults, 0) + numeric(booking?.children, 0);
  const rate = numeric(unit?.rate ?? booking?.nightlyRate);
  const roomCharge = numeric(booking?.totalAmount);
  const deposit = numeric(
    booking?.securityDeposit?.amount ?? booking?.securityDepositAmount,
  );
  const additional = numeric(
    booking?.additionalCharges ?? booking?.additionalCharge,
  );
  const discount = numeric(booking?.discount ?? booking?.discountAmount);
  const grandTotal = numeric(booking?.grandTotal ?? booking?.totalAmount);
  const paid = numeric(booking?.bookingPayment?.amount ?? booking?.amountPaid);
  const remaining = numeric(
    booking?.remainingBalance,
    Math.max(0, grandTotal - paid),
  );
  const status =
    booking?.paymentStatus ||
    booking?.bookingPaymentStatus ||
    booking?.bookingPayment?.status ||
    "Unpaid";
  const unitName =
    unit?.name || unit?.unitNumber || booking?.unitName || "Unassigned";
  const bookingNumber =
    booking?.bookingNumber || booking?.bookingNo || booking?.id || "—";

  const [logo, signature] = await Promise.all([
    imageData("/manila-prime-staycation-logo.png"),
    imageData("/representative-signature.png"),
  ]);
  pdf.addImage(logo, "PNG", left, 14, 34, 20);
  pdf.setTextColor(30, 30, 30);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("MANILA PRIME STAYCATION", 56, 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Professional staycation management", 56, 27);
  pdf.setFillColor(17, 24, 39);
  pdf.roundedRect(132, 14, 60, 21, 2, 2, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(
    type === "quotation" ? "QUOTATION" : "STATEMENT OF ACCOUNT",
    188,
    22,
    { align: "right" },
  );
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.text(number, 188, 28, { align: "right" });

  let y = 47;
  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(9);
  const info = [
    ["Guest Name", guest],
    ["Unit", unitName],
    ["Booking Number", String(bookingNumber)],
    ["Date Generated", displayDate(new Date())],
    ["Check-in Date", displayDate(booking?.checkinDate)],
    ["Check-out Date", displayDate(booking?.checkoutDate)],
    ["Number of Nights", String(nights)],
    ["Number of Guests", String(pax)],
  ];
  info.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = left + column * 88;
    const rowY = y + row * 10;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 100, 100);
    pdf.text(label, x, rowY);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(30, 30, 30);
    pdf.text(value, x, rowY + 4);
  });
  y += 47;
  pdf.setFillColor(236, 239, 241);
  pdf.rect(left, y, right - left, 8, "F");
  pdf.setTextColor(30, 30, 30);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  const headers = [
    "Room No.",
    "Check-in",
    "Check-out",
    "Pax",
    "Nights",
    "Rate / Night",
    "Amount",
  ];
  const positions = [
    left + 2,
    left + 29,
    left + 57,
    left + 84,
    left + 97,
    left + 114,
    right - 2,
  ];
  headers.forEach((header, index) =>
    pdf.text(header, positions[index], y + 5, {
      align: index === 6 ? "right" : "left",
    }),
  );
  y += 14;
  pdf.setFont("helvetica", "normal");
  const values = [
    unitName,
    displayDate(booking?.checkinDate),
    displayDate(booking?.checkoutDate),
    String(pax),
    String(nights),
    money(rate),
    money(roomCharge),
  ];
  values.forEach((value, index) =>
    pdf.text(value, positions[index], y, {
      align: index === 6 ? "right" : "left",
      maxWidth: index === 0 ? 25 : undefined,
    }),
  );
  y += 6;
  pdf.setDrawColor(210, 210, 210);
  pdf.line(left, y, right, y);
  y += 11;

  const summary: Array<[string, number]> = [["Room Charge", roomCharge]];
  if (deposit > 0) summary.push(["Security Deposit", deposit]);
  if (additional !== 0) summary.push(["Additional Charges", additional]);
  if (discount !== 0) summary.push(["Discount", discount]);
  summary.push(["Grand Total", grandTotal]);
  pdf.setFontSize(9);
  summary.forEach(([label, amount]) => {
    const grand = label === "Grand Total";
    pdf.setFont("helvetica", grand ? "bold" : "normal");
    pdf.setTextColor(30, 30, 30);
    pdf.text(label, 132, y);
    pdf.text(money(amount), right, y, { align: "right" });
    y += 7;
  });
  if (type === "statement") {
    y += 3;
    pdf.setDrawColor(210, 210, 210);
    pdf.line(128, y, right, y);
    y += 7;
    [
      ["Amount Paid", paid],
      ["Remaining Balance", remaining],
    ].forEach(([label, amount]) => {
      pdf.setFont("helvetica", "bold");
      pdf.text(String(label), 132, y);
      pdf.text(money(amount), right, y, { align: "right" });
      y += 7;
    });
    pdf.text("Payment Status", 132, y);
    pdf.text(String(status), right, y, { align: "right" });
    y += 10;
  }

  y = Math.max(y + 8, 186);
  pdf.setDrawColor(210, 210, 210);
  pdf.line(left, y, right, y);
  y += 9;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Payment Options", left, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  // Print-safe monochrome bank and wallet marks, drawn as vectors so the PDF has no emoji dependency.
  pdf.setDrawColor(30, 30, 30);
  pdf.setFillColor(30, 30, 30);
  pdf.triangle(left, y - 4, left + 4, y - 8, left + 8, y - 4, "F");
  pdf.rect(left + 1, y - 3, 6, 1, "F");
  pdf.rect(108, y - 7, 9, 6, "S");
  pdf.line(108, y - 5, 117, y - 5);
  pdf.circle(115, y - 3, 0.6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.text("BDO Bank", left + 11, y);
  pdf.text("GCash", 120, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text("Account Number: 012700035484", left, y);
  pdf.text("Number: 0985 060 0545", 108, y);
  y += 5;
  pdf.text("Account Name: Manila Prime Staycation", left, y);
  pdf.text("Account Name: Jo...N. P.", 108, y);
  y += 15;
  pdf.addImage(signature, "PNG", left, y - 11, 39, 13);
  pdf.setDrawColor(120, 120, 120);
  pdf.line(left, y + 4, left + 52, y + 4);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Rey Arjay R. Patiag", left, y + 9);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Authorized Representative", left, y + 14);
  pdf.text(`Prepared by: ${preparedBy || "Current Administrator"}`, 108, y + 9);
  pdf.setTextColor(115, 115, 115);
  pdf.setFontSize(7);
  pdf.text("This document was generated by HostFlow.", pageWidth / 2, 287, {
    align: "center",
  });

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    number,
    fileName: `${number}-${safeName(guest)}.pdf`,
  };
}
