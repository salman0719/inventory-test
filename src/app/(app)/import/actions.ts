"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/businesses";
import {
  getImportPage,
  importProducts,
  importSuppliers,
} from "@/lib/csv-import";
import {
  evaluateImport,
  evaluateSupplierImport,
  importRequestSchema,
  mapRows,
  mapSupplierRows,
  supplierImportRequestSchema,
  type ImportEvaluation,
  type SupplierEvaluation,
} from "@/lib/import-input";
import { getSessionUser } from "@/lib/session";

/**
 * Product import actions.
 *
 * Preview and confirm accept the same payload and run the same evaluation. The
 * preview is advisory; confirm re-reads the catalogue, re-validates every row and
 * then calls the database function, which validates a third time. Nothing the
 * browser sends is trusted as a total, a name or an id — the business comes from
 * the session and the supplier id is resolved against it.
 */

export type PreviewImportResult =
  { ok: true; evaluation: ImportEvaluation } | { ok: false; error: string };

export type ConfirmImportResult =
  | {
      ok: true;
      imported: number;
      updated: number;
      skipped: number;
      openingMovements: number;
    }
  | { ok: false; error: string };

type Context =
  | {
      ok: true;
      userId: string;
      businessId: string;
      data: Awaited<ReturnType<typeof getImportPage>>;
      request: ReturnType<typeof importRequestSchema.parse>;
      defaultSupplierName: string | null;
    }
  | { ok: false; error: string };

async function prepare(input: unknown): Promise<Context> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) {
    return { ok: false, error: "No business is available to import into." };
  }

  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "The import payload is not valid. Start again from the file.",
    };
  }

  const data = await getImportPage(user.id, active.id);
  const defaultSupplier =
    parsed.data.defaultSupplierId === null
      ? null
      : data.suppliers.find(
          (supplier) => supplier.id === parsed.data.defaultSupplierId,
        );

  if (parsed.data.defaultSupplierId !== null && !defaultSupplier) {
    return { ok: false, error: "That supplier is not in this business." };
  }

  return {
    ok: true,
    userId: user.id,
    businessId: active.id,
    data,
    request: parsed.data,
    defaultSupplierName: defaultSupplier?.name ?? null,
  };
}

function evaluate(context: Context & { ok: true }): ImportEvaluation {
  const candidates = mapRows(
    context.request.rows,
    context.request.mapping,
    context.request.rowOffset,
  );

  return evaluateImport({
    candidates,
    options: context.request.options,
    lookups: {
      products: context.data.products,
      suppliers: context.data.suppliers.map((supplier) => supplier.name),
      categories: context.data.categories,
    },
    defaultSupplierName: context.defaultSupplierName,
  });
}

export async function previewProductImport(
  input: unknown,
): Promise<PreviewImportResult> {
  const context = await prepare(input);
  if (!context.ok) return context;

  try {
    return { ok: true, evaluation: evaluate(context) };
  } catch {
    return {
      ok: false,
      error: "The file could not be checked. Reload the page and try again.",
    };
  }
}

export async function confirmProductImport(
  input: unknown,
): Promise<ConfirmImportResult> {
  const context = await prepare(input);
  if (!context.ok) return context;

  const evaluation = evaluate(context);

  if (!evaluation.valid && !context.request.options.partial) {
    return {
      ok: false,
      error: `${evaluation.counts.errorRows} row${
        evaluation.counts.errorRows === 1 ? "" : "s"
      } cannot be imported. Fix them, or choose to import the valid rows only.`,
    };
  }

  const rows = evaluation.rows.flatMap((row) =>
    row.values !== null && (row.status === "new" || row.status === "update")
      ? [{ ...row.values, rowNumber: row.rowNumber }]
      : [],
  );

  if (rows.length === 0) {
    return { ok: false, error: "No rows can be imported from this file." };
  }

  const result = await importProducts(context.userId, context.businessId, {
    filename: context.request.filename,
    rows,
    totalRows: evaluation.counts.totalRows,
    options: context.request.options,
    defaultSupplierId: context.request.defaultSupplierId,
    idempotencyKey: context.request.idempotencyKey,
  });

  if (!result.ok) return result;

  revalidatePath("/import");
  revalidatePath("/products");
  revalidatePath("/activity");
  revalidatePath("/settings");

  return {
    ok: true,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    openingMovements: result.openingMovements,
  };
}

export type PreviewSupplierImportResult =
  { ok: true; evaluation: SupplierEvaluation } | { ok: false; error: string };

export type ConfirmSupplierImportResult =
  | { ok: true; imported: number; updated: number; skipped: number }
  | { ok: false; error: string };

type SupplierContext =
  | {
      ok: true;
      userId: string;
      businessId: string;
      data: Awaited<ReturnType<typeof getImportPage>>;
      request: ReturnType<typeof supplierImportRequestSchema.parse>;
    }
  | { ok: false; error: string };

async function prepareSupplier(input: unknown): Promise<SupplierContext> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { active } = await getActiveBusiness(user.id);
  if (!active) {
    return { ok: false, error: "No business is available to import into." };
  }

  const parsed = supplierImportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "The import payload is not valid. Start again from the file.",
    };
  }

  const data = await getImportPage(user.id, active.id);

  return {
    ok: true,
    userId: user.id,
    businessId: active.id,
    data,
    request: parsed.data,
  };
}

function evaluateSupplierRows(
  context: SupplierContext & { ok: true },
): SupplierEvaluation {
  const candidates = mapSupplierRows(
    context.request.rows,
    context.request.mapping,
    context.request.rowOffset,
  );

  return evaluateSupplierImport({
    candidates,
    updateExisting: context.request.updateExisting,
    lookups: {
      suppliers: context.data.suppliers.map((supplier) => supplier.name),
      archivedSuppliers: context.data.archivedSuppliers,
    },
  });
}

export async function previewSupplierImport(
  input: unknown,
): Promise<PreviewSupplierImportResult> {
  const context = await prepareSupplier(input);
  if (!context.ok) return context;

  try {
    return { ok: true, evaluation: evaluateSupplierRows(context) };
  } catch {
    return {
      ok: false,
      error: "The file could not be checked. Reload the page and try again.",
    };
  }
}

export async function confirmSupplierImport(
  input: unknown,
): Promise<ConfirmSupplierImportResult> {
  const context = await prepareSupplier(input);
  if (!context.ok) return context;

  const evaluation = evaluateSupplierRows(context);

  if (!evaluation.valid && !context.request.partial) {
    return {
      ok: false,
      error: `${evaluation.counts.errorRows} row${
        evaluation.counts.errorRows === 1 ? "" : "s"
      } cannot be imported. Fix them, or choose to import the valid rows only.`,
    };
  }

  const rows = evaluation.rows.flatMap((row) =>
    row.values !== null && (row.status === "new" || row.status === "update")
      ? [{ ...row.values, rowNumber: row.rowNumber }]
      : [],
  );

  if (rows.length === 0) {
    return { ok: false, error: "No rows can be imported from this file." };
  }

  const result = await importSuppliers(context.userId, context.businessId, {
    filename: context.request.filename,
    rows,
    totalRows: evaluation.counts.totalRows,
    updateExisting: context.request.updateExisting,
    idempotencyKey: context.request.idempotencyKey,
  });

  if (!result.ok) return result;

  revalidatePath("/import");
  revalidatePath("/suppliers");
  revalidatePath("/activity");

  return {
    ok: true,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
  };
}
