#!/bin/bash
##############################################################################
# wait-for-namespace.sh
#
##############################################################################
set -e

if [ $# -eq 0 ]
  then
    >&2 echo "No arguments supplied"
    exit 1
fi

# process command line args
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      shift;
      NAMESPACES=( "$@" )
      break;
      ;;
    -h|--help)
      cat <<HELPMSG
Valid command line arguments:
  -n|--namespaces <name>: all of the namespaces we want to patch operator and wait for
  -h|--help : this message
HELPMSG
      exit 1
      ;;
    *)
      echo "Unknown argument [$key]. Aborting."
      exit 1
      ;;
  esac
done

IS_MAISTRA=$([ "$(oc get crd | grep servicemesh | wc -l)" -gt "0" ] && echo "true" || echo "false")

if [ "${IS_MAISTRA}" == "false" ]; then
  KIALI_CR_NAMESPACE_NAME="$(oc get kiali --all-namespaces -o custom-columns=NS:.metadata.namespace,N:.metadata.name --no-headers | sed 's/  */:/g')"
  KIALI_CR_NAMESPACE="$(echo ${KIALI_CR_NAMESPACE_NAME} | cut -d: -f1)"
  KIALI_CR_NAME="$(echo ${KIALI_CR_NAMESPACE_NAME} | cut -d: -f2)"
  ACCESSIBLE_NAMESPACES="$(oc get kiali $KIALI_CR_NAME -n $KIALI_CR_NAMESPACE -o jsonpath='{.spec.deployment.accessible_namespaces}')"

  # All namespaces are accessible, no need to add namespaces access to CRD
  if [ "${ACCESSIBLE_NAMESPACES}" != "**" ]; then
    # accessible_namespaces field is not defined in the CRD, initializing value to empty array
    if [ "${ACCESSIBLE_NAMESPACES}" == "" ]; then
      oc patch kiali $KIALI_CR_NAME -n $KIALI_CR_NAMESPACE --type=merge -p '{"spec": {"deployment": {"accessible_namespaces": []}}}'
    fi

    for NAMESPACE in ${NAMESPACES[@]}; do
      oc patch kiali $KIALI_CR_NAME -n $KIALI_CR_NAMESPACE --type=json '-p=[{"op": "add", "path": "/spec/deployment/accessible_namespaces/-", "value":"'$NAMESPACE'"}]'
    done

    echo -n "Waiting for operator to finish reconciling the CR named [$KIALI_CR_NAME] located in namespace [$KIALI_CR_NAMESPACE]"
    while [ "$KIALI_CR_REASON" != "Successful" -o "$KIALI_CR_STATUS" != "True" ]; do
      sleep 1
      echo -n "."
      KIALI_CR_REASON="$(oc get kiali $KIALI_CR_NAME -n $KIALI_CR_NAMESPACE -o jsonpath='{.status.conditions[?(@.message=="Awaiting next reconciliation")].reason}')"
      KIALI_CR_STATUS="$(oc get kiali $KIALI_CR_NAME -n $KIALI_CR_NAMESPACE -o jsonpath='{.status.conditions[?(@.message=="Awaiting next reconciliation")].status}')"
    done
    echo
    echo "Done reconciling"
  fi
fi

for NAMESPACE in ${NAMESPACES[@]}; do
  oc wait --for=condition=Ready pods --all -n "$NAMESPACE" --timeout 60s || true
  oc wait --for=condition=Ready pods --all -n "$NAMESPACE" --timeout 60s
done

sleep 80
