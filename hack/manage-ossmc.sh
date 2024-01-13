#!/bin/bash

################################################
# This sripts helps manage the OSSM Console 
# plugin on OCP platforms.
################################################

# verify minimal supported vesrion of OCP? 

# exit immediately on error
set -eu

uninstall() {
for r in $(oc get ossmconsoles --ignore-not-found=true --all-namespaces -o custom-columns=NS:.metadata.namespace,N:.metadata.name --no-headers | sed 's/  */:/g'); do oc delete ossmconsoles -n "$(echo "$r"|cut -d: -f1)" "$(echo "$r"|cut -d: -f2)"; done
}

install() {
    cat <<EOM | oc apply -f -
apiVersion: kiali.io/v1alpha1
kind: OSSMConsole
metadata:
  namespace: openshift-operators
  name: ossmconsole
EOM
}

enable-ossm() {
    echo "Not implemented yet."
}

wait-ossmc() {
    while ! oc get deployment -n openshift-operators -l app.kubernetes.io/name=ossmconsole 2>/dev/null | grep -q ossmconsole ; do echo -n '.'; sleep 1; done \
    && oc rollout status deployment -l app.kubernetes.io/name=ossmconsole -n ossmconsole
}


helpmsg() {
  cat <<HELP
This script manages the OSSM Console plugin on OCP platforms.
Options:
-u|--uninstall 
    Uninstall the Kiali operator and server.
-i|--install
    Install the Kiali operator and server.
-e|--enable-ossm 
    Enable the OSSM Console plugin.
-w|--wait-ossmc
    Wait for the OSSMC given pod to be ready. 
HELP

}

if [[ $# -gt 1 ]]; then
    echo "Too many arguments. Aborting.";
    exit 255
fi

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -u|--uninstall)             uninstall;                      exit $?; ;;
    -i|--install)               install;                        exit $?; ;;
    -h|--help)                  helpmsg;                        exit $?; ;;
    -e|--enable-ossm)           enable-ossm;                    exit $?; ;;
    -w|--wait-ossmc)            wait-ossmc;                     exit $?; ;;
    *) echo "Unknown argument: [$key]. Aborting."; helpmsg;     exit 255 ;;
  esac
done
