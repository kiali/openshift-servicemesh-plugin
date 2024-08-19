@workloads
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Kiali workloads integration with OCP Console

    Verify that the Service mesh tabs are visible in OCP Console under Workloads > Deployments section in the bookinfo namespace

    Background:
        Given user is logged as administrator in OCP Console
        And cypress intercept hooks for workloads are registered
<<<<<<< HEAD:plugin/cypress/integration/featureFiles/workloads_deployments.feature
        And user navigates to the "kiali" deployment details page in the namespace "istio-system"
=======
        And user navigates to the "productpage-v1" deployment details page in the "bookinfo" namespace
>>>>>>> 1fa41e4 (Run Kiali tests in OSSMC):plugin/cypress/integration/openshift/featureFiles/workloads_deployments.feature
        And user clicks on Service Mesh tab in horizontal nav

    @bookinfo-app
    Scenario: Verify that content of the Overview tab is correct
        When user clicks tab with "Overview" button
        Then user is able to see the WorkloadDescriptionCard with "productpage-v1" Workload

    Scenario: Verify that content of the Traffic tab is correct
        When user clicks tab with "Traffic" button

    Scenario: Verify that content of the Logs tab is correct
        When user clicks tab with "Logs" button
        Then "productpage-v1" container is selected

    Scenario: Verify that content of the Inbound Metrics tab is correct
        When user clicks tab with "Inbound Metrics" button
        Then user sees "Metrics Settings" dropdown

    Scenario: Verify that content of the Outbound Metrics tab is correct
        When user clicks tab with "Outbound Metrics" button
        Then user sees "Metrics Settings" dropdown

    Scenario: Verify that content of the Traces tab is correct
        When user clicks tab with "Traces" button
        Then user sees "Display" dropdown

    Scenario: Verify that content of the Envoy tab is correct
        When user clicks tab with "Envoy" button
        Then user sees "Envoy" dropdown
        

