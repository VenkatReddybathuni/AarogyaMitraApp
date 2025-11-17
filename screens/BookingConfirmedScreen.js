import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import CustomModal from '../components/CustomModal';
import { useLanguage } from '../context/LanguageContext';
import useDoctorDirectory from '../hooks/useDoctorDirectory';
import { getLocalizedDoctorName } from '../constants/doctorDirectory';

// This is the "Booking Confirmed" screen (Flow D, Figure 8)
const BookingConfirmedScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { doctorMap } = useDoctorDirectory();
  // Get the data passed from the previous screen
  const {
    appointmentId,
    doctorId,
    doctorName,
    specialty,
    scheduledAt,
    meetingUrl,
    notes,
    doctorNameTranslations,
  } = route.params;

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  const scheduledDate = useMemo(() => {
    if (!scheduledAt) {
      return null;
    }

    try {
      return parseISO(scheduledAt);
    } catch (error) {
      return null;
    }
  }, [scheduledAt]);

  const formattedDate = scheduledDate
    ? format(scheduledDate, 'EEEE, dd MMMM yyyy • h:mm a')
    : t('pendingSchedule');

  const localizedDoctorName = useMemo(() => {
    if (doctorNameTranslations?.[language]) {
      return doctorNameTranslations[language];
    }

    const directoryDoctor = doctorId ? doctorMap[doctorId] : null;
    if (directoryDoctor) {
      const localized = getLocalizedDoctorName(directoryDoctor, language);
      if (localized) {
        return localized;
      }
    }

    return doctorName || t('doctorName');
  }, [doctorId, doctorMap, doctorName, doctorNameTranslations, language, t]);

  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  const handleJoinCall = async () => {
    if (!meetingUrl) {
      showModal(t('meetingLinkNotAvailable'), true);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(meetingUrl);
      if (!supported) {
        throw new Error('Unsupported URL');
      }

      await Linking.openURL(meetingUrl);
    } catch (error) {
      console.error('Failed to open meeting URL:', error);
      showModal(t('unableToOpenVideoCall'), true);
    }
  };

  const handleBackToAppointments = () => {
    navigation.popToTop();
  };

  const handleReminderNavigation = () => {
    navigation.navigate('Reminders');
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
          onPress={() => navigation.popToTop()} // Go back to start of flow
        >
          <MaterialCommunityIcons name="close" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bookingConfirmed')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <MaterialCommunityIcons
          name="check-circle"
          size={100}
          color="#34A853"
        />
        <Text style={styles.title}>{t('bookingConfirmed')}!</Text>
        <Text style={styles.subtitle}>
          {t('bookingConfirmedMessage').replace('{doctorName}', localizedDoctorName)}
        </Text>

        <View style={styles.detailsCard}>
          <Text style={styles.cardTitle}>{t('assigned')}: {localizedDoctorName}</Text>
          <Text style={styles.cardText}>{specialty}</Text>
          <View style={styles.divider} />
          <Text style={styles.cardText}>{formattedDate}</Text>
          {notes ? (
            <Text style={[styles.cardText, styles.cardNotes]}>Notes: {notes}</Text>
          ) : null}
          {appointmentId ? (
            <Text style={styles.referenceId}>Ref: #{appointmentId.slice(-6).toUpperCase()}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.actionButton, styles.joinButton]}
          onPress={handleJoinCall}
        >
          <MaterialCommunityIcons name="video" size={22} color="#fff" />
          <Text style={[styles.actionButtonText, styles.joinButtonText]}>{t('joinVideoCall')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleReminderNavigation}
        >
          <Text style={styles.actionButtonText}>{t('addToReminder')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={handleBackToAppointments}
        >
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            {t('backToAppointments')}
          </Text>
        </TouchableOpacity>
      </View>

      <CustomModal
        isVisible={modalVisible}
        message={modalMessage}
        isError={modalIsError}
        onClose={closeModal}
      />
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
    marginBottom: 20,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cardText: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 15,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  joinButton: {
    backgroundColor: '#34A853',
  },
  joinButtonText: {
    color: '#fff',
    marginLeft: 10,
  },
  cardNotes: {
    marginTop: 12,
  },
  referenceId: {
    marginTop: 12,
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
});

export default BookingConfirmedScreen;