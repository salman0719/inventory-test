import { describe, expect, it } from "vitest";
import {
  movementCsvRows,
  orderCsvRows,
  stockCsvRows,
  valuationCsvRows,
} from "@/lib/report-csv";
import type {
  MovementReportRow,
  OrderReportRow,
  StockReportRow,
} from "@/lib/reports";

describe("stockCsvRows", () => {
  it("writes numbers as numbers and names the stock status", () => {
    const row: StockReportRow = {
      id: "p1",
      name: "Tomatoes, truss",
      sku: "CAF-001",
      unitOfMeasure: "kg",
      categoryName: "Produce",
      supplierName: null,
      onHand: "18.000",
      reorderLevel: "10.000",
      onOrder: "12.000",
      unitCost: "4.200",
      stockValue: "75.60",
    };

    expect(stockCsvRows([row])[0]).toEqual([
      "Tomatoes, truss",
      "CAF-001",
      "Produce",
      "",
      "kg",
      18,
      10,
      12,
      4.2,
      75.6,
      "ok",
    ]);
  });
});

describe("movementCsvRows", () => {
  it("names the type and turns a receipt reference into a word", () => {
    const row: MovementReportRow = {
      id: "m1",
      createdAt: "2026-11-22T03:10:00.000Z",
      productId: "p1",
      productName: "Tomatoes, truss",
      sku: "CAF-001",
      unitOfMeasure: "kg",
      movementType: "received",
      quantityDelta: "5.000",
      reason: "Received on PO-0001",
      referenceType: "purchase_receipt",
    };

    expect(movementCsvRows([row])[0]).toEqual([
      "2026-11-22",
      "Tomatoes, truss",
      "CAF-001",
      "Received",
      5,
      "kg",
      "Received on PO-0001",
      "Receipt",
    ]);
  });
});

describe("orderCsvRows", () => {
  it("writes the status in words and the dates as plain days", () => {
    const row: OrderReportRow = {
      id: "o1",
      orderNumber: "PO-0001",
      status: "partially_received",
      supplierName: "Fresh Fields Produce",
      orderedAt: "2026-11-21T22:00:00.000Z",
      expectedDeliveryAt: "2026-11-24",
      lineCount: 3,
      receivedLines: 2,
      totalValue: "131.80",
      outstandingValue: "29.40",
    };

    expect(orderCsvRows([row])[0]).toEqual([
      "PO-0001",
      "Fresh Fields Produce",
      "Partly received",
      "2026-11-21",
      "2026-11-24",
      2,
      3,
      131.8,
      29.4,
    ]);
  });
});

describe("valuationCsvRows", () => {
  it("ends with a total row built from every category", () => {
    const rows = valuationCsvRows({
      rows: [
        { categoryName: "Produce", products: 12, value: "1200.10" },
        { categoryName: "Dairy", products: 8, value: "800.20" },
      ],
      totalValue: "2000.30",
      totalProducts: 20,
    });

    expect(rows).toEqual([
      ["Produce", 12, 1200.1],
      ["Dairy", 8, 800.2],
      ["Total", 20, 2000.3],
    ]);
  });
});
