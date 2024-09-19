@smoke
@ossmc
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali sidebar integration with OCP Console

  Verify that the Kiali plugin is loaded and working in OCP Console

  Background:
    Given user is at administrator perspective
    And user is at the dashboard page
    And user clicks on the Service Mesh icon in the left navigation bar
    And cypress intercept hooks for sidebar are registered

  Scenario: Service mesh buttons are displayed
    Then buttons for Overview, Graph and Istio Config are displayed

  Scenario: Overview page is displayed correctly
    When user navigates to the OSSMC "Overview" page
    Then user sees istio-system overview card

  @bookinfo-app
  Scenario: Graph page is displayed correctly
    When user navigates to the OSSMC "Graph" page
    And user selects the "bookinfo" namespace in the graph
    Then user sees the "bookinfo" graph summary

  Scenario: Istio Config page is displayed correctly
    When user navigates to the OSSMC "Istio Config" page
    Then user sees Istio Config page elements from Kiali

  Scenario: Mesh page is displayed correctly
    When user navigates to the OSSMC "Mesh" page
    Then user sees the mesh side panel
