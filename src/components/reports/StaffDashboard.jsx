import { useState, useEffect, Fragment } from 'react';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency } from '../../lib/format';

const SEMESTER_LABELS = { fall: 'Fall', spring: 'Spring', summer: 'Summer' };
const SEMESTER_HINTS = { fall: 'Aug – Dec', spring: 'Jan – May', summer: 'Jun – Jul' };

// Academic-year semester classification: Aug–Dec = Fall, Jan–May = Spring,
// Jun–Jul = Summer (the workbook's orphan period).
function monthToSemester(m) {
  if (m >= 7 && m <= 11) return 'fall';
  if (m >= 0 && m <= 4) return 'spring';
  return 'summer';
}

function semesterOf(dateLike) {
  const d = dateLike?.toDate?.() ?? null;
  if (!d) return null;
  return monthToSemester(d.getMonth());
}

function currentSemester() {
  return monthToSemester(new Date().getMonth());
}

export default function StaffDashboard({ building, fiscalYear }) {
  const { activeDepartment } = useOrg();
  const deptId = activeDepartment?.id;

  const [staff, setStaff] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [events, setEvents] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [deptVendors, setDeptVendors] = useState([]);
  const [strategyTypes, setStrategyTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [expandedTxIds, setExpandedTxIds] = useState(new Set());
  const [activeSemester, setActiveSemester] = useState(() => currentSemester());

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTxExpanded(id) {
    setExpandedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

    const unsubEvents = subscribeToCollection(
      `buildings/${building.id}/events`,
      setEvents
    );

    const unsubVendors = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      setVendors
    );

    const unsubDeptVendors = deptId
      ? subscribeToCollection(`departments/${deptId}/vendors`, setDeptVendors)
      : () => {};

    const unsubStrategies = deptId
      ? subscribeToCollection(`departments/${deptId}/strategyTypes`, setStrategyTypes, orderBy('order', 'asc'))
      : () => {};

    return () => {
      unsubStaff(); unsubTx(); unsubEvents();
      unsubVendors(); unsubDeptVendors(); unsubStrategies();
    };
  }, [building?.id, fiscalYear?.id, deptId]);

  const eventMap = Object.fromEntries(events.map((e) => [e.id, e]));
  // Merge dept + building vendors; IDs are unique across collections so either
  // source resolves correctly when transactions reference a vendorId.
  const vendorMap = Object.fromEntries(
    [...deptVendors, ...vendors].map((v) => [v.id, v.name])
  );
  const strategyMap = Object.fromEntries(
    strategyTypes.map((t) => [t.id, { code: t.code || t.name, name: t.name }])
  );

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
    const allTxs = getStaffTransactions(selectedStaff.id);
    const totalSpent = getStaffSpend(selectedStaff.id);
    const annualBudget = selectedStaff.personalBudget?.annual ?? 0;
    const staffMap = Object.fromEntries(staff.map((s) => [s.id, s]));

    const txsBySemester = { fall: [], spring: [], summer: [] };
    allTxs.forEach((tx) => {
      const sem = semesterOf(tx.receiptDate);
      if (sem) txsBySemester[sem].push(tx);
    });
    Object.keys(txsBySemester).forEach((sem) => {
      txsBySemester[sem].sort((a, b) => {
        const da = a.receiptDate?.toDate?.()?.getTime() ?? 0;
        const db = b.receiptDate?.toDate?.()?.getTime() ?? 0;
        return db - da;
      });
    });

    const showSummer = txsBySemester.summer.length > 0;
    const availableSemesters = ['fall', 'spring', ...(showSummer ? ['summer'] : [])];
    const effectiveActive = availableSemesters.includes(activeSemester)
      ? activeSemester
      : availableSemesters[0];

    const semesterTxs = txsBySemester[effectiveActive] || [];
    const semesterSpent = semesterTxs.reduce((sum, tx) => {
      const alloc = tx.staffAllocations?.find((a) => a.staffId === selectedStaff.id);
      return sum + (alloc?.amount ?? 0);
    }, 0);

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
          <StatCard label="Annual Budget" value={formatCurrency(annualBudget)} />
          <StatCard label="Spent" value={formatCurrency(totalSpent)} />
          <StatCard
            label="Remaining"
            value={formatCurrency(annualBudget - totalSpent)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between border-b border-gray-200">
            <div className="flex">
              {availableSemesters.map((sem) => (
                <button
                  key={sem}
                  onClick={() => setActiveSemester(sem)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    effectiveActive === sem
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {SEMESTER_LABELS[sem]}
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">
                    {SEMESTER_HINTS[sem]}
                  </span>
                </button>
              ))}
            </div>
            <div className="pb-2 text-sm text-gray-500">
              {SEMESTER_LABELS[effectiveActive]} subtotal:{' '}
              <span className="font-semibold text-gray-800">{formatCurrency(semesterSpent)}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table
              className="min-w-full text-sm divide-y divide-gray-200"
              style={{ tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '39%' }} />
                <col style={{ width: '17%' }} />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {semesterTxs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No transactions in {SEMESTER_LABELS[effectiveActive]}.
                    </td>
                  </tr>
                ) : (
                  semesterTxs.map((tx) => {
                    const alloc = tx.staffAllocations?.find((a) => a.staffId === selectedStaff.id);
                    const myShare = alloc?.amount ?? 0;
                    const ev = tx.eventId ? eventMap[tx.eventId] : null;
                    const strategy = ev?.strategyTypeId ? strategyMap[ev.strategyTypeId] : null;
                    const vendorName = tx.vendorId ? vendorMap[tx.vendorId] : null;
                    const splitCount = tx.staffAllocations?.length ?? 0;
                    const myIndex =
                      tx.staffAllocations?.findIndex((a) => a.staffId === selectedStaff.id) ?? -1;
                    const hasDetails = !!(tx.description || splitCount > 1);
                    const txExpanded = expandedTxIds.has(tx.id);
                    return (
                      <Fragment key={tx.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {hasDetails ? (
                              <button
                                onClick={() => toggleTxExpanded(tx.id)}
                                aria-label={txExpanded ? 'Hide details' : 'Show details'}
                                className="mr-1.5 text-gray-300 hover:text-blue-500 align-middle"
                              >
                                <InfoIcon className="w-3.5 h-3.5 inline-block" />
                              </button>
                            ) : (
                              <span className="inline-block w-3.5 mr-1.5" />
                            )}
                            {tx.receiptDate?.toDate?.()?.toLocaleDateString() ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 truncate" title={strategy?.name ?? ''}>
                            {strategy?.code || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 truncate" title={vendorName ?? ''}>
                            {vendorName || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 truncate" title={ev?.title ?? ''}>
                            {ev?.title || '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="font-medium text-gray-800">{formatCurrency(myShare)}</span>
                            {splitCount > 1 && (
                              <span
                                className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                title={`Split across ${splitCount} staff; transaction total ${formatCurrency(tx.cost ?? 0)}`}
                              >
                                {myIndex + 1}/{splitCount}
                              </span>
                            )}
                          </td>
                        </tr>
                        {hasDetails && txExpanded && (
                          <tr className="bg-blue-50 text-[11px] text-gray-600">
                            <td colSpan={5} className="px-4 py-2">
                              {tx.description && (
                                <div className="italic">{tx.description}</div>
                              )}
                              {splitCount > 1 && (
                                <div className={tx.description ? 'mt-1' : ''}>
                                  <span className="font-medium text-gray-700 not-italic">Split:</span>{' '}
                                  {tx.staffAllocations.map((a, i) => {
                                    const other = staffMap[a.staffId];
                                    const isMe = a.staffId === selectedStaff.id;
                                    const label = isMe
                                      ? 'You'
                                      : other
                                        ? `${other.firstName} ${other.lastName}`
                                        : 'Unknown';
                                    return (
                                      <span key={a.staffId}>
                                        {i > 0 && <span className="text-gray-400"> · </span>}
                                        <span className={isMe ? 'font-semibold text-gray-800' : ''}>
                                          {label} {formatCurrency(a.amount ?? 0)}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
          <table
            className="min-w-full divide-y divide-gray-200 text-sm"
            style={{ tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '33%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenure</th>
                <th className="px-4 py-3" />
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase border-l border-gray-200">Budget</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spent</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {staff.map((s) => {
                const budget = s.personalBudget?.annual ?? 0;
                const spent = getStaffSpend(s.id);
                const remaining = budget - spent;
                const isExpanded = expandedIds.has(s.id);
                const txs = isExpanded ? getStaffTransactions(s.id) : [];
                return (
                  <Fragment key={s.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => toggleExpanded(s.id)}
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded transition-transform"
                        >
                          <ChevronIcon
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedStaff(s)}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                        >
                          {s.firstName} {s.lastName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.role}</td>
                      <td className="px-4 py-3">
                        {s.tenureFlag ? (
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                              s.tenureFlag === 'Returner'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {s.tenureFlag}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right text-gray-700 border-l border-gray-200">{formatCurrency(budget)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(spent)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${burnColor(remaining, budget)}`}>
                        {formatCurrency(remaining)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <>
                        <tr className="bg-gray-50 text-[10px] uppercase text-gray-400">
                          <td className="border-l-2 border-blue-200" />
                          <td className="px-4 py-1.5 font-medium">Date</td>
                          <td className="px-4 py-1.5 font-medium">Strategy</td>
                          <td className="px-4 py-1.5 font-medium">Vendor</td>
                          <td className="px-4 py-1.5 font-medium">Event</td>
                          <td className="border-l border-gray-200" />
                          <td className="px-4 py-1.5 text-right font-medium">Spent</td>
                          <td className="px-4 py-1.5 text-right font-medium">Remaining</td>
                        </tr>
                        {txs.length === 0 ? (
                          <tr className="bg-gray-50">
                            <td className="border-l-2 border-blue-200" />
                            <td colSpan={7} className="px-4 py-3 text-sm text-gray-400 italic">
                              No transactions yet.
                            </td>
                          </tr>
                        ) : (
                          enrichTransactions(s, budget, txs).map(
                            ({ tx, myShare, splitCount, myIndex, remaining: rem }) => {
                              const ev = tx.eventId ? eventMap[tx.eventId] : null;
                              const strategy = ev?.strategyTypeId ? strategyMap[ev.strategyTypeId] : null;
                              const vendorName = tx.vendorId ? vendorMap[tx.vendorId] : null;
                              const hasDetails = !!tx.description;
                              const txExpanded = expandedTxIds.has(tx.id);
                              return (
                                <Fragment key={`tx-${tx.id}`}>
                                  <tr className="bg-gray-50 text-xs">
                                    <td className="border-l-2 border-blue-200" />
                                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                                      {hasDetails ? (
                                        <button
                                          onClick={() => toggleTxExpanded(tx.id)}
                                          aria-label={txExpanded ? 'Hide description' : 'Show description'}
                                          className="mr-1.5 text-gray-300 hover:text-blue-500 align-middle"
                                        >
                                          <InfoIcon className="w-3.5 h-3.5 inline-block" />
                                        </button>
                                      ) : (
                                        <span className="inline-block w-3.5 mr-1.5" />
                                      )}
                                      {tx.receiptDate?.toDate?.()?.toLocaleDateString() ?? '—'}
                                    </td>
                                    <td className="px-4 py-2 text-gray-600 truncate" title={strategy?.name ?? ''}>
                                      {strategy?.code || '—'}
                                    </td>
                                    <td className="px-4 py-2 text-gray-600 truncate" title={vendorName ?? ''}>
                                      {vendorName || '—'}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700 truncate" title={ev?.title ?? ''}>
                                      {ev?.title || '—'}
                                    </td>
                                    <td className="border-l border-gray-200" />
                                    <td className="px-4 py-2 text-right whitespace-nowrap">
                                      <span className="font-medium text-gray-800">{formatCurrency(myShare)}</span>
                                      {splitCount > 1 && (
                                        <span
                                          className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                          title={`Split across ${splitCount} staff (this CA is ${myIndex + 1} of ${splitCount}); transaction total ${formatCurrency(tx.cost ?? 0)}`}
                                        >
                                          {myIndex + 1}/{splitCount}
                                        </span>
                                      )}
                                    </td>
                                    <td
                                      className={`px-4 py-2 text-right font-medium whitespace-nowrap ${
                                        rem < 0 ? 'text-red-600' : 'text-gray-700'
                                      }`}
                                    >
                                      {formatCurrency(rem)}
                                    </td>
                                  </tr>
                                  {hasDetails && txExpanded && (
                                    <tr className="bg-blue-50 text-[11px] text-gray-600 italic">
                                      <td className="border-l-2 border-blue-200" />
                                      <td colSpan={7} className="px-4 py-1.5 pl-10">
                                        {tx.description}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            }
                          )
                        )}
                      </>
                    )}
                  </Fragment>
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

// Build per-tx context (running remaining balance, split metadata) for a CA's
// transaction list. Sort ascending by date for the running calc, then return
// reversed so newest is on top for display.
function enrichTransactions(staff, budget, transactions) {
  const asc = transactions
    .slice()
    .sort((a, b) => {
      const da = a.receiptDate?.toDate?.()?.getTime() ?? 0;
      const db = b.receiptDate?.toDate?.()?.getTime() ?? 0;
      return da - db;
    });

  let running = budget;
  const enriched = asc.map((tx) => {
    const alloc = tx.staffAllocations?.find((a) => a.staffId === staff.id);
    const myShare = alloc?.amount ?? 0;
    running -= myShare;
    const splitCount = tx.staffAllocations?.length ?? 0;
    const myIndex =
      tx.staffAllocations?.findIndex((a) => a.staffId === staff.id) ?? -1;
    return { tx, myShare, splitCount, myIndex, remaining: running };
  });

  return enriched.reverse(); // newest first
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function InfoIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
