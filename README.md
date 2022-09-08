# OpenShift Service Mesh Console (OSSM Console)

:information_source: There is a [User Guide](./docs/users-guide.md) and [Install Guide](./docs/install-guide.md) available.

The OSSM Console is a Webpack Plugin that integrates Kiali into the OpenShift Console. The official title of the project is "OpenShift Service Mesh Console" but you may see this abbreviated in documentation and code as "OSSM Console", "ossmconsole", or "OSSMC".

The main component is a plugin based on OpenShift Console [Dynamic plugin-ins](https://docs.openshift.com/container-platform/4.10/web_console/dynamic-plug-ins.html) framework. Installing and enabling the plugin will add OpenShift Service Mesh support into the OpenShift Console. The new "Service Mesh" menu item and tabs allow you to interact with your mesh via the Kiali user interface. Note that the OSSM Console may also work with upstream Istio installed (as opposed to OpenShift Service Mesh).

The main installation mechanism is an OLM operator.

## Platform Setup

These are the things you need before you can start working with the OpenShift Service Mesh Console:

1. OpenShift 4.10+ cluster with OpenShift ServiceMesh / Istio installed.
2. Kiali deployed in the cluster
3. `oc` client available in the path
4. `podman` client available in the path

## Quickly Deploy the OSSM Console

To very quickly get the latest OSSM Console plugin deployed in your cluster (e.g. without needing to build/push the operator and its catalog source and index image), run the following.

1. Log into your OpenShift cluster with `oc login`
2. Adjust the `kialiUrl` setting in the "plugin-conf" ConfigMap under `plugin/manifest.yaml` so it points to your Kiali public URL. Examples: `https://kiali-istio-system.apps-crc.testing` or if deploying Kiali locally `http://localhost:3000`
3. Run `make deploy-plugin enable-plugin` to deploy the `latest` plugin published on quay.io and then enable the plugin

You can undeploy/disable the plugin using `make undeploy-plugin`.

## How to Run the Plugin for Local Development

In one command line window, perform the following steps:

```sh
cd plugin
yarn install

# Copy the plugin-config.json file into the "dist" folder to emulate the ConfigMap in a local environment.
cp plugin-config.json dist

# If necessary, make sure you adjust the kialiUrl in the config file so it points to your Kiali public endpoint URL
# vi dist/plugin-config.json

yarn run start
```

At this point, the plugin will start and be accessible at http://localhost:9001

In a second command line window, perform the following steps:

```sh
cd plugin
yarn run start-console
```

At this point, the OpenShift Console will start and be accessible at http://localhost:9000

## Operator

The OpenShift Service Mesh Console will be installed by end users using an operator. The following describes the different make targets and files involved in developing, running, and testing the operator.

Developers will work with the operator mainly through the use of make targets. To see all the make targets available today, run `make help` - a description of all the available targets will be displayed. The more common ones you will want to use will be described in the next few sections.

### Building and Deploying the Operator

To build, deploy, and run the operator, use the make targets described below.

#### Quick Summary

Here's a tl;dr summary to get the operator and plugin installed in your cluster.

1. First run `make cluster-status` to expose the internal image registry and get the podman command needed to log into the internal image registry.
2. Run the podman login command that will log into the internal image registry.
3. Build, push, and deploy the operator and plugin by running `make cluster-push operator-create install-cr`

When you are finished and you want to uninstall the operator and plugin, run `make operator-delete`.


#### make cluster-status

This target prints out details about the OpenShift cluster you are currently logged into. In addition, it will also expose the internal image registry if it is not already exposed. This is required in order for the other make targets to be able to push and pull images to/from the internal image registry. Finally, the output of this make target will provide you the necessary podman command you must run in order to log into the internal image registry. In order for the other make targets to successfully push or pull images to/from the internal image registry you must log into the internal image registry by executing this podman login command.

#### make run-playbook

This target runs the [`ossmconsole-deploy`](operator/playbooks/ossmconsole-deploy.yml) and then the [`ossmconsole-remove`](operator/playbooks/ossmconsole-remove.yml) Ansible playbooks on the local machine (which in turn run the [deploy](operator/roles/default/ossmconsole-deploy) and [remove](operator/roles/default/ossmconsole-remove) roles; this is where the main action happens). This allows you to develop/test/debug the playbooks without having to package or deploy the operator. This is the fastest way to work with the playbooks, however, it requires that you have Ansible installed on your local machine. For more instructions on setting up your local Ansible install, consult the [operator/requirements.yml file](operator/requirements.yml)

You can configure the behavior of this target by changing the files under the [operator/dev-playbook-config](operator/dev-playbook-config/README.adoc) directory.

You do not have to use this make target if you do not want to (e.g. you do not have Ansible installed locally). You are free to ignore this make target and instead just use the other make targets to deploy the operator into your cluster and run the operator within the cluster.

#### make run-operator

Similar to the `run-playbook` target, this target also runs the operator on your local box. However, this runs within the context of the ansible-operator (i.e. the ansible operator SDK base image). In other words, this runs in a way that much more resembles how the operator will run inside the cluster. This target creates a CR first, and then it starts the operator in foreground. The operator will immediately reconcile the CR and then sit and wait for changes made to the CR, which will trigger another reconciliation. Thereafter, you can edit the CR and see how the operator behaves. You can also delete the CR and see how the operator performs a removal.

As with the `run-playbook` target, you do not have to use this make target if you do not want to (e.g. you do not have Ansible installed locally). You are free to ignore this make target and instead just use the other make targets to deploy the operator into your cluster and run the operator within the cluster.

#### make cluster-push-operator

This target will build the operator image and push it into the cluster's internal image registry. You must perform this step prior to creating the operator in the cluster because the image must be available for the operator Pod.

#### make operator-create

This target performs alot of tasks under the covers but in the end will result in the operator deployed and running in your cluster. This target will perform tasks such as building the OLM catalog source and the OLM image index, deploying those images to your cluster, and creating an OLM subscription for your new operator, thus starting the operator.

#### make cluster-push-plugin-image

This target will build the plugin image and push it into the cluster's internal image registry. You must perform this step prior to installing an OSSMConsole CR because this image must be available for the plugin Pod.

#### make cluster-push

This is simply a convenience target that runs both the `cluster-push-operator` and the `cluster-push-plugin-image` targets.

#### make install-cr

Once your operator is deployed and running, and you have built and pushed the plugin image to your cluster, you can use this target to create an OSSMConsole CR which instructs the operator to install the OpenShift Service Mesh Console plugin. Within a few seconds after this make target completes, your OpenShift Console will have the OpenShift Service Mesh Console plugin installed. This provides you with Kiali features directly within the OpenShift Console itself.

#### make uninstall-cr

If you wish to uninstall the plugin from your OpenShift Console, run this target. This will delete the OSSMConsole CR that was created via the `install-cr` target, which instructs the operator to uninstall the plugin. The operator will continue to be running. You can re-install the plugin by simply creating another OSSMConsole CR by running `make install-cr` again.

#### make purge-all-crs

If you get into a state where one or more CRs cannot be deleted (e.g. the `oc delete` command hangs), use this target to clear the finalizers on the CRs and delete them. This will usually correct the problem.

#### make operator-delete

This make target completely removes the plugin and operator. It will first remove the OSSMConsole CR which instructs the operator to uninstall the plugin. It will then remove the operator along with its CRD, OLM subscription, OLM catalog source, OLM image index, and all underlying OLM CSVs. After this make target completes, all remnants of the plugin and operator will be removed. The only thing that will remain in the cluster are the images that were pushed into the internal image registry.

### OLM manifests

The operator's OLM manifest metadata is located in the [operator/manifests](operator/manifests) directory. This metadata contains the CSV which describes the operator, its Deployment and the roles/permissions it needs.

#### The template manifest

The [template manifest](operator/manifests/template) is used by the make targets when building the OLM bundle and OLM image index. This template is also used by the [create-new-version.sh](operator/manifests/create-new-version.sh) when creating a new community version of the operator. Run that script with the `--help` option for more details.

#### make validate-olm-metadata

After you modify or add metadata to the manifests, run this make target to validate the changes. The validation tool can catch some errors that can be quickly corrected.

### Generating Documentation

You can generate reference documentation for the OSSMConsole CRD by running `make gen-crd-doc`. The generated markdown document will be found in `operator/_output/crd-docs/` and can be used for publishing on a Hugo-generated doc site such as https://kiali.io.

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

## Releasing OpenShift Service Mesh Console

To build and release the plugin, you can run this command either manually or inside a CI workflow.

```sh
make -e CONTAINER_VERSION=v0.1.0 build-plugin-image push-plugin-image
```

Or for a multi-arch container:

```sh
make -e CONTAINER_VERSION=v0.1.0 build-push-plugin-multi-arch
```

If you want to release a "latest" image, set `CONTAINER_VERSION` to "latest".

Once complete, the image will be pushed to quay.io in this repository: https://quay.io/repository/kiali/ossmconsole?tab=tags

## Releasing OpenShift Service Mesh Console Operator

The operator needs its image published to quay and its OLM metadata published to the community catalog.

### Publishing Image

Build and push the image to quay:

```sh
make -e CONTAINER_VERSION=v0.1.0 build-operator push-operator
```

Or for a multi-arch container:

```sh
make -e CONTAINER_VERSION=v0.1.0 build-operator build-push-operator-multi-arch
```

Once complete, the image will be pushed to quay.io in this repository: https://quay.io/repository/kiali/ossmconsole-operator?tab=tags

### Publishing OLM Metadata

First create a new bundle version using the  `create-new-version.sh` script. You need to tell the script what channels the new version of the operator will be available on. The operator must be available in at least one of these two channels - `candidate` (for alpha or tech-preview versions) and `stable`. If you want the new version to be available in both channels, use `--channels "stable,candidate"`.

```sh
create-new-version.sh --new-version 0.0.2 --channels candidate
```

The new metadata files will be created in the appropriate location. You should git commit them to the repo now once you confirm they look OK.

Next you need to publish the new OLM metadata by running `prepare-community-prs.sh` and follow the instructions (specifically, you need to create and merge a PR to the upstream https://github.com/redhat-openshift-ecosystem/community-operators-prod git repo).

```sh
prepare-community-prs.sh
```
