import { useState, useEffect, useMemo } from 'react';
import { useSystem } from '../../../contexts/SystemContext';
import { updateDocument } from '../../../lib/firestore';
import Button from '../../shared/Button';
import Input from '../../shared/Input';

// System-level budget period names (Super Admin only). Lives on the single
// system/config doc as periods: { fixed: [p1, p2], extras: [...] }.
//   fixed  — the two primary periods, mapped to the two sides of each fiscal
//            year's split date (on/before split → period 1, after → period 2).
//            Always exactly two: renameable, not addable/removable, because the
//            split is binary (see getPeriod in SummaryView).
//   extras — additional period labels that fall outside the split, e.g. the
//            workbook's orphan Jun–Jul summer period. Add / rename / remove.
//
// NOTE: these are display labels only. Which side of the split a transaction
// lands on is driven by fiscalYear.splitDate, and the Summary view currently
// reads its own per-building settings.splitPeriodNames. Making this org-level
// list the source of truth for the Summary is a separate, follow-up task.

const SYSTEM_DOC_PATH = 'system/config';
const DEFAULT_PERIODS = { fixed: ['FALL', 'SPRING'], extras: [] };

// Coerce whatever is on the doc into a stable { fixed:[2], extras:[] } shape.
function normalize(periods) {
  const fixed = Array.isArray(periods?.fixed) ? periods.fixed : DEFAULT_PERIODS.fixed;
  const extras = Array.isArray(periods?.extras) ? periods.extras : [];
  return {
    fixed: [fixed[0] ?? DEFAULT_PERIODS.fixed[0], fixed[1] ?? DEFAULT_PERIODS.fixed[1]],
    extras: extras.filter((e) => typeof e === 'string'),
  };
}

export default function PeriodsEditor() {
  const { systemDoc } = useSystem();
  const saved = useMemo(() => normalize(systemDoc?.periods), [systemDoc?.periods]);

  // Local editable draft, re-seeded whenever the saved value changes.
  const [fixed0, setFixed0] = useState(saved.fixed[0]);
  const [fixed1, setFixed1] = useState(saved.fixed[1]);
  const [extras, setExtras] = useState(saved.extras);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setFixed0(saved.fixed[0]);
    setFixed1(saved.fixed[1]);
    setExtras(saved.extras);
    setError('');
  }, [saved]);

  // The draft we'd persist, with blanks/whitespace trimmed out of extras.
  const draft = {
    fixed: [fixed0.trim(), fixed1.trim()],
    extras: extras.map((e) => e.trim()).filter(Boolean),
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function setExtraAt(i, value) {
    setExtras((list) => list.map((e, idx) => (idx === i ? value : e)));
  }
  function removeExtraAt(i) {
    setExtras((list) => list.filter((_, idx) => idx !== i));
  }
  function addExtra() {
    setExtras((list) => [...list, '']);
  }

  async function handleSave() {
    if (!draft.fixed[0] || !draft.fixed[1]) {
      return setError('Both primary period names are required.');
    }
    setLoading(true);
    setError('');
    try {
      await updateDocument(SYSTEM_DOC_PATH, { periods: draft });
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
    setFixed0(saved.fixed[0]);
    setFixed1(saved.fixed[1]);
    setExtras(saved.extras);
    setError('');
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Periods</h2>
        <p className="text-sm text-gray-500">
          The names of the budget periods used across the organization. The two
          primary periods are the halves of each fiscal year, split at that
          year's split date. Extra periods cover anything outside that split.
        </p>
      </div>

      {/* Primary periods — always exactly two, the two sides of the FY split. */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Primary periods</h3>
          <p className="text-xs text-gray-500">
            Transactions on or before the fiscal year's split date fall in the
            first period; later ones fall in the second. Each year's split date
            is set per department in Admin → Fiscal Years.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First period (before split)"
            id="period1"
            value={fixed0}
            onChange={(e) => setFixed0(e.target.value)}
            placeholder="Fall"
          />
          <Input
            label="Second period (after split)"
            id="period2"
            value={fixed1}
            onChange={(e) => setFixed1(e.target.value)}
            placeholder="Spring"
          />
        </div>
      </div>

      {/* Extra periods — free add / rename / remove. */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Additional periods</h3>
            <p className="text-xs text-gray-500">
              Periods outside the primary split, like a Jun–Jul summer period.
            </p>
          </div>
          <Button variant="secondary" onClick={addExtra}>+ Add period</Button>
        </div>

        {extras.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No additional periods.</p>
        ) : (
          <ul className="space-y-2">
            {extras.map((value, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  id={`extra-${i}`}
                  aria-label={`Additional period ${i + 1}`}
                  value={value}
                  onChange={(e) => setExtraAt(i, e.target.value)}
                  placeholder="Summer"
                  className="flex-1"
                />
                <button
                  onClick={() => removeExtraAt(i)}
                  title="Remove period"
                  aria-label="Remove period"
                  className="text-gray-400 hover:text-red-500 p-1 rounded shrink-0"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={loading} disabled={!dirty}>
          Save changes
        </Button>
        {dirty && (
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Discard
          </button>
        )}
        {flash && !dirty && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </div>
  );
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
