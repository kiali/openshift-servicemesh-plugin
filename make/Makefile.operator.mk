#
# Targets for working with the OSSM Console Operator.
#

# Where operator generated or downloaded files will go
OPERATOR_OUTDIR=${OPERATOR_DIR}/_output

# Identifies the operator container image that will be built
OPERATOR_IMAGE_ORG ?= kiali
OPERATOR_IMAGE_NAME ?= ossmconsole-operator
OPERATOR_CONTAINER_NAME ?= ${OPERATOR_IMAGE_ORG}/${OPERATOR_IMAGE_NAME}
OPERATOR_CONTAINER_VERSION ?= ${CONTAINER_VERSION}
OPERATOR_QUAY_NAME ?= quay.io/${OPERATOR_CONTAINER_NAME}
OPERATOR_QUAY_TAG ?= ${OPERATOR_QUAY_NAME}:${OPERATOR_CONTAINER_VERSION}

# The version of the SDK this Makefile will download if needed, and the corresponding base image
OPERATOR_SDK_VERSION ?= 1.25.0
OPERATOR_BASE_IMAGE_VERSION ?= v${OPERATOR_SDK_VERSION}
OPERATOR_BASE_IMAGE_REPO ?= quay.io/operator-framework/ansible-operator
# These are what we really want - but origin-ansible-operator does not support multiarch today.
# When that is fixed, we want to use this image instead of the image above.
# See: https://issues.redhat.com/browse/DPTP-2946
#OPERATOR_BASE_IMAGE_VERSION ?= 4.12
#OPERATOR_BASE_IMAGE_REPO ?= quay.io/openshift/origin-ansible-operator

# The OLM Namespace where catalog sources, subscriptions, and operators are deployed
OPERATOR_NAMESPACE ?= openshift-operators

## clean-operator: Cleans the operator _output/ content.
clean-operator:
	@rm -rf "${OPERATOR_OUTDIR}"

.download-operator-sdk-if-needed:
	@if [ "$(shell which operator-sdk 2>/dev/null || echo -n "")" == "" ]; then \
	  mkdir -p "${OPERATOR_OUTDIR}/operator-sdk-install" ;\
	  if [ -x "${OPERATOR_OUTDIR}/operator-sdk-install/operator-sdk" ]; then \
	    echo "You do not have operator-sdk installed in your PATH. Will use the one found here: ${OPERATOR_OUTDIR}/operator-sdk-install/operator-sdk" ;\
	  else \
	    echo "You do not have operator-sdk installed in your PATH. The binary will be downloaded to ${OPERATOR_OUTDIR}/operator-sdk-install/operator-sdk" ;\
	    curl -L https://github.com/operator-framework/operator-sdk/releases/download/v${OPERATOR_SDK_VERSION}/operator-sdk_${OS}_${ARCH} > "${OPERATOR_OUTDIR}/operator-sdk-install/operator-sdk" ;\
	    chmod +x "${OPERATOR_OUTDIR}/operator-sdk-install/operator-sdk" ;\
	  fi ;\
	fi

.ensure-operator-sdk-exists: .download-operator-sdk-if-needed
	@$(eval OP_SDK ?= $(shell which operator-sdk 2>/dev/null || echo "${OPERATOR_OUTDIR}/operator-sdk-install/operator-sdk"))
	@"${OP_SDK}" version

## get-operator-sdk: Downloads the Operator SDK CLI if it is not already in PATH.
get-operator-sdk: .ensure-operator-sdk-exists
	@echo Operator SDK location: ${OP_SDK}

.download-ansible-operator-if-needed:
	@if [ "$(shell which ansible-operator 2>/dev/null || echo -n "")" == "" ]; then \
	  mkdir -p "${OPERATOR_OUTDIR}/ansible-operator-install" ;\
	  if [ -x "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-operator" ]; then \
	    echo "You do not have ansible-operator installed in your PATH. Will use the one found here: ${OPERATOR_OUTDIR}/ansible-operator-install/ansible-operator" ;\
	  else \
	    echo "You do not have ansible-operator installed in your PATH. The binary will be downloaded to ${OPERATOR_OUTDIR}/ansible-operator-install/ansible-operator" ;\
	    curl -L https://github.com/operator-framework/operator-sdk/releases/download/v${OPERATOR_SDK_VERSION}/ansible-operator_${OS}_${ARCH} > "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-operator" ;\
	    chmod +x "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-operator" ;\
	  fi ;\
	fi

.ensure-ansible-operator-exists: .download-ansible-operator-if-needed
	@$(eval ANSIBLE_OPERATOR_BIN ?= $(shell which ansible-operator 2>/dev/null || echo "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-operator"))
	@"${ANSIBLE_OPERATOR_BIN}" version

.download-ansible-runner-if-needed:
	@if [ "$(shell which ansible-runner 2>/dev/null || echo -n "")" == "" ]; then \
	  mkdir -p "${OPERATOR_OUTDIR}/ansible-operator-install" ;\
	  if [ -x "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-runner" ]; then \
	    echo "You do not have ansible-runner installed in your PATH.  Will use the one found here: ${OPERATOR_OUTDIR}/ansible-operator-install/ansible-runner" ;\
	  else \
	    echo "You do not have ansible-runner installed in your PATH. An attempt to install it will be made and a softlink to its binary placed at ${OPERATOR_OUTDIR}/ansible-operator-install/ansible-runner" ;\
	    echo "If the installation fails, you must install it manually. See: https://ansible-runner.readthedocs.io/en/latest/install/" ;\
	    python3 -m pip install ansible-runner ansible-runner-http openshift ;\
	    ln --force -s "${HOME}/.local/bin/ansible-runner" "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-runner" ;\
	  fi ;\
	fi

.ensure-ansible-runner-exists: .download-ansible-runner-if-needed
	@$(eval ANSIBLE_RUNNER_BIN ?= $(shell which ansible-runner 2>/dev/null || echo "${OPERATOR_OUTDIR}/ansible-operator-install/ansible-runner"))
	@"${ANSIBLE_RUNNER_BIN}" --version

.wait-for-crd:
	@echo -n "Waiting for the CRD to be established"
	@i=0 ;\
	until [ $${i} -eq 360 ] || ${OC} get crd ossmconsoles.kiali.io &> /dev/null; do \
	    echo -n '.' ; sleep 1 ; (( i++ )) ;\
	done ;\
	echo ;\
	[ $${i} -lt 360 ] || (echo "The CRD does not exist. You should install the operator." && exit 1)
	${OC} wait --for condition=established --timeout=60s crd ossmconsoles.kiali.io

## get-ansible-operator: Downloads the Ansible Operator binary if it is not already in PATH.
get-ansible-operator: .ensure-ansible-operator-exists .ensure-ansible-runner-exists
	@echo "Ansible Operator location: ${ANSIBLE_OPERATOR_BIN} (ansible-runner: ${ANSIBLE_RUNNER_BIN})"

.create-test-namespace: .ensure-oc-login
	${OC} get namespace ${PLUGIN_NAMESPACE} &> /dev/null || ${OC} create namespace ${PLUGIN_NAMESPACE}

.delete-test-namespace: .ensure-oc-login
	${OC} delete --ignore-not-found=true namespace ${PLUGIN_NAMESPACE}

## install-crd: Installs the OSSMConsole CRD into the cluster.
install-crd: .ensure-oc-login
	${OC} apply -f "${OPERATOR_DIR}/manifests/template/manifests/ossmconsole.crd.yaml"

## uninstall-crd: Removes the OSSMConsole CRD from the cluster along with all CRs that may exist.
uninstall-crd: purge-all-crs
	${OC} delete --ignore-not-found=true -f "${OPERATOR_DIR}/manifests/template/manifests/ossmconsole.crd.yaml"

## install-cr: Installs a test OSSMConsole CR into the cluster.
install-cr: .wait-for-crd .prepare-cluster .create-test-namespace .create-plugin-pull-secret
	cat "${OPERATOR_DIR}/deploy/ossmconsole-cr-dev.yaml" | DEPLOYMENT_IMAGE_NAME="${CLUSTER_PLUGIN_INTERNAL_NAME}" DEPLOYMENT_IMAGE_VERSION="${PLUGIN_CONTAINER_VERSION}" PULL_SECRET_NAME="${PLUGIN_IMAGE_PULL_SECRET_NAME}" envsubst | ${OC} apply -n ${PLUGIN_NAMESPACE} -f -

## uninstall-cr: Deletes the test OSSMConsole CR from the cluster and waits for the operator to finalize the deletion.
uninstall-cr: .remove-plugin-pull-secret
	(${OC} get crd ossmconsoles.kiali.io &> /dev/null && ${OC} delete --ignore-not-found=true -n ${PLUGIN_NAMESPACE} -f "${OPERATOR_DIR}/deploy/ossmconsole-cr-dev.yaml") || true

## purge-all-crs: Purges all OSSMConsole CRs from the cluster, forcing them to delete without the operator finalizing them.
purge-all-crs: .ensure-oc-login
	@for k in $(shell ${OC} get ossmconsole --ignore-not-found=true --all-namespaces -o custom-columns=NS:.metadata.namespace,N:.metadata.name --no-headers | sed 's/  */:/g') ;\
	  do \
	    cr_namespace="$$(echo $${k} | cut -d: -f1)" ;\
	    cr_name="$$(echo $${k} | cut -d: -f2)" ;\
	    echo "Deleting OSSMConsole CR [$${cr_name}] in namespace [$${cr_namespace}]" ;\
	    ${OC} patch  ossmconsole $${cr_name} -n $${cr_namespace} -p '{"metadata":{"finalizers": []}}' --type=merge ;\
	    ${OC} delete ossmconsole $${cr_name} -n $${cr_namespace} ;\
	  done

## run-operator: Runs the OSSM Console Operator via the ansible-operator.
run-operator: install-crd install-cr get-ansible-operator
	cd ${OPERATOR_DIR} && \
	ANSIBLE_ROLES_PATH="${OPERATOR_DIR}/roles" \
	ALLOW_AD_HOC_OSSMCONSOLE_IMAGE="true" \
	ANSIBLE_VERBOSITY_OSSMCONSOLE_KIALI_IO="1" \
	ANSIBLE_DEBUG_LOGS="True" \
	ANSIBLE_CALLBACK_WHITELIST="profile_tasks" \
	ANSIBLE_CALLBACKS_ENABLED="profile_tasks" \
	PROFILE_TASKS_TASK_OUTPUT_LIMIT="100" \
	POD_NAMESPACE="does-not-exist" \
	WATCH_NAMESPACE="" \
	PATH="${PATH}:${OPERATOR_OUTDIR}/ansible-operator-install" \
	ansible-operator run --zap-log-level=debug --leader-election-id=ossmconsole-operator

## run-playbook: Run the operator ansible playbooks directly. You must have Ansible installed for this to work.
run-playbook: install-crd .wait-for-crd
	@$(eval ANSIBLE_PYTHON_INTERPRETER ?= $(shell if (which python &> /dev/null && python --version 2>&1 | grep -q " 2\.*"); then echo "-e ansible_python_interpreter=python3"; else echo ""; fi))
	@if [ ! -z "${ANSIBLE_PYTHON_INTERPRETER}" ]; then echo "ANSIBLE_PYTHON_INTERPRETER is [${ANSIBLE_PYTHON_INTERPRETER}]. Make sure that refers to a Python3 installation. If you do not have Python3 in that location, you must ensure you have Python3 and ANSIBLE_PYTHON_INTERPRETER is set to '-e ansible_python_interpreter=<full path to your python3 executable>"; fi
	@echo "Create a dummy OSSMConsole CR"; ${OC} apply -f ${OPERATOR_DIR}/dev-playbook-config/dev-ossmconsole-cr.yaml
	ansible-galaxy collection install operator_sdk.util kubernetes.core
	ALLOW_AD_HOC_OSSMCONSOLE_IMAGE=true POD_NAMESPACE="does-not-exist" ANSIBLE_ROLES_PATH=${OPERATOR_DIR}/roles ansible-playbook -vvv ${ANSIBLE_PYTHON_INTERPRETER} -i ${OPERATOR_DIR}/dev-playbook-config/dev-hosts.yaml ${OPERATOR_DIR}/dev-playbook-config/dev-playbook.yaml
	@echo "Remove the dummy OSSMConsole CR"; ${OC} delete -f ${OPERATOR_DIR}/dev-playbook-config/dev-ossmconsole-cr.yaml

## build-operator: Build operator container image.
build-operator:
	${DORP} build --pull -t ${OPERATOR_QUAY_TAG} --build-arg OPERATOR_BASE_IMAGE_REPO=${OPERATOR_BASE_IMAGE_REPO} --build-arg OPERATOR_BASE_IMAGE_VERSION=${OPERATOR_BASE_IMAGE_VERSION} -f ${OPERATOR_DIR}/build/Dockerfile ${OPERATOR_DIR}

## push-operator: Pushes the operator image to quay.
push-operator:
	${DORP} push ${OPERATOR_QUAY_TAG}

## operator-create: Creates an operator in the remote cluster via OLM
operator-create: deploy-catalog-source deploy-subscription

## operator-delete: Deletes the operator from the remote cluster via OLM
operator-delete: uninstall-cr undeploy-subscription undeploy-catalog-source .delete-test-namespace uninstall-crd
	@echo "Deleting OLM CSVs to fully uninstall OSSM Console operator and its related resources"
	@for csv in $$(${OC} get csv --all-namespaces --no-headers -o custom-columns=NS:.metadata.namespace,N:.metadata.name | sed 's/  */:/g' | grep ossmconsole-operator) ;\
	do \
		${OC} delete --ignore-not-found=true csv -n $$(echo -n $${csv} | cut -d: -f1) $$(echo -n $${csv} | cut -d: -f2) ;\
	done

## validate-cr: Ensures the example CR is valid according to the CRD schema
validate-cr:
	${OPERATOR_DIR}/crd-docs/bin/validate-ossmconsole-cr.sh --cr-file ${OPERATOR_DIR}/crd-docs/cr/kiali.io_v1alpha1_ossmconsole.yaml

## gen-crd-doc: Generates documentation for the OSSM Console CR configuration
gen-crd-doc:
	mkdir -p ${OPERATOR_OUTDIR}/crd-docs
	${DORP} run -v ${OPERATOR_OUTDIR}/crd-docs:/opt/crd-docs-generator/output -v ${OPERATOR_DIR}/crd-docs/config:/opt/crd-docs-generator/config quay.io/giantswarm/crd-docs-generator:0.9.0 --config /opt/crd-docs-generator/config/apigen-config.yaml

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
	  buildx_download_url="https://github.com/docker/buildx/releases/download/v$${required_buildx_version}/buildx-v$${required_buildx_version}.${GOOS}-${GOARCH}"; \
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
	  if ! docker buildx create --name=ossmconsole-builder --driver-opt=image=moby/buildkit:v0.8.0; then \
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

## build-push-operator-multi-arch: Pushes the OSSM Console Operator multi-arch image to quay.io.
build-push-operator-multi-arch: .ensure-buildx-builder
	@echo Pushing OSSM Console Operator multi-arch image to ${OPERATOR_QUAY_TAG} using docker buildx
	docker buildx build --build-arg OPERATOR_BASE_IMAGE_REPO=${OPERATOR_BASE_IMAGE_REPO} --build-arg OPERATOR_BASE_IMAGE_VERSION=${OPERATOR_BASE_IMAGE_VERSION} --push --pull --no-cache --builder=ossmconsole-builder $(foreach arch,${TARGET_ARCHS},--platform=linux/${arch}) $(foreach tag,${OPERATOR_QUAY_TAG},--tag=${tag}) -f ${OPERATOR_DIR}/build/Dockerfile ${OPERATOR_DIR}
