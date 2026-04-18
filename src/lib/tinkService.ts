/**
 * Tink + BankID integration scaffold (client side).
 *
 * Production flow:
 * 1. This app calls your backend (Cloudflare Worker / Supabase Edge) to create a Tink Link session.
 * 2. Backend uses Tink client id + secret to obtain a short-lived `authorizationUrl` (or Link URL).
 * 3. User completes BankID in Tink’s UI; Tink redirects to `returnUrl` with query params (or you use webhooks).
 * 4. Backend exchanges codes / receives webhooks — never put Tink secrets in the browser.
 */

/** Public env only — never add client secret here. */
export interface TinkPublicEnv {
  /** Base URL of your API route that creates a link session, e.g. https://api.example.com/tink */
  connectApiBaseUrl: string;
  /** Optional Tink Link / OAuth client id if you ever need it in the SPA (usually stays server-side). */
  clientId: string | null;
  /** When true, UI shows a dry-run panel without calling the network. */
  demoMode: boolean;
}

export function readTinkPublicEnv(): TinkPublicEnv {
  const connectApiBaseUrl = (import.meta.env.VITE_TINK_CONNECT_API_BASE_URL ?? "").trim();
  const clientId = (import.meta.env.VITE_TINK_CLIENT_ID ?? "").trim() || null;
  const demoMode =
    String(import.meta.env.VITE_TINK_DEMO_MODE ?? "").toLowerCase() === "true" ||
    import.meta.env.VITE_TINK_DEMO_MODE === "1";

  return {
    connectApiBaseUrl,
    clientId,
    demoMode,
  };
}

export function isTinkConnectConfigured(env: TinkPublicEnv = readTinkPublicEnv()): boolean {
  return Boolean(env.connectApiBaseUrl);
}

export interface TinkConnectLinkPayload {
  /** Supabase (or app) user id — backend should verify JWT before creating a session. */
  userId: string;
  /** Full URL Tink should redirect to after user completes BankID (must be allowlisted in Tink + backend). */
  returnUrl: string;
  /** Optional locale for Tink UI, e.g. sv_SE */
  market?: string;
}

export interface TinkConnectLinkResponse {
  /** Open this URL in the same window or a popup (Tink’s recommendation is often top-level navigation). */
  authorizationUrl: string;
  /** Echo from backend for debugging */
  sessionId?: string;
  expiresAt?: string;
}

export class TinkConnectError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "TinkConnectError";
  }
}

/**
 * POST `{ userId, returnUrl, market? }` to `${base}/session` (adjust path to match your Worker).
 */
export async function requestTinkAuthorizationUrl(
  payload: TinkConnectLinkPayload,
  env: TinkPublicEnv = readTinkPublicEnv(),
): Promise<TinkConnectLinkResponse> {
  if (!env.connectApiBaseUrl) {
    throw new TinkConnectError(
      "Tink connect API URL is not configured. Set VITE_TINK_CONNECT_API_BASE_URL to your backend base URL.",
    );
  }

  const url = `${env.connectApiBaseUrl.replace(/\/$/, "")}/session`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      userId: payload.userId,
      returnUrl: payload.returnUrl,
      market: payload.market ?? "sv_SE",
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new TinkConnectError(
      `Tink session request failed (${res.status})`,
      res.status,
      text,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new TinkConnectError("Invalid JSON from Tink connect API", res.status, text);
  }

  const authorizationUrl =
    (data as { authorizationUrl?: string }).authorizationUrl ??
    (data as { authorizeUrl?: string }).authorizeUrl ??
    (data as { url?: string }).url;

  if (!authorizationUrl || typeof authorizationUrl !== "string") {
    throw new TinkConnectError(
      "Connect API response missing authorizationUrl (or authorizeUrl / url)",
      res.status,
      text,
    );
  }

  return {
    authorizationUrl,
    sessionId: (data as { sessionId?: string }).sessionId,
    expiresAt: (data as { expiresAt?: string }).expiresAt,
  };
}

/** Query params your backend may append on return from Tink (convention — align with Worker). */
export type TinkCallbackStatus = "success" | "error" | "cancelled" | "idle";

export interface TinkCallbackResult {
  status: TinkCallbackStatus;
  message: string | null;
  raw: Record<string, string>;
}

const TINK_QUERY_KEYS = ["tink_status", "tink_error", "tink_message", "credentials_id"] as const;

/**
 * Read Tink-related query params once; optionally strip them from the address bar.
 */
export function consumeTinkCallbackFromUrl(options?: {
  replaceHistory?: boolean;
}): TinkCallbackResult {
  const params = new URLSearchParams(window.location.search);
  const raw: Record<string, string> = {};
  let touched = false;

  for (const key of TINK_QUERY_KEYS) {
    const v = params.get(key);
    if (v != null && v !== "") {
      raw[key] = v;
      touched = true;
    }
  }

  if (!touched) {
    return { status: "idle", message: null, raw: {} };
  }

  const statusRaw = (params.get("tink_status") ?? "").toLowerCase();
  let status: TinkCallbackStatus = "idle";
  if (statusRaw === "success") status = "success";
  else if (statusRaw === "error" || params.get("tink_error")) status = "error";
  else if (statusRaw === "cancelled" || statusRaw === "canceled") status = "cancelled";
  else if (statusRaw) status = "error";

  const message =
    params.get("tink_message") ??
    params.get("tink_error") ??
    (status === "success" ? "Bank connection updated." : null);

  if (options?.replaceHistory !== false) {
    for (const key of TINK_QUERY_KEYS) params.delete(key);
    const next =
      `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }

  return { status, message, raw };
}

/** @deprecated Use requestTinkAuthorizationUrl */
export async function createTinkConnectLink(
  payload: TinkConnectLinkPayload,
): Promise<{ url: string }> {
  const { authorizationUrl } = await requestTinkAuthorizationUrl(payload);
  return { url: authorizationUrl };
}
