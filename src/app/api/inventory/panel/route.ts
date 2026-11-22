import { getActiveBusiness } from "@/lib/businesses";
import type { InventoryPanelPayload } from "@/lib/inventory-panel";
import { panelRequestSchema } from "@/lib/panel";
import { getSessionUser } from "@/lib/session";
import { getInventoryDetail } from "@/lib/stock";

/**
 * One stock panel, as JSON, for a row click that must not re-render the list.
 * The business comes from the session and the active-business cookie.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in to open stock." }, { status: 401 });
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
    mode: "detail",
    id: params.get("product") ?? "",
    saved: params.get("saved") ?? "false",
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Unsupported panel request." },
      { status: 400 },
    );
  }

  const detail = parsed.data.id
    ? await getInventoryDetail(user.id, active.id, parsed.data.id)
    : null;

  const payload: InventoryPanelPayload = {
    item: detail?.item ?? null,
    movements: detail?.movements ?? [],
    currency: active.currencyCode,
    canViewValues: active.role !== "viewer",
    saved: parsed.data.saved,
  };

  return Response.json(payload, {
    headers: { "cache-control": "private, no-store" },
  });
}
