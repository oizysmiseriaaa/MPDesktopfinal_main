import { describe, expect, it } from "vitest";
import { getMissingOfficialUnits, normalizeUnitKey } from "../official-units";

describe("official units helpers", () => {
  it("matches existing units case-insensitively and skips duplicates", () => {
    const existingUnits = [
      { id: "1", name: "438 B", unitNumber: "438 B" },
      { id: "2", name: "1586 C2", unitNumber: "1586 C2" },
    ];

    const missing = getMissingOfficialUnits(existingUnits as any[]);

    expect(missing.map((entry) => entry.name)).toContain("447 B");
    expect(missing.map((entry) => entry.name)).not.toContain("438 B");
    expect(missing.map((entry) => entry.name)).not.toContain("1586 C2");
  });

  it("normalizes unit labels consistently", () => {
    expect(normalizeUnitKey("438 B")).toBe("438b");
    expect(normalizeUnitKey("Parking 109-A")).toBe("parking109a");
    expect(normalizeUnitKey("S3T1-372")).toBe("s3t1372");
  });
});
