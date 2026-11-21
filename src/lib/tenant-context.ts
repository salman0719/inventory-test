import { z } from "zod";

export const tenantContextSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  role: z.string().min(1),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;
