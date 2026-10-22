#
# These targets build the containers without any cluster environment in mind.
# Instead, the containers built are tagged for publishing to quay.io and/or docker.io.
#

# Kiali ref used when vendoring the frontend and e2e tests into the test images.
# Empty (default) = the matching OSSMC release branch for v*.* branches, master
# otherwise. While the Playwright migration lives on kiali epic/playwright-migration,
# pass KIALI_BRANCH=epic/playwright-migration to build images containing the
# frontend/e2e tree (kiali master does not have it until that branch merges).
KIALI_BRANCH ?=

define ossmc-sync-kiali
@OSSMC_BRANCH=$${OSSMC_BRANCH:-$$(git rev-parse --abbrev-ref HEAD)}; \
	KIALI_BRANCH="$(KIALI_BRANCH)"; \
	if [ -z "$$KIALI_BRANCH" ]; then \
		if echo "$$OSSMC_BRANCH" | grep -qE '^v[0-9]+\.[0-9]+'; then \
			echo "OSSMC release branch $$OSSMC_BRANCH"; \
			KIALI_BRANCH=$$OSSMC_BRANCH; \
		else \
			echo "This branch is not an OSSMC release branch (v*.*)! Using master for Kiali source code branch"; \
			KIALI_BRANCH=master; \
		fi; \
	fi; \
	echo "OSSMC_BRANCH: $$OSSMC_BRANCH"; \
	echo "KIALI_BRANCH: $$KIALI_BRANCH"; \
	./hack/copy-frontend-src-to-ossmc.sh --source-ref "$$KIALI_BRANCH"; \
	./hack/download-hack-scripts.sh --kiali-branch "$$KIALI_BRANCH"
endef

## container-build-cypress-tests: Build Kiali cypress tests container image
container-build-cypress-tests:
	$(ossmc-sync-kiali)
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

## container-build-playwright-tests: Build Kiali playwright tests container image
container-build-playwright-tests:
	$(ossmc-sync-kiali)
ifeq ($(DORP),docker)
	@echo Building container image for Kiali playwright tests using docker
	docker build --pull -t ${PLAYWRIGHT_TESTS_QUAY_TAG} -f deploy/docker/Dockerfile-playwright .
else
	@echo Building container image for Kiali playwright tests using podman
	podman build --pull -t ${PLAYWRIGHT_TESTS_QUAY_TAG} -f deploy/docker/Dockerfile-playwright .
endif

## container-push-playwright-tests-quay: Pushes the Kiali playwright test image to quay.
container-push-playwright-tests-quay:
ifeq ($(DORP),docker)
	@echo Pushing Kiali playwright test image to ${PLAYWRIGHT_TESTS_QUAY_TAG} using docker
	docker push ${PLAYWRIGHT_TESTS_QUAY_TAG}
else
	@echo Pushing Kiali playwright test image to ${PLAYWRIGHT_TESTS_QUAY_TAG} using podman
	podman push ${PLAYWRIGHT_TESTS_QUAY_TAG}
endif
