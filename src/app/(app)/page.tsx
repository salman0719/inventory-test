import Link from "next/link";
import { NoBusinessNotice } from "@/components/no-business-notice";
import { getActiveBusiness } from "@/lib/businesses";
import { getSessionUser } from "@/lib/session";

const STATS = [
  { label: "Products", slice: "slice 4" },
  { label: "Low stock", slice: "slice 6" },
  { label: "Open orders", slice: "slice 7" },
  { label: "Stock value", slice: "slice 8" },
];

const SECTIONS = [
  {
    href: "/products",
    title: "Products",
    body: "Catalogue, search, filters, archive.",
  },
  {
    href: "/inventory",
    title: "Inventory",
    body: "On-hand, stock in and out, adjustments.",
  },
  {
    href: "/suppliers",
    title: "Suppliers",
    body: "Contacts, products supplied, order history.",
  },
  {
    href: "/purchase-orders",
    title: "Purchase orders",
    body: "Draft, send, receive in full or in part.",
  },
  {
    href: "/reports",
    title: "Reports",
    body: "Stock, low stock and order status exports.",
  },
  {
    href: "/settings",
    title: "Settings",
    body: "Business profile, categories, demo reset.",
  },
];

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const { active } = await getActiveBusiness(user.id);
  if (!active) return <NoBusinessNotice />;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          Dashboard
        </p>
        <h1 className="mt-0.5 text-[17px] font-semibold tracking-tight">
          {active.name}
        </h1>
        <p className="text-[12px] text-ink-muted">
          {active.businessType === "cafe" ? "Cafe" : "Retail"} ·{" "}
          {active.currencyCode} · Shell only; every figure below arrives with
          its data slice.
        </p>
      </header>

      <section
        aria-label="Summary figures"
        className="grid grid-cols-2 gap-2 min-[600px]:grid-cols-4"
      >
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded border border-line bg-panel px-3 py-2.5"
          >
            <p className="text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              {stat.label}
            </p>
            <p className="font-mono text-[20px] leading-tight text-ink-faint">
              —
            </p>
            <p className="text-[10px] text-ink-faint">{stat.slice}</p>
          </div>
        ))}
      </section>

      <section aria-label="Sections" className="flex flex-col gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          Sections
        </h2>
        <ul className="grid gap-2 min-[600px]:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="flex min-h-[52px] flex-col justify-center rounded border border-line bg-surface px-3 py-2 hover:border-accent"
              >
                <span className="text-[13px] font-medium">{section.title}</span>
                <span className="text-[11px] text-ink-muted">
                  {section.body}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
