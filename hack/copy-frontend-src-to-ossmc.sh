#!/bin/bash

################################################
# This script copies the Kiali frontend source
# to a local OSSMC plugin git repo.
################################################

# exit immediately on error
set -eu

# Where this script is located.
# It is assumed this directory is inside the same plugin dest repo where the files are to be copied.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

# This is where we will clone the source repo - it must exist but be empty.
TMP_DIR="/tmp/KIALI_OSSM.tmp"
if [ -d "${TMP_DIR}" ]; then
  rm -rf ${TMP_DIR}/{*,.[!.]*}
fi
mkdir -p "${TMP_DIR}"
SOURCE_REPO="${TMP_DIR}/kiali-source"

# SOURCE_DIR = Relative directory inside the local Kiali repo whose content will be copied.
# DEST_DIR = Relative directory inside the local OSSM repo where the new files will be copied.
SOURCE_DIR="frontend/src"
DEST_DIR="plugin/src/kiali"

# The URL of the remote git repo to clone
DEFAULT_SOURCE_REPO_URL="https://github.com/kiali/kiali.git"
SOURCE_REPO_URL="${DEFAULT_SOURCE_REPO_URL}"

# The git ref (branch or tag name) to checkout when cloning the source repo
DEFAULT_SOURCE_REF="master"
SOURCE_REF="${DEFAULT_SOURCE_REF}"

# This is to be the top-level directory of the local OSSM git repo.
# This is where DEST_DIR should be located.
DEFAULT_DEST_REPO="${SCRIPT_DIR}/.."
DEST_REPO=${DEFAULT_DEST_REPO}

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -dr|--dest-repo)     DEST_REPO="$2"         ;shift;shift ;;
    -sr|--source-ref)    SOURCE_REF="$2"        ;shift;shift ;;
    -su|--source-url)    SOURCE_REPO_URL="$2"   ;shift;shift ;;
    -h|--help)
      cat <<HELPMSG
$0 [option...]

Valid options:
  -dr|--dest-repo <directory>
      The top level directory of the destination git repo where the Kiali
      code will be copied. This is where you cloned the OSSMC git repository.
      The Kiali "${SOURCE_DIR}" content will be copied to this destination
      repo's "${DEST_DIR}" directory.
      Default: ${DEFAULT_DEST_REPO}

  -sr|--source-ref <branch or tag name>
      A git reference (branch or tag name) found in the remote source repo. This is the
      branch or tag that will be checked out when cloning the remote source repo.
      See also: --source-url
      Default: ${DEFAULT_SOURCE_REF}

  -su|--source-url <URL>
      The URL to the remote git repo where the Kiali code is located.
      This is what will be cloned. It contains the Kiali frontend source.
      This repo's content at "${SOURCE_DIR}" will be copied to the destination
      repo's "${DEST_DIR}" directory.
      See also: --source-ref
      Default: ${DEFAULT_SOURCE_REPO_URL}
HELPMSG
      exit 1
      ;;
    *)
      echo "Unknown argument [$key].  Aborting."
      exit 1
      ;;
  esac
done

# The absolute source and destination directories

ABS_SOURCE_DIR="${SOURCE_REPO}/${SOURCE_DIR}"
ABS_DEST_DIR="${DEST_REPO}/${DEST_DIR}"

# Validate the dest directories exist

if [ ! -d "${DEST_REPO}" ]; then
  echo "You must specify a valid destination git repo location: ${DEST_REPO}"
  exit 1
fi

if [ ! -d "${ABS_DEST_DIR}" ]; then
  echo "The destination directory is missing. Make sure it refers to a valid OSSMC git repo location: ${ABS_DEST_DIR}"
  exit 1
fi

# Clone the source repo and checkout the desired branch

echo "Cloning source repo [${SOURCE_REPO_URL}] (branch/tag [${SOURCE_REF}]) into [${SOURCE_REPO}]."
git clone --single-branch --branch ${SOURCE_REF} ${SOURCE_REPO_URL} ${SOURCE_REPO} &> /dev/null

# Sanity check - make sure what we cloned is expected and found on the actual Kiali github repo

if [ ! -d "${ABS_SOURCE_DIR}" ]; then
  echo "The source directory is missing. Make sure you cloned the correct repo and branch: ${ABS_SOURCE_DIR}"
  exit 1
fi

COMMIT_HASH="$(cd ${ABS_SOURCE_DIR} && git rev-parse HEAD)"
GITHUB_COMMIT_URL="https://github.com/kiali/kiali/tree/${COMMIT_HASH}/${SOURCE_DIR}"

if ! curl --silent --show-error --fail "${GITHUB_COMMIT_URL}" > /dev/null; then
  echo "The cloned git source does not appear to exist on GitHub."
  echo "${GITHUB_COMMIT_URL}"
  echo "Make sure you checked out a valid branch that tracks the actual Kiali repo."
  exit 1
fi

# Determine branch name to use for the new commit and prepare the commit message.

DATETIME_NOW="$(date --utc +'%F-%H-%M-%S')"
DEST_BRANCH="kiali-frontend-update-${DATETIME_NOW}"
COMMIT_MESSAGE=$(cat <<EOM
Copy of Kiali frontend source code
Kiali frontend source originated from:
* git ref:    ${SOURCE_REF}
* git commit: ${COMMIT_HASH}
* GitHub URL: ${GITHUB_COMMIT_URL}
EOM
)

cat <<EOM
=======
Copying:
  ${ABS_SOURCE_DIR}
to
  ${ABS_DEST_DIR}
=======
${COMMIT_MESSAGE}
EOM

# 1. Create a new branch in the dev repo so it can be used as
#    a PR without affecting any existing branches that already
#    exist in the dest repo. (Note that this new branch is
#    based off of the current branch that is checked out. The
#    user must ensure the branch currently checked out in the
#    dest repo is the desired one.)
# 2. Copy the files so the dest dir is a duplicate of the source dir.
# 3. Commit the files to the local repo with a descriptive commit message.

cd ${ABS_DEST_DIR}
git checkout -b ${DEST_BRANCH}
rm -rf ${ABS_DEST_DIR}/{*,.[!.]*}
cp -R ${ABS_SOURCE_DIR}/* ${ABS_DEST_DIR}
cat > ${ABS_DEST_DIR}/README.md <<EOM
**WARNING**: The code in this directory comes from the kiali/kiali repository and should never be modified here.

${COMMIT_MESSAGE}
EOM

git add ${ABS_DEST_DIR}
if git diff-index --quiet HEAD --; then
  echo "There are no changes that need to be committed."
else
  echo "Committing changes now."
  git commit --quiet --signoff -m "${COMMIT_MESSAGE}"

  # Completed!
  # Tell the user what needs to be done next.
  # This script does not automatically push the branch to the remote repo.
  # This script will only ever touch local files so as to avoid any possibility
  # of corrupting the remote repo.

  GIT_REMOTE="$(cd ${ABS_DEST_DIR} && for r in $(git remote 2>/dev/null); do if [ "$r" != "origin" ]; then echo ${r}; break; fi; done)"
  echo
  echo "=========="
  echo "Kiali frontend code has been copied to a new branch in the OSSMC git repo."
  echo "Create a PR based on that branch:"
  echo "cd ${ABS_DEST_DIR} && git push ${GIT_REMOTE:-<the git remote name>} ${DEST_BRANCH}"
fi