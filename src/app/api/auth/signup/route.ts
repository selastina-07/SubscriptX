import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  authenticationSetupError,
  createSession,
  validateSessionConfiguration,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and a password of at least 12 characters." },
      { status: 400 },
    );
  }

  try {
    validateSessionConfiguration();
  } catch (error) {
    const setupError = authenticationSetupError(error);
    console.error("Account creation configuration is incomplete.", error);
    return NextResponse.json(
      { error: setupError?.message ?? "Authentication is not configured. Check the server setup." },
      { status: setupError?.status ?? 503 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  let user: { id: string };
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        subscription: { create: { plan: "FREE", status: "ACTIVE" } },
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    console.error("Account creation failed.", error);
    const setupError = authenticationSetupError(error);
    return NextResponse.json(
      { error: setupError?.message ?? "Account creation failed because of a server error. Please try again." },
      { status: setupError?.status ?? 500 },
    );
  }

  try {
    await createSession(user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Account was created, but its session could not be started.", error);
    const setupError = authenticationSetupError(error);
    return NextResponse.json(
      {
        error: setupError
          ? `Your account was created, but sign-in could not be started. ${setupError.message}`
          : "Your account was created, but sign-in could not be started. Please sign in again.",
      },
      { status: setupError?.status ?? 500 },
    );
  }
}
