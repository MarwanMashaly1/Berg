import { db } from "../db.js";
import { dailyPrompts } from "@berg/shared";
import { eq, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createEmailToken } from "../lib/admin-token.js";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { PromptReviewEmail } from "../emails/prompt-review.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const VALID_TYPES = [
  "pick_your_camp",
  "this_or_that",
  "spectrum",
  "have_you_ever",
] as const;
const VALID_CATEGORIES = [
  "food",
  "social",
  "work",
  "weekend",
  "travel",
  "music",
  "outdoors",
  "relationships",
  "humor",
  "tech",
] as const;

type PromptOption = { key: string; emoji: string; text: string; index: number };
type GeneratedPrompt = {
  question: string;
  category: string;
  type: (typeof VALID_TYPES)[number];
  options: PromptOption[];
  tags: string[];
  isUniversal: boolean;
};

const SYSTEM_PROMPT = `You are generating daily icebreaker conversation prompts for Berg — a social app for people aged 16–30 that sparks real conversations, deepens friendships, and helps people discover unexpected things about each other.

TONE: Casual, warm, genuine. Playful but not silly. Relatable across ages 16–30. Never corporate, preachy, divisive, political, religious, or embarrassing.

WHAT MAKES A GREAT PROMPT:
- Reveals character and personality
- Has a clear "right" answer for each person (not wishy-washy)
- Creates curiosity about how others answered
- Naturally leads to follow-up conversation
- Feels like something friends would actually debate

PROMPT TYPES:
1. pick_your_camp — 3 or 4 options (most common, aim for 6-8 of these)
   Example: "How adventurous is your food order?"
   Options: [🌶️ Usually adventurous, 😌 Same thing every time, 🙂 Safe but curious]

2. this_or_that — exactly 2 options, side by side (aim for 4-5)
   Example: "Mountains or Beach?"
   Options: [🏔 Mountains, 🏖 Beach]

3. spectrum — exactly 2 polar opposites (aim for 3-4)
   Example: "Early bird or night owl?"
   Options: [🌅 Early bird, 🦉 Night owl]

4. have_you_ever — yes/no with nuance, exactly 3 options (aim for 2-3)
   Example: "Have you ever stayed up all night for something totally worth it?"
   Options: [✅ Yes, worth it, ❌ Never, 🤔 Kind of]

CATEGORIES: food, social, work, weekend, travel, music, outdoors, relationships, humor, tech

OPTION FORMAT: each option needs:
- key: unique slug (e.g. "adventurous", "mountains", "early_bird", "yes")
- emoji: single relevant emoji
- text: 2-5 words max
- index: 0-based number

Generate exactly 20 prompts. Cover all categories and mix types. Return ONLY a JSON array, no commentary.`;

/**
 * Build the user message for Gemini, including recent prompts to avoid repetition.
 */
async function buildGenerationPrompt(): Promise<string> {
  // Fetch the last 60 prompts (approved + active) to avoid topic repetition
  const recent = await db
    .select({
      question: dailyPrompts.question,
      category: dailyPrompts.category,
      type: dailyPrompts.type,
    })
    .from(dailyPrompts)
    .where(inArray(dailyPrompts.status, ["approved", "active", "archived"]))
    .orderBy(desc(dailyPrompts.createdAt))
    .limit(60);

  const recentList = recent
    .map((p, i) => `${i + 1}. [${p.type}/${p.category}] "${p.question}"`)
    .join("\n");

  return `Generate 20 new prompts.

AVOID repeating topics or framing from these existing prompts:
${recentList || "(none yet — this is the first batch)"}

Return a JSON array matching this structure:
[{
  "question": "string",
  "category": "one of: food|social|work|weekend|travel|music|outdoors|relationships|humor|tech",
  "type": "one of: pick_your_camp|this_or_that|spectrum|have_you_ever",
  "options": [{"key":"slug","emoji":"🔥","text":"Short text","index":0}],
  "tags": ["tag1","tag2"],
  "isUniversal": true
}]`;
}

/**
 * Validate and sanitise a raw Gemini-generated prompt.
 * Returns null if the prompt is malformed.
 */
function validate(raw: unknown): GeneratedPrompt | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;

  if (typeof p.question !== "string" || p.question.length < 10) return null;
  if (!VALID_TYPES.includes(p.type as any)) return null;
  if (!VALID_CATEGORIES.includes(p.category as any)) return null;

  const options = Array.isArray(p.options) ? p.options : [];
  if (options.length < 2 || options.length > 4) return null;

  const cleanOptions: PromptOption[] = options.map((o: any, i: number) => ({
    key: String(o.key ?? `opt_${i}`)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 30),
    emoji: String(o.emoji ?? "•").slice(0, 4),
    text: String(o.text ?? `Option ${i + 1}`).slice(0, 30),
    index: i,
  }));

  // Type-specific option count validation
  if (p.type === "this_or_that" && cleanOptions.length !== 2) return null;
  if (p.type === "spectrum" && cleanOptions.length !== 2) return null;
  if (p.type === "have_you_ever" && cleanOptions.length !== 3) return null;

  return {
    question: p.question.trim(),
    category: p.category as (typeof VALID_CATEGORIES)[number],
    type: p.type as (typeof VALID_TYPES)[number],
    options: cleanOptions,
    tags: Array.isArray(p.tags) ? (p.tags as string[]).slice(0, 5) : [],
    isUniversal: p.isUniversal !== false,
  };
}

// Model instance with system instruction — scoped to this job so geminiFlash stays generic
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const promptGeneratorModel = genAI.getGenerativeModel({
  model: "gemini-3-flash-preview",
  systemInstruction: SYSTEM_PROMPT,
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.9,
    topP: 0.95,
    maxOutputTokens: 8192,
  },
});

/**
 * Main job: generate 20 prompts via Gemini, save as drafts, send review email.
 * Job name: 'prompts/generate-batch'
 */
export async function handleGeneratePrompts(): Promise<void> {
  console.log("[prompts] Starting weekly batch generation");

  // 1. Build prompt and call Gemini
  const userMessage = await buildGenerationPrompt();
  let rawData: unknown[];

  try {
    const result = await promptGeneratorModel.generateContent(userMessage);

    const text = result.response.text().trim();
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    rawData = JSON.parse(cleaned);

    if (!Array.isArray(rawData)) throw new Error("Response is not an array");
  } catch (e) {
    console.error("[prompts] Gemini call failed:", e);
    return;
  }

  // 2. Validate each prompt
  const valid = rawData
    .map(validate)
    .filter((p): p is GeneratedPrompt => p !== null);

  if (valid.length === 0) {
    console.error("[prompts] No valid prompts in Gemini response");
    return;
  }

  console.log(
    `[prompts] ${valid.length} valid prompts from Gemini (${rawData.length - valid.length} rejected)`,
  );

  // 3. Save as drafts
  const inserted = await db
    .insert(dailyPrompts)
    .values(
      valid.map((p) => ({
        id: randomUUID(),
        question: p.question,
        category: p.category,
        status: "draft",
        type: p.type,
        options: JSON.stringify(p.options),
        tags: p.tags,
        isUniversal: p.isUniversal,
        generatedBy: "llm",
        createdAt: new Date(),
      })),
    )
    .returning({
      id: dailyPrompts.id,
      question: dailyPrompts.question,
      category: dailyPrompts.category,
      type: dailyPrompts.type,
      options: dailyPrompts.options,
      tags: dailyPrompts.tags,
    });

  // 4. Send review email
  const adminEmail = process.env.ADMIN_EMAIL;
  const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000";
  const adminSecret = process.env.ADMIN_SECRET ?? "";

  if (!adminEmail) {
    console.warn("[prompts] ADMIN_EMAIL not set — skipping review email");
    return;
  }

  const batchDate = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Build email links using HMAC-signed tokens — raw admin secret never appears in URLs
  const drafts = inserted.map((p) => {
    const options: PromptOption[] = JSON.parse(p.options);
    const approveToken = createEmailToken(adminSecret, "approve", p.id);
    const rejectToken = createEmailToken(adminSecret, "reject", p.id);
    return {
      id: p.id,
      question: p.question,
      category: p.category,
      type: p.type,
      options,
      tags: p.tags ?? [],
      approveUrl: `${apiBase}/api/admin/prompts/${p.id}/approve?t=${approveToken}`,
      rejectUrl: `${apiBase}/api/admin/prompts/${p.id}/reject?t=${rejectToken}`,
    };
  });

  // Approve-all token is signed against the sorted list of all IDs
  const sortedIds = [...inserted.map((p) => p.id)].sort();
  const approveAllToken = createEmailToken(
    adminSecret,
    "approve-all",
    sortedIds.join(","),
  );
  const approveAllUrl = `${apiBase}/api/admin/prompts/approve-all?ids=${inserted.map((p) => p.id).join(",")}&t=${approveAllToken}`;

  const html = await render(
    PromptReviewEmail({ drafts, batchDate, approveAllUrl }) as any,
  );

  await resend.emails.send({
    from: "Berg <info@salamcity.ca>",
    to: adminEmail,
    subject: `🧊 ${valid.length} new prompts ready to review — ${batchDate}`,
    html,
  });

  console.log(
    `[prompts] Review email sent to ${adminEmail} with ${valid.length} drafts`,
  );
}
