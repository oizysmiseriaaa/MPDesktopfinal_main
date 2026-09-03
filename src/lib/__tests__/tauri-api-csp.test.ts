import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("Tauri production API access", () => {
  it("allows the deployed Cloud Functions API origin in connect-src", () => {
    const config = readFileSync(
      resolve(process.cwd(), "src-tauri/tauri.conf.json"),
      "utf8",
    );

    expect(config).toContain(
      "https://asia-southeast1-unified-booker.cloudfunctions.net",
    );
  });
});
