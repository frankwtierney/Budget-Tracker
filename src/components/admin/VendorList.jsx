import { useState, useEffect } from 'react';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  getBatch,
  getCollection,
  batchSet,
  batchUpdate,
  newDocId,
  serverTimestamp,
  orderBy,
  where,
} from '../../lib/firestore';
import { formatCurrency, formatDate } from '../../lib/format';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

// 21 vendors carried over from the "TEMPLATE ResEd Area Budget" workbook —
// the institutional list everyone shares. Aliases are common variants seen on
// receipts and credit-card statements, used by the typeahead's dedup guard.
const UB_SEED_VENDORS = [
  { name: 'Amazon', aliases: ['Amazon.com', 'AMZN Mktp', 'Amazon Marketplace'] },
  { name: 'Best Buy', aliases: ['BestBuy.com'] },
  { name: 'Buffalo Zoo', aliases: [] },
  { name: "Claudette's", aliases: [] },
  { name: 'Dollar Tree', aliases: [] },
  { name: 'FSA', aliases: ['Faculty Student Association'] },
  { name: 'Home Depot', aliases: ['The Home Depot', 'HomeDepot.com'] },
  { name: 'JoAnn Fabrics', aliases: ['JOANN', 'Jo-Ann', 'Joann', 'Jo-Ann Fabric'] },
  { name: 'JotForms', aliases: ['JotForm', 'Jotform.com'] },
  { name: 'JR Photo', aliases: [] },
  { name: 'Kahoot', aliases: ['Kahoot!', 'Kahoot.com'] },
  { name: 'NASPA', aliases: [] },
  { name: "Santora's", aliases: [] },
  { name: 'Staples', aliases: ['Staples.com'] },
  { name: 'Target', aliases: ['Target.com'] },
  { name: 'Tops', aliases: ['Tops Friendly Markets', 'Tops Markets'] },
  { name: 'UB Bookstore', aliases: ['University Bookstore'] },
  { name: 'UPS Store', aliases: ['The UPS Store'] },
  { name: 'Walmart', aliases: ['Wal-Mart', 'Walmart.com'] },
  { name: 'Wegmans', aliases: ['Wegmans Food Markets'] },
  { name: 'Words Anywhere', aliases: [] },
];

export default function VendorList({ building }) {
  const { activeDepartment } = useOrg();
  const deptId = activeDepartment?.id;

  const [deptVendors, setDeptVendors] = useState([]);
  const [bldgVendors, setBldgVendors] = useState([]);
  const [loadingDept, setLoadingDept] = useState(true);
  const [loadingBldg, setLoadingBldg] = useState(true);
  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState(null); // { scope, vendor } | null
  const [removeConfirm, setRemoveConfirm] = useState(null); // { scope, vendor } | null
  const [seedBusy, setSeedBusy] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState('');

  useEffect(() => {
    if (!deptId) return;
    const unsub = subscribeToCollection(
      `departments/${deptId}/vendors`,
      (docs) => { setDeptVendors(docs); setLoadingDept(false); },
      orderBy('name', 'asc')
    );
    return unsub;
  }, [deptId]);

  useEffect(() => {
    if (!building?.id) return;
    const unsub = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      (docs) => { setBldgVendors(docs); setLoadingBldg(false); },
      orderBy('name', 'asc')
    );
    return unsub;
  }, [building?.id]);

  function filterBySearch(list) {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => v.name.toLowerCase().includes(q));
  }

  const visibleDept = filterBySearch(deptVendors);
  const visibleBldg = filterBySearch(bldgVendors);

  async function handleSeed() {
    if (!deptId) return;
    setSeedBusy(true);
    try {
      const existingByName = new Map(deptVendors.map((v) => [v.name.toLowerCase(), v]));
      const batch = getBatch();
      const path = `departments/${deptId}/vendors`;
      let writes = 0;
      UB_SEED_VENDORS.forEach((seed) => {
        const existing = existingByName.get(seed.name.toLowerCase());
        if (existing) {
          const current = existing.aliases ?? [];
          const lowerCurrent = new Set(current.map((a) => a.toLowerCase()));
          const newAliases = seed.aliases.filter((a) => !lowerCurrent.has(a.toLowerCase()));
          if (newAliases.length > 0) {
            batchUpdate(batch, `${path}/${existing.id}`, {
              aliases: [...current, ...newAliases],
            });
            writes++;
          }
        } else {
          const id = newDocId(path);
          batchSet(batch, `${path}/${id}`, {
            name: seed.name,
            aliases: seed.aliases,
            status: 'verified',
            notes: '',
            createdAt: serverTimestamp(),
          });
          writes++;
        }
      });
      if (writes > 0) await batch.commit();
    } finally {
      setSeedBusy(false);
    }
  }

  // Aggregates non-voided transactions across every building in the dept and
  // writes fresh transactionCount/totalSpend/lastUsedAt onto every dept and
  // building vendor. Idempotent — safe to re-run. Use after enabling dept-
  // vendor stat tracking, after bulk imports, or to correct any drift.
  async function handleRecompute() {
    if (!deptId) return;
    setRecomputeBusy(true);
    setRecomputeMsg('');
    try {
      const allBuildings = await getCollection('buildings', where('departmentId', '==', deptId));

      const stats = {};
      for (const bldg of allBuildings) {
        const txs = await getCollection(`buildings/${bldg.id}/transactions`);
        for (const tx of txs) {
          if (tx.reconciliationStatus === 'voided') continue;
          if (!tx.vendorId) continue;
          const s = stats[tx.vendorId] ?? { count: 0, total: 0, lastUsedAt: null };
          s.count += 1;
          s.total += tx.cost ?? 0;
          const txMs = tx.receiptDate?.toMillis?.();
          const curMs = s.lastUsedAt?.toMillis?.();
          if (txMs && (!curMs || txMs > curMs)) s.lastUsedAt = tx.receiptDate;
          stats[tx.vendorId] = s;
        }
      }

      const updates = [];
      deptVendors.forEach((v) => {
        const s = stats[v.id] ?? { count: 0, total: 0, lastUsedAt: null };
        updates.push({ path: `departments/${deptId}/vendors/${v.id}`, s });
      });
      for (const bldg of allBuildings) {
        const bv = await getCollection(`buildings/${bldg.id}/vendors`);
        bv.forEach((v) => {
          const s = stats[v.id] ?? { count: 0, total: 0, lastUsedAt: null };
          updates.push({ path: `buildings/${bldg.id}/vendors/${v.id}`, s });
        });
      }

      // Firestore caps batches at 500 ops; chunk well under to be safe.
      const CHUNK = 400;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const batch = getBatch();
        updates.slice(i, i + CHUNK).forEach(({ path, s }) => {
          batchUpdate(batch, path, {
            transactionCount: s.count,
            totalSpend: s.total,
            lastUsedAt: s.lastUsedAt,
          });
        });
        await batch.commit();
      }

      setRecomputeMsg(`Recomputed ${updates.length} vendor${updates.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      setRecomputeMsg('Recompute failed — check console.');
    } finally {
      setRecomputeBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Vendors</h2>
          <p className="text-sm text-gray-500">
            Shared vendors are available across all buildings in the department.
            Building-only vendors are private to <span className="font-medium">{building?.name}</span>.
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors..."
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Shared (Department)</h3>
            <p className="text-xs text-gray-500">
              Visible to every building in the department.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              loading={recomputeBusy}
              onClick={handleRecompute}
              title="Rebuild transactionCount / totalSpend / lastUsedAt for every vendor from non-voided transactions across all buildings in the department."
            >
              Recompute totals
            </Button>
            <Button
              variant="secondary"
              loading={seedBusy}
              onClick={handleSeed}
            >
              Seed institutional vendors
            </Button>
            <Button onClick={() => setEditModal({ scope: 'department', vendor: null })}>
              + Add Vendor
            </Button>
          </div>
        </div>
        {recomputeMsg && (
          <p className="text-xs text-gray-500">{recomputeMsg}</p>
        )}
        <VendorTable
          vendors={visibleDept}
          loading={loadingDept}
          scope="department"
          showStats
          onEdit={(v) => setEditModal({ scope: 'department', vendor: v })}
          onRemove={(v) => setRemoveConfirm({ scope: 'department', vendor: v })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Building-only</h3>
            <p className="text-xs text-gray-500">
              Private to this building. Vendors added on the fly during expense entry land here.
            </p>
          </div>
          <Button onClick={() => setEditModal({ scope: 'building', vendor: null })}>
            + Add Vendor
          </Button>
        </div>
        <VendorTable
          vendors={visibleBldg}
          loading={loadingBldg}
          scope="building"
          showStats
          onEdit={(v) => setEditModal({ scope: 'building', vendor: v })}
          onRemove={(v) => setRemoveConfirm({ scope: 'building', vendor: v })}
        />
      </section>

      <EditVendorModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        scope={editModal?.scope}
        existing={editModal?.vendor}
        deptId={deptId}
        buildingId={building?.id}
        deptVendors={deptVendors}
        bldgVendors={bldgVendors}
      />

      <RemoveVendorModal
        isOpen={removeConfirm !== null}
        onClose={() => setRemoveConfirm(null)}
        scope={removeConfirm?.scope}
        vendor={removeConfirm?.vendor}
        deptId={deptId}
        buildingId={building?.id}
      />
    </div>
  );
}

function VendorTable({ vendors, loading, scope, showStats, onEdit, onRemove }) {
  if (loading) return <div className="text-sm text-gray-400">Loading...</div>;
  if (vendors.length === 0) {
    return (
      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400">
        {scope === 'department'
          ? 'No shared vendors yet. Use Seed or + Add Vendor to start the list.'
          : 'No building-only vendors yet. They appear here when added during expense entry.'}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Status</th>
            {showStats && (
              <>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Spend</th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-help"
                  title="Number of transactions that reference this vendor"
                >
                  Tx
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
              </>
            )}
            <th className="px-4 py-3 w-28" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {vendors.map((v) => (
            <tr key={v.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-800">{v.name}</div>
                {v.aliases?.length > 0 && (
                  <div className="text-xs text-gray-400">{v.aliases.join(', ')}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                    v.status === 'verified'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {v.status ?? 'unverified'}
                </span>
              </td>
              {showStats && (
                <>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(v.totalSpend ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{v.transactionCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(v.lastUsedAt)}</td>
                </>
              )}
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(v)}
                    title="Edit"
                    aria-label="Edit vendor"
                    className="text-gray-400 hover:text-gray-700 p-1 rounded"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  {scope === 'department' || (v.transactionCount ?? 0) > 0 ? (
                    <button
                      onClick={() => onRemove(v)}
                      title="Archive"
                      aria-label="Archive vendor"
                      className="text-gray-400 hover:text-amber-500 p-1 rounded"
                    >
                      <ArchiveIcon className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onRemove(v)}
                      title="Delete"
                      aria-label="Delete vendor"
                      className="text-gray-400 hover:text-red-500 p-1 rounded"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditVendorModal({ isOpen, onClose, scope, existing, deptId, buildingId, deptVendors = [], bldgVendors = [] }) {
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [status, setStatus] = useState('verified');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setAliases((existing?.aliases ?? []).join(', '));
      setStatus(existing?.status ?? (scope === 'department' ? 'verified' : 'unverified'));
      setNotes(existing?.notes ?? '');
      setError('');
    }
  }, [isOpen, existing, scope]);

  const basePath =
    scope === 'department'
      ? `departments/${deptId}/vendors`
      : `buildings/${buildingId}/vendors`;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return setError('Name is required.');

    const normalized = trimmedName.toLowerCase();
    const matches = (v) =>
      v.name.toLowerCase() === normalized ||
      (v.aliases ?? []).some((a) => a.toLowerCase() === normalized);

    const sameScopeList = scope === 'department' ? deptVendors : bldgVendors;
    const sameScopeDup = sameScopeList.find((v) => v.id !== existing?.id && matches(v));
    if (sameScopeDup) {
      const aliasNote = sameScopeDup.name.toLowerCase() !== normalized ? ` (matches alias of "${sameScopeDup.name}")` : '';
      const archivedNote = sameScopeDup.status === 'archived' ? ' (currently archived — edit it to restore)' : '';
      return setError(`A vendor named "${sameScopeDup.name}" already exists in this list${aliasNote}${archivedNote}.`);
    }
    if (scope === 'building') {
      const deptDup = deptVendors.find(matches);
      if (deptDup) {
        const aliasNote = deptDup.name.toLowerCase() !== normalized ? ` (matches alias of "${deptDup.name}")` : '';
        return setError(`"${deptDup.name}" already exists as a shared (department) vendor${aliasNote}. Use the shared one instead.`);
      }
    }

    setLoading(true);
    try {
      const data = {
        name: name.trim(),
        aliases: aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        status,
        notes: notes.trim(),
      };
      if (existing) {
        await updateDocument(`${basePath}/${existing.id}`, data);
      } else {
        await addDocument(basePath, {
          ...data,
          createdAt: serverTimestamp(),
          transactionCount: 0,
          totalSpend: 0,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const title = existing
    ? `Edit Vendor (${scope === 'department' ? 'Shared' : 'Building'})`
    : `Add Vendor (${scope === 'department' ? 'Shared' : 'Building'})`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="vendorName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Amazon"
          autoFocus
        />
        <Input
          label="Aliases"
          id="vendorAliases"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="Amazon.com, AMZN Mktp"
          helpText="Comma-separated alternate names (optional, used for typeahead matching)."
        />
        <div>
          <label htmlFor="vendorStatus" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="vendorStatus"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="verified">verified</option>
            <option value="unverified">unverified</option>
          </select>
        </div>
        <Input
          label="Notes"
          id="vendorNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function ArchiveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 010-4h14a2 2 0 010 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4" />
    </svg>
  );
}

function RemoveVendorModal({ isOpen, onClose, scope, vendor, deptId, buildingId }) {
  const [loading, setLoading] = useState(false);
  if (!vendor) return null;

  const txCount = vendor.transactionCount ?? 0;
  // Dept-scoped vendors are shared across buildings — Firestore rules also
  // block hard delete — so always archive. Building-scoped vendors with
  // history are archived too; only orphan building entries can be deleted.
  const isArchive = scope === 'department' || txCount > 0;
  const path =
    scope === 'department'
      ? `departments/${deptId}/vendors/${vendor.id}`
      : `buildings/${buildingId}/vendors/${vendor.id}`;

  async function handleConfirm() {
    setLoading(true);
    try {
      if (isArchive) {
        await updateDocument(path, { status: 'archived' });
      } else {
        await deleteDocument(path);
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isArchive ? 'Archive Vendor' : 'Delete Vendor'} size="sm">
      <p className="text-sm text-gray-600 mb-4">
        {isArchive ? (
          scope === 'department' ? (
            <>
              <span className="font-semibold">{vendor.name}</span> is shared across the department.
              It will be archived (status set to <span className="font-mono">archived</span>) and hidden from new expense entries, but existing transactions in any building keep their link.
            </>
          ) : (
            <>
              <span className="font-semibold">{vendor.name}</span> has {txCount} transaction{txCount === 1 ? '' : 's'} attached.
              It will be archived (status set to <span className="font-mono">archived</span>) so those transactions still link.
            </>
          )
        ) : (
          <>
            Permanently delete <span className="font-semibold">{vendor.name}</span>? This cannot be undone.
          </>
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={handleConfirm}>
          {isArchive ? 'Archive' : 'Delete'}
        </Button>
      </div>
    </Modal>
  );
}
