import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  authenticationSetupError,
  createSession,
  validateSessionConfiguration,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const signinSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = signinSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  try {
    validateSessionConfiguration();
  } catch (error) {
    const setupError = authenticationSetupError(error);
    console.error("Sign-in configuration is incomplete.", error);
    return NextResponse.json(
      { error: setupError?.message ?? "Authentication is not configured. Check the server setup." },
      { status: setupError?.status ?? 503 },
    );
  }

  let user: { id: string; passwordHash: string } | null;
  let valid = false;
  try {
    user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, passwordHash: true },
    });
    valid = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : await bcrypt.compare(
          parsed.data.password,
          "$2a$12$C6UzMDM.H6dfI/f/IKcEe.5jO9yU8arTnZ9t/U3KPlsOG5qz9j6Xa",
        );
  } catch (error) {
    console.error("Sign-in lookup failed.", error);
    const setupError = authenticationSetupError(error);
    return NextResponse.json(
      { error: setupError?.message ?? "Could not sign in because of a server error. Please try again." },
      { status: setupError?.status ?? 500 },
    );
  }
  if (!user || !valid) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  try {
    await createSession(user.id);
  } catch (error) {
    console.error("Sign-in session creation failed.", error);
    const setupError = authenticationSetupError(error);
    return NextResponse.json(
      { error: setupError?.message ?? "Could not start your session. Please try again." },
      { status: setupError?.status ?? 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
