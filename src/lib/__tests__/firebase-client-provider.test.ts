import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("Firebase client provider bootstrap", () => {
  it("uses a dedicated initializer module instead of the firebase barrel entrypoint", () => {
    const clientProviderSource = readFileSync(
      resolve(process.cwd(), "src/firebase/client-provider.tsx"),
      "utf8",
    );    expect(clientProviderSource).toContain('from "@/firebase/init"');
    expect(clientProviderSource).not.toContain("from '@/firebase'");
    expect(clientProviderSource).not.toContain('from "@/firebase"');
  });
});
