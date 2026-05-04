import { useState, useEffect } from 'react';
import {
  subscribeToCollection,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency } from '../../lib/format';

export default function StaffDashboard({ building, fiscalYear }) {
  const [staff, setStaff] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState(null);

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;

    const unsubStaff = subscribeToCollection(
      `buildings/${building.id}/staffMembers`,
      (docs) => { setStaff(docs); setLoading(false); },
      where('fiscalYearId', '==', fiscalYear.id),
      where('active', '!=', false),
      orderBy('active', 'desc'),
      orderBy('lastName', 'asc')
    );

    const unsubTx = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      setTransactions,
      where('fiscalYearId', '==', fiscalYear.id)
    );

    return () => { unsubStaff(); unsubTx(); };
  }, [building?.id, fiscalYear?.id]);

  function getStaffSpend(staffId) {
    return transactions
      .filter((tx) => tx.reconciliationStatus !== 'voided')
      .reduce((sum, tx) => {
        const alloc = tx.staffAllocations?.find((a) => a.staffId === staffId);
        return sum + (alloc?.amount ?? 0);
      }, 0);
  }

  function getStaffTransactions(staffId) {
    return transactions.filter(
      (tx) =>
        tx.reconciliationStatus !== 'voided' &&
        tx.staffAllocations?.some((a) => a.staffId === staffId)
    );
  }

  function burnColor(remaining, budget) {
    if (!budget || budget <= 0) return 'text-gray-500';
    const pct = remaining / budget;
    if (pct > 0.5) return 'text-green-700';
    if (pct > 0.2) return 'text-amber-700';
    return 'text-red-700';
  }

  if (loading) return <div className="text-gray-400">Loading...</div>;

  if (selectedStaff) {
    const txs = getStaffTransactions(selectedStaff.id);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedStaff(null)}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Staff
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedStaff.firstName} {selectedStaff.lastName}
          </h2>
          <span className="text-sm text-gray-500">{selectedStaff.role}</span>
          {selectedStaff.buildingCode && (
            <span className="text-sm text-gray-400">({selectedStaff.buildingCode})</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Annual Budget" value={formatCurrency(selectedStaff.personalBudget?.annual ?? 0)} />
          <StatCard label="Spent" value={formatCurrency(getStaffSpend(selectedStaff.id))} />
          <StatCard
            label="Remaining"
            value={formatCurrency((selectedStaff.personalBudget?.annual ?? 0) - getStaffSpend(selectedStaff.id))}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocated Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {txs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">No transactions.</td>
                </tr>
              ) : (
                txs.map((tx) => {
                  const alloc = tx.staffAllocations?.find((a) => a.staffId === selectedStaff.id);
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {tx.receiptDate?.toDate?.()?.toLocaleDateString() ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{tx.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {formatCurrency(alloc?.amount ?? 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Staff Dashboard</h2>

      {staff.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
          No active staff members. Add them in Admin → Staff Roster.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spent</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {staff.map((s) => {
                const budget = s.personalBudget?.annual ?? 0;
                const spent = getStaffSpend(s.id);
                const remaining = budget - spent;
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {s.firstName} {s.lastName}
                      {s.tenureFlag && (
                        <span className="ml-2 text-xs text-gray-400">{s.tenureFlag}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.role}</td>
                    <td className="px-4 py-3 text-gray-500">{s.buildingCode ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(budget)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(spent)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${burnColor(remaining, budget)}`}>
                      {formatCurrency(remaining)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedStaff(s)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
