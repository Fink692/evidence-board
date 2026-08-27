import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Actual Chromium only: this script never assigns a modelContext object, mocks
// registerTool, or calls a tool's JS callback as a substitute for native execution.
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = process.env.EVIDENCE_BOARD_URL ?? 'http://127.0.0.1:4173';
const executablePaths = process.argv.slice(2).length ? process.argv.slice(2) : [chromium.executablePath()];
const configurations = [
  { name: 'default', args: [] },
  { name: 'explicit-webmcp-testing', args: ['--enable-blink-features=WebMCP,WebMCPTesting'] },
];
const report = {
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  node: process.version,
  origin,
  method: 'Playwright drives real local Chromium in fresh headless contexts. No API replacement, extension, model, or provider credentials.',
  externalAgentRuns: 0,
  runs: [],
};

for (const executablePath of executablePaths) {
  for (const configuration of configurations) {
    const run = { executablePath, configuration: configuration.name, args: configuration.args, headless: true, errors: [] };
    report.runs.push(run);
    let browser;
    try {
      browser = await chromium.launch({ executablePath, headless: true, args: configuration.args, timeout: 15_000 });
      run.browserVersion = browser.version();
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', (error) => run.errors.push(error.message));
      const response = await page.goto(origin, { waitUntil: 'networkidle', timeout: 15_000 });
      run.response = { status: response?.status(), originAgentCluster: response?.headers()['origin-agent-cluster'] ?? null };
      run.capabilities = await page.evaluate(() => {
        const inspect = (value) => value ? {
          present: true,
          tag: Object.prototype.toString.call(value),
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(value)),
          registerFunction: typeof value.registerTool === 'function' ? Function.prototype.toString.call(value.registerTool) : null,
        } : { present: false };
        return {
          secureContext: isSecureContext,
          originAgentCluster: self.originAgentCluster ?? null,
          document: inspect(document.modelContext),
          documentTesting: inspect(document.modelContextTesting),
          navigatorLegacy: inspect(navigator.modelContext),
          navigatorTestingLegacy: inspect(navigator.modelContextTesting),
        };
      });

      if (run.capabilities.document.present) {
        await page.waitForFunction(async () => {
          if (typeof document.modelContext?.getTools !== 'function') return true;
          return (await document.modelContext.getTools()).length >= 10;
        }, undefined, { timeout: 5_000 }).catch((error) => run.errors.push(`App registration wait: ${error.message.slice(0, 300)}`));

        run.application = await page.evaluate(async () => {
          const api = document.modelContext;
          if (typeof api.getTools !== 'function') return { status: 'unsupported-enumeration-api' };
          const tools = await api.getTools();
          const registrations = tools.map(({ name, description, annotations }) => ({ name, description, annotations }));
          const summaryTool = tools.find((tool) => tool.name === 'get_board_summary');
          if (!summaryTool || typeof api.executeTool !== 'function') return { registrations, status: 'no-native-execution-api' };
          let inputFormat = 'object';
          let objectFormatError = null;
          let raw;
          try {
            raw = await api.executeTool(summaryTool, {});
          } catch (error) {
            // Chromium 151's versioned IDL takes DOMString input_arguments.
            // Probe the read-only summary first so a format retry cannot create
            // duplicate mutations. This does not replace or bypass the API.
            objectFormatError = { name: error.name, message: error.message };
            if (!error.message.includes('Failed to parse input arguments')) throw error;
            inputFormat = 'json-string';
            raw = await api.executeTool(summaryTool, JSON.stringify({}));
          }
          const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const session = JSON.parse(localStorage.getItem('evidence-board.workspace.v1') ?? 'null');
          return {
            status: 'actual-native-invocation-completed',
            registrations,
            invocationMethod: 'document.modelContext.executeTool',
            inputFormat,
            objectFormatError,
            summaryResult: result,
            activity: session?.activity?.find((entry) => entry.tool === 'get_board_summary') ?? null,
          };
        });

        // A separate same-origin test document imports the real app modules so
        // registration/disposal can be controlled without touching the React UI.
        const probeContext = await browser.newContext();
        const probe = await probeContext.newPage();
        await probe.route('**/__native_webmcp_probe__', (route) => route.fulfill({
          status: 200, contentType: 'text/html', headers: { 'Origin-Agent-Cluster': '?1' },
          body: '<!doctype html><meta charset="utf-8"><title>Native WebMCP verification</title><p>Isolated browser verification document.</p>',
        }));
        await probe.goto(`${origin}/__native_webmcp_probe__`, { waitUntil: 'domcontentloaded' });
        run.adapterLifecycle = await probe.evaluate(async (inputFormat) => {
          const { createToolRegistry, registerWebMCP } = await import('/src/webmcp/index.ts');
          const { createBoardStore } = await import('/src/state/boardStore.ts');
          const store = createBoardStore({ storage: null });
          const registry = createToolRegistry(store);
          const before = JSON.stringify(store.getState().content);
          const revision = store.getState().revision;
          const handle = registerWebMCP(registry);
          await handle.ready;
          const api = document.modelContext;
          const tools = await api.getTools();
          const invoke = async (name, input, options) => {
            const tool = tools.find((item) => item.name === name);
            const raw = await api.executeTool(tool, inputFormat === 'json-string' ? JSON.stringify(input) : input, options);
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
          };
          const summary = await invoke('get_board_summary', {});
          const invalid = await invoke('find_nodes', { limit: 999 });
          const proposed = await invoke('link_evidence', {
            baseRevision: revision, evidenceId: 'evidence_turnstile', claimId: 'claim_demand', stance: 'challenges',
            reason: 'Only 8% of trial entries occur after midnight.', rationale: 'A real native invocation with a pending human review.',
          });
          const afterProposal = {
            contentUnchanged: JSON.stringify(store.getState().content) === before,
            revisionUnchanged: store.getState().revision === revision,
            pendingProposals: store.getState().changeSets.filter((set) => set.status === 'pending').length,
          };
          const signatureController = new AbortController();
          await api.registerTool({
            name: 'diagnostic_execution_options', description: 'Return only native callback option availability for this isolated test.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            execute: async (_input, options) => ({ optionsPresent: options !== undefined, signalPresent: options?.signal instanceof AbortSignal }),
            annotations: { readOnlyHint: true, untrustedContentHint: false },
          }, { signal: signatureController.signal });
          const signatureTool = (await api.getTools()).find((tool) => tool.name === 'diagnostic_execution_options');
          const signatureRaw = await api.executeTool(signatureTool, inputFormat === 'json-string' ? '{}' : {});
          const executionOptions = typeof signatureRaw === 'string' ? JSON.parse(signatureRaw) : signatureRaw;
          signatureController.abort();
          const cancellation = new AbortController();
          cancellation.abort();
          let abortResult;
          try { await invoke('create_claim', { baseRevision: revision, title: 'Cancelled claim', body: 'Must not be proposed.', rationale: 'Cancellation probe.' }, { signal: cancellation.signal }); abortResult = 'unexpected-success'; }
          catch (error) { abortResult = { name: error.name, message: error.message }; }
          const countBeforeDispose = handle.registered;
          handle.dispose();
          const afterDispose = (await api.getTools()).map((tool) => tool.name);
          const remounted = registerWebMCP(registry);
          await remounted.ready;
          const countAfterRemount = (await api.getTools()).length;
          remounted.dispose();
          return {
            status: 'actual-native-adapter-lifecycle-completed',
            documentType: 'Same-origin test document importing the actual application adapter and store',
            supported: handle.supported,
            registrationError: handle.error ?? null,
            countBeforeDispose,
            summary,
            invalidArguments: invalid,
            proposalResult: proposed,
            afterProposal,
            executionOptions,
            abortResult,
            pendingAfterAbort: store.getState().changeSets.filter((set) => set.status === 'pending').length,
            registeredAfterDispose: afterDispose,
            countAfterRemount,
            registeredAfterFinalDispose: (await api.getTools()).length,
          };
        }, run.application.inputFormat);
        await probeContext.close();
      } else {
        run.application = {
          status: 'current-document-api-unavailable',
          nativeInvocation: 'not-run',
          note: run.capabilities.navigatorLegacy.present
            ? 'This browser exposes a legacy navigator API. The application intentionally does not mislabel it as current document API support.'
            : 'No native ModelContext API was exposed with these flags.',
        };
      }
      await context.close();
    } catch (error) {
      run.errors.push(error.stack ?? String(error));
    } finally {
      await browser?.close();
    }
    if (run.capabilities?.document.present) {
      const lifecycle = run.adapterLifecycle;
      run.checks = {
        tenApplicationRegistrations: run.application?.registrations?.length === 10,
        nativeSummarySucceeded: run.application?.summaryResult?.structuredContent?.status === 'ok',
        actualActivityCompleted: run.application?.activity?.actor === 'agent' && run.application?.activity?.status === 'complete',
        runtimeArgumentsValidated: lifecycle?.invalidArguments?.structuredContent?.error?.code === 'INVALID_ARGUMENTS',
        proposalRemainsPending: lifecycle?.proposalResult?.structuredContent?.status === 'proposal' && lifecycle?.afterProposal?.pendingProposals === 1,
        acceptedContentUnchanged: lifecycle?.afterProposal?.contentUnchanged === true && lifecycle?.afterProposal?.revisionUnchanged === true,
        preDispatchCancellation: lifecycle?.abortResult?.name === 'AbortError' && lifecycle?.pendingAfterAbort === 1,
        cleanupAndRemount: lifecycle?.countBeforeDispose === 10 && lifecycle?.registeredAfterDispose?.length === 0
          && lifecycle?.countAfterRemount === 10 && lifecycle?.registeredAfterFinalDispose === 0,
      };
      run.outcome = run.errors.length === 0 && Object.values(run.checks).every(Boolean) ? 'passed' : 'failed';
    } else run.outcome = run.errors.length ? 'failed' : 'unsupported';
    console.log(JSON.stringify({ browser: run.browserVersion, configuration: run.configuration, documentApi: run.capabilities?.document.present, legacyNavigatorApi: run.capabilities?.navigatorLegacy.present, appStatus: run.application?.status, nativeTools: run.application?.registrations?.length, errors: run.errors }));
  }
}

await mkdir(join(root, '.local'), { recursive: true });
await writeFile(join(root, '.local', 'native-webmcp-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('Saved .local/native-webmcp-check.json');
if (report.runs.some((run) => run.outcome === 'failed')) process.exitCode = 1;
