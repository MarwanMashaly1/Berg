import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { render } from "@react-email/components";
import { db } from "./db";
import { MagicLinkEmail } from "./emails/magic-link.js";
import {
  pendingPhone,
  users as usersTable,
  sessions,
  accounts,
  verifications,
} from "@berg/shared";
import { eq, and, gt } from "drizzle-orm";

if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be set in production");
}

export const auth = betterAuth({
  appName: "Berg",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production",

  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),

  trustedOrigins: [
    "berg://",
    ...(process.env.NODE_ENV !== "production" ? ["exp://"] : []), // Expo Go — dev only
  ],

  session: {
    // 90-day sessions — users stay signed in across app restarts
    expiresIn: 60 * 60 * 24 * 90,
    // Silently refresh the session token if used within the last 24h
    // (keeps active users perpetually signed in)
    updateAge: 60 * 60 * 24,
    // Cookie cache: serve session from a signed cookie for 5 minutes
    // without hitting the DB. Makes getSession() resolve in <10ms
    // instead of 50-500ms, preventing the app's timeout from misfiring.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    },
  },

  user: {
    additionalFields: {
      phoneNumber: { type: "string", required: false, input: false },
      phoneHash: { type: "string", required: false, input: false },
      phoneVerified: { type: "boolean", required: false, defaultValue: false },
      displayName: { type: "string", required: false },
      username: { type: "string", required: false },
      bio: { type: "string", required: false },
      availabilityStatus: {
        type: "string",
        required: false,
        defaultValue: "down_to_hang",
      },
      onboardingStep: { type: "string", required: false, defaultValue: "0" },
      onboardingCompleted: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      onboardingCompletedAt: { type: "string", required: false },
      contactSyncGranted: { type: "boolean", required: false },
      activatedAt: { type: "string", required: false },
      firstMotiveAt: { type: "string", required: false },
      lastActiveTab: {
        type: "string",
        required: false,
        defaultValue: "discovery",
      },
    },
  },

  plugins: [
    expo(),
    bearer(),
    magicLink({
      sendMagicLink: async (data) => {
        const email = data.email;
        const url = data.url;
        // `token` may or may not be exposed depending on BetterAuth version
        const rawToken: string | undefined = (data as any).token;

        try {
          // Extract callbackURL and token from the BetterAuth-generated URL
          const parsedUrl = new URL(url);
          const callbackURL =
            parsedUrl.searchParams.get("callbackURL") ??
            "berg://auth/magic-link-callback";
          const urlToken =
            parsedUrl.searchParams.get("token") ?? rawToken ?? "";

          // Redirect-only link: browser hits /api/auth/magic-link-open which immediately
          // 302s to berg://magic-link-callback?token=xxx WITHOUT consuming the token.
          // The app then calls /api/auth/verify-code for the single real verification.
          // (Using BetterAuth's own verify URL would consume the token in the browser,
          // leaving the app with nothing to verify against.)
          const apiBase = process.env.BETTER_AUTH_URL ?? parsedUrl.origin;
          const emailLink = urlToken
            ? `${apiBase}/api/auth/magic-link-open?token=${encodeURIComponent(urlToken)}`
            : url;

          // Generate 8-char short code for manual entry fallback
          let shortCode: string | undefined;
          if (urlToken) {
            shortCode = urlToken.slice(0, 8).toUpperCase();
            const { storeCode } = await import("./lib/code-store.js");
            await storeCode(shortCode, urlToken);
          }

          console.log(`[Magic Link] Sending to ${email.slice(0, 3)}***`);
          console.log(
            `[Magic Link] Short code: ${shortCode ? "(set)" : "n/a"}`,
          );

          if (process.env.RESEND_API_KEY) {
            const { Resend } = await import("resend");
            const resend = new Resend(process.env.RESEND_API_KEY);
            const html = await render(
              MagicLinkEmail({ url: emailLink, email, shortCode }),
            );
            const result = await resend.emails.send({
              from: "Berg <info@salamcity.ca>",
              to: email,
              subject: "Your Berg sign-in link",
              html,
            });
            if (result.error) {
              console.error("[Magic Link] Resend error:", result.error);
            } else {
              console.log("[Magic Link] Email sent, id:", result.data?.id);
            }
          } else {
            console.log(
              `[DEV] No RESEND_API_KEY — magic link omitted from logs`,
            );
          }
        } catch (err) {
          console.error("[Magic Link] sendMagicLink error:", err);
        }
      },
      expiresIn: 900, // 15 minutes
    }),
  ],

  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          // Link phone number from pending_phone table to the new user
          const phoneSessionId = (
            ctx?.request?.headers as Headers | undefined
          )?.get("x-phone-session-id");

          if (!phoneSessionId) return;

          try {
            const pending = await db
              .select()
              .from(pendingPhone)
              .where(
                and(
                  eq(pendingPhone.sessionId, phoneSessionId),
                  gt(pendingPhone.expiresAt, new Date()),
                ),
              )
              .limit(1);

            if (!pending[0]) return;

            const { encryptPhone, hashPhone } =
              await import("./utils/crypto.js");

            const phoneHash = hashPhone(pending[0].phoneNumber);
            const encryptedPhone = encryptPhone(pending[0].phoneNumber);

            await db
              .update(usersTable)
              .set({
                phoneNumber: encryptedPhone,
                phoneHash,
                phoneVerified: true,
              })
              .where(eq(usersTable.id, user.id));

            // Clean up pending_phone row
            await db
              .delete(pendingPhone)
              .where(eq(pendingPhone.sessionId, phoneSessionId));
          } catch (err) {
            // Non-fatal: user still created, phone can be re-entered in settings
            console.error("[auth] Failed to link phone number:", err);
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
