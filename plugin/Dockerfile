FROM  registry.access.redhat.com/ubi9/nodejs-24 AS build

USER 0

# Install and enable corepack to use yarn
RUN npm install -g corepack && corepack enable

ADD . /usr/src/app
WORKDIR /usr/src/app

# Install dependencies and build the plugin
ENV CYPRESS_INSTALL_BINARY=0
ENV HUSKY=0
RUN yarn install && yarn build

# Package the OSSMC TLS profile helper with the same interpreter that runs it, so the
# bundled bytecode matches and nothing is compiled at runtime. The result is pure Python
# and architecture-independent. Both nginx stages must name the same base image;
# make/Makefile.plugin.mk reads it to run the helper's tests on the same runtime.
FROM registry.access.redhat.com/ubi9/nginx-126 AS ossmc-tls-profile-build

ARG VERSION_PLUGIN
ARG COMMIT_HASH

USER 0

COPY server/ossmc_tls_profile /build/src/ossmc_tls_profile
RUN printf 'VERSION = "%s"\nCOMMIT = "%s"\n' "${VERSION_PLUGIN}" "${COMMIT_HASH}" > /build/src/ossmc_tls_profile/_version.py \
 && python3 -I -m compileall -b -q /build/src \
 && python3 -I -m zipapp /build/src -m 'ossmc_tls_profile.__main__:main' -p '/usr/bin/python3 -I' -o /build/ossmc-tls-profile

FROM registry.access.redhat.com/ubi9/nginx-126

ARG VERSION_PLUGIN
ARG COMMIT_HASH

USER 0

# Add application sources to a directory that the assemble script expects them
COPY --from=build /usr/src/app/dist /usr/share/nginx/html/

# The TLS profile helper. Current installation templates run it as the container command;
# the default CMD below is kept for older templates (which get no cluster TLS profile support).
COPY --from=ossmc-tls-profile-build /build/ossmc-tls-profile /usr/local/bin/ossmc-tls-profile
RUN chmod 0755 /usr/local/bin/ossmc-tls-profile && /usr/local/bin/ossmc-tls-profile --self-test

# Add a label to the container to identify the version and commit hash
RUN printf "\necho 'OpenShift Service Mesh Console: Version=[${VERSION_PLUGIN}], Commit=[${COMMIT_HASH}]' >> /proc/1/fd/1" >> ${NGINX_CONTAINER_SCRIPTS_PATH}/common.sh

LABEL com.redhat.component="openshift-service-mesh-console" \
      name="openshift-service-mesh-console" \
      summary="OpenShift Service Mesh Console" \
      description="The OpenShift Service Mesh Console adds Kiali observability, configuration and validation into the OpenShift Console." \
      version=$VERSION_PLUGIN \
      commit=$COMMIT_HASH

# Ensure the container runs as a non-root user
USER 1001

# Run script uses standard ways to run the application
CMD /usr/libexec/s2i/run
