"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToGoogleCalendar = addToGoogleCalendar;
exports.updateGoogleCalendarEvent = updateGoogleCalendarEvent;
exports.deleteGoogleCalendarEvent = deleteGoogleCalendarEvent;
const googleapis_1 = require("googleapis");
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
// Correct way to initialize JWT
const auth = new googleapis_1.google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: SCOPES,
});
const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
// Helper to format dates correctly
function formatDate(dateStr) {
    if (dateStr.includes('T'))
        return { dateTime: dateStr }; // ISO datetime
    return { date: dateStr }; // all-day event
}
async function addToGoogleCalendar(booking) {
    try {
        const res = await calendar.events.insert({
            calendarId,
            requestBody: {
                summary: `Booking: ${booking.name}`,
                start: formatDate(booking.checkinDate),
                end: formatDate(booking.checkoutDate),
                description: booking.notes || '',
            },
        });
        return res.data.id; // Save in Firestore
    }
    catch (error) {
        console.error('Failed to add event to Google Calendar:', error);
        return null;
    }
}
async function updateGoogleCalendarEvent(booking) {
    if (!booking.calendarEventId)
        return;
    try {
        await calendar.events.update({
            calendarId,
            eventId: booking.calendarEventId,
            requestBody: {
                summary: `Booking: ${booking.name}`,
                start: formatDate(booking.checkinDate),
                end: formatDate(booking.checkoutDate),
                description: booking.notes || '',
            },
        });
    }
    catch (error) {
        console.error('Failed to update Google Calendar event:', error);
    }
}
async function deleteGoogleCalendarEvent(eventId) {
    if (!eventId)
        return;
    try {
        await calendar.events.delete({
            calendarId,
            eventId,
        });
    }
    catch (error) {
        console.error('Failed to delete Google Calendar event:', error);
    }
}
//# sourceMappingURL=google-calendar-utils.js.map