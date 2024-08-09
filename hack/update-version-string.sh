
#!/bin/bash

# This updates the version string in the various files that contain version strings.
# This is used by the release GitHub workflow.

set -eu

NEXT_VERSION="${1:-}"

# The next version string must be passed in as the only argument and must be prefixed with "v"
[ -z "${NEXT_VERSION}" ] && (echo "Missing version string argument"; exit 1)
[[ ${NEXT_VERSION} != v* ]] && (echo "The version string must start with 'v' [${NEXT_VERSION}]"; exit 1)

# If NEXT_VERSION is a snapshot version, strip "-SNAPSHOT" and use that as the UI version.
if [[ "${NEXT_VERSION}" == *-SNAPSHOT ]]; then
  UI_NEXT_VERSION="${NEXT_VERSION%-SNAPSHOT}"
else
  UI_NEXT_VERSION="${NEXT_VERSION}"
fi

# Change to the directory to the root dir (which is the parent directory of this script)
SCRIPT_ROOT="$( cd "$(dirname "$0")" ; pwd -P )"
cd ${SCRIPT_ROOT}/..

# Change the backend version
sed -i -r "s/^VERSION \?= (.*)/VERSION \?= ${NEXT_VERSION}/" Makefile

# Change the UI version
jq -r ".version |= \"${UI_NEXT_VERSION:1}\" | .consolePlugin.version |= \"${UI_NEXT_VERSION:1}\"" plugin/package.json > plugin/package.json.tmp
mv plugin/package.json.tmp plugin/package.json