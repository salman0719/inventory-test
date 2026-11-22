import {
  CAFE_CATEGORIES,
  CAFE_PRODUCTS,
  CAFE_SUPPLIER_BY_CATEGORY,
  CAFE_SUPPLIERS,
  RETAIL_CATEGORIES,
  RETAIL_PRODUCTS,
  RETAIL_SUPPLIER_BY_CATEGORY,
  RETAIL_SUPPLIERS,
  type SeedProduct,
  type SeedSupplier,
} from "./seed-catalogue";

/**
 * One definition of the demo dataset, shared by `db:seed` and the reset workflow.
 *
 * The seed writes it with the owner connection; the reset sends the same data to
 * `private.reset_demo_business`, which an owner can call from the app. Both paths
 * derive SKUs from the catalogue index, so a reset produces exactly the baseline a
 * fresh seed would: 60 cafe products, 160 retail lines, the same suppliers and the
 * same two demonstration orders.
 */

export type DemoBusinessType = "cafe" | "retail";

export type DemoBusiness = {
  id: string;
  name: string;
  businessType: DemoBusinessType;
  currencyCode: string;
};

export const DEMO_BUSINESSES: readonly DemoBusiness[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Demo Cafe",
    businessType: "cafe",
    currencyCode: "AUD",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Demo Retail",
    businessType: "retail",
    currencyCode: "AUD",
  },
];

export type DemoCatalogue = {
  businessId: string;
  skuPrefix: string;
  categories: readonly string[];
  products: SeedProduct[];
  suppliers: SeedSupplier[];
  supplierByCategory: Record<string, string>;
  ownerId: string;
};

export const CATALOGUES: readonly DemoCatalogue[] = [
  {
    businessId: DEMO_BUSINESSES[0].id,
    skuPrefix: "CAF",
    categories: CAFE_CATEGORIES,
    products: CAFE_PRODUCTS,
    suppliers: CAFE_SUPPLIERS,
    supplierByCategory: CAFE_SUPPLIER_BY_CATEGORY,
    ownerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  },
  {
    businessId: DEMO_BUSINESSES[1].id,
    skuPrefix: "RET",
    categories: RETAIL_CATEGORIES,
    products: RETAIL_PRODUCTS,
    suppliers: RETAIL_SUPPLIERS,
    supplierByCategory: RETAIL_SUPPLIER_BY_CATEGORY,
    ownerId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  },
];

export function catalogueFor(businessType: DemoBusinessType): DemoCatalogue {
  const catalogue = CATALOGUES.find(
    (entry) => entry.businessId === businessIdFor(businessType),
  );
  if (!catalogue) throw new Error(`No demo catalogue for ${businessType}.`);
  return catalogue;
}

function businessIdFor(businessType: DemoBusinessType): string {
  return businessType === "cafe"
    ? DEMO_BUSINESSES[0].id
    : DEMO_BUSINESSES[1].id;
}

/** Append to the catalogue only: a new row in the middle renumbers every SKU. */
export function demoProductSku(skuPrefix: string, index: number): string {
  return `${skuPrefix}-${String(index + 1).padStart(3, "0")}`;
}

export type DemoOrderLine = { sku: string; quantity: number };

export type DemoOrder = {
  orderNumber: string;
  supplierName: string;
  status: "draft" | "ordered";
  orderedDaysAgo: number | null;
  expectedInDays: number | null;
  notes: string;
  lines: DemoOrderLine[];
};

/** The two cafe orders that make the receiving journey demonstrable. */
export const DEMO_ORDERS: readonly DemoOrder[] = [
  {
    orderNumber: "PO-0001",
    supplierName: "Fresh Fields Produce",
    status: "ordered",
    orderedDaysAgo: 2,
    expectedInDays: 3,
    notes: "Weekly produce order. Check the tomatoes before signing.",
    lines: [
      { sku: "CAF-001", quantity: 12 },
      { sku: "CAF-004", quantity: 20 },
      { sku: "CAF-011", quantity: 3 },
    ],
  },
  {
    orderNumber: "PO-0002",
    supplierName: "Coldstream Dairy",
    status: "draft",
    orderedDaysAgo: null,
    expectedInDays: 5,
    notes: "Standing dairy order.",
    lines: [
      { sku: "CAF-021", quantity: 24 },
      { sku: "CAF-022", quantity: 6 },
    ],
  },
];

export type ResetPayload = {
  categories: string[];
  suppliers: SeedSupplier[];
  products: {
    name: string;
    sku: string;
    category: string;
    supplier: string;
    unit: string;
    cost: string;
    selling: string | null;
    reorder: string;
    opening: string;
  }[];
  orders: {
    orderNumber: string;
    supplier: string;
    status: string;
    orderedDaysAgo: number | null;
    expectedInDays: number | null;
    notes: string;
    lines: DemoOrderLine[];
  }[];
};

/**
 * The reset payload for one business. It is built from the same arrays as the
 * seed, so the restored catalogue cannot drift from a freshly seeded one.
 */
export function buildResetPayload(
  businessType: DemoBusinessType,
): ResetPayload {
  const catalogue = catalogueFor(businessType);

  return {
    categories: [...catalogue.categories],
    suppliers: catalogue.suppliers.map((supplier) => ({ ...supplier })),
    products: catalogue.products.map((product, index) => {
      const [name, category, unit, cost, price, reorder, onHand] = product;
      const supplier = catalogue.supplierByCategory[category];
      if (!supplier) {
        throw new Error(`No demo supplier for category ${category}.`);
      }
      return {
        name,
        sku: demoProductSku(catalogue.skuPrefix, index),
        category,
        supplier,
        unit,
        cost: cost.toFixed(2),
        selling: price === null ? null : price.toFixed(2),
        reorder: String(reorder),
        opening: String(onHand),
      };
    }),
    orders:
      businessType === "cafe"
        ? DEMO_ORDERS.map((order) => ({
            orderNumber: order.orderNumber,
            supplier: order.supplierName,
            status: order.status,
            orderedDaysAgo: order.orderedDaysAgo,
            expectedInDays: order.expectedInDays,
            notes: order.notes,
            lines: order.lines.map((line) => ({ ...line })),
          }))
        : [],
  };
}
