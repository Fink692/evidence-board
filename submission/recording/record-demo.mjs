/** Capture real application interactions. Run with a fresh built preview on port 4174.
 * node submission/recording/record-demo.mjs [--dry-run] [--url=http://127.0.0.1:4174]
 * Dry run validates the sequence without recording or waiting for narration.
 * The recording uses native WebMCP availability; it never simulates a connected model.
 */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const baseURL = process.argv.find(arg => arg.startsWith('--url='))?.slice(6) ?? 'http://127.0.0.1:4174';
const output = path.resolve('.local/video');
const screenshots = path.resolve('submission/screenshots');
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-blink-features=WebMCP,WebMCPTesting'] });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1,
  locale: 'en-CA', timezoneId: 'America/Winnipeg', reducedMotion: 'reduce',
  ...(dryRun ? {} : { recordVideo: { dir: output, size: { width: 1600, height: 1000 } } }),
});
const page = await context.newPage();
const errors = [];
const observations = [];
page.on('pageerror', error => errors.push(error.message));
const recordingStarted = Date.now();
let start = 0;
async function at(second, action) {
  if (!dryRun) {
    const remaining = start + second * 1000 - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
  const actual = start ? (Date.now() - start) / 1000 : 0;
  observations.push({ plannedSecond: second, actualSecond: actual });
  console.log(`SCENE ${second}s (${actual.toFixed(2)}s actual)`);
  if (!dryRun && actual > second + 2) throw new Error(`Scene ${second} is late; do not claim a synchronized final video.`);
  await action();
}
async function capture(name) {
  await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
}
async function stored() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('evidence-board.workspace.v1')));
}
const nav = name => page.getByRole('button', { name, exact: true });
const inspector = () => page.getByRole('complementary', { name: 'Evidence inspector' });

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.eb-map')).toHaveAttribute('data-map-ready', 'true');
  await expect(page.locator('.agent-status')).toContainText('10 agent tools ready');
  const original = await stored();
  const native = await page.evaluate(async () => ({
    registeredNames: (await document.modelContext.getTools()).map(tool => tool.name).sort(),
    nativeRegister: Function.prototype.toString.call(document.modelContext.registerTool).includes('[native code]'),
  }));
  expect(native.registeredNames).toHaveLength(10);
  expect(native.nativeRegister).toBe(true);
  start = Date.now();
  const leadInSeconds = (start - recordingStarted) / 1000;

  await at(0, () => capture('01-workspace'));
  await at(8, async () => {
    await page.locator('[data-node-id="claim_demand"]').click();
    await expect(page.getByRole('complementary', { name: 'Claim inspector' })).toContainText('Demand justifies overnight opening');
  });

  await at(16, async () => {
    await page.locator('[data-node-id="evidence_survey"]').click();
    await inspector().locator('.source-reference').click();
    await expect(page.getByRole('dialog', { name: 'Spring student study-space survey', exact: true })).toBeVisible();
    await capture('02-source-provenance');
  });
  await at(26, async () => {
    await nav('Back to research').click();
    await page.locator('[data-node-id="evidence_turnstile"]').click();
    await expect(inspector()).toContainText('do not measure time spent studying');
    await capture('03-evidence-inspector');
  });
  await at(30, async () => {
    await inspector().locator('.source-reference').click();
    await expect(page.getByRole('dialog')).toContainText('not occupied seats');
  });

  await at(36, async () => {
    await nav('Back to research').click();
    await page.locator('.agent-status').click();
    await expect(page.getByRole('dialog', { name: 'A shared workspace. A real connection.' })).toContainText('10 native tools registered');
    await capture('04-native-webmcp');
  });
  await at(45, async () => {
    await nav('Continue to the board').click();
    await nav('Activity & tools').click();
    await page.getByRole('button', { name: /Tool catalogue/ }).click();
    await expect(page.locator('.tool-definition')).toHaveCount(10);
    await capture('05-tool-catalogue');
    await page.locator('.tool-definition summary').filter({ hasText: 'get_board_summary' }).click();
  });
  await at(50, async () => {
    await page.locator('.tool-definition summary').filter({ hasText: 'get_board_summary' }).click();
    await page.locator('.tool-definition summary').filter({ hasText: 'propose_change_set' }).click();
  });

  let review;
  await at(55, async () => {
    await nav('Evidence board').click();
    await nav('Run demo rehearsal').click();
    review = page.getByRole('dialog', { name: 'Your judgement. A stronger board.' });
    await expect(review).toBeVisible();
    expect((await stored()).content).toEqual(original.content);
    await expect(review.getByRole('checkbox')).toHaveCount(3);
    await capture('06-proposed-review');
  });
  await at(66, async () => {
    await review.locator('.change-card').nth(1).scrollIntoViewIfNeeded();
  });

  await at(73, async () => {
    const first = review.locator('.change-card').first();
    await first.getByRole('button', { name: 'Edit wording' }).click();
    await first.getByLabel('Your wording').fill('Entry counts question the overnight assumption, but do not measure occupied seats or unmet need.');
  });
  await at(82, async () => {
    await review.getByRole('button', { name: 'Save wording' }).click();
    await review.getByRole('checkbox', { name: 'Accept: Separate exam weeks from the baseline' }).uncheck();
    await expect(review.getByRole('button', { name: 'Apply selected (2)' })).toBeEnabled();
  });
  await at(90, async () => {
    await review.locator('.modal-content').evaluate(element => element.scrollTo({ top: 0 }));
    await capture('07-selective-approval');
  });

  await at(98, async () => {
    await review.getByRole('button', { name: 'Apply selected (2)', exact: true }).click();
    await expect(review.getByRole('heading', { name: 'Everything is reviewed.' })).toBeVisible();
  });
  await at(102, async () => {
    await review.getByRole('button', { name: 'Back to the board', exact: true }).click();
    const accepted = await stored();
    expect(accepted.content.links.find(link => link.id === 'link_demo_usage_challenge')?.reason).toBe('Entry counts question the overnight assumption, but do not measure occupied seats or unmet need.');
    expect(accepted.content.conflicts.some(conflict => conflict.id === 'conflict_demo_survey_usage')).toBe(true);
    expect(accepted.content.nodes.some(node => node.id === 'question_exam_baseline')).toBe(false);
    await nav('List').click();
    await page.locator('.eb-list-claim[data-node-id="claim_demand"]').click();
    await capture('08-accepted-record');
  });

  await at(115, async () => {
    await nav('Create brief').click();
    await expect(page.locator('.brief-paper')).toContainText('Stated interest versus observed overnight use');
    await expect(page.locator('.brief-paper')).not.toContainText('Does overnight demand persist outside exam weeks?');
    await capture('09a-brief-overview');
  });
  await at(120, async () => {
    await page.locator('.brief-paper').getByRole('heading', { name: 'Claims and evidence', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await capture('09-cited-brief');
  });
  await at(125, async () => {
    const downloadPromise = page.waitForEvent('download');
    await nav('Export .md').click();
    const download = await downloadPromise;
    await download.saveAs(path.join(output, 'walkthrough-decision-brief.md'));
    await page.locator('.brief-paper').getByRole('heading', { name: 'Conflicts', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  });

  await at(135, async () => {
    await nav('Activity & tools').click();
    const entry = page.locator('.activity-entry').filter({ has: page.locator('.actor-badge.demo') }).first();
    await entry.locator('summary').click();
    await capture('10-observable-activity');
  });
  await at(144, async () => {
    await nav('Evidence board').click();
    await nav('Undo').click();
    expect((await stored()).content).toEqual(original.content);
    await nav('List').click();
    const close = nav('Close inspector');
    if (await close.count()) await close.click();
    await capture('11-accessible-list');
  });

  await at(151, async () => {
    await nav('Map').click();
    await expect(page.locator('.eb-map')).toHaveAttribute('data-map-ready', 'true');
    await page.mouse.move(1550, 970);
  });
  await at(160, async () => {});
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(output, 'walkthrough-raw.webm'));
  await writeFile(path.join(output, dryRun ? 'dry-run.json' : 'capture-metadata.json'), JSON.stringify({
    dryRun, baseURL, browser: browser.version(), recordedAt: new Date().toISOString(),
    viewport: { width: 1600, height: 1000 }, leadInSeconds, durationSeconds: 160,
    native, externalModel: false, scriptedRehearsal: true, errors, observations,
  }, null, 2));
  console.log(dryRun ? 'Walkthrough dry run passed.' : 'Real browser capture completed. Align audio using leadInSeconds; review playback before release.');
} finally {
  await browser.close();
}
