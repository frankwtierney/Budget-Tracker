import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  subscribeToDocument,
  setDocument,
  serverTimestamp,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency } from '../../lib/format';
import Button from '../shared/Button';

// Per-building, per-fiscal-year dollar allocations against the shared
// department-level category schema. Stored as a single doc:
//   /buildings/{bid}/allocations/{fyId}
//   { byCategory: { [catId]: number }, totalBudget?: number }
// totalBudget is the FY budget the building was handed; the % column and
// variance tile derive from it. Optional — if unset, the editor degrades
// gracefully to "running total only" (the original behavior).
// Sub-categories are tracked for spend analytics but don't get their own caps.

export default function AllocationEditor({ building }) {
  const { user } = useAuth();
  const { activeDepartment, fiscalYear } = useOrg();

  const [categories, setCategories] = useState([]);
  const [allocDoc, setAllocDoc] = useState(null);
  const [draft, setDraft] = useState({}); // { catId: '12.34' }
  const [totalBudgetDraft, setTotalBudgetDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  const deptId = activeDepartment?.id;
  const buildingId = building?.id;
  const fyId = fiscalYear?.id;

  useEffect(() => {
    if (!deptId) return;
    const unsub = subscribeToCollection(
      `departments/${deptId}/categories`,
      setCategories,
      orderBy('order', 'asc')
    );
    return unsub;
  }, [deptId]);

  useEffect(() => {
    if (!buildingId || !fyId) return;
    const unsub = subscribeToDocument(
      `buildings/${buildingId}/allocations/${fyId}`,
      (doc) => {
        setAllocDoc(doc);
        setLoading(false);
        setError('');
      },
      (err) => {
        setLoading(false);
        if (err?.code === 'permission-denied') {
          setError(
            "Can't load allocations — Firestore rules don't allow reads at /buildings/{id}/allocations/{fyId}. " +
            'Run npm run deploy:rules to push the latest rules.'
          );
        } else {
          setError(`Failed to load allocations: ${err?.message ?? 'unknown error'}`);
        }
      }
    );
    return unsub;
  }, [buildingId, fyId]);

  // Reset draft from doc whenever doc changes. Handles both old shape
  // (byCategory[catId][subId]) by summing, and new shape (byCategory[catId]).
  useEffect(() => {
    const map = allocDoc?.byCategory ?? {};
    const next = {};
    for (const cat of categories) {
      const stored = map[cat.id];
      if (typeof stored === 'number') {
        next[cat.id] = String(stored);
      } else if (stored && typeof stored === 'object') {
        // Legacy per-sub allocation shape — sum it as the migration default
        const sum = Object.values(stored).reduce((s, v) => s + (Number(v) || 0), 0);
        next[cat.id] = sum > 0 ? String(sum) : '';
      } else {
        next[cat.id] = '';
      }
    }
    setDraft(next);
    setTotalBudgetDraft(
      typeof allocDoc?.totalBudget === 'number' ? String(allocDoc.totalBudget) : ''
    );
  }, [allocDoc, categories]);

  function setAmount(catId, value) {
    setDraft((d) => ({ ...d, [catId]: value }));
  }

  const grandTotal = useMemo(() => {
    let total = 0;
    for (const cat of categories) {
      const v = parseFloat(draft[cat.id]);
      if (!isNaN(v)) total += v;
    }
    return total;
  }, [draft, categories]);

  const totalBudget = parseFloat(totalBudgetDraft);
  const hasTotalBudget = !isNaN(totalBudget) && totalBudget > 0;
  const remaining = hasTotalBudget ? totalBudget - grandTotal : 0;
  const overBudget = hasTotalBudget && remaining < 0;

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const byCategory = {};
      for (const cat of categories) {
        const raw = draft[cat.id];
        const num = parseFloat(raw);
        byCategory[cat.id] = isNaN(num) || num < 0 ? 0 : num;
      }
      const totalNum = parseFloat(totalBudgetDraft);
      await setDocument(`buildings/${buildingId}/allocations/${fyId}`, {
        fiscalYearId: fyId,
        byCategory,
        totalBudget: isNaN(totalNum) || totalNum < 0 ? null : totalNum,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      setSavedAt(new Date());
    } catch (err) {
      console.error(err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!building) {
    return (
      <p className="text-gray-400">
        Select a building from the header to edit allocations.
      </p>
    );
  }

  if (!fiscalYear) {
    return <p className="text-gray-400">No active fiscal year found.</p>;
  }

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
        <p className="text-gray-400">No categories defined yet.</p>
        <p className="text-sm text-gray-400 mt-1">
          Go to Categories to add them, then come back to set allocations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Allocations</h2>
          <p className="text-sm text-gray-500">
            {building.name} · {fiscalYear.label}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !saving && (
            <span className="text-xs text-gray-400">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          <Button onClick={handleSave} loading={saving} disabled={saving}>
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-2">
          <label htmlFor="totalBudget" className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Budget
          </label>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-gray-400 text-base">$</span>
            <input
              id="totalBudget"
              type="number"
              min="0"
              step="0.01"
              value={totalBudgetDraft}
              onChange={(e) => setTotalBudgetDraft(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-lg font-semibold text-gray-900 focus:outline-none"
            />
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Allocated</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(grandTotal)}</div>
        </div>
        <div
          className={`border rounded-md px-4 py-2 ${
            overBudget
              ? 'bg-red-50 border-red-200'
              : hasTotalBudget && remaining === 0
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {overBudget ? 'Over Budget' : 'Remaining'}
          </div>
          <div
            className={`mt-1 text-lg font-semibold ${
              overBudget ? 'text-red-700' : hasTotalBudget && remaining === 0 ? 'text-green-700' : 'text-gray-900'
            }`}
          >
            {hasTotalBudget ? formatCurrency(Math.abs(remaining)) : '—'}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">
                Category
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase w-48">
                Allocation ($)
              </th>
              {hasTotalBudget && (
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase w-24">
                  % of Total
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((cat) => {
              const raw = parseFloat(draft[cat.id]);
              const amount = isNaN(raw) ? 0 : raw;
              const pct = hasTotalBudget && amount > 0
                ? (amount / totalBudget) * 100
                : 0;
              return (
                <tr key={cat.id}>
                  <td className="px-4 py-3 font-medium text-gray-800">{cat.name}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft[cat.id] ?? ''}
                      onChange={(e) => setAmount(cat.id, e.target.value)}
                      placeholder="0.00"
                      className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  {hasTotalBudget && (
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {amount > 0 ? `${pct.toFixed(1)}%` : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
