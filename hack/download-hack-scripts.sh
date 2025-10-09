#!/bin/bash

#############################################################
# This sripts donwloads hack scripts from Kiali repository
#############################################################

# exit immediately on error
set -eu

# process command line args
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -kb|--kiali-branch)    KIALI_BRANCH="$2"        ;shift;shift ;;
    -h|--help)
      cat <<HELPMSG
$0 [option...]

Valid options:
  -kb|--kiali-branch <branch or tag name>
      A git reference (branch or tag name) found in the kiali source repo. This is the
      branch or tag that will be checked out for hack script
HELPMSG
      exit 1
      ;;
    *)
      echo "Unknown argument [$key].  Aborting."
      exit 1
      ;;
  esac
done

# Where this script is located.
# It is assumed this directory is inside the same plugin dest repo where the files are to be copied.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

# Relative directory inside the local OSSM repo where the istio hack files will be copied.
DEST_DIR="_output/kiali"

# This is to be the top-level directory of the local OSSM git repo.
# This is where DEST_DIR should be located.
DEST_REPO="${SCRIPT_DIR}/.."

# The absolute destination directory
ABS_DEST_DIR="${DEST_REPO}/${DEST_DIR}"

# Delete existing kiali folder before download hack scripts
rm -rf ${ABS_DEST_DIR}/{*,.[!.]*}

# Set KIALI_BRANCH to v1.73, OSSMC release branch or the set value via parameter
if [ -z "${KIALI_BRANCH:-}" ]; then
    echo "KIALI_BRANCH was not set, checking if it is an OSSMC release branch"
    KIALI_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    case "${KIALI_BRANCH}" in
    v*.*)
        echo "OSSMC release branch ${KIALI_BRANCH}";;
    *)
        echo "This branch is not an OSSMC release branch (v*.*)! Using v1.73"
        KIALI_BRANCH="v1.73";;
    esac
else
    echo "KIALI_BRANCH was set via parameter to: ${KIALI_BRANCH}"
fi

# Clone kiali repo into kiali folder (no-checkout option to avoid download whole repository)
echo "Downloading hack scripts from Kiali branch ${KIALI_BRANCH}"
git clone --filter=tree:0 --no-checkout --depth 1 --sparse --single-branch --branch ${KIALI_BRANCH} https://github.com/kiali/kiali.git ${ABS_DEST_DIR}

cd ${ABS_DEST_DIR}

# Only download hack/istio folder
git sparse-checkout set --no-cone hack/istio

git checkout