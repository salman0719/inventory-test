# 0009 Mobile navigation: bottom tabs and the header wordmark

- **Date:** 2026-11-23
- **Status:** Accepted
- **Context:** Direction C's primary navigation is a labelled dark rail from 600px
  up and, below 600px, a horizontal labelled strip. Measured on the running app at
  390×844, the strip's content was 541px in a 338px box: 203px was off-screen, so
  Purchase orders, Reports and Settings could not be reached without guessing that
  the strip scrolled, and on `/settings` the active item itself was hidden. The
  phone layouts were explored in `local/prototypes/mobile/` (unversioned), which
  is where the options and their measured costs live.
- **Decision:** Below 600px, replace the strip with a fixed bottom tab bar on the
  rail colour — Dashboard, Products, Stock, More — and move the four remaining
  screens into a More sheet. Put the wordmark in the header as the home link. The
  desktop rail is unchanged.
- **Supersedes:** the below-600px half of `0006-gate-b-design.md` (DC1's rail
  applies from 600px up, as before). Nothing above 600px changes.

## DC1 — Four tabs, three destinations and More

- Dashboard, Products and Inventory stay one tap away; Suppliers, Purchase orders,
  Reports and Settings are one tap into More, then one tap to the section.
- The bar keeps 44px-plus targets: each tab is 52px tall and, at 390px wide,
  94px across (measured).
- More is marked current (`aria-current="true"`) while any of its four sections is
  open, so the bar never claims no section at all.
- The alternative — a hamburger drawer holding all seven — was rejected because
  every change of section becomes two taps and the current section is the only
  clue about where you are.

## DC2 — The bar takes the rail colour, not the accent

- `--rail` (#0f172a) is already the app's chrome, so the bar reads as chrome and the
  phone and the desktop share one identity rather than stacking two white toolbars.
- The accent (#4338ca) is **2.3:1** against the rail, below the 3:1 a meaningful
  indicator needs, so it cannot be the active cue. The active tab repeats the
  desktop rail's own treatment instead: `--rail-active` (#1e293b) behind
  `--accent-soft` (#eef2ff) icon and label, which is **13.1:1**. Inactive labels
  are `--rail-ink` at **12:1**. For reference, the accent on `--surface` is 7.9:1,
  which is why the light-bar fallback in the prototype also works — it was simply
  the less coherent of the two.
- No new tokens were added.

## DC3 — The wordmark moves into the header

- The desktop rail carries "Stk" at the top. Below 600px the rail is gone, so the
  same wordmark moves to the first slot of the sticky header, 44px tall, as the
  home link — the app's only sub-44px target before this (`a 20×20` link) is gone.
- Keeping it out of the tab bar was deliberate: five things in 390px costs about
  50px of tab width, "Products" has to shrink, and a brand is not a destination.
- The repository has no image mark; the wordmark is the logo. A real mark takes the
  same slot at the same height.

## DC4 — The More sheet is a real dialog

- `role="dialog"`, `aria-modal="true"`, a labelled Close, Escape to close, Tab kept
  inside the sheet, and focus returned to the More button on close (all measured).
- The scrim is a button labelled "Close menu". Modal also means out of reach: the
  content column (`#app-content`) and the nav behind the sheet get `inert`, and
  both `html` and `body` stop scrolling until it closes. Closing returns focus to
  the More button only after that attribute is lifted, because an inert element
  cannot take focus. `tests/unit/app-nav.test.ts` covers all of it in jsdom.

## Consequences

- The content column reserves 76px plus `env(safe-area-inset-bottom)` below 600px,
  so a list's last row and its pager stay clear of the bar (measured: pager bottom
  768 against a bar top of 788 at the bottom of `/products`).
- An open detail panel stops at the top of the tab bar instead of running over
  it. The prototype's sheet covered the bar, and the implementation first copied
  that, but it hid the phone's primary navigation behind every open row; the bar
  now stays visible and tappable while the panel is open. The panel's own Close
  link and the scrim still close it.
- The card lists chosen alongside this are implemented below 600px on products,
  inventory, suppliers and purchase orders; the filter sheet and the pinned detail
  sheet are **not**, so the filter bar and the panel overlay are unchanged. The
  reports tables are also unchanged, since they are not one of the four list
  routes.
