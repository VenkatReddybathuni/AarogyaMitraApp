import React, { useEffect, useMemo, useState, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';

import { db } from '../firebaseConfig';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { format } from 'date-fns';
import BottomNavBar from '../components/BottomNavBar';
import CustomModal from '../components/CustomModal';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';
import {
  scheduleMedicineNotification,
  scheduleAppointmentNotification,
} from '../services/notificationService';
import {
  flushQueuedReminderOperations,
  getQueuedReminderEntries,
  getNetworkStatus as getReminderNetworkStatus,
} from '../services/reminderQueue';

// This is the main "Reminders" screen (Flow E)
const RemindersListScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('Medicines'); // 'Medicines' or 'Appointments'
  const { user, effectiveProfileId, activeProfileName } = useContext(ProfileContext);
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [queuedReminders, setQueuedReminders] = useState([]);
  const [queuedDeleteIds, setQueuedDeleteIds] = useState([]);
  const [queuedUpdateIds, setQueuedUpdateIds] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  const refreshQueuedReminders = useCallback(async () => {
    if (!effectiveProfileId) {
      setQueuedReminders([]);
      setQueuedDeleteIds([]);
      setQueuedUpdateIds([]);
      return;
    }

    const entries = await getQueuedReminderEntries(effectiveProfileId);
    const createEntries = [];
    const deleteIds = [];
    const updateIds = [];

    entries.forEach((entry) => {
      if (entry.operation === 'create') {
        createEntries.push(entry);
      } else if (entry.operation === 'delete' && entry.payload?.reminderId) {
        deleteIds.push(entry.payload.reminderId);
      } else if (entry.operation === 'update' && entry.payload?.reminderId) {
        updateIds.push(entry.payload.reminderId);
      }
    });

    const mappedCreates = createEntries
      .map((entry) => {
        const payload = entry.payload || {};
        const scheduledAt = payload.scheduledAtISO ? new Date(payload.scheduledAtISO) : null;
        return {
          id: entry.entryId,
          queued: true,
          queuedAt: entry.queuedAt,
          type: payload.type,
          scheduleType: payload.scheduleType,
          medicineName: payload.medicineName,
          dose: payload.dose,
          doctorName: payload.doctorName,
          notes: payload.notes,
          timeOfDay: payload.timeOfDay,
          scheduledAt,
        };
      })
      .sort((a, b) => (b.queuedAt || 0) - (a.queuedAt || 0));

    setQueuedReminders(mappedCreates);
    setQueuedDeleteIds(deleteIds);
    setQueuedUpdateIds(updateIds);
  }, [effectiveProfileId]);

  useEffect(() => {
    const scopedProfileId = effectiveProfileId;

    if (!scopedProfileId) {
      setReminders([]);
      setIsLoading(false);
      return () => {};
    }

    setIsLoading(true);
    const remindersRef = collection(db, 'users', scopedProfileId, 'reminders');
    const q = query(remindersRef, orderBy('scheduledAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextReminders = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            scheduledAt: data.scheduledAt?.toDate?.() ?? null,
            createdAt: data.createdAt?.toDate?.() ?? null,
            updatedAt: data.updatedAt?.toDate?.() ?? null,
          };
        });
        setReminders(nextReminders);

        // Reschedule notifications for all reminders
        console.log('📋 Rescheduling notifications for', nextReminders.length, 'reminders');
        nextReminders.forEach((reminder) => {
          if (!reminder.scheduledAt) {
            console.log('⚠️ Reminder has no scheduledAt time:', reminder.id);
            return;
          }

          const now = new Date();
          if (reminder.scheduledAt <= now) {
            console.log('⏭️  Reminder is in the past, skipping:', reminder.id);
            return;
          }

          if (reminder.type === 'Medicine') {
            console.log('💊 Scheduling medicine notification for:', reminder.medicineName);
            scheduleMedicineNotification(
              reminder.id,
              reminder.medicineName,
              reminder.dose,
              reminder.scheduledAt
            );
          } else if (reminder.type === 'Appointment') {
            console.log('📅 Scheduling appointment notification for:', reminder.doctorName);
            scheduleAppointmentNotification(
              reminder.id,
              reminder.doctorName,
              reminder.notes,
              reminder.scheduledAt
            );
          }
        });

        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load reminders:', error);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [effectiveProfileId]);

  useEffect(() => {
    refreshQueuedReminders();
  }, [refreshQueuedReminders]);

  useEffect(() => {
    if (!effectiveProfileId) {
      return undefined;
    }

    let isMounted = true;

    const attemptFlush = async () => {
      try {
        const isOnline = await getReminderNetworkStatus();
        if (!isOnline) {
          return;
        }

        const result = await flushQueuedReminderOperations({ profileId: effectiveProfileId });
        if (isMounted && result.synced > 0) {
          await refreshQueuedReminders();
        }
      } catch (error) {
        console.warn('Failed to flush queued reminders', error);
      }
    };

    attemptFlush();

    return () => {
      isMounted = false;
    };
  }, [effectiveProfileId, refreshQueuedReminders]);

  useFocusEffect(
    useCallback(() => {
      refreshQueuedReminders();
    }, [refreshQueuedReminders])
  );

  const showModal = useCallback((message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => setModalVisible(false), []);
  const processedReminders = useMemo(() => {
    const deleteIds = new Set(queuedDeleteIds);
    const updateIds = new Set(queuedUpdateIds);

    const cleaned = reminders
      .filter((item) => !deleteIds.has(item.id))
      .map((item) =>
        updateIds.has(item.id)
          ? { ...item, queuedUpdate: true }
          : item
      );

    return [...queuedReminders, ...cleaned];
  }, [reminders, queuedReminders, queuedDeleteIds, queuedUpdateIds]);

  const filteredReminders = useMemo(() => {
    const typeFilter = activeTab === 'Medicines' ? 'Medicine' : 'Appointment';
    return processedReminders
      .filter((item) => item.type === typeFilter)
      .sort((a, b) => {
        if (a.queued && !b.queued) {
          return -1;
        }
        if (!a.queued && b.queued) {
          return 1;
        }
        const aTime = a.scheduledAt?.getTime?.() ?? 0;
        const bTime = b.scheduledAt?.getTime?.() ?? 0;
        return aTime - bTime;
      });
  }, [activeTab, processedReminders]);

  const handleReminderPress = useCallback(
    (reminder) => {
      if (reminder.queued || reminder.queuedUpdate) {
        showModal(t('queuedReminderNotEditable'));
        return;
      }

      if (!effectiveProfileId) return;
      navigation.navigate('AddReminder', {
        reminderId: reminder.id,
        profileId: effectiveProfileId,
        profileName: activeProfileName,
      });
    },
    [navigation, effectiveProfileId, activeProfileName, showModal, t]
  );

  const handleCreateReminder = useCallback(() => {
    if (!effectiveProfileId) return;
    navigation.navigate('AddReminder', {
      profileId: effectiveProfileId,
      profileName: activeProfileName,
    });
  }, [navigation, effectiveProfileId, activeProfileName]);

  const getIconName = (type) =>
    type === 'Medicine' ? 'pill' : 'calendar-clock';

  const getTitle = (reminder) => {
    if (reminder.type === 'Medicine') {
      return reminder.medicineName || t('unnamedMedicine');
    }
    return reminder.doctorName || reminder.appointmentTitle || t('appointment');
  };

  const getSubtitle = (reminder) => {
    if (reminder.type === 'Medicine') {
      if (reminder.scheduleType === 'daily') {
        const base = new Date();
        const hours = reminder.timeOfDay?.hour;
        const minutes = reminder.timeOfDay?.minute;

        if (typeof hours === 'number' && typeof minutes === 'number') {
          base.setHours(hours, minutes, 0, 0);
        } else if (reminder.scheduledAt) {
          base.setHours(
            reminder.scheduledAt.getHours(),
            reminder.scheduledAt.getMinutes(),
            0,
            0
          );
        }

        const timeText =
          typeof hours === 'number' && typeof minutes === 'number'
            ? format(base, 'h:mm a')
            : reminder.scheduledAt
            ? format(reminder.scheduledAt, 'h:mm a')
            : null;

        const scheduleText = timeText
          ? `Daily at ${timeText}`
          : 'Daily reminder';

        return [scheduleText, reminder.dose].filter(Boolean).join(' • ');
      }

      const dateLabel = reminder.scheduledAt
        ? format(reminder.scheduledAt, 'MMM d, yyyy • h:mm a')
        : 'No schedule set';

      return [dateLabel, reminder.dose].filter(Boolean).join(' • ');
    }

    const dateText = reminder.scheduledAt
      ? format(reminder.scheduledAt, 'MMM d, yyyy • h:mm a')
      : 'No schedule set';

    return [dateText, reminder.notes].filter(Boolean).join(' • ');
  };

  const renderListItem = (item) => {
    const isQueued = Boolean(item.queued);
    const isQueuedUpdate = Boolean(item.queuedUpdate);
    const iconColor = isQueued ? '#9AA0A6' : '#007AFF';
    const metaText = isQueued
      ? t('reminderPendingSync')
      : isQueuedUpdate
      ? t('reminderUpdatePendingSync')
      : getSubtitle(item);
    const trailingIcon = isQueued
      ? 'cloud-upload-outline'
      : isQueuedUpdate
      ? 'progress-clock'
      : 'pencil';
    const trailingColor = isQueued
      ? '#9AA0A6'
      : isQueuedUpdate
      ? '#F29900'
      : '#B0B0B0';
    const badgeText = isQueued || isQueuedUpdate ? t('queuedLabel') : null;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.reminderItem}
        onPress={() => handleReminderPress(item)}
        activeOpacity={0.75}
      >
        <MaterialCommunityIcons
          name={getIconName(item.type)}
          size={24}
          color={iconColor}
        />
        <View style={styles.reminderTextContainer}>
          <View style={styles.reminderTitleRow}>
            <Text style={styles.reminderName}>{getTitle(item)}</Text>
            {badgeText ? (
              <View style={styles.queuedBadge}>
                <Text style={styles.queuedBadgeText}>{badgeText}</Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              styles.reminderTime,
              (isQueued || isQueuedUpdate) && styles.reminderTimeQueued,
            ]}
          >
            {metaText}
          </Text>
        </View>
        <MaterialCommunityIcons name={trailingIcon} size={20} color={trailingColor} />
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar style="dark" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => navigation.navigate('Home')} // Go back to main Home
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('myReminders')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'Medicines' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('Medicines')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'Medicines' && styles.tabTextActive,
            ]}
          >
            {t('medicines')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'Appointments' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('Appointments')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'Appointments' && styles.tabTextActive,
            ]}
          >
            {t('appointments')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {isLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingText}>Loading reminders…</Text>
          </View>
        ) : !user ? (
          <View style={styles.centerContent}>
            <MaterialCommunityIcons
              name="account-alert"
              size={36}
              color="#B0B0B0"
            />
            <Text style={styles.emptyTitle}>Sign in required</Text>
            <Text style={styles.emptySubtitle}>
              Please log in to create and view your reminders.
            </Text>
          </View>
        ) : filteredReminders.length === 0 ? (
          <View style={styles.centerContent}>
            <MaterialCommunityIcons
              name={activeTab === 'Medicines' ? 'pill-off' : 'calendar-remove'}
              size={36}
              color="#B0B0B0"
            />
            <Text style={styles.emptyTitle}>No {activeTab.toLowerCase()} yet</Text>
            <Text style={styles.emptySubtitle}>
              {t('tapAddReminder')}
            </Text>
          </View>
        ) : (
          filteredReminders.map(renderListItem)
        )}
      </ScrollView>

      {/* Add Reminder Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.addButton,
            (!user || !effectiveProfileId) && styles.addButtonDisabled,
          ]}
          onPress={handleCreateReminder}
          disabled={!user || !effectiveProfileId}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
          <Text style={styles.addButtonText}>{t('addReminder')}</Text>
        </TouchableOpacity>
      </View>

      <CustomModal
        isVisible={modalVisible}
        message={modalMessage}
        isError={modalIsError}
        onClose={closeModal}
      />

      <BottomNavBar navigation={navigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerIcon: {
    padding: 5,
  },
  headerSpacer: {
    width: 35,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    padding: 15,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  reminderItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reminderTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  reminderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  reminderTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  reminderTimeQueued: {
    color: '#5F6368',
  },
  queuedBadge: {
    backgroundColor: '#E8EAED',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 10,
  },
  queuedBadgeText: {
    fontSize: 12,
    color: '#5F6368',
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});

export default RemindersListScreen;