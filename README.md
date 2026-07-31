# MILE Bulk Converter — PosNew Hub

A browser-based utility for converting Excel and CSV recipient lists into an editable PosIND MILE bulk-upload workbook.

## Deployment

This project is static and can be deployed directly to Cloudflare Pages.

- Build command: none
- Output directory: repository root
- Custom domain: `mile.posnew.com`

## Main workflow

1. Select corporate, retail, or moving-goods mode.
2. Configure sender, service, parcel, and insurance details.
3. Upload `.xlsx`, `.xls`, or `.csv` source files.
4. Match spreadsheet columns when required.
5. Review and edit the generated table.
6. Export the MILE workbook.

All standard Excel and CSV processing happens locally in the browser. `beta.html` is an experimental page for local PDF extraction and is excluded from search indexing.

## Pemeriksaan data AI

- Sel yang memuat tulisan `perlu dicek` disorot otomatis.
- Tombol **Tinjau berikutnya** memindahkan fokus ke bagian yang belum dikoreksi.
- Ekspor dinonaktifkan sampai seluruh penanda `perlu dicek` diselesaikan.
- Setiap baris dapat dihapus langsung dari kolom **Aksi**.
- Khusus template Pengadilan Negeri Batam, kode layanan default mengikuti hari kerja dan kalender libur/cuti bersama 2026.
