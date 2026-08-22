"use strict";
'use server';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ai = void 0;
const genkit_1 = require("genkit");
const googleai_1 = require("@genkit-ai/googleai");
exports.ai = (0, genkit_1.genkit)({
    plugins: [
        (0, googleai_1.googleAI)({
            apiKey: process.env.GEMINI_API_KEY, // 👈 explicitly use your existing key
        }),
    ],
});
//# sourceMappingURL=genkit.js.map