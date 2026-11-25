import type { PoolClient } from "pg";
import { withTenant } from "./db";

/**
 * Activity log: the record of who changed what outside the stock ledger.
 *
 * Two rules shape this module:
 *
 * - events are written inside the transaction that makes the change, so an event
 *   and its change roll back together (see `recordActivity`'s `client` argument);
 * - `detail` holds ids and field names, never copies of names, so a rename does not
 *   rewrite history. The `summary` is the sentence a person reads later, and it is
 *   written in the past tense about the thing as it was called then.
 */

export const ACTIVITY_ACTIONS = [
  "product.created",
  "product.updated",
  "product.archived",
  "product.restored",
  "supplier.created",
  "supplier.updated",
  "supplier.archived",
  "supplier.restored",
  "purchase_order.created",
  "purchase_order.ordered",
  "purchase_order.cancelled",
  "purchase_order.closed_short",
  "receipt.recorded",
  "stocktake.completed",
  "import.completed",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityEntityType =
  | "product"
  | "supplier"
  | "purchase_order"
  | "receipt"
  | "stocktake"
  | "import";

export const ACTIVITY_FILTERS = [
  { value: "all", label: "Everything" },
  { value: "products", label: "Products" },
  { value: "suppliers", label: "Suppliers" },
  { value: "orders", label: "Orders" },
  { value: "stock", label: "Stock" },
] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]["value"];

export function parseActivityFilter(
  value: string | undefined | null,
): ActivityFilter {
  return (
    ACTIVITY_FILTERS.find((filter) => filter.value === value)?.value ?? "all"
  );
}

export type ActivityEntry = {
  id: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string | null;
  summary: string;
  /** The actor's email's local part, or a neutral label when it cannot be read. */
  actorName: string;
  createdAt: string;
  /** The order a receipt belongs to, when the event names one. */
  orderId: string | null;
};

export type ActivityCursor = { before: string; beforeId: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The database caps a summary at 300; trim first so a long name cannot fail a write. */
const SUMMARY_LIMIT = 300;

/** One page of the feed. Larger than a phone screen, smaller than a mail archive. */
const PAGE_SIZE = 50;

/**
 * Write one event. Call this with the same client as the change it describes —
 * `withTenant` hands one to every write path — so an event cannot commit without
 * its change, or the reverse.
 */
export async function recordActivity(
  client: PoolClient,
  input: {
    actorUserId: string;
    businessId: string;
    action: ActivityAction;
    entityType: ActivityEntityType;
    entityId?: string | null;
    summary: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `insert into activity_log
       (business_id, actor_user_id, action, entity_type, entity_id, summary, detail)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.businessId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.summary.trim().slice(0, SUMMARY_LIMIT),
      JSON.stringify(input.detail ?? {}),
    ],
  );
}

type FeedRow = {
  id: string;
  action: ActivityAction;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  summary: string;
  detail: Record<string, unknown>;
  created_at: Date;
  actor_email: string | null;
};

/** The part before @ is what a teammate recognises; the full address is noise. */
function displayName(email: string | null): string {
  if (!email) return "A teammate";
  const local = email.split("@")[0]?.trim();
  return local === undefined || local === "" ? "A teammate" : local;
}

function toEntry(row: FeedRow): ActivityEntry {
  const orderId =
    typeof row.detail?.order_id === "string" &&
    UUID_PATTERN.test(row.detail.order_id)
      ? row.detail.order_id
      : row.entity_type === "purchase_order"
        ? row.entity_id
        : null;

  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    actorName: displayName(row.actor_email),
    createdAt: row.created_at.toISOString(),
    orderId,
  };
}

export type ActivityQuery = {
  filter?: string;
  before?: string;
  beforeId?: string;
  limit?: number;
};

const MAX_LIMIT = 100;

function parseLimit(value: number | undefined): number {
  const limit = Math.trunc(value ?? PAGE_SIZE);
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

/**
 * The feed query itself, on a caller's connection.
 *
 * The dashboard reads it inside its own transaction, which is why this is separate
 * from `getActivityPage`. Reads through `private.activity_feed`, the only path to
 * the actor's email — `auth.users` is not readable by the application role — and
 * that function checks membership itself. The cursor is a `(created_at, id)` pair
 * so two events written in the same second cannot hide each other.
 */
export async function readActivity(
  client: PoolClient,
  businessId: string,
  options: ActivityQuery = {},
): Promise<{ entries: ActivityEntry[]; next: ActivityCursor | null }> {
  const filter = parseActivityFilter(options.filter);
  const limit = parseLimit(options.limit);
  const before =
    options.before && !Number.isNaN(Date.parse(options.before))
      ? new Date(options.before).toISOString()
      : null;
  const beforeId =
    before !== null && options.beforeId && UUID_PATTERN.test(options.beforeId)
      ? options.beforeId
      : null;

  const result = await client.query<FeedRow>(
    `select id, action, entity_type, entity_id, summary, detail, created_at,
            actor_email
       from private.activity_feed($1, $2, $3::timestamptz, $4::uuid, $5)`,
    [businessId, filter, before, beforeId, limit + 1],
  );

  const rows = result.rows.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    entries: rows.map(toEntry),
    next:
      result.rows.length > limit && last
        ? { before: last.created_at.toISOString(), beforeId: last.id }
        : null,
  };
}

/** One page of the feed, newest first, in its own tenant transaction. */
export async function getActivityPage(
  userId: string,
  businessId: string,
  options: ActivityQuery = {},
): Promise<{ entries: ActivityEntry[]; next: ActivityCursor | null }> {
  return withTenant(userId, (client) =>
    readActivity(client, businessId, options),
  );
}
