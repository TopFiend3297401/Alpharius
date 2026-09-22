#!/usr/bin/env bash
# Smoke test: proves the extension loads in the real Pi, adds zero prompt
# tokens, and fires through Pi's real agent loop and built-in tools.
# No model endpoint is contacted: Pi runs --offline with an empty, throwaway
# config dir, and the "model" is test/e2e/scripted-provider.ts, an in-process
# fake that replays fixed tool calls.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT="$HERE/index.ts"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/alpharius-smoke.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
export PI_CODING_AGENT_DIR="$TMP/agent" PI_OFFLINE=1
mkdir -p "$PI_CODING_AGENT_DIR" "$TMP/repo/00-meta" "$TMP/repo/harness"
printf '# Contract\n' >"$TMP/repo/00-meta/harness-contract.md"
printf 'def main():\n    pass\n' >"$TMP/repo/harness/generate_notes.py"
printf 'def c_to_f(c):\n    return c * 9 / 5 - 32\n' >"$TMP/repo/conv.py"
cd "$TMP/repo"
BARE=(--offline --no-session -ne -nc -ns -np)
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; exit 1; }

echo "1. loads (rpc get_commands, no prompt sent)"
out="$( (echo '{"id":"1","type":"get_commands"}'; sleep 2) | timeout 30 pi --mode rpc "${BARE[@]}" -e "$EXT" 2>&1)"
grep -q '"name":"alpharius"' <<<"$out" && pass "extension registered /alpharius" || { echo "$out"; fail "extension did not load"; }

echo "2. zero added prompt tokens (system prompt + tool schemas identical with/without)"
(echo '{"id":"1","type":"get_state"}'; sleep 2) | PROBE_OUT="$TMP/without.json" timeout 30 pi --mode rpc "${BARE[@]}" -e "$HERE/test/e2e/probe.ts" >/dev/null 2>&1
(echo '{"id":"1","type":"get_state"}'; sleep 2) | PROBE_OUT="$TMP/with.json" timeout 30 pi --mode rpc "${BARE[@]}" -e "$HERE/test/e2e/probe.ts" -e "$EXT" >/dev/null 2>&1
[ -s "$TMP/with.json" ] || fail "probe wrote nothing"
cmp -s "$TMP/with.json" "$TMP/without.json" && pass "identical ($(wc -c <"$TMP/with.json") bytes)" || { diff "$TMP/without.json" "$TMP/with.json" | head; fail "prompt differs"; }

echo "3. end to end through Pi's agent loop (scripted offline model)"
ALPHARIUS_E2E_OUT="$TMP/e2e.json" timeout 60 pi -p go "${BARE[@]}" \
	-e "$HERE/test/e2e/scripted-provider.ts" -e "$EXT" --provider alpharius-script --model script </dev/null >/dev/null 2>&1 \
	|| fail "pi -p exited non-zero"
node - "$TMP/e2e.json" "$TMP/repo/conv.py" <<'JS' || exit 1
const fs = require("node:fs");
const [results, conv] = [JSON.parse(fs.readFileSync(process.argv[2], "utf8")), fs.readFileSync(process.argv[3], "utf8")];
const checks = [
	["fence: find /home blocked", /find \/home is denied/.test(results[0].text)],
	["fence: ../ escape in bash blocked", results[1].isError && /outside the repository/.test(results[1].text)],
	["jail: read /etc/hostname blocked", results[2].isError && /outside the project root/.test(results[2].text)],
	["repeat: 3rd identical bash call blocked", !results[3].isError && !results[4].isError && /same call three times/i.test(results[5].text)],
	["phantom path: candidates offered", /Closest files[\s\S]*00-meta\/harness-contract\.md/.test(results[6].text)],
	["stale edit: nearest actual text returned", /Nearest actual text in the file:\n    return c \* 9 \/ 5 - 32/.test(results[7].text)],
	["sloppy anchor: rescued and applied", !results[8].isError && conv.includes("    return c * 9 / 5 + 32\n")],
];
let bad = 0;
for (const [name, ok] of checks) { console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
JS
echo "smoke: all passed"
