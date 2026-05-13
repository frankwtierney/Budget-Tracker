import { useState, useEffect } from 'react';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  subscribeToDocument,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency } from '../../lib/format';

function getPeriod(transaction, fiscalYear) {
  if (!fiscalYear.splitDate) return 'annual';
  const txDate = transaction.receiptDate?.toDate?.() ?? new Date(0);
  const splitDate = fiscalYear.splitDate?.toDate?.() ?? new Date();
  return txDate <= splitDate ? 'period1' : 'period2';
}

function burnColor(remaining, allocation) {
  if (!allocation || allocation <= 0) return '';
  const pct = remaining / allocation;
  if (pct > 0.5) return 'text-green-700 bg-green-50';
  if (pct > 0.2) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

export default function SummaryView({ building, fiscalYear }) {
  const { activeDepartment } = useOrg();
  const deptId = activeDepartment?.id;

  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [allocDoc, setAllocDoc] = useState(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);

  const splitPeriods = building?.settings?.splitPeriods;
  const periodNames = building?.settings?.splitPeriodNames ?? ['Fall', 'Spring'];

  // Department-level shared category schema
  useEffect(() => {
    if (!deptId) return;
    const unsub = subscribeToCollection(
      `departments/${deptId}/categories`,
      (docs) => { setCategories(docs); setLoadingCats(false); },
      orderBy('order', 'asc')
    );
    return unsub;
  }, [deptId]);

  // Per-building per-FY allocation amounts
  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;
    const unsub = subscribeToDocument(
      `buildings/${building.id}/allocations/${fiscalYear.id}`,
      setAllocDoc
    );
    return unsub;
  }, [building?.id, fiscalYear?.id]);

  // Transactions for this building + FY
  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;
    const unsub = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      (docs) => { setTransactions(docs); setLoadingTx(false); },
      where('fiscalYearId', '==', fiscalYear.id)
    );
    return unsub;
  }, [building?.id, fiscalYear?.id]);

  // Per-category allocation lookup. Sub-categories don't have their own caps
  // (we track sub-category spend for analytics, but allocation is at category
  // level only). Handles legacy per-sub shape by summing as fallback.
  const allocOf = (catId) => {
    const v = allocDoc?.byCategory?.[catId];
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object') {
      return Object.values(v).reduce((s, n) => s + (Number(n) || 0), 0);
    }
    return 0;
  };

  // Build spend map: { categoryId: { subCategoryId: { period1, period2, annual } } }
  const spendMap = {};
  for (const tx of transactions) {
    if (tx.reconciliationStatus === 'voided') continue;
    const cat = tx.categoryId;
    const sub = tx.subCategoryId;
    const period = getPeriod(tx, fiscalYear);
    if (!spendMap[cat]) spendMap[cat] = {};
    if (!spendMap[cat][sub]) spendMap[cat][sub] = { period1: 0, period2: 0, annual: 0 };
    spendMap[cat][sub][period] += tx.cost ?? 0;
    spendMap[cat][sub].annual += tx.cost ?? 0;
  }

  const loading = loadingCats || loadingTx;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Budget Summary</h1>
        <p className="text-sm text-gray-500 mt-1">{fiscalYear.label}</p>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No categories yet.</p>
          <p className="text-sm mt-1">Go to Admin → Categories to add categories.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-56">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Allocation
                </th>
                {splitPeriods && (
                  <>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {periodNames[0]}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      {periodNames[1]}
                    </th>
                  </>
                )}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Total Spent
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Remaining
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => {
                const subs = (cat.subCategories ?? []).slice().sort((a, b) => a.order - b.order);
                const catAllocation = allocOf(cat.id);
                const catP1 = subs.reduce((s, sub) => s + (spendMap[cat.id]?.[sub.id]?.period1 ?? 0), 0);
                const catP2 = subs.reduce((s, sub) => s + (spendMap[cat.id]?.[sub.id]?.period2 ?? 0), 0);
                const catSpent = subs.reduce((s, sub) => s + (spendMap[cat.id]?.[sub.id]?.annual ?? 0), 0);
                const catRemaining = catAllocation - catSpent;

                return [
                  // Category row
                  <tr key={`cat-${cat.id}`} className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-gray-800">{cat.name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(catAllocation)}
                    </td>
                    {splitPeriods && (
                      <>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(catP1)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(catP2)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(catSpent)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${burnColor(catRemaining, catAllocation)}`}>
                        {formatCurrency(catRemaining)}
                      </span>
                    </td>
                  </tr>,
                  // Sub-category rows — spend tracked, no own allocation cap
                  ...subs.map((sub) => {
                    const p1 = spendMap[cat.id]?.[sub.id]?.period1 ?? 0;
                    const p2 = spendMap[cat.id]?.[sub.id]?.period2 ?? 0;
                    const spent = spendMap[cat.id]?.[sub.id]?.annual ?? 0;

                    return (
                      <tr key={`sub-${sub.id}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 pl-8">{sub.name}</td>
                        <td className="px-4 py-3 text-right text-gray-300">—</td>
                        {splitPeriods && (
                          <>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p1)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p2)}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(spent)}</td>
                        <td className="px-4 py-3 text-right text-gray-300">—</td>
                      </tr>
                    );
                  }),
                ];
              })}

              {/* Grand total row */}
              {(() => {
                const totalAlloc = categories.reduce((s, c) => s + allocOf(c.id), 0);
                const totalSpent = transactions
                  .filter((t) => t.reconciliationStatus !== 'voided')
                  .reduce((s, t) => s + (t.cost ?? 0), 0);
                const totalP1 = transactions
                  .filter((t) => t.reconciliationStatus !== 'voided' && getPeriod(t, fiscalYear) === 'period1')
                  .reduce((s, t) => s + (t.cost ?? 0), 0);
                const totalP2 = transactions
                  .filter((t) => t.reconciliationStatus !== 'voided' && getPeriod(t, fiscalYear) === 'period2')
                  .reduce((s, t) => s + (t.cost ?? 0), 0);

                return (
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                    <td className="px-4 py-3 text-blue-900">Total</td>
                    <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totalAlloc)}</td>
                    {splitPeriods && (
                      <>
                        <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totalP1)}</td>
                        <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totalP2)}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totalSpent)}</td>
                    <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totalAlloc - totalSpent)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
