import { connection, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentSubscription } from "@/lib/subscription";

export async function GET() {
  await connection();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to view your dashboard." }, { status: 401 });

    const subscription = await getCurrentSubscription(user.id);
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        plan: true,
        billingInterval: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        invoice: { select: { number: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { mode: true, status: true },
        },
      },
    });

    return NextResponse.json({
      user,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt,
        renewalAt: subscription.status === "ACTIVE" ? subscription.expiresAt : null,
      },
      orders: orders.map(({ invoice, payments, ...order }) => ({
        ...order,
        invoiceNumber: invoice?.number ?? null,
        paymentMode: payments[0]?.mode ?? null,
        paymentStatus: payments[0]?.status ?? null,
      })),
    });
  } catch (error) {
    console.error("Dashboard request failed.", error);
    return NextResponse.json({ error: "Could not load your dashboard." }, { status: 500 });
  }
}
