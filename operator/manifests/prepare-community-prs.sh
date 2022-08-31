#!/bin/bash

################################################
# This script prepares a new branch in the
# community operator git repo. You can create a
# PR based on the branch this script creates.
#
# You must have forked the following repo:
# * https://github.com/redhat-openshift-ecosystem/community-operators-prod
#
# This script uses legacy terminology.
# Where you see "community", that means the Red Hat (community-operators-prod) metadata.
################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

DEFAULT_GIT_REPO_REDHAT=${SCRIPT_DIR}/../../../../community-operators/community-operators-prod
GIT_REPO_REDHAT=${DEFAULT_GIT_REPO_REDHAT}

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -gr|--gitrepo-redhat)      GIT_REPO_REDHAT="$2"      ; shift;shift ;;
    -h|--help)
      cat <<HELPMSG
$0 [option...]

Valid options:
  -gr|--gitrepo-redhat <directory>
      The directory where the local community-operators-prod git repo is located.
      This is the location where you git cloned the repo https://github.com/redhat-openshift-ecosystem/community-operators-prod
      Default: ${DEFAULT_GIT_REPO_REDHAT}
      which resolves to:
      $(readlink -f ${DEFAULT_GIT_REPO_REDHAT} || echo '<git repo does not exist at the default location>')
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

if [ ! -d "${GIT_REPO_REDHAT}" ]; then
  echo "You must specify a valid community-operators-prod git repo: ${GIT_REPO_REDHAT}"
  exit 1
fi

COMMUNITY_MANIFEST_DIR="${SCRIPT_DIR}/ossmconsole-community"

if [ ! -d "${COMMUNITY_MANIFEST_DIR}" ]; then
  echo "Did not find the community manifest directory: ${COMMUNITY_MANIFEST_DIR}"
  exit 1
fi

# Determine branch names to use for the new data.

DATETIME_NOW="$(date --utc +'%F-%H-%M-%S')"
GIT_REPO_COMMUNITY_BRANCH_NAME="ossmconsole-community-${DATETIME_NOW}"

cd ${GIT_REPO_REDHAT}
git fetch origin --verbose
git checkout -b ${GIT_REPO_COMMUNITY_BRANCH_NAME} origin/main
cp -R ${COMMUNITY_MANIFEST_DIR}/* ${GIT_REPO_REDHAT}/operators/ossmconsole
git add -A
git commit --signoff -m '[ossmconsole] update ossmconsole'

# Completed!
echo "New metadata has been added to a new branch in the community git repo."
echo "Create a PR based on this branch:"
echo "1. cd ${GIT_REPO_REDHAT} && git push <your git remote name> ${GIT_REPO_COMMUNITY_BRANCH_NAME}"
