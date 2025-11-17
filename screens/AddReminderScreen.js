import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CustomModal from '../components/CustomModal';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { format } from 'date-fns';
import { db } from '../firebaseConfig';
import { cancelNotification } from '../services/notificationService';
import { doc, getDoc } from 'firebase/firestore';
import { ProfileContext } from '../context/ProfileContext';
import { useLanguage } from '../context/LanguageContext';
import {
  createReminderNow,
  updateReminderNow,
  deleteReminderNow,
  queueReminderCreate,
  queueReminderUpdate,
  queueReminderDelete,
  getNetworkStatus as getReminderNetworkStatus,
} from '../services/reminderQueue';

// This screen combines "Choose Type", "Add Medicine", and "Add Appointment"
const AddReminderScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { reminderId } = route?.params ?? {};
  const isEditing = Boolean(reminderId);
  const { user, effectiveProfileId } = useContext(ProfileContext);
  const scopedProfileId = route?.params?.profileId ?? effectiveProfileId;
  const [reminderType, setReminderType] = useState('Medicine');

  // Form states
  const [medicineName, setMedicineName] = useState('');
  const [dose, setDose] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);

  // UI states
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditing);

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  // Picker states
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isTimePickerVisible, setTimePickerVisibility] = useState(false);

  // Notification state
  const [existingNotificationId, setExistingNotificationId] = useState(null);

  // Reset unused fields when switching reminder type
  useEffect(() => {
    setTime(null);
    setDate(null);
    if (reminderType === 'Medicine') {
      setDoctorName('');
      setNotes('');
    } else {
      setMedicineName('');
      setDose('');
    }
  }, [reminderType]);

  // --- Modal Helpers ---
  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    if (!modalIsError) {
      navigation.goBack();
    }
  };

  // --- Date/Time Pickers ---
  const handleDateConfirm = (selectedDate) => {
    setDate(selectedDate);
    setDatePickerVisibility(false);
  };

  const handleTimeConfirm = (selectedTime) => {
    setTime(selectedTime);
    setTimePickerVisibility(false);
  };

  const buildReminderPayload = () => {
    if (reminderType === 'Medicine') {
      if (!time) {
        return null;
      }

      const hours = time.getHours();
      const minutes = time.getMinutes();
      const nextOccurrence = new Date();
      nextOccurrence.setHours(hours, minutes, 0, 0);
      if (nextOccurrence <= new Date()) {
        nextOccurrence.setDate(nextOccurrence.getDate() + 1);
      }

      return {
        type: 'Medicine',
        scheduleType: 'daily',
        medicineName: medicineName.trim(),
        dose: dose.trim(),
        doctorName: null,
        notes: '',
        timeOfDay: {
          hour: hours,
          minute: minutes,
        },
        scheduledAtISO: nextOccurrence.toISOString(),
      };
    }

    if (!date || !time) {
      return null;
    }

    const scheduledDateTime = new Date(date);
    scheduledDateTime.setHours(time.getHours(), time.getMinutes(), 0, 0);

    return {
      type: 'Appointment',
      scheduleType: 'one-time',
      medicineName: null,
      dose: null,
      doctorName: doctorName.trim(),
      notes: notes.trim(),
      timeOfDay: null,
      scheduledAtISO: scheduledDateTime.toISOString(),
    };
  };

  // Populate form in edit mode
  useEffect(() => {
    const loadExistingReminder = async () => {
      if (!isEditing) {
        setIsLoadingExisting(false);
        return;
      }

      if (!user || !scopedProfileId) {
        showModal('Please log in to edit reminders.', true);
        setIsLoadingExisting(false);
        return;
      }

      try {
        const reminderRef = doc(
          db,
          'users',
          scopedProfileId,
          'reminders',
          reminderId
        );
        const snapshot = await getDoc(reminderRef);

        if (!snapshot.exists()) {
          showModal('Reminder not found.', true);
          setIsLoadingExisting(false);
          return;
        }

        const data = snapshot.data();
        const scheduledAt = data.scheduledAt?.toDate?.() ?? null;
        const nextType = data.type || 'Medicine';
        setReminderType(nextType);

        if (nextType === 'Medicine') {
          setMedicineName(data.medicineName || '');
          setDose(data.dose || '');

          const hour = data.timeOfDay?.hour ?? scheduledAt?.getHours() ?? 8;
          const minute = data.timeOfDay?.minute ?? scheduledAt?.getMinutes() ?? 0;
          const dailyTime = new Date();
          dailyTime.setHours(hour, minute, 0, 0);
          setTime(dailyTime);
          setDate(null);
          setDoctorName('');
          setNotes('');
        } else {
          setDoctorName(data.doctorName || '');
          setNotes(data.notes || '');
          if (scheduledAt) {
            setDate(scheduledAt);
            setTime(scheduledAt);
          } else {
            setDate(null);
            setTime(null);
          }
        }
      } catch (error) {
        console.error('Failed to load reminder:', error);
        showModal('Could not load the reminder. Please try again.', true);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    loadExistingReminder();
  }, [isEditing, reminderId, scopedProfileId, user]);

  // --- Save Logic ---
  const handleSave = async () => {
    if (isSaving || isLoadingExisting) {
      return;
    }

    if (!user || !scopedProfileId) {
      showModal('Please log in to save reminders.', true);
      return;
    }

    if (reminderType === 'Medicine') {
      if (!medicineName || !dose || !time) {
        showModal('Please fill in all medicine details.', true);
        return;
      }
    } else if (!doctorName || !date || !time) {
      showModal('Please fill in all appointment details.', true);
      return;
    }

    const payload = buildReminderPayload();
    if (!payload) {
      showModal(t('reminderSaveFailed'), true);
      return;
    }

    setIsSaving(true);

    try {
      if (isEditing && existingNotificationId) {
        await cancelNotification(existingNotificationId);
      }

      const isOnline = await getReminderNetworkStatus();

      if (isEditing) {
        if (!reminderId) {
          throw new Error('Missing reminder ID for update');
        }

        if (isOnline) {
          await updateReminderNow(scopedProfileId, reminderId, payload);
          showModal(t('reminderUpdatedSuccessfully'), false);
        } else {
          await queueReminderUpdate(scopedProfileId, reminderId, payload);
          showModal(t('reminderUpdateQueued'), false);
        }
      } else {
        if (isOnline) {
          await createReminderNow(scopedProfileId, payload);
          showModal(t('reminderAddedSuccessfully'), false);
        } else {
          await queueReminderCreate(scopedProfileId, payload);
          showModal(t('reminderQueued'), false);
        }
      }
    } catch (error) {
      console.error('Failed to save reminder:', error);
      showModal(t('reminderSaveFailed'), true);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Delete Logic ---
  const handleDelete = async () => {
    if (!user || !scopedProfileId) {
      showModal('Please log in to delete reminders.', true);
      return;
    }

    setIsSaving(true);

    try {
      if (existingNotificationId) {
        await cancelNotification(existingNotificationId);
      }

      const isOnline = await getReminderNetworkStatus();

      if (isOnline) {
        await deleteReminderNow(scopedProfileId, reminderId);
        showModal(t('reminderDeletedSuccessfully'), false);
      } else {
        await queueReminderDelete(scopedProfileId, reminderId);
        showModal(t('reminderDeleteQueued'), false);
      }
    } catch (error) {
      console.error('Failed to delete reminder:', error);
      showModal(t('reminderDeleteFailed'), true);
    } finally {
      setIsSaving(false);
    }
  };


  // --- Render Forms ---
  const renderMedicineForm = () => (
    <>
      <Text style={styles.label}>Medicine name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Paracetamol 500 mg"
        value={medicineName}
        onChangeText={setMedicineName}
      />
      <Text style={styles.label}>Dose</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., 1 tablet"
        value={dose}
        onChangeText={setDose}
      />
    </>
  );

  const renderAppointmentForm = () => (
    <>
      <Text style={styles.label}>Doctor name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Dr. Sharma"
        value={doctorName}
        onChangeText={setDoctorName}
      />
      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="e.g., Follow-up for skin rash"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
    </>
  );

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
          {isEditing ? 'Edit Reminder' : 'Add Reminder'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {isLoadingExisting ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingText}>Loading reminder…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Reminder Type</Text>
            <View style={styles.typeContainer}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  reminderType === 'Medicine' && styles.typeButtonActive,
                ]}
                onPress={() => setReminderType('Medicine')}
              >
                <MaterialCommunityIcons
                  name="pill"
                  size={24}
                  color={reminderType === 'Medicine' ? '#007AFF' : '#666'}
                />
                <Text
                  style={[
                    styles.typeText,
                    reminderType === 'Medicine' && styles.typeTextActive,
                  ]}
                >
                  Medicine
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  reminderType === 'Appointment' && styles.typeButtonActive,
                ]}
                onPress={() => setReminderType('Appointment')}
              >
                <MaterialCommunityIcons
                  name="calendar-clock"
                  size={24}
                  color={reminderType === 'Appointment' ? '#007AFF' : '#666'}
                />
                <Text
                  style={[
                    styles.typeText,
                    reminderType === 'Appointment' && styles.typeTextActive,
                  ]}
                >
                  Appointment
                </Text>
              </TouchableOpacity>
            </View>

            {reminderType === 'Medicine' ? (
              <>
                {renderMedicineForm()}
                <Text style={styles.label}>Alarm time</Text>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => setTimePickerVisibility(true)}
                >
                  <Text style={styles.dateInputText}>
                    {time ? format(time, 'hh:mm aa') : 'Select a time'}
                  </Text>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={24}
                    color="#007AFF"
                  />
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  Reminder repeats daily at the chosen time.
                </Text>
              </>
            ) : (
              <>
                {renderAppointmentForm()}
                <Text style={styles.label}>Pick a Date</Text>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => setDatePickerVisibility(true)}
                >
                  <Text style={styles.dateInputText}>
                    {date
                      ? format(date, 'EEEE, dd MMMM yyyy')
                      : 'Select a date'}
                  </Text>
                  <MaterialCommunityIcons
                    name="calendar"
                    size={24}
                    color="#007AFF"
                  />
                </TouchableOpacity>

                <Text style={styles.label}>Choose a time</Text>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => setTimePickerVisibility(true)}
                >
                  <Text style={styles.dateInputText}>
                    {time ? format(time, 'hh:mm aa') : 'Select a time'}
                  </Text>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={24}
                    color="#007AFF"
                  />
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (isSaving || isLoadingExisting) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={isSaving || isLoadingExisting}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? 'Update Reminder' : 'Save Reminder'}
            </Text>
          )}
        </TouchableOpacity>

        {isEditing && (
          <TouchableOpacity
            style={[
              styles.deleteButton,
              (isSaving || isLoadingExisting) && styles.deleteButtonDisabled,
            ]}
            onPress={handleDelete}
            disabled={isSaving || isLoadingExisting}
          >
            {isSaving ? (
              <ActivityIndicator color="#FF3B30" />
            ) : (
              <MaterialCommunityIcons name="trash-can" size={20} color="#FF3B30" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Modals */}
      <CustomModal
        isVisible={modalVisible}
        message={modalMessage}
        isError={modalIsError}
        onClose={closeModal}
      />
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={() => setDatePickerVisibility(false)}
      />
      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        onConfirm={handleTimeConfirm}
        onCancel={() => setTimePickerVisibility(false)}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    marginLeft: 5,
  },
  helperText: {
    fontSize: 13,
    color: '#777',
    marginBottom: 15,
    marginLeft: 5,
  },
  typeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    marginHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  typeText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 10,
  },
  typeTextActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  dateInput: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateInputText: {
    fontSize: 16,
    color: '#333',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF3B30',
    paddingVertical: 15,
    borderRadius: 10,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
});

export default AddReminderScreen;