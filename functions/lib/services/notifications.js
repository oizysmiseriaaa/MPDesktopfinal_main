"use strict";
'use server';
Object.defineProperty(exports, "__esModule", { value: true });
exports.addNotification = addNotification;
const firebase_admin_1 = require("../lib/firebase-admin");
// Add a new notification
async function addNotification(notificationData) {
    const { adminDb } = await (0, firebase_admin_1.getFirebaseAdmin)();
    const docRef = await adminDb.collection('notifications').add({
        ...notificationData,
    });
    return docRef.id;
}
//# sourceMappingURL=notifications.js.map