import { useState, useEffect } from 'react';
import { formatCurrency } from '../../lib/format';

export default function StaffAllocations({ staff, allocations, onChange, totalCost }) {
  const [selectedIds, setSelectedIds] = useState([]);

  // Sync selectedIds from allocations prop
  useEffect(() => {
    setSelectedIds(allocations.map((a) => a.staffId));
  }, []);

  function toggleStaff(staffId) {
    const newIds = selectedIds.includes(staffId)
      ? selectedIds.filter((id) => id !== staffId)
      : [...selectedIds, staffId];

    setSelectedIds(newIds);

    if (newIds.length === 0) {
      onChange([]);
      return;
    }

    // Even split by default; preserve custom amounts where possible
    const even = totalCost > 0 ? +(totalCost / newIds.length).toFixed(2) : 0;
    const newAllocs = newIds.map((id) => {
      const existing = allocations.find((a) => a.staffId === id);
      return { staffId: id, amount: existing?.amount ?? even };
    });

    // Rebalance to match total exactly (adjust last entry for rounding)
    if (totalCost > 0 && newAllocs.length > 0) {
      const sum = newAllocs.slice(0, -1).reduce((s, a) => s + a.amount, 0);
      newAllocs[newAllocs.length - 1].amount = +(totalCost - sum).toFixed(2);
    }

    onChange(newAllocs);
  }

  function updateAmount(staffId, raw) {
    const amount = parseFloat(raw) || 0;
    const newAllocs = allocations.map((a) =>
      a.staffId === staffId ? { ...a, amount } : a
    );
    onChange(newAllocs);
  }

  function evenSplit() {
    if (selectedIds.length === 0 || totalCost <= 0) return;
    const even = +(totalCost / selectedIds.length).toFixed(2);
    const newAllocs = selectedIds.map((id, i) => ({
      staffId: id,
      amount: i === selectedIds.length - 1
        ? +(totalCost - even * (selectedIds.length - 1)).toFixed(2)
        : even,
    }));
    onChange(newAllocs);
  }

  const allocTotal = allocations.reduce((s, a) => s + (a.amount || 0), 0);
  const diff = totalCost > 0 ? +(totalCost - allocTotal).toFixed(2) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">Staff Allocations</label>
        {selectedIds.length > 1 && (
          <button
            type="button"
            onClick={evenSplit}
            className="text-xs text-blue-600 hover:underline"
          >
            Even split
          </button>
        )}
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
        {staff.map((s) => {
          const isSelected = selectedIds.includes(s.id);
          const alloc = allocations.find((a) => a.staffId === s.id);

          return (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`staff-${s.id}`}
                checked={isSelected}
                onChange={() => toggleStaff(s.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <label
                htmlFor={`staff-${s.id}`}
                className="flex-1 text-sm text-gray-700 cursor-pointer"
              >
                {s.firstName} {s.lastName}
                {s.buildingCode && (
                  <span className="ml-1 text-xs text-gray-400">({s.buildingCode})</span>
                )}
              </label>
              {isSelected && (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={alloc?.amount ?? ''}
                  onChange={(e) => updateAmount(s.id, e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          );
        })}
        {staff.length === 0 && (
          <p className="text-sm text-gray-400 py-1">No active staff members.</p>
        )}
      </div>

      {totalCost > 0 && selectedIds.length > 0 && (
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-gray-400">
            Allocated: {formatCurrency(allocTotal)} of {formatCurrency(totalCost)}
          </span>
          {diff !== 0 && (
            <span className={diff > 0 ? 'text-amber-600' : 'text-red-600'}>
              {diff > 0 ? `${formatCurrency(diff)} unallocated` : `${formatCurrency(Math.abs(diff))} over`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
