#!/usr/bin/env python3
"""Quality gate local/CI sin dependencias externas.

Valida tres cosas:
1. No commitear secretos obvios ni archivos privados.
2. Python versionado compila.
3. JavaScript inline en HTML tiene sintaxis válida cuando Node está disponible.
"""
from __future__ import annotations

import html
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {
    ".html", ".css", ".js", ".json", ".md", ".py", ".ps1", ".yml", ".yaml",
    ".txt", ".toml", ".ini", ".cfg", ".gitignore", ".gitattributes",
}
SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['\"]?[A-Za-z0-9_./+=-]{16,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"sk_[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
]
PRIVATE_PATH_PATTERNS = [
    re.compile(r"(^|/)(\.env|secrets|memory|MEMORY)(/|$)", re.I),
    re.compile(r"(^|/)(token|client_secret|credentials)\.(json|txt)$", re.I),
]
ALLOWLIST = (
    "ELEVENLABS_API_KEY",
    "OPENROUTER_API_KEY",
    "GITHUB_TOKEN",
    "client_secret.json",
    "token.json",
    "password",
    "contraseña",
    "placeholder",
    "example",
    "ejemplo",
)


def run(cmd: list[str], *, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, input=input_text, text=True, capture_output=True, check=False)


def tracked_files() -> list[Path]:
    result = run(["git", "ls-files"])
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)
    return [ROOT / line for line in result.stdout.splitlines() if line.strip()]


def is_text_file(path: Path) -> bool:
    if path.suffix in TEXT_SUFFIXES or path.name in {".gitignore", ".gitattributes", ".editorconfig"}:
        return True
    try:
        with path.open("rb") as fh:
            chunk = fh.read(4096)
        return b"\0" not in chunk
    except OSError:
        return False


def scan_private_paths(files: list[Path]) -> list[str]:
    findings = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        if any(p.search(rel) for p in PRIVATE_PATH_PATTERNS):
            findings.append(f"archivo privado versionado: {rel}")
    return findings


def scan_secrets(files: list[Path]) -> list[str]:
    findings: list[str] = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        if not is_text_file(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            if any(token.lower() in line.lower() for token in ALLOWLIST):
                continue
            for pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append(f"posible secreto en {rel}:{i}")
                    break
    return findings


def compile_python(files: list[Path]) -> list[str]:
    errors: list[str] = []
    for path in files:
        if path.suffix != ".py":
            continue
        rel = path.relative_to(ROOT).as_posix()
        try:
            source = path.read_text(encoding="utf-8")
            compile(source, str(path), "exec")
        except SyntaxError as exc:
            errors.append(f"Python inválido en {rel}:{exc.lineno}: {exc.msg}")
        except UnicodeDecodeError as exc:
            errors.append(f"Python inválido en {rel}: no es UTF-8 ({exc})")
    return errors


def html_inline_scripts(files: list[Path]) -> list[str]:
    errors: list[str] = []
    node = shutil.which("node")
    if not node:
        print("WARN: Node no disponible; se omite check de JS inline")
        return errors
    script_re = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.I | re.S)
    for path in files:
        if path.suffix.lower() != ".html":
            continue
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8", errors="ignore")
        for idx, match in enumerate(script_re.finditer(text), start=1):
            code = html.unescape(match.group(1)).strip()
            if not code:
                continue
            with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as tmp:
                tmp.write(code)
                tmp_path = tmp.name
            try:
                result = subprocess.run([node, "--check", tmp_path], text=True, capture_output=True, check=False)
                if result.returncode != 0:
                    errors.append(f"JS inline inválido en {rel} script #{idx}: {result.stderr.strip()}")
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
    return errors


def main() -> int:
    files = tracked_files()
    checks = {
        "rutas privadas": scan_private_paths(files),
        "secretos": scan_secrets(files),
        "python": compile_python(files),
        "html/js": html_inline_scripts(files),
    }
    failed = False
    for name, errors in checks.items():
        if errors:
            failed = True
            print(f"\n[FAIL] {name}")
            for err in errors:
                print(f"  - {err}")
        else:
            print(f"[OK] {name}")
    if failed:
        return 1
    print("\nQuality gate OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
