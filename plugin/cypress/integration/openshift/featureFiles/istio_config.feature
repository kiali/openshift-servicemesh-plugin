@istio-config
@ossmc
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali Istio Config page

  On the Istio Config page, an admin should see all the Istio Config objects.
  The admin should be able to filter for the Istio Config objects they are looking for
  and create new Istio objects.

  Background:
    Given user is at administrator perspective
    And user is at the istio config list page
    And user selects the "bookinfo" project

  @bookinfo-app
  Scenario: See all Istio Config objects in the bookinfo namespace.
    Then user sees all the Istio Config objects in the bookinfo namespace
    And user sees Name information for Istio objects in ossmc
    And user sees Namespace information for Istio objects in ossmc
    And user sees Type information for Istio objects in ossmc
    And user sees Configuration information for Istio objects in ossmc

  Scenario: Filter Istio Config objects by Istio Name
    When the user filters for "bookinfo-gateway"
    Then user only sees "bookinfo-gateway"

  Scenario: Ability to create an AuthorizationPolicy object
    Then the user can create a "authorizationPolicy" Istio object in ossmc

  Scenario: Ability to create a Gateway object
    Then the user can create a "gateway" Istio object in ossmc

  @gateway-api
  Scenario: Ability to create a K8sGateway object
    Then the user can create a "k8sGateway" K8s Istio object in ossmc

  @gateway-api
  Scenario: Ability to create a K8sReferenceGrant object
    Then the user can create a "k8sReferenceGrant" K8s Istio object in ossmc

  Scenario: Ability to create a PeerAuthentication object
    Then the user can create a "peerAuthentication" Istio object in ossmc

  Scenario: Ability to create a RequestAuthentication object
    Then the user can create a "requestAuthentication" Istio object in ossmc

  Scenario: Ability to create a ServiceEntry object
    Then the user can create a "serviceEntry" Istio object in ossmc

  Scenario: Ability to create a Sidecar object
    Then the user can create a "sidecar" Istio object in ossmc

  @crd-validation
  @bookinfo-app
  Scenario: KIA0101 validation
    Given a "foo" AuthorizationPolicy in the "bookinfo" namespace
    And the AuthorizationPolicy has a from-source rule for "bar" namespace
    When user selects the "bookinfo" project
    Then the AuthorizationPolicy should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  Scenario: KIA0102 validation
    Given a "enable-mtls" DestinationRule in the "bookinfo" namespace for "*.bookinfo.svc.cluster.local" host
    And a "foo" AuthorizationPolicy in the "bookinfo" namespace
    And the AuthorizationPolicy has a to-operation rule with "non-fully-qualified-grpc" method
    When user selects the "bookinfo" project
    Then the AuthorizationPolicy should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  Scenario: KIA0104 validation
    Given there is not a "bookinfo" "VirtualService" in the "bookinfo" namespace
    Given a "foo" AuthorizationPolicy in the "bookinfo" namespace
    And the AuthorizationPolicy has a to-operation rule with "missing.hostname" host
    When user selects the "bookinfo" project
    Then the AuthorizationPolicy should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  Scenario: KIA0106 validation
    Given a "foo" AuthorizationPolicy in the "bookinfo" namespace
    And the AuthorizationPolicy has a from-source rule for "cluster.local/ns/bookinfo/sa/sleep" principal
    When user selects the "bookinfo" project
    Then the AuthorizationPolicy should have a "danger" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0201 validation
    Given a "foo" DestinationRule in the "sleep" namespace for "sleep" host
    And the DestinationRule has a "mysubset" subset for "version=v1" labels
    And a "bar" DestinationRule in the "sleep" namespace for "sleep" host
    And the DestinationRule has a "mysubset" subset for "version=v1" labels
    When user selects the "sleep" project
    Then the "foo" "DestinationRule" of the "sleep" namespace should have a "warning" in ossmc
    And the "bar" "DestinationRule" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" "DestinationRule" in the "sleep" namespace
    And there is not a "bar" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0202 validation
    Given a "foo" DestinationRule in the "sleep" namespace for "nonexistent" host
    When user selects the "sleep" project
    Then the "foo" "DestinationRule" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0203 validation
    Given a "foo" DestinationRule in the "sleep" namespace for "sleep" host
    And the DestinationRule has a "v1" subset for "version=v1" labels
    And there is a "foo-route" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep" and subset "v1"
    When user selects the "sleep" project
    Then the "foo" "DestinationRule" of the "sleep" namespace should have a "danger" in ossmc
    And there is not a "foo" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0207 validation
    Given a "disable-mtls" DestinationRule in the "sleep" namespace for "*.sleep.svc.cluster.local" host
    And the DestinationRule disables mTLS
    And there is a "default" PeerAuthentication in the "sleep" namespace
    And the PeerAuthentication has "STRICT" mtls mode
    When user selects the "sleep" project
    Then the "disable-mtls" "DestinationRule" of the "sleep" namespace should have a "danger" in ossmc
    And there is not a "disable-mtls" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  @clean-istio-namespace-resources-after
  Scenario: KIA0208 validation
    Given a "disable-mtls" DestinationRule in the "sleep" namespace for "*.sleep.svc.cluster.local" host
    And the DestinationRule disables mTLS
    And there is a "default" PeerAuthentication in the "istio-system" namespace
    And the PeerAuthentication has "STRICT" mtls mode
    When user selects the "sleep" project
    Then the "disable-mtls" "DestinationRule" of the "sleep" namespace should have a "danger" in ossmc
    And there is not a "disable-mtls" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0209 validation
    Given a "foo" DestinationRule in the "sleep" namespace for "*.sleep.svc.cluster.local" host
    And the DestinationRule has a "v1" subset for "" labels
    When user selects the "sleep" project
    Then the "foo" "DestinationRule" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0301 wildcard validation
    Given there is a "foo" Gateway on "bookinfo" namespace for "productpage.local" hosts on HTTP port 80 with "app=productpage" labels selector
    And there is a "foo" Gateway on "sleep" namespace for "*" hosts on HTTP port 80 with "app=productpage" labels selector
    When user selects the "bookinfo" project
    Then the "foo" "Gateway" of the "bookinfo" namespace should have a "warning" in ossmc
    When user selects the "sleep" project
    Then the "foo" "Gateway" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" Gateway in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0301 validation
    Given there is a "foo" Gateway on "bookinfo" namespace for "productpage.local" hosts on HTTP port 80 with "app=productpage" labels selector
    And there is a "foo" Gateway on "sleep" namespace for "productpage.local" hosts on HTTP port 80 with "app=productpage" labels selector
    When user selects the "bookinfo" project
    Then the "foo" "Gateway" of the "bookinfo" namespace should have a "warning" in ossmc
    When user selects the "sleep" project
    Then the "foo" "Gateway" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" Gateway in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0302 validation
    Given there is a "foo" Gateway on "sleep" namespace for "foo.local" hosts on HTTP port 80 with "app=foo" labels selector
    When user selects the "sleep" project
    Then the "foo" "Gateway" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" Gateway in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA0505 validation
    Given a "enable-mtls" DestinationRule in the "sleep" namespace for "*.sleep.svc.cluster.local" host
    And the DestinationRule enables mTLS
    And there is a "default" PeerAuthentication in the "sleep" namespace
    And the PeerAuthentication has "DISABLE" mtls mode
    When user selects the "sleep" project
    Then the "default" "PeerAuthentication" of the "sleep" namespace should have a "danger" in ossmc
    And there is not a "enable-mtls" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  @clean-istio-namespace-resources-after
  Scenario: KIA0506 validation
    Given a "enable-mtls" DestinationRule in the "sleep" namespace for "*.local" host
    And the DestinationRule enables mTLS
    And there is a "default" PeerAuthentication in the "istio-system" namespace
    And the PeerAuthentication has "DISABLE" mtls mode
    When user selects the "istio-system" project
    Then the "default" "PeerAuthentication" of the "istio-system" namespace should have a "danger" in ossmc
    And there is not a "enable-mtls" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1004 validation
    Given there is a "foo" Sidecar resource in the "sleep" namespace that captures egress traffic for hosts "sleep/foo.sleep.svc.cluster.local"
    And the Sidecar is applied to workloads with "app=sleep" labels
    When user selects the "sleep" project
    Then the "foo" "Sidecar" of the "sleep" namespace should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  @clean-istio-namespace-resources-after
  Scenario: KIA1006 validation
    Given there is a "default" Sidecar resource in the "istio-system" namespace that captures egress traffic for hosts "default/sleep.sleep.svc.cluster.local"
    And the Sidecar is applied to workloads with "app=grafana" labels
    When user selects the "istio-system" project
    Then the "default" "Sidecar" of the "istio-system" namespace should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1101 validation
    Given there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "foo"
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1102 validation
    Given there is not a "foo" Gateway in the "sleep" namespace
    And there is not a "foo" "DestinationRule" in the "sleep" namespace
    And there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep"
    And the VirtualService applies to "sleep" hosts
    And the VirtualService references "foo" gateways
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "danger" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: VirtualService references to Gateway
    Given there is a "foo" Gateway on "bookinfo" namespace for "productpage.local" hosts on HTTP port 80 with "app=productpage" labels selector
    And there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep"
    And the VirtualService applies to "sleep" hosts
    And the VirtualService references "bookinfo/foo" gateways
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "success" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1104 validation
    Given there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep"
    And the route of the VirtualService has weight 10
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1105 validation
    Given there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep" and subset "v1"
    And the route of the VirtualService has weight 50
    And the http-route of the VirtualService also has a destination to host "sleep" and subset "v1" with weight 50
    And a "foo" DestinationRule in the "sleep" namespace for "sleep" host
    And the DestinationRule has a "v1" subset for "version=v1" labels
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "warning" in ossmc
    And there is not a "foo" "DestinationRule" in the "sleep" namespace

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1106 validation
    Given there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep"
    And the VirtualService applies to "sleep" hosts
    Given there is a "bar" VirtualService in the "sleep" namespace with a "bar-route" http-route to host "sleep"
    And the VirtualService applies to "sleep" hosts
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "warning" in ossmc
    And the "bar" "VirtualService" of the "sleep" namespace should have a "warning" in ossmc

  @crd-validation
  @bookinfo-app
  @sleep-app
  Scenario: KIA1107 validation
    Given there is a "foo" VirtualService in the "sleep" namespace with a "foo-route" http-route to host "sleep" and subset "v1"
    And there is not a "foo" "DestinationRule" in the "sleep" namespace
    And there is not a "foo" Gateway in the "sleep" namespace
    When user selects the "sleep" project
    Then the "foo" "VirtualService" of the "sleep" namespace should have a "warning" in ossmc

  # KIA1501 is tested through GUI in wizard_istio_config.feature
  @crd-validation
  @bookinfo-app
  @gateway-api
  Scenario: KIA1502 validation
    Given user deletes k8sgateway named "foo" and the resource is no longer available
    And user deletes k8sgateway named "bar" and the resource is no longer available
    When there is a "foo" K8sGateway in the "bookinfo" namespace for "google.com" host using "HTTP" protocol on port "80" and "istio" gatewayClassName
    And there is a "bar" K8sGateway in the "bookinfo" namespace for "secondary.com" host using "HTTP" protocol on port "9080" and "istio" gatewayClassName
    And the "foo" K8sGateway in the "bookinfo" namespace has an address with a "Hostname" type and a "example.com" value
    And the "bar" K8sGateway in the "bookinfo" namespace has an address with a "Hostname" type and a "example.com" value
    When user selects the "bookinfo" project
    Then the "foo" "K8sGateway" of the "bookinfo" namespace should have a "warning" in ossmc
    And the "bar" "K8sGateway" of the "bookinfo" namespace should have a "warning" in ossmc

  # KIA1503 validation is not tested, as it is not possible to create a K8sGateway with duplicate listeners

  @crd-validation
  @bookinfo-app
  @gateway-api
  Scenario: KIA1504 validation
    Given user deletes k8sgateway named "foo" and the resource is no longer available
    When there is a "foo" K8sGateway in the "bookinfo" namespace for "google.com" host using "HTTP" protocol on port "80" and "nonexistentname" gatewayClassName
    And user selects the "bookinfo" project
    Then the "foo" "K8sGateway" of the "bookinfo" namespace should have a "danger" in ossmc

  @crd-validation
  @bookinfo-app
  @gateway-api
  Scenario: KIA1601 validation
    Given user deletes k8sreferencegrant named "foo" and the resource is no longer available
    When there is a "foo" K8sReferenceGrant in the "bookinfo" namespace pointing from "nonexistent" namespace
    And user selects the "bookinfo" project
    Then the "foo" "K8sReferenceGrant" of the "bookinfo" namespace should have a "danger" in ossmc

# TODO: KIA06xx and KIA07xx does not appear in Istio Config list page. They appear in Svc/workload lists.
#   Thus, these validations do not belong to this feature file.

# TODO: Apparently, Kiali does not trigger:
#   KIA0204, KIA0205, KIA0206, KIA0401, KIA0501
#   It is possible that under the current mTLS defaults these
#   validations may became obsolete and may never happen anymore.
#   Below, there are some Scenarios that were prepared to teset some of these chekers,
#   but they are "red", because of the non-triggering validation.
#   Also, KIA1108 is not triggering for some unknown reason.
#
#  @crd-validation
#  Scenario: KIA0204 validation
#    Given a "default" DestinationRule in the "istio-system" namespace for "*.local" host
#    And the DestinationRule enables mTLS
#    And a "default" DestinationRule in the "sleep" namespace for "default" host
#    And the DestinationRule has a "mysubset" subset for "app=sleep" labels
#    When user selects the "sleep" project
#    Then the "default" DestinationRule should have a "warning" in ossmc
#    And the "default" DestinationRule should have a "warning" in ossmc
#
#  @crd-validation
#  Scenario: KIA0401 validation
#    Given there is a "default" PeerAuthentication in the "istio-system" namespace
#    And the PeerAuthentication has "STRICT" mtls mode
#    When user selects the "istio-system" project
#    Then the "default" "PeerAuthentication" of the "istio-system" namespace should have a "danger" in ossmc
#
#  @crd-validation
#  Scenario: KIA0501 validation
#    Given there is a "default" PeerAuthentication in the "sleep" namespace
#    And the PeerAuthentication has "STRICT" mtls mode
#    When user selects the "sleep" project
#    Then the "default" "PeerAuthentication" of the "sleep" namespace should have a "danger" in ossmc
#
#  @crd-validation
#  Scenario: KIA1108 validation
#    Given there is a "foo" VirtualService in the "bookinfo" namespace with a "foo-route" http-route to host "reviews"
#    And the VirtualService applies to "reviews" hosts
#    And the VirtualService references "bookinfo-gateway.bookinfo.svc.cluster.local" gateways
#    Then the "foo" "VirtualService" of the "bookinfo" namespace should have a "warning" in ossmc
