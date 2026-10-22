import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const cancelSchema = z.object({ orderId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update checkout status." }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Checkout order ID is invalid." }, { status: 400 });
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!order) return NextResponse.json({ error: "Checkout order was not found." }, { status: 404 });

    if (order.status === "CREATED" || order.status === "PAYMENT_PENDING") {
      await prisma.order.updateMany({
        where: {
          id: order.id,
          status: { in: ["CREATED", "PAYMENT_PENDING"] },
        },
        data: { status: "CANCELLED" },
      });
    }
    const latest = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    return NextResponse.json({ cancelled: latest.status === "CANCELLED", paid: latest.status === "PAID" });
  } catch (error) {
    console.error("Checkout cancellation update failed.", error);
    return NextResponse.json({ error: "Could not update checkout status." }, { status: 500 });
  }
}
