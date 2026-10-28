# Model OCR dan batas waktu — 28 Oktober 2026

Default app, Beta, dan review kamera adalah `gemini-3.8-flash`. Pemilihan manual dan allowlist gateway berisi:

| Alias CosmosHub | Penggunaan |
| --- | --- |
| `gemini-3.8-flash` | Default PDF/kamera |
| `deepseek-v4.1-flash` | Fallback otomatis PDF/kamera |
| `claude-haiku-5.5` | Pilihan manual |
| `claude-sonnet-5` | Pilihan manual |
| `claude-opus-4.8` | Pilihan manual |

Alias mengikuti daftar Model Health yang disediakan operator pada 28 Oktober 2026. Dukungan gambar Claude dirujuk ke [Vision](https://platform.claude.com/docs/en/build-with-claude/vision), [Models overview](https://platform.claude.com/docs/en/models/overview), dan [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows). Model health menunjukkan ketersediaan rute; keberhasilan OCR melalui rute CosmosHub tetap dapat diuji memakai Tes layanan AI. Tidak ada uji OCR langsung ke provider dalam verifikasi lokal rilis ini.

Gemini 3.1/3.5/3.6/3.7 serta model di luar katalog dihapus dari pilihan, fallback, dan allowlist server. Sesi lama kembali ke default aktif. DeepSeek V4.1 Flash tersedia sebagai fallback otomatis dan pilihan manual sesuai konfigurasi operator. Qwen/GLM berada di luar katalog aktif.

Gateway memberi setiap permintaan Gemini 120 detik dan DeepSeek/Claude 150 detik sampai respons selesai dibaca. Browser memakai 135/165 detik untuk memberi toleransi transport. Pada kamera, retry schema/reasoning memakai sisa anggaran model yang sama. Tiap model dicoba sekali per kelompok, lalu fallback Gemini → DeepSeek V4.1 Flash. Jika DeepSeek juga gagal, hasil/foto dipertahankan untuk dicoba ulang; Claude dipakai melalui pilihan manual. Kelompok yang berhasil dipertahankan dan antrean melewati model yang gagal. PDF mempertahankan retry terbatasi per kelompok. Mode Hemat data tetap dapat memakai referensi R2 privat yang ditukar gateway menjadi gambar.

Tes layanan AI menggambar enam karakter acak pada JPEG. Prompt hanya meminta properti `code`, dan kode jawaban tidak dikirim sebagai teks. Hanya jawaban JSON yang berisi kode gambar secara persis dianggap berhasil. Uji otomatis memakai respons simulasi untuk membuktikan jawaban teks saja gagal dan protokol gambar/parameter tetap utuh.

Zona kode pos mengikuti padanan eksplisit terlebih dahulu. Operator mengonfirmasi 29437 dan 29438 ke zona 29400, serta mengizinkan zona 29400 untuk kode 294xx yang belum ada di padanan. Karena padanan eksplisit didahulukan, Galang 29481–29488 tetap memakai zona 29664 dan perlakuan lokal Batam. Belakang Padang tetap memakai transaksi CN.
