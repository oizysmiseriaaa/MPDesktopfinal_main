"use strict";
'use server';
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDiscordNotificationFlow = exports.DiscordNotificationOutputSchema = exports.DiscordNotificationInputSchema = void 0;
/**
 * @fileOverview A Genkit flow for sending a notification to a Discord channel via a webhook.
 */
const genkit_1 = require("../genkit");
const zod_1 = require("zod");
// Input schema
exports.DiscordNotificationInputSchema = zod_1.z.object({
    content: zod_1.z.string(),
    username: zod_1.z.string().optional(),
    avatar_url: zod_1.z.string().optional(),
});
// Output schema
exports.DiscordNotificationOutputSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    message: zod_1.z.string(),
});
// Flow definition
exports.sendDiscordNotificationFlow = genkit_1.ai.defineFlow({
    name: 'sendDiscordNotificationFlow',
    inputSchema: exports.DiscordNotificationInputSchema,
    outputSchema: exports.DiscordNotificationOutputSchema,
}, async (input) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('DISCORD_WEBHOOK_URL secret is not set in the function environment.');
        return {
            success: false,
            message: 'Discord webhook URL is not configured on the server. Please set the DISCORD_WEBHOOK_URL secret.',
        };
    }
    try {
        // 👇 Add an invisible character to make each username unique (prevents Discord grouping)
        const invisibleChar = String.fromCharCode(8203 + Math.floor(Math.random() * 5));
        const variedUsername = (input.username || 'Manila Prime Bot') + invisibleChar;
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: input.content,
                username: variedUsername, // 👈 ensures name shows up each time
            }),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Error sending Discord notification: ${response.status} ${response.statusText}`, errorBody);
            return {
                success: false,
                message: `Failed to send message. Discord API responded with: ${response.statusText}`,
            };
        }
        return {
            success: true,
            message: 'Notification sent to Discord successfully.',
        };
    }
    catch (error) {
        console.error('Exception when sending Discord notification:', error);
        return {
            success: false,
            message: `An unexpected error occurred: ${error.message}`,
        };
    }
});
//# sourceMappingURL=send-discord-notification.js.map