#!/usr/bin/env bash
# Starts a local OpenShift Console instance for developing the 'ossmconsole'
# plugin (OSSMC + Fleet Service Mesh).
#
# ACM/MCE console plugins are port-forwarded automatically so the Fleet Management
# perspective and cross-plugin links work; set LOAD_ACM_PLUGINS=false to skip them.
# OpenShift Lightspeed (OLS) console plugins are port-forwarded the same way; set
# LOAD_OLS_PLUGINS=false to skip them.
# Set KIALI_URL to also proxy a Kiali backend so the OSSMC/Service Mesh perspective
# is usable at the same time (optional: leave unset to skip wiring the Kiali proxy).
#
# Prerequisites:
#   - oc login to an OpenShift cluster (ACM/MCE/OLS optional; port-forwards are skipped
#     with a warning if the ConsolePlugins aren't found)
#   - make start (or: cd plugin && yarn start) running in another terminal

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
make -C "${SCRIPT_DIR}/.." .ensure-oc-login

OPENSHIFT_VERSION=$(oc version | grep "Server Version: " | awk '{print $3}' | cut -d. -f-2)
CONSOLE_IMAGE=${CONSOLE_IMAGE:="quay.io/openshift/origin-console:$OPENSHIFT_VERSION"}
CONSOLE_PORT=${CONSOLE_PORT:=9000}
CONSOLE_IMAGE_PLATFORM=${CONSOLE_IMAGE_PLATFORM:="linux/amd64"}
PLUGIN_NAME="ossmconsole"
PLUGIN_DEV_PORT=${PLUGIN_DEV_PORT:=9001}
ACM_PORT=${ACM_PORT:=9002}
MCE_PORT=${MCE_PORT:=9003}
OLS_PLUGIN_PORT=${OLS_PLUGIN_PORT:=9004}
OLS_API_PORT=${OLS_API_PORT:=9005}
OLS_AGENTIC_PORT=${OLS_AGENTIC_PORT:=9006}

# Set LOAD_ACM_PLUGINS=false to skip ACM/MCE port-forwards.
# Fleet Management links in the UI will not work without them.
LOAD_ACM_PLUGINS=${LOAD_ACM_PLUGINS:=true}

# Set LOAD_OLS_PLUGINS=false to skip OpenShift Lightspeed (OLS) port-forwards.
# The Lightspeed chat UI will not appear without them.
LOAD_OLS_PLUGINS=${LOAD_OLS_PLUGINS:=true}

# Set KIALI_URL to the Kiali server URL if you also want to test the OSSMC/Kiali
# perspective. Leave unset or empty to skip wiring the Kiali proxy.
KIALI_URL=${KIALI_URL:=}

ACM_SERVICE=${ACM_SERVICE:=console-chart-console-v2}
ACM_NAMESPACE=${ACM_NAMESPACE:=open-cluster-management}
MCE_SERVICE=${MCE_SERVICE:=console-mce-console}
MCE_NAMESPACE=${MCE_NAMESPACE:=multicluster-engine}

OLS_PLUGIN_NAME="lightspeed-console-plugin"
OLS_AGENTIC_PLUGIN_NAME="lightspeed-agentic-console-plugin"
OLS_NAMESPACE=${OLS_NAMESPACE:=openshift-lightspeed}
OLS_PLUGIN_SERVICE=${OLS_PLUGIN_SERVICE:=lightspeed-console-plugin}
OLS_AGENTIC_SERVICE=${OLS_AGENTIC_SERVICE:=lightspeed-agentic-console-plugin}
OLS_API_SERVICE=${OLS_API_SERVICE:=lightspeed-app-server}

PORT_FORWARD_PIDS=()
CLEANUP_RAN=false

free_local_port() {
    local port=$1
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti ":${port}" 2>/dev/null | xargs -r kill 2>/dev/null || true
    fi
}

kill_port_forward_matches() {
    local pattern=$1
    local stopped=0
    local pid

    if ! command -v pgrep >/dev/null 2>&1; then
        echo "$stopped"
        return 0
    fi

    while read -r pid; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            stopped=$((stopped + 1))
        fi
    done < <(pgrep -f "$pattern" 2>/dev/null || true)

    echo "$stopped"
}

stop_port_forwards() {
    local pid
    local stopped=0
    local extra

    for pid in "${PORT_FORWARD_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            stopped=$((stopped + 1))
        fi
    done

    # Fallback when Ctrl+C races the tracked PID list (common when run via make).
    extra=$(kill_port_forward_matches "port-forward.*:${ACM_PORT}:3000")
    stopped=$((stopped + extra))
    extra=$(kill_port_forward_matches "port-forward.*:${MCE_PORT}:3000")
    stopped=$((stopped + extra))
    extra=$(kill_port_forward_matches "port-forward.*:${OLS_PLUGIN_PORT}:9443")
    stopped=$((stopped + extra))
    extra=$(kill_port_forward_matches "port-forward.*:${OLS_API_PORT}:8443")
    stopped=$((stopped + extra))
    extra=$(kill_port_forward_matches "port-forward.*:${OLS_AGENTIC_PORT}:9443")
    stopped=$((stopped + extra))

    free_local_port "$ACM_PORT"
    free_local_port "$MCE_PORT"
    free_local_port "$OLS_PLUGIN_PORT"
    free_local_port "$OLS_API_PORT"
    free_local_port "$OLS_AGENTIC_PORT"
    echo "$stopped"
}

cleanup() {
    if [ "$CLEANUP_RAN" = "true" ]; then
        return 0
    fi
    CLEANUP_RAN=true

    if [ "$LOAD_ACM_PLUGINS" != "true" ] && [ "$LOAD_OLS_PLUGINS" != "true" ]; then
        return 0
    fi

    local stopped
    stopped=$(stop_port_forwards)
    echo "Stopped console plugin port-forwards (cleaned ${stopped} process(es))."
}

on_interrupt() {
    cleanup
    exit 0
}

trap cleanup EXIT
trap on_interrupt INT TERM HUP

wait_for_https() {
    local url=$1
    local label=$2
    local require_success=${3:-true}
    local attempts=60

    while [ "$attempts" -gt 0 ]; do
        if [ "$require_success" = "true" ]; then
            if curl -sk -o /dev/null --fail "$url" 2>/dev/null; then
                return 0
            fi
        elif curl -sk -o /dev/null "$url" 2>/dev/null; then
            return 0
        fi
        sleep 0.5
        attempts=$((attempts - 1))
    done
    echo "Error: timed out waiting for ${label} at ${url}" >&2
    return 1
}

start_port_forward() {
    local namespace=$1
    local service=$2
    local local_port=$3
    local remote_port=$4
    local label=$5
    local readiness_url=$6
    local require_success=${7:-true}

    if ! command -v curl >/dev/null 2>&1; then
        echo "Error: curl is required to verify ${label} port-forward readiness" >&2
        exit 1
    fi

    free_local_port "$local_port"

    oc port-forward -n "$namespace" "svc/${service}" "${local_port}:${remote_port}" >/dev/null 2>&1 &
    PORT_FORWARD_PIDS+=("$!")
    echo "  ${label} port-forward PID $! (localhost:${local_port} -> ${remote_port})" >&2
    wait_for_https "$readiness_url" "$label" "$require_success"
}

# Build BRIDGE_PLUGIN_PROXY with ACM/MCE/OLS services and optionally the Kiali proxy.
build_plugin_proxy_json() {
    local host=$1
    local load_acm=$2
    local load_mce=$3
    local load_ols=$4
    local kiali_url=$5

    local services="[]"

    if [ -n "$kiali_url" ]; then
        local kiali_container_url
        kiali_container_url=$(echo "$kiali_url" | sed "s|://localhost|://${host}|g; s|://127\.0\.0\.1|://${host}|g")
        # authorize:true forwards the logged-in user's OpenShift token to Kiali,
        # matching the "authorization: UserToken" proxy config used in production.
        # Required for Kiali CRs with auth.strategy=openshift; harmless otherwise.
        if command -v jq >/dev/null 2>&1; then
            services=$(echo "$services" | jq \
                --arg path "/api/proxy/plugin/ossmconsole/kiali/" \
                --arg ep "${kiali_container_url}" \
                '. + [{"consoleAPIPath":$path,"endpoint":$ep,"authorize":true}]')
        else
            services=$(printf '[{"consoleAPIPath":"/api/proxy/plugin/ossmconsole/kiali/","endpoint":"%s","authorize":true}]' \
                "$kiali_container_url")
        fi
    fi

    if [ "$load_acm" = "true" ] && command -v jq >/dev/null 2>&1; then
        services=$(echo "$services" | jq \
            --arg ep "https://${host}:${ACM_PORT}" \
            '. + [{"consoleAPIPath":"/api/proxy/plugin/acm/console/","endpoint":$ep,"authorize":true}]')
    fi

    if [ "$load_mce" = "true" ] && command -v jq >/dev/null 2>&1; then
        services=$(echo "$services" | jq \
            --arg ep "https://${host}:${MCE_PORT}" \
            '. + [{"consoleAPIPath":"/api/proxy/plugin/mce/console/","endpoint":$ep,"authorize":true}]')
    fi

    if [ "$load_ols" = "true" ] && command -v jq >/dev/null 2>&1; then
        # Matches ConsolePlugin proxy alias "ols" with authorization: UserToken.
        services=$(echo "$services" | jq \
            --arg path "/api/proxy/plugin/${OLS_PLUGIN_NAME}/ols/" \
            --arg ep "https://${host}:${OLS_API_PORT}" \
            '. + [{"consoleAPIPath":$path,"endpoint":$ep,"authorize":true}]')
    fi

    if command -v jq >/dev/null 2>&1; then
        jq -cn --argjson services "$services" '{"services":$services}'
    else
        echo '{"services":[]}'
    fi
}

append_i18n_namespace() {
    local ns=$1
    case ",${BRIDGE_I18N_NAMESPACES}," in
        *",${ns},"*) ;;
        *) BRIDGE_I18N_NAMESPACES="${BRIDGE_I18N_NAMESPACES},${ns}" ;;
    esac
}

setup_plugins() {
    local host=$1
    local load_acm=false
    local load_mce=false
    local load_ols=false
    local load_ols_agentic=false

    BRIDGE_PLUGIN_PROXY=""
    BRIDGE_PLUGINS="${PLUGIN_NAME}=http://${host}:${PLUGIN_DEV_PORT}"

    if [ "$LOAD_ACM_PLUGINS" = "true" ]; then
        if oc get consoleplugin acm >/dev/null 2>&1; then
            load_acm=true
        else
            echo "Warning: ConsolePlugin 'acm' not found — Fleet Management perspective unavailable" >&2
        fi

        if oc get consoleplugin mce >/dev/null 2>&1; then
            load_mce=true
        else
            echo "Warning: ConsolePlugin 'mce' not found — ACM plugin requires MCE" >&2
        fi

        if [ "$load_acm" = "true" ]; then
            echo "Port-forwarding ACM plugin (${ACM_NAMESPACE}/${ACM_SERVICE}) to localhost:${ACM_PORT}..." >&2
            start_port_forward "$ACM_NAMESPACE" "$ACM_SERVICE" "$ACM_PORT" 3000 "ACM plugin" \
                "https://127.0.0.1:${ACM_PORT}/plugin/plugin-manifest.json"
        fi

        if [ "$load_mce" = "true" ]; then
            echo "Port-forwarding MCE plugin (${MCE_NAMESPACE}/${MCE_SERVICE}) to localhost:${MCE_PORT}..." >&2
            start_port_forward "$MCE_NAMESPACE" "$MCE_SERVICE" "$MCE_PORT" 3000 "MCE plugin" \
                "https://127.0.0.1:${MCE_PORT}/plugin/plugin-manifest.json"
        fi

        if [ "$load_mce" = "true" ]; then
            BRIDGE_PLUGINS="${BRIDGE_PLUGINS},mce=https://${host}:${MCE_PORT}/plugin/"
        fi
        if [ "$load_acm" = "true" ]; then
            BRIDGE_PLUGINS="${BRIDGE_PLUGINS},acm=https://${host}:${ACM_PORT}/plugin/"
        fi

        if [ "$load_acm" = "true" ] || [ "$load_mce" = "true" ]; then
            append_i18n_namespace "plugin__acm"
            append_i18n_namespace "plugin__mce"
        fi
    else
        echo "LOAD_ACM_PLUGINS=false — skipping ACM/MCE (Fleet Management links will not work)" >&2
    fi

    if [ "$LOAD_OLS_PLUGINS" = "true" ]; then
        if oc get consoleplugin "$OLS_PLUGIN_NAME" >/dev/null 2>&1; then
            load_ols=true
        else
            echo "Warning: ConsolePlugin '${OLS_PLUGIN_NAME}' not found — Lightspeed chat UI unavailable" >&2
        fi

        if oc get consoleplugin "$OLS_AGENTIC_PLUGIN_NAME" >/dev/null 2>&1; then
            load_ols_agentic=true
        else
            echo "Warning: ConsolePlugin '${OLS_AGENTIC_PLUGIN_NAME}' not found — skipping agentic Lightspeed plugin" >&2
        fi

        if [ "$load_ols" = "true" ]; then
            echo "Port-forwarding OLS console plugin (${OLS_NAMESPACE}/${OLS_PLUGIN_SERVICE}) to localhost:${OLS_PLUGIN_PORT}..." >&2
            start_port_forward "$OLS_NAMESPACE" "$OLS_PLUGIN_SERVICE" "$OLS_PLUGIN_PORT" 9443 "OLS console plugin" \
                "https://127.0.0.1:${OLS_PLUGIN_PORT}/plugin-manifest.json"

            echo "Port-forwarding OLS app server (${OLS_NAMESPACE}/${OLS_API_SERVICE}) to localhost:${OLS_API_PORT}..." >&2
            # App server may return non-2xx before fully ready; TLS accept is enough to wire the proxy.
            start_port_forward "$OLS_NAMESPACE" "$OLS_API_SERVICE" "$OLS_API_PORT" 8443 "OLS app server" \
                "https://127.0.0.1:${OLS_API_PORT}/" false

            BRIDGE_PLUGINS="${BRIDGE_PLUGINS},${OLS_PLUGIN_NAME}=https://${host}:${OLS_PLUGIN_PORT}/"
            append_i18n_namespace "plugin__${OLS_PLUGIN_NAME}"
        fi

        if [ "$load_ols_agentic" = "true" ]; then
            echo "Port-forwarding OLS agentic plugin (${OLS_NAMESPACE}/${OLS_AGENTIC_SERVICE}) to localhost:${OLS_AGENTIC_PORT}..." >&2
            start_port_forward "$OLS_NAMESPACE" "$OLS_AGENTIC_SERVICE" "$OLS_AGENTIC_PORT" 9443 "OLS agentic plugin" \
                "https://127.0.0.1:${OLS_AGENTIC_PORT}/plugin-manifest.json"

            BRIDGE_PLUGINS="${BRIDGE_PLUGINS},${OLS_AGENTIC_PLUGIN_NAME}=https://${host}:${OLS_AGENTIC_PORT}/"
            append_i18n_namespace "plugin__${OLS_AGENTIC_PLUGIN_NAME}"
        fi
    else
        echo "LOAD_OLS_PLUGINS=false — skipping OpenShift Lightspeed (chat UI will not appear)" >&2
    fi

    if [ -n "${KIALI_URL:-}" ] || [ "$load_acm" = "true" ] || [ "$load_mce" = "true" ] || [ "$load_ols" = "true" ]; then
        BRIDGE_PLUGIN_PROXY=$(build_plugin_proxy_json "$host" "$load_acm" "$load_mce" "$load_ols" "${KIALI_URL:-}")
    fi
}

echo "Starting local OpenShift console..."

BRIDGE_USER_AUTH="disabled"
BRIDGE_K8S_MODE="off-cluster"
BRIDGE_K8S_AUTH="bearer-token"
BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true
BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT=$(oc whoami --show-server)
BRIDGE_K8S_AUTH_BEARER_TOKEN=$(oc whoami --show-token 2>/dev/null)
BRIDGE_USER_SETTINGS_LOCATION="localstorage"
# Start with the plugin namespace; setup_plugins may extend this for ACM/MCE/OLS
BRIDGE_I18N_NAMESPACES="plugin__${PLUGIN_NAME}"

PLUGIN_HOST="host.docker.internal"
CONSOLE_NETWORK_ARGS=(-p "${CONSOLE_PORT}:9000")

if [ -x "$(command -v podman)" ]; then
    if [ "$(uname -s)" = "Linux" ]; then
        PLUGIN_HOST="localhost"
        CONSOLE_NETWORK_ARGS=(--network=host)
    else
        PLUGIN_HOST="host.containers.internal"
    fi
else
    PLUGIN_HOST="host.docker.internal"
fi

# Must not use command substitution — it runs in a subshell and would drop port-forward PIDs.
setup_plugins "$PLUGIN_HOST"

echo "API Server:        $BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT"
echo "Console image:     $CONSOLE_IMAGE"
echo "Console URL:       http://localhost:${CONSOLE_PORT}"
echo "Plugin dev server: http://localhost:${PLUGIN_DEV_PORT}"
echo "BRIDGE_PLUGINS:    ${BRIDGE_PLUGINS}"
if [ -n "${BRIDGE_PLUGIN_PROXY:-}" ]; then
    echo "BRIDGE_PLUGIN_PROXY: ${BRIDGE_PLUGIN_PROXY}"
fi
if [ -n "$KIALI_URL" ]; then
    echo "Kiali URL: $KIALI_URL (proxied via /api/proxy/plugin/ossmconsole/kiali/)"
else
    echo "Kiali URL: not set — OSSMC/Service Mesh perspective will not load data"
fi

run_console() {
    local engine=$1
    local -a plugin_env=(--env "BRIDGE_PLUGINS=${BRIDGE_PLUGINS}")

    if [ -n "${BRIDGE_PLUGIN_PROXY:-}" ]; then
        plugin_env+=(--env "BRIDGE_PLUGIN_PROXY=${BRIDGE_PLUGIN_PROXY}")
    fi

    "$engine" run --pull always --platform "$CONSOLE_IMAGE_PLATFORM" --rm \
        "${CONSOLE_NETWORK_ARGS[@]}" \
        --env-file <(for var in "${!BRIDGE_@}"; do echo "$var=${!var}"; done) \
        "${plugin_env[@]}" \
        "$CONSOLE_IMAGE"
}

console_exit=0
if [ -x "$(command -v podman)" ]; then
    run_console podman || console_exit=$?
else
    run_console docker || console_exit=$?
fi

# podman exits 2 on Ctrl+C; treat interrupt as a normal shutdown after cleanup.
if [ "$console_exit" -eq 130 ] || [ "$console_exit" -eq 143 ] || [ "$console_exit" -eq 2 ]; then
    exit 0
fi

exit "$console_exit"
