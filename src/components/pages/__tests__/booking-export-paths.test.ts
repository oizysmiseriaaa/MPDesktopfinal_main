import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(resolve(process.cwd(), "src/components/pages", file), "utf8");

describe("booking export destinations", () => {
  it("writes Booking page images and documents under Desktop/ManilaPrime folders", () => {
    const bookings = source("bookings-client.tsx");

    expect(bookings).toContain(
      "return `ManilaPrime/Bookings/${date}_${unitName}_${identifier}.png`;",
    );
    expect(bookings).toContain(
      'type === "quotation" ? "ManilaPrime/Quotations" : "ManilaPrime/SOA"',
    );
    expect(bookings).toContain("baseDir: BaseDirectory.Desktop");
    expect(bookings).toContain("scale: 1,");
    expect(bookings).toContain("canvas.toBlob");
    expect(bookings).not.toContain("BaseDirectory.Document");
  });

  it("writes Calendar images and documents under Desktop/ManilaPrime folders", () => {
    const calendar = source("calendar-client.tsx");

    expect(calendar).toContain('const folder = "ManilaPrime/Bookings";');
    expect(calendar).toContain(
      'type === "quotation" ? "ManilaPrime/Quotations" : "ManilaPrime/SOA"',
    );
    expect(calendar).toContain("baseDir: BaseDirectory.Desktop");
    expect(calendar).toContain("scale: 1,");
    expect(calendar).toContain("canvas.toBlob");
    expect(calendar).not.toContain('toast({ title: "Booking image saved" });');
    expect(calendar).not.toContain("BaseDirectory.Document");
  });
});
