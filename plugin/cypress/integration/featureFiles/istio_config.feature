@istio-config
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali Istio Config page

  On the Istio Config page, an admin should see all the Istio Config objects.
  The admin should be able to filter for the Istio Config objects they are looking for
  and create new Istio objects.

  Background:
    Given user is logged as administrator in OCP Console
    And user clicks on the Service Mesh icon in the left navigation bar
    And cypress intercept hooks for istio config are registered
    And user navigates to the OSSMC "Istio Config" page
    And user selects the "bookinfo" namespace

  @bookinfo-app
  Scenario: See all Istio Config objects in the bookinfo namespace.
    Then user sees all the Istio Config objects in the bookinfo namespace
    And user sees Name information for Istio objects
    And user sees Namespace information for Istio objects
    And user sees Type information for Istio objects
    And user sees Configuration information for Istio objects

  @bookinfo-app
  Scenario: Filter Istio Config objects by Istio Name
    When the user filters for "bookinfo-gateway"
    Then user only sees "bookinfo-gateway"

  @bookinfo-app
  Scenario: Ability to create an AuthorizationPolicy object
    Then the user can create a "authorizationPolicy" Istio object

  @bookinfo-app
  Scenario: Ability to create a Gateway object
    Then the user can create a "gateway" Istio object

  @gateway-api
  @bookinfo-app
  Scenario: Ability to create a K8sGateway object
    Then the user can create a "k8sGateway" K8s Istio object

  @gateway-api
  @bookinfo-app
  Scenario: Ability to create a K8sReferenceGrant object
    Then the user can create a "k8sReferenceGrant" K8s Istio object

  @bookinfo-app
  Scenario: Ability to create a PeerAuthentication object
    Then the user can create a "peerAuthentication" Istio object

  @bookinfo-app
  Scenario: Ability to create a RequestAuthentication object
    Then the user can create a "requestAuthentication" Istio object

  @bookinfo-app
  Scenario: Ability to create a ServiceEntry object
    Then the user can create a "serviceEntry" Istio object

  @bookinfo-app
  Scenario: Ability to create a Sidecar object
    Then the user can create a "sidecar" Istio object