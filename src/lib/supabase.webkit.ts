/**
 * WebKit standalone build shim — `@supabase/supabase-js` is not bundled for this target.
 */

export function isSupabaseConfigured(): boolean {
  return false;
}

export function getSupabase(): never {
  throw new Error("Cloud storage is not available in the desktop bundle.");
}

export const supabase = null;
