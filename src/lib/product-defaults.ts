/**
 * A new product's starting values. Kept out of the client form module because a
 * Server Component cannot read a value exported from a `"use client"` file.
 */
export type ProductDefaults = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unitOfMeasure: string;
  costPrice: string;
  sellingPrice: string | null;
  reorderLevel: string;
  targetStockLevel: string | null;
  description: string | null;
  categoryId: string | null;
};

export const EMPTY_PRODUCT: ProductDefaults = {
  id: "",
  name: "",
  sku: "",
  barcode: "",
  unitOfMeasure: "ea",
  costPrice: "0.00",
  sellingPrice: "",
  reorderLevel: "0",
  targetStockLevel: "",
  description: "",
  categoryId: "",
};
