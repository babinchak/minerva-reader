/**
 * When user returns from Stripe checkout with ?success=1, the webhook may not have
 * processed yet. Components listen for this event to refetch tier/credits.
 */
export const CREDITS_REFRESH_EVENT = "credits-refresh";
