/**
 * Optional display names for signed-in users (header). Unknown emails fall back to the local part before @.
 */
const EMAIL_TO_DISPLAY_NAME: Record<string, string> = {
  "fiebigc@gmail.com": "Christian",
  "heli.vauhkala@gmail.com": "Heli",
};

export function authEmailDisplayName(email: string | undefined | null): string {
  if (!email?.trim()) return "Signed in";
  const key = email.trim().toLowerCase();
  if (EMAIL_TO_DISPLAY_NAME[key]) return EMAIL_TO_DISPLAY_NAME[key];
  const local = email.split("@")[0]?.trim();
  return local || email;
}
