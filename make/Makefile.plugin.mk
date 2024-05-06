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
build-plugin-image:
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
	@if [ "$$(${OC} get consoles.operator.openshift.io cluster -o json | jq '.spec.plugins')" == "null" ]; then ${OC} patch consoles.operator.openshift.io cluster --type=json -p '[{"op":"add","path":"/spec/plugins","value":[]}]'; fi
	@if [ "$$(${OC} get consoles.operator.openshift.io cluster -o json | jq '.spec.plugins | index("ossmconsole")')" == "null" ]; then \
	  ${OC} patch consoles.operator.openshift.io cluster --type=json -p '[{"op":"add","path":"/spec/plugins/-","value":"ossmconsole"}]'; \
	else \
	  echo OSSMC plugin is already enabled; \
	fi

## disable-plugin: Disables the plugin within the OpenShift Console.
disable-plugin: .ensure-oc-login
	index="$$(${OC} get consoles.operator.openshift.io cluster -o json | jq '.spec.plugins | index("ossmconsole")')" && \
	  [ "$${index}" != "null" ] && ${OC} patch consoles.operator.openshift.io cluster --type=json -p '[{"op":"remove","path":"/spec/plugins/'$${index}'"}]' || true

## restart-plugin: Restarts the plugin.
restart-plugin: .ensure-oc-login
	@${OC} rollout restart deployments/ossmconsole -n "$$(${OC} get deployments -l app.kubernetes.io/name=ossmconsole --all-namespaces -o jsonpath='{.items[0].metadata.namespace}')"

ifeq ($(KIALI_URL),)
.determine-kiali-url:
	@echo "Set KIALI_URL to a valid URL or to 'route' if you want to auto-discover the Kiali OpenShift route" && exit 1
else ifeq ($(KIALI_URL),route)
.determine-kiali-url: .ensure-oc-login
	@echo "Auto discovering the KIALI_URL"
	@$(eval KIALI_URL_TO_USE = https://$(shell ${OC} get routes.route.openshift.io -l app.kubernetes.io/name=kiali --all-namespaces -o jsonpath='{.items[0].spec.host}'))
else
.determine-kiali-url:
	@$(eval KIALI_URL_TO_USE = $${KIALI_URL})
endif

## prepare-git: Prepares the local dev environment so you can git commit
prepare-git:
	cd ${PLUGIN_DIR} && yarn add pretty-quick

## prepare-dev-env: Prepares the local dev environment so you can run the plugin and OpenShift console locally.
prepare-dev-env: .determine-kiali-url
	@cd ${PLUGIN_DIR} && yarn install
	@cp ${PLUGIN_DIR}/plugin-config.json ${PLUGIN_DIR}/dist
	@sed -i -r 's|^API_PROXY=(.*)|API_PROXY=${KIALI_URL_TO_USE}|' ${PLUGIN_DIR}/.env.development
	@echo
	@echo "Using KIALI_URL=${KIALI_URL_TO_USE}"
	@echo
	@echo "To run the plugin and the OpenShift Console in your local dev environment, do the following:"
	@echo "1. cd ${PLUGIN_DIR}"
	@echo "2. Start the plugin: yarn run start"
	@echo "3. In a second command line window, start the OpenShift Console: yarn run start-console"

# Ensure "docker buildx" is available and enabled. For more details, see: https://github.com/docker/buildx/blob/master/README.md
# This does a few things:
#  1. Makes sure docker is in PATH
#  2. Downloads and installs buildx if no version of buildx is installed yet
#  3. Makes sure any installed buildx is a required version or newer
#  4. Makes sure the user has enabled buildx (either by default or by setting DOCKER_CLI_EXPERIMENTAL env var to 'enabled')
#  Thus, this target will only ever succeed if a required (or newer) version of 'docker buildx' is available and enabled.
.ensure-docker-buildx:
	@if ! which docker > /dev/null 2>&1; then echo "'docker' is not in your PATH."; exit 1; fi
	@required_buildx_version="0.4.2"; \
	if ! DOCKER_CLI_EXPERIMENTAL="enabled" docker buildx version > /dev/null 2>&1 ; then \
	  buildx_download_url="https://github.com/docker/buildx/releases/download/v$${required_buildx_version}/buildx-v$${required_buildx_version}.$$(go env GOOS)-$$(go env GOARCH)"; \
	  echo "You do not have 'docker buildx' installed. Will now download from [$${buildx_download_url}] and install it to [${HOME}/.docker/cli-plugins]."; \
	  mkdir -p ${HOME}/.docker/cli-plugins; \
	  curl -L --output ${HOME}/.docker/cli-plugins/docker-buildx "$${buildx_download_url}"; \
	  chmod a+x ${HOME}/.docker/cli-plugins/docker-buildx; \
	  installed_version="$$(DOCKER_CLI_EXPERIMENTAL="enabled" docker buildx version || echo "unknown")"; \
	  if docker buildx version > /dev/null 2>&1; then \
	    echo "'docker buildx' has been installed and is enabled [version=$${installed_version}]"; \
	  else \
	    echo "An attempt to install 'docker buildx' has been made but it either failed or is not enabled by default. [version=$${installed_version}]"; \
	    echo "Set DOCKER_CLI_EXPERIMENTAL=enabled to enable it."; \
	    exit 1; \
	  fi \
	fi; \
	current_buildx_version="$$(DOCKER_CLI_EXPERIMENTAL=enabled docker buildx version 2>/dev/null | sed -E 's/.*v([0-9]+\.[0-9]+\.[0-9]+).*/\1/g')"; \
	is_valid_buildx_version="$$(if [ "$$(printf $${required_buildx_version}\\n$${current_buildx_version} | sort -V | head -n1)" == "$${required_buildx_version}" ]; then echo "true"; else echo "false"; fi)"; \
	if [ "$${is_valid_buildx_version}" == "true" ]; then \
	  echo "A valid version of 'docker buildx' is available: $${current_buildx_version}"; \
	else \
	  echo "You have an older version of 'docker buildx' that is not compatible. Please upgrade to at least v$${required_buildx_version}"; \
	  exit 1; \
	fi; \
	if docker buildx version > /dev/null 2>&1; then \
	  echo "'docker buildx' is enabled"; \
	else \
	  echo "'docker buildx' is not enabled. Set DOCKER_CLI_EXPERIMENTAL=enabled if you want to use it."; \
	  exit 1; \
	fi

# Ensure a local builder for multi-arch build. For more details, see: https://github.com/docker/buildx/blob/master/README.md#building-multi-platform-images
.ensure-buildx-builder: .ensure-docker-buildx
	@if ! docker buildx inspect ossmconsole-builder > /dev/null 2>&1; then \
	  echo "The buildx builder instance named 'ossmconsole-builder' does not exist. Creating one now."; \
	  if ! docker buildx create --name=ossmconsole-builder --driver-opt=image=moby/buildkit:v0.12.5 --config ./make/buildkitd.toml --use; then \
	    echo "Failed to create the buildx builder 'ossmconsole-builder'"; \
	    exit 1; \
	  fi \
	fi; \
	if [[ $$(uname -s) == "Linux" ]]; then \
	  echo "Ensuring QEMU is set up for this Linux host"; \
	  if ! docker run --privileged --rm quay.io/kiali/binfmt:latest --install all; then \
	    echo "Failed to ensure QEMU is set up. This build will be allowed to continue, but it may fail at a later step."; \
	  fi \
	fi

## build-push-plugin-multi-arch: Pushes the OSSM Console plugin multi-arch image to quay.io.
build-push-plugin-multi-arch: .ensure-buildx-builder
	@echo Pushing OSSM Console plugin multi-arch image to ${PLUGIN_QUAY_TAG} using docker buildx
	docker buildx build --build-arg VERSION_PLUGIN="${VERSION}" --build-arg COMMIT_HASH="${COMMIT_HASH}" --push --pull --no-cache --builder=ossmconsole-builder $(foreach arch,${TARGET_ARCHS},--platform=linux/${arch}) $(foreach tag,${PLUGIN_QUAY_TAG},--tag=${tag}) -f ${PLUGIN_DIR}/Dockerfile ${PLUGIN_DIR}
