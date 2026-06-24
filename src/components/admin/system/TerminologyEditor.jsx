import { useState, useEffect, useMemo } from 'react';
import { useSystem } from '../../../contexts/SystemContext';
import { updateDocument } from '../../../lib/firestore';
import { TIER_KEYS, DEFAULT_TIER_LABELS, normalizeTierLabels } from '../../../lib/terminology';
import Button from '../../shared/Button';
import Input from '../../shared/Input';

// System → Terminology tab (Super Admin only). Renames the structure tiers
// platform-wide by writing tierLabels onto system/config. The nesting shape is
// fixed; only the display names change. See lib/terminology.js.

const SYSTEM_DOC_PATH = 'system/config';

// Neutral, org-agnostic structural identity for each tier — shown in the left
// column so a row never depends on the (renameable) labels themselves.
const TIER_META = {
  department: {
    title: 'Tier 1 — Top',
    desc: 'The organization-level container. Fiscal years and org-wide settings live here.',
  },
  area: {
    title: 'Tier 2 — Middle',
    desc: 'Groups the leaf tier beneath it.',
  },
  building: {
    title: 'Tier 3 — Leaf',
    desc: 'The bottom level — where budgets and transactions are tracked. “Leaf” = a node with nothing nested under it.',
  },
  complex: {
    title: 'Optional grouping',
    desc: 'An optional cluster of leaf-tier nodes that run as one unit (e.g. several buildings sharing staff). Each member keeps its own budget.',
  },
};

// The three required nesting tiers, top → leaf. Complex is rendered separately
// below them because it's an overlay, not a level in the chain.
const NESTING_KEYS = ['department', 'area', 'building'];

export default function TerminologyEditor() {
  const { systemDoc } = useSystem();
  const saved = useMemo(() => normalizeTierLabels(systemDoc), [systemDoc]);

  const [draft, setDraft] = useState(saved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setDraft(saved);
    setError('');
  }, [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function setField(key, form, value) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [form]: value } }));
  }

  async function handleSave() {
    // Empty fields fall back to defaults at read time, so trimming blanks here
    // keeps the stored doc clean without losing the label.
    for (const key of TIER_KEYS) {
      if (!draft[key].one.trim() || !draft[key].many.trim()) {
        return setError('Every tier needs both a singular and plural label.');
      }
    }
    setLoading(true);
    setError('');
    try {
      const tierLabels = {};
      for (const key of TIER_KEYS) {
        tierLabels[key] = { one: draft[key].one.trim(), many: draft[key].many.trim() };
      }
      await updateDocument(SYSTEM_DOC_PATH, { tierLabels });
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    } catch (err) {
      console.error(err);
      setError(`Failed to save: ${err.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setDraft(saved);
    setError('');
  }

  function handleRestoreDefaults() {
    setDraft(structuredClone(DEFAULT_TIER_LABELS));
  }

  function renderRow(key) {
    return (
      <tr key={key} className="align-top">
        <td className="px-4 py-3">
          <div className="text-gray-700 font-medium">{TIER_META[key].title}</div>
          <div className="text-xs text-gray-400">{TIER_META[key].desc}</div>
        </td>
        <td className="px-4 py-3">
          <Input
            id={`${key}-one`}
            aria-label={`${TIER_META[key].title} singular label`}
            value={draft[key].one}
            onChange={(e) => setField(key, 'one', e.target.value)}
            placeholder={DEFAULT_TIER_LABELS[key].one}
          />
        </td>
        <td className="px-4 py-3">
          <Input
            id={`${key}-many`}
            aria-label={`${TIER_META[key].title} plural label`}
            value={draft[key].many}
            onChange={(e) => setField(key, 'many', e.target.value)}
            placeholder={DEFAULT_TIER_LABELS[key].many}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Terminology</h2>
        <p className="text-sm text-gray-500">
          What the organization tiers are called throughout the app. The
          structure itself doesn't change — only the labels. Use this to match
          your org's language (e.g. rename “Area” to “Marketing Team”).
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Structure tier</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Singular</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Plural</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {NESTING_KEYS.map(renderRow)}
            <tr className="bg-gray-50/60">
              <td colSpan={3} className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Optional grouping — sits beside the nesting tiers, not inside it
              </td>
            </tr>
            {renderRow('complex')}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={loading} disabled={!dirty}>
          Save changes
        </Button>
        {dirty && (
          <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">
            Discard
          </button>
        )}
        <button
          onClick={handleRestoreDefaults}
          className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
        >
          Restore defaults
        </button>
        {flash && !dirty && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </div>
  );
}
