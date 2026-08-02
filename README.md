# MILE Bulk Converter — PosNew Hub

A browser-based utility for converting PDF, Excel, and CSV recipient lists into an editable PosIND MILE bulk-upload workbook.

## Deployment

Deploy the repository root directly to Cloudflare Pages.

- Build command: none
- Output directory: repository root
- Custom domain: `mile.posnew.com`
- Server entry: `_worker.js` (Cloudflare Pages Advanced Mode)

The Worker serves all static files through `env.ASSETS` and exposes:

- `GET /api/health` — proxy health check
- `POST /api/ai-proxy` — CosmosHub OpenAI-compatible proxy

## CosmosHub PDF extraction

The PDF panel is configured specifically for CosmosHub:

- Base URL: `https://api.cosmoshub.tech/v1`
- Endpoint: `/chat/completions`
- Authentication: `Authorization: Bearer <API_KEY>`
- Default model: `gemini-3.6-flash`

The API key is entered manually and kept only in current-tab memory. It is not stored in GitHub, localStorage, sessionStorage, or the exported workbook.

The browser first uses the Cloudflare Worker proxy. If that route returns a gateway/network failure, the application automatically tries a direct browser request to CosmosHub. A concise error is shown instead of dumping a complete Cloudflare HTML error page.

## Large PDF processing

- Maximum: 300 pages and 120 MB per PDF
- Default speed preset: **Cepat** — 10 pages per request, 4 parallel requests, adaptive second audit
- Preset **Sedang**: 5 pages, 2 parallel requests, full second audit
- Preset **Turbo**: 10 pages, 6 parallel requests, one-pass extraction
- Page and concurrency values remain manually editable: 1–10 pages and 1–6 parallel requests
- A 50-page PDF becomes five request groups when using 10 pages per request
- Failed batches are retried up to three times
- Results are merged back into original page order

PDF pages are automatically cropped and labelled by page number. Automatic document mode activates the dedicated BNI/dot-matrix rules when the BNI template is selected or the filename contains `BNI`; other files use the general document profile. Standalone BNI codes such as `000000` are discarded because they are not needed, and OCR inventions such as `DONGDOI` are prevented from entering output fields.

Each page is handled independently and may contain a recipient phone number, a letter/reference number, both, or neither. Phone and reference fields remain blank when they are not visibly present; the MILE export normalizes an absent phone according to its existing output rules.

Only the current image batch is sent to CosmosHub.

## Mandatory review workflow

- `PERLU DICEK` markers are highlighted as mandatory corrections.
- Typing does not automatically complete a correction or move focus.
- The user must remove/replace the marker and click **Tandai selesai & lanjut**.
- Export remains disabled until every flagged correction is explicitly confirmed.
- Active columns expand temporarily to show long text in full.
- Rows can be deleted from the **Aksi** column.
- Addresses explicitly identified outside Batam receive a **Luar Batam** badge.

## Existing business rules

- Excel and CSV remain processed locally in the browser.
- Pengadilan Negeri Batam defaults to PE on normal Monday–Thursday workdays and PKH on Fridays, national holidays, collective leave, and H-1 holidays according to the configured 2026 calendar.
- Corporate, retail, moving-goods, insurance, postal-code mapping, chargeable-weight, and MILE export logic remain available.

## Model selector

Dropdown PDF hanya menampilkan model vision yang telah lolos uji. `gemini-3.6-flash` menjadi default, dengan Claude Opus/Sonnet/Haiku dan Gemini lain tetap tersedia sebagai pilihan.

## Vision-only CosmosHub list

Untuk fitur PDF AI, dropdown model sekarang dibatasi hanya pada model vision yang sudah lolos uji di CosmosHub: Claude Opus 5, Claude Sonnet 4.5, Claude Haiku 4.5, Gemini 3.6 Flash, Gemini 3.5 Flash, dan Gemini 3.1 Pro. Model text-only / belum tervalidasi disembunyikan agar tidak menghasilkan output kosong.

## Pemrosesan tanpa mode BNI

Mode BNI khusus telah dihapus. Semua PDF memakai pipeline vision umum yang lebih ringan. Pembersihan salam `KEPADA YTH`, kode placeholder mandiri, dan artefak OCR tetap berjalan otomatis tanpa mengirim dua gambar per halaman atau memaksa audit penuh.

## PDF review workflow v12

Hasil PDF AI menyediakan editor No Ref massal untuk seluruh baris PDF. Kolom NO dibuat sticky agar nomor urut tetap terlihat ketika tabel digeser horizontal. Panel koreksi juga menampilkan nomor urut dan nama kolom yang sedang diperbaiki.
