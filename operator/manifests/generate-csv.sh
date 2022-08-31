#!/bin/bash

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -ipp|--image-pull-policy)       IMAGE_PULL_POLICY="$2"      ; shift;shift ;;
    -nv|--new-version)              NEW_VERSION="$2"            ; shift;shift ;;
    -opin|--operator-image-name)    OPERATOR_IMAGE_NAME="$2"    ; shift;shift ;;
    -opiv|--operator-image-version) OPERATOR_IMAGE_VERSION="$2" ; shift;shift ;;
    -ov|--old-version)              OLD_VERSION="$2"            ; shift;shift ;;
    -h|--help)
      cat <<HELPMSG
$0 [option...]

Using the settings passed to this script, this will print to stdout a new CSV generated from the template CSV.

Valid options:
  -ipp|--image-pull-policy <policy>
      The operator container image pull policy. Set to "Always" if you are debugging.
      Default: IfNotPresent
  -nv|--new-version <version string>
      The new version of the CSV.
  -opin|--operator-image-name <repo/org/name>
      The full image registry name of the operator without the version tag.
      Default: quay.io/kiali/ossmconsole-operator
  -opiv|--operator-image-version <version>
      The version tag that identifies the operator image that is used by the new manifest.
      Default: <the --new-version value> prefixed with "v"
  -ov|--old-version <version string>
      The old version of the CSV that is going to be superceded with the new version.
      If there is no previous version, pass in "NONE". This is only useful when generating a
      CSV for an index that will have only a single bundle (e.g. for dev environments).
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

if [ -z "${NEW_VERSION:-}" ]; then
  echo "You must specify a new CSV version."
  exit 1
fi

if [ -z "${OLD_VERSION:-}" ]; then
  echo "You must specify an old CSV version."
  exit 1
fi

# strip off any "v" prefix - CSV versions do not have "v" in their version strings.
NEW_VERSION="$(echo -n ${NEW_VERSION} | sed 's/^v//')"
OLD_VERSION="$(echo -n ${OLD_VERSION} | sed 's/^v//')"

# determine what the operator image is
OPERATOR_IMAGE_VERSION="${OPERATOR_IMAGE_VERSION:-v${NEW_VERSION}}"
OPERATOR_IMAGE_NAME="${OPERATOR_IMAGE_NAME:-quay.io/kiali/ossmconsole-operator}"

CSV_YAML="$(ls -1 ${SCRIPT_DIR}/template/manifests/*.clusterserviceversion.yaml)"
if [ -z ${CSV_YAML} ]; then
  echo "Cannot find the template CSV yaml file"
  exit 1
fi

# Generate the new CSV content from the template
if [ "${OLD_VERSION}" == "NONE" ]; then
  CSV_REPLACES_COMMENT="#"
fi
export CSV_NEW_VERSION="${NEW_VERSION}"
export CSV_PREVIOUS_VERSION="${OLD_VERSION}"
export CSV_REPLACES_COMMENT
export IMAGE_PULL_POLICY="${IMAGE_PULL_POLICY:-IfNotPresent}"
export OPERATOR_IMAGE_NAME
export OPERATOR_IMAGE_VERSION
export CREATED_AT="$(date --utc +'%FT%TZ')"
cat ${CSV_YAML} | envsubst
