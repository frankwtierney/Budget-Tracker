import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  serverTimestamp,
} from '../../../lib/firestore';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import Modal from '../../shared/Modal';

// System-level org structure editor (Super Admin only). Reads the global
// departments / areas / buildings collections directly — NOT via the
// scope-limited BuildingContext — so a Super Admin sees the whole org.
//
// This is a maintenance surface over the structure that Setup seeds: rename
// an Area, add a Building, reassign a Building to a different Area. It edits
// the same documents the sidebar "Viewing" dropdown reads. Assigning who
// administers each node (the roles map) is a separate concern handled later.

const byCode = (a, b) => (a.code || '').localeCompare(b.code || '');

export default function StructureEditor() {
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loaded, setLoaded] = useState({ d: false, a: false, b: false });

  const [areaModal, setAreaModal] = useState(null); // null | { departmentId } | area
  const [buildingModal, setBuildingModal] = useState(null); // null | { areaId, departmentId } | building

  useEffect(() => {
    const unsubD = subscribeToCollection('departments', (docs) => {
      setDepartments(docs);
      setLoaded((s) => ({ ...s, d: true }));
    });
    const unsubA = subscribeToCollection('areas', (docs) => {
      setAreas(docs);
      setLoaded((s) => ({ ...s, a: true }));
    });
    const unsubB = subscribeToCollection('buildings', (docs) => {
      setBuildings(docs);
      setLoaded((s) => ({ ...s, b: true }));
    });
    return () => { unsubD(); unsubA(); unsubB(); };
  }, []);

  const loading = !loaded.d || !loaded.a || !loaded.b;

  // areaId -> buildings, and orphan buildings whose areaId matches no area.
  const { buildingsByArea, orphanBuildings } = useMemo(() => {
    const areaIds = new Set(areas.map((a) => a.id));
    const map = {};
    const orphans = [];
    for (const b of buildings) {
      if (b.areaId && areaIds.has(b.areaId)) {
        (map[b.areaId] ??= []).push(b);
      } else {
        orphans.push(b);
      }
    }
    Object.values(map).forEach((list) => list.sort(byCode));
    orphans.sort(byCode);
    return { buildingsByArea: map, orphanBuildings: orphans };
  }, [areas, buildings]);

  const areasByDept = useMemo(() => {
    const map = {};
    for (const a of areas) (map[a.departmentId] ??= []).push(a);
    Object.values(map).forEach((list) => list.sort(byCode));
    return map;
  }, [areas]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Structure</h2>
        <p className="text-sm text-gray-500">
          The org skeleton — Departments, their Areas, and which Buildings belong
          to each. Edits here update the same records the sidebar "Viewing"
          picker uses.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading structure…</div>
      ) : departments.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No departments found.</p>
          <p className="text-sm text-gray-400 mt-1">
            Run Setup to seed the initial structure.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {departments
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((dept) => (
              <DepartmentBlock
                key={dept.id}
                department={dept}
                areas={areasByDept[dept.id] ?? []}
                buildingsByArea={buildingsByArea}
                onAddArea={() => setAreaModal({ departmentId: dept.id })}
                onEditArea={(area) => setAreaModal(area)}
                onAddBuilding={(area) =>
                  setBuildingModal({ areaId: area.id, departmentId: dept.id })
                }
                onEditBuilding={(b) => setBuildingModal(b)}
              />
            ))}

          {orphanBuildings.length > 0 && (
            <div className="border border-amber-200 bg-amber-50/50 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                <span className="font-semibold text-amber-900 text-sm">
                  Unassigned buildings
                </span>
                <span className="ml-2 text-xs text-amber-700">
                  not linked to an existing area — edit to reassign
                </span>
              </div>
              <ul className="divide-y divide-amber-100">
                {orphanBuildings.map((b) => (
                  <BuildingRow key={b.id} building={b} onEdit={() => setBuildingModal(b)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <AreaModal
        isOpen={areaModal !== null}
        onClose={() => setAreaModal(null)}
        existing={areaModal && areaModal.id ? areaModal : null}
        departmentId={areaModal?.departmentId}
      />

      <BuildingModal
        isOpen={buildingModal !== null}
        onClose={() => setBuildingModal(null)}
        existing={buildingModal && buildingModal.id ? buildingModal : null}
        defaults={buildingModal && !buildingModal.id ? buildingModal : null}
        areas={areas}
        departments={departments}
      />
    </div>
  );
}

function DepartmentBlock({
  department,
  areas,
  buildingsByArea,
  onAddArea,
  onEditArea,
  onAddBuilding,
  onEditBuilding,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">
            {department.shortName || department.name}
          </span>
          <span className="text-xs text-gray-400">
            {areas.length} {areas.length === 1 ? 'area' : 'areas'}
          </span>
        </div>
        <Button variant="secondary" onClick={onAddArea}>+ Add Area</Button>
      </div>

      {areas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400 italic">No areas yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {areas.map((area) => {
            const buildings = buildingsByArea[area.id] ?? [];
            return (
              <div key={area.id}>
                <div className="flex items-center justify-between px-4 py-2.5 bg-white">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-gray-500 shrink-0">{area.code}</span>
                    <span className="text-sm font-medium text-gray-800 truncate">{area.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {buildings.length} {buildings.length === 1 ? 'building' : 'buildings'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onAddBuilding(area)}
                      title="Add building"
                      aria-label="Add building"
                      className="text-gray-400 hover:text-blue-600 p-1 rounded"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEditArea(area)}
                      title="Edit area"
                      aria-label="Edit area"
                      className="text-gray-400 hover:text-gray-700 p-1 rounded"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {buildings.length > 0 && (
                  <ul className="divide-y divide-gray-50 bg-gray-50/40">
                    {buildings.map((b) => (
                      <BuildingRow
                        key={b.id}
                        building={b}
                        indented
                        onEdit={() => onEditBuilding(b)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BuildingRow({ building, indented, onEdit }) {
  return (
    <li className={`flex items-center justify-between py-2 pr-4 ${indented ? 'pl-10' : 'pl-4'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-gray-400 shrink-0">{building.code}</span>
        <span className="text-sm text-gray-700 truncate">{building.name}</span>
        {building.type && (
          <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">
            {building.type}
          </span>
        )}
      </div>
      <button
        onClick={onEdit}
        title="Edit building"
        aria-label="Edit building"
        className="text-gray-400 hover:text-gray-700 p-1 rounded shrink-0"
      >
        <PencilIcon className="w-4 h-4" />
      </button>
    </li>
  );
}

function AreaModal({ isOpen, onClose, existing, departmentId }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setCode(existing?.code ?? '');
      setError('');
    }
  }, [isOpen, existing]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    if (!code.trim()) return setError('Code is required.');
    setLoading(true);
    try {
      if (existing) {
        await updateDocument(`areas/${existing.id}`, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
        });
      } else {
        await addDocument('areas', {
          departmentId,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          roles: {},
          createdAt: serverTimestamp(),
          createdBy: user?.uid ?? null,
          archivedAt: null,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(`Failed to save: ${err.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? 'Edit Area' : 'Add Area'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Code"
          id="areaCode"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ES"
          autoFocus
        />
        <Input
          label="Name"
          id="areaName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ellicott South"
        />
        {!existing && (
          <p className="text-xs text-gray-500">
            New areas start with no one assigned. Grant admins access in the
            access step (coming next).
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function BuildingModal({ isOpen, onClose, existing, defaults, areas, departments }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('');
  const [areaId, setAreaId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setCode(existing?.code ?? '');
      setType(existing?.type ?? '');
      setAreaId(existing?.areaId ?? defaults?.areaId ?? '');
      setError('');
    }
  }, [isOpen, existing, defaults]);

  // Area options grouped by department, so a reassign can cross any area.
  const deptName = (id) => {
    const d = departments.find((x) => x.id === id);
    return d?.shortName || d?.name || 'Department';
  };
  const areasByDept = useMemo(() => {
    const map = {};
    for (const a of areas) (map[a.departmentId] ??= []).push(a);
    Object.values(map).forEach((list) => list.sort(byCode));
    return map;
  }, [areas]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    if (!code.trim()) return setError('Code is required.');
    if (!areaId) return setError('Pick an area.');

    const targetArea = areas.find((a) => a.id === areaId);
    if (!targetArea) return setError('Selected area no longer exists.');

    setLoading(true);
    try {
      if (existing) {
        const areaChanged = existing.areaId !== areaId;
        const data = {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          type: type.trim() || null,
          areaId,
          departmentId: targetArea.departmentId,
        };
        // Moving to a different area invalidates any complex membership, which
        // is scoped to the old area. Clear the link; complex buildingIds
        // cleanup is handled when complex editing lands.
        if (areaChanged) data.complexId = null;
        await updateDocument(`buildings/${existing.id}`, data);
      } else {
        await addDocument('buildings', {
          departmentId: targetArea.departmentId,
          areaId,
          complexId: null,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          type: type.trim() || null,
          roles: {},
          settings: {},
          createdAt: serverTimestamp(),
          createdBy: user?.uid ?? null,
          archivedAt: null,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(`Failed to save: ${err.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Building' : 'Add Building'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Code"
            id="buildingCode"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="GRE"
            autoFocus
          />
          <div className="col-span-2">
            <Input
              label="Name"
              id="buildingName"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Greiner Hall"
            />
          </div>
        </div>

        <div>
          <label htmlFor="buildingArea" className="block text-sm font-medium text-gray-700 mb-1">
            Area
          </label>
          <select
            id="buildingArea"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select area —</option>
            {Object.entries(areasByDept).map(([deptId, deptAreas]) => (
              <optgroup key={deptId} label={deptName(deptId)}>
                {deptAreas.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {existing && existing.areaId !== areaId && areaId && (
            <p className="text-xs text-amber-700 mt-1">
              Reassigning this building to a different area.
            </p>
          )}
        </div>

        <Input
          label="Type"
          id="buildingType"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Residence Hall, Success Center, etc."
          helpText="Free text for now — becomes a picker once Building Types are defined."
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

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
    </svg>
  );
}
