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
	cd ${PLUGIN_DIR} && yarn install --network-timeout 7200000 && yarn build

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
undeploy-plugin: .ensure-oc-login disable-plugin
	cd ${PLUGIN_DIR} && ${OC} delete --ignore-not-found=true -f manifest.yaml

## enable-plugin: Enables the plugin within the OpenShift Console.
enable-plugin: .ensure-oc-login
	${OC} patch consoles.operator.openshift.io cluster --type=json -p '[{"op":"add","path":"/spec/plugins/-","value":"ossmconsole"}]'

## disable-plugin: Disables the plugin within the OpenShift Console.
disable-plugin: .ensure-oc-login
	index="$$(${OC} get consoles.operator.openshift.io cluster -o json | jq '.spec.plugins | index("ossmconsole")')" && \
	  [ "$${index}" != "null" ] && ${OC} patch consoles.operator.openshift.io cluster --type=json -p '[{"op":"remove","path":"/spec/plugins/'$${index}'"}]' || true

## restart-plugin: Restarts the plugin.
restart-plugin: .ensure-oc-login
	@${OC} rollout restart deployments/ossmconsole -n "$$(${OC} get deployments -l app.kubernetes.io/name=ossmconsole --all-namespaces -o jsonpath='{.items[0].metadata.namespace}')"

## build-push-plugin-multi-arch: Pushes the OSSM Console plugin multi-arch image to quay.io.
build-push-plugin-multi-arch: .ensure-buildx-builder
	@echo Pushing OSSM Console plugin multi-arch image to ${PLUGIN_QUAY_TAG} using docker buildx
	docker buildx build --push --pull --no-cache --builder=ossmconsole-builder $(foreach arch,${TARGET_ARCHS},--platform=linux/${arch}) $(foreach tag,${PLUGIN_QUAY_TAG},--tag=${tag}) -f ${PLUGIN_DIR}/Dockerfile ${PLUGIN_DIR}
