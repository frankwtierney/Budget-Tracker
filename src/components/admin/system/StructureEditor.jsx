import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSystem } from '../../../contexts/SystemContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  serverTimestamp,
  getBatch,
  batchUpdate,
} from '../../../lib/firestore';
import { useTerm } from '../../../lib/terminology';
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

// Above this many types the radio matrix gets too wide — fall back to a
// per-row dropdown instead of one radio column per type.
const MATRIX_MAX_TYPES = 6;

export default function StructureEditor() {
  const { systemDoc } = useSystem();
  const term = useTerm();
  const buildingTypes = useMemo(
    () => (systemDoc?.buildingTypes ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [systemDoc]
  );
  const typesById = useMemo(
    () => Object.fromEntries(buildingTypes.map((t) => [t.id, t])),
    [buildingTypes]
  );

  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loaded, setLoaded] = useState({ d: false, a: false, b: false });

  const [areaModal, setAreaModal] = useState(null); // null | { departmentId } | area
  const [buildingModal, setBuildingModal] = useState(null); // null | { areaId, departmentId } | building
  const [mode, setMode] = useState('view'); // 'view' | 'assign' (bulk type matrix)

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Structure</h2>
          <p className="text-sm text-gray-500">
            The org skeleton — {term.department.many}, their {term.area.many}, and
            which {term.building.many} belong to each. Edits here update the same
            records the sidebar "Viewing" picker uses.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setMode((m) => (m === 'assign' ? 'view' : 'assign'))}
          disabled={mode !== 'assign' && buildingTypes.length === 0}
          title={
            buildingTypes.length === 0
              ? 'Add building types first (Building Types tab)'
              : undefined
          }
        >
          {mode === 'assign' ? 'Done' : 'Assign Types'}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading structure…</div>
      ) : departments.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No {term.department.many.toLowerCase()} found.</p>
          <p className="text-sm text-gray-400 mt-1">
            Run Setup to seed the initial structure.
          </p>
        </div>
      ) : mode === 'assign' ? (
        <AssignTypesView
          departments={departments}
          areasByDept={areasByDept}
          buildingsByArea={buildingsByArea}
          orphanBuildings={orphanBuildings}
          buildingTypes={buildingTypes}
        />
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
                typesById={typesById}
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
                  Unassigned {term.building.many.toLowerCase()}
                </span>
                <span className="ml-2 text-xs text-amber-700">
                  not linked to an existing {term.area.one.toLowerCase()} — edit to reassign
                </span>
              </div>
              <ul className="divide-y divide-amber-100">
                {orphanBuildings.map((b) => (
                  <BuildingRow
                    key={b.id}
                    building={b}
                    typesById={typesById}
                    onEdit={() => setBuildingModal(b)}
                  />
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
        buildingTypes={buildingTypes}
      />
    </div>
  );
}

function DepartmentBlock({
  department,
  areas,
  buildingsByArea,
  typesById,
  onAddArea,
  onEditArea,
  onAddBuilding,
  onEditBuilding,
}) {
  const term = useTerm();
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">
            {department.shortName || department.name}
          </span>
          <span className="text-xs text-gray-400">
            {areas.length} {areas.length === 1 ? term.area.one.toLowerCase() : term.area.many.toLowerCase()}
          </span>
        </div>
        <Button variant="secondary" onClick={onAddArea}>+ Add {term.area.one}</Button>
      </div>

      {areas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400 italic">No {term.area.many.toLowerCase()} yet.</p>
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
                      {buildings.length} {buildings.length === 1 ? term.building.one.toLowerCase() : term.building.many.toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onAddBuilding(area)}
                      title={`Add ${term.building.one.toLowerCase()}`}
                      aria-label={`Add ${term.building.one.toLowerCase()}`}
                      className="text-gray-400 hover:text-blue-600 p-1 rounded"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEditArea(area)}
                      title={`Edit ${term.area.one.toLowerCase()}`}
                      aria-label={`Edit ${term.area.one.toLowerCase()}`}
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
                        typesById={typesById}
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

function BuildingRow({ building, typesById, indented, onEdit }) {
  const term = useTerm();
  const typeName = building.typeId ? typesById?.[building.typeId]?.name : null;
  // Fixed columns — code | name | type | edit. The name track is a fixed width
  // so the type pills always start at the same x and read as a clean
  // left-aligned strip; the trailing 1fr is slack that the edit icon parks at
  // the far-right end of (justify-self-end below).
  return (
    <li
      className={`grid grid-cols-[auto_14rem_auto_1fr] items-center gap-2 py-2 pr-4 ${
        indented ? 'pl-10' : 'pl-4'
      }`}
    >
      <span className="font-mono text-xs text-gray-400">{building.code}</span>
      <span className="text-sm text-gray-700 truncate">{building.name}</span>
      {typeName ? (
        <span className="justify-self-start text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-full">
          {typeName}
        </span>
      ) : (
        <span className="justify-self-start text-xs text-gray-300">—</span>
      )}
      <button
        onClick={onEdit}
        title={`Edit ${term.building.one.toLowerCase()}`}
        aria-label={`Edit ${term.building.one.toLowerCase()}`}
        className="justify-self-end text-gray-400 hover:text-gray-700 p-1 rounded"
      >
        <PencilIcon className="w-4 h-4" />
      </button>
    </li>
  );
}

function AreaModal({ isOpen, onClose, existing, departmentId }) {
  const { user } = useAuth();
  const term = useTerm();
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
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? `Edit ${term.area.one}` : `Add ${term.area.one}`} size="sm">
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
            New {term.area.many.toLowerCase()} start with no one assigned. Grant
            admins access in the access step (coming next).
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

function BuildingModal({ isOpen, onClose, existing, defaults, areas, departments, buildingTypes }) {
  const { user } = useAuth();
  const term = useTerm();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [typeId, setTypeId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setCode(existing?.code ?? '');
      setTypeId(existing?.typeId ?? '');
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
          typeId: typeId || null,
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
          typeId: typeId || null,
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
      title={existing ? `Edit ${term.building.one}` : `Add ${term.building.one}`}
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
            {term.area.one}
          </label>
          <select
            id="buildingArea"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select {term.area.one.toLowerCase()} —</option>
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

        <div>
          <label htmlFor="buildingType" className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select
            id="buildingType"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— None —</option>
            {buildingTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {buildingTypes.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              No building types defined yet — add them in the Building Types tab.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Bulk "Assign Types" matrix mode ----
// Same Dept → Area → Building grouping, but each building row becomes a
// single-select radio matrix (one column per type). Clicking a cell autosaves
// immediately; clicking a type heading bulk-sets every building in that group.
// Falls back to a per-row dropdown when there are more types than fit cleanly.

function AssignTypesView({ departments, areasByDept, buildingsByArea, orphanBuildings, buildingTypes }) {
  const term = useTerm();
  return (
    <div className="space-y-5">
      <div className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
        Click a circle to set a {term.building.one.toLowerCase()}'s type — it saves
        instantly. Click a type heading to set every {term.building.one.toLowerCase()} in
        that group at once.
      </div>

      {departments
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((dept) => {
          const deptAreas = areasByDept[dept.id] ?? [];
          return (
            <div key={dept.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <span className="font-semibold text-gray-800">
                  {dept.shortName || dept.name}
                </span>
              </div>
              {deptAreas.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400 italic">No {term.area.many.toLowerCase()} yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {deptAreas.map((area) => {
                    const bs = buildingsByArea[area.id] ?? [];
                    return (
                      <div key={area.id} className="px-3 py-3">
                        <div className="px-1 pb-1 text-xs font-medium text-gray-500">
                          <span className="font-mono">{area.code}</span> — {area.name}
                        </div>
                        {bs.length === 0 ? (
                          <p className="px-1 text-sm text-gray-400 italic">No {term.building.many.toLowerCase()}.</p>
                        ) : (
                          <AssignAreaTable
                            groupName={area.code}
                            buildings={bs}
                            buildingTypes={buildingTypes}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      {orphanBuildings.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <span className="font-semibold text-amber-900 text-sm">Unassigned {term.building.many.toLowerCase()}</span>
          </div>
          <div className="px-3 py-3">
            <AssignAreaTable
              groupName="Unassigned"
              buildings={orphanBuildings}
              buildingTypes={buildingTypes}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AssignAreaTable({ groupName, buildings, buildingTypes }) {
  const term = useTerm();
  const [savingId, setSavingId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const useDropdown = buildingTypes.length > MATRIX_MAX_TYPES;

  async function setOne(buildingId, typeId) {
    setSavingId(buildingId);
    try {
      await updateDocument(`buildings/${buildingId}`, { typeId: typeId || null });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingId(null);
    }
  }

  async function setAll(typeId) {
    if (buildings.length === 0) return;
    setBulkBusy(true);
    try {
      const batch = getBatch();
      buildings.forEach((b) =>
        batchUpdate(batch, `buildings/${b.id}`, { typeId: typeId || null })
      );
      await batch.commit();
    } catch (err) {
      console.error(err);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">
              {term.building.one}
              {bulkBusy && <span className="ml-2 normal-case text-gray-400">saving…</span>}
            </th>
            {useDropdown ? (
              <th className="px-2 py-2 text-right">
                <span className="text-xs text-gray-400 mr-2">Set all</span>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setAll(v === '__none__' ? '' : v);
                  }}
                  aria-label={`Set type for all buildings in ${groupName}`}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">—</option>
                  {buildingTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                  <option value="__none__">None</option>
                </select>
              </th>
            ) : (
              <>
                {buildingTypes.map((t) => (
                  <th key={t.id} className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setAll(t.id)}
                      title={`Set all in ${groupName} to ${t.name}`}
                      className="text-xs font-medium text-gray-500 hover:text-blue-600"
                    >
                      {t.name}
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setAll('')}
                    title={`Clear type for all in ${groupName}`}
                    className="text-xs font-medium text-gray-400 hover:text-gray-600"
                  >
                    None
                  </button>
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {buildings.map((b) => (
            <tr key={b.id} className={`hover:bg-gray-50 ${savingId === b.id ? 'opacity-60' : ''}`}>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="font-mono text-xs text-gray-400 mr-2">{b.code}</span>
                <span className="text-gray-700">{b.name}</span>
              </td>
              {useDropdown ? (
                <td className="px-2 py-2 text-right">
                  <select
                    value={b.typeId ?? ''}
                    onChange={(e) => setOne(b.id, e.target.value)}
                    aria-label={`Type for ${b.name}`}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— None —</option>
                    {buildingTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </td>
              ) : (
                <>
                  {buildingTypes.map((t) => (
                    <td key={t.id} className="px-2 py-2 text-center">
                      <input
                        type="radio"
                        name={`type-${b.id}`}
                        checked={b.typeId === t.id}
                        onChange={() => setOne(b.id, t.id)}
                        aria-label={`${b.name}: ${t.name}`}
                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <input
                      type="radio"
                      name={`type-${b.id}`}
                      checked={!b.typeId}
                      onChange={() => setOne(b.id, '')}
                      aria-label={`${b.name}: no type`}
                      className="h-4 w-4 text-gray-400 border-gray-300 focus:ring-gray-400 cursor-pointer"
                    />
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
