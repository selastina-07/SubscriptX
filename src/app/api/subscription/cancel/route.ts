import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentSubscription } from "@/lib/subscription";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to manage your plan." }, { status: 401 });

    const subscription = await getCurrentSubscription(user.id);
    if (subscription.plan === "FREE") {
      return NextResponse.json({ error: "You are already on the Free plan." }, { status: 400 });
    }
    if (subscription.status === "CANCELED") {
      return NextResponse.json({ ok: true, alreadyCanceled: true });
    }

    await prisma.subscription.update({
      where: { userId: user.id },
      data: { status: "CANCELED", cancelledAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Subscription cancellation failed.", error);
    return NextResponse.json({ error: "Could not cancel your plan. Please try again." }, { status: 500 });
  }
}
