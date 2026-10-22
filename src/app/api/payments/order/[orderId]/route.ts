import { connection, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  await connection();
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to view this checkout." }, { status: 401 });
    }

    const { orderId } = await params;
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: {
        id: true,
        plan: true,
        billingInterval: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        payments: {
          where: { mode: "DEMO" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, mode: true },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Demo checkout was not found." }, { status: 404 });
    }
    const { payments, ...orderDetails } = order;
    return NextResponse.json({
      order: {
        ...orderDetails,
        payment: payments[0] ?? null,
      },
      mode: "DEMO",
      label: "DEMO — NO REAL MONEY CHARGED",
    });
  } catch (error) {
    console.error("Demo checkout lookup failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Could not load this demo checkout." }, { status: 500 });
  }
}
