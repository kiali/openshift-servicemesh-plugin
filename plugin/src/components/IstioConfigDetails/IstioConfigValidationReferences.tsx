import { Stack, StackItem, Title, TitleSizes } from '@patternfly/react-core';
import * as React from 'react';
import { ObjectReference } from '../../types/IstioObjects';

interface IstioConfigReferencesProps {
  objectReferences: ObjectReference[];
}

class IstioConfigValidationReferences extends React.Component<IstioConfigReferencesProps> {
  render() {
    return (
      <Stack>
        <StackItem>
          <Title headingLevel="h5" size={TitleSizes.lg} style={{ paddingBottom: '10px' }}>
            Validation References
          </Title>
        </StackItem>

        {this.props.objectReferences &&
          this.props.objectReferences.map(reference => {
            return (
              <StackItem>
                {reference.objectType}:{reference.name}/{reference.namespace}
              </StackItem>
            );
          })}
      </Stack>
    );
  }
}

export default IstioConfigValidationReferences;
