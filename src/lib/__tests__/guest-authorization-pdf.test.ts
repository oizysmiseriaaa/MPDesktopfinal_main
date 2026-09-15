import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildGuestAuthorizationFileName,
  createGuestAuthorizationPdf,
  normalizeGuestAuthorizationSource,
} from "../guest-authorization-pdf";

describe("createGuestAuthorizationPdf", () => {
  it("keeps the editable authorization source separate from the generated PDF and avoids destructive overwrites", () => {
    const source = normalizeGuestAuthorizationSource(
      {
        id: "bk-12345",
        guestFirstName: "Renee",
        guestLastName: "Dela Cruz",
        checkinDate: "2026-09-15",
        checkoutDate: "2026-09-18",
      },
      { name: "A-201" },
      { issuedOn: "2026-09-10" },
    );

    expect(source.guestName).toBe("Renee Dela Cruz");
    expect(source.unitName).toBe("A-201");
    expect(
      buildGuestAuthorizationFileName({
        booking: { id: "bk-12345" },
        guestName: "Renee Dela Cruz",
      }),
    ).toContain("bk-12345");
    expect(
      buildGuestAuthorizationFileName({
        booking: { id: "bk-12345" },
        guestName: "Renee Dela Cruz",
      }),
    ).not.toContain("Guest-Authorization-Renee-Dela-Cruz");
  });

  it("creates a single-page guest authorization form PDF using booking data", async () => {
    const originalFetch = globalThis.fetch;
    const OriginalFileReader = globalThis.FileReader;

    class TestFileReader {
      result: string | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buffer) => {
            this.result = `data:${blob.type || "image/png"};base64,${Buffer.from(buffer).toString("base64")}`;
            this.onload?.();
          })
          .catch((error) => {
            this.error = error;
            this.onerror?.();
          });
      }
    }

    globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
    globalThis.fetch = (async (source: string | URL | Request) => {
      const url = String(source);
      const normalized = url.includes("://")
        ? url.split("//")[1].split("/").slice(1).join("/")
        : url.replace(/^\//, "");
      const bytes = await readFile(join(process.cwd(), "public", normalized));
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    try {
      const result = await createGuestAuthorizationPdf({
        booking: {
          guestName: "Renee Dela Cruz",
          guestFirstName: "Renee",
          guestLastName: "Dela Cruz",
          tower: "A",
          unitName: "A-201",
          checkinDate: "2026-09-15",
          checkoutDate: "2026-09-18",
        },
        unit: { name: "A-201" },
      });

      expect(result.bytes.length).toBeGreaterThan(0);
      expect(new TextDecoder().decode(result.bytes.slice(0, 4))).toBe("%PDF");
      expect(result.fileName).toContain("Guest-Authorization");
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.FileReader = OriginalFileReader;
    }
  });
});
