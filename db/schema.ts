import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  question: text('question').notNull(),
  nodeCount: integer('node_count').notNull().default(0),
  sourceCount: integer('source_count').notNull().default(0),
  version: integer('version').notNull().default(1),
  writeToken: text('write_token').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('boards_owner_updated_idx').on(table.ownerId, table.updatedAt)]);

// Chunking keeps complete undo/proposal sessions below D1's per-row limit.
// A board and all its chunks are committed in a single conditional batch.
export const boardChunks = sqliteTable('board_chunks', {
  boardId: text('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  part: integer('part').notNull(),
  payload: text('payload').notNull(),
}, table => [primaryKey({ columns: [table.boardId, table.part] })]);
