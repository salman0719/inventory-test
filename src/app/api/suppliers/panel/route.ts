import { getActiveBusiness } from "@/lib/businesses";
import { panelRequestSchema } from "@/lib/panel";
import { getSessionUser } from "@/lib/session";
import {
  getSupplier,
  listSuppliedProducts,
  type SuppliedProduct,
} from "@/lib/suppliers";
import type { SupplierPanelPayload } from "@/lib/supplier-panel";

/**
 * One supplier panel, as JSON, for a row click that must not re-render the list.
 * The business comes from the session and the active-business cookie.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to open suppliers." },
      { status: 401 },
    );
  }

  const { active } = await getActiveBusiness(user.id);
  if (!active) {
    return Response.json(
      { error: "No business is selected." },
      { status: 404 },
    );
  }

  const params = new URL(request.url).searchParams;
  const parsed = panelRequestSchema.safeParse({
    mode: params.get("mode") ?? "detail",
    id: params.get("supplier") ?? "",
    saved: params.get("saved") ?? "false",
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Unsupported panel request." },
      { status: 400 },
    );
  }

  const { mode, id: supplierId, saved } = parsed.data;
  const supplier =
    mode === "create" || supplierId === ""
      ? null
      : await getSupplier(user.id, active.id, supplierId);

  let products: SuppliedProduct[] = [];
  if (supplier !== null && mode === "detail") {
    products = await listSuppliedProducts(user.id, active.id, supplier.id);
  }

  const payload: SupplierPanelPayload = {
    mode: mode === "create" ? "create" : supplier === null ? "detail" : mode,
    supplier,
    products,
    saved: saved && mode !== "edit",
  };

  return Response.json(payload, {
    headers: { "cache-control": "private, no-store" },
  });
}
