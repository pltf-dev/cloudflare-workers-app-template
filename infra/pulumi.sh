#!/usr/bin/env bash
# Run Pulumi against the `prod` stack with credentials from infra/.env.
#
#   ./pulumi.sh preview
#   ./pulumi.sh up                 # previews, asks for confirmation, then applies
#   ./pulumi.sh up --yes           # skip the confirmation
#   ./pulumi.sh stack output d1DatabaseId
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK="prod"

if [[ -f "$HERE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HERE/.env"
  set +a
fi
: "${CLOUDFLARE_ACCOUNT_ID:?set it in infra/.env}"
: "${PULUMI_BACKEND_URL:?set it in infra/.env}"

cd "$HERE"
pulumi stack select "$STACK" --create >/dev/null

cmd="${1:-}"
case "$cmd" in
  up|destroy|refresh)
    shift
    if [[ " $* " == *" --yes "* || " $* " == *" -y "* || " $* " == *" --skip-preview "* ]]; then
      exec pulumi "$cmd" "$@"
    fi
    pulumi preview "$@"
    printf "\nApply this '%s'? [y/N] " "$cmd" >&2
    read -r reply
    case "$reply" in
      y|Y|yes|YES) exec pulumi "$cmd" --yes --skip-preview "$@" ;;
      *) echo "Aborted. Nothing applied." >&2; exit 1 ;;
    esac
    ;;
  *)
    exec pulumi "$@"
    ;;
esac
