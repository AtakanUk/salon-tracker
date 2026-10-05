import type { Prisma } from '@prisma/client';

/**
 * A date window for exports. Both ends are optional, so the same type covers
 * "everything", "everything before X" (retention) and "X..Y" (archive).
 * `from` is inclusive, `to` is exclusive - callers pass the start of the day
 * *after* the last day they want.
 */
export interface ExportRange {
  from?: Date;
  to?: Date;
}

/** `where` for Session queries; `{}` means the whole table. */
export function sessionWhere(range: ExportRange = {}): Prisma.SessionWhereInput {
  const startedAt: Prisma.DateTimeFilter = {};
  if (range.from) startedAt.gte = range.from;
  if (range.to) startedAt.lt = range.to;
  return startedAt.gte || startedAt.lt ? { startedAt } : {};
}

/** Same window, expressed for SessionItem (filtered through its session). */
export function itemWhere(range: ExportRange = {}): Prisma.SessionItemWhereInput {
  const where = sessionWhere(range);
  return where.startedAt ? { session: where } : {};
}
