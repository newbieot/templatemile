# Changelog
- Menambahkan template pelanggan PT JACCS MPM FINANCE INDONESIA (FINMPMJKT04120A), sub service 868523, layanan default PKH.

## 2026-07-31 — Mandatory review workflow

- Added mandatory correction mode when any cell contains “perlu dicek”.
- Automatically focuses the first unresolved cell after import.
- Locks setup/upload controls and non-review rows until all flagged cells are corrected or removed.
- Automatically advances to the next unresolved cell after correction.
- Keeps export unavailable until every flagged item has been resolved.

## 2026-07-31 — Flexible column editor v2

- Enlarges the complete active table column, not only its input element.
- Automatically centers the active column inside the horizontal table viewport.
- Restores the normal compact table when focus moves to another field.
- Uses a stronger cache-busting version so Cloudflare/browser caches load the new behavior.


## 2026-07-31 — Flexible cell editor

- Active table cells now expand automatically to show the complete text while editing.
- The expanded column returns to its normal compact width when focus moves to another cell.
- Expansion width updates live as the user types, including fields marked `perlu dicek`.

## 2026-07-31

- Added automatic detection and highlighting for cells containing “perlu dicek”.
- Added guided next-issue navigation and blocked export while review markers remain.
- Added per-row deletion with persistent table-state synchronization.
- Added PN Batam PE/PKH defaults for weekdays, Fridays, holidays, and H-1 holidays.
- Updated cache versions for deployment.

## 2026-07-25

- Complete responsive UI and UX redesign.
- Added four-step workflow guidance and clearer form grouping.
- Added inline workspace counts, readiness status, clear action, and export state.
- Added accessible drag-and-drop upload area and unsupported-file feedback.
- Replaced disruptive alert dialogs with toast notifications.
- Preserved corporate, retail, moving-goods, mapping, chargeable-weight, insurance, postal-code, and export logic.
- Added compact English PosNew Hub footer linked to posnew.com.
- Added favicon, web manifest, Open Graph cover, structured data, sitemap, robots, 404 page, and Cloudflare headers.
- Kept `beta.html` as a noindex experimental PDF workflow.
