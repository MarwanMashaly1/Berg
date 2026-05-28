import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, inArray, or, ilike, ne, and, sql } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { db } from "../db.js";
import {
  users,
  userVibeTags,
  vibeTags,
  inviteLinks,
  circles,
  groupCircles,
  memoryPhotos,
  motives,
  promptResponses,
  motiveMemories,
  messages,
  chatMembers,
  sessions,
  accounts,
} from "@berg/shared";
import { enqueue } from "../lib/queue.js";
import { cache, TTL, CK } from "../lib/cache.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin, AVATARS_BUCKET } from "../lib/supabase-admin.js";
import { rateLimit, API_LIMITS } from "../lib/rate-limiter.js";
import type { auth } from "../auth.js";
import { log } from "../lib/logger.js";

/** Generates a cryptographically secure invite code (no ambiguous characters). */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const userRoutes = new Hono<{ Variables: Variables }>();

// All routes require authentication
userRoutes.use("*", requireAuth);

// ─── Public user routes (no auth required) ────────────────────────────────────
export const userPublicRoutes = new Hono<{ Variables: Variables }>();

// GET /api/users/me -- return current user (explicit projection, no phone data)
userRoutes.get("/me", async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: "Unauthorized" }, 401);
  const user = await cache.wrap(CK.userMe(me.id), TTL.USER_PROFILE, async () => {
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        displayName: users.displayName,
        username: users.username,
        bio: users.bio,
        availabilityStatus: users.availabilityStatus,
        onboardingStep: users.onboardingStep,
        onboardingCompleted: users.onboardingCompleted,
        notifyPromptMatches: users.notifyPromptMatches,
        notifyCircleRequests: users.notifyCircleRequests,
        notifyMotiveInvites: users.notifyMotiveInvites,
        showInDiscovery: users.showInDiscovery,
      })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);
    return row ?? null;
  });
  return c.json({ user });
});

// PATCH /api/users/me -- update profile fields + advance onboarding step
const patchUserSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    displayName: z.string().min(1).max(100).optional(),
    username: z.string().min(3).max(20).optional(),
    bio: z.string().max(500).optional(),
    image: z.string().url().optional(),
    availabilityStatus: z.enum(["down_to_hang", "busy", "ask_me"]).optional(),
    onboardingStep: z.coerce.number().int().min(0).max(20).optional(),
    onboardingCompleted: z.boolean().optional(),
    notifyPromptMatches: z.boolean().optional(),
    notifyCircleRequests: z.boolean().optional(),
    notifyMotiveInvites: z.boolean().optional(),
    showInDiscovery: z.boolean().optional(),
  })
  .strict();

const avatarUploadSchema = z.object({
  ext: z.string().regex(/^[a-z0-9]+$/i).default('jpg'),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).default('image/jpeg'),
});
const pushTokenSchema = z.object({
  token: z.string().startsWith('ExponentPushToken[', { message: 'Invalid push token format' }),
});

userRoutes.patch("/me", zValidator("json", patchUserSchema), async (c) => {
  const currentUser = c.get("user")!;
  const body = c.req.valid("json");

  // Only allow onboarding_step to increment, never go back
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.username !== undefined) updates.username = body.username;
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.image !== undefined) updates.image = body.image;
  if (body.availabilityStatus !== undefined)
    updates.availabilityStatus = body.availabilityStatus;
  if (body.onboardingCompleted !== undefined)
    updates.onboardingCompleted = body.onboardingCompleted;
  if (body.notifyPromptMatches !== undefined)
    updates.notifyPromptMatches = body.notifyPromptMatches;
  if (body.notifyCircleRequests !== undefined)
    updates.notifyCircleRequests = body.notifyCircleRequests;
  if (body.notifyMotiveInvites !== undefined)
    updates.notifyMotiveInvites = body.notifyMotiveInvites;
  if (body.showInDiscovery !== undefined)
    updates.showInDiscovery = body.showInDiscovery;
  if (body.onboardingStep !== undefined) {
    const newStep = body.onboardingStep; // already coerced to number by Zod
    const currentStep = parseInt(currentUser.onboardingStep ?? "0", 10);
    // Only increment, never go back
    if (newStep > currentStep) {
      updates.onboardingStep = String(newStep);
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ user: currentUser });
  }

  try {
    await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, currentUser.id));

    // Re-fetch with explicit projection to avoid leaking phoneNumber/phoneHash/expoPushToken
    const [updated] = await db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        username: users.username,
        bio: users.bio,
        availabilityStatus: users.availabilityStatus,
        onboardingStep: users.onboardingStep,
        onboardingCompleted: users.onboardingCompleted,
        image: users.image,
        notifyPromptMatches: users.notifyPromptMatches,
        notifyCircleRequests: users.notifyCircleRequests,
        notifyMotiveInvites: users.notifyMotiveInvites,
        showInDiscovery: users.showInDiscovery,
      })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1);

    cache.del(CK.userMe(currentUser.id));
    return c.json({ user: updated ?? null });
  } catch (err) {
    log.error({ err, userId: currentUser.id }, 'PATCH /me failed');
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

// GET /api/users/me/vibe-tags -- fetch current user's selected vibe tag IDs
userRoutes.get("/me/vibe-tags", async (c) => {
  const user = c.get("user")!;
  const rows = await db
    .select({ id: userVibeTags.tagId })
    .from(userVibeTags)
    .where(eq(userVibeTags.userId, user.id));
  return c.json({ tagIds: rows.map((r) => r.id) });
});

// POST /api/users/me/vibe-tags -- save selected vibe tags (replaces existing)
userRoutes.post(
  "/me/vibe-tags",
  zValidator(
    "json",
    z.object({
      tagIds: z.array(z.string().uuid()).min(3, "Select at least 3 vibe tags"),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { tagIds } = c.req.valid("json");

    // Verify all tag IDs exist
    const foundTags = await db
      .select({ id: vibeTags.id })
      .from(vibeTags)
      .where(inArray(vibeTags.id, tagIds));

    if (foundTags.length !== tagIds.length) {
      return c.json({ error: "One or more tag IDs are invalid" }, 400);
    }

    // Replace all existing user vibe tags
    await db.delete(userVibeTags).where(eq(userVibeTags.userId, user.id));
    await db
      .insert(userVibeTags)
      .values(tagIds.map((tagId) => ({ userId: user.id, tagId })));

    // Vibe tags changed -> recompute FOF (tag Jaccard is 30% of the score)
    void enqueue("discovery/recompute-fof-user", { userId: user.id }).catch(
      (err) => log.error({ err }, 'users FOF recompute enqueue failed'),
    );

    return c.json({ ok: true, count: tagIds.length });
  },
);

// GET /api/users/check-username?username= — check if a username is available
userRoutes.get("/check-username", async (c) => {
  const me = c.get("user");
  const username = c.req.query("username")?.toLowerCase().trim();
  if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
    return c.json({ available: false, reason: "invalid" });
  }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.username, username), me ? ne(users.id, me.id) : sql`true`),
    )
    .limit(1);
  return c.json({ available: existing.length === 0 });
});

// GET /api/users/search?q= — search users by name or @handle, returns connection status
userRoutes.get("/search", async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q")?.trim();
  if (!q || q.length < 2) return c.json({ users: [] });

  const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const results = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      image: users.image,
    })
    .from(users)
    .where(
      and(
        ne(users.id, me.id),
        or(ilike(users.name, pattern), ilike(users.username, pattern)),
      ),
    )
    .limit(20);

  if (results.length === 0) return c.json({ users: [] });

  // Fetch connection status for each result
  const resultIds = results.map((u) => u.id);
  const myCircles = await db
    .select({ friendId: circles.friendId, status: circles.status })
    .from(circles)
    .where(
      and(eq(circles.userId, me.id), inArray(circles.friendId, resultIds)),
    );

  const statusMap = new Map(myCircles.map((c) => [c.friendId, c.status]));

  return c.json({
    users: results.map((u) => ({
      ...u,
      connectionStatus: statusMap.get(u.id) ?? null, // null | 'pending' | 'confirmed'
    })),
  });
});

// GET /api/users/me/invite-link -- get or create a personalised invite link
userRoutes.get("/me/invite-link", async (c) => {
  const me = c.get("user")!;
  const existing = await db
    .select()
    .from(inviteLinks)
    .where(eq(inviteLinks.userId, me.id))
    .limit(1);
  if (existing[0]) {
    const code = existing[0].code;
    return c.json({ code, url: `https://berg.app/join/${code}` });
  }
  const code = generateInviteCode();
  await db.insert(inviteLinks).values({
    id: randomUUID(),
    userId: me.id,
    code,
    clickCount: 0,
    signupCount: 0,
    acceptedCount: 0,
    createdAt: new Date(),
  });
  return c.json({ code, url: `https://berg.app/join/${code}` });
});

// POST /api/users/me/avatar-upload-url -- get Supabase signed URL to upload a profile photo
userRoutes.post("/me/avatar-upload-url", zValidator("json", avatarUploadSchema), async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: "Unauthorized" }, 401);

  const limited = rateLimit(c, `${me.id}:avatar-upload`, API_LIMITS.avatarUpload.limit, API_LIMITS.avatarUpload.windowMs);
  if (limited) return limited;

  const { ext: rawExt, contentType } = c.req.valid("json");
  const ext = rawExt.replace(/[^a-z0-9]/gi, "").toLowerCase();

  // Always overwrite the same path -- one avatar per user
  const path = `${me.id}/avatar.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    log.error({ err: error, userId: me.id }, 'avatar upload URL creation failed');
    return c.json({ error: "Could not create upload URL" }, 500);
  }

  // Public URL -- avatars bucket should be public
  const { data: urlData } = supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(path);

  return c.json({
    uploadUrl: data.signedUrl,
    path,
    publicUrl: urlData.publicUrl,
  });
});

// GET /api/users/:userId/public -- public profile card
userRoutes.get("/:userId/public", async (c) => {
  const me = c.get("user");
  const userId = c.req.param("userId");

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      username: users.username,
      availabilityStatus: users.availabilityStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);

  // Vibe tags
  const tags = await db
    .select({ emoji: vibeTags.emoji, label: vibeTags.label })
    .from(userVibeTags)
    .innerJoin(vibeTags, eq(userVibeTags.tagId, vibeTags.id))
    .where(eq(userVibeTags.userId, userId));

  // Connection status (null if viewing own profile or not connected)
  let connectionStatus: "pending" | "confirmed" | null = null;
  if (me && me.id !== userId) {
    const [circle] = await db
      .select({ status: circles.status })
      .from(circles)
      .where(and(eq(circles.userId, me.id), eq(circles.friendId, userId)))
      .limit(1);
    connectionStatus = (circle?.status as typeof connectionStatus) ?? null;
  }

  return c.json({ user: { ...user, vibeTags: tags, connectionStatus } });
});

// POST /api/users/me/push-token -- register Expo push token for this device
userRoutes.post("/me/push-token", zValidator("json", pushTokenSchema), async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: "Unauthorized" }, 401);
  const { token } = c.req.valid("json");
  await db
    .update(users)
    .set({ expoPushToken: token })
    .where(eq(users.id, me.id));
  return c.json({ ok: true });
});

// DELETE /api/users/me -- soft-delete: anonymises PII, logs out, preserves messages
userRoutes.delete("/me", async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: "Unauthorized" }, 401);

  try {
    // 1. Remove avatar from storage (no longer needed)
    const avatarExts = ["jpg", "jpeg", "png", "webp", "heic"];
    await supabaseAdmin.storage
      .from(AVATARS_BUCKET)
      .remove(avatarExts.map((ext) => `${me.id}/avatar.${ext}`))
      .catch((err) => log.error({ err, userId: me.id }, 'avatar cleanup failed'));

    // 2. Anonymise the user row — wipe all PII, mark as deleted
    //    Messages/chats remain so other users see "Deleted User" attribution
    await db
      .update(users)
      .set({
        name: "Deleted User",
        displayName: "Deleted User",
        email: `deleted+${me.id}@berg.invalid`,
        emailVerified: false,
        image: null,
        bio: null,
        username: null,
        phoneNumber: null,
        phoneHash: null,
        phoneVerified: false,
        expoPushToken: null,
        showInDiscovery: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, me.id));

    // 3. Delete all sessions (forces logout on all devices)
    await db.delete(sessions).where(eq(sessions.userId, me.id));

    // 4. Delete OAuth accounts (prevents re-login via Google/Apple)
    await db.delete(accounts).where(eq(accounts.userId, me.id));

    // 5. Remove from all circles / connections
    await db
      .delete(circles)
      .where(
        sql`${circles.userId} = ${me.id} OR ${circles.friendId} = ${me.id}`,
      );

    // 6. Remove from group circles
    await db.delete(groupCircles).where(eq(groupCircles.adminUserId, me.id));

    return c.json({ ok: true });
  } catch (err) {
    log.error({ err, userId: me.id }, 'delete account failed');
    return c.json({ error: "Failed to delete account" }, 500);
  }
});

// GET /api/users/me/export -- GDPR right to data portability: full data export as JSON
userRoutes.get("/me/export", async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: "Unauthorized" }, 401);

  const [
    profile,
    myCircles,
    myMotives,
    myPromptResponses,
    myMemories,
    myMessages,
  ] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        displayName: users.displayName,
        username: users.username,
        bio: users.bio,
        availabilityStatus: users.availabilityStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1),

    db
      .select({
        friendId: circles.friendId,
        status: circles.status,
        createdAt: circles.createdAt,
      })
      .from(circles)
      .where(eq(circles.userId, me.id)),

    db
      .select({
        id: motives.id,
        title: motives.title,
        category: motives.category,
        description: motives.description,
        scheduledAt: motives.scheduledAt,
        venueName: motives.venueName,
        status: motives.status,
        createdAt: motives.createdAt,
      })
      .from(motives)
      .where(eq(motives.creatorId, me.id)),

    db
      .select({
        promptId: promptResponses.promptId,
        optionKey: promptResponses.optionKey,
        storyText: promptResponses.storyText,
        respondedAt: promptResponses.respondedAt,
      })
      .from(promptResponses)
      .where(eq(promptResponses.userId, me.id)),

    db
      .select({
        motiveId: motiveMemories.motiveId,
        vibeTags: motiveMemories.vibeTags,
        rating: motiveMemories.rating,
        createdAt: motiveMemories.createdAt,
      })
      .from(motiveMemories)
      .where(eq(motiveMemories.userId, me.id)),

    db
      .select({
        content: messages.content,
        chatId: messages.chatId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.senderId, me.id))
      .limit(10000),
  ]);

  c.header("Content-Type", "application/json");
  c.header(
    "Content-Disposition",
    `attachment; filename="berg-data-export-${me.id}.json"`,
  );
  return c.json({
    exportedAt: new Date().toISOString(),
    profile: profile[0] ?? null,
    connections: myCircles,
    motives: myMotives,
    promptResponses: myPromptResponses,
    memories: myMemories,
    messages: myMessages,
  });
});

// POST /api/users/deletion-request -- public (no auth): Play Store / GDPR data deletion request form
// Sends notification to admin, does not auto-delete (manual review within 30 days)
userPublicRoutes.post(
  "/deletion-request",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      reason: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const { email, reason } = c.req.valid("json");
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return c.json({ error: "Service unavailable" }, 503);

    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        // Notify admin
        await resend.emails.send({
          from: "Berg <info@joinberg.ca>",
          to: adminEmail,
          subject: `[Berg] Data deletion request from ${email}`,
          html: `
          <p><strong>Data deletion request received</strong></p>
          <p><strong>Email:</strong> ${email}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p><strong>Submitted at:</strong> ${new Date().toISOString()}</p>
          <hr>
          <p>Process this request within 30 days. Use the admin panel or DELETE /api/users/me on behalf of the user.</p>
        `,
        });

        // Confirm to user
        await resend.emails.send({
          from: "Berg <info@joinberg.ca>",
          to: email,
          subject: "Your Berg data deletion request",
          html: `
          <p>Hi,</p>
          <p>We've received your request to delete your Berg account and all associated data.</p>
          <p>We will process your request within <strong>30 days</strong> and delete all personal data linked to <strong>${email}</strong>.</p>
          <p>If you have the Berg app installed, you can also delete your account immediately from <strong>Settings → Delete account</strong>.</p>
          <p>If you have questions, reply to this email or contact us at <a href="mailto:support@joinberg.app">support@joinberg.app</a>.</p>
          <br>
          <p>— The Berg team</p>
        `,
        });
      } else {
        log.warn({ email: email.slice(0, 3) + '***' }, 'deletion-request: no RESEND_API_KEY, logged only');
      }

      log.info({ email: email.slice(0, 3) + '***' }, 'deletion-request received');
      return c.json({ ok: true });
    } catch (err) {
      log.error({ err }, 'deletion-request failed');
      return c.json({ error: "Failed to submit request" }, 500);
    }
  },
);
