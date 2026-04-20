// The OnlineManager stub for @better-auth/expo is installed as a side-effect
// by src/app/_layout.tsx importing install-online-manager-stub BEFORE this file
// gets reached. See that module for the full rationale.
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient, genericOAuthClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
// Pre-import @better-auth/expo's other dynamic dep (web browser flow) so it's
// bundled statically.
import "expo-web-browser";

import { getSessionBearerToken } from "./sessionBearer";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_BACKEND_URL! as string,
  /**
   * Expo persists Better Auth cookies under `vybe_cookie`, but guest login (and some
   * native sign-in paths) only store the session token via `sessionBearer` (SecureStore).
   * The server `bearer()` plugin validates `Authorization: Bearer …`; without this hook,
   * `getSession` / `useSession` stay signed out after those flows.
   */
  fetchOptions: {
    async onRequest(context) {
      const bearer = await getSessionBearerToken();
      if (!bearer) return context;
      const headers = new Headers(context.headers as Headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${bearer}`);
      }
      return { ...context, headers };
    },
  },
  plugins: [
    expoClient({
      // Must match `expo.scheme` in mobile/app.json — using anything else
      // makes Expo's Linking module log "scheme 'vibecode' does not appear
      // in the list of possible URI schemes" on every navigation/auth event.
      scheme: "vybe",
      storagePrefix: "vybe",
      storage: SecureStore,
    }),
    emailOTPClient(),
    genericOAuthClient(),
  ],
});
