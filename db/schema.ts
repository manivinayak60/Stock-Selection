import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  userId: text('user_id').primaryKey(),
  capital: real('capital').notNull().default(50000),
  normalRisk: real('normal_risk').notNull().default(5000),
  hardRisk: real('hard_risk').notNull().default(8000),
  perStockRisk: real('per_stock_risk').notNull().default(2000),
  maxPositions: integer('max_positions').notNull().default(5),
  maxSectorAllocation: real('max_sector_allocation').notNull().default(35),
  provider: text('provider').notNull().default('FREE_EOD'),
  updatedAt: text('updated_at').notNull(),
});

export const watchlist = sqliteTable(
  'watchlist',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    symbol: text('symbol').notNull(),
    note: text('note').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_watchlist_user_symbol').on(table.userId, table.symbol),
  ],
);

export const paperTrades = sqliteTable(
  'paper_trades',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    symbol: text('symbol').notNull(),
    setup: text('setup').notNull(),
    status: text('status').notNull().default('OPEN'),
    entry: real('entry').notNull(),
    stop: real('stop').notNull(),
    target: real('target').notNull(),
    quantity: integer('quantity').notNull(),
    openedAt: text('opened_at').notNull(),
    closedAt: text('closed_at'),
    exitPrice: real('exit_price'),
    notes: text('notes').notNull().default(''),
  },
  (table) => [
    index('idx_paper_trades_user_status').on(table.userId, table.status),
  ],
);

export const scanRuns = sqliteTable(
  'scan_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    marketDate: text('market_date').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    universeCount: integer('universe_count').notNull(),
    qualifiedCount: integer('qualified_count').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_scan_runs_user_created').on(table.userId, table.createdAt),
  ],
);
