#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly repository_root="/var/www/media.micutu.com"
readonly installed_health_check="/usr/local/libexec/social-media-service-health"
readonly monitor_user="social-media-monitor"
readonly monitor_group="social-media-monitor"
readonly monitor_home="/nonexistent"
readonly monitor_shell="/usr/sbin/nologin"

usage() {
  echo "Usage: sudo $0 [--dry-run]" >&2
}

dry_run=0
if [[ ${1:-} == "--dry-run" ]]; then
  dry_run=1
  shift
fi
if [[ $# -ne 0 ]]; then
  usage
  exit 64
fi
if [[ $EUID -ne 0 ]]; then
  echo "Installing the production health monitor requires root" >&2
  exit 77
fi

for command in getent id install systemctl useradd; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done

for tracked_file in \
  "$repository_root/deploy/scripts/check-service-health.sh" \
  "$repository_root/deploy/systemd/social-media-service-health.service" \
  "$repository_root/deploy/systemd/social-media-service-health.timer"; do
  if [[ ! -f $tracked_file || -L $tracked_file ]]; then
    echo "Tracked deployment file is missing or unsafe: $tracked_file" >&2
    exit 66
  fi
done
if ! systemctl cat swift-vapor-alert@.service >/dev/null 2>&1; then
  echo "The existing operator alert service is unavailable" >&2
  exit 66
fi

monitor_identity="existing"
if ! getent passwd "$monitor_user" >/dev/null; then
  if getent group "$monitor_group" >/dev/null; then
    echo "Monitor group exists without the expected user" >&2
    exit 65
  fi
  monitor_identity="create"
else
  IFS=: read -r _ _ _ _ _ existing_home existing_shell < <(
    getent passwd "$monitor_user"
  )
  if [[ $existing_home != "$monitor_home" || \
        $existing_shell != "$monitor_shell" || \
        $(id -gn "$monitor_user") != "$monitor_group" ]]; then
    echo "Existing monitor identity has unexpected properties" >&2
    exit 77
  fi
fi

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "health_executable=$installed_health_check"
  echo "timer=social-media-service-health.timer"
  echo "alert_service=swift-vapor-alert@.service"
  echo "monitor_identity=$monitor_identity"
  exit 0
fi

if [[ $monitor_identity == "create" ]]; then
  useradd --system --user-group --no-create-home --home-dir "$monitor_home" \
    --shell "$monitor_shell" --comment "Social Media health monitor" \
    "$monitor_user"
fi

install -o root -g root -m 0755 \
  "$repository_root/deploy/scripts/check-service-health.sh" \
  "$installed_health_check"
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-service-health.service" \
  /etc/systemd/system/social-media-service-health.service
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-service-health.timer" \
  /etc/systemd/system/social-media-service-health.timer
systemctl daemon-reload
systemctl enable --now social-media-service-health.timer

echo "install=passed"
echo "health_executable=$installed_health_check"
echo "timer=social-media-service-health.timer"
echo "monitor_identity=$monitor_user"
echo "health_check_started=no"
