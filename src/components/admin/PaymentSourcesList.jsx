import { useState, useEffect } from 'react';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  getBatch,
  batchSet,
  newDocId,
  serverTimestamp,
  orderBy,
} from '../../lib/firestore';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

// Where a transaction's money came from. Pcard / UBF Card / ShopBlue / Concur
// reconcile against monthly statements; IDI is an internal transfer that
// doesn't reconcile externally. Phase 2 reconciliation reads requiresReconciliation
// to decide which sources land in the reconciliation queue.
const DEFAULT_SOURCES = [
  { name: 'PCard',     code: 'PCRD', requiresReconciliation: true,  order: 0 },
  { name: 'UBF Card',  code: 'UBF',  requiresReconciliation: true,  order: 1 },
  { name: 'ShopBlue',  code: 'SHOP', requiresReconciliation: true,  order: 2 },
  { name: 'Concur',    code: 'CNCR', requiresReconciliation: true,  order: 3 },
  { name: 'IDI',       code: 'IDI',  requiresReconciliation: false, order: 4 },
  { name: 'Other',     code: 'OTHR', requiresReconciliation: false, order: 5 },
];

export default function PaymentSourcesList() {
  const { activeDepartment } = useOrg();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [seedBusy, setSeedBusy] = useState(false);

  const deptId = activeDepartment?.id;

  useEffect(() => {
    if (!deptId) return;
    const unsub = subscribeToCollection(
      `departments/${deptId}/paymentSources`,
      (docs) => { setSources(docs); setLoading(false); },
      orderBy('order', 'asc')
    );
    return unsub;
  }, [deptId]);

  async function handleSeed() {
    if (!deptId) return;
    setSeedBusy(true);
    try {
      const existingNames = new Set(sources.map((s) => s.name.toLowerCase()));
      const toAdd = DEFAULT_SOURCES.filter((d) => !existingNames.has(d.name.toLowerCase()));
      if (toAdd.length === 0) return;
      const batch = getBatch();
      const path = `departments/${deptId}/paymentSources`;
      toAdd.forEach((d) => {
        const id = newDocId(path);
        batchSet(batch, `${path}/${id}`, {
          ...d,
          archived: false,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } finally {
      setSeedBusy(false);
    }
  }

  if (!activeDepartment) return <p className="text-gray-400">No active department.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Payment Sources</h2>
          <p className="text-sm text-gray-500">
            Tagged onto each transaction to indicate where the money came from.
            Sources marked <span className="font-medium">requires reconciliation</span> will land in the Phase 2 reconciliation queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" loading={seedBusy} onClick={handleSeed}>
            Seed defaults
          </Button>
          <Button onClick={() => setEditModal({ source: null })}>+ Add Source</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No payment sources yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Click <span className="font-medium">Seed defaults</span> for the standard set (PCard, UBF, ShopBlue, Concur, IDI, Other).
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-24">Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-44">Reconciles</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-24">Status</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50 ${s.archived ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{s.code}</td>
                  <td className="px-4 py-2 text-gray-700">{s.name}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {s.requiresReconciliation ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Required
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not required</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {s.archived ? (
                      <span className="text-xs text-gray-400">archived</span>
                    ) : (
                      <span className="text-xs text-green-600">active</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal({ source: s })}
                        title="Edit"
                        aria-label="Edit payment source"
                        className="text-gray-400 hover:text-gray-700 p-1 rounded"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRemoveConfirm(s)}
                        title={s.archived ? 'Restore' : 'Archive'}
                        aria-label={s.archived ? 'Restore payment source' : 'Archive payment source'}
                        className="text-gray-400 hover:text-amber-500 p-1 rounded"
                      >
                        <ArchiveIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        existing={editModal?.source}
        deptId={deptId}
        sources={sources}
        nextOrder={sources.length}
      />

      <ArchiveConfirmModal
        isOpen={removeConfirm !== null}
        onClose={() => setRemoveConfirm(null)}
        source={removeConfirm}
        deptId={deptId}
      />
    </div>
  );
}

function EditModal({ isOpen, onClose, existing, deptId, sources, nextOrder }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [requiresReconciliation, setRequiresReconciliation] = useState(true);
  const [order, setOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setCode(existing?.code ?? '');
      setRequiresReconciliation(existing?.requiresReconciliation ?? true);
      setOrder(existing?.order ?? nextOrder);
      setError('');
    }
  }, [isOpen, existing, nextOrder]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName) return setError('Name is required.');
    if (!trimmedCode) return setError('Code is required.');
    if (trimmedCode.length > 4) return setError('Code must be 4 characters or fewer.');

    const dupName = sources.find(
      (s) => s.id !== existing?.id && s.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (dupName) return setError(`A source named "${dupName.name}" already exists.`);
    const dupCode = sources.find(
      (s) => s.id !== existing?.id && s.code?.toUpperCase() === trimmedCode
    );
    if (dupCode) return setError(`Code "${trimmedCode}" is already used by "${dupCode.name}".`);

    setLoading(true);
    try {
      const path = `departments/${deptId}/paymentSources`;
      const data = {
        name: trimmedName,
        code: trimmedCode,
        requiresReconciliation,
        order: Number(order),
      };
      if (existing) {
        await updateDocument(`${path}/${existing.id}`, data);
      } else {
        await addDocument(path, { ...data, archived: false, createdAt: serverTimestamp() });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? 'Edit Payment Source' : 'Add Payment Source'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="paymentSourceName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="PCard"
          autoFocus
        />
        <Input
          label="Code"
          id="paymentSourceCode"
          required
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="PCRD"
          helpText="Up to 4 characters. Shown as a badge in the transactions table."
        />
        <div className="flex items-center gap-2">
          <input
            id="paymentSourceReconcile"
            type="checkbox"
            checked={requiresReconciliation}
            onChange={(e) => setRequiresReconciliation(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <label htmlFor="paymentSourceReconcile" className="text-sm text-gray-700">
            Requires monthly reconciliation
          </label>
        </div>
        <Input
          label="Display Order"
          id="paymentSourceOrder"
          type="number"
          min={0}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
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

function ArchiveConfirmModal({ isOpen, onClose, source, deptId }) {
  const [loading, setLoading] = useState(false);
  if (!source) return null;

  async function handleConfirm() {
    setLoading(true);
    try {
      await updateDocument(
        `departments/${deptId}/paymentSources/${source.id}`,
        { archived: !source.archived }
      );
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={source.archived ? 'Restore Payment Source' : 'Archive Payment Source'} size="sm">
      <p className="text-sm text-gray-600 mb-4">
        {source.archived ? (
          <>
            Restore <span className="font-semibold">{source.name}</span>? It will reappear in the expense modal dropdown.
          </>
        ) : (
          <>
            Archive <span className="font-semibold">{source.name}</span>? Existing transactions keep the value but it won't appear in the dropdown for new entries.
          </>
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={handleConfirm}>
          {source.archived ? 'Restore' : 'Archive'}
        </Button>
      </div>
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

function ArchiveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 010-4h14a2 2 0 010 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4" />
    </svg>
  );
}
