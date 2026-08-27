import assert from 'node:assert/strict';

const origin = process.argv[2] || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('This check is only for the local Sites sign-in simulator.');
const anonymous = await fetch(`${origin}/api/workspace`);
assert.equal(anonymous.status, 401, 'Anonymous research access must be rejected');
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert(cookie, 'Local Sites sign-in should provide its development session');
const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Evidence-Board': '1', Origin: origin };
const workspace = await fetch(`${origin}/api/workspace`, { headers });
assert.equal(workspace.status, 200);
const profile = await workspace.json();
assert.equal(profile.user.email, 'seedy@sites.test');
const id = `verification_${crypto.randomUUID()}`;
const session = {
  format: 'evidence-board-session', version: 1, revision: 1, changeSets: [], activity: [], history: [],
  content: { id, title: 'Temporary HTTP verification', question: 'Does the complete account-backed research flow work?', description: '', conclusion: '', nodes: [], links: [], sources: [], conflicts: [] },
};
let version = 1;
try {
  const created = await fetch(`${origin}/api/boards`, { method: 'POST', headers, body: JSON.stringify({ id, session }) });
  assert.equal(created.status, 201, await created.text());
  const reopened = await (await fetch(`${origin}/api/boards/${id}`, { headers })).json();
  assert.deepEqual(reopened.session, session);
  session.content.conclusion = 'The saved record can be reopened and changed.';
  session.revision = 2;
  const update = await fetch(`${origin}/api/boards/${id}`, { method: 'PUT', headers, body: JSON.stringify({ version, session }) });
  assert.equal(update.status, 200); version = (await update.json()).version;
  const durable = await (await fetch(`${origin}/api/boards/${id}`, { headers })).json();
  assert.equal(durable.session.content.conclusion, session.content.conclusion);
  const stale = await fetch(`${origin}/api/boards/${id}`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, session }) });
  assert.equal(stale.status, 409);
  const spoof = await fetch(`${origin}/api/workspace`, { headers: { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'forged@example.test' } });
  assert.equal(spoof.status, 401, 'Local sign-in must strip forged identity headers');
  console.log('PASS: HTTP sign-in, private workspace, create, save, reopen, stale-write protection, and forged-header rejection.');
} finally {
  const cleanup = await fetch(`${origin}/api/boards/${id}`, { method: 'DELETE', headers: { ...headers, 'If-Match': String(version) } });
  assert.equal(cleanup.status, 200, 'Temporary verification record must be cleaned up');
}
