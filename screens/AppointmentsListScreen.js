import React, { useCallback, useEffect, useMemo, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../firebaseConfig';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import CustomModal from '../components/CustomModal';
import BottomNavBar from '../components/BottomNavBar';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';
import useDoctorDirectory from '../hooks/useDoctorDirectory';
import { getLocalizedDoctorName } from '../constants/doctorDirectory';
import {
  flushQueuedAppointmentOperations,
  getQueuedAppointmentEntries,
  getNetworkStatus as getAppointmentNetworkStatus,
} from '../services/appointmentQueue';

// This is the main "My Appointments" screen (Flow D)
const AppointmentsListScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user, effectiveProfileId, activeProfileName } = useContext(ProfileContext);
  const { doctorMap } = useDoctorDirectory();
  const [activeTab, setActiveTab] = useState('Upcoming'); // 'Upcoming' or 'Past'
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);
  const [queuedAppointments, setQueuedAppointments] = useState([]);
  const [queuedUpdateIds, setQueuedUpdateIds] = useState([]);

  const refreshQueuedAppointments = useCallback(async () => {
    if (!effectiveProfileId) {
      setQueuedAppointments([]);
      setQueuedUpdateIds([]);
      return;
    }

    const entries = await getQueuedAppointmentEntries(effectiveProfileId);
    const createEntries = [];
    const updateIds = [];

    entries.forEach((entry) => {
      if (entry.operation === 'create') {
        createEntries.push(entry);
      } else if (entry.operation === 'update' && entry.payload?.appointmentId) {
        updateIds.push(entry.payload.appointmentId);
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
          doctorName: payload.doctorName,
          doctorId: payload.doctorId,
          specialty: payload.specialty,
          notes: payload.notes,
          scheduledAt,
          meetingUrl: payload.meetingUrl,
          status: payload.status ?? 'scheduled',
        };
      })
      .sort((a, b) => (b.queuedAt || 0) - (a.queuedAt || 0));

    setQueuedAppointments(mappedCreates);
    setQueuedUpdateIds(updateIds);
  }, [effectiveProfileId]);

  useEffect(() => {
    if (!effectiveProfileId) {
      setAppointments([]);
      setIsLoading(false);
      return () => {};
    }

    setIsLoading(true);
    const appointmentsRef = collection(
      db,
      'users',
      effectiveProfileId,
      'appointments'
    );
    const q = query(appointmentsRef, orderBy('scheduledAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextAppointments = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const scheduledAt = data.scheduledAt?.toDate?.() ?? null;
          return {
            id: docSnap.id,
            ...data,
            scheduledAt,
            createdAt: data.createdAt?.toDate?.() ?? null,
            updatedAt: data.updatedAt?.toDate?.() ?? null,
          };
        });
        setAppointments(nextAppointments);
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load appointments:', error);
        setAppointments([]);
        setIsLoading(false);
        showModal(t('unableToLoadAppointments'), true);
      }
    );

    return unsubscribe;
  }, [effectiveProfileId, t]);

  useEffect(() => {
    refreshQueuedAppointments();
  }, [refreshQueuedAppointments]);

  useEffect(() => {
    if (!effectiveProfileId) {
      return undefined;
    }

    let isMounted = true;

    const attemptFlush = async () => {
      try {
        const isOnline = await getAppointmentNetworkStatus();
        if (!isOnline) {
          return;
        }

        const result = await flushQueuedAppointmentOperations({ profileId: effectiveProfileId });
        if (isMounted && result.synced > 0) {
          await refreshQueuedAppointments();
        }
      } catch (error) {
        console.warn('Failed to flush queued appointments', error);
      }
    };

    attemptFlush();

    return () => {
      isMounted = false;
    };
  }, [effectiveProfileId, refreshQueuedAppointments]);

  useFocusEffect(
    useCallback(() => {
      refreshQueuedAppointments();
    }, [refreshQueuedAppointments])
  );

  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  const processedAppointments = useMemo(() => {
    const updateIds = new Set(queuedUpdateIds);
    const mapped = appointments.map((item) =>
      updateIds.has(item.id)
        ? { ...item, queuedUpdate: true }
        : item
    );
    return [...queuedAppointments, ...mapped];
  }, [appointments, queuedAppointments, queuedUpdateIds]);

  const now = useMemo(() => new Date(), [processedAppointments, activeTab]);

  const upcoming = useMemo(() => {
    return processedAppointments
      .filter((item) => item.scheduledAt && item.scheduledAt >= now)
      .sort((a, b) => (a.scheduledAt?.getTime?.() ?? 0) - (b.scheduledAt?.getTime?.() ?? 0));
  }, [processedAppointments, now]);

  const past = useMemo(() => {
    return processedAppointments
      .filter((item) => item.scheduledAt && item.scheduledAt < now)
      .sort((a, b) => (b.scheduledAt?.getTime?.() ?? 0) - (a.scheduledAt?.getTime?.() ?? 0));
  }, [processedAppointments, now]);

  const activeAppointments = activeTab === 'Upcoming' ? upcoming : past;

  const doctorValues = useMemo(() => Object.values(doctorMap), [doctorMap]);

  const resolveDoctorName = useCallback(
    (appointment) => {
      if (appointment?.doctorNameTranslations?.[language]) {
        return appointment.doctorNameTranslations[language];
      }

      const directoryDoctor = appointment?.doctorId
        ? doctorMap[appointment.doctorId]
        : null;

      if (directoryDoctor) {
        const localized = getLocalizedDoctorName(directoryDoctor, language);
        if (localized) {
          return localized;
        }
      }

      if (appointment?.doctorName) {
        const normalizedTarget = appointment.doctorName.trim().toLowerCase();
        const matchByName = doctorValues.find((doctor) => {
          if (!doctor?.name) {
            return false;
          }
          return doctor.name.trim().toLowerCase() === normalizedTarget;
        });

        if (matchByName) {
          const localized = getLocalizedDoctorName(matchByName, language);
          if (localized) {
            return localized;
          }
        }

        return appointment.doctorName;
      }

      return t('doctor');
    },
    [doctorMap, doctorValues, language, t]
  );

  const handleJoinCall = async (appointment) => {
    if (appointment.queued) {
      showModal(t('queuedJoinDisabled'), false);
      return;
    }

    const meetingUrl = appointment.meetingUrl;

    if (!meetingUrl) {
      showModal(t('meetingLinkNotAvailableAppointment'), true);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(meetingUrl);
      if (!supported) {
        throw new Error('Unsupported URL');
      }

      await Linking.openURL(meetingUrl);
    } catch (error) {
      console.error('Failed to open meeting link:', error);
      showModal(t('unableToOpenVideoCallAppointment'), true);
    }
  };

  const handleAddAppointment = () => {
    if (!effectiveProfileId) return;
    navigation.navigate('BookAppointment', {
      profileId: effectiveProfileId,
      profileName: activeProfileName,
    });
  };

  const handleEditAppointment = useCallback(
    (appointment) => {
      if (appointment.queued || appointment.queuedUpdate) {
        showModal(t('queuedAppointmentNotEditable'), false);
        return;
      }

      if (!effectiveProfileId) return;
      navigation.navigate('BookAppointment', {
        appointmentId: appointment.id,
        profileId: effectiveProfileId,
        profileName: activeProfileName,
      });
    },
    [navigation, effectiveProfileId, activeProfileName, showModal, t]
  );

  const renderListItem = (item) => {
    const isQueued = Boolean(item.queued);
    const isQueuedUpdate = Boolean(item.queuedUpdate);
    const dateText = item.scheduledAt
      ? format(item.scheduledAt, 'MMM d, yyyy • h:mm a')
      : t('noScheduleSet');
    const localizedDoctorName = resolveDoctorName(item);
    const statusText = isQueued
      ? t('appointmentPendingSync')
      : isQueuedUpdate
      ? t('appointmentUpdatePendingSync')
      : null;
    const joinDisabled = isQueued;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.appointmentItem}
        onPress={() => handleEditAppointment(item)}
        activeOpacity={0.85}
      >
        <View style={styles.doctorInfo}>
          <View style={styles.appointmentHeader}>
            <Text style={styles.doctorName}>{localizedDoctorName}</Text>
            {(isQueued || isQueuedUpdate) && (
              <View style={styles.queuedBadge}>
                <Text style={styles.queuedBadgeText}>{t('queuedLabel')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.doctorSpecialty}>{item.specialty || t('specialty')}</Text>
          <Text style={styles.appointmentTime}>{dateText}</Text>
          {statusText ? (
            <Text style={styles.appointmentQueuedText}>{statusText}</Text>
          ) : null}
          {item.notes ? (
            <Text style={styles.appointmentNotes}>{item.notes}</Text>
          ) : null}
        </View>
        {activeTab === 'Upcoming' ? (
          <TouchableOpacity
            style={[styles.joinButton, joinDisabled && styles.joinButtonDisabled]}
            onPress={() => handleJoinCall(item)}
            activeOpacity={joinDisabled ? 1 : 0.8}
            disabled={joinDisabled}
          >
            <MaterialCommunityIcons name="video" size={18} color="#fff" />
            <Text style={styles.joinButtonText}>{t('joinCall')}</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    if (!user) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="account-alert" size={48} color="#B0B0B0" />
          <Text style={styles.emptyStateTitle}>{t('signInToTrackAppointments')}</Text>
          <Text style={styles.emptyStateText}>
            {t('loginToSeeAppointments')}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="calendar-account" size={48} color="#B0B0B0" />
        <Text style={styles.emptyStateTitle}>{t('noAppointmentsYet')}</Text>
        <Text style={styles.emptyStateText}>
          {t('bookNewAppointment')}
        </Text>
      </View>
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
        <Text style={styles.headerTitle}>{t('myAppointments')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'Upcoming' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('Upcoming')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'Upcoming' && styles.tabTextActive,
            ]}
          >
            {t('upcoming')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'Past' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('Past')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'Past' && styles.tabTextActive,
            ]}
          >
            {t('past')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : activeAppointments.length ? (
          activeAppointments.map(renderListItem)
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      {/* Book Appointment Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.addButton,
            (!user || !effectiveProfileId) && styles.addButtonDisabled,
          ]}
          onPress={handleAddAppointment}
          disabled={!user || !effectiveProfileId}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
          <Text style={styles.addButtonText}>{t('bookNewAppointmentButton')}</Text>
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
  loadingState: {
    flex: 1,
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  doctorInfo: {
    flex: 1,
  },
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doctorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  doctorSpecialty: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  appointmentTime: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 5,
    fontWeight: '500',
  },
  appointmentNotes: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  appointmentQueuedText: {
    fontSize: 13,
    color: '#5F6368',
    marginTop: 6,
  },
  joinButton: {
    backgroundColor: '#34A853',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  joinButtonDisabled: {
    backgroundColor: '#9AA0A6',
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 6,
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});

export default AppointmentsListScreen;