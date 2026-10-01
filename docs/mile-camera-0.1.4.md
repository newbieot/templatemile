# Mile Camera 0.1.4

Foto label → Proses AI → alamat dan kode pos otomatis → unduh Excel sesuai tujuan.

## Instalasi dan penggunaan

1. Unduh [APK 0.1.4](https://mile.posnew.com/downloads/Mile-Camera-0.1.4.apk), buka pada HP, lalu pilih **Perbarui**. Jangan hapus aplikasi lama. Application ID dan sertifikat sama dengan rilis 0.1.1 dan 0.1.3.
2. Batch baru otomatis mulai dengan **Campuran · Lokal + Luar Kota**. Foto label seperti biasa; tidak perlu mengetik desa, kecamatan, atau kode pos sebelum capture. Pilihan khusus Lokal dan CN23 tetap tersedia.
3. Tekan **Proses AI**. AI membaca seluruh alamat penerima. Aplikasi mencocokkannya dengan database kode pos nasional 81.248 baris dari lampiran pengguna. Alamat yang cocok langsung berisi kode pos; tidak ada pencarian wilayah manual untuk baris tersebut.
4. Periksa hanya bacaan AI yang meragukan, alamat yang belum lengkap, nama wilayah ganda, atau kode pos tercetak yang bertentangan. Pada kasus tersebut, pilih lokasi yang tertulis pada foto; aplikasi mengisi kode posnya. Tidak perlu membuat wilayah atau kode pos sendiri.
5. Unduh **Excel Lokal Batam** untuk unggah Mile lokal dan **Antrean CN23** untuk ekstensi komputer. Kedua jenis kiriman selalu diekspor dalam file berbeda.

Contoh `JL. PENDIDIKAN PULAU KIJANG INHIL-RIAU.` dicocokkan otomatis ke **Pulau Kijang, Reteh, Indragiri Hilir, Riau — 29273**. Nama lengkap Pulau Kijang tidak lagi dianggap sama dengan desa bernama Pulau. Singkatan INHIL, INHU, dan KEPRI dikenali tanpa mengubah teks alamat hasil foto.

## Hasil lama masih meminta alamat luar Batam dihapus

Draft lama yang sudah berisi foto mempertahankan mode asal dan foto. Pada halaman hasil pilih **Tujuan kiriman → Campuran Batam + Luar Kota**, atau tombol **Pisahkan lokal dan luar kota** pada peringatan versi web terbaru. Data tetap tersimpan, kode pos dicocokkan kembali, dan hasil dipisahkan otomatis. Tidak perlu mengubah alamat luar kota menjadi Batam atau menghapus baris.

Jika hasil sedang terbuka pada web versi lama, ubah Tujuan kiriman pada halaman itu dahulu agar hasil tersimpan ke Log Kamera. Hindari memuat ulang sebelum hasil tersimpan. Batch baru di APK 0.1.4 kembali mulai dengan Campuran.

## Verifikasi

- APK release dan lint berhasil; application ID `com.posnew.milecamera`, versionCode 5.
- Sertifikat SHA-256: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`.
- Regresi database menguji alamat pada screenshot, nama lengkap dibanding substring, singkatan wilayah, nama ganda, dan konflik kode pos tercetak.
- Pengujian DOM memakai halaman review/app/beta sebenarnya: seluruh baris dipertahankan, kode pos langsung terisi, hasil campuran diekspor menjadi dua workbook terpisah, dan alamat ambigu tetap meminta pemeriksaan.
- Seluruh 31 tes web lulus. Delapan tes storage Android lulus, termasuk mode Campuran pada batch baru, persistensi pilihan, penguncian mode setelah foto, dan batas JPEG. Dua tes capture lulus saat dijalankan pada proses instrumentasi terpisah. Run gabungan sebelumnya mengalami timeout preview pada tes capture kedua; pengujian terpisah berhasil tanpa mengubah kode kamera.
- Capture cepat dari source 0.1.2 pengguna tetap dipakai. Kecepatan sensor dan autofocus optik mengikuti HP; pengujian emulator tidak mengukur performa optik HP.

[Source APK](https://mile.posnew.com/downloads/Mile-Camera-0.1.4-source.zip) tidak menyertakan keystore, password, atau SDK lokal. Instalasi APK memerlukan Android 8.0 atau lebih baru. Capture dapat offline setelah login, sedangkan AI, database nasional pada web, dan sinkronisasi memerlukan koneksi.
