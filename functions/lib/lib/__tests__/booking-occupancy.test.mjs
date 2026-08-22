import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getBookingOccupancyLockRefs } = require("../route-helpers.js");

const db = {
  collection(name) {
    return { doc: (id) => ({ path: `${name}/${id}`, id }) };
  },
};

describe("booking occupancy lock keys", () => {
  it("locks each occupied night and permits a back-to-back checkout", () => {
    const refs = getBookingOccupancyLockRefs(db, {
      unitId: "1532 B",
      checkinDate: "2026-06-10",
      checkoutDate: "2026-06-15",
    });
    expect(refs).toHaveLength(5);
    expect(refs.map((ref) => ref.id)).toEqual([
      "MTUzMiBC__2026-06-10",
      "MTUzMiBC__2026-06-11",
      "MTUzMiBC__2026-06-12",
      "MTUzMiBC__2026-06-13",
      "MTUzMiBC__2026-06-14",
    ]);
  });

  it("rejects invalid or zero-night booking ranges", () => {
    expect(() => getBookingOccupancyLockRefs(db, {
      unitId: "1532 B",
      checkinDate: "2026-06-10",
      checkoutDate: "2026-06-10",
    })).toThrow("later check-out date");
  });
});
