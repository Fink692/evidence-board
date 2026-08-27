import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Database, QueryResult, Statement } from './database';

/** Local development/test adapter only; never included in the Worker build. */
export function openLocalDatabase(path: string, migrations = resolve('drizzle')): Database & { close(): void } {
  const sqlite = new DatabaseSync(path);
  sqlite.prepare('PRAGMA foreign_keys = ON').run();
  sqlite.prepare('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)').run();
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    if (sqlite.prepare('SELECT name FROM _local_migrations WHERE name = ?').get(file)) continue;
    sqlite.prepare('BEGIN').run();
    try {
      for (const sql of readFileSync(resolve(migrations, file), 'utf8').split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean)) sqlite.prepare(sql).run();
      sqlite.prepare('INSERT INTO _local_migrations (name) VALUES (?)').run(file);
      sqlite.prepare('COMMIT').run();
    } catch (error) { sqlite.prepare('ROLLBACK').run(); throw error; }
  }
  class LocalStatement implements Statement {
    constructor(readonly sql: string, readonly values: unknown[] = []) {}
    bind(...values: unknown[]) { return new LocalStatement(this.sql, values); }
    execute(): QueryResult {
      const statement = sqlite.prepare(this.sql);
      const results = statement.all(...this.values as Array<string | number | null>) as Record<string, unknown>[];
      const changes = Number((sqlite.prepare('SELECT changes() AS count').get() as {count: number}).count);
      return { results, meta: { changes }, success: true };
    }
    async first<T>() { return (this.execute().results[0] as T) ?? null; }
    async all<T>() { return this.execute() as QueryResult<T>; }
    async run<T>() { return this.execute() as QueryResult<T>; }
  }
  return {
    prepare(sql) { return new LocalStatement(sql); },
    async batch<T>(queries: Statement[]) {
      sqlite.prepare('BEGIN').run();
      try { const result = queries.map(query => (query as LocalStatement).execute() as QueryResult<T>); sqlite.prepare('COMMIT').run(); return result; }
      catch (error) { sqlite.prepare('ROLLBACK').run(); throw error; }
    },
    close() { sqlite.close(); },
  };
}
