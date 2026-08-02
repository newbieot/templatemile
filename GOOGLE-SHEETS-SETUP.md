# Setup Google Sheets — Statistik AI mile.posnew.com v16.5

## 1. Spreadsheet

Buat Google Sheets dan ubah nama sheet menjadi `AI_LOG`. Isi header baris pertama:

```text
WAKTU_SERVER
EMAIL_PENGGUNA
VERSI
STATUS
JUMLAH_FILE
JUMLAH_HALAMAN
MODEL_AI
HALAMAN_PER_PROSES
PROSES_PARALEL
DURASI_DETIK
JUMLAH_DATA
DETIK_PER_DATA
PERLU_DICEK
LUAR_BATAM
KETERANGAN
```

## 2. Apps Script

Buka **Extensions → Apps Script**, lalu gunakan kode berikut:

```javascript
const SHEET_NAME = 'AI_LOG';

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    const payload = JSON.parse(e?.postData?.contents || '{}');
    const expectedToken = PropertiesService
      .getScriptProperties()
      .getProperty('MILE_METRICS_SECRET');

    if (!expectedToken || !constantTimeEqual(payload.token, expectedToken)) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error(`Sheet ${SHEET_NAME} tidak ditemukan.`);

    const durationSeconds = safeNumber(payload.durationSeconds);
    const totalRows = safeInteger(payload.totalRows);
    const secondsPerRow = totalRows > 0
      ? Math.round((durationSeconds / totalRows) * 1000) / 1000
      : '';

    sheet.appendRow([
      new Date(),
      safeText(payload.userEmail),
      safeText(payload.appVersion),
      safeText(payload.status),
      safeInteger(payload.fileCount),
      safeInteger(payload.pageCount),
      safeText(payload.model),
      safeInteger(payload.chunkSize),
      safeInteger(payload.concurrency),
      durationSeconds,
      totalRows,
      secondsPerRow,
      safeInteger(payload.reviewCount),
      safeInteger(payload.outsideBatamCount),
      safeText(payload.message)
    ]);

    return jsonResponse({ ok: true, secondsPerRow });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function safeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 1000) / 1000;
}

function safeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function safeText(value) {
  let text = String(value || '').slice(0, 500);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text;
}

function constantTimeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 3. Script property

Pada **Project Settings → Script properties**, buat:

```text
MILE_METRICS_SECRET=<kode acak rahasia minimal 32 karakter>
```

## 4. Deployment

Pilih **Deploy → New deployment → Web app**:

```text
Execute as: Me
Who has access: Anyone
```

Salin URL yang berakhir `/exec`.

## 5. Cloudflare Pages

Pada **Workers & Pages → templatemile → Settings → Variables and secrets**:

```text
GOOGLE_SHEETS_WEBHOOK_URL=<URL /exec>
GOOGLE_SHEETS_WEBHOOK_SECRET=<nilai yang sama dengan MILE_METRICS_SECRET>
```

URL boleh `Plaintext`; secret wajib `Secret`. Setelah tersimpan, jalankan deployment ulang.

## 6. Verifikasi

Buka:

```text
https://mile.posnew.com/api/health
```

Pastikan:

```json
"metricsConfigured": true
```

Lalu login dan proses satu PDF. Ringkasan aplikasi harus menampilkan **Tersimpan di Google Sheets**, dan satu baris baru muncul pada `AI_LOG`.
