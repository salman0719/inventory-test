# 0011 — Phone detail panel: the sheet with a pinned head and pinned actions

Status: accepted 2026-11-23. Prototype: `local/prototypes/mobile/panel/index.html`
(chosen frame 2).

## DF1 — Below 900px the panel is the sheet; above it, the unchanged column

The split view starts at 900px, and the panel was an overlay page everywhere
else: it covered the list, its Close link sat in the header, and its actions were
the last thing in the scroll. The chosen sheet keeps the record's identity and
its buttons within reach of a thumb.

One DOM tree serves both: the same wrapper is `fixed inset-x-0 bottom-0` below
900px and `static … col-start-2 row-start-1 sticky top-3` above it. A second tree
would duplicate every form, link, id and server action in the panel, and the
panels are not small.

Measured on the dev server at 390×844 with a stock row open: the sheet is 540px
tall (304–844) because its content is shorter than the cap, `max-height` reads
725.84px at 844 and 447.2px at a 520px viewport. At 1280×900 the same panel is
`position: sticky`, 360px wide at left 888, with no dialog role and no scrim.

## DF2 — `PanelFrame`: pinned head, scrolling body, pinned footer

Product, supplier and inventory panels now pass their header into `PanelFrame`
and move their action row — Edit and Archive/Restore, or "Open in catalogue" —
into its footer. The footer pads for `env(safe-area-inset-bottom)`, so the
buttons sit above the home indicator rather than under it.

Purchase orders are the exception: Order, Cancel and the receive form stay in
the scrolling body. The receive form is long, its submit belongs beside the
quantities it submits, and pinning it would put a form in a strip. That panel
gets the pinned head only; a pinned receive footer is deferred.

Measured at 390×520, where the inventory panel must scroll: body 405px of content
in 312px of space, scrolled to 93, the head stayed at 86–147 and the footer at
459–520 — pinned to the sheet's edges while the details moved. At 844 the
inventory footer's bottom edge is 844.

## DF3 — The dialog semantics belong to the sheet, not to the layout

`useCompact` reads `(max-width: 899px)` through `useSyncExternalStore`; only when
it is true does the wrapper get `role="dialog"`, `aria-modal`, a tab stop and the
`useModalSheet` keyboard handling. The desktop column stays a region: a list
beside a modal that never closes would be unusable.

The panel calls `useModalSheet(..., { inertPage: false })` because it renders
inside `#app-content`; inerting that column would inert the sheet with it, so the
sheet relies on `aria-modal`, the Tab trap and the scroll lock, exactly as the
filter sheet does (0010).

Focus is captured before the sheet's own focus effect — the capture hook is
declared first — so closing returns it to the row link that opened the panel.
Measured at 390×844: opening puts focus inside the dialog and sets both scroll
locks; Escape clears the row from the URL and leaves focus on
`/inventory?product=…`, the row that was clicked. Focus goes back as the sheet
starts leaving, not when it is removed 220ms later (DF5): by then the sheet is
`inert` and cannot hold focus.

## DF4 — The sheet covers the tab bar, reversing 0009

`0009-mobile-navigation.md` said an open panel stops at the top of the tab bar
(commit `30a4fe3`), so the phone's primary navigation stayed tappable under every
open row. The chosen sheet covers the bar instead: it is a modal with three exits
— Close, the scrim and Escape — and it stops 56px short of the bottom only to
spend that space on nothing, since the bar behind a scrim cannot be used anyway.

Measured at 390×844: `elementFromPoint(195, 830)` after opening returns an
element inside the dialog.

Accepted cost: while a row is open, changing tabs is Close (or a scrim tap) and
then the tab. That is the same number of taps as reaching a bar that is no longer
visible, and it is the behaviour the chosen frame shows.

## DF5 — It slides both ways, the way the More sheet does

`.panel-sheet` rises on mount with the `sheet-up` keyframe — 220ms on
`cubic-bezier(.25, .1, .25, 1)`, only below 900px and not under
`prefers-reduced-motion` — and now slides back down on close.

The exit needed a decision, because closing is a `replaceState` that removes the
row from the URL and `PanelGrid` stops rendering the panel: there was no element
left to animate out. The grid now holds the panel for `SHEET_EXIT_MS` (220ms) and
removes it after that, which is the same reason the More sheet keeps its overlay
mounted while closed (0009). Above 900px the column has no motion, so it still
leaves in the frame that closes it and the list takes the full width at once.

`detail-panel.tsx` reads `open` from the same URL the grid reads, so a panel on
its way out renders the closed state: `translate-y-[105%]` below 900px
transitioned on the More sheet's curve, the scrim fading over 180ms, and both
`inert` and `aria-hidden`, so the leaving sheet is already out of the tab order
and the accessibility tree. Reopening inside those 220ms transitions it back up
rather than remounting it.

The movement itself was not sampled frame by frame in a browser this session.
What was checked: the built stylesheet carries the closed `translate` (105%),
`transition-transform` covers the `translate` property that Tailwind 4's
`translate-y-*` sets, `duration-[220ms]` is emitted, and `motion-reduce` plus the
existing `prefers-reduced-motion` rule remove it; jsdom (`tests/unit/detail-panel.test.ts`)
shows the closed sheet still mounted, `inert`, `aria-hidden` and translated, with
focus already back on the row, and gone after 260ms — and, above 900px, gone in
the frame that closes it.

## Consequences worth knowing

- `PanelLoader`'s skeleton drops its border and rounding below 900px, because the
  sheet already provides them.
- The four panels share one frame, so the pinned layout is fixed in one place
  rather than four.
- `tests/unit/detail-panel.test.ts` covers the dialog on a compact stub, Escape
  with focus return and the 220ms closed state, the desktop column staying a
  region, and the column leaving the grid at once.
- `useCompact` lives in `src/components/use-compact.ts` because the grid and the
  panel both read it: one decides whether there is an exit to wait for, the other
  whether there is a dialog to animate.

## Not done here

- A pinned receive footer for purchase orders.
- Swipe-down to dismiss.
- A real-device run; the measurements are desktop Chromium at 390×844, 390×520
  and 1280×900 with a zero safe-area inset.
