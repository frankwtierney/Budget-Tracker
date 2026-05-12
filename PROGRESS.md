# BudgetHub — Progress Summary

_Last updated: 2026-05-12_

This document summarizes work completed on BudgetHub. Sections marked **unaudited** reflect uncommitted iteration that has not been line-by-line reviewed against the original spec.

---

## 1. Overview

**BudgetHub** (working name — final TBD) is a multi-building budget tracking web app for ResLife at the University at Buffalo. It replaces the legacy "TEMPLATE ResEd Area Budget" Google Sheets workbook with a real-time, multi-tenant web application.

**Design intent:** building-agnostic — "building" represents any tenant operational scope (Success Center, residence hall, department, cost center).

**Canonical spec docs:** `01_PROJECT_SPEC.md` and `02_BUILD_PLAN.md` live in the user's claude.ai web Project ("ResLife: BudgetHub App design"). They are not on disk and must be pasted into chat when needed.

---

## 2. Stack & Locations

- **Frontend:** React (Vite) + Tailwind CSS + React Context (no Redux/Zustand)
- **Backend:** Firebase (Auth, Firestore, Storage)
- **Hosting:** Netlify
- **Local path:** `/Users/frankwtierney/Budget-Tracker`
- **Firebase project ID:** `project-63f91202-2519-42dd-979`
- **Auth allowlist:** `@buffalo.edu`

---

## 3. Origins — The Workbook BudgetHub Replaces

BudgetHub is a direct port of the "TEMPLATE ResEd Area Budget" Google Sheet workbook, a SUNY/UB ResLife institutional template.

**Workbook structure:** TOC → SUMMARY → 10 monthly ledger tabs (AUG/SEP, OCT, NOV, DEC, JAN, FEB, MAR, APR, MAY, JUN/JUL) → AA Budgets → Lists → YEARLY Lists.

**Fiscal alignment:** Academic year (Aug → Jul), not SUNY's July 1–June 30. Fall = AUG/SEP–DEC, Spring = JAN–MAY, JUN/JUL as a third orphan period.

**Three-tier rollup (the architectural insight driving BudgetHub):**
1. **Category rollup** → SUMMARY (umbrella → sub-category → period)
2. **Per-CA rollup** → AA Budgets (per-person spending caps)
3. **Event rollup** — NEW in BudgetHub. The spreadsheet cannot answer "what did the Buffalo Zoo program cost across categories?" because transactions live under different categories with no thread connecting them. Event ID is the thread.

**11 umbrella categories** carried over from the workbook's Lists sheet: OFFICE SUPPLIES, PROGRAMS, SUBSCRIPTIONS, CONTRACTUAL SERVICES, PRINTING, MARKETING, FURNITURE, TEMP SERVICE - SA, TEMP SERVICES - TUTORS, PRO STAFF DEVELOPMENT, MISCELLANEOUS.

**Terminology:** Workbook used "AA" (Academic Assistant); the app uses **CA** (Community Assistant). "STAFF" column (workbook) = pro staff with the P-card; "AA" column = student staff the spend is attributed to. BudgetHub preserves this with `recordedBy` (pro staff) + `staffAllocations` array (CAs).

**Workbook flaws BudgetHub is meant to fix:** label drift between SUMMARY and Lists, propagating typos, sub-category data captured but not rolled up for 8/11 umbrellas, no JUN/JUL handling on AA Budgets, no event dimension, no audit trail, no variance/forecasting, no cross-center comparison.

---

## 4. Phase 1 MVP — Committed 2026-05-04

Single commit on `main`: `7b4c7af` *Initialize BudgetHub Phase 1 MVP*.

**Delivered in this commit:**
- Vite + React + Tailwind + Firebase scaffolding per spec
- Firebase Auth (email/password) with `@buffalo.edu` allowlist + forgot-password flow
- `AuthContext`, `BuildingContext`, `ProtectedRoute`, `AppShell` with sidebar nav
- Building setup wizard: creates buildings + fiscalYears docs, grants admin role
- Category editor: umbrellas + sub-categories with allocations
- Staff roster: add/edit/archive with `buildingCode` + personal budgets
- Expense modal: vendor typeahead with create-on-the-fly, cascading category select, multi-staff allocations with even-split default, Save & Add Another
- SUMMARY dashboard: Fall/Spring/Total matrix, color-coded burn rate, real-time Firestore listener
- Transactions ledger: filterable, void (admin), CSV export
- Staff Dashboard: spend vs. budget with click-through to transactions
- Vendor list: read-only with status, total spend, last used
- Firestore rules, composite indexes, storage rules, `netlify.toml`
- All Firestore writes routed through `src/lib/firestore.js` helper layer

**Spec changes acknowledged in the commit message:**
- `staffAllocations: []` array replaces the spec's single `chargedToStaffId`
- `buildingCode` field added to staffMembers (beyond spec)
- Sub-grouping tag on transactions driven by building's `subGroupingLabel` setting

---

## 5. Post-Phase-1 Expansion — Uncommitted (2026-05-04 → 2026-05-11)

Seven days of iterative work sits uncommitted after the Phase 1 commit. The repo currently has 18 modified files and 6 untracked files. The expansion is significant — much of it goes **beyond what the original Phase 1 spec described**.

### 5a. Data model expansion (unaudited)

The actual Firestore schema now is a **four-level hierarchy**, far beyond Phase 1's single-building model:

```
departments/{deptId}
  └─ fiscalYears/{fyId}            ← FY is department-scoped, NOT building-scoped
areas/{areaId}                      ← has departmentId
complexes/{cid}                     ← has departmentId, areaId, buildingIds
buildings/{bid}                     ← has departmentId, areaId, complexId
  ├─ categories/{catId}             (currently per-building; user wants dept-level)
  ├─ vendors/{vendorId}
  ├─ staffMembers/{staffId}
  ├─ events/{eventId}
  └─ transactions/{txId}
users/{uid}                         ← has departmentIds[], areaIds[], buildingIds[], complexIds[]
```

`src/lib/structure.js` (untracked) seeds the full UB ResLife hierarchy: 6 areas (Ellicott South/East, Governors, Main Street, Apartments, ResEd), 17 buildings, 2 complexes (Governors = LEH+DEW+ROO+CLI, FLEEK = FLK+CRK).

`BuildingContext.jsx` (now exported as both `useOrg` and the legacy `useBuilding`) is the single context that loads everything the user has access to. It carries a `scope` state — user pivots between department / area / complex / building views. FY is read from the active department, not the building.

### 5b. New files (untracked)

- `src/components/admin/AllocationEditor.jsx`
- `src/components/admin/StrategyTypeEditor.jsx`
- `src/lib/structure.js` (UB ResLife seed hierarchy)
- `src/pages/Events.jsx`
- `.firebaserc`
- `.env.local.webarchive` (probably a Safari side-effect; not application code)

### 5c. Modified files (committed Phase 1 versions diverge)

`.gitignore`, `firestore.indexes.json`, `firestore.rules`, `package.json`, `package-lock.json`, `src/App.jsx`, `src/components/admin/BuildingSettings.jsx`, `src/components/admin/CategoryEditor.jsx`, `src/components/admin/StaffRoster.jsx`, `src/components/admin/TransactionsView.jsx`, `src/components/expense/ExpenseModal.jsx`, `src/components/layout/AppShell.jsx`, `src/components/reports/StaffDashboard.jsx`, `src/components/reports/SummaryView.jsx`, `src/contexts/BuildingContext.jsx`, `src/lib/firestore.js`, `src/pages/Admin.jsx`, `src/pages/Setup.jsx`.

**Field-by-field drift in these files has not been audited.** User has noted seeing unfamiliar fields in forms, suggesting further deviations from the original spec.

### 5d. Other observed deviations

- **Phase 1 plan items not present:** `src/hooks/` directory missing (plan called for `useTransactions/useCategories/useStaff/useVendors/useEvents`; likely inlined into pages/components). `BuildingSelector.jsx` not yet built (reasonable while single-building MVP).
- **Beyond spec:** `ForgotPassword.jsx`, `ProtectedRoute.jsx`, `TransactionsView.jsx`.

---

## 6. Session — 2026-05-11

Focused work on the **Staff Dashboard expandable sub-row formatting**. The parent staff rows were perceived as "spread out" when collapsed, then columns shifted on expand because `table-layout: fixed` was not effectively applied and shared columns (Role / Strategy) carried text of very different lengths.

### Changes shipped

**`src/components/admin/StrategyTypeEditor.jsx`**
- Added a required `code` field (max 5 chars, force-uppercased) to the Strategy Type model + editor form
- Added a new **Code** column to the listing table (mono font, 20% width)

**`src/components/reports/StaffDashboard.jsx`**
- Subscribed to the `buildings/{bid}/vendors` collection so vendor names can be displayed alongside transactions
- Strategy sub-row column now renders `strategyType.code` (with full `name` retained as hover tooltip)
- **Removed the Description column** from sub-rows; col 5 is now empty in both parent and sub-rows, eliminating the asymmetric width that was forcing the table to recompute
- Added an info toggle (ⓘ icon) to the left of each transaction's Date. It only renders when the tx has a vendor or description
- Clicking ⓘ opens an inline sub-sub-row beneath that tx with `bg-blue-50` background, `text-[11px]` size, in the format: **`<Vendor Name>`** — `<description>` (either field can be missing)
- Replaced `table-fixed` Tailwind class with inline `style={{ tableLayout: 'fixed' }}` for guaranteed application
- Replaced Tailwind arbitrary `w-[X%]` `<col>` widths with inline `style={{ width: 'X%' }}` for the same reason
- Added an `InfoIcon` SVG helper

### Manual data follow-up needed (not yet done)

Existing strategy types now need their `code` field filled in via Admin → Strategy Types:
- Community Meeting → `CM`
- Community Meet Up → `CMU`
- Late Night Lounge → `LNL`
- Inclusive Community Meeting → `ICM`
- Take2 → `TK2`

---

## 7. This Session — 2026-05-12

Long session covering vendor-dedup polish, a vendor-stats race-safety refactor, a fix to a long-standing typeahead input bug, transactions-table layout overhaul, and a brand-new **Payment Sources** feature laying groundwork for Phase 2 reconciliation. Plus a couple of small UX nudges (icon row actions, archive hover color, staff name cleanup).

### Changes shipped

**Desktop launcher**
- Created `~/Desktop/Launch BudgetHub.command` — double-click to `cd` into the project, run `npm run dev`, and auto-open `http://localhost:5173` after 3s.

**Vendor deduplication (`src/components/admin/VendorList.jsx`, `src/components/expense/VendorTypeahead.jsx`)**
- Admin Add/Edit Vendor modal now blocks duplicates: same-scope name match (excluding self when editing), and cross-scope dept→building (prevents creating a building "Amazon" when a shared dept "Amazon" already exists).
- Both create paths (typeahead `+ Create` and admin modal) check **name AND aliases** — typing "Amazon.com" matches an existing "Amazon" with that alias.
- Archived vendors are detected in dedup with a hint to "edit it to restore."
- `UB_SEED_VENDORS` data structure now includes aliases (e.g. Amazon → `Amazon.com, AMZN Mktp, Amazon Marketplace`; Home Depot → `The Home Depot, HomeDepot.com`; JoAnn → `JOANN, Jo-Ann, Joann, Jo-Ann Fabric`; etc.).
- `handleSeed()` re-click now **backfills missing aliases** onto already-seeded dept vendors (idempotent), instead of just skipping.

**Vendor stats — dept-scope parity + race safety (`src/lib/firestore.js`, `src/components/expense/ExpenseModal.jsx`, `src/components/admin/VendorList.jsx`)**
- Exported Firestore `increment()` from `src/lib/firestore.js`.
- Refactored all three stats-update sites in `ExpenseModal` (same-vendor edit / vendor-switch edit / new transaction) to use `increment(±)` instead of cached-value + delta. Race-safe — multiple buildings logging the same dept-shared vendor concurrently no longer drop counts.
- Removed `scope === 'building'` gates so dept-scoped vendors also accumulate `transactionCount` / `totalSpend` / `lastUsedAt`.
- New `vendorPath()` helper resolves the right collection by scope.
- `VendorList` Shared (Department) table now shows the stats columns (`showStats` flipped to `true`).
- Admin Add Vendor modal no longer sets `lastUsedAt: serverTimestamp()` at create — that field is now only set by an actual expense entry, so truly-unused vendors correctly display `—`.

**Void now decrements vendor stats (`src/components/admin/TransactionsView.jsx`)**
- Added `paymentSources` and a `deptVendors` subscription. The `deptVendors` sub also fixed a **pre-existing display bug**: transactions referencing a dept-scoped vendor previously rendered as `—` in the vendor column because the lookup only had building vendors.
- `VoidModal.handleVoid()` now runs a batch that flips the transaction status AND decrements the vendor's denormalized counters via `increment(-1)` / `increment(-cost)`. Resolves drift where voided transactions kept inflating vendor totals.

**Recompute totals button (`src/components/admin/VendorList.jsx`)**
- New "Recompute totals" button in the Shared (Department) section header.
- Aggregates every non-voided transaction across all buildings in the dept (`where('departmentId', '==', deptId)`), groups by `vendorId`, computes `{ count, total, lastUsedAt }`, and writes fresh values onto every dept and building vendor.
- Vendors with zero matching transactions get reset to 0 — corrects orphan vendor docs left over from abandoned typeahead creates.
- Chunked into batches of 400 ops to stay under Firestore's 500-op batch limit.
- Idempotent — safe to re-run.

**Vendor typeahead input bug (`src/components/expense/VendorTypeahead.jsx`)**
- Fixed a long-standing bug where the Vendor input wiped each keystroke. The sync `useEffect` was firing on every parent re-render (`vendors` array got a new reference each render) and calling `setQuery('')` because `value` was momentarily `null` after `handleInputChange` called `onChange(null)`.
- Gated the effect to only set query when `value` is a real vendor id; never clears.

**UI nudges**
- **Staff names in expense modal** (`src/components/expense/StaffAllocations.jsx`): removed the `(buildingCode)` suffix — redundant since we're always in a single building's context.
- **Transactions table action buttons** (`src/components/admin/TransactionsView.jsx`): converted "Edit" / "Void" text labels to icon buttons (Pencil, Ban) with tooltips, matching the vendor list pattern. Added `BanIcon` SVG helper.
- **Archive icon hover color** (`src/components/admin/VendorList.jsx`): `amber-600` → `amber-500` — reads more clearly as orange (cautionary) instead of borderline red at 16px size.

**Transactions table layout overhaul (`src/components/admin/TransactionsView.jsx`)**
- Split the combined `Category / Subcategory` column into two separate columns. CSV export header gained a `Subcategory` field. `getCategoryLabel(tx)` → `getCategoryParts(tx)` returning `{ category, subcategory }`.
- Converted table from default auto-layout to **`table-fixed` with explicit pixel widths** per column, after iterating on `min-w` approaches that caused unpredictable column rebalancing (the user noticed Category getting pulled closer to Description when Subcategory's width was increased — root cause: extra width was being redistributed proportionally across all min-w columns).
- Locked widths: Date 110px / Vendor 220px / Category 150px / Subcategory 160px / Cost 120px / Status 80px / Actions 80px. **Description has no fixed width** — it absorbs all remaining container width, so adjusting any other column only affects Description.
- Cost cell gets `pl-4 pr-[41px]` (16 + 25 extra) for visual breathing room before the reconciling cluster.
- Cells with potentially long content (Vendor, Description, Category, Subcategory) got `truncate` + `title={value}` tooltip so clipped values reveal on hover.

**Payment Sources feature (NEW)**
- New dept-scoped Firestore collection: `departments/{deptId}/paymentSources`.
- **Firestore rules** (`firestore.rules`): read by any dept member, write by dept admin. Deployed via `npm run deploy:rules`.
- **Admin tab** (`src/components/admin/PaymentSourcesList.jsx`, new file): mirrors `StrategyTypeEditor` pattern. Add/Edit modal validates dup names AND dup codes. Archive (not delete) so existing transactions retain the reference. Code field auto-uppercased, max 4 chars. Has a `requiresReconciliation: bool` flag that flags which sources will land in the Phase 2 reconciliation queue.
- **Seed defaults button** seeds 6 defaults: PCard/`PCRD`, UBF Card/`UBF`, ShopBlue/`SHOP`, Concur/`CNCR`, IDI/`IDI`, Other/`OTHR`. First four are `requiresReconciliation: true`; IDI and Other are `false`.
- **Admin routing** (`src/pages/Admin.jsx`): new "Payment Sources" tab at `/admin/payment-sources`.
- **Transaction schema** (`src/components/expense/ExpenseModal.jsx`): new field `paymentSourceId: string | null`. Subscribed in modal (filters out archived). Persisted on create + edit. Preserved across "Save and Add Another" (since users typically batch-enter on the same card).
- **Expense modal UI**: Cost + Payment Source now share a 2-column grid. Dropdown shows full names with `(no reconcile)` suffix on non-reconciling sources so users know IDI is tagged-only.
- **Transactions table** (`src/components/admin/TransactionsView.jsx`): new "Source" column (90px) showing the 4-letter code as a `SourceBadge`. Indigo styling (`bg-indigo-50 text-indigo-700`) for reconciling sources, neutral gray for non-reconciling. Hovering shows the full name as tooltip. Empty source renders `—`.
- **Vertical divider**: 2px right border on the Cost column (`border-r-2 border-gray-300`) separates "general tracking" columns (Date → Cost) from "reconciling" columns (Source, Status, Actions).

**Memory + tooling**
- Saved `project_budgethub_deploy.md` to Claude Code memory so future sessions don't re-prompt for service-account setup. Indexed in `MEMORY.md`. The key fact: `npm run deploy:rules` works out of the box (firebase CLI session token persists from earlier `npx firebase login`); the service-account JSON path is closed by Google's `iam.disableServiceAccountKeyCreation` org policy on this project.

### Files touched

**New**
- `src/components/admin/PaymentSourcesList.jsx`
- `~/Desktop/Launch BudgetHub.command`
- `~/.claude/projects/-Users-frankwtierney/memory/project_budgethub_deploy.md`

**Modified**
- `src/lib/firestore.js`
- `src/components/admin/VendorList.jsx`
- `src/components/admin/TransactionsView.jsx`
- `src/components/expense/VendorTypeahead.jsx`
- `src/components/expense/ExpenseModal.jsx`
- `src/components/expense/StaffAllocations.jsx`
- `src/pages/Admin.jsx`
- `firestore.rules`

### Deploy status

`npm run deploy:rules` ran successfully — new `paymentSources` rule is live in production.

### Manual data follow-up needed (recommended, not blocking)

1. **Admin → Payment Sources → "Seed defaults"** — seeds the 6 default payment sources. Existing transactions keep `paymentSourceId: null` and render `—` in the Source column until edited.
2. **Admin → Vendors → "Seed institutional vendors"** (re-click) — backfills the new aliases onto already-seeded dept vendors. Idempotent.
3. **Admin → Vendors → "Recompute totals"** — backfills vendor stats from history. Useful since pre-existing dept vendors had no stats fields and voided transactions may have over-counted before today's fix landed.

### Discussed but explicitly deferred to Phase 2

Full reconciliation workflow: statement imports per source (Pcard / UBF / ShopBlue / Concur), reconciliation cycles, transaction-to-statement matching UI, discrepancy handling, audit trail (who reconciled what, when). Sized at ~2–3 weeks of focused work. Today's Payment Sources groundwork ensures historical data is tagged-by-source when that work lands; otherwise we'd have to retroactively bucket every old transaction.

### Things noticed but not fixed today

- The `lastUsedAt` field is no longer set on Admin Add Vendor (correct behavior), but `createVendorIfNew` in `ExpenseModal` still sets it at create time. Inconsequential because the immediately following transaction save overwrites it via `increment()` path — but if a user abandons the form, the vendor record exists with a misleading `lastUsedAt`. "Recompute totals" cleans this up.
- The vendor typeahead has a residual race condition: typing "Amazon" before the dept-vendor subscription's first snapshot lands lets the user create a building-scoped duplicate. Low frequency; deferred.
- Voiding marks `voidedAt`, and the Firestore rules block any subsequent update to a transaction with `voidedAt != null` — so un-voiding isn't possible at the data layer today. Intentional, just noting it.

---

## 8. Known Deviations & Open Decisions

**Confirmed accepted by user:**
- Email/password auth only — no Google sign-in. ("We are not a Google school.")

**Accepted per Phase 1 commit message:**
- `staffAllocations: []` array (multi-staff splits) replaces spec's single `chargedToStaffId`
- `staffMembers.buildingCode` field

**Pending user decision / not yet acted on:**
- Refactor categories from per-building (`buildings/{bid}/categories`) up to department level (`departments/{deptId}/categorySchemas`)
- Field-by-field audit of the 18 modified files from the 2026-05-04 → 2026-05-11 iteration
- Backfill `code` for existing Strategy Types (see Section 6)

---

## 9. Outstanding / Future Phases

Per `02_BUILD_PLAN.md` (canonical, not on disk):
- **Phase 2:** Multi-building support, reconciliation cycles, receipts uploads
- **Phase 3:** Forecasting, UB Linked event integration (API/URL pattern still unknown)
- **Phase 4 (stretch):** OCR for receipts, approval workflow, anything else

The data model expansion in Section 5a means much of the Phase 2 multi-building groundwork is already in place ahead of the original schedule — the schema supports it, even if UI affordances (e.g. `BuildingSelector.jsx`) are not yet built.

---

## 10. Project Conventions

- All Firestore writes route through `src/lib/firestore.js` helper layer (not direct SDK calls in components)
- All UI strings that would otherwise hardcode the project's brand name should live in one config constant — "BudgetHub" is a working name only
- Default to terminology from the original workbook when in doubt ("what would the workbook do here?")
- Do not propose Google OAuth / Firebase CLI Google login flows
