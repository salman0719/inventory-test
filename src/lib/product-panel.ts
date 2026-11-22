import { z } from "zod";
import type {
  CategoryOption,
  ProductSummary,
  SupplierOption,
} from "./products";

/**
 * The product panel's data contract.
 *
 * A row click used to change `?product=` and re-render the whole route, which meant
 * the list, the categories and the suppliers were all fetched again to open one
 * panel. The panel now asks its own endpoint for exactly what it shows, and the
 * page render stays untouched.
 *
 * The business is never in the request: the endpoint resolves it from the session
 * and the active-business cookie, so a product id from another tenant simply does
 * not resolve.
 */
export const panelRequestSchema = z.object({
  mode: z.enum(["create", "edit", "detail"]),
  product: z.string().trim().max(64).default(""),
  // `z.coerce.boolean()` would read the string "false" as true.
  saved: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((value) => value === "true"),
});

export type PanelRequest = z.infer<typeof panelRequestSchema>;

export type ProductPanelPayload = {
  mode: PanelRequest["mode"];
  /** `null` when the product is not in this business, or was never found. */
  product: ProductSummary | null;
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  currency: string;
  canViewValues: boolean;
  saved: boolean;
};
