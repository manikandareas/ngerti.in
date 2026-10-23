export const creditNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
export const usageDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
export const formatCredits = (value: number) => `${creditNumber.format(value)} kredit`;
