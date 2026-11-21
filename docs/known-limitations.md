# Known Limitations and Risks

Record limitations honestly. Include severity, workaround, and whether the issue blocks customer demonstrations.

| Limitation or risk | Severity | Workaround | Blocks demo? | Status |
| ------------------ | -------- | ---------- | ------------ | ------ |
| Not yet assessed   |          |            |              |        |

## Recorded risks after Gate A

- **Cafe depth (high).** No recipes or POS depletion, so the cafe demo covers
  purchasing, receiving, wastage and count correction only. The walkthrough must
  state that rather than imply usage tracking.
- **Mobile receiving (medium).** Receiving and wastage happen on a phone; a
  desktop-only form fails the staff persona and the demo.
- **Partial receiving correctness (high).** Double-counting stock is the classic
  defect; receiving must be one atomic transaction with tests.
- **Single-PO model (low).** Users of split-PO tools may expect suffixed orders;
  outstanding quantities must be labelled plainly.
- **No validation yet (high).** Personas are hypotheses until Phase 7.

## Risks to actively monitor

- Stock ledger and cached quantity becoming inconsistent.
- Partial receiving creating duplicate stock movements.
- Cross-business data exposure due to missing or weak RLS.
- Demo reset deleting the wrong business data.
- UI controls that look functional but are not connected to real operations.
- Seed data that does not support a believable demonstration.
- Excessive scope expansion into ERP functionality.
- Third-party service costs or account changes made without approval.

## Slice 1 (app shell) — 2026-11-21

| Limitation or risk                                                                              | Severity | Workaround                                                                                   | Blocks demo?                                          | Status                                                  |
| ----------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Shell reads the local **owner** connection, not `app_user`, because authentication is not built | high     | Local compose data only; hosted falls back to `DATABASE_URL_APP`                             | No for layout review; yes before any real tenant data | Temporary, replaced with the authenticated request path |
| Hosted stage shows no businesses                                                                | medium   | Expected: `app_user` has no `auth.uid()` claims, so RLS returns nothing until sign-in exists | No, the shell still renders                           | Until authentication                                    |
| Dashboard figures are placeholders                                                              | low      | Labelled by slice; no invented numbers                                                       | No                                                    | Until slice 8                                           |
| Sections other than Settings have no data                                                       | low      | Empty states say what arrives and when                                                       | No                                                    | Intentional                                             |
| Global search from the Direction C prototype is absent                                          | low      | Not rendered, rather than rendered dead                                                      | No                                                    | Deferred to the search slice                            |
| Rail abbreviates labels (Dash, Supp, POs) at 600px+                                             | low      | Full labels below 600px; screen readers hear the full name                                   | No                                                    | Review legibility during the layout review              |
