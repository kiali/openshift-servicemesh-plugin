@install
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Install and enable OSSMC plugin in OpenShift
    
    Scenario: Verify oc command is available
        Then oc is present on the system

    Scenario: Prune OSSMC installation if any 
        Then uninstall OSSMC if it is installed

    Scenario: Execute OSSMC is installation
        Then Instruct the Kiali Operator to create a small OSSMConsole CR
    
    Scenario: Verify OSSMC is enabled
        Then wait for OSSMC to be ready
