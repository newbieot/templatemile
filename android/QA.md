# Mile Camera 0.1.0 — verifikasi

Build 30 September 2026, paket `com.posnew.milecamera`, Android 8.0+.

- Build release dan Android lint berhasil; tidak ada lint error. Peringatan nonfatal mencakup target SDK 35, versi tool, dan teks UI yang belum dipindahkan ke resource terjemahan.
- APK diverifikasi dengan `apksigner`: tanda tangan APK v2 valid, satu signer.
- Emulator Pixel 5 / Android 15: beranda biru, izin kamera, preview, ketuk fokus, capture portrait dan landscape, galeri, konfirmasi hapus, dan hitungan foto berjalan.
- Capture virtual menghasilkan JPEG 1392 × 1856 (portrait) dan 1856 × 1392 (landscape). Ukuran foto mengikuti resolusi yang tersedia dari kamera.
- Draft masih tersedia setelah force-stop dan membuka ulang aplikasi; setelah menghapus satu dari dua foto, galeri dan draft menunjukkan satu foto.
- Rotasi sensor ke landscape berhasil ketika `accelerometer_rotation=0` dan `user_rotation=0` (rotasi sistem dikunci portrait). Tombol kamera pindah ke dock samping; galeri memakai foto dan kontrol berdampingan. Kembali ke portrait juga berhasil.
- Halaman login MILE terbuka di WebView sebelum pemrosesan batch; foto native tetap tersimpan. Pemrosesan AI dengan akun pengguna belum diuji end-to-end karena sesi emulator belum login.
- `node --test tests/android-handoff.test.js` berhasil: handoff tujuh JPEG, model default, kegagalan baca foto, kegagalan penyimpanan, serta penolakan origin lain.
- Fokus optik dan kualitas kamera lintas merek belum diuji pada HP fisik. Emulator melaporkan fokus belum terkunci; aplikasi menampilkan status tersebut dan tetap mengizinkan capture.

APK yang dipublikasikan: `downloads/Mile-Camera-0.1.0.apk`.

SHA-256: `7e6268578d23debc02756b2e97d37bf3c8c2c59012a49f57a1fd2cc766af093c`.

Keystore release berada di penyimpanan lokal komputer pembuat, tidak termasuk source maupun APK. Simpan keystore itu untuk pembaruan berikutnya.
