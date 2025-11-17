import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Note: This app uses LOCAL notifications only (supported in Expo Go)
// Remote/push notifications require development builds or Firebase Cloud Messaging
// See: https://docs.expo.dev/develop/development-builds/introduction/

// Map to track active notification timers
const activeNotifications = new Map();

// Configure notification behavior (wrapped to avoid SDK 53+ issues in Expo Go)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (error) {
  console.warn('Notification handler setup skipped (Expo Go limitation):', error.message);
}

/**
 * IMPORTANT: Limitations in Expo Development
 * 
 * Notifications scheduled with setTimeout only work while app is running.
 * In Expo Go, background notification delivery requires:
 * 1. Firebase Cloud Messaging (FCM) for backend scheduling
 * 2. Or Native push notification service (APNs/FCM)
 * 
 * Current implementation:
 * - Works perfectly when app is open (foreground notifications)
 * - Persists notification data to reschedule when app reopens
 * - Suitable for Expo development/testing
 * 
 * For production:
 * - Migrate to Firebase Cloud Messaging
 * - Use native push notification services
 * - Backend will handle scheduling while app is closed
 */

/**
 * Request notification permissions from the user
 */
export const requestNotificationPermissions = async () => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    console.log('Notification permission status:', status);
    if (status !== 'granted') {
      console.warn('Notification permissions not granted');
      return false;
    }
    console.log('Notification permissions granted');
    
    // Do NOT restore notifications on startup
    // Only real reminders from Firestore will be scheduled when user navigates to Reminders screen
    
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

/**
 * Store pending notification to AsyncStorage for persistence across app closures
 */
const storePendingNotification = async (notification) => {
  try {
    const stored = await AsyncStorage.getItem('pending_notifications');
    const notifications = stored ? JSON.parse(stored) : [];
    
    // Remove if already exists (update)
    const filtered = notifications.filter(n => n.reminderId !== notification.reminderId);
    filtered.push(notification);
    
    await AsyncStorage.setItem('pending_notifications', JSON.stringify(filtered));
    console.log('💾 Stored pending notification:', notification.reminderId);
  } catch (error) {
    console.error('Error storing pending notification:', error);
  }
};

/**
 * Remove pending notification from AsyncStorage after it fires or is cancelled
 */
const removePendingNotification = async (reminderId) => {
  try {
    const stored = await AsyncStorage.getItem('pending_notifications');
    if (!stored) return;
    
    const notifications = JSON.parse(stored);
    const filtered = notifications.filter(n => n.reminderId !== reminderId);
    
    if (filtered.length > 0) {
      await AsyncStorage.setItem('pending_notifications', JSON.stringify(filtered));
    } else {
      await AsyncStorage.removeItem('pending_notifications');
    }
    console.log('🗑️ Removed pending notification:', reminderId);
  } catch (error) {
    console.error('Error removing pending notification:', error);
  }
};

/**
 * Restore notifications that were scheduled before app closed
 * Called when user navigates to Reminders screen (not on app startup)
 */
export const restorePendingNotifications = async () => {
  try {
    const stored = await AsyncStorage.getItem('pending_notifications');
    if (!stored) {
      console.log('No pending notifications to restore');
      return;
    }
    
    const pendingNotifications = JSON.parse(stored);
    console.log('🔄 Restoring', pendingNotifications.length, 'pending notifications');
    
    // Reschedule all pending notifications
    for (const notification of pendingNotifications) {
      if (notification.type === 'medicine') {
        await scheduleMedicineNotification(
          notification.reminderId,
          notification.medicineName,
          notification.dose,
          new Date(notification.scheduledAt)
        );
      } else if (notification.type === 'appointment') {
        await scheduleAppointmentNotification(
          notification.reminderId,
          notification.doctorName,
          notification.notes,
          new Date(notification.scheduledAt)
        );
      }
    }
    
    // Clear the stored notifications after restoring
    await AsyncStorage.removeItem('pending_notifications');
    console.log('✅ Restored and cleared pending notifications');
  } catch (error) {
    console.error('Error restoring pending notifications:', error);
  }
};

/**
 * Schedule a local notification for a medicine reminder
 * @param {string} reminderId - The reminder document ID
 * @param {string} medicineName - Name of the medicine
 * @param {string} dose - Dose of the medicine
 * @param {Date} scheduledTime - The scheduled time for the medicine
 * @returns {Promise<string>} - The notification ID
 */
export const scheduleMedicineNotification = async (
  reminderId,
  medicineName,
  dose,
  scheduledTime
) => {
  try {
    // Calculate 10 minutes before the scheduled time
    const notificationTime = new Date(scheduledTime.getTime() - 10 * 60 * 1000);
    const now = new Date();
    
    console.log('=== Medicine Notification Scheduling ===');
    console.log('Reminder ID:', reminderId);
    console.log('Medicine:', medicineName);
    console.log('Scheduled Time:', scheduledTime);
    console.log('Notification Time (10 min before):', notificationTime);
    console.log('Current Time:', now);
    console.log('Time until notification (ms):', notificationTime.getTime() - now.getTime());
    
    // Only schedule if time is in the future
    if (notificationTime <= now) {
      console.log('❌ Notification time is in the past, skipping');
      return null;
    }

    // Cancel any existing timer for this reminder
    if (activeNotifications.has(reminderId)) {
      clearTimeout(activeNotifications.get(reminderId));
      console.log('Cancelled previous notification for:', reminderId);
    }

    // Calculate delay in milliseconds
    const delayMs = notificationTime.getTime() - now.getTime();

    // Store pending notification for restoration if app closes
    await storePendingNotification({
      reminderId,
      type: 'medicine',
      medicineName,
      dose,
      scheduledAt: notificationTime.toISOString(),
    });

    // Set timer to trigger notification
    const timeoutId = setTimeout(async () => {
      console.log('🔔 Triggering medicine notification for:', medicineName);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '💊 Medicine Reminder',
            body: `Time to take ${medicineName}${dose ? ' (' + dose + ')' : ''}`,
            data: {
              reminderId,
              type: 'medicine',
              medicineName,
              dose,
            },
          },
          trigger: null, // null trigger = immediate
        });
        await removePendingNotification(reminderId);
        activeNotifications.delete(reminderId);
        console.log('✅ Medicine notification sent');
      } catch (error) {
        console.error('Error presenting notification:', error);
      }
    }, delayMs);

    activeNotifications.set(reminderId, timeoutId);
    console.log('✅ Medicine notification scheduled for', Math.round(delayMs / 1000), 'seconds from now');
    return reminderId;
  } catch (error) {
    console.error('Error scheduling medicine notification:', error);
    return null;
  }
};

/**
 * Schedule a local notification for an appointment reminder
 * @param {string} reminderId - The reminder document ID
 * @param {string} doctorName - Name of the doctor/appointment
 * @param {string} notes - Appointment notes
 * @param {Date} appointmentTime - The appointment time
 * @returns {Promise<string>} - The notification ID
 */
export const scheduleAppointmentNotification = async (
  reminderId,
  doctorName,
  notes,
  appointmentTime
) => {
  try {
    // Calculate 1 hour before the appointment
    const notificationTime = new Date(appointmentTime.getTime() - 60 * 60 * 1000);
    const now = new Date();
    
    console.log('=== Appointment Notification Scheduling ===');
    console.log('Reminder ID:', reminderId);
    console.log('Doctor:', doctorName);
    console.log('Appointment Time:', appointmentTime);
    console.log('Notification Time (1 hour before):', notificationTime);
    console.log('Current Time:', now);
    console.log('Time until notification (ms):', notificationTime.getTime() - now.getTime());
    
    // Only schedule if time is in the future
    if (notificationTime <= now) {
      console.log('❌ Notification time is in the past, skipping');
      return null;
    }

    // Cancel any existing timer for this reminder
    if (activeNotifications.has(reminderId)) {
      clearTimeout(activeNotifications.get(reminderId));
      console.log('Cancelled previous notification for:', reminderId);
    }

    // Calculate delay in milliseconds
    const delayMs = notificationTime.getTime() - now.getTime();

    // Store pending notification for restoration if app closes
    await storePendingNotification({
      reminderId,
      type: 'appointment',
      doctorName,
      notes,
      scheduledAt: notificationTime.toISOString(),
    });

    // Set timer to trigger notification
    const timeoutId = setTimeout(async () => {
      console.log('🔔 Triggering appointment notification for:', doctorName);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📅 Appointment Reminder',
            body: `Your appointment with ${doctorName} is in 1 hour${notes ? ': ' + notes : ''}`,
            data: {
              reminderId,
              type: 'appointment',
              doctorName,
              notes,
            },
          },
          trigger: null, // null trigger = immediate
        });
        await removePendingNotification(reminderId);
        activeNotifications.delete(reminderId);
        console.log('✅ Appointment notification sent');
      } catch (error) {
        console.error('Error presenting notification:', error);
      }
    }, delayMs);

    activeNotifications.set(reminderId, timeoutId);
    console.log('✅ Appointment notification scheduled for', Math.round(delayMs / 1000), 'seconds from now');
    return reminderId;
  } catch (error) {
    console.error('Error scheduling appointment notification:', error);
    return null;
  }
};

/**
 * Cancel a scheduled notification
 * @param {string} notificationId - The notification ID to cancel
 */
export const cancelNotification = async (notificationId) => {
  try {
    if (notificationId && activeNotifications.has(notificationId)) {
      clearTimeout(activeNotifications.get(notificationId));
      activeNotifications.delete(notificationId);
      await removePendingNotification(notificationId);
      console.log('✅ Notification cancelled:', notificationId);
    }
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllNotifications = async () => {
  try {
    activeNotifications.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    activeNotifications.clear();
    console.log('✅ All notifications cancelled');
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
  }
};

/**
 * Get all scheduled notifications
 */
export const getAllScheduledNotifications = async () => {
  try {
    const notifications = Array.from(activeNotifications.keys());
    console.log('Active notifications:', notifications);
    return notifications;
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};

/**
 * TEST ONLY: Send an immediate test notification
 */
export const sendTestNotification = async (type = 'medicine') => {
  try {
    console.log('🧪 Sending test notification...');
    if (type === 'medicine') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💊 Test Medicine Reminder',
          body: 'This is a test notification for Paracetamol (1 tablet)',
          data: {
            reminderId: 'test-medicine',
            type: 'medicine',
            medicineName: 'Paracetamol',
            dose: '1 tablet',
          },
        },
        trigger: null, // immediate
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📅 Test Appointment Reminder',
          body: 'Your test appointment with Dr. Smith is in 1 hour',
          data: {
            reminderId: 'test-appointment',
            type: 'appointment',
            doctorName: 'Dr. Smith',
            notes: 'Test appointment',
          },
        },
        trigger: null, // immediate
      });
    }
    console.log('✅ Test notification sent');
  } catch (error) {
    console.error('Error sending test notification:', error);
  }
};

/**
 * Get debug status of all active notifications
 */
export const getNotificationDebugStatus = async () => {
  try {
    const status = {
      activeCount: activeNotifications.size,
      reminders: Array.from(activeNotifications.keys()),
      timestamp: new Date().toISOString(),
    };
    console.log('📊 Notification Debug Status:', JSON.stringify(status, null, 2));
    return status;
  } catch (error) {
    console.error('Error getting debug status:', error);
    return null;
  }
};
