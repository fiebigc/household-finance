/** True when built with `--mode webkit` (desktop WebKit wrapper); omit Supabase and cloud UX. */
export const IS_WEBKIT_STANDALONE = import.meta.env.VITE_WEBKIT_STANDALONE === "true";
