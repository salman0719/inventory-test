# 0010 — Phone filters: search inline, the rest in a sheet

Status: accepted 2026-11-23. Prototype: `local/prototypes/mobile/filters/index.html`
(chosen frame 2); the integrated frame is in `local/prototypes/mobile/combined`.

## DF1 — Search keeps the row, everything else moves into a sheet

The inline bar is three rows — search, category and sort, then the archived
toggle and Apply — about 200px on every visit, unfiltered or not, so the first
record starts roughly a third of the way down a 390×844 screen.

Chosen: the search field keeps a row of its own, a **Filters** button opens the
rest of the fields in a bottom sheet with Clear and Apply filters. Measured on
the running app at 390×844, the bar is 44px and the first product card starts at
188px instead of below a three-row bar.

The alternative — keeping everything inline but collapsing it — was rejected in
the prototype because it still spends a third of the screen on controls nobody
has touched yet.

## DF2 — Active filters stay visible as chips

Every sheet filter that is on becomes a chip above the list — category, sort,
stock status, order status, include archived. Each chip is a link to the current
view without that filter, so removing one is a navigation the router already
knows how to do: the URL stays the only state, Back restores the filter, and the
rows become skeletons in place like any other list change. The search term is
not a chip; it is already visible in its field.

The Filters button carries the count of chips, so "2 filters are on" is readable
without opening anything. Inventory also reports status in the list header, so
the chip and the summary never disagree.

## DF3 — One form per breakpoint, one set of fields

Below 600px `MobileFilters` renders a form containing the search row, the chips
and the sheet; from 600px up the unchanged `FilterForm` renders the inline bar.
Both are in the DOM — CSS hides one — each with its own `FormData`, so the sheet's
fields and the search travel together and the hidden bar's fields cannot leak
into the submission. The field markup itself is written once per screen and
passed to both, with `min-[600px]:contents` on its wrapper so it is a column in
the sheet and inline siblings in the bar.

Consequences worth knowing:

- Apply resets paging, because `page` is still not a form field.
- Search still applies on submit (Enter or Apply filters), exactly as the inline
  bar always has. There is no as-you-type debounce yet; the prototype's note
  about keeping one describes an intention, not this implementation.
- Fields are 44px in the sheet and stay 36px in the desktop bar, matching the
  existing touch pass.

## DF4 — The filter sheet is the same sheet as More, except for `inert`

The motion is the navigation sheet's: `translateY(105%)` → `0` over 220ms on the
CSS `ease` curve, the scrim fading over 180ms, `overflow-clip` on the overlay and
`focus({ preventScroll: true })` so the sheet is not scrolled into view mid-slide.
It is a `role="dialog"` with `aria-modal`, takes focus, keeps Tab inside, closes on
Escape, scrim and Close, locks document scrolling, and returns focus to the
Filters button when it closes or applies. `useModalSheet` holds that behaviour for
both sheets.

The difference: the filter sheet sits inside the form it submits, which is inside
the content column. Marking that column `inert` would take the sheet with it, so
the filters sheet relies on `aria-modal`, the Tab trap and the scroll lock, while
the More sheet — rendered outside the column — also makes the page inert.

## DF5 — The controls follow the URL, not just its first value

The fields are uncontrolled so the same markup can render in the sheet and in the
bar, and that alone is not enough: after a chip removed a category, the sheet's
select kept showing the removed category, and Apply would have put it back; Clear
left the cleared term in the search field. So each screen's field wrapper is keyed
by the values the URL carries, which remounts the controls at the new values when
the change came from somewhere else — a chip, Clear, Back — and the search box is
controlled by its URL term with the same key. Typing stays local, so the field
does not fight the cursor.

## Not done here

- As-you-type search with a debounce.
- Reports filters: they are status pills beside a report, not this bar.
- A sticky filter row that stays while the list scrolls.
