import { useState, useEffect, useMemo } from 'react';
import { useOrg } from '../contexts/BuildingContext';
import {
  subscribeToCollection,
  where,
  orderBy,
} from '../lib/firestore';
import { formatCurrency, formatDate } from '../lib/format';
import Button from '../components/shared/Button';

export default function Events() {
  const { building, fiscalYear, activeDepartment } = useOrg();
  const deptId = activeDepartment?.id;

  const [events, setEvents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [strategyTypes, setStrategyTypes] = useState([]);
  const [staff, setStaff] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id || !deptId) return;
    const unsubEvents = subscribeToCollection(
      `buildings/${building.id}/events`,
      setEvents,
      orderBy('createdAt', 'desc')
    );
    const unsubTx = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      setTransactions,
      where('fiscalYearId', '==', fiscalYear.id)
    );
    const unsubStrategies = subscribeToCollection(
      `departments/${deptId}/strategyTypes`,
      setStrategyTypes,
      orderBy('order', 'asc')
    );
    const unsubStaff = subscribeToCollection(
      `buildings/${building.id}/staffMembers`,
      setStaff,
      where('fiscalYearId', '==', fiscalYear.id)
    );
    const unsubCats = subscribeToCollection(
      `departments/${deptId}/categories`,
      setCategories,
      orderBy('order', 'asc')
    );
    const unsubVendors = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      setVendors
    );
    return () => {
      unsubEvents(); unsubTx(); unsubStrategies();
      unsubStaff(); unsubCats(); unsubVendors();
    };
  }, [building?.id, fiscalYear?.id, deptId]);

  const strategyMap = Object.fromEntries(strategyTypes.map((s) => [s.id, s.name]));
  const staffMap = Object.fromEntries(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  function categoryLabel(catId, subId) {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return '—';
    const sub = cat.subCategories?.find((s) => s.id === subId);
    return sub ? `${cat.name} / ${sub.name}` : cat.name;
  }

  // Aggregate spend per event
  const eventSummaries = useMemo(() => {
    const byEvent = {};
    for (const tx of transactions) {
      if (tx.reconciliationStatus === 'voided') continue;
      if (!tx.eventId) continue;
      if (!byEvent[tx.eventId]) byEvent[tx.eventId] = { total: 0, count: 0, staffIds: new Set() };
      byEvent[tx.eventId].total += tx.cost ?? 0;
      byEvent[tx.eventId].count += 1;
      for (const a of tx.staffAllocations ?? []) {
        if (a.staffId) byEvent[tx.eventId].staffIds.add(a.staffId);
      }
    }
    return byEvent;
  }, [transactions]);

  const grandTotal = Object.values(eventSummaries).reduce((s, e) => s + e.total, 0);

  if (!building) {
    return <p className="text-gray-400">Select a building to see events.</p>;
  }
  if (!fiscalYear) {
    return <p className="text-gray-400">No active fiscal year.</p>;
  }

  if (selectedEventId) {
    const event = events.find((e) => e.id === selectedEventId);
    const eventTx = transactions.filter(
      (t) => t.eventId === selectedEventId && t.reconciliationStatus !== 'voided'
    );
    return (
      <EventDetail
        event={event}
        transactions={eventTx}
        strategyMap={strategyMap}
        staffMap={staffMap}
        vendorMap={vendorMap}
        categoryLabel={categoryLabel}
        onBack={() => setSelectedEventId(null)}
      />
    );
  }

  // Sort events by total spend desc
  const sortedEvents = [...events].sort((a, b) => {
    const ta = eventSummaries[a.id]?.total ?? 0;
    const tb = eventSummaries[b.id]?.total ?? 0;
    return tb - ta;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <p className="text-sm text-gray-500 mt-1">
          {building.name} · {fiscalYear.label}
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {events.length} event{events.length === 1 ? '' : 's'} · total spend
        </span>
        <span className="text-lg font-semibold text-gray-900">
          {formatCurrency(grandTotal)}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No events yet.</p>
          <p className="text-sm mt-1">
            Tag transactions with an event title or UB Linked ID to see them here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">UB Linked ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spend</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"># Tx</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CAs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedEvents.map((ev) => {
                const summary = eventSummaries[ev.id] ?? { total: 0, count: 0, staffIds: new Set() };
                return (
                  <tr
                    key={ev.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedEventId(ev.id)}
                  >
                    <td className="px-4 py-3 text-gray-800">{ev.title}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{ev.externalId ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{strategyMap[ev.strategyTypeId] ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-800 font-semibold">
                      {formatCurrency(summary.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{summary.count}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{summary.staffIds.size}</td>
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

function EventDetail({ event, transactions, strategyMap, staffMap, vendorMap, categoryLabel, onBack }) {
  if (!event) {
    return (
      <div>
        <Button variant="secondary" onClick={onBack}>← Back to Events</Button>
        <p className="mt-4 text-gray-400">Event not found.</p>
      </div>
    );
  }

  const total = transactions.reduce((s, t) => s + (t.cost ?? 0), 0);
  const staffSet = new Set();
  for (const t of transactions) {
    for (const a of t.staffAllocations ?? []) if (a.staffId) staffSet.add(a.staffId);
  }

  return (
    <div className="space-y-4">
      <Button variant="secondary" size="sm" onClick={onBack}>← Back to Events</Button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
        <div className="text-sm text-gray-500 mt-1 space-x-4">
          {event.externalId && <span>UB Linked: <span className="font-mono">{event.externalId}</span></span>}
          {event.strategyTypeId && <span>Strategy: {strategyMap[event.strategyTypeId] ?? '—'}</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total Spend" value={formatCurrency(total)} />
        <Stat label="Transactions" value={transactions.length} />
        <Stat label="CAs Involved" value={staffSet.size} />
      </div>

      {transactions.length === 0 ? (
        <p className="text-sm text-gray-400">No transactions tagged to this event yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CAs</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions
                .slice()
                .sort((a, b) => {
                  const da = a.receiptDate?.toDate?.()?.getTime() ?? 0;
                  const db = b.receiptDate?.toDate?.()?.getTime() ?? 0;
                  return db - da;
                })
                .map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{formatDate(tx.receiptDate)}</td>
                    <td className="px-4 py-2 text-gray-700">{vendorMap[tx.vendorId] ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{categoryLabel(tx.categoryId, tx.subCategoryId)}</td>
                    <td className="px-4 py-2 text-gray-600">{tx.description || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {(tx.staffAllocations ?? [])
                        .map((a) => staffMap[a.staffId])
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-800 font-semibold">
                      {formatCurrency(tx.cost ?? 0)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <p className="text-xs font-medium text-gray-400 uppercase">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
