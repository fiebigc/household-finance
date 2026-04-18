/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string;
  /** Base URL for your Tink session API (e.g. Cloudflare Worker), no trailing slash. */
  readonly VITE_TINK_CONNECT_API_BASE_URL?: string;
  /** Optional; usually only needed client-side if Tink docs require it (prefer server-only). */
  readonly VITE_TINK_CLIENT_ID?: string;
  /** Set to "true" to label demo state in UI; connect still needs API URL. */
  readonly VITE_TINK_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
