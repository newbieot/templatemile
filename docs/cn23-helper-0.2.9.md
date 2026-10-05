# Mile CN23 Helper 0.2.9

Ekstensi mendukung Chrome 88 ke atas, termasuk Chrome 109 pada Windows 7
32-bit. Paket yang sama dipakai pada Chrome 32-bit dan 64-bit.

Rilis 0.2.8 untuk Chrome 109 sudah diterbitkan lebih dahulu. Rilis ini menurunkan
batas instalasi ke Chrome 88 dan menggunakan callback untuk menyimpan antrean serta mengirim
pesan, sehingga tidak bergantung pada dukungan Promise API Chrome yang lebih baru.
Pembuatan ID memakai `crypto.getRandomValues` ketika `crypto.randomUUID` belum
tersedia. Pembatasan akses storage tetap diterapkan pada Chrome yang menyediakan
`setAccessLevel`, dan tidak menggagalkan instalasi pada versi yang belum memilikinya.
Tombol Upload menunggu status panel selesai dimuat, sehingga file tidak terlewat
ketika callback pada browser lama membutuhkan waktu lebih lama.

## Memperbarui

1. Hentikan antrean sebelum memperbarui ekstensi.
2. Unduh ZIP 0.2.9, lalu ekstrak dan timpa file dalam folder ekstensi lama.
3. Buka `chrome://extensions`, lalu klik **Reload / Muat ulang**. Pastikan versi 0.2.9.
4. Muat ulang tab Transaksi CN23. Untuk instalasi pertama, gunakan **Load unpacked**
   dan pilih folder yang langsung berisi `manifest.json`.
5. Upload Excel dan tekan Start sekali. Kemajuan antrean 0.2.5–0.2.8 tetap tersimpan.
   Reset hanya diperlukan ketika ingin mengganti antrean.

Alur pembayaran dan perpindahan ke data berikutnya tetap sama. Setelah Selesai
dan navigasi Mile, ekstensi menunggu form baru siap lalu mengisi baris berikutnya.
Tab cetak tidak dibaca atau ditunggu. Produk mengikuti Excel, termasuk PE.

## Verifikasi

Ekstensi unpacked diuji pada Chromium 88.0.4324.0 dan 109.0.5414.0 32-bit dengan satu upload
Excel dan satu Start hingga tiga kiriman PE selesai. Form, pembayaran, pengirim
korporat, dan pergantian ke data kedua/ketiga berjalan pada browser sebenarnya.
Build pengujian tidak sama persis dengan Chrome 109.0.5414.120 dan tidak menguji
Windows 7 secara langsung.


Uji API callback mencakup penundaan respons storage, pesan tanpa penerima,
`runtime.lastError`, dan ID aman tanpa `randomUUID`. Simulasi form/service worker
menguji satu Start untuk tiga kiriman PE melalui reload penuh: Cash ritel,
Invoice korporat, lalu CREDIT korporat. Nilai penerima, referensi, pengirim,
layanan, dan pembayaran diperiksa pada tiap kiriman. API Chrome lama tidak
mengembalikan Promise dalam pengujian ini.

Uji browser memakai ekstensi unpacked yang sebenarnya dengan halaman form lokal
melalui intersepsi jaringan. Pengujian ini tidak membuat transaksi Mile produksi.
Script pengujian: `scripts/test-cn23-chromium.cjs`.

Paket 0.2.8 khusus Chrome 109 tetap tersedia di halaman unduhan langsung.
Paket terbaru 0.2.9 bisa dipakai mulai Chrome 88 hingga versi terbaru.

Unduhan dan petunjuk: https://mile.posnew.com/unduhan

Referensi API:

- https://developer.chrome.com/docs/extensions/reference/api/runtime#method-sendMessage
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
