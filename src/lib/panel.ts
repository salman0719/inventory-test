import { z } from "zod";

/**
 * The request every panel endpoint accepts.
 *
 * A row click asks for one panel's data instead of re-rendering the page, so this is
 * a server boundary: the mode and the id are validated here, and the business is
 * never part of the request — each endpoint resolves it from the session and the
 * active-business cookie, so an id from another tenant does not resolve.
 */
export const panelRequestSchema = z.object({
  mode: z.enum(["create", "edit", "detail"]),
  id: z.string().trim().max(64).default(""),
  // `z.coerce.boolean()` would read the string "false" as true.
  saved: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((value) => value === "true"),
});

export type PanelRequest = z.infer<typeof panelRequestSchema>;
