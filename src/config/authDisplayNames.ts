import type { User } from "@supabase/supabase-js";

/**
 * Human-readable name for the header and UI.
 * Set per user in Supabase Dashboard → Authentication → Users → user →
 * “Raw User Meta Data”, e.g. `{ "display_name": "Alex" }`, or via Admin API
 * (`user_metadata.display_name`, `full_name`, or `name`).
 */
export function authUserDisplayName(user: User | null | undefined): string {
  if (!user) return "Signed in";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = [meta?.display_name, meta?.full_name, meta?.name].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  if (fromMeta) return fromMeta.trim();
  const email = user.email?.trim();
  if (!email) return "Signed in";
  const local = email.split("@")[0]?.trim();
  return local || email;
}
