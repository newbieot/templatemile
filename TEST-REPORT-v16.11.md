# Test Report — mile.posnew.com v16.11

Tanggal pengujian: 15 Agustus 2026  
Versi aplikasi: `20260815-16.11`

## Hasil

| Pemeriksaan | Hasil |
|---|---|
| Sintaks seluruh JavaScript aplikasi | LULUS |
| Sintaks module `_worker.js` | LULUS |
| UI memilih `gemini-3.7-flash` sebagai satu-satunya model default | LULUS |
| Gemini 3.6 Flash tetap tersedia sebagai fallback | LULUS |
| Allowlist model browser dan gateway identik | LULUS |
| Gateway menerima dan meneruskan `gemini-3.7-flash` | LULUS |
| Gateway tetap menolak model di luar allowlist | LULUS |
| Seluruh 17 referensi `/assets/` pada HTML tersedia | LULUS |
| Seluruh referensi `/assets/` memakai versi `20260815-16.11` | LULUS |
| Endpoint health mengembalikan versi `20260815-16.11` | LULUS |
| HTML dan API tetap memakai cache `no-store` | LULUS |
| Aset berversi tetap memakai cache `immutable` | LULUS |
| Respons aplikasi tetap mengirim `x-mile-app-version` | LULUS |

## Detail pembaruan model

- `gemini-3.7-flash` ditambahkan pada `COSMOS_MODELS` di browser.
- `gemini-3.7-flash` ditambahkan pada `ALLOWED_MODELS` di Cloudflare Worker.
- Nilai fallback konfigurasi, reset saat halaman dimuat, label UI, dan petunjuk preset Cepat semuanya memakai Gemini 3.7 Flash.
- `gemini-3.6-flash` tidak lagi menjadi default, tetapi tetap dapat dipilih secara manual.

## Verifikasi cache deployment

- `APP_VERSION` dinaikkan menjadi `20260815-16.11`.
- Bundle AI memakai path baru `/assets/js/ai-pdf-v16-11.js`, sehingga cache lama tidak mungkin digunakan meskipun ada Cache Rule yang mengabaikan query string.
- Query version pada CSS, JavaScript, PDF.js, SheetJS, dan PDF worker dinaikkan menjadi `?v=20260815-16.11`.
- HTML dan API tidak disimpan pada cache browser maupun cache Cloudflare.
- Aset statis dapat memakai cache panjang karena URL rilis baru berbeda dari v16.10.

## Verifikasi sesudah deployment

1. Jalankan `CHECK-VERSION.bat` sebelum commit.
2. Setelah Cloudflare Pages selesai deploy, buka `https://mile.posnew.com/api/health`.
3. Pastikan nilai `version` adalah `20260815-16.11`.
4. Login, buka **Pengaturan AI untuk PDF**, dan pastikan **Gemini 3.7 Flash · Default** terpilih.
5. Proses satu PDF uji dan pastikan tidak muncul pesan “Model CosmosHub tidak diizinkan”.
