#!/bin/bash

################################################
# This sripts helps manage the OSSM Console 
# plugin on OCP platforms.
################################################

# exit immediately on error
set -eu

install() {
    cat <<EOM | oc apply -f -
apiVersion: kiali.io/v1alpha1
kind: OSSMConsole
metadata:
  namespace: openshift-operators
  name: ossmconsole
EOM
}

uninstall() {
for r in $(oc get ossmconsoles --ignore-not-found=true --all-namespaces -o custom-columns=NS:.metadata.namespace,N:.metadata.name --no-headers | sed 's/  */:/g');  
do oc delete ossmconsoles -n "$(echo "$r"|cut -d: -f1)" "$(echo "$r"|cut -d: -f2)"; done
}

validate-ossmc() {
    bash <(curl -sL https://raw.githubusercontent.com/kiali/kiali-operator/master/crd-docs/bin/validate-ossmconsole-cr.sh) \
      -crd https://raw.githubusercontent.com/kiali/kiali-operator/master/crd-docs/crd/kiali.io_ossmconsoles.yaml \
      --cr-name ossmconsole \
      -n openshift-operators 
}

wait-ossmc() {
    while ! oc get deployment -n openshift-operators -l app.kubernetes.io/name=ossmconsole 2>/dev/null | grep -q ossmconsole ; do echo -n '.'; sleep 1; done \
    && oc rollout status deployment -l app.kubernetes.io/name=ossmconsole -n openshift-operators
}

helpmsg() {
  cat <<HELP
This script manages the OSSM Console plugin on OCP platforms.
Options:
-h|--help
    Print this help message.
-i|--install
    Instruct the Kiali Operator to create a small OSSMConsole CR.
-u|--uninstall 
    Remove the OSSMConsole CR from all namespaces.
-v|--validate-ossmc 
    Check the OSSM Console plugin via Kiali script.
-w|--wait-ossmc
    Wait for the OSSMC plugin pod to be ready. 
HELP

}

if [[ $# -gt 1 ]]; then
    echo "Too many arguments. Aborting.";
    exit 255
fi

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -h|--help)                  helpmsg;                        exit $?; ;;
    -i|--install)               install;                        exit $?; ;;
    -u|--uninstall)             uninstall;                      exit $?; ;;
    -v|--validate-ossmc)         validate-ossmc;                     exit $?; ;;
    -w|--wait-ossmc)            wait-ossmc;                     exit $?; ;;
    *) echo "Unknown argument: [$key]. Aborting."; helpmsg;     exit 255 ;;
  esac
done
