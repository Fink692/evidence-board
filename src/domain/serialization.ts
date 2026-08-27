import type { BoardContent } from './types';

export const BOARD_SCHEMA_VERSION = 1;
export const BOARD_EXPORT_FORMAT = 'evidence-board';
export const MAX_PORTABLE_EXPORT_CHARACTERS = 5_000_000;

/** Serialize validated accepted content; validation enforces this exact format's size. */
export function serializeBoardExport(
  content: BoardContent,
  revision: number,
  exportedAt = new Date().toISOString(),
): string {
  return `${JSON.stringify({
    format: BOARD_EXPORT_FORMAT,
    version: BOARD_SCHEMA_VERSION,
    exportedAt,
    revision,
    content,
  }, null, 2)}\n`;
}

/** Reserve the longest supported revision so a later revision cannot break portability. */
export function portableExportSize(content: BoardContent): number {
  return serializeBoardExport(content, Number.MAX_SAFE_INTEGER - 1, '9999-12-31T23:59:59.999Z').length;
}
