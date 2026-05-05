import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToCollection,
  addDocument,
  getBatch,
  batchUpdate,
  batchSet,
  serverTimestamp,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency, formatDate } from '../../lib/format';
import Button from '../shared/Button';

export default function ReconciliationView({ building, fiscalYear }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('open');
  const [transactions, setTransactions] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [cycleLabel, setCycleLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;

    const unsubTx = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      (docs) => { setTransactions(docs); setLoading(false); },
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('receiptDate', 'asc')
    );
    const unsubCycles = subscribeToCollection(
      `buildings/${building.id}/reconciliationCycles`,
      setCycles,
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('createdAt', 'desc')
    );
    const unsubVendors = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      setVendors
    );
    const unsubCats = subscribeToCollection(
      `buildings/${building.id}/categories`,
      setCategories,
      where('fiscalYearId', '==', fiscalYear.id)
    );

    return () => { unsubTx(); unsubCycles(); unsubVendors(); unsubCats(); };
  }, [building?.id, fiscalYear?.id]);

  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));

  function getCategoryLabel(tx) {
    const cat = categories.find((c) => c.id === tx.categoryId);
    if (!cat) return '—';
    const sub = cat.subCategories?.find((s) => s.id === tx.subCategoryId);
    return sub ? `${cat.name} / ${sub.name}` : cat.name;
  }

  const openTx = transactions.filter((t) => t.reconciliationStatus === 'open');
  const reconciledTx = transactions.filter((t) => t.reconciliationStatus === 'reconciled');

  function toggleAll() {
    if (selected.size === openTx.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(openTx.map((t) => t.id)));
    }
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedTotal = openTx
    .filter((t) => selected.has(t.id))
    .reduce((s, t) => s + (t.cost ?? 0), 0);

  async function handleReconcile() {
    if (selected.size === 0) return setError('Select at least one transaction.');
    if (!cycleLabel.trim()) return setError('Enter a cycle label (e.g. "November 2025").');
    setError('');
    setSaving(true);
    try {
      const cycleId = await addDocument(`buildings/${building.id}/reconciliationCycles`, {
        label: cycleLabel.trim(),
        fiscalYearId: fiscalYear.id,
        transactionCount: selected.size,
        totalAmount: selectedTotal,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      const batch = getBatch();
      for (const txId of selected) {
        batchUpdate(batch, `buildings/${building.id}/transactions/${txId}`, {
          reconciliationStatus: 'reconciled',
          reconciliationCycleId: cycleId,
          lastEditedAt: serverTimestamp(),
          lastEditedBy: user.uid,
        });
      }
      await batch.commit();

      setSelected(new Set());
      setCycleLabel('');
      setSuccess(`Reconciled ${selected.size} transaction${selected.size !== 1 ? 's' : ''} in cycle "${cycleLabel.trim()}".`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error(err);
      setError('Failed to reconcile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Reconciliation</h2>
        <p className="text-sm text-gray-500">{fiscalYear.label}</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Open" value={openTx.length} sub="transactions" color="text-amber-600" />
        <StatCard label="Reconciled" value={reconciledTx.length} sub="transactions" color="text-green-600" />
        <StatCard
          label="Reconciled Total"
          value={formatCurrency(reconciledTx.reduce((s, t) => s + (t.cost ?? 0), 0))}
          sub="this fiscal year"
          color="text-blue-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['open', 'Open Transactions'], ['cycles', 'Cycle History']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {key === 'open' && openTx.length > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {openTx.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : tab === 'open' ? (
        <OpenTab
          openTx={openTx}
          selected={selected}
          toggle={toggle}
          toggleAll={toggleAll}
          vendorMap={vendorMap}
          getCategoryLabel={getCategoryLabel}
          cycleLabel={cycleLabel}
          setCycleLabel={setCycleLabel}
          selectedTotal={selectedTotal}
          onReconcile={handleReconcile}
          saving={saving}
          error={error}
          success={success}
        />
      ) : (
        <CyclesTab
          cycles={cycles}
          transactions={transactions}
          vendorMap={vendorMap}
          getCategoryLabel={getCategoryLabel}
        />
      )}
    </div>
  );
}

function OpenTab({
  openTx, selected, toggle, toggleAll, vendorMap, getCategoryLabel,
  cycleLabel, setCycleLabel, selectedTotal, onReconcile, saving, error, success,
}) {
  if (openTx.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
        <p className="text-lg font-medium">All caught up!</p>
        <p className="text-sm mt-1">No open transactions to reconcile.</p>
      </div>
    );
  }

  const allSelected = selected.size === openTx.length;

  return (
    <div className="space-y-3">
      {/* Reconcile action bar */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex-wrap">
        <div className="flex-1 min-w-48">
          <input
            type="text"
            value={cycleLabel}
            onChange={(e) => setCycleLabel(e.target.value)}
            placeholder='Cycle label, e.g. "November 2025"'
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{selected.size} selected</span>
          {selected.size > 0 && (
            <span className="font-medium text-gray-700">· {formatCurrency(selectedTotal)}</span>
          )}
        </div>
        <Button
          onClick={onReconcile}
          loading={saving}
          disabled={selected.size === 0}
        >
          Mark Reconciled
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{success}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {openTx.map((tx) => (
              <tr
                key={tx.id}
                className={`hover:bg-gray-50 cursor-pointer ${selected.has(tx.id) ? 'bg-blue-50' : ''}`}
                onClick={() => toggle(tx.id)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggle(tx.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {formatDate(tx.receiptDate)}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {vendorMap[tx.vendorId] ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{getCategoryLabel(tx)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-800">
                  {formatCurrency(tx.cost)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-sm text-gray-500">
                {openTx.length} transaction{openTx.length !== 1 ? 's' : ''} total
              </td>
              <td className="px-4 py-2 text-right font-semibold text-gray-700">
                {formatCurrency(openTx.reduce((s, t) => s + (t.cost ?? 0), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CyclesTab({ cycles, transactions, vendorMap, getCategoryLabel }) {
  const [expanded, setExpanded] = useState(null);

  if (cycles.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
        <p className="text-lg font-medium">No cycles yet.</p>
        <p className="text-sm mt-1">Reconcile transactions on the Open tab to create your first cycle.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cycles.map((cycle) => {
        const cycleTx = transactions.filter((t) => t.reconciliationCycleId === cycle.id);
        const isOpen = expanded === cycle.id;

        return (
          <div key={cycle.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : cycle.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{cycle.label}</span>
                <span className="text-sm text-gray-400">{formatDate(cycle.createdAt)}</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {cycle.transactionCount} tx
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold text-gray-700">{formatCurrency(cycle.totalAmount)}</span>
                <Chevron open={isOpen} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100">
                <table className="min-w-full text-sm divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Vendor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Category</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {cycleTx.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-center text-gray-400 text-xs">
                          Transaction details not loaded yet.
                        </td>
                      </tr>
                    ) : (
                      cycleTx.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500">{formatDate(tx.receiptDate)}</td>
                          <td className="px-4 py-2 text-gray-700">{vendorMap[tx.vendorId] ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{getCategoryLabel(tx)}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(tx.cost)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
