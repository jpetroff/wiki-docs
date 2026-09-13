#!/usr/bin/env bash
set -euo pipefail

action=${1:-status}
root=${2:-/home/eugene/www}
port=${3:-8080}
case "$action" in start|status|stop|reload) ;; *) echo "Usage: $0 {start|status|stop|reload} [build-directory] [port]" >&2; exit 2;; esac
[[ $port =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || { echo 'Invalid port' >&2; exit 2; }
mkdir -p "$root"
root=$(cd "$root" && pwd -P)
exec 9>"$root/.instance.lock"
flock 9
state="$root/instance.pid"
log="$root/instance.log"

# Record Linux process start time as well as PID so stale state cannot stop a
# different process after PID reuse. Ignore zombies, which no longer serve.
running() {
  [[ -f $state ]] || return 1
  read -r pid started running_port < "$state" || return 1
  [[ $pid =~ ^[0-9]+$ && $started =~ ^[0-9]+$ ]] || return 1
  [[ -r /proc/$pid/stat ]] || return 1
  local info
  info=$(awk '{print $3, $22}' "/proc/$pid/stat" 2>/dev/null) || return 1
  [[ $info != Z\ * && ${info#* } == "$started" ]]
}

stop() {
  if running; then
    kill "$pid"
    for ((i=0; i<100; i++)); do
      running || break
      sleep 0.1
    done
    if running; then
      echo "Process $pid did not stop; leaving its state intact." >&2
      return 1
    fi
    echo 'Stopped.'
  else
    echo 'Stopped (no running instance).'
  fi
  rm -f "$state"
}

start() {
  if running; then
    echo "Running: PID $pid, port $running_port"
    return
  fi
  local bun_bin
  [[ -f $root/index.js ]] || { echo "No build at $root; run make build first." >&2; return 1; }
  bun_bin=$(command -v bun)
  (
    cd "$root"
    # Ignore a development ORIGIN or socket setting copied from .env. TLS is
    # terminated by the proxy; no hostname allowlist is applied here.
    exec nohup setsid env NODE_ENV=production HOST=0.0.0.0 PORT="$port" \
      ORIGIN= SOCKET_PATH= HOST_HEADER=x-forwarded-host \
      PROTOCOL_HEADER=x-forwarded-proto PORT_HEADER= ADDRESS_HEADER= \
      "$bun_bin" "$root/index.js" </dev/null >>"$log" 2>&1 9>&-
  ) &
  pid=$!
  if [[ ! -r /proc/$pid/stat ]]; then
    echo "Startup failed; see $log" >&2
    return 1
  fi
  started=$(awk '{print $22}' "/proc/$pid/stat")
  echo "$pid $started $port" > "$state"
  for ((i=0; i<100; i++)); do
    if ! running; then
      rm -f "$state"
      echo "Startup failed; see $log" >&2
      return 1
    fi
    # A configured-docs 503 is still a healthy listener. Require this process
    # to remain alive after the probe, including when the port was occupied.
    if curl --silent --output /dev/null --max-time 1 "http://127.0.0.1:$port/"; then
      sleep 0.1
      if running; then
        echo "Running: PID $pid, port $port (log: $log)"
        return
      fi
    fi
    sleep 0.1
  done
  echo "Startup timed out; see $log" >&2
  stop
  return 1
}

case "$action" in
  start) start ;;
  stop) stop ;;
  reload) stop; start ;;
  status)
    if running; then
      echo "Running: PID $pid, port $running_port (log: $log)"
    else
      echo 'Stopped.'
      exit 1
    fi
    ;;
esac
