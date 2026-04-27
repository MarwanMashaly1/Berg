import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("[gemini] GEMINI_API_KEY not set — prompt generation will fail");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/**
 * gemini-2.0-flash — fast, cheap, generous free tier (1M tokens/day, 15 RPM).
 * Update the model string here if Google releases a cheaper/better option.
 */
export const geminiFlash = genAI.getGenerativeModel({
  model: "gemini-3-flash-preview",
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.9, // enough creativity for varied prompts
    topP: 0.95,
    maxOutputTokens: 8192,
  },
});

/** Raw text generation (no JSON constraint). */
export const geminiFlashText = genAI.getGenerativeModel({
  model: "gemini-3-flash-preview",
  generationConfig: {
    temperature: 0.8,
    maxOutputTokens: 4096,
  },
});
