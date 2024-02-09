@install
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Install and enable OSSMC plugin in OpenShift
    
    Scenario: Verify oc command is available
        Then oc is present on the system

    Scenario: Prune OSSMC installation if any 
        Then uninstall OSSMC if it is installed

    Scenario: Execute OSSMC is installation
        Then instruct the Kiali Operator to create a small OSSMConsole CR
    
    Scenario: Verify that OSSMC is ready to use
        Then wait for OSSMC to be ready

    Scenario: Validate OSSMC custom resourceces 
        Then validate OSSMC custom resource by a script
