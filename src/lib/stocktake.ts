import type { PoolClient } from "pg";
import { recordActivity } from "./activity";
import { runInTenant, withTenant } from "./db";
import { listCategories, type CategoryOption } from "./products";
import type { StocktakeStatus } from "./stocktake-input";

/**
 * Stocktake data access.
 *
 * The ledger stays the only stock figure: a sheet snapshots what on-hand was when
 * it opened (`expectedQuantity`), and completing it posts the difference between
 * the count and the *live* sum. The snapshot is for the audit trail, not for the
 * delta — a movement recorded while counting is real stock.
 *
 * The tables are read-only for the application role. All three writes go through
 * functions that check membership and owner/staff themselves.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StocktakeScope = {
  categoryId: string | null;
  search: string | null;
};

export type StocktakeSummary = {
  id: string;
  reference: string;
  status: StocktakeStatus;
  scope: StocktakeScope;
  lineCount: number;
  countedLines: number;
  /** Lines whose count differed from the live ledger at finalise. */
  adjustedLines: number;
  /** Sum of the adjustments posted, as numeric text. */
  netDelta: string;
  startedAt: string;
  completedAt: string | null;
};

export type StocktakeLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  /** On hand when the sheet opened. */
  expectedQuantity: string;
  countedQuantity: string | null;
  /** The live ledger sum now; equals `onHandBefore` on a completed sheet. */
  onHand: string;
  /** Filled at finalise. */
  onHandBefore: string | null;
  appliedDelta: string | null;
};

export type StocktakeDetail = {
  session: StocktakeSummary;
  lines: StocktakeLine[];
};

export type StartStocktakeResult =
  | { ok: true; sessionId: string; reference: string; lineCount: number }
  | { ok: false; error: string };

export type SaveStocktakeResult =
  | {
      ok: true;
      completed: boolean;
      reference: string;
      countedLines: number;
      adjustedLines: number;
      netDelta: string;
    }
  | { ok: false; error: string };

type SessionRow = {
  id: string;
  reference: string;
  status: StocktakeStatus;
  scope: unknown;
  created_at: Date;
  completed_at: Date | null;
};

function toScope(value: unknown): StocktakeScope {
  const raw =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    categoryId: typeof raw.category_id === "string" ? raw.category_id : null,
    search: typeof raw.search === "string" ? raw.search : null,
  };
}

function toSummary(
  row: SessionRow,
  totals: {
    line_count: number;
    counted_lines: number;
    adjusted_lines: number;
    net_delta: string;
  },
): StocktakeSummary {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    scope: toScope(row.scope),
    lineCount: totals.line_count,
    countedLines: totals.counted_lines,
    adjustedLines: totals.adjusted_lines,
    netDelta: totals.net_delta,
    startedAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}

/** The last 50 sheets, newest first, with their counts. */
export async function listStocktakes(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<StocktakeSummary[]> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<
      SessionRow & {
        line_count: number;
        counted_lines: number;
        adjusted_lines: number;
        net_delta: string;
      }
    >(
      `select s.id, s.reference, s.status, s.scope, s.created_at, s.completed_at,
              count(l.id)::int as line_count,
              count(l.counted_quantity)::int as counted_lines,
              count(*) filter (
                where l.applied_delta is not null and l.applied_delta <> 0
              )::int as adjusted_lines,
              coalesce(sum(l.applied_delta), 0)::text as net_delta
         from stocktake_sessions s
         left join stocktake_lines l
           on l.business_id = s.business_id and l.session_id = s.id
        where s.business_id = $1
        group by s.id
        order by s.created_at desc, s.id desc
        limit 50`,
      [businessId],
    );

    return result.rows.map((row) => toSummary(row, row));
  });
}

/** One sheet and its lines, or null when the id is not this business's. */
export async function getStocktake(
  userId: string,
  businessId: string,
  sessionId: string,
  client?: PoolClient,
): Promise<StocktakeDetail | null> {
  if (!UUID_PATTERN.test(sessionId)) return null;

  return runInTenant(userId, client, async (client) => {
    const sessionResult = await client.query<SessionRow>(
      `select id, reference, status, scope, created_at, completed_at
         from stocktake_sessions
        where business_id = $1 and id = $2`,
      [businessId, sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) return null;

    const lineResult = await client.query<{
      id: string;
      product_id: string;
      product_name: string;
      sku: string;
      unit_of_measure: string;
      expected_quantity: string;
      counted_quantity: string | null;
      on_hand: string;
      on_hand_before: string | null;
      applied_delta: string | null;
    }>(
      `select l.id, l.product_id, p.name as product_name, p.sku,
              p.unit_of_measure, l.expected_quantity::text as expected_quantity,
              l.counted_quantity::text as counted_quantity,
              coalesce(st.on_hand, 0)::text as on_hand,
              l.on_hand_before::text as on_hand_before,
              l.applied_delta::text as applied_delta
         from stocktake_lines l
         join products p
           on p.business_id = l.business_id and p.id = l.product_id
         left join product_stock st
           on st.business_id = l.business_id and st.product_id = l.product_id
        where l.business_id = $1 and l.session_id = $2
        order by lower(p.name) asc, p.sku asc`,
      [businessId, sessionId],
    );

    const lines = lineResult.rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      unitOfMeasure: row.unit_of_measure,
      expectedQuantity: row.expected_quantity,
      countedQuantity: row.counted_quantity,
      onHand: row.on_hand,
      onHandBefore: row.on_hand_before,
      appliedDelta: row.applied_delta,
    }));

    const adjusted = lines.filter(
      (line) => line.appliedDelta !== null && Number(line.appliedDelta) !== 0,
    );
    const netDelta = adjusted.reduce(
      (total, line) => total + Number(line.appliedDelta),
      0,
    );

    return {
      session: toSummary(session, {
        line_count: lines.length,
        counted_lines: lines.filter((line) => line.countedQuantity !== null)
          .length,
        adjusted_lines: adjusted.length,
        net_delta: String(netDelta),
      }),
      lines,
    };
  });
}

/**
 * Everything the screen reads, on one connection: the sheets, the category filter
 * options and — when one is open — its count sheet.
 */
export async function getStocktakePage(
  userId: string,
  businessId: string,
  sessionId: string,
): Promise<{
  sessions: StocktakeSummary[];
  categories: CategoryOption[];
  detail: StocktakeDetail | null;
}> {
  return withTenant(userId, async (client) => {
    const [sessions, categories, detail] = await Promise.all([
      listStocktakes(userId, businessId, client),
      listCategories(userId, businessId, client),
      sessionId ? getStocktake(userId, businessId, sessionId, client) : null,
    ]);
    return { sessions, categories, detail };
  });
}

/** Open a sheet. The function snapshots a line for every active product in scope. */
export async function startStocktake(
  userId: string,
  businessId: string,
  input: { categoryId: string; search: string },
): Promise<StartStocktakeResult> {
  const scope = {
    ...(input.categoryId ? { category_id: input.categoryId } : {}),
    ...(input.search ? { search: input.search } : {}),
  };

  try {
    return await withTenant(userId, async (client) => {
      const result = await client.query<{
        session_id: string;
        reference: string;
        line_count: number;
      }>(
        `select session_id, reference, line_count
           from private.create_stocktake($1, $2::jsonb)`,
        [businessId, JSON.stringify(scope)],
      );
      const row = result.rows[0];
      if (!row) {
        return {
          ok: false as const,
          error: "The stocktake was not started.",
        };
      }
      return {
        ok: true as const,
        sessionId: row.session_id,
        reference: row.reference,
        lineCount: row.line_count,
      };
    });
  } catch (error) {
    return describeStocktakeError(error, "The stocktake was not started.");
  }
}

/**
 * Save every count in one transaction, then optionally finalise it. Finalising in
 * the same transaction as the counts means the sheet that is completed is exactly
 * what the caller saw on screen.
 */
export async function saveStocktake(
  userId: string,
  businessId: string,
  input: {
    sessionId: string;
    counts: { lineId: string; counted: string }[];
    complete: boolean;
  },
): Promise<SaveStocktakeResult> {
  try {
    return await withTenant(userId, async (client) => {
      const sessionResult = await client.query<{
        id: string;
        reference: string;
      }>(
        `select id, reference
           from stocktake_sessions
          where business_id = $1 and id = $2`,
        [businessId, input.sessionId],
      );
      const session = sessionResult.rows[0];
      if (!session) {
        return {
          ok: false as const,
          error: "That stocktake is not in this business.",
        };
      }

      const counts = input.counts.map((line) => ({
        line_id: line.lineId,
        counted: line.counted === "" ? null : line.counted,
      }));

      await client.query(
        `select private.save_stocktake_counts($1, $2::jsonb)`,
        [input.sessionId, JSON.stringify(counts)],
      );

      const counted = await client.query<{ n: number }>(
        `select count(*)::int as n
           from stocktake_lines
          where business_id = $1 and session_id = $2
            and counted_quantity is not null`,
        [businessId, input.sessionId],
      );
      const countedLines = counted.rows[0]?.n ?? 0;

      if (!input.complete) {
        return {
          ok: true as const,
          completed: false,
          reference: session.reference,
          countedLines,
          adjustedLines: 0,
          netDelta: "0",
        };
      }

      const finished = await client.query<{
        counted_lines: number;
        adjusted_lines: number;
        net_delta: string | null;
      }>(
        `select counted_lines, adjusted_lines, net_delta::text
            from private.complete_stocktake($1)`,
        [input.sessionId],
      );
      const row = finished.rows[0];
      if (!row) {
        return {
          ok: false as const,
          error: "The stocktake was not completed.",
        };
      }

      const netDelta = row.net_delta ?? "0";

      // The event records the sheet, not every ledger line: the movements are the
      // ledger's record, and the summary says how many the count touched.
      await recordActivity(client, {
        actorUserId: userId,
        businessId,
        action: "stocktake.completed",
        entityType: "stocktake",
        entityId: input.sessionId,
        summary:
          `Completed ${session.reference} · ${row.counted_lines} counted, ` +
          `${row.adjusted_lines} adjusted`,
        detail: {
          counted_lines: row.counted_lines,
          adjusted_lines: row.adjusted_lines,
          net_delta: netDelta,
        },
      });

      return {
        ok: true as const,
        completed: true,
        reference: session.reference,
        countedLines: row.counted_lines,
        adjustedLines: row.adjusted_lines,
        netDelta,
      };
    });
  } catch (error) {
    return describeStocktakeError(error, "The stocktake was not saved.");
  }
}

/**
 * Only the functions' own raised messages reach the operator. Anything else is a
 * bug and is rethrown rather than disguised as a validation message.
 */
function describeStocktakeError(
  error: unknown,
  fallback: string,
): { ok: false; error: string } {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;

  switch (code) {
    case "22023":
      return { ok: false, error: message ?? fallback };
    case "42501":
      return {
        ok: false,
        error: "You do not have permission to count stock in this business.",
      };
    case "P0002":
      return { ok: false, error: "That stocktake is not in this business." };
    case "23505":
      return {
        ok: false,
        error: "Another stocktake started at the same moment. Try again.",
      };
    default:
      throw error;
  }
}
