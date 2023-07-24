import * as React from 'react';
import { connect } from 'react-redux';
import { NotificationList } from './NotificationList';
import { kialiStyle } from 'styles/StyleUtils';
import { NotificationMessage, NotificationGroup } from '../../types/MessageCenter';
import { AlertDrawer } from './AlertDrawer';
import { KialiAppState } from 'store/Store';
import { KialiDispatch } from 'types/Redux';
import { MessageCenterActions } from 'actions/MessageCenterActions';

const notificationStyle = kialiStyle({
  position: 'relative',
  zIndex: 500
});

type ReduxProps = {
  groups: NotificationGroup[];

  onDismissNotification: (message: NotificationMessage, userDismissed: boolean) => void;
};

type MessageCenterProps = ReduxProps & {
  drawerTitle: string;
};

export class MessageCenterComponent extends React.Component<MessageCenterProps> {
  // Get messages that are meant to be show as notifications (Toast), appending
  // the groupId to allow to recognize the group they belong. (see onDismissNotification)
  getNotificationMessages = (groups: NotificationGroup[]) => {
    return groups.reduce((messages: NotificationMessage[], group) => {
      return messages.concat(
        group.messages
          .filter((message: NotificationMessage) => message.show_notification)
          .map((message: NotificationMessage) => ({ ...message, groupId: group.id }))
      );
    }, []);
  };

  render() {
    return (
      <div className={notificationStyle}>
        <AlertDrawer title={this.props.drawerTitle} />
        <NotificationList
          messages={this.getNotificationMessages(this.props.groups)}
          onDismiss={this.props.onDismissNotification}
        />
      </div>
    );
  }
}

const mapStateToProps = (state: KialiAppState) => {
  return {
    groups: state.messageCenter.groups
  };
};

const mapDispatchToProps = (dispatch: KialiDispatch) => {
  return {
    onDismissNotification: (message, userDismissed) => {
      if (userDismissed) {
        dispatch(MessageCenterActions.markAsRead(message.id));
      } else {
        dispatch(MessageCenterActions.hideNotification(message.id));
      }
    }
  };
};

export const MessageCenter = connect(mapStateToProps, mapDispatchToProps)(MessageCenterComponent);
