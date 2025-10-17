#
# These targets build the containers without any cluster environment in mind.
# Instead, the containers built are tagged for publishing to quay.io and/or docker.io.
#

## container-build-cypress-tests: Build Kiali cypress tests container image
container-build-cypress-tests:
	@OSSMC_BRANCH=$${OSSMC_BRANCH:-$$(git rev-parse --abbrev-ref HEAD)}; \
	echo "OSSMC_BRANCH: $$OSSMC_BRANCH"; \
	if echo "$$OSSMC_BRANCH" | grep -qE '^v[0-9]+\.[0-9]+'; then \
		echo "OSSMC release branch $$OSSMC_BRANCH"; \
		KIALI_BRANCH=$$OSSMC_BRANCH; \
	else \
		echo "This branch is not an OSSMC release branch (v*.*)! Using master for Kiali source code branch"; \
		KIALI_BRANCH=master; \
	fi; \
	echo "KIALI_BRANCH: $$KIALI_BRANCH"; \
	./hack/copy-frontend-src-to-ossmc.sh --source-ref "$$KIALI_BRANCH"; \
	./hack/download-hack-scripts.sh --kiali-branch "$$KIALI_BRANCH"
ifeq ($(DORP),docker)
	@echo Building container image for Kiali cypress tests using docker
	docker build --pull -t ${CYPRESS_TESTS_QUAY_TAG} -f deploy/docker/Dockerfile-cypress .
else
	@echo Building container image for Kiali cypress tests using podman
	podman build --pull -t ${CYPRESS_TESTS_QUAY_TAG} -f deploy/docker/Dockerfile-cypress .
endif

## container-push-cypress-tests-quay: Pushes the Kiali cypress test image to quay.
container-push-cypress-tests-quay:
ifeq ($(DORP),docker)
	@echo Pushing Kiali cypress test image to ${CYPRESS_TESTS_QUAY_TAG} using docker
	docker push ${CYPRESS_TESTS_QUAY_TAG}
else
	@echo Pushing Kiali cypress test image to ${CYPRESS_TESTS_QUAY_TAG} using podman
	podman push ${CYPRESS_TESTS_QUAY_TAG}
endif
