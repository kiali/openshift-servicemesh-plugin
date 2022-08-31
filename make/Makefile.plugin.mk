#
# Targets for building the plugin itself.
#

# Identifies the plugin container image that will be built
PLUGIN_IMAGE_ORG ?= kiali
PLUGIN_IMAGE_NAME ?= ossmconsole
PLUGIN_CONTAINER_NAME ?= ${PLUGIN_IMAGE_ORG}/${PLUGIN_IMAGE_NAME}
PLUGIN_CONTAINER_VERSION ?= ${CONTAINER_VERSION}
PLUGIN_QUAY_NAME ?= quay.io/${PLUGIN_CONTAINER_NAME}
PLUGIN_QUAY_TAG ?= ${PLUGIN_QUAY_NAME}:${PLUGIN_CONTAINER_VERSION}

# The namespace where the plugin will be deployed
PLUGIN_NAMESPACE ?= ossmconsole

## clean-plugin: Delete generated code.
clean-plugin:
	@rm -rf ${PLUGIN_DIR}/node_modules
	@rm -rf ${PLUGIN_DIR}/dist

## build-plugin: Builds the plugin.
build-plugin:
	cd ${PLUGIN_DIR} && yarn install && yarn build

## build-plugin-image: Builds the plugin and its container image.
build-plugin-image: build-plugin
	${DORP} build --build-arg VERSION_PLUGIN="${VERSION}" --build-arg COMMIT_HASH="${COMMIT_HASH}" -t ${PLUGIN_QUAY_TAG} ${PLUGIN_DIR}

## push-plugin-image: Pushes the plugin container image to quay.io.
push-plugin-image:
	${DORP} push ${PLUGIN_QUAY_TAG}

#
# The targets below are for quickly deploying the plugin.
# They will manage the plugin in "ossmconsole" namespace and will not utilize any other make targets or the operator.
#

## deploy-plugin: Deploys the plugin quickly. This uses the quay.io "latest" image. This does not utilize the operator.
deploy-plugin: .ensure-oc-login
	cd ${PLUGIN_DIR} && ${OC} apply -f manifest.yaml

## undeploy-plugin: Removes the plugin quickly. This does not utilize the operator.
undeploy-plugin: .ensure-oc-login
	cd ${PLUGIN_DIR} && ${OC} delete -f manifest.yaml

## enable-plugin: Enables the plugin within the OpenShift Console.
enable-plugin: .ensure-oc-login
	${OC} patch consoles.operator.openshift.io cluster --patch '{ "spec": { "plugins": ["ossmconsole"] } }' --type=merge

## restart-plugin: Restarts the plugin.
restart-plugin: .ensure-oc-login
	@${OC} rollout restart deployments/ossmconsole -n "$$(${OC} get deployments -l app.kubernetes.io/name=ossmconsole --all-namespaces -o jsonpath='{.items[0].metadata.namespace}')"
