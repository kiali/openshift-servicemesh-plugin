# OpenShift Service Mesh Console Install Guide

OpenShift Service Mesh Console consists of these components:

- An OpenShift Console plugin
- An OLM Operator to install the plugin
- Kiali Server

Although Kiali is considered a component of the OpenShift Service Mesh Console, Kiali needs to be installed separately. See https://kiali.io for more details.

## Requirements

The OpenShift Service Mesh Console requires OpenShift v4.10+ with one of:

- Istio v1.14+ with Kiali v1.57+
- OpenShift Service Mesh (OSSM) v2.3+

Please refer to the relevant documentation for details on how to install those components.

## Installing the Operator

Before you can install the plugin itself, you first must install its operator via OLM. Once installed, the operator will help with the installation of the plugin.

:bulb: You can install the operator in one of two ways - either via the OpenShift Console or via the "oc" CLI. Both methods are described below. You choose the method you want to use.

### Installing Operator via OpenShift Console

The easiest way to install the operator is through the OpenShift Console UI. Log into the console as an Administrator (i.e. a user with kubeadmin privileges) and select `Operators > OperatorHub` from the left-hand menu. From there, find the _OpenShift Service Mesh Console_ operator in the list of available operators (look for the Kiali logo; it is published by the Kiali project team).

![Card](01-hub-card.png)

Click the "Install" button to begin the installation process.

![Details](02-hub-details.png)

Accept the defaults on the installation form and press "Install".

![Install](03-hub-install.png)

Once complete the operator will be installed within seconds.

![Successful Install](04-hub-successful-install.png)

### Installing Operator via "oc" CLI

If you want to install the operator via the CLI, you first need to use `oc` to log into the cluster as a user that has kubeadmin privileges. Once logged in, create a Subscription resource - this will install the operator:

```bash
cat <<EOM | oc apply -f -
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: ossmconsole
  namespace: openshift-operators
spec:
  installPlanApproval: Automatic
  name: ossmconsole
  source: community-operators
  sourceNamespace: openshift-marketplace
EOM
```

### Operator Installation Details

After the operator is installed, you can look at its details in the OpenShift Console UI. Within the OpenShift Console UI, select `Operators > Installed Operators` from the left-hand menu. From there, you will see that the list of installed operators should now include the _OpenShift Service Mesh Console_ operator.

![Installed Operator](05-ui-installed-ops.png)

Click the operator list entry to view the operator details page.

![Installed Operator Details](06-ui-installed-op-details.png)

## Installing the Plugin

With the operator installed and running you can install the OpenShift Service Mesh Console plugin.

:bulb: You can install the plugin in one of two ways - either via the OpenShift Console or via the "oc" CLI. Both methods are described below. You choose the method you want to use.

### Installing Plugin via OpenShift Console

From the operator details page, create an instance of the "OpenShift Service Mesh Console" resource. Accept the defaults on the installation form and press "Create".

![Install Plugin](07-ui-install-cr.png)

### Installing Plugin via "oc" CLI

To instruct the operator to install the plugin, simply create a small OSSMConsole custom resource (CR):

```bash
cat <<EOM | oc apply -f -
apiVersion: kiali.io/v1alpha1
kind: OSSMConsole
metadata:
  namespace: openshift-operators
  name: ossmconsole
EOM
```

Note that the operator will deploy the plugin resources in the same namespace where you create this OSSMConsole CR - in this case, `openshift-operators`.

### Plugin Installation Details

After the plugin is installed, you can see the "OSSMConsole" resource that was created in the OpenShift Console UI. Within the operator details page in the OpenShift Console UI, select the _OpenShift Service Mesh Console_ tab to view the resource that was created and its status.

![Installed Plugin](08-ui-installed-cr.png)

## Uninstalling

This section will describe how to uninstall the OpenShift Service Mesh Console plugin and its operator.

:bulb: You can uninstall the operator and plugin in one of two ways - either via the OpenShift Console or via the "oc" CLI. Both methods are described in the sections below. You choose the method you want to use.

:warning: Regardless of which mechanism you use to perform the uninstall, it is very important to first uninstall the plugin (i.e. uninstall the OSSMConsole CR first) and then uninstall the operator. If you uninstall the operator before ensuring the OSSMConsole CR is deleted then you may have difficulty removing that CR and its namespace. If this occurs then you must manually remove the finalizer on the CR in order to delete it and its namespace. You can do this via: `oc patch ossmconsoles <CR name> -n <CR namespace> -p '{"metadata":{"finalizers": []}}' --type=merge `

### Uninstalling the Plugin

You first must uninstall the plugin. Make sure this is complete before uninstalling the operator.

#### Uninstalling Plugin via OpenShift Console

Remove the OSSMConsole CR by navigating to the operator details page in the OpenShift Console UI. From the operator details page, select the _OpenShift Service Mesh Console_ tab and then select the Delete option in the kebab menu.

![Uninstall Plugin](09-ui-uninstall-cr.png)

#### Uninstalling Plugin via "oc" CLI

Remove the OSSMConsole CR via `oc delete ossmconsoles <CR name> -n <CR namespace>`. To make sure any and all CRs are deleted from any and all namespaces, you can run this command:

```sh
for r in $(oc get ossmconsoles --ignore-not-found=true --all-namespaces -o custom-columns=NS:.metadata.namespace,N:.metadata.name --no-headers | sed 's/  */:/g'); do oc delete ossmconsoles -n $(echo $r|cut -d: -f1) $(echo $r|cut -d: -f2); done
```

### Uninstalling the Operator

:warning: Make sure you have already uninstalled the plugin before uninstalling the operator.

#### Uninstalling Operator via OpenShift Console

Remove the operator by navigating to the operator details page in the OpenShift Console UI. From the operator details page, select the "Uninstall Operator" option from the _Actions_ menu.

![Uninstall Operator](10-ui-uninstall-op.png)

#### Uninstalling Operator via "oc" CLI

Uninstalling the operator entails deleting the Subscription and all CSVs that OLM created.

```sh
oc delete subscription ossmconsole -n openshift-operators
for csv in $(oc get csv --all-namespaces --no-headers -o custom-columns=NS:.metadata.namespace,N:.metadata.name | sed 's/  */:/g' | grep ossmconsole) ;\
do \
  oc delete --ignore-not-found=true csv -n $(echo -n ${csv} | cut -d: -f1) $(echo -n ${csv} | cut -d: -f2) ;\
done
```

### Uninstalling the CRD

Regardless of how you uninstalled the plugin and the operator, OLM will not remove the CRD. If you want to completely remove all remnants of the OpenShift Service Mesh Console plugin and its operator, you will want to also delete the CRD.

```sh
oc delete crd ossmconsoles.kiali.io
```
