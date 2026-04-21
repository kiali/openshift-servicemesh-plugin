#!/usr/bin/env bash

set -euo pipefail

make --directory .. .ensure-oc-login
OPENSHIFT_VERSION=$(oc version | grep "Server Version: " | awk '{print $3}' | cut -d. -f-2)
CONSOLE_IMAGE=${CONSOLE_IMAGE:="quay.io/openshift/origin-console:$OPENSHIFT_VERSION"}
CONSOLE_PORT=${CONSOLE_PORT:=9000}
CONSOLE_IMAGE_PLATFORM=${CONSOLE_IMAGE_PLATFORM:="linux/amd64"}
KIALI_URL=${KIALI_URL:="http://localhost:20001"}
PLUGIN_NAME="${npm_package_name:-ossmconsole}"
CONSOLE_API_PATH="/api/proxy/plugin/${PLUGIN_NAME}/kiali/"

# Build BRIDGE_PLUGIN_PROXY JSON for the given Kiali endpoint.
# Uses jq for safe JSON escaping when available; falls back to string interpolation.
build_proxy_json() {
    local endpoint="$1"
    if command -v jq &>/dev/null; then
        jq -cn --arg path "$CONSOLE_API_PATH" --arg ep "$endpoint" \
            '{"services":[{"consoleAPIPath":$path,"endpoint":$ep,"authorize":false}]}'
    else
        printf '{"services":[{"consoleAPIPath":"%s","endpoint":"%s","authorize":false}]}' \
            "$CONSOLE_API_PATH" "$endpoint"
    fi
}

# Rewrite localhost and loopback addresses so they resolve inside the container.
rewrite_url_for_container() {
    echo "$1" | sed 's|localhost|'"$2"'|g; s|127\.0\.0\.1|'"$2"'|g'
}

echo "Starting local OpenShift console..."

BRIDGE_USER_AUTH="disabled"
BRIDGE_K8S_MODE="off-cluster"
BRIDGE_K8S_AUTH="bearer-token"
BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true
BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT=$(oc whoami --show-server)
# Using CRC for development, so Thanos and AlertManager may require a lot of resources, disable them by default
# BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS=$(oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath='{.data.thanosPublicURL}')
# BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER=$(oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath='{.data.alertmanagerPublicURL}')
BRIDGE_K8S_AUTH_BEARER_TOKEN=$(oc whoami --show-token 2>/dev/null)
BRIDGE_USER_SETTINGS_LOCATION="localstorage"
BRIDGE_I18N_NAMESPACES="plugin__${PLUGIN_NAME}"

BRIDGE_PLUGINS="${PLUGIN_NAME}=http://host.docker.internal:9001"

echo "API Server: $BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT"
echo "Console Image: $CONSOLE_IMAGE"
echo "Console URL: http://localhost:${CONSOLE_PORT}"
echo "Console Platform: $CONSOLE_IMAGE_PLATFORM"
echo "Kiali URL: $KIALI_URL"


# Prefer podman if installed. Otherwise, fall back to docker.
if [ -x "$(command -v podman)" ]; then
    if [ "$(uname -s)" = "Linux" ]; then
        # Use host networking on Linux since host.containers.internal is unreachable in some environments.
        BRIDGE_PLUGINS="${PLUGIN_NAME}=http://localhost:9001"
        BRIDGE_PLUGIN_PROXY=$(build_proxy_json "$KIALI_URL")
        podman run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm --network=host --env-file <(for var in "${!BRIDGE_@}"; do echo "$var=${!var}"; done) $CONSOLE_IMAGE
    else
        BRIDGE_PLUGINS="${PLUGIN_NAME}=http://host.containers.internal:9001"
        KIALI_CONTAINER_URL=$(rewrite_url_for_container "$KIALI_URL" "host.containers.internal")
        BRIDGE_PLUGIN_PROXY=$(build_proxy_json "$KIALI_CONTAINER_URL")
        podman run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm -p "$CONSOLE_PORT":9000 --env-file <(for var in "${!BRIDGE_@}"; do echo "$var=${!var}"; done) $CONSOLE_IMAGE
    fi
else
    BRIDGE_PLUGINS="${PLUGIN_NAME}=http://host.docker.internal:9001"
    KIALI_CONTAINER_URL=$(rewrite_url_for_container "$KIALI_URL" "host.docker.internal")
    BRIDGE_PLUGIN_PROXY=$(build_proxy_json "$KIALI_CONTAINER_URL")
    docker run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm -p "$CONSOLE_PORT":9000 --env-file <(for var in "${!BRIDGE_@}"; do echo "$var=${!var}"; done) $CONSOLE_IMAGE
fi