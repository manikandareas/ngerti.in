import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import type { BillingOrder, BillingSummary, CheckoutInput } from "../types";

export function useBilling() {
  const { userId, getToken } = useAuth();
  const cache = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["billing", userId],
    enabled: Boolean(userId),
    queryFn: async () => api<BillingSummary>("/billing", await getToken()),
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: async (command: { path: string; body?: CheckoutInput }) =>
      api<BillingOrder>(command.path, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: command.body ? JSON.stringify(command.body) : undefined,
      }),
    onMutate: () => setMessage(null),
    onError: (error) => setMessage(error.message),
    onSuccess: async (order, command) => {
      if (command.body && order.payment_url) window.location.assign(order.payment_url);
      else if (order.needs_review)
        setMessage("Pembayaran sedang diperiksa. Jangan membuat pembayaran baru terlebih dahulu.");
      else if (order.cancel_requested)
        setMessage(
          order.status === "cancelled"
            ? "Perpanjangan otomatis sudah dibatalkan. Akses mengikuti periode yang sudah dibayar."
            : "Permintaan pembatalan tersimpan. Menunggu konfirmasi penyedia pembayaran.",
        );
      else setMessage("Status pembayaran sudah diperbarui.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["billing", userId] }),
        cache.invalidateQueries({ queryKey: ["quotas"] }),
        cache.invalidateQueries({ queryKey: ["compute-usage", userId] }),
      ]);
    },
  });
  const paymentMethod = useMutation({
    mutationFn: async (id: string) =>
      api<{ url: string }>(`/billing/${id}/payment-method`, await getToken(), { method: "POST" }),
    onMutate: () => setMessage(null),
    onError: (error) => setMessage(error.message),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  return { query, mutation, paymentMethod, message };
}
