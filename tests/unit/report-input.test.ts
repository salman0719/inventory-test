import { describe, expect, it } from "vitest";
import {
  parseMovementTypeFilter,
  parseOrderReportStatus,
  parseReportDate,
  parseReportKind,
  parseReportStatus,
  reportExportHref,
  reportHref,
  reportStatusFor,
  type ReportFilters,
} from "@/lib/report-input";

const BASE: ReportFilters = {
  q: "",
  status: "all",
  orderStatus: "all",
  movementType: "all",
  from: "",
  to: "",
  page: 1,
};

describe("report parsing", () => {
  it("falls back to the stock report for an unknown kind", () => {
    expect(parseReportKind("movements")).toBe("movements");
    expect(parseReportKind("profit")).toBe("stock");
    expect(parseReportKind(undefined)).toBe("stock");
  });

  it("forces the low report to shortages only", () => {
    expect(reportStatusFor("low", "ok")).toBe("attention");
    expect(reportStatusFor("low", undefined)).toBe("attention");
    expect(reportStatusFor("stock", "out")).toBe("out");
    expect(parseReportStatus("nonsense")).toBe("all");
  });

  it("accepts only the order statuses it knows", () => {
    expect(parseOrderReportStatus("partially_received")).toBe(
      "partially_received",
    );
    expect(parseOrderReportStatus("sent")).toBe("all");
  });

  it("accepts only ledger movement types", () => {
    expect(parseMovementTypeFilter("received")).toBe("received");
    expect(parseMovementTypeFilter("transfer")).toBe("all");
  });

  it("rejects an impossible calendar date", () => {
    expect(parseReportDate("2026-11-22")).toBe("2026-11-22");
    expect(parseReportDate("2024-02-29")).toBe("2024-02-29");
    expect(parseReportDate("2026-02-30")).toBe("");
    expect(parseReportDate("22/11/2026")).toBe("");
    expect(parseReportDate("")).toBe("");
  });
});

describe("report links", () => {
  it("keeps the search and the stock filter on the stock report", () => {
    expect(reportHref("stock", { ...BASE, q: "tomato" })).toBe(
      "/reports?report=stock&q=tomato",
    );
    expect(
      reportHref("stock", { ...BASE, q: "tomato", status: "low", page: 2 }),
    ).toBe("/reports?report=stock&q=tomato&status=low&page=2");
  });

  it("uses the status parameter for order status only on the order report", () => {
    expect(
      reportHref("orders", { ...BASE, status: "low", orderStatus: "open" }),
    ).toBe("/reports?report=orders&status=open");
  });

  it("carries the movement type and dates", () => {
    expect(
      reportHref("movements", {
        ...BASE,
        movementType: "received",
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    ).toBe(
      "/reports?report=movements&type=received&from=2026-11-01&to=2026-11-30",
    );
  });

  it("exports the filters without the page number", () => {
    expect(
      reportExportHref("stock", {
        ...BASE,
        q: "tomato",
        status: "low",
        page: 3,
      }),
    ).toBe("/reports/export?report=stock&q=tomato&status=low");
  });
});
