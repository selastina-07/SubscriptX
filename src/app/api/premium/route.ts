import { connection, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentSubscription, hasPlanAccess } from "@/lib/subscription";

export async function GET() {
  await connection();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to view premium content." }, { status: 401 });

    const subscription = await getCurrentSubscription(user.id);
    if (
      !hasPlanAccess(
        subscription.plan,
        subscription.status,
        subscription.expiresAt,
        "SILVER",
      )
    ) {
      return NextResponse.json(
        { error: "This feature requires an active Silver or Gold plan." },
        { status: 403 },
      );
    }
    return NextResponse.json({
      content: "Premium feature access confirmed for your active plan.",
    });
  } catch (error) {
    console.error("Premium feature access check failed.", error);
    return NextResponse.json({ error: "Could not verify feature access." }, { status: 500 });
  }
}
