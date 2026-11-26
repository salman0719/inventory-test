import type { PoolClient } from "pg";
import { runInTenant, withTenant } from "./db";
import type { ImportOptions, ImportValues } from "./import-input";

/**
 * CSV import reads and the one write.
 *
 * The preview reads the catalogue snapshot (suppliers, categories, SKUs) and the
 * history the import screen shows. The write calls `private.import_products`, which
 * checks membership, validates every row again, applies the rows and records
 * history and one activity event in the same transaction.
 *
 * The browser never supplies totals. `importProducts` passes the normalised rows
 * and the file's row count; the function recomputes every count it reports.
 */

export type ImportSupplier = { id: string; name: string };

export type ImportProductLookup = { id: string; sku: string; name: string };

export type CsvImportSummary = {
  id: string;
  kind: "products" | "suppliers";
  filename: string;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  openingMovements: number;
  createdAt: string;
};

export type ImportPageData = {
  suppliers: ImportSupplier[];
  categories: string[];
  products: ImportProductLookup[];
  history: CsvImportSummary[];
};

export type ImportWireRow = ImportValues & { rowNumber: number };

export type ImportProductsResult =
  | {
      ok: true;
      importId: string;
      imported: number;
      updated: number;
      skipped: number;
      openingMovements: number;
    }
  | { ok: false; error: string };

type HistoryRow = {
  id: string;
  kind: "products" | "suppliers";
  filename: string;
  total_rows: number;
  imported_rows: number;
  updated_rows: number;
  skipped_rows: number;
  opening_movements: number;
  created_at: Date;
};

function toHistory(row: HistoryRow): CsvImportSummary {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    totalRows: row.total_rows,
    importedRows: row.imported_rows,
    updatedRows: row.updated_rows,
    skippedRows: row.skipped_rows,
    openingMovements: row.opening_movements,
    createdAt: row.created_at.toISOString(),
  };
}

/** Everything the import page reads, on one tenant connection. */
export async function getImportPage(
  userId: string,
  businessId: string,
): Promise<ImportPageData> {
  return withTenant(userId, async (client) => {
    const suppliers = await client.query<ImportSupplier>(
      `select id, name
         from suppliers
        where business_id = $1 and is_archived = false
        order by lower(name)`,
      [businessId],
    );
    const categories = await client.query<{ name: string }>(
      `select name from categories where business_id = $1 order by lower(name)`,
      [businessId],
    );
    const products = await client.query<ImportProductLookup>(
      `select id, sku, name from products where business_id = $1 order by sku`,
      [businessId],
    );
    const history = await listCsvImports(userId, businessId, client);

    return {
      suppliers: suppliers.rows,
      categories: categories.rows.map((row) => row.name),
      products: products.rows,
      history,
    };
  });
}

/** The last eight runs, newest first. */
export async function listCsvImports(
  userId: string,
  businessId: string,
  client?: PoolClient,
): Promise<CsvImportSummary[]> {
  return runInTenant(userId, client, async (client) => {
    const result = await client.query<HistoryRow>(
      `select id, kind, filename, total_rows, imported_rows, updated_rows,
              skipped_rows, opening_movements, created_at
         from csv_imports
        where business_id = $1
        order by created_at desc, id desc
        limit 8`,
      [businessId],
    );
    return result.rows.map(toHistory);
  });
}

/**
 * Write a product import. `rows` holds only rows that passed review; `totalRows`
 * is the file's data-row count, so a partial import reports what it skipped.
 */
export async function importProducts(
  userId: string,
  businessId: string,
  input: {
    filename: string;
    rows: ImportWireRow[];
    totalRows: number;
    options: ImportOptions;
    defaultSupplierId: string | null;
    idempotencyKey: string;
  },
): Promise<ImportProductsResult> {
  try {
    return await withTenant(userId, async (client) => {
      const result = await client.query<{
        import_id: string;
        imported: number;
        updated: number;
        skipped: number;
        opening_movements: number;
      }>(
        `select import_id, imported, updated, skipped, opening_movements
           from private.import_products($1, $2::jsonb, $3::jsonb, $4, $5, $6)`,
        [
          businessId,
          JSON.stringify(input.rows),
          JSON.stringify({
            updateExisting: input.options.updateExisting,
            createSuppliers: input.options.createSuppliers,
            createCategories: input.options.createCategories,
            defaultSupplierId: input.defaultSupplierId,
          }),
          input.idempotencyKey,
          input.filename,
          input.totalRows,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        return { ok: false as const, error: "The import was not recorded." };
      }

      return {
        ok: true as const,
        importId: row.import_id,
        imported: row.imported,
        updated: row.updated,
        skipped: row.skipped,
        openingMovements: row.opening_movements,
      };
    });
  } catch (error) {
    return describeImportError(error);
  }
}

/**
 * Only the function's own raised messages reach the operator. A unique violation
 * from a concurrent import is explained; anything else is a bug and is rethrown.
 */
function describeImportError(error: unknown): {
  ok: false;
  error: string;
} {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  const constraint = (error as { constraint?: string } | null)?.constraint;

  switch (code) {
    case "22023":
      return {
        ok: false,
        error: message ?? "The import could not be applied.",
      };
    case "42501":
      return {
        ok: false,
        error:
          "You do not have permission to import products in this business.",
      };
    case "P0002":
      return { ok: false, error: "That business is not yours." };
    case "23505":
      return {
        ok: false,
        error:
          constraint === "csv_imports_business_idempotency_key"
            ? "This import was already saved."
            : "A SKU in this file already exists. Update it instead of creating it.",
      };
    case "23503":
      return {
        ok: false,
        error:
          "A supplier or category changed while you were reviewing. Reload the page and try again.",
      };
    default:
      throw error;
  }
}
