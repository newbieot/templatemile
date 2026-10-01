"""Package the Chrome helper and rebuildable Android source, excluding local secrets/builds."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "downloads"

def package_extension():
    base = ROOT / "extensions" / "mile-cn23"
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    required = [manifest["background"]["service_worker"], "panel.html", "panel.js", "panel.css", "queue.js", "CARA-INSTALL.txt", "vendor/xlsx.full.min.js", "vendor/LICENSE"]
    required += [file for group in manifest["content_scripts"] for file in group["js"]]
    for file in required:
        if not (base / file).is_file():
            raise RuntimeError(f"Missing extension file: {file}")
    target = OUTPUT / f"Mile-CN23-Helper-{manifest['version']}.zip"
    with ZipFile(target, "w", ZIP_DEFLATED) as archive:
        for file in sorted(base.rglob("*")):
            if file.is_file():
                archive.write(file, file.relative_to(base).as_posix())
    return target

def package_android():
    base = ROOT / "android"
    target = OUTPUT / "Mile-Camera-0.1.5-source.zip"
    blocked = {".gradle", "build", ".idea"}
    with ZipFile(target, "w", ZIP_DEFLATED) as archive:
        for file in sorted(base.rglob("*")):
            relative = file.relative_to(base)
            if not file.is_file() or blocked.intersection(relative.parts):
                continue
            if file.name == "local.properties" or file.suffix in {".jks", ".keystore", ".apk"}:
                continue
            archive.write(file, "android/" + relative.as_posix())
        archive.write(ROOT / "docs" / "mile-camera-0.1.5.md", "PANDUAN-0.1.5.md")
    return target

if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    for artifact in [package_extension(), package_android()]:
        with ZipFile(artifact) as archive:
            assert archive.testzip() is None
        print(f"{artifact.name}: {artifact.stat().st_size} bytes")
