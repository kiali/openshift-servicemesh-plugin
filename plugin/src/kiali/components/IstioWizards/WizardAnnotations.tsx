import * as React from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  List,
  ListItem,
  Modal,
  ModalVariant,
  TextInput,
  Title,
  TitleSizes
} from '@patternfly/react-core';
import { TableComposable, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { KialiIcon } from 'config/KialiIcon';

interface Props {
  annotations: { [key: string]: string };
  onChange: (annotations) => void;
  onClose: () => void;
  showAnotationsWizard: boolean;
  canEdit: boolean;
}

interface State {
  annotations: Map<number, [string, string]>;
  validation: string[];
}

class WizardAnnotations extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { annotations: this.convertAnnotationsToMap(), validation: [] };
  }

  componentDidUpdate(prevProps: Readonly<Props>): void {
    if (
      prevProps.annotations !== this.props.annotations &&
      prevProps.showAnotationsWizard !== this.props.showAnotationsWizard
    ) {
      this.onClear();
    }
  }

  convertAnnotationsToMap = () => {
    const m = new Map();
    Object.keys(this.props.annotations || {}).map((value, index) =>
      m.set(index, [value, this.props.annotations[value]])
    );
    return m;
  };

  removeAnnotation = (k: number) => {
    const annotations = this.state.annotations;
    annotations.delete(k);
    this.setState({ annotations });
  };

  changeAnnotation = (value: [string, string], k: number) => {
    const annotations = this.state.annotations;
    annotations.set(k, value);
    this.setState({ annotations });
  };

  validate = (): boolean => {
    const validation: string[] = [];
    // Check if duplicate keys
    if (
      Array.from(this.state.annotations.values())
        .map(k => k[0])
        .some((e, i, arr) => arr.indexOf(e) !== i)
    ) {
      validation.push('Duplicate keys found.');
    }
    // Check if empty keys
    if (
      Array.from(this.state.annotations.values())
        .map(k => k[0])
        .filter(e => e.length === 0).length > 0
    ) {
      validation.push('Empty keys found.');
    }
    // Check if empty values
    if (
      Array.from(this.state.annotations.values())
        .map(k => k[1])
        .filter(e => e.length === 0).length > 0
    ) {
      validation.push('Empty values found.');
    }
    this.setState({ validation });
    return validation.length === 0 ? true : false;
  };

  onChange = () => {
    if (this.validate()) {
      const annotates: { [key: string]: string } = {};
      Array.from(this.state.annotations.values()).map(element => (annotates[element[0]] = element[1]));
      this.props.onChange(annotates);
    }
  };

  onClose = () => {
    this.setState({ annotations: this.convertAnnotationsToMap(), validation: [] }, () => this.props.onClose());
  };

  onClear = () => {
    this.setState({ annotations: this.convertAnnotationsToMap(), validation: [] });
  };

  generateInput = (): JSX.Element[] => {
    const rows: JSX.Element[] = [];
    Array.from(this.state.annotations.entries()).map(([index, [key, value]]: [number, [string, string]]) =>
      rows.push(
        this.props.canEdit ? (
          <Tr key={'edit_annotation_for_' + index}>
            <Th width={40}>
              <TextInput
                aria-invalid={
                  key === '' || Object.values(this.state.annotations).filter(arr => arr[0] === key).length > 1
                }
                id={'annotationInputForKey_' + index}
                onChange={newKey => this.changeAnnotation([newKey, value], index)}
                placeholder={'Key'}
                type="text"
                value={key}
              />
            </Th>
            <Th width={40}>
              <TextInput
                aria-invalid={value === ''}
                id={'annotationInputForValue_' + index}
                onChange={v => this.changeAnnotation([key, v], index)}
                placeholder={'Value'}
                type="text"
                value={value}
              />
            </Th>
            <Th>
              <Button variant={'plain'} icon={<KialiIcon.Delete />} onClick={() => this.removeAnnotation(index)} />
            </Th>
          </Tr>
        ) : (
          <Tr>
            <Th>{key}</Th>
            <Th>{value}</Th>
          </Tr>
        )
      )
    );
    return rows;
  };

  addMore = () => {
    const annotations = this.state.annotations;
    annotations.set(annotations.size, ['', '']);
    this.setState({ annotations });
  };

  render() {
    const header = (
      <>
        <Title id="modal-custom-header-label" headingLevel="h1" size={TitleSizes['2xl']}>
          {this.props.canEdit ? 'Edit ' : 'View '}annotations
        </Title>
      </>
    );
    const footer = (
      <ActionGroup>
        <Button variant="primary" isDisabled={!this.props.canEdit} onClick={this.onChange}>
          Save
        </Button>
        {this.props.canEdit && (
          <Button variant="link" onClick={this.onClear}>
            Clear
          </Button>
        )}
        <Button variant="link" onClick={this.onClose}>
          Cancel
        </Button>
      </ActionGroup>
    );

    return (
      <>
        <Modal
          variant={ModalVariant.large}
          isOpen={this.props.showAnotationsWizard}
          onClose={this.onClose}
          header={header}
          aria-labelledby="modal-custom-header-label"
          aria-describedby="modal-custom-header-description"
          footer={footer}
        >
          <TableComposable variant={'compact'}>
            <Thead>
              <Tr>
                <Th>Key</Th>
                <Th>Value</Th>
                {this.props.canEdit && <Th></Th>}
              </Tr>
            </Thead>
            <Tbody>{this.generateInput()}</Tbody>
          </TableComposable>
          <Button
            variant="link"
            icon={<KialiIcon.AddMore />}
            onClick={() => {
              this.addMore();
            }}
          >
            Add more
          </Button>
          {this.state.validation.length > 0 && (
            <Alert variant="danger" isInline isExpandable title="An error occurred">
              <List isPlain>
                {this.state.validation.map((message, i) => (
                  <ListItem key={'Message_' + i}>{message}</ListItem>
                ))}
              </List>
            </Alert>
          )}
        </Modal>
      </>
    );
  }
}
export default WizardAnnotations;
