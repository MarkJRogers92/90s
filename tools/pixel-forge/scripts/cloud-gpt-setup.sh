#!/usr/bin/env bash
# One-command setup for drawing art with ChatGPT/Codex from a Claude Code cloud session.
#
#   bash tools/pixel-forge/scripts/cloud-gpt-setup.sh setup    # isolated Forge venv + Codex CLI + host check
#   bash tools/pixel-forge/scripts/cloud-gpt-setup.sh login    # start the ChatGPT device sign-in
#   bash tools/pixel-forge/scripts/cloud-gpt-setup.sh status   # what is installed, reachable, signed in
#   bash tools/pixel-forge/scripts/cloud-gpt-setup.sh models   # Codex models this account offers
#   bash tools/pixel-forge/scripts/cloud-gpt-setup.sh restore  # write a stored login secret to CODEX_HOME
#
# The ChatGPT sign-in: by default it is NOT saved. Each new container needs a fresh `login` (the
# owner enters a one-time code in their own browser). The owner may instead choose to keep a login
# as the cloud environment secret PIXEL_FORGE_CODEX_AUTH_B64 (the base64 of a Codex auth.json
# made on their own computer; see the quick start in docs/CODEX_NATIVE_BRIDGE.md). `restore`
# then writes it to $CODEX_HOME/auth.json (mode 600) without printing it. This script never
# prints a token and never writes one into the repo. Treat that secret like a password.
#
# Needs the cloud environment's allowed domains to include auth.openai.com and chatgpt.com.
# Field notes and the full job workflow: tools/pixel-forge/docs/CODEX_NATIVE_BRIDGE.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE="$(cd "$HERE/.." && pwd)"
TOOLS="${PIXEL_FORGE_TOOLS:-$HOME/.pixel-forge-tools}"
export CODEX_HOME="${PIXEL_FORGE_CODEX_HOME:-$HOME/.pixel-forge-codex}"
VENV="$TOOLS/venv"
CODEX="$TOOLS/codex/node_modules/.bin/codex"
LOG="$TOOLS/codex-login.log"
HOSTS=(auth.openai.com chatgpt.com)
AUTH_VAR="PIXEL_FORGE_CODEX_AUTH_B64"

say() { printf '%s\n' "$*"; }

setup_venv() {
  if [ ! -x "$VENV/bin/python" ]; then
    say "creating isolated Forge venv at $VENV"
    python3 -m venv "$VENV"
  fi
  "$VENV/bin/pip" install -q -r "$FORGE/requirements.txt"
  say "forge venv: ok ($VENV/bin/python)"
}

setup_codex() {
  if [ ! -x "$CODEX" ]; then
    say "installing the Codex CLI into $TOOLS/codex"
    mkdir -p "$TOOLS/codex"
    npm install --silent --no-audit --no-fund --prefix "$TOOLS/codex" @openai/codex
  fi
  say "codex: $("$CODEX" --version 2>&1 | head -1)"
}

check_hosts() {
  local blocked=0 code
  for host in "${HOSTS[@]}"; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$host/" 2>/dev/null || true)"
    # any HTTP status means the proxy let us through; 000 means the connection was refused
    if [ -z "$code" ] || [ "$code" = "000" ]; then
      say "host $host: BLOCKED. Add it to the cloud environment's allowed domains (Network access > Custom)."
      blocked=1
    else
      say "host $host: reachable (HTTP $code)"
    fi
  done
  return $blocked
}

signed_in() { "$CODEX" login status >/dev/null 2>&1; }

cmd_restore() {
  local file="$CODEX_HOME/auth.json"
  if [ -f "$file" ]; then say "login file already present in $CODEX_HOME"; return 0; fi
  if [ -z "${!AUTH_VAR:-}" ]; then say "no stored login ($AUTH_VAR is not set)"; return 1; fi
  setup_codex >/dev/null
  mkdir -p "$CODEX_HOME"
  if ! (umask 077; printf '%s' "${!AUTH_VAR}" | base64 -d >"$file") 2>/dev/null; then
    rm -f "$file"; say "$AUTH_VAR is not valid base64"; return 1
  fi
  chmod 600 "$file"
  if ! python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["tokens"]["refresh_token"]' "$file" 2>/dev/null; then
    rm -f "$file"; say "$AUTH_VAR is not a Codex auth.json (no ChatGPT tokens in it)"; return 1
  fi
  if signed_in; then
    say "restored the stored ChatGPT login (not printed). If the first image turn reports an auth error, it has expired: sign in again with 'login'."
  else
    rm -f "$file"; say "the stored login was not accepted by Codex. Sign in again with: bash $0 login"; return 1
  fi
}

cmd_setup() {
  setup_venv
  setup_codex
  check_hosts || true
  if ! signed_in && [ -n "${!AUTH_VAR:-}" ]; then cmd_restore || true; fi
  if signed_in; then say "codex login: signed in with ChatGPT"; else say "codex login: not signed in. Run: bash $0 login"; fi
  cat <<EOF

next, from $FORGE (see docs/GPT_IMAGE_PAIR.md and docs/CODEX_NATIVE_BRIDGE.md):
  export PATH="$TOOLS/codex/node_modules/.bin:\$PATH" CODEX_HOME="$CODEX_HOME"
  $VENV/bin/python -m forge image-pair --root <jobs dir> --spec <spec.json> begin
  $VENV/bin/python -m forge.codex_native run --enable-native --codex-home "$CODEX_HOME" \\
    --work-root "\$HOME/.pixel-forge-native-jobs" --model <model from: bash $0 models> \\
    --revision native-worker-v1 --root <jobs dir> --key <job key>
Do not interrupt a 'run': an interrupted turn leaves the job in_flight and it cannot be reissued.
EOF
}

cmd_login() {
  setup_codex >/dev/null
  if ! signed_in && [ -n "${!AUTH_VAR:-}" ]; then cmd_restore || true; fi
  if signed_in; then say "already signed in with ChatGPT (run 'codex logout' with CODEX_HOME=$CODEX_HOME to remove it)"; return 0; fi
  check_hosts || { say "fix the blocked host(s) first"; return 1; }
  mkdir -p "$TOOLS" "$CODEX_HOME"
  rm -f "$LOG"
  nohup "$CODEX" login --device-auth >"$LOG" 2>&1 &
  echo $! >"$TOOLS/codex-login.pid"
  for _ in $(seq 1 20); do
    grep -q "one-time code" "$LOG" 2>/dev/null && break
    sleep 1
  done
  sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -E "https://|[A-Z0-9]{4}-[A-Z0-9]{4,5}|expires"
  say "enter the code in your browser, then run: bash $0 status"
}

cmd_status() {
  [ -x "$VENV/bin/python" ] && say "forge venv: ok" || say "forge venv: missing (run setup)"
  [ -x "$CODEX" ] && say "codex: $("$CODEX" --version 2>&1 | head -1)" || say "codex: not installed (run setup)"
  check_hosts || true
  if [ -x "$CODEX" ] && signed_in; then say "codex login: signed in with ChatGPT"; else say "codex login: not signed in"; fi
  if [ -n "${!AUTH_VAR:-}" ]; then say "stored login: $AUTH_VAR is set (value not shown)"; else say "stored login: $AUTH_VAR is not set"; fi
}

cmd_models() {
  [ -x "$CODEX" ] || { say "codex is not installed (run setup)"; return 1; }
  "$CODEX" debug models 2>/dev/null | "${VENV}/bin/python" -c '
import sys, json
data = json.load(sys.stdin)
for m in (data.get("models", data) if isinstance(data, dict) else data):
    if isinstance(m, dict) and m.get("visibility") == "list":
        print(m.get("slug") or m.get("id"), "-", m.get("display_name", ""))' 2>/dev/null \
    || "$CODEX" debug models | head -c 600
}

case "${1:-setup}" in
  setup) cmd_setup ;;
  login) cmd_login ;;
  status) cmd_status ;;
  models) cmd_models ;;
  restore) cmd_restore ;;
  *) say "usage: $0 [setup|login|status|models|restore]"; exit 2 ;;
esac
