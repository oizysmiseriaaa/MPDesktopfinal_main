"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillBookingIds = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../lib/firebase-admin");
const route_helpers_1 = require("../lib/route-helpers");
const runBackfill = async (_req, res) => {
    try {
        const adminDb = (0, firebase_admin_1.getFirebaseAdmin)().adminDb;
        const bookingsSnapshot = await adminDb.collection('bookings').get();
        const batch = adminDb.batch();
        let count = 0;
        bookingsSnapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.id) {
                batch.update(doc.ref, { id: doc.id });
                count++;
            }
        });
        await batch.commit();
        console.log(`✅ Backfill complete! Updated ${count} bookings.`);
        res.status(200).send(`Backfill complete! Updated ${count} bookings.`);
    }
    catch (err) {
        console.error(err);
        res.status(500).send('Backfill failed');
    }
};
exports.backfillBookingIds = (0, https_1.onRequest)({
    region: 'asia-southeast1',
    secrets: ['SERVICE_ACCOUNT_KEY'],
}, async (req, res) => {
    await route_helpers_1.authenticate(req, res, async () => {
        await route_helpers_1.requireAdmin(req, res, async () => runBackfill(req, res));
    });
});
//# sourceMappingURL=backfillBookingIds.js.map
