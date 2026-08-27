import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { BoardContent } from '../../src/domain/types';
import { createBoardStore } from '../../src/state/boardStore';


const storageKey = 'evidence-board.public-guest.v1';
test('public landing opens a complete editable sample without account requests', async ({ page }) => {
  const errors: string[] = [];
  const accountRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) accountRequests.push(request.url()); });
  await page.goto('/');
  await page.getByRole('link', { name: 'Open editable sample', exact: true }).click();
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const sample = await session(page);
  expect(sample.content.nodes).toHaveLength(23);
  expect(sample.content.sources).toHaveLength(8);
  expect(sample.content.conflicts).toHaveLength(3);
  expect(accountRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('guest details survive reload and cancelling sample replacement keeps edits', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Your workspace, your record.' });
  await settings.getByLabel('Board title', { exact: true }).fill('My measured adoption decision');
  await settings.getByRole('button', { name: 'Save research details', exact: true }).click();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  expect((await session(page)).content.title).toBe('My measured adoption decision');
  const saved = await session(page);
  await page.getByRole('button', { name: 'Sample options', exact: true }).click();
  const options = page.getByRole('dialog', { name: 'Your own copy. Room to explore.' });
  await options.getByRole('button', { name: 'Start a fresh sample', exact: true }).click();
  await options.getByRole('button', { name: 'Keep my edits', exact: true }).click();
  expect((await session(page)).content).toEqual(saved.content);
});

test('corrupt guest data remains available for download and is never silently reset', async ({ page }) => {
  const corrupt = '{"preserve":"my research"';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: corrupt });
  await page.goto('/?guest=1');
  await expect(page.getByRole('heading', { name: 'Your saved copy is still here.' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(corrupt);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download saved data', exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf8')).toBe(corrupt);
});

test('public access does not grant anonymous access to account boards', async ({ request }) => {
  const response = await request.get('/api/workspace');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
});

async function session(page: Page): Promise<{ content: BoardContent; revision: number; changeSets: Array<{ status: string }> }> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
}
async function openSample(page: Page) {
  await page.goto('/?guest=1');
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
}
async function openReview(page: Page) {
  await page.getByRole('button', { name: /^Review changes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Your judgement. A stronger board.' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  return dialog;
}

test('golden journey: inspect, selectively approve, export a cited brief, undo, reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openSample(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI coding');
  const original = await session(page);
  await page.locator('[data-node-id="evidence_trust"]').click();
  await expect(page.getByRole('complementary', { name: 'Evidence inspector' })).toContainText('Developers reported more distrust');
  await expect(page.getByRole('complementary', { name: 'Evidence inspector' })).toContainText('Stack Overflow');
  const review = await openReview(page);
  expect((await session(page)).content).toEqual(original.content);
  await review.getByRole('checkbox').last().uncheck();
  await review.getByRole('button', { name: 'Apply selected (2)', exact: true }).click();
  await expect(review.getByRole('heading', { name: 'Everything is reviewed.' })).toBeVisible();
  await review.getByRole('button', { name: 'Back to the board', exact: true }).click();
  const approved = await session(page);
  expect(approved.revision).toBe(original.revision + 1);
  expect(approved.content.links.some(link => link.evidenceId === 'evidence_trust' && link.claimId === 'claim_review' && link.stance === 'context')).toBe(true);
  expect(approved.content.conflicts).toEqual(original.content.conflicts);
  expect(approved.content.nodes.find(node => node.id === 'claim_agents')?.title).toBe('Current agent workflows need direct, local measurement.');
  expect(approved.content.conclusion).toBe(original.content.conclusion);
  await page.getByRole('button', { name: 'Create brief', exact: true }).click();
  await expect(page.locator('.brief-paper')).toContainText('Sample recommendation');
  await expect(page.locator('.brief-paper')).toContainText('[S1]');
  await expect(page.locator('.brief-paper')).not.toContainText('Sample expansion gate:');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .md', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const markdown = await readFile(path!, 'utf8');
  expect(markdown).toContain(`Accepted board revision: ${original.revision + 1}`);
  expect(markdown).toContain('https://survey.stackoverflow.co/2025/ai');
  expect(markdown).not.toContain('Sample expansion gate:');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await session(page)).content).toEqual(original.content);
  expect((await session(page)).changeSets[0].status).toBe('undone');
  await page.reload();
  expect((await session(page)).content).toEqual(original.content);
  expect(errors).toEqual([]);
});

test('reject all preserves the accepted record', async ({ page }) => {
  await openSample(page);
  const original = await session(page);
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Reject all', exact: true }).click();
  expect((await session(page)).content).toEqual(original.content);
  expect((await session(page)).revision).toBe(original.revision);
  expect((await session(page)).changeSets[0].status).toBe('rejected');
});

test('researcher edits a proposed claim before approving it', async ({ page }) => {
  await openSample(page);
  const review = await openReview(page);
  const question = review.locator('.change-card').filter({ hasText: 'Make the missing local evidence more specific' });
  await question.getByRole('button', { name: 'Edit wording' }).click();
  await question.getByLabel('Your wording').fill('Measure current agent workflows on our own tasks.');
  await question.getByRole('button', { name: 'Save wording' }).click();
  await review.getByRole('button', { name: 'Apply selected (3)' }).click();
  const approved = await session(page);
  expect(approved.content.nodes.find(node => node.id === 'claim_agents')?.title).toBe('Measure current agent workflows on our own tasks.');
});

test('manual conflict flags and relationship removal use the same reversible record', async ({ page }) => {
  await openSample(page);
  const original = await session(page);
  await page.locator('[data-node-id="claim_context"]').click();
  const inspector = page.getByRole('complementary', { name: 'Claim inspector' });
  await inspector.getByRole('button', { name: 'Flag a contradiction', exact: true }).click();
  const conflict = page.getByRole('dialog', { name: 'Flag a conflict', exact: true });
  await conflict.getByLabel('Conflict title').fill('Stated preference needs an observed-use check');
  await conflict.getByLabel('Description', { exact: true }).fill('The survey expresses interest but does not establish full-night demand. Compare its denominator with entry counts.');
  await conflict.getByRole('checkbox', { name: 'Include: Developers reported more distrust than trust.', exact: true }).check();
  await conflict.getByRole('button', { name: 'Add conflict', exact: true }).click();
  await expect(conflict).not.toBeVisible();
  expect((await session(page)).content.conflicts).toHaveLength(original.content.conflicts.length + 1);
  await inspector.getByRole('button', { name: /Remove relationship to/ }).first().click();
  expect((await session(page)).content.links).toHaveLength(original.content.links.length - 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await session(page)).content).toEqual(original.content);
});

test('manual source-backed evidence is created, linked, edited, searched and undone', async ({ page }) => {
  await openSample(page);
  const original = await session(page);
  await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add to the evidence board' });
  await editor.getByLabel('Title', { exact: true }).fill('Interview participants prefer a targeted pilot');
  await editor.getByLabel('Your interpretation or observation').fill('Participants asked for a measured extension with clear safety arrangements.');
  await editor.getByLabel('Source title', { exact: true }).fill('Researcher interview notes');
  await editor.getByLabel('Publisher or author').fill('Campus research group');
  await editor.getByLabel('Source URL').fill('https://example.org/interviews');
  await editor.getByLabel('Original excerpt or field notes', { exact: true }).fill('A clearly labelled test-fixture interview observation.');
  await editor.getByLabel('Connect to a claim').selectOption('claim_pilot');
  await editor.getByLabel('Why does this evidence have that relationship?', { exact: true }).fill('The interview preference supports evaluating a limited pilot, but does not establish its actual outcome.');
  await editor.getByRole('button', { name: 'Add to board', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const updated = await session(page);
  expect(updated.content.nodes).toHaveLength(original.content.nodes.length + 1);
  expect(updated.content.sources).toHaveLength(original.content.sources.length + 1);
  expect(updated.content.links).toHaveLength(original.content.links.length + 1);
  const node = updated.content.nodes.find(item => item.title === 'Interview participants prefer a targeted pilot')!;
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search board' }).fill('Interview participants');
  await page.locator('.eb-list').getByRole('button', { name: /Interview participants/ }).first().click();
  await page.getByRole('complementary', { name: 'Evidence inspector' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit evidence', exact: true });
  await edit.getByLabel('Title', { exact: true }).fill('Interview participants favour a limited pilot');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect((await session(page)).content.nodes.find(item => item.id === node.id)?.title).toBe('Interview participants favour a limited pilot');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await session(page)).content).toEqual(original.content);
});

test('accepted edits explicitly invalidate proposals based on an older revision', async ({ page }) => {
  await openSample(page);
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const before = await session(page);
  await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add to the evidence board' });
  await editor.getByRole('radio', { name: 'Claim', exact: true }).check();
  await editor.getByLabel('Title', { exact: true }).fill('A new claim changes the research context');
  await editor.getByLabel('Context and notes').fill('The proposal must be reconsidered against this new accepted state.');
  await editor.getByRole('button', { name: 'Add to board', exact: true }).click();
  expect((await session(page)).changeSets[0].status).toBe('rejected');
  expect((await session(page)).revision).toBe(before.revision + 1);
  await expect(page.locator('.toast')).toContainText(/proposal|Revision/i);
});

test('a large Unicode saved session reloads and exports through the UI without losing data', async ({ page }) => {
  await openSample(page);
  const content = structuredClone((await session(page)).content);
  content.nodes = [content.nodes[0]];
  content.links = [];
  content.conflicts = [];
  content.sources = Array.from({ length: 150 }, (_, index) => ({
    ...content.sources[0], id: `source_unicode_${index}`, excerpt: '文'.repeat(6_000),
  }));
  // Arrange a validated large saved session in this isolated browser profile.
  // Importing into an account is a separate server/UI path, not a guest control.
  const fixture = createBoardStore({ content, storage: null }).exportSession();
  expect(Buffer.byteLength(fixture, 'utf8')).toBeGreaterThan(2_000_000);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: fixture });
  await page.reload();
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  expect((await session(page)).content).toEqual(content);
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Your workspace, your record.' });
  const downloadPromise = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Export accepted board', exact: true }).click();
  const download = await downloadPromise;
  expect(JSON.parse(await readFile((await download.path())!, 'utf8')).content).toEqual(content);
  await page.reload();
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  expect((await session(page)).content).toEqual(content);
});

test('a saved source with ID new can be reused without creating or changing a source', async ({ page }) => {
  await openSample(page);
  const content = structuredClone((await session(page)).content);
  const previousSourceId = content.sources[0].id;
  content.sources[0].id = 'new';
  content.nodes = content.nodes.map(node => node.sourceId === previousSourceId ? { ...node, sourceId: 'new' } : node);
  const fixture = createBoardStore({ content, storage: null }).exportSession();
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: fixture });
  await page.reload();
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add to the evidence board' });
  await editor.getByLabel('Title', { exact: true }).fill('A second observation from the imported survey');
  await editor.getByLabel('Your interpretation or observation').fill('This evidence reuses the original source and keeps its recorded provenance.');
  await editor.getByRole('combobox', { name: 'Source', exact: true }).selectOption('new');
  await expect(editor.getByLabel('Source title', { exact: true })).not.toBeVisible();
  await editor.getByRole('button', { name: 'Add to board', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const accepted = await session(page);
  expect(accepted.content.sources).toEqual(content.sources);
  expect(accepted.content.nodes.find(node => node.title === 'A second observation from the imported survey')).toMatchObject({ sourceId: 'new', createdBy: 'human' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.reload();
  expect((await session(page)).content).toEqual(content);
});

test('keyboard command palette, modal focus, map controls and empty-state recovery', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Find something. Move the work forward.' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox', { name: 'Search evidence and commands' }).fill('distrust');
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await page.getByRole('button', { name: 'Fit all visible cards', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search board' }).fill('zzzz-no-matching-item');
  await expect(page.getByRole('heading', { name: /No.*match|No.*evidence|Nothing.*match/i })).toBeVisible();
  await page.getByRole('button', { name: /Clear.*filter|Clear.*search/i }).last().click();
  await expect(page.locator('[data-node-id="claim_pilot"]')).toBeVisible();
});

test('browser without native WebMCP gets honest setup while manual UI remains usable', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Agent setup' }).click();
  const dialog = page.getByRole('dialog', { name: 'A shared workspace. A real connection.' });
  await expect(dialog).toContainText('Agent tools need WebMCP');
  await expect(dialog).toContainText('There is no built-in model');
  await expect(dialog).not.toContainText('native tools registered');
  await dialog.getByRole('button', { name: 'Continue to the board' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.eb-list')).toBeVisible();
});

test('desktop board, review, source library and brief have no automated AA violations', async ({ page }) => {
  await openSample(page);
  const audit = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  };
  await audit();
  const review = await openReview(page);
  await audit();
  await review.getByRole('button', { name: 'Reject all' }).click();
  await review.getByRole('button', { name: 'Back to the board', exact: true }).click();
  await page.getByRole('button', { name: 'Source library', exact: true }).click();
  await audit();
  await page.getByRole('button', { name: 'Decision brief', exact: true }).click();
  await audit();
});

test('mobile starts in a complete list, has no page overflow and completes review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSample(page);
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.eb-list')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  const review = await openReview(page);
  await review.getByRole('checkbox').last().uncheck();
  await review.getByRole('button', { name: 'Apply selected (2)' }).click();
  await review.getByRole('button', { name: 'Back to the board', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Decision brief', exact: true }).click();
  await expect(page.locator('.brief-paper')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
