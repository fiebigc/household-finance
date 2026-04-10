/**
 * Maps known sign-in emails to dashboard persona keys and display names.
 * Unknown emails still work: userKey falls back to the local part of the email.
 */
export type UserProfile = {
  userKey: string;
  displayName: string;
};

const BY_EMAIL: Record<string, UserProfile> = {
  "fiebigc@gmail.com": { userKey: "christian", displayName: "Christian" },
  "heli.vauhkala@gmail.com": { userKey: "heli", displayName: "Heli" },
};

export function resolveUserProfile(email: string): UserProfile | null {
  const key = email.trim().toLowerCase();
  return BY_EMAIL[key] ?? null;
}

export function defaultUserKeyFromEmail(email: string): string {
  const local = email.trim().split("@")[0] ?? "user";
  return local.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "user";
}
