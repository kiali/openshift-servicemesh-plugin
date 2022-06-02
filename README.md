# OpenShift Service Mesh Plugin
Webpack Plugin to integrate Kiali into OpenShift Console

## Platform Setup

These are the things you need before you can start working with the OpenShift Service Mesh Plugin:

1. OpenShift 4.10+ cluster with OpenShift ServiceMesh / Istio installed. 
2. Kiali deployed in the cluster
3. `oc` client available in the path
4. `podman` client available in the path

## Quickly Deploy the Service Mesh Plugin

To very quickly get the plugin deployed in your cluster (e.g. without needing to build/push the operator and its catalog source and index image), run the following.

```sh
# Step 1 - Login in OpenShift cluster i.e oc login ...

# Step 2- Adjust the kialiUrl in the "plugin-conf" ConfigMap under plugin/manifest.yaml pointing to the Kiali public URL
# i.e. https://kiali-istio-system.apps-crc.testing 

# Step 3 - deploy the plugin then enable via the make targets:
make deploy-plugin enable-plugin 
```

## How to Run the Plugin for Local Development

In one command line window, perform the following steps:

```sh
cd plugin
yarn install

# Copy a plugin-config.json file into the "dist" folder to emulate the ConfigMap in a local environment
# (make sure you adjust the kialiUrl in the config file so it points to your Kiali public endpoint URL)
cp plugin-config.json dist

yarn run start

# Plugin will start at http://localhost:9001
```

In a second command line window, perform the following steps:

```sh
cd plugin
yarn run start-console

# OpenShift Console will start at http://localhost:9000
```

## Operator

The OpenShift Service Mesh Plugin will be installed by end users using an operator. The following describes the different make targets and files involved in developing, running, and testing the operator.

Developers will work with the operator mainly through the use of make targets. To see all the make targets available today, run `make help` - a description of all the available targets will be displayed. The more common ones you will want to use will be described in the next few sections.

### Building and Deploying the Operator

To build, deploy, and run the operator, use the make targets described below. 

#### Quick Summary

Here's a tl;dr summary to get the operator and plugin installed in your cluster.

1. First run `make cluster-status` to expose the internal image registry and get the podman command needed to log into the internal image registry.
2. Run the podman login command that will log into the internal image registry.
3. Build, push, and deploy the operator and plugin by running `make cluster-push-operator operator-create install-cr`

When you are finished and you want to uninstall the operator and plugin, run `make operator-delete`.


#### make cluster-status

This target prints out details about the OpenShift cluster you are currently logged into. In addition, it will also expose the internal image registry if it is not already exposed. This is required in order for the other make targets to be able to push and pull images to/from the internal image registry. Finally, the output of this make target will provide you the necessary podman command you must run in order to log into the internal image registry. In order for the other make targets to successfully push or pull images to/from the internal image registry you must log into the internal image registry by executing this podman login command.

#### make run-playbook

This target runs the [`ossmplugin-deploy`](operator/playbooks/ossmplugin-deploy.yml) and then the [`ossmplugin-remove`](operator/playbooks/ossmplugin-remove.yml) Ansible playbooks on the local machine (which in turn run the [deploy](operator/roles/default/ossmplugin-deploy) and [remove](operator/roles/default/ossmplugin-remove) roles; this is where the main action happens). This allows you to develop/test/debug the playbooks without having to package or deploy the operator. This is the fastest way to work with the playbooks, however, it requires that you have Ansible installed on your local machine. For more instructions on setting up your local Ansible install, consult the [operator/requirements.yml file](operator/requirements.yml)

You can configure the behavior of this target by changing the files under the [operator/dev-playbook-config](operator/dev-playbook-config/README.adoc) directory.

You do not have to use this make target if you do not want to (e.g. you do not have Ansible installed locally). You are free to ignore this make target and instead just use the other make targets to deploy the operator into your cluster and run the operator within the cluster.

#### make cluster-push-operator

This target will build the operator image and push it into the cluster's internal image registry. You must perform this step prior to creating the operator in the cluster because the image must be available for the operator Pod.

#### make operator-create

This target performs alot of tasks under the covers but in the end will result in the operator deployed and running in your cluster. This target will perform tasks such as building the OLM catalog source and the OLM image index, deploying those images to your cluster, and creating an OLM subscription for your new operator, thus starting the operator.

#### make install-cr

Once your operator is deployed and running, use this target to create a OSSMPlugin CR which instructs the operator to install the OpenShift Service Mesh  Plugin. Within a few seconds after this make target completes, your OpenShift Console will have the OpenShift Service Mesh Plugin installed. This provides you with Kiali functionality directly within the OpenShift Console itself.

#### make uninstall-cr

If you wish to uninstall the plugin from your OpenShift Console, run this target. This will delete the OSSMPlugin CR that was created via the `install-cr` target, which instructs the operator to uninstall the plugin. The operator will continue to be running. You can re-install the plugin by simply creating another OSSMPlugin CR by running `make install-cr` again.

#### make purge-all-crs

If you get into a state where one or more CRs cannot be deleted (e.g. the `oc delete` command hangs), use this target to clear the finalizers on the CRs and delete them. This will usually correct the problem.

#### make operator-delete

This make target completely removes the plugin and operator. It will first remove the OSSMPlugin CR which instructs the operator to uninstall the plugin. It will then remove the operator along with its CRD, OLM subscription, OLM catalog source, OLM image index, and all underlying OLM CSVs. After this make target completes, all remnants of the plugin and operator will be removed. The only thing that will remain in the cluster are the images that were pushed into the internal image registry.

### OLM manifests

The operator's OLM manifest metadata is located in the [operator/manifests](operator/manifests) directory. This metadata contains the CSV which describes the operator, its Deployment and the roles/permissions it needs.

#### The template manifest

The [template manifest](operator/manifests/template) is used by the make targets when building the OLM bundle and OLM image index. This template is also used by the [create-new-version.sh](operator/manifests/create-new-version.sh) when creating a new community version of the operator. Run that script with the `--help` option for more details.

#### make validate-olm-metadata

After you modify or add metadata to the manifests, run this make target to validate the changes. The validation tool can catch some errors that can be quickly corrected.

### Generating Documentation

You can generate reference documentation for the OSSMPlugin CRD by running `make gen-crd-doc`. The generated markdown document will be found in `operator/_output/crd-docs/` and can be used for publishing on a Hugo-generated doc site such as https://kiali.io.

## Molecule tests

You can run the molecule tests (called "scenarios") to confirm the basic functionality of the operator works. The [default scenario](https://github.com/kiali/openshift-servicemesh-plugin/tree/main/operator/molecule/default) can be run to simply confirm that the operator can deploy and undeploy the plugin. That default scenario provides the setup/teardown framework for the rest of the molecule tests. The other molecule tests that you can run have names ending with `-test` in the [molecule directory](https://github.com/kiali/openshift-servicemesh-plugin/tree/main/operator/molecule).

### Molecule test image

The molecule tests are run inside a container image that provide all the testing infrastructure needed to run the test scenarios. To build this container image, run `make molecule-build`. If you already built the image, that make target will be a no-op. If you need to re-build the image, set the `FORCE_MOLECULE_BUILD` env var to `true` (e.g. `make -e FORCE_MOLECULE_BUILD=true molecule-build`).

### Running a test

To run a molecule test, you first must install the operator via OLM. The molecule tests expect the operator to already be installed and running. You do this by running `make operator-create`.

```sh
make operator-create
```

Once the operator has been installed by OLM, you run a molecule test by setting the `MOLECULE_SCENARIO` env var to the name of the test you want to run and invoke the `molecule-test` make target. You can specify multiple tests to run by setting that env var to a space-separated list of test names.

```sh
make -e MOLECULE_SCENARIO="config-values-test" molecule-test
```

### Testing locally built images

By default, the molecule tests will test the "latest" plugin image published on quay.io. If you want to test the image you are developing and building locally, set the `MOLECULE_USE_DEV_IMAGES` env var to `true`:

```sh
make -e MOLECULE_SCENARIO="config-values-test" -e MOLECULE_USE_DEV_IMAGES="true" molecule-test
```

NOTE! This requires that you previously pushed your local image into your cluster via the make target `cluster-push-plugin-image`.

## Releasing OpenShift Service Mesh Plugin

To build and release the plugin, you can run this command either manually or inside a CI workflow.

```sh
make -e CONTAINER_VERSION=v0.0.1 build-plugin-image push-plugin-image
```

If you want to release a "latest" image, the command would be:

```sh
make -e CONTAINER_VERSION=latest build-plugin-image push-plugin-image
```

Once complete, the image will be pushed to quay.io in this repository: https://quay.io/repository/kiali/servicemesh-plugin?tab=tags
