import * as React from 'react';
import { style } from 'typestyle';
import { prettyProtocol, decoratedNodeData } from '@kiali/types';
import { EdgeContextMenuProps } from '../CytoscapeContextMenu';
import { getTitle } from '../../../pages/Graph/SummaryPanelCommon';
import { renderBadgedName } from '../../../pages/Graph/SummaryLink';
import { EdgeSingular } from 'cytoscape';

const contextMenu = style({
  fontSize: 'var(--graph-side-panel--font-size)',
  textAlign: 'left'
});

export class EdgeContextMenu extends React.PureComponent<EdgeContextMenuProps> {
  render() {
    return (
      <div className={contextMenu}>
        {getTitle(`Edge (${prettyProtocol(this.props.protocol)})`)}
        {renderBadgedName(decoratedNodeData((this.props.element as EdgeSingular).source()), 'From:  ')}
        {renderBadgedName(decoratedNodeData((this.props.element as EdgeSingular).target()), 'To:        ')}
      </div>
    );
  }
}
