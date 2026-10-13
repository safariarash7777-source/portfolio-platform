export type FinancialEditorKind = "holdings" | "debts";

// One page-local lease. Synchronous ownership also rejects callbacks captured
// before React has rendered the sibling's disabled controls.
export function createFinancialEditor(onChange: () => void = () => {}) {
  let active: FinancialEditorKind | null = null;
  let navigating = false;
  return {
    get active() { return active; },
    get navigating() { return navigating; },
    acquire(kind: FinancialEditorKind) {
      if (navigating || active !== null && active !== kind) return false;
      if (active === null) { active = kind; onChange(); }
      return true;
    },
    release(kind: FinancialEditorKind) {
      if (navigating || active !== kind) return;
      active = null; onChange();
    },
    navigate(kind: FinancialEditorKind) {
      if (active !== kind || navigating) return false;
      navigating = true; onChange(); return true;
    },
  };
}
export type FinancialEditor = ReturnType<typeof createFinancialEditor>;
