import * as React from 'react';
import { connect } from 'react-redux';
import { KialiAppState } from 'store/Store';
import { NotificationGroup, NotificationMessage } from 'types/NotificationCenter';
import { KialiDispatch } from 'types/Redux';
import { NotificationCenterActions } from 'actions/NotificationCenterActions';
import { NotificationAlerts as KialiNotificationAlerts } from 'components/NotificationCenter/NotificationAlerts';

type ReduxStateProps = {
  alerts: NotificationMessage[];
};

type ReduxDispatchProps = {
  onDismissNotification: (message: NotificationMessage, userDismissed: boolean) => void;
};

type NotificationAlertsProps = ReduxStateProps & ReduxDispatchProps;

/**
 * OSSMC-specific wrapper for Kiali's NotificationAlerts component.
 * This component reuses the existing NotificationAlerts component but provides
 * the Redux connection needed for OSSMC since the full Navigation component
 * (which includes NotificationCenterBadge) is not used in OSSMC.
 */
export const NotificationAlertsComponent: React.FC<NotificationAlertsProps> = (props: NotificationAlertsProps) => {
  // Reuse the existing Kiali NotificationAlerts component with the proper props
  return <KialiNotificationAlerts alerts={props.alerts} onDismiss={props.onDismissNotification} />;
};

const mapStateToProps = (state: KialiAppState): ReduxStateProps => {
  // Reuse the exact same logic as Kiali NotificationCenterBadge to ensure consistency
  return state.notificationCenter.groups
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
      (result: { alerts: NotificationMessage[] }, message: NotificationMessage) => {
        if (message.isAlert) {
          result.alerts.push(message);
        }
        return result;
      },
      { alerts: [] }
    );
};

const mapDispatchToProps = (dispatch: KialiDispatch): ReduxDispatchProps => {
  return {
    onDismissNotification: (message, userDismissed) => {
      if (userDismissed) {
        dispatch(NotificationCenterActions.markAsRead(message.id));
      } else {
        dispatch(NotificationCenterActions.hideNotification(message.id));
      }
    }
  };
};

export const NotificationAlerts = connect(mapStateToProps, mapDispatchToProps)(NotificationAlertsComponent);
