#
# Targets for the local dev loop and running tests against the plugin.
#

## start: Starts the webpack dev server for the plugin.
start:
	cd ${PLUGIN_DIR} && yarn start

## typecheck: Runs a TypeScript type check across the plugin.
typecheck:
	cd ${PLUGIN_DIR} && yarn tsc --noEmit

## test: Runs the full unit test suite.
test:
	cd ${PLUGIN_DIR} && yarn test

## lint: Runs the full linter
lint:
	cd ${PLUGIN_DIR} && yarn lint

## start-console: Starts a local OpenShift Console instance for developing the plugin (set KIALI_URL to also test the OSSMC/Service Mesh perspective; KIALI_URL=route auto-discovers the Kiali route).
start-console: .ensure-oc-login .determine-kiali-url
	@KIALI_URL="${KIALI_URL_TO_USE}" ${PLUGIN_DIR}/start-console.sh

ifeq ($(KIALI_URL),)
.determine-kiali-url:
	@$(eval KIALI_URL_TO_USE = )
else ifeq ($(KIALI_URL),route)
.determine-kiali-url: .ensure-oc-login
	@echo "Auto discovering the KIALI_URL"
	@$(eval KIALI_URL_TO_USE = https://$(shell ${OC} get routes.route.openshift.io -l app.kubernetes.io/name=kiali --all-namespaces -o jsonpath='{.items[0].spec.host}'))
else
.determine-kiali-url:
	@$(eval KIALI_URL_TO_USE = $${KIALI_URL})
endif

## prepare-dev-env: Prepares the local dev environment so you can run the plugin and OpenShift console locally.
prepare-dev-env: .determine-kiali-url
	@cd ${PLUGIN_DIR} && CYPRESS_INSTALL_BINARY=0 HUSKY=0 yarn install
	@mkdir -p ${PLUGIN_DIR}/dist
	@cp ${PLUGIN_DIR}/plugin-config.json ${PLUGIN_DIR}/dist
	@echo
	@echo "To run the plugin and the OpenShift Console in your local dev environment, do the following:"
	@echo "1. Start the plugin: make start (or: cd ${PLUGIN_DIR} && yarn start)"
	@echo "2. In a second command line window, start the OpenShift Console: make start-console"
	@if [ -n "${KIALI_URL_TO_USE}" ]; then \
	  echo "   (Kiali URL: KIALI_URL=${KIALI_URL_TO_USE} make start-console)"; \
	else \
	  echo "   (Set KIALI_URL=<url> to point at a Kiali server, or KIALI_URL=route to auto-discover; omit to use the default http://localhost:20001)"; \
	fi
	@echo
	@echo "Overridable environment variables for 'make start-console':"
	@echo "  KIALI_URL=<url>         Kiali endpoint for OSSMC proxy (default: http://localhost:20001)"
	@echo "  CONSOLE_PORT=<port>     Local port for the console container (default: 9000)"
	@echo "  PLUGIN_DEV_PORT=<port>  Port of the webpack dev server (default: 9001)"
	@echo
