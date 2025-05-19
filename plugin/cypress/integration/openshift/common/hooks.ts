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
  } else if (demoapp === 'loggers') {
    namespaces = 'loggers';
    tg = '';
    istio = '';
    deletion = '--delete';
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

Before(() => {
  // This prevents cypress from stopping on errors unrelated to the tests.
  // There can be random failures due timeouts/loadtime/framework that throw browser errors.  This
  // prevents a CI failure due something like a "slow".  There may be a better way to handle this.
  cy.on('uncaught:exception', (err, _runnable, promise) => {
    // when the exception originated from an unhandled promise
    // rejection, the promise is provided as a third argument
    // you can turn off failing the test in this case
    if (promise || err.message.includes('MobX')) {
      return false;
    }
    // we still want to ensure there are no other unexpected
    // errors, so we let them fail the test
  });
});

Before({ tags: '@bookinfo-app' }, () => {
  install_demoapp('bookinfo');
});

Before({ tags: '@error-rates-app' }, () => {
  install_demoapp('error-rates');
});

Before({ tags: '@sleep-app' }, () => {
  install_demoapp('sleep');
});

Before({ tags: '@loggers-app' }, () => {
  install_demoapp('loggers');
});

After({ tags: '@sleep-app-scaleup-after' }, () => {
  cy.exec('kubectl scale -n sleep --replicas=1 deployment/sleep');
});

// remove resources created in the istio-system namespace to not influence istio instance after the test
After({ tags: '@clean-istio-namespace-resources-after' }, function () {
  cy.exec('kubectl -n istio-system delete PeerAuthentication default', { failOnNonZeroExit: false });
  cy.exec('kubectl -n istio-system delete Sidecar default', { failOnNonZeroExit: false });
});

Before({ tags: '@shared-mesh-config' }, () => {
  cy.exec('kubectl apply -f cypress/integration/common/data/istio-shared-mesh-configmap.yaml');
  const patch = '{"spec": {"values": {"pilot": {"env": {"SHARED_MESH_CONFIG": "istio-user"}}}}}';
  cy.exec(`kubectl patch istio default --type='merge' -p '${patch}'`).then(() => {
    const maxTries = 10;
    let tries = 0;
    const doRequest = (): void => {
      if (tries > maxTries) {
        throw new Error('Timed out waiting for Kiali to see the Shared Mesh Config');
      }

      tries++;
      cy.request('GET', '/api/mesh/graph').then(response => {
        expect(response.status).to.equal(200);
        console.log(response.body.elements.nodes.find(node => node.data.infraType === 'istiod'));
        if (
          response.body.elements.nodes.find(node => node.data.infraType === 'istiod')?.data?.infraData?.config
            ?.sharedConfig === undefined
        ) {
          cy.log(`Kiali has not seen the Shared Mesh Config yet. Tries: ${tries}. Waiting 3s...`);
          cy.wait(3000);
          doRequest();
        }
      });
    };

    doRequest();
  });
});

After({ tags: '@shared-mesh-config' }, () => {
  cy.exec('kubectl delete -f cypress/integration/common/data/istio-shared-mesh-configmap.yaml');
  const patch = '{"spec": {"values": {"pilot": {"env": {"SHARED_MESH_CONFIG": null}}}}}';
  cy.exec(`kubectl patch istio default --type='merge' -p '${patch}'`);
});
