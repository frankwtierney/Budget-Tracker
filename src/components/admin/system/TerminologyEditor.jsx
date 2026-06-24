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

const TIER_HELP = {
  department: 'The top tier. Fiscal years and org-wide settings live here.',
  area: 'The middle tier, grouping the leaf tier below it.',
  building: 'The leaf tier — where budgets and allocations are tracked.',
  complex: 'An optional operational grouping of leaf-tier nodes.',
};

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
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Tier</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Singular</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Plural</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {TIER_KEYS.map((key) => (
              <tr key={key} className="align-top">
                <td className="px-4 py-3">
                  <div className="text-gray-700 font-medium capitalize">{key}</div>
                  <div className="text-xs text-gray-400">{TIER_HELP[key]}</div>
                </td>
                <td className="px-4 py-3">
                  <Input
                    id={`${key}-one`}
                    aria-label={`${key} singular label`}
                    value={draft[key].one}
                    onChange={(e) => setField(key, 'one', e.target.value)}
                    placeholder={DEFAULT_TIER_LABELS[key].one}
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    id={`${key}-many`}
                    aria-label={`${key} plural label`}
                    value={draft[key].many}
                    onChange={(e) => setField(key, 'many', e.target.value)}
                    placeholder={DEFAULT_TIER_LABELS[key].many}
                  />
                </td>
              </tr>
            ))}
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
