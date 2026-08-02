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
- Default model: `claude-sonnet-4.5`

The API key is entered manually and kept only in current-tab memory. It is not stored in GitHub, localStorage, sessionStorage, or the exported workbook.

The browser first uses the Cloudflare Worker proxy. If that route returns a gateway/network failure, the application automatically tries a direct browser request to CosmosHub. A concise error is shown instead of dumping a complete Cloudflare HTML error page.

## Large PDF processing

- Maximum: 300 pages and 120 MB per PDF
- Default: 4 pages per request
- Default concurrency: 4 requests
- Configurable: 2–10 pages per request and 1–6 parallel requests
- Failed batches are retried up to three times
- Results are merged back into original page order

PDF pages are automatically cropped to their visible content, enlarged, converted to high-contrast grayscale, and labelled by page number before being sent. The default **Akurat & cepat** mode performs a second AI audit only for low-confidence or suspicious batches. **Maksimum akurasi** audits every batch, while **Paling cepat** skips the second audit.

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
