import { z } from 'zod';
import { createBoardStore } from '../src/state/boardStore';
import { idSchema, parseUntrustedJson, parseValidated, DomainError } from '../src/domain/validation';
import { getDatabase, type Environment, type Statement } from './database';

export const MAX_SESSION_BYTES = 8_000_000;
const MAX_BOARDS = 100;
const CHUNK_CHARACTERS = 400_000;
const payloadSchema = z.object({ id: idSchema.optional(), version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1).optional(), session: z.unknown() }).strict();
interface BoardRow { id: string; owner_id: string; title: string; question: string; node_count: number; source_count: number; version: number; created_at: string; updated_at: string; part?: number; payload?: string }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' } });
function summary(row: BoardRow) { return { id: row.id, title: row.title, question: row.question, nodeCount: row.node_count, sourceCount: row.source_count, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at }; }
function identity(request: Request) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email) return null;
  let name = email;
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(request.headers.get('oai-authenticated-user-full-name') || '') || email; } catch { /* email is a safe display fallback */ }
  }
  return { id, email, name };
}
async function readPayload(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Send research as JSON.');
  if (Number(request.headers.get('content-length')) > MAX_SESSION_BYTES + 1_000) throw new ApiError(413, 'This board exceeds the 8 MB workspace limit. Export it and split it into smaller boards.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'A research session is required.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > MAX_SESSION_BYTES + 1_000) { await reader.cancel(); throw new ApiError(413, 'This board exceeds the 8 MB workspace limit. Export it and split it into smaller boards.'); }
    chunks.push(value);
  }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return parseValidated(payloadSchema, parseUntrustedJson(new TextDecoder().decode(body), MAX_SESSION_BYTES + 1_000), 'Save request');
}
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function handleApi(request: Request, env: Environment): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'evidence-board' });
  const user = identity(request);
  if (!user) return json({ error: 'Sign in to open your private research workspace.', code: 'SIGN_IN_REQUIRED' }, 401);
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-evidence-board') !== '1') return json({ error: 'This request did not come from your workspace.' }, 403);
  }
  try {
    const db = getDatabase(env);
    if (url.pathname === '/api/workspace' && request.method === 'GET') {
      const result = await db.prepare('SELECT id, title, question, node_count, source_count, version, created_at, updated_at FROM boards WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all<BoardRow>();
      return json({ user: { email: user.email, name: user.name }, boards: result.results.map(summary), maxBoards: MAX_BOARDS });
    }
    const match = url.pathname.match(/^\/api\/boards\/([A-Za-z0-9_-]{1,96})$/);
    if (match && request.method === 'GET') {
      const rows = await db.prepare('SELECT b.*, c.part, c.payload FROM boards b JOIN board_chunks c ON c.board_id = b.id WHERE b.id = ? AND b.owner_id = ? ORDER BY c.part').bind(match[1], user.id).all<BoardRow>();
      if (!rows.results.length) return json({ error: 'That research board could not be found.' }, 404);
      return json({ board: summary(rows.results[0]), session: JSON.parse(rows.results.map(row => row.payload).join('')) });
    }
    if ((url.pathname === '/api/boards' && request.method === 'POST') || (match && request.method === 'PUT')) {
      const input = await readPayload(request);
      if (input.session === undefined) throw new ApiError(400, 'A complete research session is required.');
      const store = createBoardStore({ session: input.session, storage: null, preserveRunningActivity: true });
      const content = store.getState().content;
      const serialized = store.exportSession();
      if (new TextEncoder().encode(serialized).byteLength > MAX_SESSION_BYTES) throw new ApiError(413, 'This board exceeds the 8 MB workspace limit. Export it and split it into smaller boards.');
      const id = match?.[1] ?? input.id;
      if (!id) throw new ApiError(400, 'A board identifier is required.');
      const token = crypto.randomUUID(); const now = new Date().toISOString();
      const queries: Statement[] = [];
      if (match) {
        if (!input.version) throw new ApiError(400, 'A save version is required.');
        queries.push(db.prepare('UPDATE boards SET title = ?, question = ?, node_count = ?, source_count = ?, version = version + 1, write_token = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ?').bind(content.title, content.question, content.nodes.length, content.sources.length, token, now, id, user.id, input.version));
        queries.push(db.prepare('DELETE FROM board_chunks WHERE board_id = ? AND EXISTS (SELECT 1 FROM boards WHERE id = ? AND owner_id = ? AND write_token = ?)').bind(id, id, user.id, token));
      } else {
        queries.push(db.prepare('INSERT INTO boards (id, owner_id, title, question, node_count, source_count, version, write_token, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ? WHERE (SELECT COUNT(*) FROM boards WHERE owner_id = ?) < ? ON CONFLICT(id) DO NOTHING').bind(id, user.id, content.title, content.question, content.nodes.length, content.sources.length, token, now, now, user.id, MAX_BOARDS));
      }
      for (let start = 0, part = 0; start < serialized.length; part++) {
        let end = Math.min(start + CHUNK_CHARACTERS, serialized.length);
        // Never split a UTF-16 surrogate pair across SQLite text values.
        const last = serialized.charCodeAt(end - 1);
        if (end < serialized.length && last >= 0xd800 && last <= 0xdbff) end--;
        queries.push(db.prepare('INSERT INTO board_chunks (board_id, part, payload) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM boards WHERE id = ? AND owner_id = ? AND write_token = ?)').bind(id, part, serialized.slice(start, end), id, user.id, token));
        start = end;
      }
      const result = await db.batch(queries);
      if (result[0].meta.changes !== 1) {
        const current = await db.prepare('SELECT id FROM boards WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
        if (match) return json({ error: current ? 'This board changed in another tab. Your edits are still here. Save a copy or reload the latest version.' : 'This board no longer exists. Save your edits as a new board.', code: 'SAVE_CONFLICT' }, 409);
        if (current) return json({ error: 'This board was already created. Open it from your workspace.', code: 'ALREADY_CREATED', id }, 409);
        throw new ApiError(409, 'Your workspace has reached its board limit, or this identifier is unavailable.');
      }
      return json({ id, version: match ? input.version! + 1 : 1, updatedAt: now }, match ? 200 : 201);
    }
    if (match && request.method === 'DELETE') {
      const version = Number(request.headers.get('if-match'));
      if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, 'A current board version is required before deletion.');
      const result = await db.prepare('DELETE FROM boards WHERE id = ? AND owner_id = ? AND version = ?').bind(match[1], user.id, version).run();
      if (result.meta.changes !== 1) return json({ error: 'The board changed or could not be found. Refresh before deleting it.' }, 409);
      return json({ deleted: true });
    }
    return json({ error: 'That workspace action is not available.' }, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof DomainError || error instanceof SyntaxError) return json({ error: error.message }, 400);
    // Never send database SQL, user content, or private runtime details to clients/logs.
    return json({ error: 'Your research could not be saved or loaded just now. Please retry. Nothing in this tab has been discarded.' }, 503);
  }
}
