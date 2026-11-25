import type { PanelRequest } from "./panel";
import type {
  CategoryOption,
  ProductPriceHistory,
  ProductSupplierLink,
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
 * not resolve. The request shape itself is shared in `lib/panel.ts`.
 */
export type ProductPanelPayload = {
  mode: PanelRequest["mode"];
  /** `null` when the product is not in this business, or was never found. */
  product: ProductSummary | null;
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  /** Active supplier links, default first; empty unless the detail view. */
  links: ProductSupplierLink[];
  /** What was paid, from receipts; empty for a create form or a viewer. */
  price: ProductPriceHistory;
  currency: string;
  canViewValues: boolean;
  saved: boolean;
};
