import { describe, expect, it, vi } from 'vitest';
import { registerWebMCP, type NativeModelContext } from './adapter';
import { toolSchemas, type ToolName } from './schemas';
import type { ToolRegistry, ToolResult, WebMCPTool } from './tools';

const response: ToolResult = {
  isError: false,
  content: [{ type: 'text', text: 'A test result.' }],
  structuredContent: { status: 'ok', revision: 1, data: {}, dataTrust: 'untrusted_board_content' },
};

function registry(): ToolRegistry {
  return {
    invoke: vi.fn(async () => response),
    tools: (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
      name, title: name, description: `Test ${name}`, inputSchema: { type: 'object', additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: vi.fn(async () => response),
    })),
  };
}

function nativeContext(failAt?: number) {
  const registered = new Map<string, WebMCPTool>();
  let count = 0;
  const registerTool = vi.fn<NativeModelContext['registerTool']>(async (tool, options) => {
    count += 1;
    if (count === failAt) throw new DOMException('Denied by policy', 'NotAllowedError');
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (registered.has(tool.name)) throw new DOMException('Duplicate tool', 'NotSupportedError');
    registered.set(tool.name, tool);
    options.signal.addEventListener('abort', () => registered.delete(tool.name), { once: true });
  });
  return { registered, registerTool };
}

describe('native document.modelContext adapter', () => {
  it('reports unsupported browsers without installing a replacement API', async () => {
    const doc = {};
    const result = registerWebMCP(registry(), doc);
    await result.ready;
    expect(result.supported).toBe(false);
    expect(result.api).toBeNull();
    expect(result.registered).toBe(0);
    expect(doc).toEqual({});
    expect(() => result.dispose()).not.toThrow();
  });

  it('does not mistake legacy navigator.modelContext for current support', async () => {
    const legacy = nativeContext();
    const result = registerWebMCP(registry(), { navigator: { modelContext: legacy } });
    await result.ready;
    expect(result.supported).toBe(false);
    expect(legacy.registerTool).not.toHaveBeenCalled();
  });

  it('awaits all ten registrations, preserves metadata, and forwards execution', async () => {
    const tools = registry();
    const native = nativeContext();
    const result = registerWebMCP(tools, { modelContext: native });
    expect(result.supported).toBe(true);
    expect(result.registered).toBe(0);
    await result.ready;
    expect(result.api).toBe('document.modelContext');
    expect(result.registered).toBe(10);
    expect(result.error).toBeUndefined();
    expect([...native.registered.keys()]).toEqual(tools.tools.map((tool) => tool.name));
    for (const [tool, options] of native.registerTool.mock.calls) {
      expect(tool).toBe(tools.tools.find((item) => item.name === tool.name));
      expect(Object.keys(options)).toEqual(['signal']);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    const signal = new AbortController().signal;
    await native.registered.get('get_board_summary')!.execute({}, { signal });
    expect(tools.tools[0].execute).toHaveBeenCalledWith({}, { signal });
    result.dispose();
    expect(result.registered).toBe(0);
    expect(native.registered.size).toBe(0);
  });

  it('rolls back only its own successful registrations after a partial failure', async () => {
    const native = nativeContext(4);
    native.registered.set('another_application_tool', registry().tools[0]);
    const result = registerWebMCP(registry(), { modelContext: native });
    await result.ready;
    expect(result.supported).toBe(true);
    expect(result.registered).toBe(0);
    expect(result.error).toContain('Permissions Policy');
    expect([...native.registered.keys()]).toEqual(['another_application_tool']);
    expect(native.registerTool).toHaveBeenCalledTimes(4);
  });

  it('handles throwing API getters without crashing the manual app', async () => {
    const doc = { get modelContext(): NativeModelContext { throw new DOMException('Isolation required', 'SecurityError'); } };
    const result = registerWebMCP(registry(), doc);
    await result.ready;
    expect(result.supported).toBe(false);
    expect(result.error).toContain('origin-isolated');
  });

  it('can dispose during registration, then register cleanly on a new mount', async () => {
    const native = nativeContext();
    const first = registerWebMCP(registry(), { modelContext: native });
    first.dispose();
    first.dispose();
    await first.ready;
    expect(first.error).toBeUndefined();
    expect(first.registered).toBe(0);
    expect(native.registered.size).toBe(0);
    const second = registerWebMCP(registry(), { modelContext: native });
    await second.ready;
    expect(second.registered).toBe(10);
    second.dispose();
    expect(native.registered.size).toBe(0);
  });

  it('keeps existing registration ownership when a duplicate mount fails', async () => {
    const native = nativeContext();
    const first = registerWebMCP(registry(), { modelContext: native });
    await first.ready;
    const second = registerWebMCP(registry(), { modelContext: native });
    await second.ready;
    expect(second.error).toContain('NotSupportedError');
    expect(second.registered).toBe(0);
    expect(native.registered.size).toBe(10);
    first.dispose();
    expect(native.registered.size).toBe(0);
  });
});
