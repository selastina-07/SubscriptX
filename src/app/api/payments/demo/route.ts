import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { sendAndRecordInvoiceEmail } from "@/lib/invoice-email";
import { completeDemoPayment, DemoPaymentError } from "@/lib/payment-completion";

const simulationSchema = z.object({
  orderId: z.string().min(1).max(100),
  outcome: z.enum(["SUCCESS", "FAILED"]),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before simulating a demo payment." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = simulationSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a valid checkout order and simulation outcome." },
      { status: 400 },
    );
  }

  try {
    const result = await completeDemoPayment(
      parsed.data.orderId,
      user.id,
      parsed.data.outcome,
    );
    let emailSent: boolean | undefined;
    if (parsed.data.outcome === "SUCCESS" && result.invoice) {
      try {
        emailSent = await sendAndRecordInvoiceEmail(result.email, result.invoice);
      } catch (error) {
        console.error("Demo subscription activated, but its invoice email could not be sent.", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        emailSent = false;
      }
    }
    return NextResponse.json({
      ok: true,
      mode: "DEMO",
      outcome: parsed.data.outcome,
      activated: result.activated,
      alreadyProcessed: result.alreadyProcessed,
      emailSent,
      label: "DEMO — NO REAL MONEY CHARGED",
    });
  } catch (error) {
    if (error instanceof DemoPaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Demo payment simulation failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Could not complete the demo payment simulation. No payment details were collected." },
      { status: 500 },
    );
  }
}
