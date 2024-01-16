@uninstall
# don't change first line of this file - the tag is used for the test scripts to identify the test suite

Feature: Uninstall OSSMC plugin in OpenShift and all attached resources 

    Scenario: run uninstallation scripts to clean OSSMC resources
        When validate OSSMC custom resource by a script
        Then uninstallation scripts to clean OSSMC resources is successful