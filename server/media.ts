/** One immutable public recording. This is not a general upload or URL proxy. */
export const WALKTHROUGH = {
  path: '/evidence-board-walkthrough.mp4',
  bytes: 21080314,
  sha256: 'f8f262096d99e914700f5d9f7dcf8a8525032dd23b95fbf477a01450a3a2fed3',
  source: 'https://raw.githubusercontent.com/Fink692/evidence-board/cecbbf97a26cf94a6021c127a8d9ecdd446549d2/public/evidence-board-walkthrough.mp4',
};
const key = `public/walkthrough/${WALKTHROUGH.sha256}.mp4`;
type ByteRange = { offset: number; length: number };
export interface MediaObject {
  size: number;
  httpEtag: string;
  customMetadata?: Record<string, string>;
  body?: ReadableStream<Uint8Array>;
}
export interface MediaBucket {
  head(key: string): Promise<MediaObject | null>;
  get(key: string, options?: { range?: ByteRange }): Promise<MediaObject | null>;
  put(key: string, body: ArrayBuffer, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
}
const fills = new WeakMap<MediaBucket, Promise<void>>();

function rangeFor(value: string | null): ByteRange | null {
  if (!value) return null;
  // Unsupported units and multipart requests fall back to the full resource.
  if (!value.startsWith('bytes=') || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new RangeError();
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) throw new RangeError();
  const offset = first ?? Math.max(0, WALKTHROUGH.bytes - (last ?? 0));
  const end = first === null || last === null ? WALKTHROUGH.bytes - 1 : Math.min(last, WALKTHROUGH.bytes - 1);
  if (offset >= WALKTHROUGH.bytes || end < offset) throw new RangeError();
  return { offset, length: end - offset + 1 };
}

async function fill(bucket: MediaBucket, download: typeof fetch) {
  const response = await download(WALKTHROUGH.source, { redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Pinned recording could not be fetched.'); }
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) !== WALKTHROUGH.bytes) { await response.body.cancel(); throw new Error('Recording size does not match.'); }
  const bytes = new Uint8Array(WALKTHROUGH.bytes);
  const reader = response.body.getReader();
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (length + item.value.byteLength > bytes.byteLength) throw new Error('Recording exceeds its expected size.');
      bytes.set(item.value, length); length += item.value.byteLength;
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (length !== bytes.byteLength) throw new Error('Recording is incomplete.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== WALKTHROUGH.sha256) throw new Error('Recording checksum does not match.');
  await bucket.put(key, bytes.buffer, { httpMetadata: { contentType: 'video/mp4' }, customMetadata: { sha256: hash } });
}

async function ensureMedia(bucket: MediaBucket, download: typeof fetch) {
  let object = await bucket.head(key);
  if (!object) {
    let pending = fills.get(bucket);
    if (!pending) { pending = fill(bucket, download); fills.set(bucket, pending); }
    try { await pending; } finally { if (fills.get(bucket) === pending) fills.delete(bucket); }
    object = await bucket.head(key);
  }
  if (!object || object.size !== WALKTHROUGH.bytes || object.customMetadata?.sha256 !== WALKTHROUGH.sha256) throw new Error('Stored recording metadata does not match.');
  return object;
}

export async function handleWalkthrough(request: Request, bucket?: MediaBucket, download: typeof fetch = fetch): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (!bucket) return new Response('Video storage is temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  try {
    const metadata = await ensureMedia(bucket, download);
    const headers = new Headers({ 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=3600', ETag: metadata.httpEtag, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    const tags = request.headers.get('if-none-match')?.split(',').map(value => value.trim().replace(/^W\//, ''));
    if (tags?.some(tag => tag === '*' || tag === metadata.httpEtag)) return new Response(null, { status: 304, headers });
    // HTTP preconditions precede Range. A stale If-Range requests the full
    // representation even if its old byte range is no longer satisfiable.
    let requested: ByteRange | null = null;
    if (request.method === 'GET' && (!request.headers.has('if-range') || request.headers.get('if-range') === metadata.httpEtag)) {
      try { requested = rangeFor(request.headers.get('range')); }
      catch { headers.set('Content-Range', `bytes */${WALKTHROUGH.bytes}`); return new Response(null, { status: 416, headers }); }
    }
    headers.set('Content-Length', String(requested?.length ?? metadata.size));
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    const object = await bucket.get(key, requested ? { range: requested } : undefined);
    if (!object?.body) throw new Error('Stored recording body is unavailable.');
    if (requested) headers.set('Content-Range', `bytes ${requested.offset}-${requested.offset + requested.length - 1}/${metadata.size}`);
    return new Response(object.body, { status: requested ? 206 : 200, headers });
  } catch {
    return new Response('The video is temporarily unavailable. Please try again shortly.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
}
