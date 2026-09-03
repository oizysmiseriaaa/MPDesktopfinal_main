import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import { apiClient } from "../api-client";

describe("apiClient authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the Firebase ID token as a Bearer token to the production API", async () => {
    const getIdToken = vi.fn().mockResolvedValue("firebase-id-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const auth = {
      currentUser: { uid: "user-1", getIdToken },
    } as unknown as Auth;

    await apiClient.get("/auth-regression-test", auth);

    expect(getIdToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://asia-southeast1-unified-booker.cloudfunctions.net/api/auth-regression-test",
      expect.objectContaining({
        headers: expect.objectContaining({
          get: expect.any(Function),
        }),
      }),
    );
    const requestHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(requestHeaders.get("Authorization")).toBe("Bearer firebase-id-token");
  });
});
