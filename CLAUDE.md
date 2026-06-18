# Budget-Tracker (BudgetHub)

Budget tracking web app for UB ResLife. Replaces the old "TEMPLATE ResEd Area
Budget" Google Sheet. Built with React + Firebase.

## Stack
- React 19 + Vite 8, React Router 7
- Tailwind CSS 3
- Firebase (Auth + Firestore); deployed via Netlify (`netlify.toml`)
- `date-fns` for dates

## Commands
- `npm run dev` — local dev server (Vite)
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint
- `npm run deploy:rules` — deploy Firestore security rules
- `npm run deploy:indexes` — deploy Firestore indexes
- `npm run deploy:firestore` — deploy both
  (firebase CLI is already logged in; these run without prompting)

## Layout
- `src/pages/` — one file per route: Dashboard, Transactions, Events, Vendors,
  Staff, Admin, Setup, Login, ForgotPassword
- `src/contexts/` — `AuthContext`, `BuildingContext`, `SystemContext` (global state)
- `src/lib/` — `firebase.js` (init), `firestore.js` (data access), `auth.js`,
  `structure.js` (org hierarchy helpers), `format.js`
- `firestore.rules`, `firestore.indexes.json`, `storage.rules` — Firebase config

## Data model
- Hierarchy: **Departments → Areas → Buildings/Complexes**
- Fiscal year lives at the **department** level
- Cross-building / shared things go at the **department** level, not a global top level
- Three-tier budget rollup: **category → CA → event**
- 11 umbrella categories
- Terminology: this project uses **CA** (formerly "AA")

## Conventions
- Prefer dropdowns/pickers over free-text for categorical fields; compose labels
  from parts and store the parts separately
- Keep UI compact — design tight enough to avoid scrolling
- Per-row actions (Edit/Delete/Archive) are icon buttons with tooltips, not text
- Filter row order: search first, specific filters middle, broad scope toggles last

## Notes
- The canonical product spec lives in the user's claude.ai web Project (paste-only,
  not in this repo). `PROGRESS.md` and `README.md` track local status.
- A graphify knowledge graph exists at `graphify-out/`; read
  `graphify-out/GRAPH_REPORT.md` before answering architecture questions, and run
  `graphify update .` after code changes.
