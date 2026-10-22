import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposableTestDatabase } from "./test-database-guard.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testDatabaseUrl = process.env.SUBSCRIPTX_TEST_DATABASE_URL;

try {
  assertDisposableTestDatabase(testDatabaseUrl);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  CRON_SECRET: "expiry-test-cron-secret-not-for-production",
};
const prismaCli = resolve(projectRoot, "node_modules", "prisma", "build", "index.js");
const vitestCli = resolve(projectRoot, "node_modules", "vitest", "vitest.mjs");

function run(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  run([prismaCli, "migrate", "deploy"]);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  try {
    if ((await prisma.user.count()) !== 0) {
      throw new Error(
        "The isolated test database already contains users. Tests were not run; use a fresh, dedicated test database.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  run([vitestCli, "run", "tests/subscription-expiry.test.ts"]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
