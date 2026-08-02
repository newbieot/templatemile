## 2026-08-02 · Server Secret deployment marker (v14)
- Removed all user-facing API-key and Base-URL controls.
- Added a visible `Server Secret · v14` marker so the deployed frontend can be verified immediately.
- Continued using `env.COSMOS_API_KEY` exclusively in `_worker.js`.
- Updated health-check and asset cache versions to `20260802-14`.

## 2026-08-02 · Cloudflare server secret (v13)
- Removed manual API-key input from the browser.
- Cloudflare Worker now reads `COSMOS_API_KEY` from encrypted Pages secrets.
- Removed direct-browser fallback to CosmosHub so the key never reaches users.
- Added `/api/health` field `cosmosConfigured` and updated version to `20260802-13`.
- Updated UI wording to neutral AI service labels.

## 2026-08-02 · Gemini default, PDF bulk reference, review row UX (v12)
- Changed the default vision model to `gemini-3.6-flash` and reset the non-secret session configuration version.
- Replaced model-branded PDF progress wording with neutral “AI sedang bekerja”.
- Added a bulk No Ref editor for all rows originating from AI-processed PDFs, including an explicit clear-all action.
- Added always-visible sticky NO column, row-numbered review badges, review alert row lists, and active correction location labels.
- Updated cache and health-check versions to `20260802-12`.

## 2026-08-02 · Remove BNI processing mode (v11)
- Removed the dedicated BNI/dot-matrix mode and its automatic activation by template or filename.
- PDF extraction now sends one optimized image per page instead of BNI dual-image payloads.
- Removed BNI full-audit behavior; verification follows the selected speed preset only.
- Retained lightweight global cleanup for `KEPADA YTH`, standalone placeholder codes such as `000000`, and OCR artifacts such as `DONGDOI`.
- Reduced request payload size, expected token use, rendering overhead, and processing time.
- Updated cache, health-check, and session configuration versions to `20260802-11`.

## 2026-08-02 · Vision-only model list (v10)
- Restricted CosmosHub PDF model selection to proven vision-capable models only: Claude Opus 5, Claude Sonnet 4.5, Claude Haiku 4.5, Gemini 3.6 Flash, Gemini 3.5 Flash, and Gemini 3.1 Pro.
- Removed text-only / unverified models from the dropdown to prevent empty extraction results and mass `PERLU DICEK` rows.
- Worker now rejects non-vision models for PDF requests.
- Updated cache, health-check, and session configuration versions to `20260802-10`.

# Changelog

## 2026-08-02 · v9

- Added `muse-spark-1.1` to the visible CosmosHub model selector.
- Expanded the selector to show every model already accepted by the browser and Cloudflare Worker allowlists.
- Grouped models by provider/family for easier comparison.
- Added a warning that a Healthy text endpoint does not guarantee image/PDF vision support.
- Updated cache, health-check, and session configuration versions to `20260802-9`.

## 2026-08-02 — Claude Opus 5 adaptive extraction v8

- Changed the default CosmosHub model to `claude-opus-5`.
- Added adaptive extraction for documents that may contain Nomor HP, Nomor Surat, both fields, or neither field on each page.
- Added phone normalization for visible Indonesian `08...` and `+62...` numbers while rejecting postal codes, branch numbers, transaction numbers, and standalone BNI codes.
- Added speed presets while keeping page and concurrency controls editable:
  - **Sedang**: 5 pages × 2 parallel requests with a full second audit.
  - **Cepat**: 10 pages × 4 parallel requests with an adaptive second audit.
  - **Turbo**: 10 pages × 6 parallel requests with one-pass extraction.
- Removed the previous forced two-page limit for BNI documents so the user can test 10-page batches.
- Added automatic document mode: BNI rules activate from the selected BNI template or PDF filename; other PDFs use the general document profile.
- Tuned image size and audit behavior per speed preset to balance accuracy, payload size, and processing time.
- Updated health-check and browser-cache version to `20260802-8`.

## 2026-08-02 — BNI standalone-code removal v7

- Standalone 5–8 digit BNI codes such as `000000`, `001001`, and `002017` are now discarded completely.
- The ignored code is not written to Name, Address, or Nomor Surat.
- OCR inventions such as `DONGDOI`, `DONGD01`, and `OOOOOO` are removed without creating a mandatory correction when they only represent the unused code line.
- Locality and postal-address lines after the ignored code remain part of Alamat Penerima.
- Nomor Surat remains blank unless a genuine reference with a clear letter/number pattern and separator is visible.

## 2026-08-02 — BNI benchmark extraction v6

- Added a dedicated BNI/dot-matrix mode calibrated against a 12-page reference benchmark.
- Sends both the original-color crop and a high-contrast zoom for every page.
- Uses two pages per request and a mandatory independent second audit for BNI mode.
- Added BNI layout grammar: `KEPADA YTH` → recipient name → street/building → 5–8 digit reference → locality/postal address.
- Preserves valid references such as `000000`, `001001`, and `002017`.
- Rejects OCR hallucinations such as `DONGDOI` and converts them into mandatory `PERLU DICEK` corrections.
- Added `raw_lines` transcription so deterministic browser-side parsing can repair field placement.
- Prefers the postal code printed in the document instead of replacing it with a locality lookup.
- Automatically appends `BATAM` before a printed 294xx postal code when the city word is omitted.
- BNI mode activates automatically when the BNI customer template is selected or the PDF filename contains BNI.

## 2026-08-02 — Accuracy-first PDF extraction v5

- Added automatic blank-margin cropping, higher-resolution rendering, grayscale enhancement, and stronger JPEG quality for low-quality scans.
- Labelled every image with its exact PDF page number before sending it to the model.
- Replaced the generic prompt with the user's proven Excel extraction instruction plus strict field-separation rules.
- Explicitly removes `KEPADA YTH/YTH/ATTN` from recipient names.
- Explicitly ignores `CABANG/CARRIAGE/245 BATAM` and transaction footer labels.
- Leaves `Nomor Surat` blank unless a real letter/reference number is visible.
- Removes standalone zero placeholders instead of allowing them to become invented words.
- Added confidence and uncertain-field output.
- Added three modes: fast, balanced smart verification, and full double-check.
- The default balanced mode automatically performs a second AI audit only for blurry or suspicious groups.
- Changed the recommended default from 6 to 4 pages per request to reduce name/address mixing.
- Added deterministic cleanup that splits address text accidentally merged into the recipient name.

## 2026-08-02 — PDF to MILE via manual AI API key

- Added PDF uploads to the main `mile.posnew.com` workflow.
- Added manual API configuration for OpenAI-compatible and Anthropic Messages endpoints.
- Defaulted the model field to `claude-sonnet-4.5` while keeping it editable.
- Added a Cloudflare Pages Function proxy so browser CORS does not block provider requests.
- Kept API keys in tab memory only and excluded them from browser storage and exports.
- Rendered PDF pages to images and processed them in configurable 2–5 page batches.
- Added strict JSON extraction, page-order merging, token-usage display, cancellation, limits, and error handling.
- Sent uncertain OCR text into the existing mandatory `PERLU DICEK` checklist workflow.
- Added an outside-Batam row badge when the AI explicitly identifies the destination as outside Kota Batam.

## 2026-07-31 — Koreksi wajib tanpa perpindahan otomatis

- Penanda `perlu dicek` tetap aktif selama pengguna masih mengetik.
- Satu huruf pertama tidak lagi mengunci baris atau memindahkan fokus ke masalah berikutnya.
- Koreksi baru dianggap selesai setelah nilai berubah dan pengguna pindah kolom atau menekan Enter.
- Tidak ada field pengaturan maupun baris tabel yang dikunci; hanya ekspor yang tetap dibatasi sampai semua koreksi selesai.
- Fokus awal hanya menyorot frasa `perlu dicek`, sehingga bagian nomor surat atau teks lain di belakangnya tetap dipertahankan.
- Navigasi ke koreksi berikutnya hanya dilakukan lewat tombol **Koreksi berikutnya**.

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

## 2026-07-31 — Koreksi wajib v3

- Menghapus penyelesaian koreksi otomatis saat mengetik, blur, pindah kolom, atau menekan Enter.
- Menambahkan tombol centang `Tandai selesai & lanjut` sebagai satu-satunya cara menutup status koreksi.
- Fokus baru berpindah ke bagian berikutnya setelah pengguna menekan tombol centang.
- Sel tetap dapat diedit setelah ditandai selesai dan tidak pernah dikunci.
## 2026-07-31 — Koreksi wajib v4

- Menjaga sorotan dan hitungan koreksi selama frasa “perlu dicek” masih ada.
- Tombol checklist hanya aktif setelah isi berubah, tidak kosong, dan frasa penanda sudah dihapus/diganti.
- Menolak konfirmasi apabila pengguna hanya menambah teks tetapi masih menyisakan “perlu dicek”.
- Membuka kembali status koreksi apabila frasa penanda muncul lagi pada sel yang sebelumnya selesai.
- Memperkuat highlight sel wajib koreksi dengan label visual yang jelas.


## 2026-08-02 — PDF besar dan pemrosesan paralel

- Batas satu PDF dinaikkan menjadi 300 halaman dan 120 MB.
- Default pemrosesan diubah menjadi 6 halaman per permintaan dengan 4 permintaan paralel.
- Pengguna dapat memilih 2–10 halaman per permintaan dan 1–6 jalur paralel.
- Hasil kelompok halaman tetap digabung sesuai urutan halaman asli.
- Ditambahkan percobaan ulang otomatis untuk rate limit, gangguan provider, dan respons JSON terpotong.
- Tombol batal sekarang menghentikan seluruh permintaan paralel.
- Progres menampilkan jumlah kelompok selesai, jumlah baris sementara, penggunaan token, dan estimasi waktu tersisa.

## 2026-08-02 — CosmosHub gateway fix

- Replaced the Pages Functions directory with a single Cloudflare Pages Advanced Mode `_worker.js`.
- Added `GET /api/health` for deployment verification.
- Fixed CosmosHub requests to use `https://api.cosmoshub.tech/v1/chat/completions` and Bearer authentication.
- Added automatic direct-to-CosmosHub fallback when the Cloudflare proxy route returns a gateway/network failure.
- Prevented complete Cloudflare HTML error pages from being displayed to users.
- Locked the interface to CosmosHub OpenAI-compatible format and added a CosmosHub model selector.
- Updated browser cache versions to `20260802-3`.
