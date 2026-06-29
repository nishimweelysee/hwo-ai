#!/usr/bin/env bash
#
# run-remote.sh — start HWO (backend + AI + web) and expose it over the internet
# via ngrok, then launch the Expo mobile app pointed at the public backend URL.
#
# Portable across macOS and Linux (bash 3.2+). On Windows, use WSL or Git Bash.
#
# Web   : reachable at the ngrok URL for port 3000 (Next proxies /api -> :8080).
# Mobile: the Metro bundler (:8081) is tunneled through OUR ngrok the same way the
#         backend is, and Expo is told to advertise that public URL via
#         EXPO_PACKAGER_PROXY_URL. This avoids Expo's flaky built-in `--tunnel`.
#         The device talks to the backend through its own ngrok URL (:8080).
#
# Usage:
#   ./run-remote.sh                      # dev (default): mvn spring-boot:run + next dev
#   ./run-remote.sh --profile prod       # prod: packaged jar + next start (builds if needed)
#   ./run-remote.sh --prod               # shorthand for --profile prod
#   ./run-remote.sh --no-mobile          # skip Expo mobile bundler
#
# Env (all optional):
#   PROFILE=dev|prod               default: dev
#   SPRING_PROFILE=dev|prod        Spring profile (defaults to PROFILE)
#   MOBILE_MODE=ngrok|tunnel|lan   default: ngrok
#   BACKEND_PORT=8080  WEB_PORT=3000  METRO_PORT=8081  AI_PORT=8000
#   NGROK_BIN=/path/to/ngrok       override ngrok binary
#   NGROK_AUTHTOKEN=...            skip reading ngrok config file
#   SKIP_POSTGRES_CHECK=1          skip :5432 warning
#
# Stop everything with Ctrl+C.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.remote-logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT="${BACKEND_PORT:-8080}"
AI_PORT="${AI_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
METRO_PORT="${METRO_PORT:-8081}"
NGROK_API="${NGROK_API:-http://127.0.0.1:4040/api/tunnels}"
NGROK_JSON="$LOG_DIR/ngrok-tunnels.json"

MOBILE_MODE="${MOBILE_MODE:-ngrok}"

# Profile: "dev" = live-reload dev servers; "prod" = compiled artifacts
# (packaged backend jar + `next start` on a production build).
PROFILE="${PROFILE:-dev}"
START_MOBILE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-mobile) START_MOBILE=0 ;;
    --prod) PROFILE=prod ;;
    --dev) PROFILE=dev ;;
    --profile) shift; PROFILE="${1:-dev}" ;;
    --profile=*) PROFILE="${1#*=}" ;;
    -h|--help)
      echo "Usage: $0 [--profile dev|prod] [--prod|--dev] [--no-mobile]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

case "$PROFILE" in
  dev|prod) ;;
  *) echo "Invalid --profile '$PROFILE' (use dev or prod)" >&2; exit 1 ;;
esac

# Spring profile to activate (prod has no application-prod.yml, so it falls back
# to application.yml defaults — localhost DB — which is what we want here).
SPRING_PROFILE="${SPRING_PROFILE:-$PROFILE}"

# Track only the processes we start, so cleanup never kills pre-existing servers.
PIDS=()
NGROK_PID=""
STARTED_PORTS=()

c_blue="$(printf '\033[1;34m')"; c_green="$(printf '\033[1;32m')"
c_yellow="$(printf '\033[1;33m')"; c_red="$(printf '\033[1;31m')"; c_off="$(printf '\033[0m')"
log()  { echo "${c_blue}[run-remote]${c_off} $*"; }
ok()   { echo "${c_green}[ok]${c_off} $*"; }
warn() { echo "${c_yellow}[warn]${c_off} $*"; }
err()  { echo "${c_red}[error]${c_off} $*" >&2; }

# ── portable helpers ─────────────────────────────────────────────────────────

load_node_env() {
  command -v node >/dev/null 2>&1 && return 0

  # nvm (common on macOS/Linux)
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    command -v node >/dev/null 2>&1 && return 0
  fi

  # fnm
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)"
    command -v node >/dev/null 2>&1 && return 0
  fi
  if [ -s "$HOME/.fnm/fnm" ]; then
    eval "$("$HOME/.fnm/fnm" env)"
    command -v node >/dev/null 2>&1 && return 0
  fi

  # volta
  if [ -d "$HOME/.volta/bin" ]; then
    PATH="$HOME/.volta/bin:$PATH"
    export PATH
    command -v node >/dev/null 2>&1 && return 0
  fi

  # asdf
  if [ -s "$HOME/.asdf/asdf.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.asdf/asdf.sh"
    command -v node >/dev/null 2>&1 && return 0
  fi

  return 1
}

port_open() {
  # port_open <port> — true if something is listening on 127.0.0.1:<port>
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1 && return 0
    nc -z localhost "$port" >/dev/null 2>&1 && return 0
  fi
  # bash /dev/tcp (works on bash 3.2+ where /dev/tcp is enabled)
  ( : >/dev/tcp/127.0.0.1/"$port" ) >/dev/null 2>&1 && return 0
  # last resort: HTTP probe (works even when nc and /dev/tcp are unavailable)
  curl -s -o /dev/null -m 1 "http://127.0.0.1:$port/" >/dev/null 2>&1 && return 0
  return 1
}

kill_port() {
  # kill_port <port> — best-effort kill of listeners on a port we started
  local port="$1" pid
  if command -v lsof >/dev/null 2>&1; then
    while IFS= read -r pid; do
      [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null
    done < <(lsof -ti:"$port" 2>/dev/null || true)
    return 0
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v ss >/dev/null 2>&1; then
    while IFS= read -r pid; do
      [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null
    done < <(ss -lptn "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' || true)
  fi
}

parse_ngrok_urls() {
  # parse_ngrok_urls <json-file> — prints: web_url backend_url metro_url
  node - "$1" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
try {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const m = {};
  for (const t of d.tunnels || []) {
    const url = t.public_url || "";
    if (url.startsWith("https")) m[t.name || ""] = url;
  }
  process.stdout.write([m.web || "", m.backend || "", m.metro || ""].join(" "));
} catch {
  process.stdout.write("  ");
}
NODE
}

ngrok_install_hint() {
  cat <<'HINT'
  Install ngrok, then add your authtoken (https://dashboard.ngrok.com/get-started/your-authtoken):

    macOS:   brew install ngrok
    Linux:   snap install ngrok   OR   https://ngrok.com/download
    Any OS:  https://ngrok.com/download

    ngrok config add-authtoken <YOUR_TOKEN>
    # or: export NGROK_AUTHTOKEN=<YOUR_TOKEN>
HINT
}

find_backend_jar() {
  local jar
  jar=$(ls -t "$ROOT/backend/target/"*.jar 2>/dev/null | grep -v '\.original$' | head -1)
  [ -n "$jar" ] && echo "$jar"
}

ensure_backend_jar() {
  local jar
  jar="$(find_backend_jar)"
  if [ -n "$jar" ]; then echo "$jar"; return 0; fi
  log "Building backend jar (first prod run — can take several minutes) → $LOG_DIR/backend-build.log"
  if ( cd "$ROOT/backend" && mvn -q -DskipTests package ) >"$LOG_DIR/backend-build.log" 2>&1; then
    jar="$(find_backend_jar)"
    [ -n "$jar" ] && { ok "Backend jar ready"; echo "$jar"; return 0; }
  fi
  err "Backend package failed — see $LOG_DIR/backend-build.log"
  tail -25 "$LOG_DIR/backend-build.log" 2>/dev/null
  return 1
}

ensure_web_prod_build() {
  if [ -d "$ROOT/.next" ] && [ -f "$ROOT/.next/BUILD_ID" ]; then
    ok "Next.js production build present (reusing)"
    return 0
  fi
  log "Building Next.js for production (first prod run — can take a few minutes) → $LOG_DIR/web-build.log"
  if ( cd "$ROOT" && npm run build ) >"$LOG_DIR/web-build.log" 2>&1; then
    ok "Next.js production build ready"
    return 0
  fi
  err "Next.js build failed — see $LOG_DIR/web-build.log"
  tail -25 "$LOG_DIR/web-build.log" 2>/dev/null
  return 1
}

cleanup() {
  echo
  log "Shutting down…"
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
  done
  sleep 1
  [ -n "$NGROK_PID" ] && kill -9 "$NGROK_PID" 2>/dev/null
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null
  done
  for p in "${STARTED_PORTS[@]:-}"; do
    [ -n "$p" ] && kill_port "$p"
  done
  ok "Stopped."
}
trap cleanup EXIT INT TERM

show_log_tail() {
  local name="$1" lines="${2:-25}"
  for suffix in err out log; do
    local path="$LOG_DIR/${name}.${suffix}.log"
    [ -f "$path" ] || path="$LOG_DIR/${name}.log"
    if [ -f "$path" ] && [ -s "$path" ]; then
      echo "----- ${name} (last $lines lines) -----"
      tail -n "$lines" "$path" | sed 's/^/  /'
    fi
  done
}

wait_for_http() {
  # wait_for_http <url> <timeout> <label> [logName] [pid]
  local url="$1" timeout="$2" label="$3" log_name="${4:-}" pid="${5:-}" waited=0
  while ! curl -s -o /dev/null -m 3 "$url"; do
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      err "$label process exited before becoming reachable."
      [ -n "$log_name" ] && show_log_tail "$log_name"
      return 1
    fi
    sleep 2; waited=$((waited + 2))
    if [ "$waited" -ge "$timeout" ]; then
      warn "$label not responding after ${timeout}s (continuing anyway)"
      [ -n "$log_name" ] && show_log_tail "$log_name"
      return 1
    fi
  done
  ok "$label is up"
}

# ── preconditions ──────────────────────────────────────────────────────────

NGROK_BIN="${NGROK_BIN:-ngrok}"
if ! command -v "$NGROK_BIN" >/dev/null 2>&1; then
  err "ngrok is not installed or not on PATH."
  ngrok_install_hint
  exit 1
fi

load_node_env || true
command -v node >/dev/null 2>&1 || { err "node not found (install Node.js or load nvm/fnm/volta)"; exit 1; }
command -v mvn  >/dev/null 2>&1 || { err "maven (mvn) not found"; exit 1; }
command -v curl >/dev/null 2>&1 || { err "curl not found"; exit 1; }
if [ "$PROFILE" = "prod" ]; then
  command -v java >/dev/null 2>&1 || { err "java not found (JDK 17+ required for prod profile)"; exit 1; }
fi

resolve_authtoken() {
  if [ -n "${NGROK_AUTHTOKEN:-}" ]; then echo "$NGROK_AUTHTOKEN"; return; fi
  local f tok
  for f in \
    "$HOME/Library/Application Support/ngrok/ngrok.yml" \
    "$HOME/.config/ngrok/ngrok.yml" \
    "$HOME/.ngrok2/ngrok.yml"; do
    [ -f "$f" ] || continue
    tok=$(grep -E '^[[:space:]]*authtoken:' "$f" 2>/dev/null | head -1 \
      | sed -E 's/.*authtoken:[[:space:]]*//; s/"//g; s/[[:space:]]*$//')
    [ -n "$tok" ] && { echo "$tok"; return; }
  done
  echo ""
}
NGROK_TOKEN="$(resolve_authtoken)"
[ -z "$NGROK_TOKEN" ] && {
  err "No ngrok authtoken found."
  ngrok_install_hint
  exit 1
}

# ── postgres check (optional; setup varies by OS) ───────────────────────────
if [ "${SKIP_POSTGRES_CHECK:-0}" != "1" ]; then
  if port_open 5432; then ok "PostgreSQL reachable on :5432"
  else warn "PostgreSQL not reachable on :5432 — start it before the backend will work"; fi
fi

log "Profile: $PROFILE (Spring profile: $SPRING_PROFILE)"

# ── backend ────────────────────────────────────────────────────────────────
BackendProcess=""
if port_open "$BACKEND_PORT"; then
  ok "Backend already running on :$BACKEND_PORT (reusing)"
else
  if [ "$PROFILE" = "prod" ]; then
    BACKEND_JAR="$(ensure_backend_jar)" || exit 1
    log "Starting Spring Boot backend (prod jar, profile=$SPRING_PROFILE) → $LOG_DIR/backend.log"
    ( cd "$ROOT/backend" && exec java -jar "$BACKEND_JAR" --spring.profiles.active="$SPRING_PROFILE" ) \
      >"$LOG_DIR/backend.log" 2>&1 &
  else
    log "Starting Spring Boot backend (dev, profile=$SPRING_PROFILE) → $LOG_DIR/backend.log"
    ( cd "$ROOT/backend" && exec mvn -q spring-boot:run -Dspring-boot.run.profiles="$SPRING_PROFILE" ) \
      >"$LOG_DIR/backend.log" 2>&1 &
  fi
  BackendProcess=$!
  PIDS+=("$BackendProcess"); STARTED_PORTS+=("$BACKEND_PORT")
fi

# ── AI service (optional, auto-bootstraps its venv on first run) ─────────────
AI_VENV="$ROOT/ai-service/.venv"
AI_UVICORN="$AI_VENV/bin/uvicorn"
if port_open "$AI_PORT"; then
  ok "AI service already running on :$AI_PORT (reusing)"
else
  if [ ! -x "$AI_UVICORN" ]; then
    if command -v python3 >/dev/null 2>&1; then
      log "Setting up AI service venv (first run — this can take a few minutes) → $LOG_DIR/ai-setup.log"
      if python3 -m venv "$AI_VENV" >"$LOG_DIR/ai-setup.log" 2>&1 \
        && "$AI_VENV/bin/python" -m pip install --quiet --upgrade pip >>"$LOG_DIR/ai-setup.log" 2>&1 \
        && "$AI_VENV/bin/python" -m pip install -q -r "$ROOT/ai-service/requirements.txt" >>"$LOG_DIR/ai-setup.log" 2>&1; then
        ok "AI venv ready"
      else
        warn "AI venv setup failed (see $LOG_DIR/ai-setup.log) — backend will use its fallback model"
      fi
    else
      warn "python3 not found — skipping AI service; backend uses its fallback model"
    fi
  fi
  if [ -x "$AI_UVICORN" ]; then
    log "Starting AI service → $LOG_DIR/ai.log"
    ( cd "$ROOT/ai-service" && exec "$AI_UVICORN" main:app --host 0.0.0.0 --port "$AI_PORT" ) \
      >"$LOG_DIR/ai.log" 2>&1 &
    PIDS+=("$!"); STARTED_PORTS+=("$AI_PORT")
    warn "AI service warms up on first import (~1-2 min); backend falls back until it is healthy"
  fi
fi

# ── web (Next.js) ───────────────────────────────────────────────────────────
WebProcess=""
if port_open "$WEB_PORT"; then
  ok "Web already running on :$WEB_PORT (reusing)"
else
  if [ "$PROFILE" = "prod" ]; then
    ensure_web_prod_build || exit 1
    log "Starting Next.js web (prod, next start) → $LOG_DIR/web.log"
    ( cd "$ROOT" && exec npm run start ) >"$LOG_DIR/web.log" 2>&1 &
  else
    log "Starting Next.js web (dev, next dev) → $LOG_DIR/web.log"
    ( cd "$ROOT" && exec npm run dev ) >"$LOG_DIR/web.log" 2>&1 &
  fi
  WebProcess=$!
  PIDS+=("$WebProcess"); STARTED_PORTS+=("$WEB_PORT")
fi

# Prod builds take longer on first compile; dev hot-reload is quicker to bind.
if [ "$PROFILE" = "prod" ]; then
  BACKEND_TIMEOUT="${BACKEND_TIMEOUT:-360}"
  WEB_TIMEOUT="${WEB_TIMEOUT:-180}"
else
  BACKEND_TIMEOUT="${BACKEND_TIMEOUT:-120}"
  WEB_TIMEOUT="${WEB_TIMEOUT:-120}"
fi
wait_for_http "http://127.0.0.1:$BACKEND_PORT/api/auth/registration-config" "$BACKEND_TIMEOUT" "Backend" "backend" "$BackendProcess"
wait_for_http "http://127.0.0.1:$WEB_PORT" "$WEB_TIMEOUT" "Web" "web" "$WebProcess"

# ── ngrok (tunnels: web + backend, plus metro when mobile uses ngrok mode) ──
WANT_METRO=0
if [ "$START_MOBILE" -eq 1 ] && [ "$MOBILE_MODE" = "ngrok" ]; then WANT_METRO=1; fi

NGROK_CFG="$LOG_DIR/ngrok.yml"
{
  echo 'version: "2"'
  echo "authtoken: $NGROK_TOKEN"
  echo "tunnels:"
  echo "  web:"
  echo "    addr: $WEB_PORT"
  echo "    proto: http"
  echo "  backend:"
  echo "    addr: $BACKEND_PORT"
  echo "    proto: http"
  if [ "$WANT_METRO" -eq 1 ]; then
    echo "  metro:"
    echo "    addr: $METRO_PORT"
    echo "    proto: http"
  fi
} >"$NGROK_CFG"

log "Starting ngrok tunnels (web:$WEB_PORT, backend:$BACKEND_PORT$([ "$WANT_METRO" -eq 1 ] && echo ", metro:$METRO_PORT")) → $LOG_DIR/ngrok.log"
"$NGROK_BIN" start --all --config "$NGROK_CFG" --log stdout >"$LOG_DIR/ngrok.log" 2>&1 &
NGROK_PID="$!"

WEB_URL=""; BACKEND_URL=""; METRO_URL=""; waited=0
while :; do
  if curl -s -m 3 "$NGROK_API" >"$NGROK_JSON" 2>/dev/null; then
    read -r WEB_URL BACKEND_URL METRO_URL < <(parse_ngrok_urls "$NGROK_JSON")
  fi
  if [ -n "$WEB_URL" ]; then
    metro_ready=1
    [ "$WANT_METRO" -eq 1 ] && [ -z "$METRO_URL" ] && metro_ready=0
    { { [ -n "$BACKEND_URL" ] && [ "$metro_ready" -eq 1 ]; } || [ "$waited" -ge 16 ]; } && break
  fi
  sleep 2; waited=$((waited + 2))
  if [ "$waited" -ge 45 ]; then
    [ -n "$WEB_URL" ] && break
    err "Could not read ngrok URLs from $NGROK_API — see $LOG_DIR/ngrok.log"
    exit 1
  fi
done
ok "Tunnels established"

if [ "$WANT_METRO" -eq 1 ] && [ -z "$METRO_URL" ]; then
  warn "Metro tunnel not available (ngrok plan tunnel limit?) — falling back to Expo --tunnel"
  MOBILE_MODE="tunnel"; WANT_METRO=0
fi

# ── wire mobile to a public URL ─────────────────────────────────────────────
MOBILE_ENV="$ROOT/mobile/.env"
if [ -n "$BACKEND_URL" ]; then
  MOBILE_API_DESC="direct backend tunnel"
  { echo "# Auto-generated by run-remote.sh on $(date)"
    echo "EXPO_PUBLIC_BACKEND_URL=$BACKEND_URL"; } >"$MOBILE_ENV"
  MOBILE_ENV_VAR="EXPO_PUBLIC_BACKEND_URL"; MOBILE_ENV_VAL="$BACKEND_URL"
else
  MOBILE_API_DESC="web /api proxy (no separate backend tunnel)"
  { echo "# Auto-generated by run-remote.sh on $(date)"
    echo "EXPO_PUBLIC_API_URL=$WEB_URL"; } >"$MOBILE_ENV"
  MOBILE_ENV_VAR="EXPO_PUBLIC_API_URL"; MOBILE_ENV_VAL="$WEB_URL"
fi
ok "Wrote mobile/.env  ($MOBILE_ENV_VAR=$MOBILE_ENV_VAL)"

# ── summary ─────────────────────────────────────────────────────────────────
cat <<SUMMARY

${c_green}────────────────────────────────────────────────────────────${c_off}
${c_green} HWO is live over the internet${c_off}  (${PROFILE} profile)
${c_green}────────────────────────────────────────────────────────────${c_off}
  Web app (open in browser):   ${c_blue}$WEB_URL${c_off}
  Mobile API target:           ${c_blue}$MOBILE_ENV_VAL${c_off}
                               (${MOBILE_API_DESC})$([ -n "$METRO_URL" ] && printf '\n  Mobile bundler (Metro):      %s' "$METRO_URL")
  ngrok inspector:             http://127.0.0.1:4040
  Logs:                        $LOG_DIR/
${c_green}────────────────────────────────────────────────────────────${c_off}
SUMMARY

# ── mobile (Expo) ───────────────────────────────────────────────────────────
if [ "$START_MOBILE" -eq 1 ]; then
  command -v npx >/dev/null 2>&1 || { err "npx not found; cannot start Expo"; wait; }
  cd "$ROOT/mobile" || { err "mobile dir not found"; wait; }

  export "$MOBILE_ENV_VAR=$MOBILE_ENV_VAL"

  case "$MOBILE_MODE" in
    ngrok)
      log "Starting Expo (mobile) via ngrok Metro tunnel. Scan the QR in Expo Go. Ctrl+C stops everything."
      log "Metro public URL: $METRO_URL"
      EXPO_PACKAGER_PROXY_URL="$METRO_URL" npx expo start --port "$METRO_PORT" ;;
    tunnel)
      log "Starting Expo (mobile) with Expo's --tunnel. Scan the QR in Expo Go. Ctrl+C stops everything."
      npx expo start --tunnel ;;
    lan)
      log "Starting Expo (mobile) in LAN mode (same Wi-Fi only). Ctrl+C stops everything."
      npx expo start --lan ;;
    *)
      err "Unknown MOBILE_MODE='$MOBILE_MODE' (use ngrok|tunnel|lan)"; wait ;;
  esac
else
  log "Mobile skipped (--no-mobile). Press Ctrl+C to stop services and tunnels."
  wait
fi
