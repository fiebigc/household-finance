import type { BackendAdapter } from "./index";
import { mockAdapter } from "./mock";

/**
 * Resolved as `supabaseAdapter` only for type-check/bundle split; standalone WebKit builds
 * never select this backend (see `useBackend`).
 */
export const supabaseAdapter: BackendAdapter = mockAdapter;
