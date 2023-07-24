import * as React from 'react';
import { KialiDispatch } from 'types/Redux';
import { connect } from 'react-redux';
import { Badge, Button, ButtonVariant } from '@patternfly/react-core';
import { KialiAppState } from '../../store/Store';
import { MessageType, NotificationGroup, NotificationMessage } from '../../types/MessageCenter';
import { MessageCenterThunkActions } from '../../actions/MessageCenterThunkActions';
import { KialiIcon } from 'config/KialiIcon';
import { kialiStyle } from 'styles/StyleUtils';

type PropsType = {
  newMessagesCount: number;
  systemErrorsCount: number;
  badgeDanger: boolean;
  toggleMessageCenter: () => void;
  toggleSystemErrorsCenter: () => void;
};

const systemErrorCountStyle = kialiStyle({
  marginRight: '0.3em',
  paddingTop: '0.1em'
});

class MessageCenterTriggerComponent extends React.PureComponent<PropsType, {}> {
  render() {
    return (
      <>
        {this.renderSystemErrorBadge()}
        {this.renderMessageCenterBadge()}
      </>
    );
  }

  private renderSystemErrorBadge = () => {
    if (this.props.systemErrorsCount === 0) {
      return null;
    }

    return (
      <Button
        id={'icon_warning'}
        aria-label={'SystemError'}
        onClick={this.props.toggleSystemErrorsCenter}
        variant={ButtonVariant.plain}
      >
        <KialiIcon.Warning className={systemErrorCountStyle} />
        {this.props.systemErrorsCount}
        {this.props.systemErrorsCount === 1 ? ' Open Issue' : ' Open Issues'}
      </Button>
    );
  };

  private renderMessageCenterBadge = () => {
    const bell = kialiStyle({
      position: 'relative',
      right: '5px',
      top: '2px'
    });
    const count = kialiStyle({
      position: 'relative',
      top: '2px',
      verticalAlign: '0.125em'
    });

    return (
      <Button
        id={'bell_icon_warning'}
        aria-label={'Notifications'}
        onClick={this.props.toggleMessageCenter}
        variant={ButtonVariant.plain}
      >
        <KialiIcon.Bell className={bell} />
        {this.props.newMessagesCount > 0 && (
          <Badge className={`${count} ${this.props.badgeDanger ? ' badge-danger' : ''}`}>
            {this.props.newMessagesCount > 0 ? this.props.newMessagesCount : ' '}
          </Badge>
        )}
      </Button>
    );
  };
}

const mapStateToPropsMessageCenterTrigger = (state: KialiAppState) => {
  type MessageCenterTriggerPropsToMap = {
    newMessagesCount: number;
    badgeDanger: boolean;
    systemErrorsCount: number;
  };

  const dangerousMessageTypes = [MessageType.ERROR, MessageType.WARNING];
  let systemErrorsCount = 0;

  const systemErrorsGroup = state.messageCenter.groups.find(item => item.id === 'systemErrors');
  if (systemErrorsGroup) {
    systemErrorsCount = systemErrorsGroup.messages.length;
  }

  return state.messageCenter.groups
    .reduce((unreadMessages: NotificationMessage[], group: NotificationGroup) => {
      return unreadMessages.concat(
        group.messages.reduce((unreadMessagesInGroup: NotificationMessage[], message: NotificationMessage) => {
          if (!message.seen) {
            unreadMessagesInGroup.push(message);
          }
          return unreadMessagesInGroup;
        }, [])
      );
    }, [])
    .reduce(
      (propsToMap: MessageCenterTriggerPropsToMap, message: NotificationMessage) => {
        propsToMap.newMessagesCount++;
        propsToMap.badgeDanger = propsToMap.badgeDanger || dangerousMessageTypes.includes(message.type);
        return propsToMap;
      },
      { newMessagesCount: 0, systemErrorsCount: systemErrorsCount, badgeDanger: false }
    );
};

const mapDispatchToPropsMessageCenterTrigger = (dispatch: KialiDispatch) => {
  return {
    toggleMessageCenter: () => dispatch(MessageCenterThunkActions.toggleMessageCenter()),
    toggleSystemErrorsCenter: () => dispatch(MessageCenterThunkActions.toggleSystemErrorsCenter())
  };
};

export const MessageCenterTrigger = connect(
  mapStateToPropsMessageCenterTrigger,
  mapDispatchToPropsMessageCenterTrigger
)(MessageCenterTriggerComponent);
