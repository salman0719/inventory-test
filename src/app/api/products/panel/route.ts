import { getActiveBusiness } from "@/lib/businesses";
import { panelRequestSchema } from "@/lib/panel";
import type { ProductPanelPayload } from "@/lib/product-panel";
import { getProductPanel } from "@/lib/products";
import { getSessionUser } from "@/lib/session";

/**
 * One product panel, as JSON.
 *
 * A row click reads this instead of navigating, so opening a panel no longer
 * re-renders the page and re-runs the list query. The business comes from the
 * session and the active-business cookie, never from the query string.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to open products." },
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
    id: params.get("product") ?? "",
    saved: params.get("saved") ?? "false",
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Unsupported panel request." },
      { status: 400 },
    );
  }

  const { mode, id: productId, saved } = parsed.data;
  const canViewValues = active.role !== "viewer";

  const { product, categories, suppliers } = await getProductPanel(
    user.id,
    active.id,
    { mode, productId },
  );

  const payload: ProductPanelPayload = {
    mode,
    product,
    categories,
    suppliers,
    currency: active.currencyCode,
    canViewValues,
    saved: saved && mode !== "edit",
  };

  return Response.json(payload, {
    headers: { "cache-control": "private, no-store" },
  });
}
