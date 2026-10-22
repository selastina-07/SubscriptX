"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Checkout = {
  id: string;
  plan: "BRONZE" | "SILVER" | "GOLD";
  billingInterval: "MONTHLY" | "QUARTERLY" | "YEARLY";
  amount: number;
  currency: string;
  status: "CREATED" | "PAYMENT_PENDING" | "PAID" | "FAILED" | "CANCELLED";
  payment: { status: "AUTHORIZED" | "CAPTURED" | "FAILED"; mode: "DEMO" } | null;
};

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export default function DemoCheckout({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/payments/order/${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        const result = (await response.json()) as {
          error?: string;
          order?: Checkout;
        };
        if (!response.ok || !result.order) {
          throw new Error(result.error ?? "Could not load this demo checkout.");
        }
        return result.order;
      })
      .then((order) => {
        if (active) setCheckout(order);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Could not load checkout.");
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  async function simulatePayment(outcome: "SUCCESS" | "FAILED") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, outcome }),
      });
      const result = (await response.json()) as {
        error?: string;
        activated?: boolean;
        alreadyProcessed?: boolean;
        emailSent?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not complete the demo payment.");

      if (outcome === "FAILED") {
        setMessage("DEMO payment failed. No payment was taken and your subscription was not changed.");
      } else if (result.alreadyProcessed) {
        setMessage("This demo checkout has already been processed. Your subscription was not extended twice.");
      } else if (result.emailSent === false) {
        setMessage("DEMO payment succeeded. Your plan is active, but the invoice email could not be sent.");
      } else {
        setMessage("DEMO payment succeeded. Your plan is now active.");
      }

      const orderResponse = await fetch(`/api/payments/order/${encodeURIComponent(orderId)}`);
      const orderResult = (await orderResponse.json()) as { error?: string; order?: Checkout };
      if (!orderResponse.ok || !orderResult.order) {
        throw new Error(orderResult.error ?? "Payment was processed, but checkout status could not be refreshed.");
      }
      setCheckout(orderResult.order);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete the demo payment.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelCheckout() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = (await response.json()) as {
        error?: string;
        cancelled?: boolean;
        paid?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not cancel this demo checkout.");
      if (result.cancelled) {
        router.push("/");
        router.refresh();
        return;
      }
      if (result.paid) {
        setMessage("This checkout has already succeeded. Your subscription was not changed again.");
      } else {
        throw new Error("This checkout can no longer be cancelled.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not cancel this checkout.");
    } finally {
      setBusy(false);
    }
  }

  const canSimulate = checkout?.status === "PAYMENT_PENDING";

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Subscript<span className="text-violet-600">X</span>
        </Link>
        <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
          DEMO MODE
        </span>
      </header>

      <section className="mx-auto max-w-xl pt-14 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">
          Demo checkout
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Confirm your subscription
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Choose a simulation outcome below. This demo does not collect payment details or charge
          money.
        </p>

        <div className="mt-7 rounded-3xl border border-amber-300 bg-amber-50 p-5 text-center">
          <p className="font-bold tracking-wide text-amber-950">
            DEMO — NO REAL MONEY CHARGED
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Do not enter card, CVV, bank, or other payment information.
          </p>
        </div>

        {message && (
          <p
            className="mt-5 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-950"
            role="alert"
            aria-live="assertive"
          >
            {message}
          </p>
        )}

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {checkout ? (
            <>
              <p className="text-sm font-medium text-slate-500">Selected plan</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">{checkout.plan}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {checkout.billingInterval.toLowerCase()} billing
              </p>
              <p className="mt-5 text-3xl font-bold text-slate-950">
                {formatAmount(checkout.amount, checkout.currency)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Amount loaded from the server-created subscription order.
              </p>

              {checkout.status !== "PAYMENT_PENDING" && (
                <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-800">
                  {checkout.payment?.mode === "DEMO" && checkout.payment.status === "CAPTURED"
                    ? "DEMO — SUCCESS"
                    : checkout.payment?.mode === "DEMO" && checkout.payment.status === "FAILED"
                      ? "DEMO — FAILED"
                      : `Checkout ${checkout.status.toLowerCase()}`}
                </p>
              )}

              {canSimulate ? (
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => simulatePayment("SUCCESS")}
                    className="w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Processing demo..." : "Simulate Successful Payment"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => simulatePayment("FAILED")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Simulate Failed Payment
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={cancelCheckout}
                    className="w-full py-2 text-sm text-slate-500 hover:text-slate-900 disabled:opacity-50"
                  >
                    Cancel demo checkout
                  </button>
                </div>
              ) : (
                <Link
                  href="/"
                  className="mt-6 block w-full rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  Return to dashboard
                </Link>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-600">
              {message || "Loading your demo checkout..."}
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
