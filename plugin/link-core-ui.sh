#!/bin/bash

set -u

errormsg() {
  echo -e "\U0001F6A8 ERROR: ${1}"
}

infomsg() {
  echo -e "\U0001F4C4 ${1}"
}

# Determine where this script is and make it the cwd

OSSMC_PLUGIN_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
echo ${OSSMC_PLUGIN_PATH}
DEFAULT_ENABLE_LINK="true"

cd ${OSSMC_PLUGIN_PATH}

LIBRARY_PATH="${OSSMC_PLUGIN_PATH}/../../core-ui"
OSSMC_PLUGIN_REACT="${OSSMC_PLUGIN_PATH}/node_modules/react"
OSSMC_PLUGIN_REACT_DOM="${OSSMC_PLUGIN_PATH}/node_modules/react-dom"


while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -el|--enable-link)       ENABLE_LINK="$2";                shift;shift ;;
    -h|--help )
      cat <<HELPMSG
$0 [option...]
Valid options:
  -el|--enable-link
      The option to perform the setup of core library.
      If you set this to disable the script will remove all the links.
      If you want the script to set up the core library for you, normally keep the default value.
      Default: ${DEFAULT_ENABLE_LINK}
HELPMSG
      exit 1
      ;;
    *)
      errormsg "Unknown argument [$key]. Aborting."
      exit 1
      ;;
  esac
done

ENABLE_LINK="${ENABLE_LINK:-${DEFAULT_ENABLE_LINK}}"


if [ "${ENABLE_LINK}" == "true" ]; then
    infomsg "Installing kiali-ui libraries"
    cd ${OSSMC_PLUGIN_PATH}
    yarn install

    # yarn link is ignored if the link of same library already exists previous in another place. 
    # For this reason the link is undone previously (https://github.com/yarnpkg/yarn/issues/7216)
    infomsg "Creating link for react (${OSSMC_PLUGIN_REACT})"
    cd ${OSSMC_PLUGIN_REACT}
    (yarn unlink || true) && yarn link

    infomsg "Creating link for react-dom (${OSSMC_PLUGIN_REACT_DOM})"
    cd ${OSSMC_PLUGIN_REACT_DOM}
    (yarn unlink || true) && yarn link

    infomsg "Creating link for Kiali Core package (${LIBRARY_PATH})"
    cd ${LIBRARY_PATH}
    (yarn unlink || true) && yarn link

    infomsg "Installing deps in library"
    yarn install


    infomsg "Linking react library..."
    yarn link react

    infomsg "Linking react-dom library..."
    yarn link react-dom

    infomsg "Linking package to kiali-ui"
    cd ${OSSMC_PLUGIN_PATH}
    yarn link @kiali/core-ui
else
    infomsg "Unlink in kiali-ui the core library"
    cd ${OSSMC_PLUGIN_PATH}
    yarn unlink @kiali/core-ui

    infomsg "Reinstalling kiali-ui"
    yarn install

    infomsg "Unlink in package react"
    cd ${LIBRARY_PATH}
    yarn unlink react
    infomsg "Unlink in package react-dom"
    yarn unlink react-dom

    infomsg "Reinstalling library deps"
    yarn install
fi

cd ${OSSMC_PLUGIN_PATH}