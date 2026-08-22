"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_admin_1 = require("../lib/firebase-admin");
async function backfillBookingIds() {
    const adminDb = (0, firebase_admin_1.getFirebaseAdmin)().adminDb;
    const snapshot = await adminDb.collection('bookings').get();
    const batch = adminDb.batch();
    let count = 0;
    snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (!data.id) {
            batch.update(doc.ref, { id: doc.id });
            console.log(`✅ Backfilled booking id for doc ${doc.id}`);
            count++;
        }
    });
    if (count > 0) {
        await batch.commit();
        console.log(`✅ Backfill complete! ${count} bookings updated.`);
    }
    else {
        console.log('✅ No bookings needed backfill.');
    }
}
backfillBookingIds()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=backfillBookingIds.js.map