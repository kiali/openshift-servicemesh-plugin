@istio-config
@ossmc
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali Istio Config page

  On the Istio Config page, an admin should see all the Istio Config objects.
  The admin should be able to filter for the Istio Config objects they are looking for
  and create new Istio objects.

  Background:
    Given user is at administrator perspective
    And user is at the "istio" list page
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