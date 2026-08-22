"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingDeleted = exports.bookingUpdated = exports.bookingCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
// --- Booking Created ---
exports.bookingCreated = (0, firestore_1.onDocumentCreated)('/bookings/{bookingId}', async (event) => {
    const bookingSnapshot = event.data; // QueryDocumentSnapshot | undefined
    if (!bookingSnapshot)
        return;
    const booking = bookingSnapshot.data();
    console.log('Booking created:', booking);
});
// --- Booking Updated ---
exports.bookingUpdated = (0, firestore_1.onDocumentUpdated)('/bookings/{bookingId}', async (event) => {
    const change = event.data; // Change<QueryDocumentSnapshot> | undefined
    if (!change)
        return;
    const before = change.before?.data();
    const after = change.after?.data();
    console.log('Booking updated:', { before, after });
});
// --- Booking Deleted ---
exports.bookingDeleted = (0, firestore_1.onDocumentDeleted)('/bookings/{bookingId}', async (event) => {
    const bookingSnapshot = event.data; // QueryDocumentSnapshot | undefined
    if (!bookingSnapshot)
        return;
    const booking = bookingSnapshot.data();
    console.log('Booking deleted:', booking);
});
//# sourceMappingURL=booking-calendar-sync.js.map