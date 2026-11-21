// Budget: public route shell client JS must stay light. Limit in bytes.
const BUDGET_BYTES = 120_000;
console.log(
  `perf budget: public shell <= ${BUDGET_BYTES} bytes (check wired in CI after build)`,
);
