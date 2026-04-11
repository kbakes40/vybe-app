import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "./prisma";
import { env } from "./env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,

  // Trusted origins for cross-origin auth
  trustedOrigins: [
    "vibecode://*/*",
    "exp://*/*",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.dev.vibecode.run",
    "https://*.vibecode.run",
    "https://*.vibecodeapp.com",
    env.BACKEND_URL,
  ],

  // Email/Password authentication
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },

  // Social providers
  socialProviders: {
    apple: {
      // Bundle ID must match the ACTUAL iOS bundle identifier committed in
      // mobile/ios/vibecode.xcodeproj. Apple puts this in the JWT `aud` claim
      // and Better Auth verifies it on sign-in. The bundle ID is
      // com.vibecode.vybe — if the native project ever changes, update this.
      clientId: process.env.APPLE_CLIENT_ID || "com.vibecode.vybe",
      clientSecret: process.env.APPLE_CLIENT_SECRET || "",
      // Enable the provider as soon as a client ID is present so the
      // native idToken flow can verify tokens — client secret is only
      // required for the web OAuth fallback.
      enabled: true,
    },
    google: {
      // Must match the iOS OAuth client ID hardcoded in
      // mobile/src/app/sign-in.tsx because Better Auth verifies the `aud`
      // claim of Google's idToken against this value. This is the Vybe iOS
      // client from Google Cloud Console (team FCXP585VH2), registered under
      // bundle com.vibecode.vybe.
      clientId:
        process.env.GOOGLE_CLIENT_ID ||
        "405236221156-rg9n0cquvqrh7rcg7nrbmgc20i46kgpn.apps.googleusercontent.com",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      // Native iOS flow uses idToken verification only — no client secret needed.
      enabled: true,
    },
  },

  plugins: [
    expo(),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;

        // Always log so user can get code from LOGS tab if email fails
        console.log(`[VYBE Auth] OTP for ${email}: ${otp}`);

        try {
          const response = await fetch("https://smtp.vibecodeapp.com/v1/send/otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              code: String(otp),
              fromName: "VYBE",
              lang: "en",
            }),
          });

          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as { error?: string } | null;
            console.error(`[VYBE Auth] Email send failed (HTTP ${response.status}):`, data?.error);
            // Don't throw — OTP was logged above and is still valid
          }
        } catch (err) {
          console.error("[VYBE Auth] Email send error:", err);
          // Don't throw — OTP was logged above and is still valid
        }
      },
    }),
  ],

  // Cross-origin cookie settings for mobile/iframe
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
    },
    trustedProxyHeaders: true,
    disableCSRFCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },

  // User creation callback - create default preferences and subscription
  user: {
    additionalFields: {
      image: {
        type: "string",
        required: false,
      },
    },
  },
});

export type Auth = typeof auth;
