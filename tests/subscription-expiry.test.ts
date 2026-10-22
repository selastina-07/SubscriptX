import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as expireSubscriptions } from "@/app/api/cron/expire/route";
import { prisma } from "@/lib/prisma";
import { getCurrentSubscription, hasPlanAccess } from "@/lib/subscription";
import { assertDisposableTestDatabase } from "../scripts/test-database-guard.mjs";

const FIXED_NOW = new Date("2026-06-15T12:00:00.000Z");
const TEST_CRON_SECRET = "expiry-test-cron-secret-not-for-production";
const fixtureUserIds: string[] = [];

beforeAll(async () => {
  assertDisposableTestDatabase(process.env.SUBSCRIPTX_TEST_DATABASE_URL);
  expect(process.env.DATABASE_URL).toBe(process.env.SUBSCRIPTX_TEST_DATABASE_URL);
  if ((await prisma.user.count()) !== 0) {
    throw new Error("Expiry tests require an empty, dedicated test database.");
  }
});

async function createFixture({
  plan,
  status = "ACTIVE",
  expiresAt,
}: {
  plan: "BRONZE" | "SILVER" | "GOLD";
  status?: "ACTIVE" | "CANCELED";
  expiresAt: Date;
}) {
  const user = await prisma.user.create({
    data: {
      email: `expiry-${randomUUID()}@example.invalid`,
      passwordHash: "test-fixture-only",
      subscription: {
        create: {
          plan,
          status,
          interval: "MONTHLY",
          startsAt: new Date("2026-05-15T12:00:00.000Z"),
          expiresAt,
          cancelledAt: status === "CANCELED" ? new Date("2026-06-01T12:00:00.000Z") : null,
        },
      },
    },
  });
  fixtureUserIds.push(user.id);

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      plan,
      billingInterval: "MONTHLY",
      amount: 9900,
      status: "PAID",
      receipt: `expiry-${randomUUID()}`,
      activatedAt: new Date("2026-05-15T12:00:00.000Z"),
      subscriptionEndsAt: expiresAt,
      payments: {
        create: {
          status: "CAPTURED",
          amount: 9900,
          currency: "INR",
          mode: "DEMO",
        },
      },
      invoice: {
        create: {
          number: `EXP-${randomUUID()}`,
          amount: 9900,
          currency: "INR",
          plan,
          interval: "MONTHLY",
          startsAt: new Date("2026-05-15T12:00:00.000Z"),
          expiresAt,
        },
      },
    },
    include: { payments: true, invoice: true },
  });

  return { user, order };
}

async function readPreservedHistory(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      subscription: true,
      orders: {
        include: { payments: true, invoice: true },
      },
    },
  });
}

afterEach(async () => {
  if (fixtureUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: fixtureUserIds.splice(0) } } });
  }
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("subscription expiry and downgrade", () => {
  it("downgrades an expired paid subscription while preserving its billing history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    const { user, order } = await createFixture({
      plan: "GOLD",
      expiresAt: new Date("2026-06-14T12:00:00.000Z"),
    });

    const subscription = await getCurrentSubscription(user.id);
    expect(subscription).toMatchObject({
      plan: "FREE",
      status: "ACTIVE",
      interval: null,
      expiresAt: null,
      cancelledAt: null,
      startsAt: FIXED_NOW,
    });

    const history = await readPreservedHistory(user.id);
    expect(history.orders).toHaveLength(1);
    expect(history.orders[0]).toMatchObject({ id: order.id, status: "PAID", plan: "GOLD" });
    expect(history.orders[0].payments).toHaveLength(1);
    expect(history.orders[0].payments[0]).toMatchObject({ status: "CAPTURED", mode: "DEMO" });
    expect(history.orders[0].invoice).toMatchObject({ orderId: order.id, plan: "GOLD" });
  });

  it("leaves an unexpired paid subscription unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    const expiry = new Date("2026-06-16T12:00:00.000Z");
    const { user } = await createFixture({ plan: "SILVER", expiresAt: expiry });

    const subscription = await getCurrentSubscription(user.id);
    expect(subscription).toMatchObject({
      plan: "SILVER",
      status: "ACTIVE",
      interval: "MONTHLY",
      expiresAt: expiry,
    });
  });

  it("keeps a canceled subscription accessible through expiry, then downgrades it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    const expiry = new Date("2026-06-16T12:00:00.000Z");
    const { user } = await createFixture({
      plan: "GOLD",
      status: "CANCELED",
      expiresAt: expiry,
    });

    expect(hasPlanAccess("GOLD", "CANCELED", expiry, "GOLD", FIXED_NOW)).toBe(true);
    const beforeExpiry = await getCurrentSubscription(user.id);
    expect(beforeExpiry).toMatchObject({ plan: "GOLD", status: "CANCELED", expiresAt: expiry });

    const atExpiry = new Date(expiry);
    vi.setSystemTime(atExpiry);
    expect(hasPlanAccess("GOLD", "CANCELED", expiry, "GOLD", atExpiry)).toBe(false);
    const afterExpiry = await getCurrentSubscription(user.id);
    expect(afterExpiry).toMatchObject({
      plan: "FREE",
      status: "ACTIVE",
      interval: null,
      expiresAt: null,
      cancelledAt: null,
    });
  });

  it("can run the expiry endpoint twice and preserves users, orders, payments, and invoices", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    vi.stubEnv("CRON_SECRET", TEST_CRON_SECRET);
    const { user, order } = await createFixture({
      plan: "BRONZE",
      expiresAt: new Date("2026-06-14T12:00:00.000Z"),
    });

    const makeRequest = () =>
      new Request("http://localhost/api/cron/expire", {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });

    const firstResponse = await expireSubscriptions(makeRequest());
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toEqual({ downgradedSubscriptions: 1 });

    const secondResponse = await expireSubscriptions(makeRequest());
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual({ downgradedSubscriptions: 0 });

    const history = await readPreservedHistory(user.id);
    expect(history.subscription?.plan).toBe("FREE");
    expect(history.orders).toHaveLength(1);
    expect(history.orders[0]).toMatchObject({ id: order.id, status: "PAID" });
    expect(history.orders[0].payments).toHaveLength(1);
    expect(history.orders[0].invoice?.orderId).toBe(order.id);
  });
});
