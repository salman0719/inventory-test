import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "Stk — inventory" };

/**
 * Document shell only. The application chrome lives in `(app)/layout.tsx`, so the
 * sign-in route can render without requiring a business or a session.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-ink">{children}</body>
    </html>
  );
}
