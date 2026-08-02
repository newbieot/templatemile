# MILE Bulk Converter — PosNew Hub

A browser-based utility for converting PDF, Excel, and CSV recipient lists into an editable PosIND MILE bulk-upload workbook.

## Deployment

Deploy directly to Cloudflare Pages so the included `/api/ai-proxy` Pages Function is available.

- Build command: none
- Output directory: repository root
- Custom domain: `mile.posnew.com`

## PDF extraction with a manual API key

The main page now accepts `.pdf` files. Users configure the API from the **Pengaturan API untuk PDF** panel:

1. Choose `OpenAI-compatible` or `Anthropic Messages`.
2. Enter the endpoint supplied by the API provider.
3. Enter the model name, defaulting to `claude-sonnet-4.5`.
4. Paste the API key manually.
5. Test the connection, then upload the PDF.

The API key is kept only in the current tab memory. It is not written to GitHub, localStorage, sessionStorage, the exported workbook, or application files. Requests pass through the included Cloudflare Pages Function to avoid browser CORS restrictions. The proxy does not intentionally persist request bodies or API keys.

PDF pages are rendered to images in the browser and sent in small batches. The model must return structured JSON, which is merged into the existing MILE table in page order. The interface displays token usage when the provider includes it in the API response.

## Review workflow

- Text containing `perlu dicek`, `perlu di cek`, or equivalent spacing is highlighted as mandatory correction.
- Typing, pressing Enter, blurring, or moving to another cell does not resolve the issue automatically.
- The user must remove or replace the marker, complete the corrected value, and click **Tandai selesai & lanjut**.
- Export remains disabled until every mandatory correction is explicitly confirmed.
- Active table columns expand temporarily so long addresses can be read and corrected in full.
- Rows can be removed from the **Aksi** column.
- Rows identified by AI as outside Batam receive a **Luar Batam** badge.

## Existing business rules

- Excel and CSV remain processed locally in the browser.
- Pengadilan Negeri Batam automatically defaults to PE on normal Monday–Thursday workdays and PKH on Fridays, holidays, and H-1 holidays based on the configured 2026 calendar.
- Corporate, retail, moving-goods, insurance, postal-code mapping, chargeable-weight, and MILE export logic remain available.

## API compatibility notes

The provider must support image input for the selected Claude model.

- OpenAI-compatible endpoint usually ends with `/v1/chat/completions` and uses Bearer authentication.
- Anthropic Messages endpoint usually ends with `/v1/messages` and uses `x-api-key` authentication.

Third-party providers may use different paths, headers, model names, limits, or response formats. Use the provider's documentation as the source of truth.
