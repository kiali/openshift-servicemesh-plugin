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
	cd ${PLUGIN_DIR} && CYPRESS_INSTALL_BINARY=0 HUSKY=0 yarn install && yarn build

## build-plugin-image: Builds the plugin and its container image.
build-plugin-image:
	${DORP} build --build-arg VERSION_PLUGIN="${VERSION}" --build-arg COMMIT_HASH="${COMMIT_HASH}" -t ${PLUGIN_QUAY_TAG} ${PLUGIN_DIR}

# The OSSMC TLS profile helper (plugin/server) is tested with the same interpreter and OpenSSL
# as production: the base image of the Dockerfile's final stage, picked out of the Dockerfile
# so the tests always run on what we build on.
DOCKERFILE_FINAL_FROM = $(shell sed -n 's/^FROM[[:space:]][[:space:]]*\([^[:space:]]*\).*/\1/p' ${PLUGIN_DIR}/Dockerfile | tail -n 1)
OSSMC_TLS_PROFILE_TEST_IMAGE ?= ${DOCKERFILE_FINAL_FROM}
OSSMC_TLS_PROFILE_DIR = ${PLUGIN_DIR}/server
# ruff is a CI/dev-only linter; it is never installed into the image.
RUFF_VERSION ?= 0.16.9
RUFF ?= ruff

# Fails with a clear message if the Dockerfile's final stage stops building on a nginx
# base image, the runtime the helper's tests and recorded openssl fixtures assume.
.ensure-tls-test-image:
	@case "${DOCKERFILE_FINAL_FROM}" in \
	  *nginx*) ;; \
	  *) echo "Expected the final stage of ${PLUGIN_DIR}/Dockerfile to build on a nginx base image, found: \"${DOCKERFILE_FINAL_FROM}\""; exit 1 ;; \
	esac

## test-ossmc-tls-profile: Runs the TLS profile helper unit tests inside the Dockerfile's nginx base image (authoritative).
test-ossmc-tls-profile: .ensure-tls-test-image
	${DORP} run --rm --network none --user "$$(( (RANDOM % 50000) + 10000 )):0" --cap-drop=ALL \
	  -v ${OSSMC_TLS_PROFILE_DIR}:/src:ro,Z -w /tmp ${OSSMC_TLS_PROFILE_TEST_IMAGE} \
	  python3 -I -B -m unittest discover -s /src/tests -t /src

## test-ossmc-tls-profile-host: Runs the TLS profile helper unit tests with the host python3 (>= 3.9) for fast iteration.
test-ossmc-tls-profile-host:
	cd ${OSSMC_TLS_PROFILE_DIR} && python3 -I -B -m unittest discover -s tests -t .

## test-ossmc-tls-profile-container: Runs the TLS profile integration tests (plugin/server/integration) against the locally built plugin image in a podman pod with a fake OpenShift API - real TLS handshakes, profile changes, failure modes, old-template compatibility (requires podman, openssl, python3 >= 3.9).
test-ossmc-tls-profile-container: .ensure-tls-test-image
	cd ${OSSMC_TLS_PROFILE_DIR} && OSSMC_IMAGE="${PLUGIN_QUAY_TAG}" OSSMC_TLS_PROFILE_TEST_IMAGE="${OSSMC_TLS_PROFILE_TEST_IMAGE}" python3 -I -B -m unittest discover -v -s integration -t .

## record-ossmc-tls-probes: Re-records the openssl probe fixtures inside the Dockerfile's base image (needed when that base image changes).
record-ossmc-tls-probes: .ensure-tls-test-image
	cd ${OSSMC_TLS_PROFILE_DIR} && ${DORP} run --rm --network none -v "$$PWD":/w:Z ${OSSMC_TLS_PROFILE_TEST_IMAGE} \
	  python3 -I /w/hack/record-openssl-probes.py > tests/fixtures/openssl-probes.json

## lint-ossmc-tls-profile: Byte-compiles and lints the TLS profile helper (ruff ${RUFF_VERSION}: pip install ruff==${RUFF_VERSION}).
lint-ossmc-tls-profile:
	@# Byte-compile into a throwaway cache so no __pycache__ lands in the source tree.
	PYTHONPYCACHEPREFIX="$$(mktemp -d)" python3 -m compileall -q ${OSSMC_TLS_PROFILE_DIR} > /dev/null
	@if [ "$$(${RUFF} --version 2>/dev/null)" != "ruff ${RUFF_VERSION}" ]; then echo "ruff ${RUFF_VERSION} is required (found: $$(${RUFF} --version 2>/dev/null || echo none)); run: pip install ruff==${RUFF_VERSION}"; exit 1; fi
	cd ${OSSMC_TLS_PROFILE_DIR} && ${RUFF} check . && ${RUFF} format --check .

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

## prepare-git: Prepares the local dev environment so you can git commit
prepare-git:
	cd ${PLUGIN_DIR} && yarn add pretty-quick

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
	  if ! docker buildx create --name=ossmconsole-builder --driver-opt=image=moby/buildkit:v0.13.2 --config ./make/buildkitd.toml --use; then \
	    echo "Failed to create the buildx builder 'ossmconsole-builder'"; \
	    exit 1; \
	  fi \
	fi; \
	if [[ $$(uname -s) == "Linux" ]]; then \
	  echo "Ensuring QEMU is set up for this Linux host"; \
	  if ! docker run --privileged --rm tonistiigi/binfmt:latest --install all; then \
	    echo "Failed to ensure QEMU is set up. This build will be allowed to continue, but it may fail at a later step."; \
	  fi \
	fi

## build-push-plugin-multi-arch: Pushes the OSSM Console plugin multi-arch image to quay.io.
build-push-plugin-multi-arch: .ensure-buildx-builder
	@echo Pushing OSSM Console plugin multi-arch image to ${PLUGIN_QUAY_TAG} using docker buildx
	docker buildx build --build-arg VERSION_PLUGIN="${VERSION}" --build-arg COMMIT_HASH="${COMMIT_HASH}" --push --pull --no-cache --builder=ossmconsole-builder $(foreach arch,${TARGET_ARCHS},--platform=linux/${arch}) $(foreach tag,${PLUGIN_QUAY_TAG},--tag=${tag}) -f ${PLUGIN_DIR}/Dockerfile ${PLUGIN_DIR}
