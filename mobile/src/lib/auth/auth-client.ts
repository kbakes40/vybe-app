import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient, genericOAuthClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
// Pre-import expo-network to ensure it's bundled (fixes dynamic import issue in @better-auth/expo)
import "expo-network";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_BACKEND_URL! as string,
  plugins: [
    expoClient({
      scheme: "vibecode",
      storagePrefix: "vybe",
      storage: SecureStore,
    }),
    emailOTPClient(),
    genericOAuthClient(),
  ],
});
