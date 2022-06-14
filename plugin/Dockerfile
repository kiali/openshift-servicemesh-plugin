FROM  registry.access.redhat.com/ubi8/nodejs-16 AS build

USER root
RUN command -v yarn || npm i -g yarn

ADD . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install && yarn build

FROM registry.access.redhat.com/ubi8/nginx-120

# Add application sources to a directory that the assemble script expects them
# and set permissions so that the container runs without root access
USER 0

# Install upgrades security
#   xz-libs RHSA-2022:4991
#   urllib3 CVE-2020-26137 CVE-2021-33503  Not available in the ubi8
#
RUN yum -y upgrade xz-libs

COPY --from=build /usr/src/app/dist /usr/share/nginx/html/
RUN chown -R 1001:0 /usr/share/nginx/html/

ARG VERSION
ARG COMMIT_HASH
RUN printf "\necho 'OpenShift Service Mesh Plugin: Version=[${VERSION}], Commit=[${COMMIT_HASH}]' >> /proc/1/fd/1" >> ${NGINX_CONTAINER_SCRIPTS_PATH}/common.sh

USER 1001
LABEL com.redhat.component="openshift-service-mesh-plugin" \
      name="openshift-service-mesh-plugin" \
      summary="OpenShift Service Mesh Kiali Plugin" \
      description="Kiali plugin for Openshift Service Mesh" \
      version=$VERSION \
      commit=$COMMIT_HASH

# Run script uses standard ways to run the application
CMD /usr/libexec/s2i/run