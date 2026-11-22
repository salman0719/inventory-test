import Link from "next/link";
import type { SupplierSummary } from "@/lib/suppliers";

const TH =
  "px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted";
const TD = "px-2.5 py-1.5 align-middle";

/** Dense supplier table; selecting a row opens its panel through the URL. */
export function SupplierTable({
  suppliers,
  selectedId,
  hrefFor,
}: {
  suppliers: SupplierSummary[];
  selectedId: string;
  hrefFor: (supplierId: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <caption className="sr-only">
          Suppliers, with contact details and the number of products they supply
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
        <tbody>
          {suppliers.map((supplier) => {
            const selected = supplier.id === selectedId;
            return (
              <tr
                key={supplier.id}
                className={`border-b border-line last:border-b-0 ${
                  selected ? "bg-accent-soft" : "hover:bg-panel"
                }`}
              >
                <td
                  className={`${TD} ${
                    selected
                      ? "border-l-2 border-accent"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <Link
                    href={hrefFor(supplier.id)}
                    aria-current={selected ? "true" : undefined}
                    className="font-medium hover:text-accent"
                  >
                    {supplier.name}
                  </Link>
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
      </table>
    </div>
  );
}
