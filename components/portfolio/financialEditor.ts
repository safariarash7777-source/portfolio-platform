export type FinancialEditorKind = "holdings" | "debts" | "scope";

// One page-local lease. Synchronous ownership also rejects callbacks captured
// before React has rendered the sibling's disabled controls.
export function createFinancialEditor(onChange: () => void = () => {}) {
  let active: FinancialEditorKind | null = null;
  let navigating = false;
  let receipt: string | null = null;
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
    navigate(kind: FinancialEditorKind, target: string | null = null) {
      if (active !== kind || navigating) return false;
      navigating = true; receipt = target; onChange(); return true;
    },
    settle(kind: FinancialEditorKind, target: string | null) {
      if (active !== kind || !navigating || receipt !== target) return false;
      navigating = false; active = null; receipt = null; onChange();
      return true;
    },
  };
}
export type FinancialEditor = ReturnType<typeof createFinancialEditor>;
