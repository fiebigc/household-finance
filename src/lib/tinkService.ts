/**
 * Tink integration scaffold.
 *
 * This module is intentionally non-operational for now:
 * - UI uses placeholder actions
 * - token exchange and webhook handling should move to server-side functions
 */

export interface TinkConnectLinkPayload {
  userId: string;
  householdId: string;
}

export async function createTinkConnectLink(
  _payload: TinkConnectLinkPayload,
): Promise<{ url: string }> {
  throw new Error(
    "Tink connect flow is not enabled yet. Implement this in server-side functions.",
  );
}

