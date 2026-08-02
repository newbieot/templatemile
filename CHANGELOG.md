# Changelog

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
