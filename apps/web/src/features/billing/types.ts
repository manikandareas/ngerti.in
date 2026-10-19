export type PaymentProvider = "duitku" | "lemonsqueezy";

export interface PlanContract {
  amount: number;
  currency: "IDR" | "USD";
  unit_divisor: number;
  period_days: number;
  chat_messages: number;
  compute_credits: number;
}

export interface BillingOrder {
  id: string;
  provider: PaymentProvider;
  mode: "test" | "live";
  status: string;
  contract: PlanContract;
  payment_url: string | null;
  paid_through: string | null;
  expires_at: string;
  cancel_requested: boolean;
  needs_review: boolean;
  can_update_payment_method: boolean;
  can_cancel: boolean;
  lifecycle_policy: { version: string; grace_credits: number };
  created_at: string;
}

export interface BillingSummary {
  entitlement: {
    plan: "free" | "plus";
    reset_at: string;
    plus_ends_at: string | null;
    chat_limit: number;
    accepted_tasks: number;
    active_schedules: number;
    grace_credits: number;
  };
  offers: { provider: PaymentProvider; available: boolean; contract: PlanContract }[];
  orders: BillingOrder[];
  payments: {
    receipt_id: string;
    provider: PaymentProvider;
    mode: "test" | "live";
    amount: number;
    tax: number;
    currency: "IDR" | "USD";
    unit_divisor: number;
    cycle_start: string;
    cycle_end: string;
    refund_state: "none" | "partial" | "full";
    refunded_amount: number;
  }[];
}

export interface CheckoutInput {
  request_key: string;
  provider: PaymentProvider;
  email: string;
  first_name: string;
  last_name: string;
  consent: true;
}
