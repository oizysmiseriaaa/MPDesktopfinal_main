import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  calculateBookingDocumentFinancials,
  createBookingPdf,
} from "../booking-pdf";

describe("calculateBookingDocumentFinancials", () => {
  it("reconciles quotation and SOA totals from the existing booking fields", () => {
    const financials = calculateBookingDocumentFinancials(
      {
        checkinDate: "2026-08-29",
        checkoutDate: "2026-09-02",
        totalAmount: 7200,
        additionalCharges: 300,
        discount: 500,
        securityDeposit: { amount: 1000 },
        bookingPayment: { amount: 2500 },
      },
      { rate: 1800 },
    );

    expect(financials.nights).toBe(4);
    expect(financials.rate * financials.nights).toBe(financials.roomCharge);
    expect(financials.grandTotal).toBe(8000);
    expect(financials.grandTotal - financials.paid).toBe(
      financials.balanceDue,
    );
    expect(financials.balanceDue).toBe(5500);
  });

  it("uses the stored total to derive a consistent rate for custom pricing", () => {
    const financials = calculateBookingDocumentFinancials(
      {
        checkinDate: "2026-08-01",
        checkoutDate: "2026-08-04",
        totalAmount: 5000,
      },
      { rate: 1800 },
    );

    expect(financials.rate).toBeCloseTo(5000 / 3);
    expect(financials.rate * financials.nights).toBeCloseTo(
      financials.roomCharge,
    );
  });

  it("uses the reconciled ledger payment total for an SOA balance", () => {
    const financials = calculateBookingDocumentFinancials(
      {
        checkinDate: "2026-08-01",
        checkoutDate: "2026-08-04",
        totalAmount: 5400,
        paidTotal: 1800,
        // This is a stale legacy nested draft amount and must not win.
        bookingPayment: { amount: 0 },
      },
      { rate: 1800 },
    );

    expect(financials.paid).toBe(1800);
    expect(financials.balanceDue).toBe(financials.grandTotal - 1800);
  });

  it("includes a separately received security deposit in SOA payments", () => {
    const financials = calculateBookingDocumentFinancials(
      {
        checkinDate: "2026-08-01",
        checkoutDate: "2026-08-04",
        totalAmount: 5400,
        securityDeposit: { amount: 1000 },
        bookingPayment: { amount: 1800 },
        securityDepositReceipt: { amount: 1000, status: "Received" },
      },
      { rate: 1800 },
    );

    expect(financials.subtotal).toBe(5400);
    expect(financials.grandTotal).toBe(6400);
    expect(financials.bookingPayment).toBe(1800);
    expect(financials.depositPayment).toBe(1000);
    expect(financials.paid).toBe(2800);
    expect(financials.balanceDue).toBe(3600);
  });

  it("preserves an overpayment as a credit instead of presenting a negative due", () => {
    const financials = calculateBookingDocumentFinancials(
      {
        checkinDate: "2026-08-01",
        checkoutDate: "2026-08-02",
        totalAmount: 1000,
        bookingPayment: { amount: 1200 },
      },
      { rate: 1000 },
    );

    expect(financials.balanceDue).toBe(-200);
  });
});

describe("createBookingPdf", () => {
  it("generates both documents with the optional signature absent", async () => {
    const originalFetch = globalThis.fetch;
    const OriginalFileReader = globalThis.FileReader;
    const publicDir = join(process.cwd(), "public");
    let signatureAvailable = true;

    class TestFileReader {
      result: string | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type || "image/png"};base64,${Buffer.from(buffer).toString("base64")}`;
          this.onload?.();
        }).catch((error) => {
          this.error = error;
          this.onerror?.();
        });
      }
    }

    globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
    globalThis.fetch = (async (source: string | URL | Request) => {
      const path = String(source);
      if (path === "/rep_sig.png" && !signatureAvailable)
        return new Response(null, { status: 404 });
      const name = path.replace(/^\//, "");
      const bytes = await readFile(join(publicDir, name));
      return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch;

    const booking = {
      id: "BK-2026-0812-0042",
      guestFirstName: "Kyle",
      guestLastName: "Rivera",
      checkinDate: "2026-08-08",
      checkoutDate: "2026-08-12",
      adults: 2,
      totalAmount: 7200,
      securityDeposit: { amount: 1000 },
      bookingPayment: { amount: 2500, status: "Paid" },
    };

    try {
      const [quotation, statement] = await Promise.all([
        createBookingPdf({ type: "quotation", booking, unit: { name: "1537 C2", rate: 1800 } }),
        createBookingPdf({ type: "statement", booking, unit: { name: "1537 C2", rate: 1800 } }),
      ]);
      expect(quotation.number).toMatch(/^QUO-2026-/);
      expect(statement.number).toMatch(/^SOA-2026-/);
      expect(new TextDecoder().decode(quotation.bytes.slice(0, 4))).toBe("%PDF");
      expect(new TextDecoder().decode(statement.bytes.slice(0, 4))).toBe("%PDF");

      signatureAvailable = false;
      const withoutSignature = await createBookingPdf({
        type: "quotation",
        booking,
        unit: { name: "1537 C2", rate: 1800 },
      });
      expect(new TextDecoder().decode(withoutSignature.bytes.slice(0, 4))).toBe("%PDF");
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.FileReader = OriginalFileReader;
    }
  });
});
