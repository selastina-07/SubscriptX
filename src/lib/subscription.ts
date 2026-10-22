import { PlanCode, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getCurrentSubscription(userId: string) {
  const now = new Date();
  let subscription = await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: "FREE", status: "ACTIVE", startsAt: now },
    update: {},
  });

  if (
    subscription.plan !== "FREE" &&
    subscription.expiresAt &&
    subscription.expiresAt <= now
  ) {
    await prisma.subscription.updateMany({
      where: {
        userId,
        plan: { in: ["BRONZE", "SILVER", "GOLD"] },
        expiresAt: { lte: now },
      },
      data: {
        plan: "FREE",
        status: "ACTIVE",
        interval: null,
        startsAt: now,
        expiresAt: null,
        cancelledAt: null,
      },
    });
    subscription = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
  }
  return subscription;
}

export function hasPlanAccess(
  plan: PlanCode,
  status: SubscriptionStatus,
  expiresAt: Date | null,
  requiredPlan: PlanCode,
  now = new Date(),
) {
  const isActive = plan === "FREE" || (expiresAt !== null && expiresAt > now);
  if (!isActive) return requiredPlan === "FREE";

  const rank: Record<PlanCode, number> = {
    FREE: 0,
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
  };
  return rank[plan] >= rank[requiredPlan];
}
