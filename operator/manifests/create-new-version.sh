#!/bin/bash

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
VERIFY_BUNDLE="true"

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -nv|--new-version)              NEW_VERSION="$2"            ; shift;shift ;;
    -opin|--operator-image-name)    OPERATOR_IMAGE_NAME="$2"    ; shift;shift ;;
    -opiv|--operator-image-version) OPERATOR_IMAGE_VERSION="$2" ; shift;shift ;;
    -ov|--old-version)              OLD_VERSION="$2"            ; shift;shift ;;
    -vb|--verify-bundle)            VERIFY_BUNDLE="$2"          ; shift;shift ;;
    -h|--help)
      cat <<HELPMSG
$0 [option...]

Valid options:
  -nv|--new-version <version string>
      The new version that is going to be released. New manifest files for this version will be created.
  -opin|--operator-image-name <repo/org/name>
      The full image registry name of the operator without the version tag.
      Default: quay.io/kiali/ossmplugin-operator
  -opiv|--operator-image-version <version>
      The version tag that identifies the operator image that is used by the new manifest.
      Default: <the --new-version value> prefixed with "v"
  -ov|--old-version <version string>
      The old version that is going to be superceded with the new release. This must be the previous release
      prior to the new version. For example, if there is already versions 1.0 and 1.1 and the new version is
      2.0, the old version to be specified must be 1.1.
  -vb|--verify-bundle <true|false>
      Verify the validity of the bundle metadata via the operator-sdk tool. You must have operator-sdk
      installed and in your PATH or in _output for this to work (make get-operator-sdk).
      Default: true
HELPMSG
      exit 1
      ;;
    *)
      echo "Unknown argument [$key].  Aborting."
      exit 1
      ;;
  esac
done

# Validate some things before trying to do anything
TEMPLATE_MANIFEST_DIR="${SCRIPT_DIR}/template"
if [ ! -d "${TEMPLATE_MANIFEST_DIR:-!notvalid!}" ]; then
  echo "Something is wrong. The template directory is missing in ${SCRIPT_DIR}"
  exit 1
fi

if [ -z "${NEW_VERSION}" ]; then
  echo "You must specify a new version."
  exit 1
fi

if [ -z "${OLD_VERSION}" ]; then
  echo "You must specify an old version."
  exit 1
fi

if [ "${VERIFY_BUNDLE}" == "true" ]; then
  if which operator-sdk > /dev/null 2>&1 ; then
    OPERATOR_SDK="operator-sdk"
  elif [ -x "${SCRIPT_DIR}/../_output/operator-sdk-install/operator-sdk" ]; then
    OPERATOR_SDK="${SCRIPT_DIR}/../_output/operator-sdk-install/operator-sdk"
  fi

  if ! "${OPERATOR_SDK}" version &> /dev/null; then
    echo "You do not have operator-sdk in your PATH or in _output. Cannot verify the metadata."
    echo "To disable this check, use the '--verify-manifest=false' option."
    exit 1
  fi
fi

OLD_MANIFEST_DIR="${SCRIPT_DIR}/ossmplugin-community/${OLD_VERSION}"
NEW_MANIFEST_DIR="${SCRIPT_DIR}/ossmplugin-community/${NEW_VERSION}"

OPERATOR_IMAGE_NAME="${OPERATOR_IMAGE_NAME:-quay.io/kiali/ossmplugin-operator}"
OPERATOR_IMAGE_VERSION="${OPERATOR_IMAGE_VERSION:-v${NEW_VERSION}}"

if [ ! -d "${OLD_MANIFEST_DIR}" ]; then
  echo "Did not find the old version of the manifest: ${OLD_MANIFEST_DIR}"
  exit 1
fi
if [ -d "${NEW_MANIFEST_DIR}" ]; then
  echo "There is already a new version of the manifest: ${NEW_MANIFEST_DIR}"
  exit 1
fi

# Create a new version directory, starting it out as a copy of the template directory
mkdir -p "${NEW_MANIFEST_DIR}"
if ! cp -R "${TEMPLATE_MANIFEST_DIR}"/* "${NEW_MANIFEST_DIR}"; then
  echo "Failed to copy the template content in [${TEMPLATE_MANIFEST_DIR}] to the new manifest directory [${NEW_MANIFEST_DIR}]"
  exit 1
fi

# Generate the new content, overwriting the template

CSV_YAML="$(ls -1 ${NEW_MANIFEST_DIR}/manifests/*.clusterserviceversion.yaml)"
if [ -z ${CSV_YAML} ]; then
  echo "Cannot find the CSV yaml file"
  exit 1
fi
${SCRIPT_DIR}/generate-csv.sh -nv ${NEW_VERSION} -ov ${OLD_VERSION} -opin ${OPERATOR_IMAGE_NAME} -opiv ${OPERATOR_IMAGE_VERSION} > ${CSV_YAML}

# Verify the correctness using operator-sdk tool

if [ "${VERIFY_BUNDLE}" == "true" ]; then
  echo "Verifying the correctness of the bundle metadata via: ${OPERATOR_SDK} bundle validate ${NEW_MANIFEST_DIR}"
  if ! "${OPERATOR_SDK}" bundle validate "${NEW_MANIFEST_DIR}" ; then
    echo "Failed to verify the bundle metadata. Check the errors and correct them before publishing the bundle."
    exit 1
  fi
else
  echo "Skipping bundle verification"
fi

# Completed!

echo "New manifest bundle: ${NEW_MANIFEST_DIR}"
ls ${NEW_MANIFEST_DIR}
echo
