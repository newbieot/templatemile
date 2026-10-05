# Mile CN23 Helper 0.2.10 — 5 Oktober 2026

Kolom Kg pada Periksa Hasil berada setelah nomor urut, sebelum Nama. Berat awal
0,2 kg dapat diubah per kiriman, termasuk 1,5 kg atau lebih. Koma dan titik desimal
didukung. Berat harus lebih dari nol; nilai yang tidak valid tidak boleh diekspor.
Berat mengikuti baris saat disimpan, dimuat dari Log Kamera, diekspor, dan diisi ke Mile.

Web memilih wilayah otomatis dari akhir alamat. Jika kota/kabupaten diketahui tanpa
wilayah lebih rinci, web memakai kode routing kota: kode xx111/xxx11 dari database,
atau prefix wilayah utama + 11 jika kode kota belum ada di data. Batam memakai 29411.
Hasil ini diberi cakupan CITY_POSTCODE, tanpa mengarang kecamatan atau kelurahan.
Kecamatan yang terbaca memakai kode di dalam kecamatan; kelurahan yang cocok memakai
kode kelurahan. Jakarta Raya tidak memakai default kota umum.

Pemilih wilayah manual dihapus. Bila alamat benar-benar tidak cukup atau saling
bertentangan (misalnya hanya "Jakarta" tanpa rincian, atau Banjar tanpa provinsi),
sistem tidak mengarang lokasi. Alamat perlu terbaca lebih rinci agar dapat dirutekan.
Kode pos yang jelas tetap menjadi petunjuk utama di dalam wilayah yang sesuai.

Ekstensi menerima berat di atas 1 kg dan cakupan kota tanpa mewajibkan kecamatan/
kelurahan. Pencarian tujuan kota memakai nama kota + kode routing, kemudian memilih
opsi yang sesuai secara otomatis. Kode terkunci dari Mile tetap dipertahankan.

Unduh ZIP 0.2.10, timpa file di folder ekstensi lama saat antrean berhenti, kemudian
tekan Reload di chrome://extensions dan muat ulang tab Mile. Kemajuan antrean versi
0.2.5–0.2.9 tetap tersimpan. Dukungan Chrome 88+, 32-bit/64-bit tetap berlaku.

Pengujian mencakup berat 0,2/1,5/2 kg dalam tiga kiriman berturut-turut, pencarian kota,
wilayah rinci, pengecualian Jakarta, log lama, dan ekspor. Pengujian form Mile memakai
simulasi; tidak membuat transaksi produksi.
