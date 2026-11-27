import { CountForm } from "@/components/stocktake/count-form";
import { StartStocktakeForm } from "@/components/stocktake/start-form";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { DataCard, ListCard } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { PendingLink } from "@/components/pending-link";
import { getActiveBusiness } from "@/lib/businesses";
import { formatQuantity } from "@/lib/product-input";
import { getSessionUser } from "@/lib/session";
import { formatSignedQuantity } from "@/lib/stock-input";
import { getStocktakePage, type StocktakeScope } from "@/lib/stocktake";
import {
  STOCKTAKE_STATUS_LABELS,
  type StocktakeStatus,
} from "@/lib/stocktake-input";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

const DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const SAVED_MESSAGES: Record<string, string> = {
  started: "Sheet opened. Count what is on the shelf, then complete it.",
  counts: "Counts saved. Nothing has moved in the ledger yet.",
  completed: "Stocktake completed and the ledger adjusted to the counts.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function Status({ status }: { status: StocktakeStatus }) {
  const tone =
    status === "completed"
      ? "text-success"
      : status === "cancelled"
        ? "text-ink-faint"
        : "text-warning";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${tone}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {STOCKTAKE_STATUS_LABELS[status]}
    </span>
  );
}

function scopeLabel(
  scope: StocktakeScope,
  categories: { id: string; name: string }[],
): string {
  const parts: string[] = [];
  if (scope.categoryId) {
    parts.push(
      categories.find((category) => category.id === scope.categoryId)?.name ??
        "One category",
    );
  }
  if (scope.search) parts.push(`“${scope.search}”`);
  return parts.length > 0 ? parts.join(" · ") : "All active products";
}

/**
 * Stocktake: start a counted sheet, enter the counts, and complete it. Completing
 * is the only thing that touches stock — the ledger receives the difference between
 * each count and what it holds at that moment.
 */
export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  const canCount = active.role !== "viewer";
  const selectedId = single(params, "session");
  const saved = single(params, "saved");

  const { sessions, categories, detail } = await getStocktakePage(
    user.id,
    active.id,
    selectedId,
  );

  const open = sessions.filter((session) => session.status === "draft").length;
  const savedMessage = SAVED_MESSAGES[saved];

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title="Stocktake"
        summary={
          <>
            {sessions.length} sheet{sessions.length === 1 ? "" : "s"}
            {open > 0 ? ` · ${open} open` : ""} · {active.name}
          </>
        }
      />

      {savedMessage ? (
        <p
          role="status"
          className="rounded border border-line bg-accent-soft px-3 py-2 text-[12px]"
        >
          {savedMessage}
        </p>
      ) : null}

      {canCount ? (
        <div className="rounded border border-line bg-panel px-3 py-3">
          <h2 className="mb-2 text-[13px] font-semibold">Start a stocktake</h2>
          <StartStocktakeForm categories={categories} />
        </div>
      ) : (
        <p className="rounded border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-muted">
          Counting is limited to owners and staff. You can read every sheet and
          its adjustments.
        </p>
      )}

      {sessions.length === 0 ? (
        <div className="rounded border border-line bg-surface px-3 py-10 text-center">
          <p className="text-[13px] font-medium">No stocktakes yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[12px] text-ink-muted">
            Start one above to compare what is on the shelf with what the ledger
            holds.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 min-[900px]:hidden">
            {sessions.map((session) => (
              <ListCard
                key={session.id}
                href={`/stocktake?session=${session.id}#sheet`}
                title={<span className="font-mono">{session.reference}</span>}
                meta={`Started ${DATE.format(new Date(session.startedAt))}`}
                badge={<Status status={session.status} />}
                figures={[
                  {
                    label: "Counted",
                    value: `${session.countedLines}/${session.lineCount}`,
                  },
                  {
                    label: "Adjustment",
                    value:
                      session.status === "completed"
                        ? `${session.adjustedLines} · ${formatSignedQuantity(session.netDelta)}`
                        : "—",
                  },
                ]}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded border border-line min-[900px]:block">
            <table className="w-full min-w-[600px] border-collapse">
              <thead className="bg-panel">
                <tr>
                  <th className={TH}>Sheet</th>
                  <th className={TH}>Started</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Counted</th>
                  <th className={`${TH} text-right`}>Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t border-line">
                    <td className={TD}>
                      <PendingLink
                        href={`/stocktake?session=${session.id}#sheet`}
                        className="font-mono text-[12px] font-medium hover:text-accent"
                      >
                        {session.reference}
                      </PendingLink>
                    </td>
                    <td className={`${TD} text-[12px]`}>
                      {DATE.format(new Date(session.startedAt))}
                    </td>
                    <td className={TD}>
                      <Status status={session.status} />
                    </td>
                    <td className={`${TD} text-right font-mono text-[12px]`}>
                      {session.countedLines}/{session.lineCount}
                    </td>
                    <td className={`${TD} text-right font-mono text-[12px]`}>
                      {session.status === "completed"
                        ? `${session.adjustedLines} · ${formatSignedQuantity(session.netDelta)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedId !== "" && !detail ? (
        <p className="rounded border border-line bg-panel px-3 py-2 text-[12px] text-ink-muted">
          That stocktake is not in this business.
        </p>
      ) : null}

      {detail ? (
        <div
          id="sheet"
          className="scroll-mt-20 rounded border border-line bg-surface"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-3 py-3">
            <h2 className="font-mono text-[14px] font-semibold">
              {detail.session.reference}
            </h2>
            <Status status={detail.session.status} />
            <p className="text-[11.5px] text-ink-muted">
              {detail.session.completedAt
                ? `Completed ${DATE.format(new Date(detail.session.completedAt))}`
                : `Started ${DATE.format(new Date(detail.session.startedAt))}`}
              {" · "}
              {scopeLabel(detail.session.scope, categories)}
            </p>
            <PendingLink
              href="/stocktake"
              className="ml-auto text-[11.5px] text-ink-muted hover:text-accent"
            >
              Close sheet
            </PendingLink>
          </div>

          <div className="px-3 py-3">
            {detail.session.status === "draft" && canCount ? (
              <CountForm
                sessionId={detail.session.id}
                reference={detail.session.reference}
                lines={detail.lines}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[12px] text-ink-muted">
                  {detail.session.status === "completed"
                    ? `${detail.session.countedLines} counted · ${detail.session.adjustedLines} adjusted · ${formatSignedQuantity(detail.session.netDelta)} net`
                    : `${detail.session.countedLines} of ${detail.session.lineCount} counted · not completed`}
                </p>

                <div className="flex flex-col gap-2 min-[900px]:hidden">
                  {detail.lines.map((line) => (
                    <DataCard
                      key={line.id}
                      title={line.productName}
                      meta={line.sku}
                      figures={[
                        {
                          label: "On hand at start",
                          value: formatQuantity(line.expectedQuantity),
                        },
                        {
                          label: "Counted",
                          value: formatQuantity(line.countedQuantity),
                        },
                        ...(detail.session.status === "completed"
                          ? [
                              {
                                label: "Ledger before",
                                value: formatQuantity(line.onHandBefore),
                              },
                              {
                                label: "Adjustment",
                                value: formatSignedQuantity(line.appliedDelta),
                              },
                            ]
                          : []),
                      ]}
                    />
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded border border-line min-[900px]:block">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead className="bg-panel">
                      <tr>
                        <th className={TH}>Product</th>
                        <th className={`${TH} text-right`}>On hand at start</th>
                        <th className={`${TH} text-right`}>Counted</th>
                        {detail.session.status === "completed" ? (
                          <>
                            <th className={`${TH} text-right`}>
                              Ledger before
                            </th>
                            <th className={`${TH} text-right`}>Adjustment</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id} className="border-t border-line">
                          <td className={TD}>
                            <span className="block text-[12.5px]">
                              {line.productName}
                            </span>
                            <span className="block font-mono text-[10.5px] text-ink-faint">
                              {line.sku}
                            </span>
                          </td>
                          <td
                            className={`${TD} text-right font-mono text-[12px]`}
                          >
                            {formatQuantity(line.expectedQuantity)}
                          </td>
                          <td
                            className={`${TD} text-right font-mono text-[12px]`}
                          >
                            {formatQuantity(line.countedQuantity)}
                          </td>
                          {detail.session.status === "completed" ? (
                            <>
                              <td
                                className={`${TD} text-right font-mono text-[12px]`}
                              >
                                {formatQuantity(line.onHandBefore)}
                              </td>
                              <td
                                className={`${TD} text-right font-mono text-[12px]`}
                              >
                                {formatSignedQuantity(line.appliedDelta)}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
