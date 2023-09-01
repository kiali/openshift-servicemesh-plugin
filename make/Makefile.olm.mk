#
# Targets for deploying the operator via OLM.
#

# Identifies the bundle and index images that will be built
OLM_IMAGE_ORG ?= ${OPERATOR_IMAGE_ORG}
OLM_BUNDLE_NAME ?= ${OLM_IMAGE_ORG}/ossmconsole-operator-bundle
OLM_INDEX_NAME ?= ${OLM_IMAGE_ORG}/ossmconsole-operator-index

OLM_INDEX_BASE_IMAGE ?= quay.io/openshift/origin-operator-registry:4.13
OPM_VERSION ?= 1.28.0

.download-opm-if-needed:
	@if [ "$(shell which opm 2>/dev/null || echo -n "")" == "" ]; then \
	  mkdir -p "${OPERATOR_OUTDIR}/operator-sdk-install" ;\
	  if [ -x "${OPERATOR_OUTDIR}/operator-sdk-install/opm" ]; then \
	    echo "You do not have opm installed in your PATH. Will use the one found here: ${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
	  else \
	    echo "You do not have opm installed in your PATH. The binary will be downloaded to ${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
	    curl -L https://github.com/operator-framework/operator-registry/releases/download/v${OPM_VERSION}/${OS}-${ARCH}-opm > "${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
	    chmod +x "${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
	  fi ;\
	fi

.ensure-opm-exists: .download-opm-if-needed
	@$(eval OPM ?= $(shell which opm 2>/dev/null || echo "${OPERATOR_OUTDIR}/operator-sdk-install/opm"))
	@"${OPM}" version

## get-opm: Downloads the OPM operator SDK tool if it is not already in PATH.
get-opm: .ensure-opm-exists
	@echo OPM location: ${OPM}

## validate-olm-metadata: Checks the latest version of the OLM bundle metadata for correctness.
validate-olm-metadata: .ensure-operator-sdk-exists
	@printf "==========\nValidating ossmconsole-ossm metadata\n==========\n"
	@mkdir -p ${OPERATOR_OUTDIR}/ossmconsole-ossm && rm -rf ${OPERATOR_OUTDIR}/ossmconsole-ossm/* && cp -R ${OPERATOR_DIR}/manifests/ossmconsole-ossm ${OPERATOR_OUTDIR} && cat ${OPERATOR_DIR}/manifests/ossmconsole-ossm/manifests/ossmconsole.clusterserviceversion.yaml | OSSMCONSOLE_OPERATOR_VERSION="2.0.0" OSSMCONSOLE_OLD_OPERATOR_VERSION="1.0.0" OSSMCONSOLE_OPERATOR_TAG=":2.0.0" OSSMCONSOLE_0_1_TAG=":1.0.0" CREATED_AT="2021-01-01T00:00:00Z" envsubst > ${OPERATOR_OUTDIR}/ossmconsole-ossm/manifests/ossmconsole.clusterserviceversion.yaml && ${OP_SDK} bundle validate --verbose ${OPERATOR_OUTDIR}/ossmconsole-ossm
	@printf "==========\nValidating the latest version of ossmconsole-community metadata\n==========\n"
	@for d in $$(ls -1d ${OPERATOR_DIR}/manifests/ossmconsole-community/* | sort -V | grep -v ci.yaml | tail -n 1); do ${OP_SDK} bundle --verbose validate $$d; done

.determine-olm-bundle-version:
	@$(eval BUNDLE_VERSION ?= $(shell echo -n "${VERSION}" | sed 's/-SNAPSHOT//' ))

## build-olm-bundle: Builds the latest bundle version for deploying the operator in OLM
build-olm-bundle: .prepare-cluster .determine-olm-bundle-version
	@echo Will bundle version [${BUNDLE_VERSION}]
	@mkdir -p ${OPERATOR_OUTDIR}/bundle
	cp -R ${OPERATOR_DIR}/manifests/template/* ${OPERATOR_OUTDIR}/bundle
	${OPERATOR_DIR}/manifests/generate-csv.sh -ov "NONE" -nv "${BUNDLE_VERSION}" -opin "${CLUSTER_OPERATOR_INTERNAL_NAME}" -opiv "${OPERATOR_CONTAINER_VERSION}" -ipp "Always" > ${OPERATOR_OUTDIR}/bundle/manifests/ossmconsole.clusterserviceversion.yaml
	${OPERATOR_DIR}/manifests/generate-annotations.sh -c candidate > ${OPERATOR_OUTDIR}/bundle/metadata/annotations.yaml
	${OPERATOR_DIR}/manifests/generate-dockerfile.sh -c candidate > ${OPERATOR_OUTDIR}/bundle/bundle.Dockerfile
	${DORP} build -f ${OPERATOR_OUTDIR}/bundle/bundle.Dockerfile -t ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION}

## cluster-push-olm-bundle: Builds then pushes the OLM bundle container image to a remote cluster
cluster-push-olm-bundle: build-olm-bundle
ifeq ($(DORP),docker)
	@echo Pushing olm bundle image to remote cluster using docker: ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION}
	docker push ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION}
else
	@echo Pushing olm bundle image to remote cluster using podman: ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION}
	podman push --tls-verify=false ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION}
endif

## build-olm-index: Pushes the OLM bundle then generates the OLM index
# See https://docs.openshift.com/container-platform/4.10/operators/admin/olm-managing-custom-catalogs.html
build-olm-index: .ensure-opm-exists cluster-push-olm-bundle
	@rm -rf ${OPERATOR_OUTDIR}/index
	@mkdir -p ${OPERATOR_OUTDIR}/index/ossmconsole-index
	${OPM} init ossmconsole --default-channel=candidate --output yaml > ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@if [ "${DORP}" == "podman" -a -n "$${XDG_RUNTIME_DIR}" ]; then cp "$${XDG_RUNTIME_DIR}/containers/auth.json" "${OPERATOR_OUTDIR}/index/ossmconsole-index/config.json"; fi
	@if [ -f "${OPERATOR_OUTDIR}/index/ossmconsole-index/config.json" ]; then export DOCKER_CONFIG="${OPERATOR_OUTDIR}/index/ossmconsole-index"; fi ; ${OPM} render --skip-tls-verify ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION} --output yaml >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@rm -f ${OPERATOR_OUTDIR}/index/ossmconsole-index/config.json
	@# We need OLM to pull the index from the internal registry - change the index to only use the internal registry name
	sed -i 's|${CLUSTER_REPO}|${CLUSTER_REPO_INTERNAL}|g' ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@echo "---"                                               >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@echo "schema: olm.channel"                               >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@echo "package: ossmconsole"                              >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@echo "name: candidate"                                   >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@echo "entries:"                                          >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	@echo "- name: ${OPERATOR_IMAGE_NAME}.${BUNDLE_VERSION}"  >> ${OPERATOR_OUTDIR}/index/ossmconsole-index/index.yaml
	${OPM} validate ${OPERATOR_OUTDIR}/index/ossmconsole-index
	@# Now generate the Dockerfile
	@echo "FROM ${OLM_INDEX_BASE_IMAGE}"                                   >  ${OPERATOR_OUTDIR}/index/ossmconsole-index.Dockerfile
	@echo 'ENTRYPOINT ["/bin/opm"]'                                        >> ${OPERATOR_OUTDIR}/index/ossmconsole-index.Dockerfile
	@echo 'CMD ["serve", "/configs"]'                                      >> ${OPERATOR_OUTDIR}/index/ossmconsole-index.Dockerfile
	@echo "ADD ossmconsole-index /configs"                                 >> ${OPERATOR_OUTDIR}/index/ossmconsole-index.Dockerfile
	@echo "LABEL operators.operatorframework.io.index.configs.v1=/configs" >> ${OPERATOR_OUTDIR}/index/ossmconsole-index.Dockerfile
	cd ${OPERATOR_OUTDIR}/index && ${DORP} build . -f ossmconsole-index.Dockerfile -t ${CLUSTER_REPO}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}

## cluster-push-olm-index: Pushes the OLM bundle and then builds and pushes the OLM index to the cluster
cluster-push-olm-index: build-olm-index
ifeq ($(DORP),docker)
	@echo Pushing OLM index image to remote cluster using docker: ${CLUSTER_REPO}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}
	docker push ${CLUSTER_REPO}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}
else
	@echo Pushing OLM index image to remote cluster using podman: ${CLUSTER_REPO}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}
	podman push --tls-verify=false ${CLUSTER_REPO}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}
endif

.generate-catalog-source: .prepare-cluster .determine-olm-bundle-version .prepare-operator-pull-secret
	@mkdir -p "${OPERATOR_OUTDIR}"
	@echo "apiVersion: operators.coreos.com/v1alpha1" >  ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "kind: CatalogSource"                       >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "metadata:"                                 >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  name: ossmconsole-catalog"               >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  namespace: ${OPERATOR_NAMESPACE}"        >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "spec:"                                     >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  displayName: Test OSSM Console Operator" >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  publisher: Local Developer"              >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  secrets:"                                >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  - ${OPERATOR_IMAGE_PULL_SECRET_NAME}"    >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  sourceType: grpc"                        >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml
	@echo "  image: ${CLUSTER_REPO_INTERNAL}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}" >> ${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml

## deploy-catalog-source: Creates the OLM CatalogSource on the remote cluster
deploy-catalog-source: .generate-catalog-source cluster-push-olm-index .create-operator-pull-secret
	${OC} apply -f "${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml"

## undeploy-catalog-source: Deletes the OLM CatalogSource from the remote cluster
undeploy-catalog-source: .generate-catalog-source .remove-operator-pull-secret
	${OC} delete --ignore-not-found=true -f "${OPERATOR_OUTDIR}/ossmconsole-catalogsource.yaml"

.generate-subscription:
	@mkdir -p "${OPERATOR_OUTDIR}"
	@echo "apiVersion: operators.coreos.com/v1alpha1"  >  ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "kind: Subscription"                         >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "metadata:"                                  >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  name: ossmconsole-subscription"           >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  namespace: ${OPERATOR_NAMESPACE}"         >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "spec:"                                      >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  channel: candidate"                       >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  installPlanApproval: Automatic"           >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  name: ossmconsole"                        >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  source: ossmconsole-catalog"              >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  sourceNamespace: ${OPERATOR_NAMESPACE}"   >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "  config:"                                  >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "    env:"                                   >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo "    - name: ALLOW_AD_HOC_OSSMCONSOLE_IMAGE" >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml
	@echo '      value: "true"'                        >> ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml

## deploy-subscription: Creates the OLM Subscription on the remote cluster which installs the operator
deploy-subscription: .ensure-oc-login .generate-subscription
	${OC} apply -f ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml

## undeploy-subscription: Deletes the OLM Subscription from the remote cluster which uninstalls the operator
undeploy-subscription: .ensure-oc-login .generate-subscription
	${OC} delete --ignore-not-found=true -f ${OPERATOR_OUTDIR}/ossmconsole-subscription.yaml

