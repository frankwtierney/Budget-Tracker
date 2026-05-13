// UB Campus Living - Residential Life starter structure.
// Seeded by the "Load default structure" button on the Setup page.

export const DEFAULT_DEPARTMENT = {
  name: 'UB Campus Living - Residential Life',
  shortName: 'UB ResLife',
};

// Areas in display order. ResEd has no buildings (central admin).
export const DEFAULT_AREAS = [
  { code: 'ES', name: 'Ellicott South' },
  { code: 'EE', name: 'Ellicott East' },
  { code: 'GOV', name: 'Governors' },
  { code: 'MS', name: 'Main Street' },
  { code: 'APT', name: 'Apartments' },
  { code: 'ResEd', name: 'Residential Education' },
];

// Buildings keyed by parent area code.
export const DEFAULT_BUILDINGS = [
  { code: 'GRE', name: 'Greiner Hall', areaCode: 'ES' },
  { code: 'FAR', name: 'Fargo Quad', areaCode: 'ES' },
  { code: 'EVA', name: 'Evans Quad', areaCode: 'ES' },
  { code: 'RED', name: 'Red Jacket Quad', areaCode: 'ES' },

  { code: 'WIL', name: 'Wilkeson Quad', areaCode: 'EE' },
  { code: 'SPA', name: 'Spaulding Quad', areaCode: 'EE' },
  { code: 'RIC', name: 'Richmond Quad', areaCode: 'EE' },

  { code: 'LEH', name: 'Lehman Hall', areaCode: 'GOV' },
  { code: 'DEW', name: 'Dewey Hall', areaCode: 'GOV' },
  { code: 'ROO', name: 'Roosevelt Hall', areaCode: 'GOV' },
  { code: 'CLI', name: 'Clinton Hall', areaCode: 'GOV' },

  { code: 'GOO', name: 'Goodyear Hall', areaCode: 'MS' },
  { code: 'CLE', name: 'Clement Hall', areaCode: 'MS' },

  { code: 'SLV', name: 'South Lake Village', areaCode: 'APT' },
  { code: 'HAD', name: 'Hadley Village', areaCode: 'APT' },
  { code: 'FNT', name: 'Flickinger Village', areaCode: 'APT' },
  { code: 'FLK', name: 'Flint Village', areaCode: 'APT' },
  { code: 'CRK', name: 'Creekside Village', areaCode: 'APT' },
];

// Complexes group buildings that operate as one staffing unit.
// Each building's budget stays separate; the complex is for display + shared staff.
export const DEFAULT_COMPLEXES = [
  { code: 'GOV', name: 'Governors', areaCode: 'GOV', buildingCodes: ['LEH', 'DEW', 'ROO', 'CLI'] },
  { code: 'FLEEK', name: 'FLEEK', areaCode: 'APT', buildingCodes: ['FLK', 'CRK'] },
];

// Helper for the role check on a single doc.
export function roleOn(doc, uid) {
  return doc?.roles?.[uid] ?? null;
}

export function isMemberOf(doc, uid) {
  const r = roleOn(doc, uid);
  return r === 'admin' || r === 'member' || r === 'viewer';
}

export function isEditorOf(doc, uid) {
  const r = roleOn(doc, uid);
  return r === 'admin' || r === 'member';
}

export function isAdminOf(doc, uid) {
  const r = roleOn(doc, uid);
  return r === 'admin';
}
