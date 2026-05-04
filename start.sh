#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Talent Hub — Local Start Script
# Starts backend on port 3002 by default. Frontend is served from the same port
# in production builds, and Vite proxies API traffic to this port in dev.
# Access: http://localhost:3002
#
# Run ./stop.sh to shut down.
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
ENV_FILE="$ROOT/backend/.env"

mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
info() { echo -e "${BOLD}▶${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; exit 1; }

fail_startup() {
  local message=$1
  local pid=""
  if [ -f "$LOG_DIR/backend.pid" ]; then
    pid=$(cat "$LOG_DIR/backend.pid")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$LOG_DIR/backend.pid"
  fi
  echo ""
  tail -n 40 "$LOG_DIR/backend.log" 2>/dev/null || true
  fail "$message"
}

# ── Stale PID guard ───────────────────────────────────────────
if [ -f "$LOG_DIR/backend.pid" ]; then
  EXISTING_PID=$(cat "$LOG_DIR/backend.pid")
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo -e "${YELLOW}⚠${NC}  Backend already appears to be running (PID $EXISTING_PID). Run ./stop.sh first."
    exit 1
  fi
  echo -e "${YELLOW}⚠${NC}  Removing stale backend PID file (PID $EXISTING_PID was not running)."
  rm -f "$LOG_DIR/backend.pid"
fi

# ── Kill any orphan process already on backend port ──────────
DEFAULT_BACKEND_PORT=3002
BACKEND_PORT=${PORT:-}
BACKEND_PORT=${BACKEND_PORT:-$(awk -F= '/^[[:space:]]*PORT[[:space:]]*=/{ gsub(/[[:space:]]/, "", $2); print $2; exit }' "$ENV_FILE" 2>/dev/null || true)}
BACKEND_PORT=${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}

if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]]; then
  fail "Invalid backend port '$BACKEND_PORT'. Set PORT to a numeric value in backend/.env."
fi

ORPHAN=$(lsof -ti :"$BACKEND_PORT" 2>/dev/null || true)
if [ -n "$ORPHAN" ]; then
  echo -e "${YELLOW}⚠${NC}  Port $BACKEND_PORT in use (PID $ORPHAN) — killing before restart..."
  kill "$ORPHAN" 2>/dev/null || true
  sleep 1
fi

# ── Backend ───────────────────────────────────────────────────
info "Starting backend..."
cd "$ROOT/backend"
PORT="$BACKEND_PORT" npm run dev > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"
echo "   PID $(cat "$LOG_DIR/backend.pid") — logs/backend.log"

# ── Wait for backend ──────────────────────────────────────────
echo ""
echo "   Waiting for backend to be ready..."
tries=0
while ! nc -z localhost "$BACKEND_PORT" 2>/dev/null; do
  sleep 1
  tries=$((tries + 1))
  if grep -Eq 'FATAL:|Failed to start server:' "$LOG_DIR/backend.log" 2>/dev/null; then
    fail_startup "Backend failed during startup on port $BACKEND_PORT. Check logs/backend.log"
  fi
  if [ ! -f "$LOG_DIR/backend.pid" ] || ! kill -0 "$(cat "$LOG_DIR/backend.pid")" 2>/dev/null; then
    fail_startup "Backend exited before opening port $BACKEND_PORT. Check logs/backend.log"
  fi
  if [ $tries -ge 40 ]; then
    fail_startup "Backend did not start on port $BACKEND_PORT within 40 s. Check logs/backend.log"
  fi
done
ok "Backend ready  →  http://localhost:$BACKEND_PORT"

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🚀  Talent Hub is running locally.${NC}"
echo ""
echo -e "   Open  →  ${BOLD}http://localhost:$BACKEND_PORT${NC}"
echo "   Login →  admin@company.com / Admin@123"
echo ""
echo    "   Run ./stop.sh to shut down."
