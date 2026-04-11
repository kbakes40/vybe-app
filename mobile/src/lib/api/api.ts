import { fetch } from "expo/fetch";
import { authClient } from "../auth/auth-client";

// Response envelope type - all app routes return { data: T }
interface ApiResponse<T> {
  data: T;
}

const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;

const request = async <T>(
  url: string,
  options: { method?: string; body?: string } = {}
): Promise<T> => {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Cookie: authClient.getCookie(),
    },
  });

  // 1. Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // 2. JSON responses: parse body first (need it for error details too)
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const json: ApiResponse<T> | { error?: { message?: string; code?: string } } = await response.json();

    // Non-2xx status: surface the backend error instead of silently swallowing
    if (!response.ok) {
      const errorPayload = (json as { error?: { message?: string; code?: string } }).error;
      const message = errorPayload?.message ?? `HTTP ${response.status} on ${url}`;
      const code = errorPayload?.code ?? `HTTP_${response.status}`;
      throw new Error(`[api] ${code}: ${message}`);
    }

    return (json as ApiResponse<T>).data;
  }

  // 3. Non-JSON: if status is not ok, throw
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[api] HTTP ${response.status} on ${url}: ${text.slice(0, 200)}`);
  }

  return undefined as T;
};

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  raw: async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    return fetch(`${baseUrl}${url}`, {
      method: init?.method,
      body: init?.body,
      credentials: "include",
      headers: {
        ...init?.headers,
        Cookie: authClient.getCookie(),
      },
    });
  },
};
