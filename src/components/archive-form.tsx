"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Archive and restore submit, then drop the one-shot `saved` flag from the URL.
 *
 * The "saved" notice is URL state (`?saved=true` from the last save). An archive
 * or restore leaves that flag in place, so the notice kept sitting over the new
 * archived state. Clearing it here keeps the rest of the view — filters, page,
 * open panel — exactly as the operator left it.
 */
export function ArchiveForm({
  action,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  async function submit(formData: FormData) {
    await action(formData);

    const next = new URLSearchParams(searchParams.toString());
    if (!next.has("saved")) return;
    next.delete("saved");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return <form action={submit}>{children}</form>;
}
