import { describe, expect, it } from "vitest";
import { csvCell, reportFilename, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Tomatoes")).toBe("Tomatoes");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Beans, canned")).toBe('"Beans, canned"');
    expect(csvCell('12" pizza base')).toBe('"12"" pizza base"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("keeps a negative quantity numeric", () => {
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell("-3.000")).toBe("-3.000");
  });

  it("neutralises a text cell a spreadsheet would run as a formula", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvCell("-not a number")).toBe("'-not a number");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

describe("toCsv", () => {
  it("writes CRLF rows and ends with a newline", () => {
    expect(
      toCsv([
        ["Product", "Quantity"],
        ["Tomatoes, truss", 12],
      ]),
    ).toBe('Product,Quantity\r\n"Tomatoes, truss",12\r\n');
  });

  it("writes a header-only file when nothing matches", () => {
    expect(toCsv([["Product", "On hand"]])).toBe("Product,On hand\r\n");
  });
});

describe("reportFilename", () => {
  it("names the file for the business, the report and the day", () => {
    expect(
      reportFilename("stock", "Demo Cafe", new Date("2026-11-22T23:00:00Z")),
    ).toBe("demo-cafe-stock-2026-11-22.csv");
  });

  it("falls back when the business name has no usable characters", () => {
    expect(
      reportFilename("orders", "***", new Date("2026-01-02T00:00:00Z")),
    ).toBe("business-orders-2026-01-02.csv");
  });
});
