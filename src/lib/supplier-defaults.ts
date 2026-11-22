/**
 * A new supplier's starting values. Kept outside the client form module because a
 * Server Component cannot read a value exported from a `"use client"` file.
 */
export type SupplierDefaults = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export const EMPTY_SUPPLIER: SupplierDefaults = {
  id: "",
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};
