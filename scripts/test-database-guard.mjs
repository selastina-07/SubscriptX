import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseDatabaseUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A configured database URL is invalid; refusing to run expiry tests.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Expiry tests require a PostgreSQL test database.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) throw new Error("The configured database URL has no database name.");

  return {
    identity: `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || "5432"}/${database}`,
    database,
  };
}

function readConfiguredDatabaseUrls() {
  const values = [];

  for (const file of [".env.local", ".env"]) {
    const path = resolve(projectRoot, file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
      if (!match) continue;

      const value = match[1]
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/\s+#.*$/, "");

      if (value) values.push(value);
    }
  }

  return values;
}

export function assertDisposableTestDatabase(testDatabaseUrl) {
  const testTarget = parseDatabaseUrl(testDatabaseUrl);
  if (!testTarget || !/(^|[_-])test($|[_-])/i.test(testTarget.database)) {
    throw new Error(
      "Set SUBSCRIPTX_TEST_DATABASE_URL to a dedicated PostgreSQL database whose name includes a test segment (for example, subscriptx_test).",
    );
  }

  for (const configuredUrl of readConfiguredDatabaseUrls()) {
    const configuredTarget = parseDatabaseUrl(configuredUrl);
    if (configuredTarget?.identity === testTarget.identity) {
      throw new Error(
        "The test database matches a configured development database; expiry tests were stopped before connecting.",
      );
    }
  }

  return testTarget;
}
