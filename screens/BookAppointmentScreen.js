import React, { useEffect, useMemo, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { format, parse, isBefore, isValid } from 'date-fns';
import CustomModal from '../components/CustomModal';
import { db } from '../firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { fallbackDoctors, getLocalizedDoctorName } from '../constants/doctorDirectory';
import {
  createAppointmentNow,
  updateAppointmentNow,
  queueAppointmentCreate,
  queueAppointmentUpdate,
  getNetworkStatus as getAppointmentNetworkStatus,
} from '../services/appointmentQueue';

const specialties = [
  'Cardiology',
  'Dermatology',
  'Neurology',
  'General Medicine',
];
const timeSlots = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '02:00 PM', '02:30 PM'];


// This is the "Book New Appointment" screen (Flow D, Figure 8)
const BookAppointmentScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();

  const appointmentId = route?.params?.appointmentId ?? null;
  const { user, effectiveProfileId, activeProfileName } = useContext(ProfileContext);
  const scopedProfileId = route?.params?.profileId ?? effectiveProfileId;
  const scopedProfileName = route?.params?.profileName ?? activeProfileName;

  const [specialty, setSpecialty] = useState('');
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [selectedTime, setSelectedTime] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [notes, setNotes] = useState('');
  const [existingMeetingUrl, setExistingMeetingUrl] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);
  const [modalCloseAction, setModalCloseAction] = useState(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(Boolean(appointmentId));
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [isDoctorsLoading, setIsDoctorsLoading] = useState(false);
  const [doctorLoadError, setDoctorLoadError] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [isUsingFallbackDoctors, setIsUsingFallbackDoctors] = useState(false);

  const normalizeSpecialty = (value) => {
    if (!value) {
      return '';
    }
    if (value === 'General') {
      return 'General Medicine';
    }
    if (value === 'Other') {
      return '';
    }
    return value;
  };

  const defaultDoctorPlaceholder = useMemo(() => {
    if (doctorOptions.length > 0) {
      const localized = getLocalizedDoctorName(doctorOptions[0], language);
      return localized || doctorOptions[0].name;
    }

    const fallbackDoctor = fallbackDoctors.find(
      (doctor) => doctor.specialization === specialty
    );
    if (fallbackDoctor) {
      const localized = getLocalizedDoctorName(fallbackDoctor, language);
      if (localized) {
        return localized;
      }
    }

    return specialty ? t('doctorName') : 'Dr. Name';
  }, [doctorOptions, language, specialty, t]);

  const onDayPress = (day) => {
    setSelectedDate(day.dateString);
  };

  const handleSpecialtySelect = (value) => {
    if (specialty === value) {
      return;
    }
  setSpecialty(normalizeSpecialty(value));
    setSelectedDoctorId(null);
    setDoctorOptions([]);
    setDoctorName('');
  };

  const handleDoctorSelect = (doctor) => {
    setSelectedDoctorId(doctor.id);
    setDoctorName(doctor.name);
  };

  const handleDoctorInputChange = (value) => {
    setDoctorName(value);

    if (!value) {
      setSelectedDoctorId(null);
      return;
    }

    const matchingDoctor = doctorOptions.find((doctor) => {
      return doctor.name?.toLowerCase() === value.trim().toLowerCase();
    });

    if (matchingDoctor) {
      setSelectedDoctorId(matchingDoctor.id);
    } else if (selectedDoctorId) {
      setSelectedDoctorId(null);
    }
  };

  const showModal = (message, isError = false, onClose) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalCloseAction(() => (typeof onClose === 'function' ? onClose : null));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    const action = modalCloseAction;
    setModalCloseAction(null);
    if (action) {
      action();
    }
  };

  const createMeetingUrl = (doctorLabel) => {
    const slugBase = (doctorLabel || 'AarogyaMitra')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 24);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `https://meet.jit.si/${slugBase || 'AarogyaMitra'}-${Date.now()}-${randomSuffix}`;
  };

  useEffect(() => {
    const loadExistingAppointment = async () => {
      if (!appointmentId) {
        return;
      }

      if (!user || !scopedProfileId) {
        showModal(t('pleaseSignInToBook'), true, () => {
          navigation.goBack();
        });
        setIsLoadingExisting(false);
        return;
      }

      try {
        const appointmentRef = doc(
          db,
          'users',
          scopedProfileId,
          'appointments',
          appointmentId
        );
        const snapshot = await getDoc(appointmentRef);

        if (!snapshot.exists()) {
          showModal('Appointment not found.', true, () => navigation.goBack());
          return;
        }

        const data = snapshot.data();
        const scheduledAt = data.scheduledAt?.toDate?.() ?? null;

  setSpecialty(normalizeSpecialty(data.specialty || ''));
        setDoctorName(data.doctorName || '');
        setNotes(data.notes || '');
        setExistingMeetingUrl(data.meetingUrl || null);
  setSelectedDoctorId(data.doctorId || null);

        if (scheduledAt) {
          setSelectedDate(format(scheduledAt, 'yyyy-MM-dd'));
          setSelectedTime(format(scheduledAt, 'hh:mm a'));
        } else {
          setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
          setSelectedTime('');
        }
      } catch (error) {
        console.error('Failed to load appointment:', error);
        showModal(
          t('couldNotLoadAppointment'),
          true,
          () => navigation.goBack()
        );
      } finally {
        setIsLoadingExisting(false);
      }
    };

    loadExistingAppointment();
  }, [appointmentId, navigation, scopedProfileId, user, t]);

  useEffect(() => {
    let isMounted = true;

    const fetchDoctors = async () => {
      if (!specialty) {
        if (isMounted) {
          setDoctorOptions([]);
          setDoctorLoadError('');
          setSelectedDoctorId(null);
          setIsDoctorsLoading(false);
          setIsUsingFallbackDoctors(false);
        }
        return;
      }

      if (isMounted) {
        setIsDoctorsLoading(true);
        setDoctorLoadError('');
        setIsUsingFallbackDoctors(false);
      }

      try {
        const doctorsRef = collection(db, 'doctors');
        const doctorsQuery = query(
          doctorsRef,
          where('specialization', '==', specialty),
          orderBy('experienceYears', 'desc')
        );
        const snapshot = await getDocs(doctorsQuery);
        if (!isMounted) {
          return;
        }

        let mappedDoctors = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        let usingFallback = false;
        if (mappedDoctors.length === 0) {
          const fallbackMatches = fallbackDoctors.filter(
            (doctor) => doctor.specialization === specialty
          );
          if (fallbackMatches.length > 0) {
            mappedDoctors = fallbackMatches;
            usingFallback = true;
          }
        }

        setIsUsingFallbackDoctors(usingFallback);

        setDoctorOptions(mappedDoctors);

        if (!appointmentId && !doctorName && mappedDoctors.length > 0) {
          setSelectedDoctorId(mappedDoctors[0].id);
          setDoctorName(mappedDoctors[0].name);
        } else {
          setSelectedDoctorId((prevId) => {
            if (!prevId) {
              return prevId;
            }
            const stillAvailable = mappedDoctors.some(
              (doctor) => doctor.id === prevId
            );
            return stillAvailable ? prevId : null;
          });
        }
      } catch (error) {
        console.error('Failed to load doctors:', error);
        if (isMounted) {
          setDoctorLoadError(
            'We could not load doctors right now. Please try again.'
          );
          const fallbackMatches = fallbackDoctors.filter(
            (doctor) => doctor.specialization === specialty
          );
          if (fallbackMatches.length > 0) {
            setDoctorOptions(fallbackMatches);
            setIsUsingFallbackDoctors(true);
          }
        }
      } finally {
        if (isMounted) {
          setIsDoctorsLoading(false);
        }
      }
    };

    fetchDoctors();

    return () => {
      isMounted = false;
    };
  }, [specialty, appointmentId, doctorName]);

  const timeSlotOptions = useMemo(() => {
    if (!selectedTime || timeSlots.includes(selectedTime)) {
      return timeSlots;
    }

    const slots = [...timeSlots, selectedTime];
    return slots.sort((a, b) => {
      const dateA = parse(a, 'hh:mm a', new Date());
      const dateB = parse(b, 'hh:mm a', new Date());
      return dateA - dateB;
    });
  }, [selectedTime]);

  const handleBooking = async () => {
    if (isSubmitting || isLoadingExisting) {
      return;
    }

    if (!user || !scopedProfileId) {
      showModal(t('pleaseSignInToBook'), true);
      return;
    }

    if (!specialty || !selectedDate || !selectedTime || !doctorName.trim()) {
      showModal(t('pleaseCompleteAllFields'), true);
      return;
    }

    const parsedDate = parse(
      `${selectedDate} ${selectedTime}`,
      'yyyy-MM-dd hh:mm a',
      new Date()
    );

    if (!isValid(parsedDate)) {
      showModal(t('invalidDateOrTime'), true);
      return;
    }

    if (isBefore(parsedDate, new Date())) {
      showModal(t('chooseFutureTime'), true);
      return;
    }

    try {
      setIsSubmitting(true);

      const trimmedDoctor = doctorName.trim();
      const meetingUrlToSave = appointmentId
        ? existingMeetingUrl || createMeetingUrl(trimmedDoctor || specialty)
        : createMeetingUrl(trimmedDoctor || specialty);

      const appointmentPayload = {
        doctorName: trimmedDoctor,
        doctorId: selectedDoctorId || null,
        specialty,
        notes: notes.trim(),
        scheduledAtISO: parsedDate.toISOString(),
        meetingUrl: meetingUrlToSave,
        status: 'scheduled',
      };

      const isOnline = await getAppointmentNetworkStatus();

      if (appointmentId) {
        if (isOnline) {
          await updateAppointmentNow(scopedProfileId, appointmentId, appointmentPayload);
          setExistingMeetingUrl(meetingUrlToSave);
          showModal(t('appointmentUpdatedSuccessfully'), false, () => {
            navigation.goBack();
          });
        } else {
          await queueAppointmentUpdate(scopedProfileId, appointmentId, appointmentPayload);
          setExistingMeetingUrl(meetingUrlToSave);
          showModal(t('appointmentUpdateQueued'), false, () => {
            navigation.goBack();
          });
        }
      } else {
        if (isOnline) {
          const docRef = await createAppointmentNow(scopedProfileId, appointmentPayload);

          navigation.replace('BookingConfirmed', {
            appointmentId: docRef.id,
            doctorId: selectedDoctorId || null,
            doctorName: appointmentPayload.doctorName,
            specialty: appointmentPayload.specialty,
            scheduledAt: parsedDate.toISOString(),
            meetingUrl: meetingUrlToSave,
            notes: appointmentPayload.notes,
          });
        } else {
          await queueAppointmentCreate(scopedProfileId, appointmentPayload);
          showModal(t('appointmentQueued'), false, () => {
            navigation.goBack();
          });
        }
      }
    } catch (error) {
      console.error('Failed to book appointment:', error);
      showModal(t('couldNotBookAppointment'), true);
    } finally {
      setIsSubmitting(false);
    }
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
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {appointmentId ? t('editAppointment') : t('bookAppointment')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoadingExisting ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('loadingAppointment')}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView style={styles.scrollView}>
            {/* Specialty Selector */}
            <Text style={styles.label}>{t('selectSpecialty')}</Text>
            <View style={styles.specialtyContainer}>
              {specialties.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.specialtyButton,
                    specialty === item && styles.specialtyButtonActive,
                  ]}
                  onPress={() => handleSpecialtySelect(item)}
                >
                  <Text
                    style={[
                      styles.specialtyText,
                      specialty === item && styles.specialtyTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Doctor */}
            <Text style={styles.label}>{t('doctorName')}</Text>
            <Text style={styles.helperText}>
              {specialty
                ? 'Select a doctor below or enter a different name.'
                : 'Choose a specialty to see recommended doctors.'}
            </Text>
            <View style={styles.doctorCardsWrapper}>
              {isUsingFallbackDoctors && (
                <Text style={styles.fallbackNotice}>
                  Showing sample doctors. Run the seed script to load live data.
                </Text>
              )}
              {!specialty ? (
                <Text style={styles.helperTextMuted}>
                  Pick a specialty first to load doctors.
                </Text>
              ) : isDoctorsLoading ? (
                <View style={styles.doctorLoadingContainer}>
                  <ActivityIndicator color="#007AFF" />
                  <Text
                    style={[styles.helperTextMuted, styles.doctorLoadingText]}
                  >
                    Loading doctors…
                  </Text>
                </View>
              ) : doctorLoadError ? (
                <Text style={styles.errorText}>{doctorLoadError}</Text>
              ) : doctorOptions.length === 0 ? (
                <Text style={styles.helperTextMuted}>
                  No doctors found for this specialty yet. Add doctors in
                  Firestore or run the seed script to populate sample data.
                </Text>
              ) : (
                doctorOptions.map((doctor) => {
                  const localizedName =
                    getLocalizedDoctorName(doctor, language) || doctor.name;
                  const languagesLabel = Array.isArray(doctor.languages)
                    ? doctor.languages.join(', ')
                    : 'Languages unavailable';
                  const experienceLabel = doctor.experienceYears
                    ? `${doctor.experienceYears}+ yrs`
                    : 'Experience TBD';

                  return (
                    <TouchableOpacity
                      key={doctor.id}
                      style={[
                        styles.doctorCard,
                        selectedDoctorId === doctor.id &&
                          styles.doctorCardSelected,
                      ]}
                      onPress={() => handleDoctorSelect(doctor)}
                    >
                      <Text style={styles.doctorCardName}>{localizedName}</Text>
                      {!!doctor.hospital && (
                        <Text style={styles.doctorCardMeta}>{doctor.hospital}</Text>
                      )}
                      <Text style={styles.doctorCardMeta}>
                        {experienceLabel} • {languagesLabel}
                      </Text>
                      <View
                        style={[
                          styles.doctorBadge,
                          !doctor.acceptingNewPatients &&
                            styles.doctorBadgeInactive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.doctorBadgeText,
                            !doctor.acceptingNewPatients &&
                              styles.doctorBadgeTextInactive,
                          ]}
                        >
                          {doctor.acceptingNewPatients
                            ? 'Accepting patients'
                            : 'Not accepting new patients'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
            <TextInput
              style={styles.textInput}
              placeholder={defaultDoctorPlaceholder}
              value={doctorName}
              onChangeText={handleDoctorInputChange}
              placeholderTextColor="#9B9B9B"
              returnKeyType="done"
            />

            {/* Calendar - as shown in your PDF */}
            <Text style={styles.label}>{t('selectDate')}</Text>
            <Calendar
              style={styles.calendar}
              onDayPress={onDayPress}
              markedDates={{
                [selectedDate]: {
                  selected: true,
                  selectedColor: '#007AFF',
                  disableTouchEvent: true,
                },
              }}
              theme={{
                arrowColor: '#007AFF',
                todayTextColor: '#007AFF',
                selectedDayBackgroundColor: '#007AFF',
              }}
            />

            {/* Time Slots */}
            <Text style={styles.label}>{t('selectTime')}</Text>
            <View style={styles.timeSlotContainer}>
              {timeSlotOptions.map((time) => (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.timeSlotButton,
                    selectedTime === time && styles.timeSlotButtonActive,
                  ]}
                  onPress={() => setSelectedTime(time)}
                >
                  <Text
                    style={[
                      styles.timeSlotText,
                      selectedTime === time && styles.timeSlotTextActive,
                    ]}
                  >
                    {time}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes */}
            <Text style={styles.label}>{t('notes')} (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              placeholder="Share symptoms or questions for the doctor"
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor="#9B9B9B"
              multiline
              numberOfLines={4}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Confirm Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, (isSubmitting || isLoadingExisting) && styles.confirmButtonDisabled]}
          onPress={handleBooking}
          activeOpacity={0.8}
          disabled={isSubmitting || isLoadingExisting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>
              {appointmentId ? t('editAppointment') : t('confirmBooking')}
            </Text>
          )}
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
  flex: {
    flex: 1,
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
  scrollView: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 20,
    fontSize: 14,
    color: '#333',
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  helperText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  helperTextMuted: {
    fontSize: 13,
    color: '#999',
  },
  errorText: {
    fontSize: 13,
    color: '#D14343',
  },
  specialtyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 20,
  },
  specialtyButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
    margin: 4,
  },
  specialtyButtonActive: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  specialtyText: {
    fontSize: 14,
    color: '#333',
  },
  specialtyTextActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  calendar: {
    borderRadius: 10,
    marginBottom: 20,
    elevation: 1,
  },
  timeSlotContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  doctorCardsWrapper: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
    marginBottom: 20,
  },
  doctorLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  doctorLoadingText: {
    marginTop: 8,
  },
  fallbackNotice: {
    fontSize: 12,
    color: '#5C6A79',
    backgroundColor: '#F1F7FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0E3FF',
    marginBottom: 12,
  },
  doctorCard: {
    borderWidth: 1,
    borderColor: '#E4E4E4',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  doctorCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#EAF4FF',
  },
  doctorCardName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    color: '#111',
  },
  doctorCardMeta: {
    fontSize: 13,
    color: '#555',
    marginBottom: 2,
  },
  doctorBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E1F8EB',
  },
  doctorBadgeInactive: {
    backgroundColor: '#FDEBEC',
  },
  doctorBadgeText: {
    fontSize: 12,
    color: '#1B7F4B',
    fontWeight: '600',
  },
  doctorBadgeTextInactive: {
    color: '#B3261E',
  },
  timeSlotButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
    margin: 4,
  },
  timeSlotButtonActive: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  timeSlotText: {
    fontSize: 14,
    color: '#333',
  },
  timeSlotTextActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default BookAppointmentScreen;