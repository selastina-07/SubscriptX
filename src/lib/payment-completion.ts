import "server-only";
import { BillingInterval, OrderStatus, PaymentMode, PlanCode, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { addBillingInterval, planCatalog } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export class DemoPaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DemoPaymentError";
  }
}

export async function completeDemoPayment(
  orderId: string,
  userId: string,
  outcome: "SUCCESS" | "FAILED",
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const order = await transaction.order.findFirst({
            where: { id: orderId, userId },
            include: { user: { select: { email: true } } },
          });
          if (!order) throw new DemoPaymentError("Checkout order was not found.", 404);

          const existingPayment = await transaction.payment.findFirst({
            where: { orderId: order.id, mode: PaymentMode.DEMO },
            orderBy: { createdAt: "desc" },
          });
          if (order.status === "PAID") {
            if (outcome !== "SUCCESS") {
              throw new DemoPaymentError("This checkout has already succeeded.", 409);
            }
            return {
              activated: false,
              alreadyProcessed: true,
              email: order.user.email,
              invoice: await transaction.invoice.findUnique({ where: { orderId: order.id } }),
            };
          }
          if (order.status === "FAILED" && existingPayment?.status === "FAILED") {
            return {
              activated: false,
              alreadyProcessed: true,
              email: order.user.email,
              invoice: null,
            };
          }
          if (order.status !== "PAYMENT_PENDING") {
            throw new DemoPaymentError(
              "This checkout is no longer active. Start a new checkout to try again.",
              409,
            );
          }

          if (order.plan === "FREE") {
            throw new DemoPaymentError("Free plans do not have a paid checkout.", 409);
          }
          const plan: Exclude<PlanCode, "FREE"> = order.plan;
          const interval: BillingInterval = order.billingInterval;
          const expectedAmount = planCatalog[plan][interval];
          if (order.amount !== expectedAmount || order.currency !== "INR") {
            throw new DemoPaymentError(
              "The saved checkout amount does not match the selected plan. No subscription changes were made.",
              409,
            );
          }

          if (outcome === "FAILED") {
            await transaction.payment.create({
              data: {
                orderId: order.id,
                status: "FAILED",
                failureReason: "DEMO payment failure simulated by the user.",
                amount: order.amount,
                currency: order.currency,
                mode: PaymentMode.DEMO,
              },
            });
            await transaction.order.update({
              where: { id: order.id },
              data: {
                status: OrderStatus.FAILED,
                failureReason: "DEMO payment failure simulated by the user.",
              },
            });
            return {
              activated: false,
              alreadyProcessed: false,
              email: order.user.email,
              invoice: null,
            };
          }

          const now = new Date();
          const currentSubscription = await transaction.subscription.findUnique({
            where: { userId },
          });
          const startsAt =
            currentSubscription?.plan === order.plan &&
            currentSubscription.expiresAt &&
            currentSubscription.expiresAt > now
              ? currentSubscription.expiresAt
              : now;
          const expiresAt = addBillingInterval(startsAt, interval);

          await transaction.subscription.upsert({
            where: { userId },
            create: {
              userId,
              plan: order.plan,
              interval,
              status: "ACTIVE",
              startsAt,
              expiresAt,
              cancelledAt: null,
            },
            update: {
              plan: order.plan,
              interval,
              status: "ACTIVE",
              startsAt,
              expiresAt,
              cancelledAt: null,
            },
          });
          await transaction.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.PAID,
              activatedAt: now,
              subscriptionEndsAt: expiresAt,
            },
          });
          await transaction.payment.create({
            data: {
              orderId: order.id,
              status: "CAPTURED",
              amount: order.amount,
              currency: order.currency,
              mode: PaymentMode.DEMO,
            },
          });
          const invoice = await transaction.invoice.create({
            data: {
              orderId: order.id,
              number: `SX-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
              amount: order.amount,
              currency: order.currency,
              plan: order.plan,
              interval,
              startsAt,
              expiresAt,
            },
          });
          return {
            activated: true,
            alreadyProcessed: false,
            email: order.user.email,
            invoice,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Demo payment could not be completed after concurrent updates.");
}
