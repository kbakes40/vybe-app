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

  // Social providers - Apple and Google
  socialProviders: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || "com.vybe.app",
      clientSecret: process.env.APPLE_CLIENT_SECRET || "",
      enabled: !!process.env.APPLE_CLIENT_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!process.env.GOOGLE_CLIENT_SECRET,
    },
  },

  plugins: [
    expo(),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;

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
          throw new Error(data?.error || `Failed to send OTP (HTTP ${response.status})`);
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
