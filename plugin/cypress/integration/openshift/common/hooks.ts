import { After, Before } from '@badeball/cypress-cucumber-preprocessor';

const install_demoapp = (demoapp: string): void => {
  let namespaces = 'bookinfo';
  let deletion = `--delete-${demoapp}`;
  let tg = '-tg';
  let istio = '-in istio-system';

  if (demoapp === 'error-rates') {
    namespaces = 'alpha beta gamma';
    deletion = '--delete';
    tg = '';
  } else if (demoapp === 'sleep') {
    namespaces = 'sleep';
    tg = '';
    istio = '';
  }

  const kialiHacksPath = '../_output/kiali/hack/istio';

  cy.exec(`../hack/download-hack-scripts.sh`, { failOnNonZeroExit: false, timeout: 120000 }).then(() => {
    cy.log(`Get status of ${demoapp} app:`);

    cy.exec(`${kialiHacksPath}/cypress/${demoapp}-status.sh`, { failOnNonZeroExit: false, timeout: 120000 }).then(
      result => {
        if (result.code === 0) {
          cy.log(`${demoapp} app is up and running`);
        } else {
          cy.log(`${demoapp} app is either broken or not present. Installing now.`);
          cy.log(`Detecting pod architecture.`);

          cy.exec(`${kialiHacksPath}/cypress/get-node-architecture.sh`, { failOnNonZeroExit: false }).then(result => {
            if (result.code === 0) {
              const arch: string = result.stdout;
              cy.log(`Removing old ${demoapp} installations.`);

              cy.exec(`${kialiHacksPath}/install-${demoapp}-demo.sh ${deletion} true`).then(() => {
                cy.log(`Installing new ${demoapp} app on ${arch} architecture.`);
                cy.log(`${kialiHacksPath}/install-${demoapp}-demo.sh ${tg} ${istio} -a ${arch}`);
                cy.exec(`${kialiHacksPath}/install-${demoapp}-demo.sh ${tg} ${istio} -a ${arch}`, {
                  timeout: 300000
                }).then(() => {
                  cy.log(`Waiting for ${demoapp} app to be ready.`);

                  cy.exec(`${kialiHacksPath}/wait-for-namespace.sh -n ${namespaces}`, { timeout: 400000 });
                });
              });
            } else {
              cy.log(
                `Different architectures on various nodes detected. Failed to install the ${demoapp} app using the Cypress hook.`
              );
            }
          });
        }
      }
    );
  });
};

Before({ tags: '@bookinfo-app' }, () => {
  install_demoapp('bookinfo');
});

Before({ tags: '@error-rates-app' }, () => {
  install_demoapp('error-rates');
});

Before({ tags: '@sleep-app' }, () => {
  install_demoapp('sleep');
});

After({ tags: '@sleep-app-scaleup-after' }, () => {
  cy.exec('kubectl scale -n sleep --replicas=1 deployment/sleep');
});

// remove resources created in the istio-system namespace to not influence istio instance after the test
After({ tags: '@clean-istio-namespace-resources-after' }, function () {
  cy.exec('kubectl -n istio-system delete PeerAuthentication default', { failOnNonZeroExit: false });
  cy.exec('kubectl -n istio-system delete Sidecar default', { failOnNonZeroExit: false });
});
