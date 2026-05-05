/** Minimal user shape used by shell and settings (Supabase sessions or local vault pseudo-users). */
export interface AppUser {
  id: string;
  email?: string | null;
  user_metadata?: { display_name?: string; full_name?: string; [key: string]: unknown };
}
