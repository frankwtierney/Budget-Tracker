import { useState, useEffect } from 'react';
import {
  subscribeToCollection,
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
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);

  const splitPeriods = building?.settings?.splitPeriods;
  const periodNames = building?.settings?.splitPeriodNames ?? ['Fall', 'Spring'];

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;

    const unsubCats = subscribeToCollection(
      `buildings/${building.id}/categories`,
      (docs) => { setCategories(docs); setLoadingCats(false); },
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('order', 'asc')
    );

    const unsubTx = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      (docs) => { setTransactions(docs); setLoadingTx(false); },
      where('fiscalYearId', '==', fiscalYear.id)
    );

    return () => { unsubCats(); unsubTx(); };
  }, [building?.id, fiscalYear?.id]);

  // Build spend map: { categoryId: { subCategoryId: { period1: number, period2: number, annual: number } } }
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
          <p className="text-sm mt-1">Go to Admin → Categories to add umbrella categories.</p>
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
                const umbrellaAllocation = subs.reduce((s, sub) => s + (sub.allocation ?? 0), 0);
                const umbrellaP1 = subs.reduce((s, sub) => s + (spendMap[cat.id]?.[sub.id]?.period1 ?? 0), 0);
                const umbrellaP2 = subs.reduce((s, sub) => s + (spendMap[cat.id]?.[sub.id]?.period2 ?? 0), 0);
                const umbrellaSpent = subs.reduce((s, sub) => s + (spendMap[cat.id]?.[sub.id]?.annual ?? 0), 0);
                const umbrellaRemaining = umbrellaAllocation - umbrellaSpent;

                return [
                  // Umbrella row
                  <tr key={`cat-${cat.id}`} className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-gray-800">{cat.name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(umbrellaAllocation)}
                    </td>
                    {splitPeriods && (
                      <>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(umbrellaP1)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(umbrellaP2)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(umbrellaSpent)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${burnColor(umbrellaRemaining, umbrellaAllocation)}`}>
                        {formatCurrency(umbrellaRemaining)}
                      </span>
                    </td>
                  </tr>,
                  // Sub-category rows
                  ...subs.map((sub) => {
                    const p1 = spendMap[cat.id]?.[sub.id]?.period1 ?? 0;
                    const p2 = spendMap[cat.id]?.[sub.id]?.period2 ?? 0;
                    const spent = spendMap[cat.id]?.[sub.id]?.annual ?? 0;
                    const remaining = (sub.allocation ?? 0) - spent;

                    return (
                      <tr key={`sub-${sub.id}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 pl-8">{sub.name}</td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {formatCurrency(sub.allocation ?? 0)}
                        </td>
                        {splitPeriods && (
                          <>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p1)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p2)}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(spent)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${burnColor(remaining, sub.allocation)}`}>
                            {formatCurrency(remaining)}
                          </span>
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}

              {/* Grand total row */}
              {(() => {
                const totalAlloc = categories.reduce(
                  (s, c) => s + (c.subCategories ?? []).reduce((ss, sub) => ss + (sub.allocation ?? 0), 0), 0
                );
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
