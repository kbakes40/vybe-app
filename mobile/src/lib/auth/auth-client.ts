// The OnlineManager stub for @better-auth/expo is installed as a side-effect
// by mobile/index.ts importing ./install-online-manager-stub BEFORE this file
// gets reached. See that file for the full rationale.
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient, genericOAuthClient, phoneNumberClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
// Pre-import @better-auth/expo's other dynamic dep (web browser flow) so it's
// bundled statically.
import "expo-web-browser";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_BACKEND_URL! as string,
  plugins: [
    expoClient({
      scheme: "vibecode",
      storagePrefix: "vybe",
      storage: SecureStore,
    }),
    emailOTPClient(),
    phoneNumberClient(),
    genericOAuthClient(),
  ],
});
