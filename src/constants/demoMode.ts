import type { AppUser } from "@/types/appUser";

/** Stable id for card layouts + linking the first adult entity in the bundled demo dataset. */
export const DEMO_USER_ID = "f0000000-0000-4000-a000-000000000001";

export function demoPreviewPseudoUser(): AppUser {
  return {
    id: DEMO_USER_ID,
    email: "demo@preview.local",
    user_metadata: { display_name: "Demo explorer", full_name: "Demo explorer" },
  };
}
