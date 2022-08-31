import * as React from 'react';
import {IstioLevelToSeverity, ObjectCheck, ValidationMessage, ValidationTypes} from '../../types/IstioObjects';
import {Flex, FlexItem, Stack, StackItem, Title, TitleSizes} from '@patternfly/react-core';

interface Props {
  messages?: ValidationMessage[];
  checks?: ObjectCheck[];
}

class IstioStatusMessageList extends React.Component<Props> {
  render() {
    return (
      <>
        <Stack>
          <StackItem>
            <Title headingLevel="h4" size={TitleSizes.lg} style={{ paddingBottom: '10px' }}>
              Configuration Analysis
            </Title>
          </StackItem>
          {(this.props.messages || []).map((msg: ValidationMessage, i: number) => {
            const severity: ValidationTypes = IstioLevelToSeverity[msg.level || 'UNKNOWN'];
            return (
              <StackItem id={'msg-' + i} className={'validation-message'}>
                <Flex>
                  <FlexItem>
                    ${severity}
                  </FlexItem>
                  <FlexItem>
                    <a href={msg.documentationUrl} target="_blank" rel="noopener noreferrer">
                      {msg.type.code}
                    </a>
                    {msg.description ? ': ' + msg.description : undefined}
                  </FlexItem>
                </Flex>
              </StackItem>
            );
          })}
          <Stack>
            {(this.props.checks || []).map((check, index) => {
              const severity: ValidationTypes = IstioLevelToSeverity[check.severity.toUpperCase() || 'UNKNOWN'];
              return (
                <StackItem id={'valid_msg-' + index} className={'validation-message'}>
                  <Flex>
                    <FlexItem>
                      {severity}
                    </FlexItem>
                    <FlexItem>
                      {check.code}
                    </FlexItem>
                    {check.message}
                  </Flex>

                </StackItem>
              );
            })}
          </Stack>
        </Stack>
      </>
    );
  }
}

export default IstioStatusMessageList;
