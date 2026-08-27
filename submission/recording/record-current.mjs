/** Real current-app walkthrough, in a fresh guest browser profile.
 * node submission/recording/record-current.mjs --url=https://YOUR-SITE [--output=PATH] [--dry-run]
 * Native calls use the actual browser API. No external model, mocked API, account
 * identity, injected product UI, or private browser profile is used.
 */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argument = key => process.argv.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const baseURL = argument('url');
if (!baseURL) throw new Error('Supply the exact public judging URL with --url.');
const dryRun = process.argv.includes('--dry-run');
const output = path.resolve(argument('output') || '.local/current-video');
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-blink-features=WebMCP,WebMCPTesting'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, locale: 'en-CA', timezoneId: 'America/Winnipeg', reducedMotion: 'reduce', ...(dryRun ? {} : { recordVideo: { dir: output, size: { width: 1600, height: 1000 } } }) });
const page = await context.newPage();
const recordingStarted = Date.now();
const errors = []; const requests = []; const observations = []; const nativeCalls = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const click = name => page.getByRole('button', { name, exact: true }).click();
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('evidence-board.public-guest.v1')));
const capture = name => page.screenshot({ path: path.join(output, 'screenshots', `${name}.png`) });
let start = 0; let inputFormat;
async function at(second, action) {
  if (!dryRun) {
    const remaining = start + second * 1000 - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
  const actualSecond = (Date.now() - start) / 1000;
  observations.push({ plannedSecond: second, actualSecond });
  console.log(`SCENE ${second}s (${actualSecond.toFixed(2)}s actual)`);
  if (!dryRun && actualSecond > second + 2) throw new Error(`Scene ${second}s is late; record a synchronized take.`);
  await action();
}
async function nativeReadSummary() {
  const read = await page.evaluate(async () => {
    const api = document.modelContext;
    const tool = (await api.getTools()).find(tool => tool.name === 'get_board_summary');
    let format = 'object'; let raw;
    try { raw = await api.executeTool(tool, {}); }
    catch (error) {
      if (!error.message.includes('Failed to parse input arguments')) throw error;
      format = 'json-string'; raw = await api.executeTool(tool, '{}');
    }
    return { format, result: JSON.parse(raw) };
  });
  inputFormat = read.format;
  assert.equal(read.result.structuredContent.status, 'ok');
  nativeCalls.push({ tool: 'get_board_summary', input: {}, result: read.result });
  return read.result;
}
async function invoke(name, input) {
  if (!inputFormat) throw new Error('Discover the versioned input format with a read first.');
  const result = await page.evaluate(async ({ name, input, inputFormat }) => {
    const api = document.modelContext;
    const tool = (await api.getTools()).find(tool => tool.name === name);
    if (!tool) throw new Error(`Native tool missing: ${name}`);
    const raw = await api.executeTool(tool, inputFormat === 'json-string' ? JSON.stringify(input) : input);
    if (raw === null) throw new Error('Tool navigated unexpectedly.');
    return JSON.parse(raw);
  }, { name, input, inputFormat });
  nativeCalls.push({ tool: name, input, result });
  assert.equal(result.isError, false);
  return result;
}

try {
  await page.goto(`${baseURL}/?guest=1`, { waitUntil: 'networkidle' });
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  await expect(page.locator('.agent-status')).toContainText('10 agent tools ready');
  const native = await page.evaluate(async () => ({ names: (await document.modelContext.getTools()).map(tool => tool.name).sort(), nativeRegister: Function.prototype.toString.call(document.modelContext.registerTool).includes('[native code]'), secure: isSecureContext }));
  assert.equal(native.names.length, 10); assert.equal(native.nativeRegister, true); assert.equal(native.secure, true);
  // Reject the prepared sample suggestions only in this disposable guest copy.
  // The recorded proposal below is then produced by an actual native invocation.
  await page.getByRole('button', { name: /^Review changes/ }).click();
  await click('Reject all'); await click('Back to the board');
  const original = await stored();
  assert.equal(original.content.nodes.length, 23);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  start = Date.now();
  const leadInSeconds = (start - recordingStarted) / 1000;

  await at(0, () => capture('01-landing'));
  await at(16, async () => {
    await page.getByRole('link', { name: 'Open editable sample', exact: true }).click();
    await expect(page.locator('.eb-map')).toHaveAttribute('data-map-ready', 'true');
    await capture('02-research-map');
  });
  await at(28, async () => { await click('List'); await capture('03-structured-research'); });
  await at(34, async () => { await click('Map'); });
  await at(36, async () => {
    await click('Take a closer look');
    await expect(page.getByRole('complementary', { name: 'Evidence inspector' })).toContainText('Developers reported more distrust than trust.');
    await capture('04-evidence-and-source');
  });
  await at(42, async () => {
    await page.getByRole('complementary', { name: 'Evidence inspector' }).locator('.source-reference').click();
    const source = page.getByRole('dialog', { name: 'AI — 2025 Stack Overflow Developer Survey', exact: true });
    await expect(source.getByRole('link', { name: 'Open original source' })).toHaveAttribute('href', 'https://survey.stackoverflow.co/2025/ai');
    await capture('05-source-provenance');
  });
  await at(49, async () => { await click('Back to research'); await click('Check evidence'); await capture('06-structural-check'); });
  await at(54, async () => { await click('Back to research'); });
  await at(55, async () => {
    await click('Activity & tools');
    await page.getByRole('button', { name: /^Tool catalogue/ }).click();
    await expect(page.locator('.tool-definition')).toHaveCount(10);
    await capture('07-ten-tool-contracts');
  });
  await at(61, async () => {
    await page.locator('.activity-tabs button').first().click();
    await nativeReadSummary();
    await invoke('get_evidence', { evidenceId: 'evidence_trust' });
    assert.deepEqual((await stored()).content, original.content);
  });
  await at(65, async () => { await page.locator('.activity-entry summary').first().click(); await capture('08-native-read-result'); });
  await at(70, async () => { await page.locator('.activity-entry summary').first().click(); await click('Evidence board'); });
  await at(73, async () => {
    const result = await invoke('propose_change_set', {
      baseRevision: original.revision,
      title: 'Make the adoption decision easier to audit',
      summary: 'A scripted native-call demonstration, not an external model session. Review these three cautious suggestions before accepting anything.',
      changes: [
        { title: 'Connect reported distrust as context', rationale: 'The survey measures sentiment, not defects. Keep that distinction visible in the connection.', operation: { type: 'link_evidence', evidenceId: 'evidence_trust', claimId: 'claim_review', stance: 'context', reason: 'Reported distrust explains a reason for review; it does not establish actual error rates or prove a safeguard works.' } },
        { title: 'Make the missing local evidence specific', rationale: 'Current agent workflows need observations of the exact tasks, tools, and review process.', operation: { type: 'update_node', nodeId: 'claim_agents', patch: { title: 'Current agent workflows need direct, local measurement.' } } },
        { title: 'Add an expansion question for later', rationale: 'A future protocol could specify a decision threshold; this recording will leave that suggestion unselected.', operation: { type: 'create_question', id: 'question_recording_expansion', title: 'What result would justify expanding the pilot?', body: 'Agree on quality, review-effort, and cost thresholds before measuring local outcomes.', confidence: 'low' } },
      ],
    });
    assert.equal(result.structuredContent.status, 'proposal');
    assert.deepEqual((await stored()).content, original.content);
    assert.equal((await stored()).revision, original.revision);
    const pending = (await stored()).changeSets.find(set => set.title === 'Make the adoption decision easier to audit');
    assert.deepEqual(pending.changes[1].operation.patch, { title: 'Current agent workflows need direct, local measurement.' });
    await expect(page.getByRole('dialog', { name: 'Your judgement. A stronger board.' })).toBeVisible();
    await capture('09-native-pending-proposal');
  });
  await at(81, async () => { await page.locator('.change-operation summary').first().click(); });
  await at(86, async () => { await page.locator('.change-operation summary').first().click(); });
  await at(88, async () => {
    const change = page.locator('.change-card').nth(1);
    await change.getByRole('button', { name: 'Edit wording' }).click();
    await change.getByLabel('Your wording').fill('Measure current agents on our own tasks, including review.');
  });
  await at(92, async () => {
    await click('Save wording');
    await page.getByRole('dialog', { name: 'Your judgement. A stronger board.' }).getByRole('checkbox').last().uncheck();
    await capture('10-selective-human-review');
  });
  await at(98, async () => {
    await click('Apply selected (2)');
    const accepted = await stored();
    assert.equal(accepted.revision, original.revision + 1);
    assert.equal(accepted.content.links.length, original.content.links.length + 1);
    assert(!accepted.content.nodes.some(node => node.id === 'question_recording_expansion'));
  });
  await at(102, async () => { await click('Back to the board'); await click('Activity & tools'); await capture('11-approval-in-activity'); });
  await at(107, async () => { await page.locator('.activity-entry summary').first().click(); });
  await at(115, async () => { await invoke('create_brief', {}); await click('Decision brief'); await expect(page.locator('.brief-paper')).toBeVisible(); await capture('12-cited-decision-brief'); });
  await at(121, async () => {
    const downloading = page.waitForEvent('download'); await click('Export .md');
    const download = await downloading; await download.saveAs(path.join(output, 'accepted-decision-brief.md'));
    const brief = (await stored()).content;
    assert(!brief.nodes.some(node => node.id === 'question_recording_expansion'));
  });
  await at(125, async () => {
    const citation = page.locator('.brief-paper').getByText('[S1]', { exact: false }).first();
    await citation.scrollIntoViewIfNeeded();
    await expect(citation).toBeVisible();
    await capture('12b-citations-in-accepted-brief');
  });
  await at(129, async () => { await click('Undo'); assert.deepEqual((await stored()).content, original.content); await capture('13-undo-restored-record'); });
  await at(135, async () => { await click('Sample options'); await capture('14-device-and-private-storage'); });
  await at(140, async () => {
    const downloading = page.waitForEvent('download'); await click('Export full backup');
    await (await downloading).saveAs(path.join(output, 'full-sample-backup.json'));
  });
  await at(145, async () => {
    await click('Back to the evidence'); await page.reload();
    await expect(page.locator('.save-state')).toContainText('Saved on this device');
    assert.deepEqual((await stored()).content, original.content);
  });
  await at(151, async () => { await click('Sample options'); await page.getByRole('link', { name: /About Evidence Board/ }).click(); await expect(page.getByRole('link', { name: 'Open editable sample', exact: true })).toBeVisible(); });
  await at(160, async () => {});
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter(url => new URL(url).pathname.startsWith('/api/')), []);
  assert.deepEqual(requests.filter(url => new URL(url).origin !== new URL(baseURL).origin), []);
  const report = { generatedAt: new Date().toISOString(), dryRun, baseURL, durationSeconds: 160, leadInSeconds, viewport: { width: 1600, height: 1000 }, browser: browser.version(), native, inputFormat, nativeCalls, observations, errors, accountApiRequests: 0, externalRequests: 0, externalModel: false, caller: 'Playwright invokes native tools; human-control actions are automated for a reproducible demonstration.', selectiveApproval: '2 of 3 operations; third rejected', acceptedUndo: 'exact content restored', reloadPersistence: 'passed', originalSampleProposals: 'Rejected via UI in this disposable browser profile before the recorded sequence.' };
  await writeFile(path.join(output, 'capture-metadata.json'), JSON.stringify(report, null, 2));
  if (!dryRun) { const video = page.video(); await page.close(); await video.saveAs(path.join(output, 'walkthrough-raw.webm')); }
  console.log(dryRun ? 'Current live walkthrough dry run passed.' : 'Actual live browser recording complete.');
} catch (error) {
  if (!page.isClosed()) { await page.screenshot({ path: path.join(output, 'capture-failure.png') }); await writeFile(path.join(output, 'capture-failure.txt'), `${error}\n\n${await page.locator('body').ariaSnapshot()}`); }
  throw error;
} finally { await context.close(); await browser.close(); }
