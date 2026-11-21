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
