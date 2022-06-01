#
# Targets to run operator molecule tests.
# The molecule tests expect an operator to already be installed. Use "make operator-create" as one way to do this.
#

# The test scenario(s) to run - see molecule/ - all directories with a name *-test are scenarios you can run
# To run multiple scenarios sequentially, specify a space-separated list: make -e MOLECULE_SCENARIO="first-test second-test" molecule-test
MOLECULE_SCENARIO ?= default

# Defines what playbook version to test. This is the value to put in the tests' OSSMPlugin CR spec.version field.
MOLECULE_OSSMPLUGIN_CR_SPEC_VERSION ?= default

# Set MOLECULE_USE_DEV_IMAGES to true to use your local OSSM Plugin dev builds (not released images from quay.io).
# To use this, you must have first pushed your local dev builds via the cluster-push targets.
#
# If MOLECULE_USE_DEV_IMAGES is not set or set to 'false', that usually means you want to pick up the latest images
# published on quay.io. However, if you want to test the default plugin image that the operator will install, you
# can set MOLECULE_USE_DEFAULT_OSSMPLUGIN_IMAGE=true. When that is set (in conjunction with MOLECULE_USE_DEV_IMAGES=false),
# the molecule tests will set the spec.deployment.imageVersion and spec.deployment.imageName override fields to an
# empty string thus causing the plugin image to be the default image installed by the operator. This is useful
# when you are installing via OLM and you want to test with a specific CR spec.version (MOLECULE_OSSMPLUGIN_CR_SPEC_VERSION)
# and the default plugin that is installed by the operator for that spec.version.
#
# Note that you can override everything mentioned above in order to use your own image names/versions. You can do this by
# setting MOLECULE_IMAGE_ENV_ARGS. This is useful if you want to test a specific released version or images found in a different repo.
# If the x_IMAGE_NAME env vars are set to 'dev' then the molecule tests will use the internal OpenShift registry location.
# An example MOLECULE_IMAGE_ENV_ARGS can be:
#
#   MOLECULE_IMAGE_ENV_ARGS = --env MOLECULE_OSSMPLUGIN_IMAGE_NAME=quay.io/myuser/kiali \
#                             --env MOLECULE_OSSMPLUGIN_IMAGE_VERSION=test

ifndef MOLECULE_IMAGE_ENV_ARGS
ifeq ($(MOLECULE_USE_DEV_IMAGES),true)
MOLECULE_IMAGE_ENV_ARGS = --env MOLECULE_OSSMPLUGIN_IMAGE_NAME=dev --env MOLECULE_OSSMPLUGIN_IMAGE_VERSION=dev
else ifeq ($(MOLECULE_USE_DEFAULT_OSSMPLUGIN_IMAGE),true)
MOLECULE_IMAGE_ENV_ARGS = --env 'MOLECULE_OSSMPLUGIN_IMAGE_NAME=' --env 'MOLECULE_OSSMPLUGIN_IMAGE_VERSION='
endif
endif

ifeq ($(MOLECULE_DEBUG),true)
MOLECULE_DEBUG_ARG = --debug
endif

ifeq ($(MOLECULE_DESTROY_NEVER),true)
MOLECULE_DESTROY_NEVER_ARG = --destroy never
endif

# If turned on, the operator and plugin pod logs are dumped in the molecule logs if a molecule test fails
ifdef MOLECULE_DUMP_LOGS_ON_ERROR
MOLECULE_DUMP_LOGS_ON_ERROR_ENV_VAR ?= --env MOLECULE_DUMP_LOGS_ON_ERROR=${MOLECULE_DUMP_LOGS_ON_ERROR}
else
MOLECULE_DUMP_LOGS_ON_ERROR_ENV_VAR ?= --env MOLECULE_DUMP_LOGS_ON_ERROR=true
endif

# Turns on or off the ansible profiler which dumps profile logs after each operator reconciliation run
ifdef MOLECULE_OPERATOR_PROFILER_ENABLED
MOLECULE_OPERATOR_PROFILER_ENABLED_ENV_VAR ?= --env MOLECULE_OPERATOR_PROFILER_ENABLED=${MOLECULE_OPERATOR_PROFILER_ENABLED}
else
MOLECULE_OPERATOR_PROFILER_ENABLED_ENV_VAR ?= --env MOLECULE_OPERATOR_PROFILER_ENABLED=true
endif

MOLECULE_KUBECONFIG ?= ${HOME}/.kube/config

# Only allocate a pseudo-TTY if there is a terminal attached - this enables more readable colored text in ansible output.
# But do not set this option if there is not TERM (i.e. when run within a cron job) to avoid a runtime failure.
ifdef TERM
MOLECULE_DOCKER_TERM_ARGS=-t
endif

# We need to perform many retries when on OpenShift particularly when running on slower machines
MOLECULE_WAIT_RETRIES ?= 360
MOLECULE_WAIT_RETRIES_ARG ?= --env MOLECULE_WAIT_RETRIES=${MOLECULE_WAIT_RETRIES}

.prepare-force-molecule-build:
	@$(eval FORCE_MOLECULE_BUILD ?= $(shell ${DORP} inspect kiali-molecule:latest > /dev/null 2>&1 || echo "true"))

## molecule-build: Builds an image to run Molecule without requiring the host to have python/pip installed. If it already exists, and you want to build it again, set env var FORCE_MOLECULE_BUILD to "true".
molecule-build: .prepare-force-molecule-build
	@if [ "${FORCE_MOLECULE_BUILD}" == "true" ]; then ${DORP} build --no-cache -t kiali-molecule:latest ${OPERATOR_DIR}/molecule/docker; else echo "Will not rebuild kiali-molecule image."; fi

ifndef MOLECULE_ADD_HOST_ARGS
.prepare-add-host-args: .prepare-cluster
	@echo "Will auto-detect hosts to add based on the CLUSTER_REPO: ${CLUSTER_REPO}"
	@$(eval MOLECULE_ADD_HOST_ARGS ?= $(shell basehost="$(shell echo ${CLUSTER_REPO} | sed 's/^.*\.apps\.\(.*\)/\1/')"; kialihost="kiali-istio-system.apps.$${basehost}"; kialiip="$$(getent hosts $${kialihost} | head -n 1 | awk '{ print $$1 }')"; prometheushost="prometheus-istio-system.apps.$${basehost}"; prometheusip="$$(getent hosts $${prometheushost} | head -n 1 | awk '{ print $$1 }')" apihost="api.$${basehost}"; apiip="$$(getent hosts $${apihost} | head -n 1 | awk '{ print $$1 }')"; oauthoshost="oauth-openshift.apps.$${basehost}"; oauthosip="$$(getent hosts $${oauthoshost} | head -n 1 | awk '{ print $$1 }')"; echo "--add-host=$$kialihost:$$kialiip --add-host=$$prometheushost:$$prometheusip --add-host=$$apihost:$$apiip --add-host=$$oauthoshost:$$oauthosip"))
	@echo "Auto-detected add host args: ${MOLECULE_ADD_HOST_ARGS}"
else
.prepare-add-host-args:
	@echo "Will use the given add host args: ${MOLECULE_ADD_HOST_ARGS}"
endif

.prepare-molecule-data-volume:
	$(DORP) volume create molecule-tests-volume
	$(DORP) create -v molecule-tests-volume:/data --name molecule-volume-helper docker.io/busybox true
	$(DORP) cp "${OPERATOR_DIR}" molecule-volume-helper:/data/operator
	$(DORP) cp "${MOLECULE_KUBECONFIG}" molecule-volume-helper:/data/kubeconfig
	$(DORP) rm molecule-volume-helper

## molecule-test: Runs Molecule tests using the Molecule docker image
molecule-test: .prepare-add-host-args molecule-build .prepare-molecule-data-volume .create-operator-pull-secret
ifeq ($(DORP),docker)
	for msn in ${MOLECULE_SCENARIO}; do ${DORP} run --rm ${MOLECULE_DOCKER_TERM_ARGS} --env KUBECONFIG="/tmp/molecule/kubeconfig" --env K8S_AUTH_KUBECONFIG="/tmp/molecule/kubeconfig" -v molecule-tests-volume:/tmp/molecule -w /tmp/molecule/operator --network="host" ${MOLECULE_ADD_HOST_ARGS} --add-host="api.crc.testing:192.168.130.11" --add-host="kiali-istio-system.apps-crc.testing:192.168.130.11" --add-host="prometheus-istio-system.apps-crc.testing:192.168.130.11" --env DORP=${DORP} --env OPERATOR_IMAGE_PULL_SECRET_NAME=${OPERATOR_IMAGE_PULL_SECRET_NAME} --env MOLECULE_OSSMPLUGIN_CR_SPEC_VERSION=${MOLECULE_OSSMPLUGIN_CR_SPEC_VERSION} ${MOLECULE_IMAGE_ENV_ARGS} ${MOLECULE_OPERATOR_PROFILER_ENABLED_ENV_VAR} ${MOLECULE_DUMP_LOGS_ON_ERROR_ENV_VAR} ${MOLECULE_WAIT_RETRIES_ARG} -v /var/run/docker.sock:/var/run/docker.sock kiali-molecule:latest molecule ${MOLECULE_DEBUG_ARG} test ${MOLECULE_DESTROY_NEVER_ARG} --scenario-name $${msn}; if [ "$$?" != "0" ]; then echo "Molecule test failed: $${msn}"; ${DORP} volume rm molecule-tests-volume; exit 1; fi; done
else
	for msn in ${MOLECULE_SCENARIO}; do ${DORP} run --rm ${MOLECULE_DOCKER_TERM_ARGS} --env KUBECONFIG="/tmp/molecule/kubeconfig" --env K8S_AUTH_KUBECONFIG="/tmp/molecule/kubeconfig" -v molecule-tests-volume:/tmp/molecule -w /tmp/molecule/operator --network="host" ${MOLECULE_ADD_HOST_ARGS} --add-host="api.crc.testing:192.168.130.11" --add-host="kiali-istio-system.apps-crc.testing:192.168.130.11" --add-host="prometheus-istio-system.apps-crc.testing:192.168.130.11" --env DORP=${DORP} --env OPERATOR_IMAGE_PULL_SECRET_NAME=${OPERATOR_IMAGE_PULL_SECRET_NAME} --env MOLECULE_OSSMPLUGIN_CR_SPEC_VERSION=${MOLECULE_OSSMPLUGIN_CR_SPEC_VERSION} ${MOLECULE_IMAGE_ENV_ARGS} ${MOLECULE_OPERATOR_PROFILER_ENABLED_ENV_VAR} ${MOLECULE_DUMP_LOGS_ON_ERROR_ENV_VAR} ${MOLECULE_WAIT_RETRIES_ARG}                                    localhost/kiali-molecule:latest molecule ${MOLECULE_DEBUG_ARG} test ${MOLECULE_DESTROY_NEVER_ARG} --scenario-name $${msn}; if [ "$$?" != "0" ]; then echo "Molecule test failed: $${msn}"; ${DORP} volume rm molecule-tests-volume; exit 1; fi; done
endif
	$(DORP) volume rm molecule-tests-volume
