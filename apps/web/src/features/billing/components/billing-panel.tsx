import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { useBilling } from "../hooks/use-billing";
import { billingDate, money } from "../utils/format";
import { CheckoutForm } from "./checkout-form";
import { EntitlementStatus } from "./entitlement-status";
import { SubscriptionStatus } from "./subscription-status";

export function BillingPanel() {
  const { query, mutation, paymentMethod, message } = useBilling();
  if (!query.data)
    return (
      <WorkspaceState
        kind={query.isError ? "error" : "loading"}
        title={query.isError ? "Langganan belum dapat dimuat" : "Memuat langganan…"}
        onRetry={query.isError ? () => void query.refetch() : undefined}
      />
    );
  const { offers, orders, payments, entitlement } = query.data;
  const blocked = orders.some(
    (order) =>
      !["expired", "failed", "cancelled"].includes(order.status) ||
      Boolean(order.paid_through && new Date(order.paid_through).getTime() > Date.now()),
  );
  return (
    <section aria-labelledby="billing-heading" className="space-y-6 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="billing-heading">Langganan Plus</h2>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Perbarui
        </Button>
      </div>
      {query.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          Pembaruan terhenti. Data berasal dari pembaruan terakhir.
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-muted p-4 text-sm">
          {message}
        </p>
      )}
      <EntitlementStatus value={entitlement} />
      {orders.slice(0, 3).map((order) => (
        <SubscriptionStatus
          key={order.id}
          order={order}
          busy={mutation.isPending || paymentMethod.isPending}
          onRefresh={() => mutation.mutate({ path: `/billing/${order.id}/refresh` })}
          onCancel={() => mutation.mutate({ path: `/billing/${order.id}/cancel` })}
          onPaymentMethod={() => paymentMethod.mutate(order.id)}
        />
      ))}
      <CheckoutForm
        key={offers
          .map(
            ({ provider, contract }) =>
              `${provider}:${contract.amount}:${contract.currency}:${contract.period_days}`,
          )
          .join("|")}
        offers={offers}
        busy={mutation.isPending}
        blocked={blocked}
        onCheckout={(body) => mutation.mutate({ path: "/billing/checkout", body })}
      />
      {payments.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Riwayat pembayaran</h3>
          <ul className="divide-y">
            {payments.map((payment) => (
              <li
                key={`${payment.provider}:${payment.mode}:${payment.receipt_id}`}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span>
                  {billingDate.format(new Date(payment.cycle_start))}
                  {payment.mode === "test" ? " · Pengujian" : ""}
                  {payment.refund_state === "full" ? " · Refund penuh; hak periode dicabut" : null}
                  {payment.refund_state === "partial"
                    ? " · Refund sebagian; sedang diperiksa"
                    : null}
                </span>
                <span>
                  {money(payment.amount + payment.tax, payment.currency, payment.unit_divisor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
