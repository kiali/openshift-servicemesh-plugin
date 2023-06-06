import { CytoscapeGlobalScratchData, CytoscapeGlobalScratchNamespace, Layout, LayoutDictionary } from '@kiali/types';
import * as Cy from 'cytoscape';
import { GraphStyles } from './graphs/GraphStyles';

// IMPORTANT! Layouts should be performed while zoom-handling is being ignored:
//   - call cy.emit('kiali-zoomignore', [true]) at some point prior to this call
//   - call cy.emit('kiali-zoomignore', [false]) in the promise handler
export const runLayout = (cy: Cy.Core, layout: Layout, namespaceLayout: Layout): Promise<any> => {
  // generate all labels so the layout algorithm can take them into consideration
  refreshLabels(cy, true);

  const layoutOptions = LayoutDictionary.getLayout(layout);
  let promise: Promise<any>;
  let cyLayout: Cy.Layouts;
  if (cy.nodes('$node > node').length > 0) {
    // if there is any parent (i.e. box) node, run the box-layout
    cyLayout = cy.layout({
      ...layoutOptions,
      name: 'box-layout',
      appBoxLayout: namespaceLayout.name, // app and namespace will share same layout
      namespaceBoxLayout: namespaceLayout.name,
      defaultLayout: layout.name
    });
  } else {
    cyLayout = cy.layout(layoutOptions);
  }
  promise = cyLayout.promiseOn('layoutstop');
  cyLayout.run();
  return promise;
};

// This should be called to ensure labels are up to date on-screen.  It may be needed to ensure cytoscape
// displays up-to-date labels, even if the label content has not changed.
// Note: the leaf-to-root approach here should mirror what is done in GraphStyles.ts#htmlNodeLabels()
export const refreshLabels = (cy: Cy.Core, force: boolean) => {
  const scratch = cy.scratch(CytoscapeGlobalScratchNamespace);
  if (force) {
    if (scratch) {
      cy.scratch(CytoscapeGlobalScratchNamespace, { ...scratch, forceLabels: true } as CytoscapeGlobalScratchData);
    }
  }

  // update labels from leaf to node (i.e. inside out with respect to nested boxing).  This (in theory) ensures
  // that outer nodes will always be able to incorporate inner nodes' true bounding-box (one adjusted for the label).
  let nodes = cy.nodes('[^isBox]:visible');
  while (nodes.length > 0) {
    (cy as any).nodeHtmlLabel().updateNodeLabel(nodes);
    nodes = nodes.parents();
  }

  cy.edges().each(e => {
    e.data('label', GraphStyles.getEdgeLabel(e, e.selected()));
  });

  if (force) {
    if (scratch) {
      cy.scratch(CytoscapeGlobalScratchNamespace, { ...scratch, forceLabels: false } as CytoscapeGlobalScratchData);
    }
  }
};
