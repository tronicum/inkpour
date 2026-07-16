#!/usr/bin/env bash
# scripts/release.sh — build a release zip + SHA3-256 checksum
#
# SHA3-256 is post-quantum safe: its sponge construction provides full 256-bit
# security against Grover's algorithm (unlike SHA-256 whose effective PQ
# security is ~128 bits). No external deps — uses Python 3 stdlib hashlib.
#
# Usage:
#   cd inkpour
#   bash scripts/release.sh           # uses version from manifest.json
#   bash scripts/release.sh 0.5.0     # override version

set -euo pipefail

VERSION="${1:-$(node -p "require('./manifest.json').version")}"
OUT_DIR="$(cd ..; pwd)"
ZIP="${OUT_DIR}/inkpour-${VERSION}.zip"
HASH_FILE="${OUT_DIR}/inkpour-${VERSION}.sha3"

echo "→ Building inkpour ${VERSION}"

# ── Build zip (manifest.json must be at root) ────────────────────────────────
rm -f "${ZIP}"
zip -r "${ZIP}" . \
  --exclude ".git*" \
  --exclude "node_modules/*" \
  --exclude "test/*" \
  --exclude "tests/*" \
  --exclude "test-results/*" \
  --exclude "debug/*" \
  --exclude "safari/*" \
  --exclude "scripts/*" \
  --exclude "planning.md" \
  --exclude "README.md" \
  --exclude "PRIVACY.md" \
  --exclude "package*.json" \
  --exclude "playwright.config.js" \
  > /dev/null

echo "→ Computing SHA3-256 hash"

python3 - "${ZIP}" "${HASH_FILE}" <<'PYEOF'
import sys, hashlib, pathlib

zip_path  = pathlib.Path(sys.argv[1])
hash_path = pathlib.Path(sys.argv[2])

digest = hashlib.sha3_256(zip_path.read_bytes()).hexdigest()
filename = zip_path.name
hash_path.write_text(f"{digest}  {filename}\n")

print(f"  SHA3-256: {digest}")
print(f"  File:     {filename} ({zip_path.stat().st_size:,} bytes)")
PYEOF

echo ""
echo "✓ Release files:"
echo "  ${ZIP}"
echo "  ${HASH_FILE}"
echo ""
echo "Verify with:"
echo "  python3 -c \""
echo "    import hashlib, pathlib"
echo "    h = hashlib.sha3_256(pathlib.Path('${ZIP}').read_bytes()).hexdigest()"
echo "    expected = open('${HASH_FILE}').split()[0]"
echo "    print('OK' if h == expected else 'MISMATCH')"
echo "  \""
