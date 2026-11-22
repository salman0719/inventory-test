import { describe, expect, it } from "vitest";
import {
  buildResetPayload,
  catalogueFor,
  demoProductSku,
  DEMO_ORDERS,
} from "../../db/seed-demo";

/**
 * The reset payload is built from the same catalogue arrays the seed writes, so
 * these tests pin the properties that make it a faithful baseline: the SKUs the
 * seed derives, the supplier and category references, and orders that name real
 * products.
 */

describe("buildResetPayload", () => {
  it("restores the cafe catalogue the seed writes", () => {
    const payload = buildResetPayload("cafe");

    expect(payload.categories).toHaveLength(9);
    expect(payload.suppliers).toHaveLength(9);
    expect(payload.products).toHaveLength(60);
    expect(payload.orders).toHaveLength(2);
    expect(payload.products[0].sku).toBe("CAF-001");
    expect(payload.products[59].sku).toBe("CAF-060");
  });

  it("restores the retail catalogue without demonstration orders", () => {
    const payload = buildResetPayload("retail");

    expect(payload.categories).toHaveLength(10);
    expect(payload.suppliers).toHaveLength(6);
    expect(payload.products).toHaveLength(160);
    expect(payload.orders).toHaveLength(0);
    expect(payload.products[0].sku).toBe("RET-001");
  });

  it("names a category and supplier that the payload also contains", () => {
    const payload = buildResetPayload("cafe");
    const categories = new Set(payload.categories);
    const suppliers = new Set(payload.suppliers.map((entry) => entry.name));

    for (const product of payload.products) {
      expect(categories.has(product.category)).toBe(true);
      expect(suppliers.has(product.supplier)).toBe(true);
    }
  });

  it("keeps the catalogue's opening quantities", () => {
    const payload = buildResetPayload("cafe");
    const catalogue = catalogueFor("cafe");

    payload.products.forEach((product, index) => {
      expect(product.opening).toBe(String(catalogue.products[index][6]));
      expect(product.cost).toBe(catalogue.products[index][3].toFixed(2));
    });
  });

  it("gives each order lines that exist in the same payload", () => {
    const payload = buildResetPayload("cafe");
    const skus = new Set(payload.products.map((product) => product.sku));
    const suppliers = new Set(payload.suppliers.map((entry) => entry.name));

    for (const order of payload.orders) {
      expect(suppliers.has(order.supplier)).toBe(true);
      expect(order.lines.length).toBeGreaterThan(0);
      for (const line of order.lines) {
        expect(skus.has(line.sku)).toBe(true);
        expect(line.quantity).toBeGreaterThan(0);
      }
    }

    expect(payload.orders.map((order) => order.orderNumber)).toEqual([
      "PO-0001",
      "PO-0002",
    ]);
    expect(payload.orders[0].status).toBe("ordered");
    expect(payload.orders[1].status).toBe("draft");
  });

  it("derives the same SKUs the seed does", () => {
    expect(demoProductSku("CAF", 0)).toBe("CAF-001");
    expect(demoProductSku("CAF", 9)).toBe("CAF-010");
    expect(demoProductSku("RET", 159)).toBe("RET-160");
    expect(DEMO_ORDERS[0].orderNumber).toBe("PO-0001");
  });
});
