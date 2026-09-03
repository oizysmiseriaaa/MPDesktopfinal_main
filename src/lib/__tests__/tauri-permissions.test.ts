import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const capabilityPath = resolve(
  __dirname,
  "../../../src-tauri/capabilities/default.json",
);

describe("Tauri desktop export permissions", () => {
  it("allows Desktop/ManilaPrime export folders", () => {
    const capabilityConfig = readFileSync(capabilityPath, "utf8");

    expect(capabilityConfig).toContain('"path": "$DESKTOP/ManilaPrime"');
    expect(capabilityConfig).toContain('"path": "$DESKTOP/ManilaPrime/*"');
    expect(capabilityConfig).toContain(
      '"path": "$DESKTOP/ManilaPrime/Bookings"',
    );
    expect(capabilityConfig).toContain(
      '"path": "$DESKTOP/ManilaPrime/Bookings/*"',
    );
    expect(capabilityConfig).toContain(
      '"path": "$DESKTOP/ManilaPrime/Quotations"',
    );
    expect(capabilityConfig).toContain(
      '"path": "$DESKTOP/ManilaPrime/Quotations/*"',
    );
    expect(capabilityConfig).toContain('"path": "$DESKTOP/ManilaPrime/SOA"');
    expect(capabilityConfig).toContain('"path": "$DESKTOP/ManilaPrime/SOA/*"');
    expect(capabilityConfig).toContain('"fs:allow-exists"');
  });
});
