#!/usr/bin/env python3
"""Terapkan patch default kode layanan PN Batam ke repository templatemile."""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

PATCH_VERSION = "20260731-1"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Memasang aturan otomatis PE/PKH untuk template Pengadilan Negeri Batam."
    )
    parser.add_argument(
        "repository",
        nargs="?",
        default=".",
        help="Path repository templatemile. Default: folder aktif.",
    )
    args = parser.parse_args()

    patch_root = Path(__file__).resolve().parent
    repo_root = Path(args.repository).expanduser().resolve()
    source_ui = patch_root / "assets" / "js" / "ui.js"
    target_ui = repo_root / "assets" / "js" / "ui.js"
    target_index = repo_root / "index.html"

    if not source_ui.is_file():
        fail(f"File patch tidak ditemukan: {source_ui}")
    if not target_ui.is_file() or not target_index.is_file():
        fail(
            "Folder target bukan repository templatemile yang lengkap. "
            "Pastikan index.html dan assets/js/ui.js tersedia."
        )

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = repo_root / ".patch-backup" / stamp
    backup_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(target_ui, backup_dir / "ui.js")
    shutil.copy2(target_index, backup_dir / "index.html")

    # Aman bila folder patch terlanjur diekstrak langsung ke dalam repository.
    # Dalam kondisi itu source_ui dan target_ui menunjuk file yang sama.
    if source_ui.resolve() != target_ui.resolve():
        shutil.copy2(source_ui, target_ui)
    else:
        print("Catatan: folder patch berada di dalam repository; penyalinan ui.js dilewati karena file sumber dan target sama.")

    index_text = target_index.read_text(encoding="utf-8")
    script_pattern = re.compile(r'(/assets/js/ui\.js)(?:\?v=[^"\']+)?')
    updated_text, count = script_pattern.subn(
        rf"\1?v={PATCH_VERSION}", index_text, count=1
    )
    if count != 1:
        fail(
            "Referensi /assets/js/ui.js tidak ditemukan di index.html. "
            f"Backup tersimpan di {backup_dir}"
        )
    target_index.write_text(updated_text, encoding="utf-8", newline="\n")

    print("Patch berhasil diterapkan.")
    print(f"Repository : {repo_root}")
    print(f"Backup     : {backup_dir}")
    print(f"Versi aset : {PATCH_VERSION}")
    print("Jalankan: node tests/test-pn-batam-calendar.js (opsional)")


if __name__ == "__main__":
    main()
