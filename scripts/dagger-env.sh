#!/usr/bin/env bash
# Source this file before running Dagger with Apple container:
#
#   source scripts/dagger-env.sh
#
# Optional overrides:
#
#   DAGGER_DNS_SERVER=8.8.8.8 source scripts/dagger-env.sh
#   DAGGER_ENGINE_RECREATE=1 source scripts/dagger-env.sh
#   DAGGER_ENGINE_NO_VOLUME=1 source scripts/dagger-env.sh
#   DAGGER_NO_NAG=0 source scripts/dagger-env.sh

if ! (return 0 2>/dev/null); then
  printf '%s\n' "This script must be sourced so it can export variables into your shell."
  printf '%s\n' "Run: source scripts/dagger-env.sh"
  exit 1
fi

_dagger_env_fail() {
  printf 'dagger-env: %s\n' "$1" >&2
  return 1
}

_dagger_env_has_line() {
  grep -Fx "$1" >/dev/null 2>&1
}

command -v dagger >/dev/null 2>&1 ||
  _dagger_env_fail "dagger is not on PATH" ||
  return 1

command -v container >/dev/null 2>&1 ||
  _dagger_env_fail "Apple container is not on PATH" ||
  return 1

if ! container system status >/dev/null 2>&1; then
  [ "${DAGGER_ENV_QUIET:-0}" = "1" ] ||
    printf '%s\n' "dagger-env: starting Apple container system"

  container system start ||
    _dagger_env_fail "failed to start Apple container system" ||
    return 1
fi

DAGGER_ENGINE_VERSION="${DAGGER_ENGINE_VERSION:-$(dagger version | awk 'NR == 1 { print $2 }')}"
[ -n "$DAGGER_ENGINE_VERSION" ] ||
  _dagger_env_fail "failed to determine Dagger engine version" ||
  return 1

DAGGER_DNS_SERVER="${DAGGER_DNS_SERVER:-1.1.1.1}"
DAGGER_GOPROXY="${DAGGER_GOPROXY:-https://proxy.golang.org,direct}"
DAGGER_NO_NAG="${DAGGER_NO_NAG:-1}"
DAGGER_ENGINE_CPUS="${DAGGER_ENGINE_CPUS:-4}"
DAGGER_ENGINE_MEMORY="${DAGGER_ENGINE_MEMORY:-8G}"
DAGGER_ENGINE_VERSION_ID="$(printf '%s' "$DAGGER_ENGINE_VERSION" | tr -c '[:alnum:]_-' '-')"
DAGGER_ENGINE_DEFAULT_NAME="dagger-engine-${DAGGER_ENGINE_VERSION_ID}-dns"
DAGGER_ENGINE_OLD_DEFAULT_NAME="dagger-engine-${DAGGER_ENGINE_VERSION}-dns"

if [ -z "${DAGGER_ENGINE_NAME:-}" ] || [ "$DAGGER_ENGINE_NAME" = "$DAGGER_ENGINE_OLD_DEFAULT_NAME" ]; then
  DAGGER_ENGINE_NAME="$DAGGER_ENGINE_DEFAULT_NAME"
fi

DAGGER_ENGINE_DEFAULT_VOLUME="${DAGGER_ENGINE_DEFAULT_NAME}-state"
DAGGER_ENGINE_OLD_DEFAULT_VOLUME="${DAGGER_ENGINE_OLD_DEFAULT_NAME}-state"

if [ -z "${DAGGER_ENGINE_VOLUME:-}" ] || [ "$DAGGER_ENGINE_VOLUME" = "$DAGGER_ENGINE_OLD_DEFAULT_VOLUME" ]; then
  DAGGER_ENGINE_VOLUME="$DAGGER_ENGINE_DEFAULT_VOLUME"
fi

if [ "${DAGGER_ENGINE_RECREATE:-0}" = "1" ]; then
  if container list --all --quiet 2>/dev/null | _dagger_env_has_line "$DAGGER_ENGINE_NAME"; then
    [ "${DAGGER_ENV_QUIET:-0}" = "1" ] ||
      printf 'dagger-env: recreating %s\n' "$DAGGER_ENGINE_NAME"

    container delete --force "$DAGGER_ENGINE_NAME" >/dev/null ||
      _dagger_env_fail "failed to remove existing Dagger engine container" ||
      return 1
  fi
fi

if [ "${DAGGER_ENGINE_NO_VOLUME:-0}" != "1" ]; then
  if ! container volume list --quiet 2>/dev/null | _dagger_env_has_line "$DAGGER_ENGINE_VOLUME"; then
    container volume create "$DAGGER_ENGINE_VOLUME" >/dev/null ||
      _dagger_env_fail "failed to create Dagger engine volume" ||
      return 1
  fi
fi

if ! container list --quiet 2>/dev/null | _dagger_env_has_line "$DAGGER_ENGINE_NAME"; then
  if container list --all --quiet 2>/dev/null | _dagger_env_has_line "$DAGGER_ENGINE_NAME"; then
    container delete --force "$DAGGER_ENGINE_NAME" >/dev/null ||
      _dagger_env_fail "failed to remove stopped Dagger engine container" ||
      return 1
  fi

  [ "${DAGGER_ENV_QUIET:-0}" = "1" ] ||
    printf 'dagger-env: starting %s with DNS %s\n' "$DAGGER_ENGINE_NAME" "$DAGGER_DNS_SERVER"

  if [ "${DAGGER_ENGINE_NO_VOLUME:-0}" = "1" ]; then
    container run --detach \
      --name "$DAGGER_ENGINE_NAME" \
      --cap-add ALL \
      --cpus "$DAGGER_ENGINE_CPUS" \
      --memory "$DAGGER_ENGINE_MEMORY" \
      --dns "$DAGGER_DNS_SERVER" \
      --env "_DAGGER_ENGINE_SYSTEMENV_GOPROXY=$DAGGER_GOPROXY" \
      "registry.dagger.io/engine:$DAGGER_ENGINE_VERSION" >/dev/null ||
      _dagger_env_fail "failed to start Dagger engine with Apple container" ||
      return 1
  else
    container run --detach \
      --name "$DAGGER_ENGINE_NAME" \
      --cap-add ALL \
      --cpus "$DAGGER_ENGINE_CPUS" \
      --memory "$DAGGER_ENGINE_MEMORY" \
      --dns "$DAGGER_DNS_SERVER" \
      --volume "$DAGGER_ENGINE_VOLUME:/var/lib/dagger" \
      --env "_DAGGER_ENGINE_SYSTEMENV_GOPROXY=$DAGGER_GOPROXY" \
      "registry.dagger.io/engine:$DAGGER_ENGINE_VERSION" >/dev/null ||
      _dagger_env_fail "failed to start Dagger engine with Apple container" ||
      return 1
  fi
fi

export DAGGER_DNS_SERVER
export DAGGER_GOPROXY
export DAGGER_NO_NAG
export DAGGER_ENGINE_NAME
export DAGGER_ENGINE_VERSION
export DAGGER_ENGINE_VERSION_ID
export DAGGER_ENGINE_DEFAULT_NAME
export DAGGER_ENGINE_DEFAULT_VOLUME
export _EXPERIMENTAL_DAGGER_RUNNER_HOST="container://${DAGGER_ENGINE_NAME}"

[ "${DAGGER_ENV_QUIET:-0}" = "1" ] ||
  printf 'dagger-env: exported _EXPERIMENTAL_DAGGER_RUNNER_HOST=%s\n' "$_EXPERIMENTAL_DAGGER_RUNNER_HOST"
