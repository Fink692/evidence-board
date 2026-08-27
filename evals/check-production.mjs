/** Verify the built app with the same headers as the static-host configuration.
 * Run after pnpm build: node evals/check-production.mjs
 * Starts and stops only its own loopback preview process. No external services.
 */
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const temporary = createServer();
await new Promise(resolve => temporary.listen(0, '127.0.0.1', resolve));
const port = temporary.address().port;
await new Promise(resolve => temporary.close(resolve));
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-6000); });
server.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-6000); });
const reports = [];
await mkdir('.local/production', { recursive: true });
try {
  let available = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(baseURL)).ok) { available = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(`Preview exited early: ${serverOutput}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert(available, `Preview did not start: ${serverOutput}`);

  for (const target of [
    { name: 'chromium-desktop', engine: chromium, viewport: { width: 1440, height: 1000 }, args: ['--enable-blink-features=WebMCP,WebMCPTesting'] },
    { name: 'webkit-mobile', engine: webkit, viewport: { width: 390, height: 844 }, args: [] },
  ]) {
    const browser = await target.engine.launch({ headless: true, args: target.args });
    let page;
    try {
      const context = await browser.newContext({ viewport: target.viewport, locale: 'en-CA', timezoneId: 'America/Winnipeg', reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        window.__policyViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.__policyViolations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI }));
      });
      page = await context.newPage();
      const errors = [];
      const externalRequests = [];
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => {
        requests.push(request.url());
        if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== baseURL) externalRequests.push(request.url());
      });
      const response = await page.goto(`${baseURL}/?guest=1`, { waitUntil: 'networkidle' });
      const headers = response.headers();
      assert.equal(headers['origin-agent-cluster'], '?1');
      assert.equal(headers['x-content-type-options'], 'nosniff');
      assert.equal(headers['referrer-policy'], 'no-referrer');
      assert(headers['content-security-policy'].includes("script-src 'self'"));
      await page.evaluate(() => document.fonts.ready);
      const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('evidence-board.public-guest.v1')));
      await expect(page.locator('.save-state')).toContainText('Saved on this device');
      const original = await session();
      assert.equal(original.content.id, 'research_ai_coding_showcase_v1');
      const native = await page.evaluate(() => Boolean(document.modelContext));
      if (native) {
        await expect.poll(() => page.evaluate(async () => (await document.modelContext.getTools()).length)).toBe(10);
        const result = await page.evaluate(async () => {
          const api = document.modelContext;
          const tool = (await api.getTools()).find(item => item.name === 'get_board_summary');
          let raw;
          try { raw = await api.executeTool(tool, {}); }
          catch (error) {
            if (!error.message.includes('Failed to parse input arguments')) throw error;
            raw = await api.executeTool(tool, '{}');
          }
          return JSON.parse(raw);
        });
        assert.equal(result.structuredContent.status, 'ok');
        assert.deepEqual((await session()).content, original.content);
      }
      const mobile = target.viewport.width < 768;
      if (mobile) {
        await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
        assert(!requests.some(url => /\/assets\/EvidenceMap-.*\.js/.test(url)), 'Mobile list should not download the graph chunk.');
        await page.locator('.eb-list-claim[data-node-id="claim_pilot"]').click();
        await expect(page.locator('dialog.inspector-dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog.inspector-dialog')).not.toBeVisible();
      } else {
        await expect(page.locator('.eb-map')).toHaveAttribute('data-map-ready', 'true');
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must not overflow horizontally.');
      await page.getByRole('button', { name: /^Review changes/ }).click();
      const review = page.getByRole('dialog', { name: 'Your judgement. A stronger board.' });
      await expect(review).toBeVisible();
      assert.deepEqual((await session()).content, original.content);
      await review.getByRole('checkbox', { name: 'Accept: Add an explicit expansion and stop rule' }).uncheck();
      await review.getByRole('button', { name: 'Apply selected (2)' }).click();
      await review.getByRole('button', { name: 'Back to the board', exact: true }).click();
      if (mobile) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Decision brief', exact: true }).click();
      } else await page.getByRole('button', { name: 'Create brief', exact: true }).click();
      await expect(page.locator('.brief-paper')).toContainText('Current agent workflows need direct, local measurement.');
      await expect(page.locator('.brief-paper')).not.toContainText('Sample expansion gate:');
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual((await session()).content, original.content);
      const policyViolations = await page.evaluate(() => window.__policyViolations);
      assert.deepEqual(policyViolations, []);
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(errors, []);
      reports.push({ target: target.name, browserVersion: browser.version(), headers, nativeDocumentApi: native, externalModel: false, selectiveReviewAndUndo: 'passed', externalRequests, policyViolations, errors, mobileGraphChunkDeferred: mobile ? true : null });
      console.log(`${target.name}: built app, headers, review/brief/undo, no CSP errors, no external requests passed${native ? '; native read passed' : '; honest native fallback'}.`);
    } catch (error) {
      if (page) {
        await page.screenshot({ path: `.local/production/${target.name}-failure.png` });
        await writeFile(`.local/production/${target.name}-failure.txt`, `${error}\n\n${await page.locator('body').ariaSnapshot()}`);
      }
      throw error;
    } finally { await browser.close(); }
  }
  await writeFile('.local/production/results.json', JSON.stringify({ checkedAt: new Date().toISOString(), reports }, null, 2));
} finally { server.kill(); }
