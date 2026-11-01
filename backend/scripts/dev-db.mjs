/**
 * Local PostgreSQL for development on machines without Docker or an admin
 * Postgres install. Production should use the docker-compose postgres service
 * (or any managed PostgreSQL) with the same DATABASE_URL.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.PGPORT ?? 5432);
const user = process.env.PGUSER ?? "kronos";
const password = process.env.PGPASSWORD ?? "kronos";
const database = process.env.PGDATABASE ?? "kronos";
const databaseDir = path.resolve(process.env.PGDATA ?? ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  autoRehydrateSymlinks: true,
});

const initialised = existsSync(path.join(databaseDir, "PG_VERSION"));
if (!initialised) {
  console.log(`Initialising local PostgreSQL cluster in ${databaseDir}`);
  await pg.initialise();
}

await pg.start();
console.log(`PostgreSQL listening on 127.0.0.1:${port} (user=${user}, database=${database})`);

try {
  await pg.createDatabase(database);
  console.log(`Created database ${database}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already exists/i.test(message)) console.log(`Database ${database} ready (${message})`);
}

async function shutdown(signal) {
  console.log(`\n${signal} received, stopping local PostgreSQL…`);
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Keep the supervisor process alive for as long as Postgres is needed.
setInterval(() => undefined, 60_000);
