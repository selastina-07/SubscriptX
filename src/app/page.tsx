"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { planCatalog } from "@/lib/plans";

type PlanCode = "FREE" | "BRONZE" | "SILVER" | "GOLD";
type BillingInterval = "MONTHLY" | "QUARTERLY" | "YEARLY";

type DashboardData = {
  user: { email: string };
  subscription: {
    plan: PlanCode;
    status: "ACTIVE" | "CANCELED";
    startsAt: string;
    expiresAt: string | null;
    renewalAt: string | null;
  };
  orders: {
    id: string;
    plan: PlanCode;
    billingInterval: BillingInterval;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    invoiceNumber: string | null;
    paymentMode: "RAZORPAY" | "DEMO" | null;
    paymentStatus: "AUTHORIZED" | "CAPTURED" | "FAILED" | null;
  }[];
};

const plans: {
  code: Exclude<PlanCode, "FREE">;
  name: string;
  description: string;
  features: string[];
}[] = [
  {
    code: "BRONZE",
    name: "Bronze",
    description: "A little more room to explore.",
    features: ["HD streaming", "Personal watchlist", "Basic insights"],
  },
  {
    code: "SILVER",
    name: "Silver",
    description: "More choice for regular viewers.",
    features: ["Everything in Bronze", "Full HD streaming", "Offline viewing"],
  },
  {
    code: "GOLD",
    name: "Gold",
    description: "The complete SubscriptX experience.",
    features: ["Everything in Silver", "4K streaming", "Premium collections"],
  },
];

const intervals: { value: BillingInterval; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

function formatDate(value: string | null) {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export default function Home() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshDashboard = useCallback(async () => {
    const response = await fetch("/api/dashboard");
    if (response.status === 401) {
      setDashboard(null);
      return false;
    }
    if (!response.ok) throw new Error("Could not load your subscription dashboard.");
    setDashboard((await response.json()) as DashboardData);
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard")
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not load your subscription dashboard.");
        return (await response.json()) as DashboardData;
      })
      .then((result) => {
        if (active) setDashboard(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Something went wrong.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      let response: Response;
      try {
        response = await fetch(`/api/auth/${authMode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        throw new Error("Could not reach SubscriptX. Check your connection and try again.");
      }
      let result: { error?: string };
      try {
        result = (await response.json()) as { error?: string };
      } catch {
        throw new Error(`The authentication server returned an invalid response (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(result.error ?? `Authentication failed (HTTP ${response.status}).`);
      }
      if (!(await refreshDashboard())) {
        throw new Error(
          authMode === "signup"
            ? "Your account was created, but sign-in could not be confirmed. Please sign in again."
            : "Sign-in could not be confirmed. Please try again.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(plan: Exclude<PlanCode, "FREE">) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const result = (await response.json()) as {
        error?: string;
        order?: {
          id: string;
          plan: PlanCode;
          interval: BillingInterval;
          amount: number;
          currency: string;
        };
      };
      if (!response.ok || !result.order) {
        throw new Error(result.error ?? "Could not start checkout.");
      }
      router.push(`/checkout/${encodeURIComponent(result.order.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscription/cancel", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not cancel the subscription.");
      setMessage(
        "Cancellation is scheduled. Paid access remains until expiry; this starter does not auto-charge.",
      );
      await refreshDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      setDashboard(null);
      setPassword("");
      setMessage("You have been signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Subscript<span className="text-violet-600">X</span>
        </Link>
        {dashboard ? (
          <button className="text-sm text-slate-500 hover:text-slate-900" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
            Secure subscriptions
          </span>
        )}
      </header>

      <section className="mx-auto max-w-6xl pb-16 pt-14 sm:pt-20">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">
            Your viewing, your way
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            More of what you love.
            <span className="block text-violet-600">One simple plan.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
            Manage your SubscriptX plan, track billing, and keep your watch history yours.
          </p>
        </div>

        {message && (
          <p
            className="mt-8 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900"
            role="alert"
            aria-live="assertive"
          >
            {message}
          </p>
        )}

        {!dashboard ? (
          <div className="mt-10 grid gap-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-[1fr_0.9fr] sm:p-9">
            <div className="self-center">
              <p className="text-sm font-semibold text-violet-700">Get started</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Your account, your subscriptions.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                Create an account to choose a plan. Demo payments use no real payment details and
                charge no money.
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleAuth}>
              <h3 className="font-semibold text-slate-900">
                {authMode === "signin" ? "Sign in" : "Create account"}
              </h3>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  required
                  minLength={12}
                  type="password"
                  autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
                {authMode === "signup" && (
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Use at least 12 characters.
                  </span>
                )}
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? "Please wait..." : authMode === "signin" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-slate-600 hover:text-violet-700"
                onClick={() => {
                  setAuthMode(authMode === "signin" ? "signup" : "signin");
                  setMessage("");
                }}
              >
                {authMode === "signin"
                  ? "New to SubscriptX? Create an account"
                  : "Already have an account? Sign in"}
              </button>
            </form>
          </div>
        ) : (
          <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Signed in as {dashboard.user.email}</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">Your dashboard</h2>
              </div>
              <div className="rounded-2xl bg-violet-50 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                  Current plan
                </p>
                <p className="mt-1 text-xl font-bold text-violet-950">
                  {dashboard.subscription.plan}
                </p>
                {dashboard.subscription.status === "CANCELED" && (
                  <p className="mt-1 text-xs font-medium text-amber-700">Cancels at expiry</p>
                )}
              </div>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <InfoCard label="Plan started" value={formatDate(dashboard.subscription.startsAt)} />
              <InfoCard label="Expires on" value={formatDate(dashboard.subscription.expiresAt)} />
              <InfoCard
                label="Next renewal"
                value={
                  dashboard.subscription.status === "CANCELED"
                    ? "Not renewing"
                    : formatDate(dashboard.subscription.renewalAt)
                }
              />
            </div>
            {dashboard.subscription.plan !== "FREE" &&
              dashboard.subscription.status !== "CANCELED" && (
                <button
                  disabled={busy}
                  className="mt-5 text-sm font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-50"
                  onClick={cancelSubscription}
                >
                  Cancel subscription
                </button>
              )}
          </section>
        )}

        <section className="mt-14" aria-labelledby="plans-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-violet-700">Plans & pricing</p>
              <h2 id="plans-heading" className="mt-1 text-2xl font-semibold text-slate-950">
                Choose what fits.
              </h2>
            </div>
            <label className="text-sm font-medium text-slate-600">
              Billing period
              <select
                value={interval}
                onChange={(event) => setInterval(event.target.value as BillingInterval)}
                className="ml-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              >
                {intervals.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-lg font-semibold text-slate-900">Free</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">₹0</p>
              <p className="mt-2 min-h-10 text-sm text-slate-500">A great place to start.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>✓ Browse the free library</li>
                <li>✓ Save your watch history</li>
              </ul>
              <p className="mt-5 text-xs font-medium text-slate-400">
                Free plan is always available.
              </p>
            </article>
            {plans.map((plan, index) => {
              const price = planCatalog[plan.code][interval];
              const current = dashboard?.subscription.plan === plan.code;
              return (
                <article
                  key={plan.code}
                  className={`relative rounded-2xl border bg-white p-5 ${
                    index === 2 ? "border-violet-300 shadow-md shadow-violet-100" : "border-slate-200"
                  }`}
                >
                  {index === 2 && (
                    <span className="absolute -top-3 right-4 rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
                      Popular
                    </span>
                  )}
                  <p className="text-lg font-semibold text-slate-900">{plan.name}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">
                    {formatAmount(price, "INR")}
                    <span className="text-xs font-medium text-slate-500">
                      {" "}
                      / {interval.toLowerCase()}
                    </span>
                  </p>
                  <p className="mt-2 min-h-10 text-sm text-slate-500">{plan.description}</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {plan.features.map((feature) => (
                      <li key={feature}>✓ {feature}</li>
                    ))}
                  </ul>
                  <button
                    disabled={!dashboard || busy}
                    onClick={() => startCheckout(plan.code)}
                    className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {!dashboard
                      ? "Sign in to choose"
                      : current
                        ? "Renew this plan"
                        : dashboard.subscription.plan === "FREE"
                          ? "Choose plan"
                          : "Change or renew"}
                  </button>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Starter pricing is in INR and can be changed in the shared plan catalog. Demo Payment
            Mode uses no real payment details and charges no money.
          </p>
        </section>

        {dashboard && (
          <section className="mt-14" aria-labelledby="billing-heading">
            <div>
              <p className="text-sm font-semibold text-violet-700">Your account</p>
              <h2 id="billing-heading" className="mt-1 text-2xl font-semibold text-slate-950">
                Billing history
              </h2>
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {dashboard.orders.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Your payments and invoices will appear here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Date</th>
                        <th className="px-5 py-3 font-semibold">Plan</th>
                        <th className="px-5 py-3 font-semibold">Amount</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 font-semibold">Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashboard.orders.map((order) => (
                        <tr key={order.id}>
                          <td className="px-5 py-4 text-slate-600">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-900">
                            {order.plan} · {order.billingInterval.toLowerCase()}
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            {formatAmount(order.amount, order.currency)}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                              {order.paymentMode === "DEMO"
                                ? `DEMO — NO REAL MONEY CHARGED · ${order.paymentStatus?.toLowerCase() ?? order.status.toLowerCase()}`
                                : order.status.toLowerCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            {order.invoiceNumber ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
