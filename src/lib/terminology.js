// SA-editable display labels for the org-structure tiers. Lives on the single
// system/config doc under `tierLabels`. The structure SHAPE (a 3-level nesting
// plus an operational grouping) is fixed in code and rules; only the human
// names are configurable, so e.g. "Area" can read as "Marketing Team" without
// touching any data, collection path, or rule.
//
// The keys below are stable internal identifiers — never rename them. Only the
// { one, many } display strings change.

import { useSystem } from '../contexts/SystemContext';

export const TIER_KEYS = ['department', 'area', 'building', 'complex'];

export const DEFAULT_TIER_LABELS = {
  department: { one: 'Department', many: 'Departments' },
  area: { one: 'Area', many: 'Areas' },
  building: { one: 'Building', many: 'Buildings' },
  complex: { one: 'Complex', many: 'Complexes' },
};

// Coerce whatever is on the doc into a complete { tier: {one, many} } map,
// falling back to defaults for any blank/missing label.
export function normalizeTierLabels(systemDoc) {
  const saved = systemDoc?.tierLabels ?? {};
  const out = {};
  for (const key of TIER_KEYS) {
    out[key] = {
      one: saved[key]?.one?.trim() || DEFAULT_TIER_LABELS[key].one,
      many: saved[key]?.many?.trim() || DEFAULT_TIER_LABELS[key].many,
    };
  }
  return out;
}

// Hook for components: `const term = useTerm()` then `term.area.one`.
export function useTerm() {
  const { systemDoc } = useSystem();
  return normalizeTierLabels(systemDoc);
}
