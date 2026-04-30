@smoke
@ossmc
@core-1
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali sidebar integration with OCP Console

  Verify that the Kiali plugin is loaded and working in OCP Console

  Background:
    Given user is at administrator perspective
    And user is at the dashboard page
    And user clicks on the Service Mesh icon in the left navigation bar
    And cypress intercept hooks for sidebar are registered

  Scenario: Service mesh buttons are displayed
    Then Service Mesh buttons are displayed

  Scenario: Overview page is displayed correctly
    When user navigates to the OSSMC "Overview" page
    Then user sees the overview cards

  @bookinfo-app
  Scenario: Graph page is displayed correctly
    When user navigates to the OSSMC "Traffic Graph" page
    And user selects the "bookinfo" namespace
    Then user sees the "bookinfo" traffic graph

  Scenario: Mesh page is displayed correctly
    When user navigates to the OSSMC "Mesh" page
    Then user sees the mesh side panel

  Scenario: Namespaces page is displayed correctly
    When user navigates to the OSSMC "Namespaces" page
    Then user sees the namespaces list

  @bookinfo-app
  Scenario: Applications page is displayed correctly
    When user navigates to the OSSMC "Applications" page
    And user selects the "bookinfo" namespace
    Then user sees the applications list

  Scenario: Istio Config page is displayed correctly
    When user navigates to the OSSMC "Istio Config" page
    And user selects the "bookinfo" namespace
    Then user sees Istio Config list
