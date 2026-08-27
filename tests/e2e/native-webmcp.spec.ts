import { expect, test, type Page } from '@playwright/test';
import type { BoardState } from '../../src/domain/types';
import type { ToolResult } from '../../src/webmcp';

test.use({ launchOptions: { args: ['--enable-blink-features=WebMCP,WebMCPTesting'] } });

interface NativeToolRef { name: string; window: Window; origin: string }
interface NativeApi {
  getTools: () => Promise<NativeToolRef[]>;
  executeTool: (tool: NativeToolRef, input: unknown, options?: { signal: AbortSignal }) => Promise<string | null>;
  registerTool: (tool: {
    name: string; description: string; inputSchema: Record<string, unknown>;
    execute: (input: unknown, options?: { signal: AbortSignal }) => Promise<unknown>;
    annotations?: { readOnlyHint: boolean; untrustedContentHint: boolean };
  }, options: { signal: AbortSignal }) => Promise<void>;
}
type NativeDocument = Document & { modelContext?: NativeApi };
type InputFormat = 'object' | 'json-string';
type StoredSession = Pick<BoardState, 'revision' | 'content' | 'changeSets' | 'activity'>;

const toolNames = [
  'get_board_summary', 'get_evidence', 'find_nodes', 'create_claim', 'add_evidence',
  'link_evidence', 'flag_conflict', 'propose_change_set', 'focus_view', 'create_brief',
].sort();

async function requireNative(page: Page) {
  const capability = await page.evaluate(() => {
    const api = (document as NativeDocument).modelContext;
    return {
      present: Boolean(api),
      enumerable: typeof api?.getTools === 'function',
      executable: typeof api?.executeTool === 'function',
      nativeRegister: typeof api?.registerTool === 'function' ? Function.prototype.toString.call(api.registerTool) : '',
      secureContext: isSecureContext,
    };
  });
  test.skip(!capability.present, 'This browser does not expose native document.modelContext with the WebMCP flags. No mock or legacy replacement is installed.');
  test.skip(!capability.enumerable || !capability.executable, 'The native browser lacks getTools/executeTool; native invocation cannot be verified in this build.');
  expect(capability.nativeRegister).toContain('[native code]');
  expect(capability.secureContext).toBe(true);
}

async function registeredNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await (document as NativeDocument).modelContext!.getTools()).map((tool) => tool.name).sort());
}

async function discoverAndReadSummary(page: Page) {
  return page.evaluate(async () => {
    const api = (document as NativeDocument).modelContext!;
    const tool = (await api.getTools()).find((item) => item.name === 'get_board_summary')!;
    let inputFormat: InputFormat = 'object';
    let raw: string | null;
    try {
      raw = await api.executeTool(tool, {});
    } catch (error) {
      // Chromium 151's versioned IDL accepts a JSON DOMString, while the
      // August 26 draft accepts an object. Retry only this read-only discovery.
      if (!(error instanceof Error) || !error.message.includes('Failed to parse input arguments')) throw error;
      inputFormat = 'json-string';
      raw = await api.executeTool(tool, '{}');
    }
    if (raw === null) throw new Error('Native summary unexpectedly navigated away.');
    return { inputFormat, result: JSON.parse(raw) as ToolResult };
  });
}

async function invokeNative(page: Page, name: string, input: unknown, inputFormat: InputFormat): Promise<ToolResult> {
  return page.evaluate(async ({ name, input, inputFormat }) => {
    const api = (document as NativeDocument).modelContext!;
    const tool = (await api.getTools()).find((item) => item.name === name);
    if (!tool) throw new Error(`Native tool ${name} was not registered.`);
    const raw = await api.executeTool(tool, inputFormat === 'json-string' ? JSON.stringify(input) : input);
    if (raw === null) throw new Error('Native tool unexpectedly navigated away.');
    return JSON.parse(raw) as ToolResult;
  }, { name, input, inputFormat });
}

async function session(page: Page): Promise<StoredSession> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('evidence-board.public-guest.v1') ?? 'null') as StoredSession);
}

test.describe('actual native WebMCP, without a model or API mocks', () => {
  test('registers all ten application tools and performs a native read without content changes', async ({ page, browser }) => {
    await page.goto('/?guest=1');
    await requireNative(page);
    await expect.poll(() => registeredNames(page)).toEqual(toolNames);
    const before = await session(page);
    const { inputFormat, result } = await discoverAndReadSummary(page);
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ status: 'ok', revision: before.revision });
    const after = await session(page);
    expect(after.content).toEqual(before.content);
    expect(after.revision).toBe(before.revision);
    expect(after.changeSets).toEqual(before.changeSets);
    expect(after.activity.find((entry) => entry.tool === 'get_board_summary')).toMatchObject({ actor: 'agent', status: 'complete' });
    await test.info().attach('native-read-observation', {
      body: JSON.stringify({ browser: browser.version(), flags: ['WebMCP', 'WebMCPTesting'], inputFormat, registeredTools: toolNames, externalModel: false }, null, 2),
      contentType: 'application/json',
    });
  });

  test('rejects invalid arguments and proposes a native write without accepting it', async ({ page }) => {
    await page.goto('/?guest=1');
    await requireNative(page);
    await expect.poll(() => registeredNames(page)).toEqual(toolNames);
    const { inputFormat } = await discoverAndReadSummary(page);
    const before = await session(page);
    const invalid = await invokeNative(page, 'find_nodes', { limit: 999 }, inputFormat);
    expect(invalid.structuredContent).toMatchObject({ status: 'error', error: { code: 'INVALID_ARGUMENTS' } });
    const proposed = await invokeNative(page, 'link_evidence', {
      baseRevision: before.revision, evidenceId: 'evidence_trust', claimId: 'claim_review', stance: 'context',
      reason: 'Reported distrust provides context for human review; it does not measure factual error rates.', rationale: 'The native tool should leave this link for human review.',
    }, inputFormat);
    expect(proposed.structuredContent).toMatchObject({ status: 'proposal', data: { contentChanged: false, reviewRequired: true } });
    const after = await session(page);
    expect(after.content).toEqual(before.content);
    expect(after.revision).toBe(before.revision);
    expect(after.changeSets.filter((set) => set.status === 'pending')).toHaveLength(before.changeSets.filter((set) => set.status === 'pending').length + 1);
    await expect(page.getByRole('heading', { name: 'Link evidence as context', exact: true })).toBeVisible();

    // This verifies browser cancellation before dispatch. It does not claim
    // callback AbortSignal delivery, which Chromium 151 does not implement.
    const cancelled = await page.evaluate(async ({ inputFormat, revision }) => {
      const api = (document as NativeDocument).modelContext!;
      const tool = (await api.getTools()).find((item) => item.name === 'create_claim')!;
      const controller = new AbortController();
      controller.abort();
      const input = { baseRevision: revision, title: 'Cancelled claim', body: 'This must not be proposed.', rationale: 'Native pre-dispatch cancellation.' };
      try {
        await api.executeTool(tool, inputFormat === 'json-string' ? JSON.stringify(input) : input, { signal: controller.signal });
        return 'unexpected-success';
      } catch (error) { return error instanceof Error ? error.name : 'unknown-error'; }
    }, { inputFormat, revision: before.revision });
    expect(cancelled).toBe('AbortError');
    const afterCancellation = await session(page);
    expect(afterCancellation.content).toEqual(before.content);
    expect(afterCancellation.changeSets).toEqual(after.changeSets);
  });

  test('removes native tools when leaving research and registers again on return', async ({ page, browser }) => {
    await page.goto('/?guest=1');
    await requireNative(page);
    await expect.poll(() => registeredNames(page)).toEqual(toolNames);
    const firstNames = await registeredNames(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Open editable sample', exact: true })).toBeVisible();
    await expect.poll(() => registeredNames(page)).toEqual([]);
    const landingNames = await registeredNames(page);
    await page.getByRole('link', { name: 'Open editable sample', exact: true }).click();
    await expect.poll(() => registeredNames(page)).toEqual(toolNames);
    const returnedNames = await registeredNames(page);
    await test.info().attach('native-lifecycle-observation', {
      body: JSON.stringify({ browser: browser.version(), firstNames, landingNames, returnedNames, externalModel: false, scope: 'Actual app document navigation; no modelContext mock' }, null, 2),
      contentType: 'application/json',
    });
  });
});
