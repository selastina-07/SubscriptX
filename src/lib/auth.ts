import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const sessionCookieName = "subscriptx_session";
const sessionDurationMs = 1000 * 60 * 60 * 24 * 30;

function hashToken(token: string) {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace_with_")) {
    throw new Error("SESSION_SECRET must be a private random value of at least 32 characters.");
  }
  return secret;
}

export function validateSessionConfiguration() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Database is not configured. Copy .env.example to .env.local, set DATABASE_URL to a running PostgreSQL database, run the database migration, and restart the server.",
    );
  }

  sessionSecret();
}

export function authenticationSetupError(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Database is not configured.")) {
    return { message: error.message, status: 503 };
  }
  if (error instanceof Error && error.message.startsWith("SESSION_SECRET must be")) {
    return {
      message:
        "Authentication is not configured. Set a private SESSION_SECRET of at least 32 characters in .env.local and restart the server.",
      status: 503,
    };
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1000", "P1001", "P1002", "P1003", "P1013", "P1017", "P2024"].includes(error.code))
  ) {
    return {
      message:
        "Could not connect to PostgreSQL. Check DATABASE_URL, confirm the database is running, and try again.",
      status: 503,
    };
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2021", "P2022"].includes(error.code)
  ) {
    return {
      message:
        "The database schema is not ready. Run npm run db:migrate -- --name init, then try again.",
      status: 503,
    };
  }
  return null;
}

export async function createSession(userId: string) {
  sessionSecret();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, user: { select: { id: true, email: true } } },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    return null;
  }
  return session.user;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  cookieStore.delete(sessionCookieName);
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
