# Test Report v16.41 — Fullscreen Camera Capture

Tanggal: 26 September 2026

## Cakupan

- Open Camera langsung membuat session dan mengaktifkan Capture.
- Preview kamera memakai Fullscreen API dengan tombol Capture, jumlah gambar, dan tombol keluar di dalam layar penuh.
- Layout serta area crop mengikuti video pada viewport portrait dan landscape.
- Skor resolusi, blur, serta brightness tidak memblokir capture.
- Confidence auto crop rendah memakai area panduan tetap dan tetap menyimpan foto.
- Metadata capture, pembentukan PDF, auth route, serta handoff Route A/B tetap berjalan.

## Hasil otomatis

- `tests/camera-capture.test.js`: lulus.
- `tests/worker-camera-route.test.mjs`: lulus.
- `tests/ai-pdf-v16-19.test.js`: lulus.
- `tests/ai-pdf-beta-r2.test.js`: lulus.
- `CHECK-VERSION.bat`: seluruh pemeriksaan lulus untuk v16.41.

## Hasil browser

- Layout diperiksa pada viewport Android portrait 412 × 915 dan landscape 915 × 412.
- Kontrol Capture fullscreen dan tombol keluar diverifikasi melalui struktur halaman, stylesheet, dan tes otomatis.
- Browser in-app pada mesin Windows tidak menyediakan kamera fisik untuk menyelesaikan `getUserMedia`; permission dan fullscreen akhir perlu smoke test sekali pada Chrome Android setelah deployment.

## Smoke test Android

1. Login lalu buka `https://mile.posnew.com/camera`.
2. Tekan Open Camera dan izinkan Camera; pastikan preview langsung fullscreen.
3. Capture pada posisi portrait, lalu putar HP ke landscape dan capture kembali.
4. Pastikan foto beresolusi kecil tetap masuk ke batch selama label terlihat pada preview.
5. Keluar fullscreen, hapus foto yang tidak layak bila ada, lalu tekan Finish Capturing.
6. Uji satu batch Route A dan satu batch Route B.
