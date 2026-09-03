export type BookingBatchAttempt = {
  bookingId: string;
  range: {
    unit?: any;
    unitId?: string | number;
    checkinDate?: string;
    checkoutDate?: string;
  } | null;
  totalAmount?: number;
};

export type BookingBatchFailure = {
  range: BookingBatchAttempt["range"];
  error: string;
};

export function summarizeBookingBatchResults(
  results: readonly PromiseSettledResult<BookingBatchAttempt>[],
) {
  const successful: BookingBatchAttempt[] = [];
  const failed: BookingBatchFailure[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      const bookingId = String(result.value?.bookingId ?? "").trim();

      if (bookingId) {
        successful.push({
          ...result.value,
          bookingId,
        });
        continue;
      }

      failed.push({
        range: result.value?.range ?? null,
        error: "Server response missing booking ID.",
      });
      continue;
    }

    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : typeof result.reason === "string"
          ? result.reason
          : "Unknown booking creation error.";

    failed.push({
      range: null,
      error: reason,
    });
  }

  return { successful, failed };
}
