export interface QueryResult<T = Record<string, unknown>> { results: T[]; meta: { changes: number }; success: boolean }
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  run<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
}
export interface Database { prepare(sql: string): Statement; batch<T = Record<string, unknown>>(queries: Statement[]): Promise<QueryResult<T>[]> }
export interface Environment { DB: Database; ASSETS?: { fetch(request: Request): Promise<Response> } }
export function getDatabase(env: Environment): Database {
  if (!env.DB) throw new Error('Research storage is temporarily unavailable.');
  return env.DB;
}
