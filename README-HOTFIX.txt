HOTFIX MILE v16.1

1. Salin _worker.js ke root repository templatemile dan timpa file lama.
2. Commit dan Push origin.
3. Tunggu Cloudflare Pages deployment Success.
4. Buka https://mile.posnew.com/api/health
5. Pastikan version = 20260802-16.1.

Hotfix ini memperbaiki redirect loop / <-> /index.html pada Cloudflare Pages.
