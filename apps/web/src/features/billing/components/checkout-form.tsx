import { useUser } from "@clerk/tanstack-react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BillingSummary, CheckoutInput, PaymentProvider } from "../types";
import { money } from "../utils/format";

interface Props {
  offers: BillingSummary["offers"];
  busy: boolean;
  blocked: boolean;
  onCheckout: (body: CheckoutInput) => void;
}

export function CheckoutForm({ offers, busy, blocked, onCheckout }: Props) {
  const { user } = useUser();
  const [provider, setProvider] = useState<PaymentProvider>(
    () => offers.find((item) => item.available)?.provider ?? offers[0]?.provider ?? "lemonsqueezy",
  );
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [consent, setConsent] = useState(false);
  const offer = offers.find((item) => item.provider === provider);
  const OfferCard = offers.length > 1 ? "label" : "div";
  if (!offer)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Pembayaran Plus belum tersedia. Coba kembali nanti.
      </p>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!consent || !offer.available || busy || blocked) return;
        const data = new FormData(event.currentTarget);
        onCheckout({
          provider,
          request_key: requestKey,
          email: String(data.get("email")),
          first_name: String(data.get("first_name")),
          last_name: String(data.get("last_name")),
          consent,
        });
      }}
    >
      <fieldset disabled={busy || blocked} className="space-y-4">
        <legend className="mb-3 text-sm font-medium">Pembayaran Plus</legend>
        <div className={offers.length > 1 ? "grid gap-3 min-[480px]:grid-cols-2" : "grid gap-3"}>
          {offers.map((item) => (
            <OfferCard
              key={item.provider}
              className="flex items-start gap-3 rounded-xl border p-4 text-sm has-[:checked]:border-primary"
            >
              {offers.length > 1 && (
                <input
                  type="radio"
                  name="provider"
                  value={item.provider}
                  checked={provider === item.provider}
                  onChange={() => {
                    setProvider(item.provider);
                    setRequestKey(crypto.randomUUID());
                    setConsent(false);
                  }}
                  className="mt-1 accent-primary"
                />
              )}
              <span>
                <span className="block font-medium">
                  {offers.length > 1 &&
                    (item.provider === "duitku" ? "Indonesia · " : "Internasional · ")}
                  {item.provider === "duitku" ? "Duitku" : "Lemon Squeezy"}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {money(item.contract.amount, item.contract.currency, item.contract.unit_divisor)}{" "}
                  / 30 hari
                  {item.provider === "lemonsqueezy" ? ", sebelum pajak" : ""}
                </span>
                {!item.available && (
                  <span className="mt-1 block text-muted-foreground">Belum tersedia</span>
                )}
              </span>
            </OfferCard>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          300 pesan dan 5.000 kredit komputasi setiap periode yang dibayar.
          {provider === "duitku"
            ? " Pembayaran berulang memakai kartu kredit."
            : " Pajak yang berlaku ditampilkan pada checkout. Lemon Squeezy memproses pembayaran dalam ekuivalen USD."}
        </p>
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <label htmlFor="billing-first-name" className="space-y-2 text-sm">
            <span>Nama depan</span>
            <Input
              id="billing-first-name"
              name="first_name"
              autoComplete="given-name"
              required
              maxLength={50}
              defaultValue={user?.firstName ?? ""}
            />
          </label>
          <label htmlFor="billing-last-name" className="space-y-2 text-sm">
            <span>Nama belakang</span>
            <Input
              id="billing-last-name"
              name="last_name"
              autoComplete="family-name"
              required
              maxLength={50}
              defaultValue={user?.lastName ?? ""}
            />
          </label>
        </div>
        <label htmlFor="billing-email" className="block space-y-2 text-sm">
          <span>Email pembayaran</span>
          <Input
            id="billing-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            defaultValue={user?.primaryEmailAddress?.emailAddress ?? ""}
          />
        </label>
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            required
            name="consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Saya menyetujui penagihan otomatis{" "}
            {money(offer.contract.amount, offer.contract.currency, offer.contract.unit_divisor)}{" "}
            setiap 30 hari sampai dibatalkan
            {provider === "lemonsqueezy" ? ", ditambah pajak yang berlaku" : ""}. Pembatalan
            menghentikan perpanjangan berikutnya.
          </span>
        </label>
        <Button type="submit" disabled={!offer.available || !consent || busy || blocked}>
          {busy ? "Memproses…" : "Berlangganan Plus"}
        </Button>
      </fieldset>
      {blocked && (
        <p className="text-sm text-muted-foreground">
          Periksa langganan atau pembayaran yang sudah ada sebelum memulai yang baru.
        </p>
      )}
    </form>
  );
}
