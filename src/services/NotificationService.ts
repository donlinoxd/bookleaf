import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const NotificationService = {
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('library', {
        name: 'Library Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  async scheduleDueReminder(borrowingId: number, bookTitle: string, dueDate: Date): Promise<void> {
    // 1-day-before reminder at 9:00 AM
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - 1);
    reminderDate.setHours(9, 0, 0, 0);

    if (reminderDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `due-reminder-${borrowingId}`,
        content: {
          title: 'Due Tomorrow',
          body: `"${bookTitle}" is due tomorrow. Please return it to avoid fines.`,
          data: { borrowingId, type: 'due_reminder' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
      });
    }

    // Due-day notice at 9:00 AM
    const dueDayDate = new Date(dueDate);
    dueDayDate.setHours(9, 0, 0, 0);
    if (dueDayDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `due-today-${borrowingId}`,
        content: {
          title: 'Due Today',
          body: `"${bookTitle}" is due today. Return it by end of day to avoid a fine.`,
          data: { borrowingId, type: 'due_today' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dueDayDate },
      });
    }
  },

  async cancelDueReminder(borrowingId: number): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(`due-reminder-${borrowingId}`);
    await Notifications.cancelScheduledNotificationAsync(`due-today-${borrowingId}`);
  },

  async notifyReservationAvailable(bookTitle: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hold Available',
        body: `"${bookTitle}" is now available for pickup. Please collect it soon.`,
        data: { type: 'reservation_available' },
      },
      trigger: null, // immediate
    });
  },
};
