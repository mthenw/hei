import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import * as schema from "./schema";

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

// Migrations ship as files next to the app, not as bundled code.
const MIGRATIONS = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "drizzle",
);

/**
 * Open Hei's own database (`app.sqlite`) and bring its schema up to date. Drizzle 0.45 has no driver for Node's built-in
 * SQLite, so its proxy driver runs each query through `node:sqlite`; that keeps native modules out of the build, as
 * pi-durable does.
 */
export async function openAppDatabase(file: string): Promise<AppDatabase> {
  const sqlite = new DatabaseSync(file);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string) => {
    let statement = statements.get(sql);
    if (statement === undefined) {
      statement = sqlite.prepare(sql);
      // Drizzle's proxy driver expects rows as arrays of column values.
      statement.setReturnArrays(true);
      statements.set(sql, statement);
    }
    return statement;
  };

  const db = drizzle(
    async (sql, params, method) => {
      const statement = prepare(sql);
      switch (method) {
        case "run":
          statement.run(...params);
          return { rows: [] };
        case "get":
          // A single row, as its array of values.
          return { rows: statement.get(...params) as unknown as unknown[] };
        default:
          return { rows: statement.all(...params) };
      }
    },
    { schema },
  );

  await migrate(
    db,
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        for (const query of queries) sqlite.exec(query);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { migrationsFolder: MIGRATIONS },
  );
  return db;
}
