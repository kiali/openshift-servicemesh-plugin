import { Stack, StackItem, Title, TitleSizes } from '@patternfly/react-core';
import * as React from 'react';
import { ObjectReference } from '../../types/IstioObjects';

interface IstioConfigReferencesProps {
  objectReferences: ObjectReference[];
}

class IstioConfigReferences extends React.Component<IstioConfigReferencesProps> {
  objectReferencesExists = (): boolean => {
    if (this.props.objectReferences && this.props.objectReferences.length > 0) {
      return true;
    }
    return false;
  };

  render() {
    return (
      <Stack>
        <StackItem>
          <Title headingLevel="h5" size={TitleSizes.lg} style={{ paddingBottom: '10px' }}>
            References
          </Title>
        </StackItem>
        {!this.objectReferencesExists() && (
          <StackItem>No references found for this object.</StackItem>
        )}
        {this.objectReferencesExists() &&
          this.props.objectReferences.map(reference => {
            return (
              <StackItem>
                  {reference.objectType}:namespace={reference.namespace}/{reference.name}
              </StackItem>
            );
          })}
      </Stack>
    );
  }
}

export default IstioConfigReferences;
