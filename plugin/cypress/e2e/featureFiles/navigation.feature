@smoke
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali integration with OCP Console

  Verify that the Kiali plugin is loaded and working in OCP Console

  Background:
    Given user is logged as administrator in OCP Console
    And user clicks on the Service Mesh icon in the left navigation bar

  Scenario: Service mesh buttons are displayed
    Then buttons for Overview, Graph and Istio Config are displayed

  Scenario: Overview page is displayed correctly
    When user is redirected to the OSSMC "Overview" page
    Then user sees Overview page elements from Kiali

  Scenario: Graph page is displayed correctly
    When user is redirected to the OSSMC "Graph" page
    Then user sees Graph page elements from Kiali

  Scenario: Istio Config page is displayed correctly
    When user is redirected to the OSSMC "Istio Config" page
    Then user sees Istio Config page elements from Kiali

