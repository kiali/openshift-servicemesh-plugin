SHELL=/bin/bash

# Identifies the current build.
VERSION ?= v0.1.0-SNAPSHOT
COMMIT_HASH ?= $(shell git rev-parse HEAD)

# Directories based on the root project directory
ROOTDIR=$(CURDIR)
PLUGIN_DIR=${ROOTDIR}/plugin
OPERATOR_DIR=${ROOTDIR}/operator

# Determine if we should use Docker OR Podman - value must be one of "docker" or "podman"
DORP ?= podman

# Find the oc client executable
OC ?= $(shell which oc 2>/dev/null || echo "MISSING-OC-FROM-PATH")

# list for multi-arch image publishing
TARGET_ARCHS ?= amd64 arm64 s390x ppc64le

# Local arch details needed when downloading tools
OS := $(shell uname -s | tr '[:upper:]' '[:lower:]')
ARCH := $(shell uname -m | sed 's/x86_64/amd64/')

# Container version used when tagging container images
# When doing releases, you probably want to override this so it is set to the release version string.
CONTAINER_VERSION ?= dev

include make/Makefile.plugin.mk
include make/Makefile.operator.mk
include make/Makefile.cluster.mk
include make/Makefile.olm.mk
include make/Makefile.molecule.mk

help:
	@echo
	@echo "Plugin targets - used to develop and build the plugin"
	@sed -n 's/^##//p' make/Makefile.plugin.mk | column -t -s ':' |  sed -e 's/^/ /'
	@echo
	@echo "Operator targets - used to develop and build the operator"
	@sed -n 's/^##//p' make/Makefile.operator.mk | column -t -s ':' |  sed -e 's/^/ /'
	@echo
	@echo "Cluster targets - used to manage images on the remote cluster"
	@sed -n 's/^##//p' make/Makefile.cluster.mk | column -t -s ':' |  sed -e 's/^/ /'
	@echo
	@echo "OLM targets - used to deploy the operator via OLM"
	@sed -n 's/^##//p' make/Makefile.olm.mk | column -t -s ':' |  sed -e 's/^/ /'
	@echo
	@echo "Molecule targets - used to run the operator molecule tests"
	@sed -n 's/^##//p' make/Makefile.molecule.mk | column -t -s ':' |  sed -e 's/^/ /'
	@echo

.ensure-oc-exists:
	@if [ ! -x "${OC}" ]; then echo "Missing 'oc'"; exit 1; fi

.ensure-oc-login: .ensure-oc-exists
	@if ! ${OC} whoami &> /dev/null; then echo "You are not logged into an OpenShift cluster. Run 'oc login' before continuing."; exit 1; fi
