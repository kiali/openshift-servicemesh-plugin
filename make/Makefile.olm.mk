#
# Targets for deploying the operator via OLM.
#

# Identifies the bundle and index images that will be built
OLM_IMAGE_ORG ?= ${OPERATOR_IMAGE_ORG}
OLM_BUNDLE_NAME ?= ${OLM_IMAGE_ORG}/ossmplugin-operator-bundle
OLM_INDEX_NAME ?= ${OLM_IMAGE_ORG}/ossmplugin-operator-index

OLM_INDEX_BASE_IMAGE ?= quay.io/openshift/origin-operator-registry:4.10

.download-opm-if-needed:
	@if [ "$(shell which opm 2>/dev/null || echo -n "")" == "" ]; then \
	  mkdir -p "${OPERATOR_OUTDIR}/operator-sdk-install" ;\
	  if [ -x "${OPERATOR_OUTDIR}/operator-sdk-install/opm" ]; then \
	    echo "You do not have opm installed in your PATH. Will use the one found here: ${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
	  else \
	    echo "You do not have opm installed in your PATH. The binary will be downloaded to ${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
	    curl -L https://github.com/operator-framework/operator-registry/releases/download/v1.22.1/${OS}-${ARCH}-opm > "${OPERATOR_OUTDIR}/operator-sdk-install/opm" ;\
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
	@printf "==========\nValidating ossmplugin-ossm metadata\n==========\n"
	@mkdir -p ${OPERATOR_OUTDIR}/ossmplugin-ossm && rm -rf ${OPERATOR_OUTDIR}/ossmplugin-ossm/* && cp -R ${OPERATOR_DIR}/manifests/ossmplugin-ossm ${OPERATOR_OUTDIR} && cat ${OPERATOR_DIR}/manifests/ossmplugin-ossm/manifests/ossmplugin.clusterserviceversion.yaml | OSSMPLUGIN_OPERATOR_VERSION="2.0.0" OSSMPLUGIN_OLD_OPERATOR_VERSION="1.0.0" OSSMPLUGIN_OPERATOR_TAG=":2.0.0" OSSMPLUGIN_0_1_TAG=":1.0.0" CREATED_AT="2021-01-01T00:00:00Z" envsubst > ${OPERATOR_OUTDIR}/ossmplugin-ossm/manifests/ossmplugin.clusterserviceversion.yaml && ${OP_SDK} bundle validate --verbose ${OPERATOR_OUTDIR}/ossmplugin-ossm
	@printf "==========\nValidating the latest version of ossmplugin-community metadata\n==========\n"
	@for d in $$(ls -1d ${OPERATOR_DIR}/manifests/ossmplugin-community/* | sort -V | grep -v ci.yaml | tail -n 1); do ${OP_SDK} bundle --verbose validate $$d; done

.determine-olm-bundle-version:
	@$(eval BUNDLE_VERSION ?= $(shell echo -n "${VERSION}" | sed 's/-SNAPSHOT//' ))

## build-olm-bundle: Builds the latest bundle version for deploying the operator in OLM
build-olm-bundle: .prepare-cluster .determine-olm-bundle-version
	@echo Will bundle version [${BUNDLE_VERSION}]
	@mkdir -p ${OPERATOR_OUTDIR}/bundle
	cp -R ${OPERATOR_DIR}/manifests/template/* ${OPERATOR_OUTDIR}/bundle
	${OPERATOR_DIR}/manifests/generate-csv.sh -ov "NONE" -nv "${BUNDLE_VERSION}" -opin "${CLUSTER_OPERATOR_INTERNAL_NAME}" -opiv "${OPERATOR_CONTAINER_VERSION}" > ${OPERATOR_OUTDIR}/bundle/manifests/ossmplugin.clusterserviceversion.yaml
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
	@mkdir -p ${OPERATOR_OUTDIR}/index/ossmplugin-index
	${OPM} init ossmplugin --default-channel=stable --output yaml > ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	${OPM} render --skip-tls-verify ${CLUSTER_REPO}/${OLM_BUNDLE_NAME}:${BUNDLE_VERSION} --output yaml >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@# We need OLM to pull the index from the internal registry - change the index to only use the internal registry name
	sed -i 's|${CLUSTER_REPO}|${CLUSTER_REPO_INTERNAL}|g' ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@echo "---"                                               >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@echo "schema: olm.channel"                               >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@echo "package: ossmplugin"                               >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@echo "name: stable"                                      >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@echo "entries:"                                          >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	@echo "- name: ${OPERATOR_IMAGE_NAME}.${BUNDLE_VERSION}"  >> ${OPERATOR_OUTDIR}/index/ossmplugin-index/index.yaml
	${OPM} validate ${OPERATOR_OUTDIR}/index/ossmplugin-index
	@# Now generate the Dockerfile
	@echo "FROM ${OLM_INDEX_BASE_IMAGE}"                                   >  ${OPERATOR_OUTDIR}/index/ossmplugin-index.Dockerfile
	@echo 'ENTRYPOINT ["/bin/opm"]'                                        >> ${OPERATOR_OUTDIR}/index/ossmplugin-index.Dockerfile
	@echo 'CMD ["serve", "/configs"]'                                      >> ${OPERATOR_OUTDIR}/index/ossmplugin-index.Dockerfile
	@echo "ADD ossmplugin-index /configs"                                  >> ${OPERATOR_OUTDIR}/index/ossmplugin-index.Dockerfile
	@echo "LABEL operators.operatorframework.io.index.configs.v1=/configs" >> ${OPERATOR_OUTDIR}/index/ossmplugin-index.Dockerfile
	cd ${OPERATOR_OUTDIR}/index && ${DORP} build . -f ossmplugin-index.Dockerfile -t ${CLUSTER_REPO}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}

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
	@echo "apiVersion: operators.coreos.com/v1alpha1" >  ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "kind: CatalogSource"                       >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "metadata:"                                 >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  name: ossmplugin-catalog"                >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  namespace: ${OPERATOR_NAMESPACE}"        >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "spec:"                                     >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  displayName: Test OSSM Plugin Operator"  >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  publisher: Local Developer"              >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  secrets:"                                >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  - ${OPERATOR_IMAGE_PULL_SECRET_NAME}"    >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  sourceType: grpc"                        >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml
	@echo "  image: ${CLUSTER_REPO_INTERNAL}/${OLM_INDEX_NAME}:${BUNDLE_VERSION}" >> ${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml

## deploy-catalog-source: Creates the OLM CatalogSource on the remote cluster
deploy-catalog-source: .generate-catalog-source cluster-push-olm-index .create-operator-pull-secret
	${OC} apply -f "${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml"

## undeploy-catalog-source: Deletes the OLM CatalogSource from the remote cluster
undeploy-catalog-source: .generate-catalog-source
	${OC} delete --ignore-not-found=true -f "${OPERATOR_OUTDIR}/ossmplugin-catalogsource.yaml"

.generate-subscription:
	@mkdir -p "${OPERATOR_OUTDIR}"
	@echo "apiVersion: operators.coreos.com/v1alpha1" >  ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "kind: Subscription"                        >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "metadata:"                                 >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  name: ossmplugin-subscription"           >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  namespace: ${OPERATOR_NAMESPACE}"        >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "spec:"                                     >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  channel: stable"                         >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  installPlanApproval: Automatic"          >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  name: ossmplugin"                        >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  source: ossmplugin-catalog"              >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  sourceNamespace: ${OPERATOR_NAMESPACE}"  >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "  config:"                                 >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "    env:"                                  >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo "    - name: ALLOW_AD_HOC_OSSMPLUGIN_IMAGE" >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml
	@echo '      value: "true"'                       >> ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml

## deploy-subscription: Creates the OLM Subscription on the remote cluster which installs the operator
deploy-subscription: .ensure-oc-login .generate-subscription
	${OC} apply -f ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml

## undeploy-subscription: Deletes the OLM Subscription from the remote cluster which uninstalls the operator
undeploy-subscription: .ensure-oc-login .generate-subscription
	${OC} delete --ignore-not-found=true -f ${OPERATOR_OUTDIR}/ossmplugin-subscription.yaml

