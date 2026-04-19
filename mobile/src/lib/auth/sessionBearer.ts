import * as SecureStore from "expo-secure-store";

const BEARER_KEY = "vybe_api_session_bearer";

export async function setSessionBearerToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(BEARER_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function getSessionBearerToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BEARER_KEY);
  } catch {
    return null;
  }
}

export async function clearSessionBearerToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BEARER_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Persists the Better Auth session token from sign-in responses so `api.*` can send
 * `Authorization: Bearer …` (works with `bearer()` on the server) alongside cookies.
 */
export async function persistSessionBearerFromAuthResult(result: unknown): Promise<void> {
  const r = result as {
    data?: { token?: string; session?: { token?: string } };
    token?: string;
  };
  const d = r?.data;
  const token = d?.token ?? d?.session?.token ?? r?.token;
  if (typeof token === "string" && token.length > 8) {
    await setSessionBearerToken(token);
  }
}
