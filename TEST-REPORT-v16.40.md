# Test Report v16.40 — Mobile Camera Batch

Tanggal: 26 September 2026

## Hasil otomatis

- `tests/camera-capture.test.js`: lulus.
  - deteksi dokumen dan crop bounds pada frame sintetis;
  - validasi blur, brightness, dan resolusi minimum;
  - pembentukan PDF multi-page dari JPEG;
  - PDF hasil batch dapat dibuka oleh PDF.js existing;
  - metadata capture dan konfigurasi route tersedia.
- `tests/worker-camera-route.test.mjs`: lulus.
  - `/camera` ditolak tanpa session;
  - `/camera` dapat dibuka dengan session yang valid;
  - permission camera hanya diaktifkan pada halaman camera;
  - asset camera tetap berada di balik authentication gate.
- `tests/ai-pdf-v16-19.test.js`: lulus.
- `tests/ai-pdf-beta-r2.test.js`: lulus.
- `tests/worker-beta-r2.integration.mjs`: lulus terhadap Wrangler lokal dengan binding R2.
- `CHECK-VERSION.bat`: seluruh pemeriksaan lulus untuk v16.40.

## Hasil browser

- Layout diperiksa pada viewport Android 412 × 915.
- Halaman dapat dimuat tanpa error console.
- Kontrol route A dan route B dapat dipilih.
- Elemen tersembunyi, daftar batch, tombol Capture, dan tombol Finish tampil sesuai state.
- Permintaan `getUserMedia()` berhasil dipanggil pada browser uji, tetapi browser in-app pada mesin Windows tidak menyediakan kamera fisik untuk menyelesaikan capture.

## Smoke test Android setelah deploy

Wajib dilakukan satu kali pada Chrome Android dengan login MILE yang valid:

1. Buka `https://mile.posnew.com/camera` dan izinkan Camera.
2. Pastikan kamera belakang aktif dan live preview tampil.
3. Mulai sesi, capture minimal tiga sampul dengan posisi HP tetap.
4. Pastikan foto buram/gelap ditolak dan foto valid masuk ke preview.
5. Hapus satu capture, lalu capture ulang dan pastikan nomor urut rapi.
6. Uji Finish Capturing untuk Route A; pastikan tabel koreksi terisi.
7. Ulangi untuk Route B; pastikan upload R2, analisis DeepSeek 4.1, dan cleanup berjalan.
8. Pastikan refresh setelah proses berhasil tidak memproses batch yang sama dua kali.

## Catatan

Auto crop memakai computer vision ringan di browser agar tidak menambah beban server. Opsi **Gunakan guide tetap** tersedia sebagai fallback operasional saat warna sampul terlalu mirip dengan warna meja.
