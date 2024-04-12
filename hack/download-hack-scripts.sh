#!/bin/bash

#############################################################
# This sripts donwloads hack scripts from Kiali repository
#############################################################

# exit immediately on error
set -eu

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

# Get current OSSMC git branch to clone corresponding branch of Kiali (both applications should have the same version)
KIALI_BRANCH=$(git rev-parse --abbrev-ref HEAD)

case "${KIALI_BRANCH}" in
    v1.*)
        echo "OSSMC release branch ${KIALI_BRANCH}";;
    *)
        echo "This branch is not an OSSMC release branch (v1.*)"
        KIALI_BRANCH="v1.73";;
esac

# Clone kiali repo into kiali folder (no-checkout option to avoid download whole repository)
echo "Downloading hack scripts from Kiali branch ${KIALI_BRANCH}"
git clone --filter=tree:0 --no-checkout --depth 1 --sparse --single-branch --branch ${KIALI_BRANCH} https://github.com/kiali/kiali.git ${ABS_DEST_DIR}

cd ${ABS_DEST_DIR}

# Only download hack/istio folder
git sparse-checkout set --no-cone hack/istio

git checkout