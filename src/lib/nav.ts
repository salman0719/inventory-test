/**
 * The id the shell puts on the content column, so the phone's More sheet can make
 * everything behind it `inert` without querying for structural elements.
 *
 * It is a plain module rather than a constant in `app-nav`: a server component
 * cannot import a value from a `"use client"` module, and `app-shell` is where the
 * column is rendered.
 */
export const PAGE_CONTENT_ID = "app-content";
