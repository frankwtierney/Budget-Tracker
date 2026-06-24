// SA-editable position list. Lives on the single system/config doc under
// `positionDefs`. (Unrelated to the system/config `roles` map, which separately
// maps uid -> 'admin' for Super Admins.)
//
// A position is a job title (RHD, CD, CA…) that maps DIRECTLY to one access
// level the security rules enforce. There is no separate "role" layer: the
// access level is the capability (view/edit/admin), and SCOPE is decided by
// which structure node a person is assigned on — a dept-level assignment
// cascades down to its areas/buildings via firestore.rules. So "edit an area"
// vs "edit a department" is the same access level applied at a different node,
// not a distinct role.
//
//   positionDefs[] — { id, label, abbr, accessLevel, buildingTypeIds[], order }
//     label           — full title, e.g. "Residence Hall Director"
//     abbr            — short code shown in tight UI, e.g. "RHD"
//     accessLevel     — one of ACCESS_LEVELS' values (admin/member/viewer)
//     buildingTypeIds — optional; limits where the title appears when assigning.
//                       Empty/absent means "any building type".

// The three enforcement levels firestore.rules already gate on, ordered least
// to most. `value` is what gets written into node roles maps. Each level is
// cumulative: Edit implies View, Admin implies Edit.
export const ACCESS_LEVELS = [
  { value: 'viewer', label: 'View' },
  { value: 'member', label: 'Edit' },
  { value: 'admin', label: 'Admin' },
];

export const ACCESS_LEVEL_VALUES = ACCESS_LEVELS.map((l) => l.value);

export function accessLevelLabel(value) {
  return ACCESS_LEVELS.find((l) => l.value === value)?.label ?? value;
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// Coerce whatever is on the doc into a stable, sorted list. Also migrates the
// legacy single `buildingTypeId` field to the `buildingTypeIds` array.
export function normalizeRoleConfig(systemDoc) {
  const positionDefs = (Array.isArray(systemDoc?.positionDefs) ? systemDoc.positionDefs : [])
    .map((p) => ({
      ...p,
      abbr: p.abbr ?? '',
      buildingTypeIds: Array.isArray(p.buildingTypeIds)
        ? p.buildingTypeIds
        : p.buildingTypeId
          ? [p.buildingTypeId]
          : [],
    }))
    .sort(byOrder);
  return { positionDefs };
}

export function positionById(positionDefs, positionId) {
  return positionDefs.find((p) => p.id === positionId) ?? null;
}

// True if a position is offered for the given building type. A position with no
// building types restricts nothing and applies everywhere.
export function positionAppliesToType(position, buildingTypeId) {
  const ids = position?.buildingTypeIds ?? [];
  return ids.length === 0 || ids.includes(buildingTypeId);
}

// The enforcement level a position grants. Returns null if the position is
// missing or has no level set.
export function accessLevelForPosition(positionDefs, positionId) {
  return positionById(positionDefs, positionId)?.accessLevel ?? null;
}
