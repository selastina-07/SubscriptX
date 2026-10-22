import { BillingInterval, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { planCatalog } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const orderSchema = z.object({
  plan: z.enum(["BRONZE", "SILVER", "GOLD"]),
  interval: z.nativeEnum(BillingInterval),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before starting checkout." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid paid plan and billing period." },
      { status: 400 },
    );
  }

  const { plan, interval } = parsed.data;
  const amount = planCatalog[plan][interval];
  const receipt = `sx_${randomUUID().replaceAll("-", "").slice(0, 32)}`;

  try {
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        plan,
        billingInterval: interval,
        amount,
        currency: "INR",
        status: "PAYMENT_PENDING",
        receipt,
      },
      select: { id: true, plan: true, billingInterval: true, amount: true, currency: true },
    });
    return NextResponse.json({
      order: {
        id: order.id,
        plan: order.plan,
        interval: order.billingInterval,
        amount: order.amount,
        currency: order.currency,
        status: "PAYMENT_PENDING",
      },
      mode: "DEMO",
      label: "DEMO — NO REAL MONEY CHARGED",
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Could not create a unique demo checkout. Please try again." },
        { status: 500 },
      );
    }
    console.error("Demo checkout order creation failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Could not save the demo checkout. Check the database connection and try again." },
      { status: 500 },
    );
  }
}
