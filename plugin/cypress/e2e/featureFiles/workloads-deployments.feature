@workloads
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali workloads integration with OCP Console

    Verify that the Service mesh tabs are visible in OCP Console under Workloads > Deployments section in istio-system namespace

    Background:
        Given user is logged as administrator in OCP Console
        And cypress intercept hooks for workloads are registered
        And user navigates into "k8s/ns/istio-system/deployments/kiali" page
        And user clicks on Service Mesh tab in horizontal nav

    Scenario: Verify that content of the Overview tab is correct
        When user clicks tab with "Overview" button
        Then user is able to see WorkloadDescriptionCard with Kiali Workload

    Scenario: Verify that content of the Traffic tab is correct
        Then user clicks tab with "Traffic" button

    Scenario: Verify that content of the Logs tab is correct
        When user clicks tab with "Logs" button
        Then Kiali container is selected

    Scenario: Verify that content of the Inbound Metrics tab is correct
        When user clicks tab with "Inbound Metrics" button
        Then user sees "Metrics Settings" dropdown

    Scenario: Verify that content of the Outbound Metrics tab is correct
        When user clicks tab with "Outbound Metrics" button
        Then user sees "Metrics Settings" dropdown

    Scenario: Verify that content of the Traces tab is correct
        When user clicks tab with "Traces" button
        Then user sees "Display" dropdown

    Scenario: Verify that content of the Go Metrics tab is correct
        When user clicks tab with "Go Metrics" button
        Then user sees "Metrics Settings" dropdown

    Scenario: Verify that content of the Kiali Internal Metrics tab is correct
        When user clicks tab with "Kiali Internal Metrics" button
        Then user sees "Metrics Settings" dropdown
        

