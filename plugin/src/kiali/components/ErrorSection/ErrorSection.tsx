import * as React from 'react';
import { kialiStyle } from 'styles/StyleUtils';
import { EmptyState, EmptyStateBody, EmptyStateVariant, Title, TitleSizes } from '@patternfly/react-core';
import { ErrorMsg } from '../../types/ErrorMsg';

interface MessageProps {
  error: ErrorMsg;
}

const errorSectionStyle = kialiStyle({
  height: '80vh'
});

export class ErrorSection extends React.Component<MessageProps> {
  render() {
    return (
      <div>
        <EmptyState id="empty-page-error" variant={EmptyStateVariant.large} className={errorSectionStyle}>
          <Title headingLevel="h5" size={TitleSizes.lg}>
            {this.props.error.title}
          </Title>
          <EmptyStateBody>{this.props.error.description}</EmptyStateBody>
        </EmptyState>
      </div>
    );
  }
}
