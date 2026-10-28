# Audit model vision — 28 Oktober 2026

Rilis v26.58 menambah 26 pilihan manual sehingga katalog berisi 31 model. Alias berasal dari tangkapan layar Model Health operator; kemampuan menerima gambar diperiksa pada dokumentasi resmi di bawah. Default dan fallback otomatis PDF/kamera tetap **Gemini 3.8 Flash → DeepSeek V4.1 Flash**. Model manual lain tidak dimasukkan ke rantai otomatis.

Audit ini memverifikasi kemampuan model berdasarkan dokumentasi, bukan hasil OCR langsung melalui setiap alias CosmosHub. Status Healthy/Down pada tangkapan layar tidak membuktikan kemampuan vision. Tes layanan AI di aplikasi mengirim kode acak yang hanya ada pada gambar untuk memeriksa rute yang dipilih. Pengujian lokal menggunakan respons provider simulasi; tidak melakukan transaksi atau OCR produksi.

## Katalog yang menerima gambar

| Keluarga | Alias CosmosHub dalam pilihan model | Dasar verifikasi |
| --- | --- | --- |
| Gemini | `gemini-3.8-flash` | Model default aktif yang disediakan operator; dukungan rute dapat diperiksa dengan Tes layanan AI. |
| DeepSeek | `deepseek-v4.1-flash` | Tabel [Tencent TokenHub](https://cloud.tencent.com/document/product/1823/130051) mencantumkan pemahaman gambar untuk alias ini. |
| Claude | `claude-haiku-5.5`, `claude-sonnet-5`, `claude-opus-4.8`, `claude-fable-5.1`, `claude-opus-5`, `claude-opus-5.5`, `claude-sonnet-5.5` | [Model overview](https://platform.claude.com/docs/en/models/overview), [vision](https://platform.claude.com/docs/en/build-with-claude/vision), dan [context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) mendokumentasikan input gambar. |
| OpenAI | `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` | [Katalog resmi](https://developers.openai.com/api/docs/models), [vision](https://developers.openai.com/api/docs/guides/images-vision), dan [changelog](https://developers.openai.com/api/docs/changelog) menjelaskan input gambar keluarga tersebut. |
| GLM | `glm-5.3-flashx`, `glm-5.3-flash`, `glm-5v-turbo` | [Panduan GLM Tencent](https://cloud.tencent.com/document/product/1823/132061) membedakan varian multimodal dari GLM 5.2/5.3 biasa. |
| Kimi | `kimi-k3.1-pro`, `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k2.5` | [Katalog Kimi Code](https://www.kimi.com/code/docs/en/kimi-code/models.html), [K2.6](https://www.kimi.com/en/blog/kimi-k2-6), dan [K2.5](https://www.kimi.com/en/blog/kimi-k2-5) menjelaskan input gambar/vision. |
| Qwen | `qwen-3.8-max-0902`, `qwen-3.8-max`, `qwen-3.8-flash` | [Qwen3.8 Max](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max) dan [Flash](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-flash) menerima gambar. CosmosHub memakai tanda hubung pada alias keluarga. |
| MiniMax | `minimax-m3.1-flash`, `minimax-m3` | [M3.1 Flash](https://agent.minimax.io/tools/m3.1-flash) dan [M3](https://www.minimax.io/models/text/m3) mendokumentasikan input gambar/video. |
| MiMo | `mimo-v2.6-pro` | [Panduan Tencent MiMo](https://cloud.tencent.com/document/product/1823/138677) menyatakan input teks, gambar, dan video untuk V2.6 Pro. |
| Step | `step-5-preview` | [Step 5 Preview](https://www.stepfun.com/step-5-preview) menjelaskan vision native. |

Tencent menjadwalkan penghentian GLM-5V-Turbo pada **30 Oktober 2026** di layanannya. Alias masih muncul dalam daftar operator 28 Oktober; pilihan diberi label Legacy dan tetap manual. Jadwal Tencent bukan konfirmasi jadwal CosmosHub.

## Alias tangkapan layar yang tidak ditambahkan

| Alias | Alasan dan sumber |
| --- | --- |
| `deepseek-v3.2`, `deepseek-v3.2-free` | Dukungan input gambar untuk kedua alias ini belum terkonfirmasi; tidak menyamakan versi teks dengan V4.1 Flash. [Panduan DeepSeek Tencent](https://cloud.tencent.com/document/product/1823/132248). |
| `deepseek-v4-flash`, `deepseek-v4-flash-0731`, `deepseek-v4-pro`, `deepseek-v4-pro-0813` | Alias reguler ini tidak ditandai menerima gambar pada [tabel Tencent](https://cloud.tencent.com/document/product/1823/130051). Varian direct-supply/vision memakai alias berbeda; tidak dianggap identik dengan rute Alibaba pada tangkapan layar. |
| `glm-5.2`, `glm-5.3` | Varian biasa tidak menerima input multimodal menurut [panduan GLM](https://cloud.tencent.com/document/product/1823/132061). |
| `hy3`, `hy3-free`, `hy4-preview`, `hy4-preview-free` | Hy3/Hy4 Preview tidak ditandai memahami gambar pada [katalog Tencent](https://cloud.tencent.com/document/product/1823/130051); alias gratis juga belum terkonfirmasi. |
| `minimax-m2.7` | Model teks, berbeda dari M3/M3.1 multimodal pada [katalog Tencent](https://cloud.tencent.com/document/product/1823/130051). |
| `qwen-3.7-max` | [Dokumentasi model](https://www.alibabacloud.com/help/en/model-studio/qwen3-7-max) menyebut alias stabil sebagai input teks. Snapshot bertanggal dengan kemampuan lain tidak dijadikan bukti untuk alias tanpa tanggal. |

Total: 31 alias dalam katalog, 14 alias di luar katalog. Alias model lama di luar daftar juga tetap ditolak gateway sebelum diteruskan ke provider.

## Parameter dan validasi

Gemini mempertahankan schema JSON dan reasoning medium dengan retry kompatibilitas terbatasi. DeepSeek mempertahankan JSON object dan parameter sampling yang sudah digunakan rilis v26.57. GPT memakai `max_completion_tokens`, menyisihkan anggaran reasoning, memakai effort low, dan tidak mengirim `temperature`/`top_p`; parameter output mengikuti [referensi Chat Completions OpenAI](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Model vision lain memakai instruksi JSON tanpa parameter sampling/JSON mode khusus provider. Pesan gambar tetap dikirim.

Uji otomatis memeriksa katalog yang identik pada app/Beta/review/gateway, penolakan alias yang tidak didukung, pengiriman gambar dan parameter tiap keluarga, tes kode gambar, serta urutan dan deadline fallback kamera/PDF. Server tetap memberi Gemini 120 detik dan model lain 150 detik; browser memberi toleransi transport 15 detik.
