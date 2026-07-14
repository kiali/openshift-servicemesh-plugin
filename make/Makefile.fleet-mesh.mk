#
# Targets for developing the Fleet Service Mesh subtree inside the combined OSSMC plugin.
#
# The fleet-mesh source lives under plugin/src/fleet-mesh/ and is bundled together with
# the existing OSSMC content into a single ConsolePlugin named 'ossmconsole'. These targets
# let you work on that subtree without needing to know the details of the surrounding build.
#

# Required rstest CLI version accepts a path filter as a positional argument (vitest-style).
FLEET_MESH_SRC := ${PLUGIN_DIR}/src/fleet-mesh

## fleet-mesh-cluster-deploy: Build, push to the CRC/OCP internal registry, and deploy (no quay.io needed). Pushes into the plugin namespace so no cross-namespace pull secret is required.
fleet-mesh-cluster-deploy: .ensure-oc-login
	$(MAKE) PLUGIN_IMAGE_ORG=${PLUGIN_NAMESPACE} cluster-push
	cd ${PLUGIN_DIR} && ${OC} apply -f manifest.yaml
	${OC} set image deployment/ossmconsole \
	  ossmconsole=image-registry.openshift-image-registry.svc:5000/${PLUGIN_NAMESPACE}/${PLUGIN_IMAGE_NAME}:${CONTAINER_VERSION} \
	  -n ${PLUGIN_NAMESPACE}
	${OC} rollout restart deployment/ossmconsole -n ${PLUGIN_NAMESPACE}
	${OC} rollout status deployment/ossmconsole -n ${PLUGIN_NAMESPACE} --timeout=120s
	$(MAKE) enable-plugin

## fleet-mesh-test: Run fleet-mesh unit tests only (excludes OSSMC/Kiali tests).
fleet-mesh-test:
	cd ${PLUGIN_DIR} && yarn rstest run src/fleet-mesh

## fleet-mesh-typecheck: Run TypeScript type check across the combined plugin (covers fleet-mesh source).
fleet-mesh-typecheck:
	cd ${PLUGIN_DIR} && yarn tsc --noEmit

## fleet-mesh-start: Start the webpack dev server (serves the combined plugin; fleet-mesh is included).
fleet-mesh-start:
	cd ${PLUGIN_DIR} && yarn start

## fleet-mesh-start-console: Start the local OpenShift Console with ACM/MCE port-forwards for fleet-mesh development (set KIALI_URL to also test the OSSMC/Kiali side).
fleet-mesh-start-console: .ensure-oc-login
	${ROOTDIR}/hack/fleet-mesh/start-console-fleet-mesh.sh

## fleet-mesh-prepare-dev-env: Install plugin dependencies and print fleet-mesh local dev instructions.
fleet-mesh-prepare-dev-env:
	@cd ${PLUGIN_DIR} && yarn install
	@echo
	@echo "Fleet Service Mesh local development (fast iteration):"
	@echo "  Terminal 1: make fleet-mesh-start"
	@echo "  Terminal 2: make fleet-mesh-start-console"
	@echo "              (auto port-forwards ACM/MCE console plugins; cleaned up on exit)"
	@echo "  Browser:    http://localhost:9000 — switch to Fleet Service Mesh perspective"
	@echo
	@echo "Overridable environment variables:"
	@echo "  KIALI_URL=<url>         Kiali endpoint for OSSMC proxy (default: http://localhost:20001)"
	@echo "  LOAD_ACM_PLUGINS=false  Skip ACM/MCE port-forwards (Fleet Management links will not work)"
	@echo "  CONSOLE_PORT=<port>     Local port for the console container (default: 9000)"
	@echo "  PLUGIN_DEV_PORT=<port>  Port of the webpack dev server (default: 9001)"
	@echo
