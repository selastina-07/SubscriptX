import { BillingInterval, PlanCode } from "@prisma/client";

export const planCatalog = {
  BRONZE: {
    MONTHLY: 9900,
    QUARTERLY: 26900,
    YEARLY: 99900,
  },
  SILVER: {
    MONTHLY: 19900,
    QUARTERLY: 54900,
    YEARLY: 199900,
  },
  GOLD: {
    MONTHLY: 39900,
    QUARTERLY: 109900,
    YEARLY: 399900,
  },
} satisfies Record<Exclude<PlanCode, "FREE">, Record<BillingInterval, number>>;

export function addBillingInterval(from: Date, interval: BillingInterval) {
  const months = interval === "MONTHLY" ? 1 : interval === "QUARTERLY" ? 3 : 12;
  const result = new Date(from);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}
