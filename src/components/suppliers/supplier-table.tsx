import type { SupplierSummary } from "@/lib/suppliers";
import { ListCardSkeletons } from "@/components/skeletons";
import { ListCard } from "../list-card";
import { PanelLink } from "../panel-link";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/**
 * Dense supplier table, with a card per supplier below 600px.
 *
 * Selecting a row opens its panel through the URL. The card carries the contact
 * and the phone the table hides off-screen on a phone, and the whole card is the
 * link, so the name is not the only target.
 */
export function SupplierTable({
  suppliers,
  hrefFor,
}: {
  suppliers: SupplierSummary[];
  hrefFor: (supplierId: string) => string;
}) {
  return (
    <>
      <div data-card-rows className="flex min-[600px]:hidden flex-col gap-2">
        {suppliers.map((supplier) => (
          <ListCard
            key={supplier.id}
            href={hrefFor(supplier.id)}
            title={supplier.name}
            meta={
              [supplier.contactName, supplier.phone]
                .filter(Boolean)
                .join(" · ") ||
              supplier.email ||
              "—"
            }
            badge={
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap ${
                  supplier.isArchived
                    ? "border border-line bg-panel text-ink-muted"
                    : "bg-success-soft text-success"
                }`}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                />
                {supplier.isArchived ? "Archived" : "Active"}
              </span>
            }
            figures={[{ label: "Products", value: supplier.productCount }]}
          />
        ))}
      </div>

      <ListCardSkeletons figures={2} />

      <div className="hidden overflow-x-auto rounded border border-line bg-surface min-[600px]:block">
        <table className="w-full min-w-[620px] border-collapse text-[13px]">
          <caption className="sr-only">
            Suppliers, with contact details and the number of products they
            supply
          </caption>
          <thead className="border-b border-line bg-panel">
            <tr>
              <th scope="col" className={TH}>
                Supplier
              </th>
              <th scope="col" className={TH}>
                Contact
              </th>
              <th scope="col" className={TH}>
                Phone
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Products
              </th>
            </tr>
          </thead>
          <tbody data-rows>
            {suppliers.map((supplier) => {
              return (
                <tr
                  key={supplier.id}
                  className="border-b border-line last:border-b-0 hover:bg-panel"
                >
                  <td className={`${TD} border-l-2 border-transparent`}>
                    {/* The open row is marked by the link's own state, because the
                        panel opens without a page render. */}
                    <PanelLink
                      href={hrefFor(supplier.id)}
                      className="font-medium hover:text-accent"
                    >
                      {supplier.name}
                    </PanelLink>
                    {supplier.isArchived ? (
                      <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted">
                        Archived
                      </span>
                    ) : null}
                    {supplier.email ? (
                      <div className="text-[11px] text-ink-faint">
                        {supplier.email}
                      </div>
                    ) : null}
                  </td>
                  <td className={`${TD} text-ink-muted`}>
                    {supplier.contactName ?? "—"}
                  </td>
                  <td className={`${TD} font-mono text-[12px] text-ink-muted`}>
                    {supplier.phone ?? "—"}
                  </td>
                  <td className={`${TD} text-right font-mono`}>
                    {supplier.productCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Shown by `[data-busy="true"]` while a filter or pager change is in
              flight, so the rows are replaced in place instead of the page. */}
          <tbody
            data-skeleton
            aria-hidden
            className="animate-pulse motion-reduce:animate-none"
          >
            {Array.from({ length: 8 }, (_, row) => (
              <tr key={row} className="border-b border-line last:border-b-0">
                {Array.from({ length: 4 }, (_, column) => (
                  <td key={column} className={TD}>
                    <span
                      className={`block h-3 rounded bg-line ${
                        column === 0 ? "w-32" : "w-10"
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
