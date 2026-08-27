import type { ToolRegistry, WebMCPTool } from './tools';

/** Minimal local types for the current experimental Document API (2026-08-26). */
export interface NativeModelContext {
  registerTool: (tool: WebMCPTool, options: { signal: AbortSignal }) => Promise<void>;
}

export interface WebMCPRegistration {
  /** API presence only: this does not assert that an external agent is connected. */
  supported: boolean;
  api: 'document.modelContext' | null;
  /** Number of completed registrations, zero after a failure or disposal. */
  readonly registered: number;
  readonly error?: string;
  /** Resolves after registration settles. Read registered/error after awaiting. */
  ready: Promise<void>;
  dispose: () => void;
}

function registrationMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const instruction = name === 'NotAllowedError'
    ? 'Allow the tools Permissions Policy for this origin.'
    : name === 'SecurityError'
      ? 'Use HTTPS or localhost and an origin-isolated document (Origin-Agent-Cluster: ?1).'
      : name === 'InvalidStateError'
        ? 'Keep this document active, then reload the page.'
        : 'Reload the page and check Chrome’s WebMCP flag, tool names, and input schemas.';
  return `WebMCP registration failed (${name}). ${instruction} No tools from this registration remain registered.`;
}

/**
 * Progressive enhancement only. Never installs a shim or changes permissions.
 * registerTool is asynchronous in the current API. Its registration signal owns
 * cleanup; execution receives a separate signal through each tool's callback.
 */
export function registerWebMCP(
  registry: ToolRegistry,
  doc: unknown = typeof document === 'undefined' ? undefined : document,
): WebMCPRegistration {
  let context: NativeModelContext | undefined;
  let error: string | undefined;
  try {
    if (doc !== null && typeof doc === 'object') {
      const candidate = (doc as { modelContext?: NativeModelContext }).modelContext;
      if (candidate && typeof candidate.registerTool === 'function') context = candidate;
    }
  } catch (cause) {
    error = registrationMessage(cause);
  }

  let count = 0;
  let disposed = false;
  const controller = new AbortController();
  const handle: WebMCPRegistration = {
    supported: Boolean(context),
    api: context ? 'document.modelContext' : null,
    get registered() { return count; },
    get error() { return error; },
    ready: Promise.resolve(),
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      count = 0;
    },
  };

  if (!context) return handle;
  const nativeContext = context;
  handle.ready = (async () => {
    try {
      for (const tool of registry.tools) {
        if (disposed) return;
        // No exposedTo option: preserve the browser's default origin boundary.
        await nativeContext.registerTool(tool, { signal: controller.signal });
        if (disposed) return;
        count += 1;
      }
    } catch (cause) {
      if (!disposed) {
        error = registrationMessage(cause);
        controller.abort();
        count = 0;
      }
    }
  })();
  return handle;
}
