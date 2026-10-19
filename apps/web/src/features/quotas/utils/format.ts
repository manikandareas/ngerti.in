export const creditNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
export const usageDate = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});
export const formatCredits = (value: number) => `${creditNumber.format(value)} kredit`;
