/**
 * Payment provider abstraction. Stripe and OpenNode (future) implement this.
 */

export interface CheckoutSessionParams {
  userId: string;
  successUrl: string;
  cancelUrl: string;
  mode: "subscription";
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface PaymentProvider {
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult | null>;
  handleWebhook(payload: string | Buffer, signature: string): Promise<WebhookResult>;
}

export interface WebhookResult {
  handled: boolean;
  error?: string;
}
