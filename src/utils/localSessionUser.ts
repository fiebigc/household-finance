import type { LocalFileSession } from "@/adapter/fileJson";
import type { AppUser } from "@/types/appUser";

/** Minimal Supabase-shaped user so existing UI (header, card layouts by user id) works in local mode. */
export function localSessionToPseudoUser(s: LocalFileSession): AppUser {
  const email = s.email ?? `${s.user_id.slice(0, 8)}@local.finances`;
  return {
    id: s.user_id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "local_file" },
    user_metadata: { full_name: s.display_name, display_name: s.display_name },
    identities: [],
    factors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  } as AppUser;
}
