import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || secret.length < 32 || secret.startsWith("replace_with_") || !authorization) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const now = new Date();
    const result = await prisma.subscription.updateMany({
      where: {
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
    return NextResponse.json({ downgradedSubscriptions: result.count });
  } catch (error) {
    console.error("Subscription expiry job failed.", error);
    return NextResponse.json({ error: "Could not process expired subscriptions." }, { status: 500 });
  }
}
