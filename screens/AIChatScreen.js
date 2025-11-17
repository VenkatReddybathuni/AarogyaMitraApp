import React, { useState, useRef, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  Image,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';
import { useLanguage } from '../context/LanguageContext';
import BottomNavBar from '../components/BottomNavBar';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../firebaseConfig';
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { ProfileContext } from '../context/ProfileContext';
import {
  SUPPORTED_SPECIALTIES,
  getFallbackDoctorsBySpecialty,
  normalizeSpecialtyLabel,
  fallbackDoctors,
} from '../constants/doctorDirectory';

const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=';
const API_KEY = Constants.expoConfig?.extra?.geminiApiKey ?? '';
const SYMPTOM_SYSTEM_PROMPT = `You are "AarogyaMitra," a friendly and cautious AI symptom checker for a rural telehealth app.
- NEVER provide a diagnosis.
- Ask clarifying questions one at a time.
- Keep language simple and low-literacy friendly.
- Final response must either suggest safe self-care or recommend seeing a doctor.
- When unsure, choose the safe option and escalate to a clinician.
- Be empathetic and brief.`;

const LANGUAGE_RESPONSE_GUIDANCE = {
  hi: {
    label: 'Hindi',
    instruction:
      'The user prefers Hindi. Respond ONLY in conversational Hindi (Devanagari script), keeping sentences short, friendly, and easy to read. Repeat user-provided names or medicines as they are, but explain everything else in Hindi.',
  },
  en: {
    label: 'English',
    instruction:
      'The user prefers English. Respond in warm, plain English that is easy to read, using simple sentences and avoiding medical jargon.',
  },
};

const buildSymptomSystemPrompt = (language = 'en') => {
  const guidance = LANGUAGE_RESPONSE_GUIDANCE[language] || LANGUAGE_RESPONSE_GUIDANCE.en;
  return `${SYMPTOM_SYSTEM_PROMPT}

Language preference: ${guidance.instruction}`;
};

const YES_KEYWORDS = ['yes', 'yeah', 'sure', 'ok', 'okay', 'haan', 'ha', 'hn', 'si', 'ya'];
const NO_KEYWORDS = ['no', 'nope', 'na', 'nah', 'not', "don't", 'dont', 'nahi', 'nahin'];

const mapToSupportedSpecialty = (label) => {
  const normalized = normalizeSpecialtyLabel(label || '');
  if (!normalized) {
    return 'General Medicine';
  }
  if (SUPPORTED_SPECIALTIES.includes(normalized)) {
    return normalized;
  }
  return 'General Medicine';
};

const normalizeDoctorName = (value = '') =>
  value
    .replace(/dr\.?/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const levenshteinDistance = (a = '', b = '') => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
};

const computeNameSimilarity = (inputNorm, targetNorm) => {
  if (!inputNorm || !targetNorm) return 0;
  if (targetNorm.includes(inputNorm) || inputNorm.includes(targetNorm)) {
    return Math.min(inputNorm.length, targetNorm.length) / Math.max(inputNorm.length, targetNorm.length);
  }
  const distance = levenshteinDistance(inputNorm, targetNorm);
  const maxLen = Math.max(inputNorm.length, targetNorm.length) || 1;
  return 1 - distance / maxLen;
};

const parseAiJsonResponse = (rawText) => {
  if (!rawText) {
    return null;
  }

  let trimmed = rawText.trim();

  if (trimmed.startsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline !== -1) {
      trimmed = trimmed.slice(firstNewline + 1);
    }
    if (trimmed.endsWith('```')) {
      trimmed = trimmed.slice(0, -3);
    }
    trimmed = trimmed.trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    trimmed = trimmed.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn('Failed to parse AI JSON response:', trimmed);
    return null;
  }
};

const mergeWithFallbackDoctors = (primaryList = []) => {
  if (!primaryList.length) {
    return [...fallbackDoctors];
  }
  const seenKeys = new Set(primaryList.map(doc => (doc.id || doc.name || '').toLowerCase()));
  const merged = [...primaryList];
  fallbackDoctors.forEach((doctor) => {
    const key = (doctor.id || doctor.name || '').toLowerCase();
    if (!seenKeys.has(key)) {
      merged.push(doctor);
      seenKeys.add(key);
    }
  });
  return merged;
};

const loadDoctorDirectory = async (directoryRef) => {
  if (directoryRef.current.loaded && directoryRef.current.doctors.length) {
    return directoryRef.current.doctors;
  }

  let doctors = [];
  try {
    const doctorsRef = collection(db, 'doctors');
    const snapshot = await getDocs(doctorsRef);
    doctors = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.error('Failed to load doctor directory:', error);
  }

  const merged = mergeWithFallbackDoctors(doctors);
  directoryRef.current = {
    loaded: true,
    doctors: merged,
  };
  return merged;
};

const findDoctorMatchesByName = async (directoryRef, inputName) => {
  const normalizedInput = normalizeDoctorName(inputName);
  if (!normalizedInput) {
    return { exactMatch: null, suggestions: [] };
  }

  const doctors = await loadDoctorDirectory(directoryRef);
  let exactMatch = null;
  const scoredSuggestions = [];

  doctors.forEach((doctor) => {
    const normalizedDoctorName = normalizeDoctorName(doctor.name || '');
    if (!normalizedDoctorName) {
      return;
    }

    if (!exactMatch && normalizedDoctorName === normalizedInput) {
      exactMatch = doctor;
      return;
    }

    const similarity = computeNameSimilarity(normalizedInput, normalizedDoctorName);
    if (similarity >= 0.5) {
      scoredSuggestions.push({ doctor, similarity });
    }
  });

  const suggestions = scoredSuggestions
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
    .map(entry => entry.doctor);

  return { exactMatch, suggestions };
};

const AIChatScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user, effectiveProfileId } = useContext(ProfileContext);
  const [messages, setMessages] = useState([]);
  const [currentState, setCurrentState] = useState('main_menu');
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [chatContext, setChatContext] = useState({});
  const messageSeqRef = useRef(0);
  const [selectedImages, setSelectedImages] = useState([]);
  const [symptomMessages, setSymptomMessages] = useState([]);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarSelectionDate, setCalendarSelectionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timePickerTitle, setTimePickerTitle] = useState(t('selectTime'));
  const [timePickerSubtitle, setTimePickerSubtitle] = useState(t('clockPickerSubtitleDefault'));
  const [timePickerContext, setTimePickerContext] = useState(null);
  const [clockSelection, setClockSelection] = useState(() => {
    const now = new Date();
    let roundedMinute = Math.round(now.getMinutes() / 5) * 5;
    let hour24 = now.getHours();
    if (roundedMinute === 60) {
      roundedMinute = 0;
      hour24 = (hour24 + 1) % 24;
    }
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const period = hour24 >= 12 ? 'PM' : 'AM';
    return { hour: hour12, minute: roundedMinute, period };
  });
  const scrollViewRef = useRef(null);
  const doctorDirectoryRef = useRef({ loaded: false, doctors: [] });

  const generateMessageId = (prefix = 'msg') => {
    messageSeqRef.current += 1;
    return `${prefix}-${Date.now()}-${messageSeqRef.current}`;
  };

  // Initialize with fresh welcome message every time (simple, no persistence)
  useEffect(() => {
    // Show welcome message
    const welcomeMessage = {
      id: generateMessageId('ai'),
      text: t('aiChatWelcome'),
      sender: 'ai',
      type: 'text',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
    setCurrentState('main_menu');
    setChatContext({});

    // Show main menu buttons after brief delay
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: generateMessageId('ai'),
        text: t('whatCanIHelpYouWith'),
        sender: 'ai',
        type: 'buttons',
        buttons: [
          { label: t('notFeelingWell'), action: 'symptom_check' },
          { label: t('recordMyVitals'), action: 'record_vitals' },
          { label: t('bookAppointment'), action: 'appointments' },
          { label: t('addReminder'), action: 'reminders' },
          { label: t('medicalDocuments'), action: 'medical_docs' },
        ],
        timestamp: new Date(),
      }]);
    }, 500);
  }, [t]);

  useEffect(() => {
    loadDoctorDirectory(doctorDirectoryRef).catch((error) => {
      console.warn('Prefetch doctor directory failed', error);
    });
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setTimePickerTitle(t('selectTime'));
    setTimePickerSubtitle(t('clockPickerSubtitleDefault'));
  }, [t]);

  const addAIMessage = (text, type = 'text', buttons = null) => {
    const aiMsg = {
      id: generateMessageId('ai'),
      text,
      sender: 'ai',
      type,
      buttons,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsLoading(false);
  };

  const addUserMessage = (text, images = []) => {
    const userMsg = {
      id: generateMessageId('user'),
      text,
      sender: 'user',
      type: 'text',
      images,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
  };

  const localizeSpecialtyLabel = (specialty) => {
    if (!specialty) {
      return t('generalCheckup');
    }
    const normalized = normalizeSpecialtyLabel(specialty) || specialty;
    const lookup = (normalized || '').toLowerCase();
    const mapping = {
      'general medicine': t('generalCheckup'),
      cardiology: t('cardiology'),
      neurology: t('neurology'),
      dermatology: t('dermatology'),
    };
    return mapping[lookup] || normalized || specialty;
  };

  const appendImageAsset = (asset) => {
    if (!asset?.uri || !asset?.base64) {
      Alert.alert('Image Error', 'Unable to read the selected image.');
      return;
    }

    setSelectedImages(prev => [
      ...prev,
      {
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
      },
    ]);
  };

  const pickImageFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets?.length) {
        appendImageAsset(result.assets[0]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Image Error', 'Could not open gallery.');
    }
  };

  const captureImageWithCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.length) {
        appendImageAsset(result.assets[0]);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Camera Error', 'Could not capture image.');
    }
  };

  const handleAttachPress = () => {
    const options = ['Choose from Gallery', 'Take a Photo', 'Cancel'];
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) pickImageFromLibrary();
          else if (buttonIndex === 1) captureImageWithCamera();
        }
      );
    } else {
      Alert.alert('Attach Image', 'Choose an option', [
        { text: 'Gallery', onPress: pickImageFromLibrary },
        { text: 'Camera', onPress: captureImageWithCamera },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleRemoveImage = (index) => {
    setSelectedImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleMainMenuSelection = (action) => {
    setIsLoading(true);

    if (action === 'symptom_check') {
      setCurrentState('symptom_chat');
      setChatContext({});
      setSelectedImages([]);
      const introMessage = {
        id: `symptom-ai-${Date.now()}`,
        text: t('describeSymptomsInDetail'),
        sender: 'ai',
      };
      setSymptomMessages([introMessage]);
      setTimeout(() => {
        addAIMessage(t('describeSymptomsInDetail'));
      }, 300);
    } else if (action === 'record_vitals') {
      setCurrentState('vitals_chat');
      setTimeout(() => {
        addAIMessage(t('whichVitalToRecordChat'), 'buttons', [
          { label: t('bloodPressure'), action: 'vital_bp_record' },
          { label: t('bloodSugar'), action: 'vital_sugar_record' },
          { label: t('temperature'), action: 'vital_temp_record' },
          { label: t('heartRate'), action: 'vital_hr_record' },
          { label: t('weight'), action: 'vital_weight_record' },
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 300);
    } else if (action === 'appointments') {
      setCurrentState('appointments_chat');
      setTimeout(() => {
        addAIMessage(t('appointmentQuestion'), 'buttons', [
          { label: t('haveDoctor'), action: 'have_doctor' },
          { label: t('needSuggestion'), action: 'need_suggestion' },
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 300);
    } else if (action === 'reminders') {
      setCurrentState('reminders_select');
      setTimeout(() => {
        addAIMessage(t('reminderType'), 'buttons', [
          { label: t('medicineReminder'), action: 'medicine_reminder' },
          { label: t('appointmentReminder'), action: 'appointment_reminder' },
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 300);
    } else if (action === 'medical_docs') {
      setCurrentState('medical_docs_chat');
      setTimeout(() => {
        addAIMessage(t('documentUploadQuestion'), 'buttons', [
          { label: t('yes'), action: 'upload_document', navTo: 'MedicalDocuments' },
          { label: t('no'), action: 'skip_document' },
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 300);
    }
  };

  const handleAppointmentFlow = (action) => {
    setShowCalendarPicker(false);
    setShowTimePicker(false);
    setTimePickerContext(null);
    if (action === 'have_doctor') {
      setChatContext({
        hasDoctor: true,
        appointmentNotes: '',
        appointmentFlowOrigin: 'known_doctor',
        step: 'problem_description',
        doctorName: '',
        doctorId: null,
        appointmentDate: null,
        appointmentTime: null,
        pendingDate: null,
        pendingAppointmentTime: null,
        specialty: 'General',
        pendingDoctorInput: '',
        doctorSuggestionOptions: [],
      });
      setCurrentState('appointments_chat_problem');
      setTimeout(() => {
        addAIMessage(t('describeProblem'));
      }, 300);
    } else if (action === 'need_suggestion') {
      startSuggestedDoctorFlow();
    }
  };

  const handleSpecialtySelection = (action) => {
    const specialty = action.split('_')[1];
    setChatContext({ ...chatContext, specialty });
    setCurrentState('appointments_chat_dates');

    const bookingMsg = t(`bookingWith${specialty.charAt(0).toUpperCase() + specialty.slice(1)}`);
    addAIMessage(bookingMsg);

    setTimeout(() => {
      addAIMessage(t('proceedToBookQuestion'), 'buttons', [
        { label: t('proceedToBook'), action: 'proceed_appointment_book', navTo: 'BookAppointment' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    }, 500);
  };

  const handleMedicineReminder = () => {
    setCurrentState('medicine_reminder_chat');
    setChatContext({ ...chatContext, step: 'tablet_name' });
    setTimeout(() => {
      addAIMessage(t('medicineNamePrompt'));
    }, 300);
  };

  const handleAppointmentReminder = () => {
    setShowCalendarPicker(false);
    setShowTimePicker(false);
    setTimePickerContext(null);
    setCurrentState('appointment_reminder_chat');
    setChatContext({
      step: 'doctor_name',
      appointmentFlowOrigin: 'reminders',
      appointmentNotes: '',
      doctorName: '',
      appointmentDate: null,
      appointmentTime: null,
      pendingDate: null,
      pendingAppointmentTime: null,
      specialty: 'General',
    });
    setTimeout(() => {
      addAIMessage(t('doctorName'));
    }, 300);
  };

  const promptDateConfirmation = (formattedText) => {
    addAIMessage(
      t('confirmParsedTime').replace('{value}', formattedText),
      'buttons',
      [
        { label: t('yes'), action: 'confirm_date_yes' },
        { label: t('no'), action: 'confirm_date_no' },
      ]
    );
  };

  const promptTimeConfirmation = (formattedText) => {
    addAIMessage(
      t('confirmParsedTime').replace('{value}', formattedText),
      'buttons',
      [
        { label: t('yes'), action: 'confirm_appointment_time_yes' },
        { label: t('no'), action: 'confirm_appointment_time_no' },
      ]
    );
  };

  const formatTimeLabel = (hour24, minute) => {
    const reference = new Date();
    reference.setHours(hour24, minute, 0, 0);
    return format(reference, 'hh:mm a');
  };

  const convertTo24Hour = (hour12, period) => {
    let hour24 = hour12 % 12;
    if (period === 'PM') {
      hour24 += 12;
    }
    if (period === 'AM' && hour12 === 12) {
      hour24 = 0;
    }
    if (period === 'PM' && hour12 === 12) {
      hour24 = 12;
    }
    return hour24;
  };

  const openClockPicker = (context, options = {}) => {
    const now = new Date();
    const baseDate = options.defaultDate || now;
    let hour24 = typeof options.hour === 'number' ? options.hour : baseDate.getHours();
    let minute = typeof options.minute === 'number' ? options.minute : Math.round(baseDate.getMinutes() / 5) * 5;
    if (minute === 60) {
      minute = 0;
      hour24 = (hour24 + 1) % 24;
    }
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const period = hour24 >= 12 ? 'PM' : 'AM';

    setClockSelection({ hour: hour12, minute, period });
    setTimePickerTitle(options.title || t('selectTime'));
    setTimePickerSubtitle(options.subtitle || t('clockPickerSubtitleDefault'));
    setTimePickerContext(context);
    setShowTimePicker(true);
  };

  const handleClockConfirm = () => {
    const hour24 = convertTo24Hour(clockSelection.hour, clockSelection.period);
    const minute = clockSelection.minute;
    const label = formatTimeLabel(hour24, minute);
    setShowTimePicker(false);

    if (timePickerContext === 'appointment') {
      const appointmentDate = chatContext.appointmentDate ? new Date(chatContext.appointmentDate) : null;
      if (!appointmentDate) {
        addAIMessage(t('chooseDateFirst'));
        return;
      }

      const selectedDateTime = new Date(appointmentDate);
      selectedDateTime.setHours(hour24, minute, 0, 0);
      const now = new Date();
      if (selectedDateTime <= now) {
        addAIMessage(t('chooseFutureTime'));
        setTimeout(() => {
          openClockPicker('appointment', {
            title: `${t('selectTime')} • ${format(appointmentDate, 'MMM d')}`,
            subtitle: t('chooseFutureTime'),
            hour: hour24,
            minute,
          });
        }, 200);
        return;
      }

      setChatContext(prev => ({
        ...prev,
        pendingAppointmentTime: `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        step: 'confirm_appointment_time',
      }));
      promptTimeConfirmation(label);
    } else if (timePickerContext === 'medicine') {
      if (!chatContext.tabletName || !chatContext.tabletDosage) {
        addAIMessage(t('provideMedicineBeforeReminder'));
        return;
      }

      setChatContext(prev => ({
        ...prev,
        tabletTime: { hour: hour24, minute },
        pendingTime: null,
        step: 'save_medicine',
      }));

      saveMedicineReminder(
        chatContext.tabletName,
        chatContext.tabletDosage,
        { hour: hour24, minute }
      );
    }

    setTimePickerContext(null);
  };

  const handleCalendarDaySelect = (day) => {
    const selectedDate = new Date(day.dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      addAIMessage(t('dateAlreadyPassed'));
      return;
    }

    setCalendarSelectionDate(day.dateString);
    setShowCalendarPicker(false);

    const parsedValue = format(selectedDate, 'dd-MM-yyyy');
    const friendlyDate = format(selectedDate, 'dd MMM yyyy');

    setChatContext(prev => ({
      ...prev,
      pendingDate: parsedValue,
      step: 'confirm_date',
    }));

    setTimeout(() => {
      promptDateConfirmation(friendlyDate);
    }, 150);
  };

  const handleAppointmentDateTimeInput = async (messageText) => {
    if (messageText !== '__calendar_trigger__') {
      setShowCalendarPicker(false);
    }
    if (messageText !== '__timepicker_trigger__') {
      setShowTimePicker(false);
    }

    if (messageText === '__calendar_trigger__') {
      let defaultDate = format(new Date(), 'yyyy-MM-dd');
      if (chatContext.pendingDate) {
        const [day, month, year] = chatContext.pendingDate.split('-').map(Number);
        defaultDate = format(new Date(year, month - 1, day), 'yyyy-MM-dd');
      } else if (chatContext.appointmentDate) {
        defaultDate = format(new Date(chatContext.appointmentDate), 'yyyy-MM-dd');
      }
      setCalendarSelectionDate(defaultDate);
      if (chatContext.step !== 'appointment_date_ask') {
        setChatContext(prev => ({ ...prev, step: 'appointment_date_ask' }));
      }
      setShowCalendarPicker(true);
      return true;
    }

    if (messageText === '__timepicker_trigger__') {
      if (chatContext.step !== 'appointment_time_ask') {
        setChatContext(prev => ({ ...prev, step: 'appointment_time_ask' }));
      }
      const appointmentDate = chatContext.appointmentDate ? new Date(chatContext.appointmentDate) : null;
      openClockPicker('appointment', {
        title: appointmentDate
          ? `${t('selectTime')} • ${format(appointmentDate, 'MMM d')}`
          : t('selectTime'),
        subtitle: t('chooseFutureTime'),
        defaultDate: appointmentDate || new Date(),
      });
      return true;
    }

    if (chatContext.step === 'appointment_date_ask') {
      const parseResult = await parseAndConfirmInput(messageText, 'date');
      if (parseResult.isValid) {
        setChatContext(prev => ({
          ...prev,
          pendingDate: parseResult.parsed,
          step: 'confirm_date',
        }));

        promptDateConfirmation(parseResult.formatted);
      } else {
        addAIMessage(
          t('dateParseHint').replace('{userInput}', messageText)
        );
        handleAppointmentDateTimeInput('__calendar_trigger__');
      }
      return true;
    }

    if (chatContext.step === 'appointment_time_ask') {
      const parseResult = await parseAndConfirmInput(messageText, 'time');
      if (parseResult.isValid) {
        setChatContext(prev => ({
          ...prev,
          pendingAppointmentTime: parseResult.parsed,
          step: 'confirm_appointment_time',
        }));

        promptTimeConfirmation(parseResult.formatted);
      } else {
        addAIMessage(
          t('timeParseHint').replace('{userInput}', messageText)
        );
        handleAppointmentDateTimeInput('__timepicker_trigger__');
      }
      return true;
    }

    return false;
  };

  const proceedToAppointmentScheduling = (doctorNameValue, specialtyValue = 'General Medicine', doctorIdValue = null) => {
  const resolvedName = doctorNameValue?.trim?.() || t('genericDoctorName');
    setChatContext(prev => ({
      ...prev,
      doctorName: resolvedName,
      doctorId: doctorIdValue,
      specialty: specialtyValue || prev.specialty || 'General Medicine',
      step: 'appointment_date_ask',
      pendingDoctorInput: '',
      doctorSuggestionOptions: [],
    }));

    setTimeout(() => {
      addAIMessage(`${t('appointmentDate')}: ${t('appointmentDatePrompt')}`);
      handleAppointmentDateTimeInput('__calendar_trigger__');
    }, 300);
  };

  const promptDoctorSuggestions = (suggestions, originalInput, introText = t('doctorSuggestionPrompt')) => {
    if (!suggestions?.length) {
      setTimeout(() => {
        addAIMessage(t('doctorNameNoMatch'));
      }, 100);
      return;
    }

    const buttons = suggestions.map((doctor, index) => ({
      label: doctor.name,
      action: `known_doctor_select_${index}`,
    }));

    if (originalInput) {
      buttons.push({
        label: t('keepDoctorName').replace('{doctorName}', originalInput),
        action: 'confirm_manual_doctor',
      });
    }
    buttons.push({ label: t('reenterName'), action: 'doctor_retry_name' });

    addAIMessage(introText, 'buttons', buttons);
  };

  const handleKnownDoctorSuggestionSelection = (index) => {
    const suggestions = chatContext.doctorSuggestionOptions || [];
    if (!Array.isArray(suggestions) || index < 0 || index >= suggestions.length) {
      addAIMessage(t('doctorOptionNotFound'));
      return;
    }

    const doctor = suggestions[index];
    proceedToAppointmentScheduling(
      doctor.name,
      doctor.specialization || chatContext.specialty || 'General Medicine',
      doctor.id || null
    );
  };

  const confirmManualDoctorChoice = () => {
    const manualName = chatContext.pendingDoctorInput?.trim?.() || chatContext.doctorName || t('genericDoctorName');
    addAIMessage(t('continueWithDoctor').replace('{doctorName}', manualName));
    proceedToAppointmentScheduling(manualName, chatContext.specialty || 'General Medicine');
  };

  const askDoctorNameAgain = () => {
    setChatContext(prev => ({
      ...prev,
      doctorSuggestionOptions: [],
      pendingDoctorInput: '',
    }));
    setTimeout(() => {
      addAIMessage(t('typeDoctorNameAgain'));
    }, 200);
  };

  const handleKnownDoctorAppointmentInput = async (messageText) => {
    if (!chatContext.step || chatContext.step === 'problem_description') {
      const notes = messageText.trim();
      setChatContext(prev => ({
        ...prev,
        appointmentNotes: notes,
        step: 'doctor_name',
      }));

      setTimeout(() => {
        addAIMessage(t('askDoctorNameThanks'));
      }, 300);

      if (notes) {
        inferSpecialtyFromSymptoms(notes).then((analysis) => {
          setChatContext(prev => ({
            ...prev,
            inferredSpecialty: analysis.specialty || prev.inferredSpecialty || prev.specialty || 'General Medicine',
            specialty: analysis.specialty || prev.specialty || 'General Medicine',
            symptomSummary: analysis.symptomSummary || notes,
          }));
        }).catch((error) => {
          console.warn('Specialty inference for known doctor flow failed', error);
        });
      }
      return;
    }

    if (chatContext.step === 'doctor_name') {
      const trimmedName = messageText.trim();
      if (!trimmedName) {
        addAIMessage(t('askDoctorNameContinue'));
        return;
      }

      setChatContext(prev => ({
        ...prev,
        pendingDoctorInput: trimmedName,
        doctorSuggestionOptions: [],
      }));

      addAIMessage(t('checkingDoctorDirectory'));

      const { exactMatch, suggestions } = await findDoctorMatchesByName(doctorDirectoryRef, trimmedName);
      if (exactMatch) {
        proceedToAppointmentScheduling(
          exactMatch.name,
          exactMatch.specialization || chatContext.specialty || 'General Medicine',
          exactMatch.id || null
        );
        return;
      }

      if (suggestions.length) {
        setChatContext(prev => ({
          ...prev,
          doctorSuggestionOptions: suggestions,
        }));
        promptDoctorSuggestions(suggestions, trimmedName);
        return;
      }

      const specialty = chatContext.inferredSpecialty || chatContext.specialty || 'General Medicine';
      const specialtyDoctors = await fetchDoctorsForSpecialty(specialty);
      if (specialtyDoctors.length) {
        const topDoctors = specialtyDoctors.slice(0, 3);
        setChatContext(prev => ({
          ...prev,
          doctorSuggestionOptions: topDoctors,
        }));
        const summaryText = chatContext.symptomSummary || chatContext.appointmentNotes || t('yourConcern');
        const introText = t('doctorSuggestionSymptomIntro')
          .replace('{doctorName}', trimmedName)
          .replace('{summary}', summaryText)
          .replace('{specialty}', localizeSpecialtyLabel(specialty));
        promptDoctorSuggestions(topDoctors, trimmedName, introText);
        return;
      }

      addAIMessage(t('doctorNameFallback').replace('{doctorName}', trimmedName));
      proceedToAppointmentScheduling(trimmedName, specialty);
      return;
    }

    const handled = await handleAppointmentDateTimeInput(messageText);
    if (!handled) {
      addAIMessage(t('appointmentAlreadyScheduled'));
    }
  };

  const handleAppointmentReminderInput = async (messageText) => {
    if (chatContext.step === 'doctor_name') {
      const intent = await analyzeUserIntent(messageText, 'doctor_name', 'Expected doctor name or "I don\'t know"');

      if (intent.intent === 'medicine_name' && intent.confidence > 0.7) {
        setChatContext(prev => ({ ...prev, doctorName: messageText, step: 'appointment_date_ask' }));
      } else if (intent.intent === 'dont_know' && intent.confidence > 0.7) {
        setChatContext(prev => ({ ...prev, doctorName: t('genericDoctorName'), step: 'appointment_date_ask' }));
      } else {
        setChatContext(prev => ({ ...prev, doctorName: messageText, step: 'appointment_date_ask' }));
      }

      setTimeout(() => {
        addAIMessage(`${t('appointmentDate')}: ${t('appointmentDatePrompt')}`);
        handleAppointmentDateTimeInput('__calendar_trigger__');
      }, 300);
      return;
    }

    const handled = await handleAppointmentDateTimeInput(messageText);
    if (!handled) {
      addAIMessage(t('reminderReady'));
    }
  };

  const handleVitalsFlow = () => {
    setCurrentState('vitals_selection');
    setTimeout(() => {
      addAIMessage(t('whichVitalToRecordChat'), 'buttons', [
        { label: t('bloodPressure'), action: 'select_vital_bp' },
        { label: t('bloodSugar'), action: 'select_vital_sugar' },
        { label: t('temperature'), action: 'select_vital_temp' },
        { label: t('heartRate'), action: 'select_vital_hr' },
        { label: t('weight'), action: 'select_vital_weight' },
        { label: t('spO2'), action: 'select_vital_spo2' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    }, 300);
  };

  const handleVitalSelection = (vitalType) => {
    setChatContext({ 
      ...chatContext, 
      selectedVital: vitalType,
      vitalStep: 'awaiting_input' 
    });
    
    const vitalNames = {
      bp: t('bloodPressure'),
      sugar: t('bloodSugar'),
      temp: t('temperature'),
      hr: t('heartRate'),
      weight: t('weight'),
      spo2: 'SpO2',
    };

    setCurrentState('vitals_input');
    
    setTimeout(() => {
      if (vitalType === 'bp') {
        addAIMessage(t('bpInstructions'));
      } else if (vitalType === 'sugar') {
        addAIMessage(t('sugarInstructions'));
      } else if (vitalType === 'temp') {
        addAIMessage(t('tempInstructions'));
      } else if (vitalType === 'hr') {
        addAIMessage(t('hrInstructions'));
      } else if (vitalType === 'weight') {
        addAIMessage(t('weightInstructions'));
      } else if (vitalType === 'spo2') {
        addAIMessage(t('spo2Instructions'));
      }
    }, 300);
  };

  const validateVitalReading = (reading, vitalType) => {
    // Remove whitespace and split
    const values = reading.trim().split(/[\s\/]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));

    if (vitalType === 'bp') {
      // BP needs 2 values: systolic and diastolic (e.g., "120 80" or "120/80")
      if (values.length !== 2) {
        return { valid: false, message: t('bpFormatError') };
      }
      const [systolic, diastolic] = values;
      if (systolic < 60 || systolic > 250 || diastolic < 30 || diastolic > 150) {
        return { valid: false, message: t('bpRangeError') };
      }
      return { valid: true, data: { systolic, diastolic } };
    } 
    else if (vitalType === 'sugar') {
      // Blood sugar needs 1 value (e.g., "120")
      if (values.length !== 1) {
        return { valid: false, message: t('sugarFormatError') };
      }
      const sugar = values[0];
      if (sugar < 50 || sugar > 500) {
        return { valid: false, message: t('sugarRangeError') };
      }
      return { valid: true, data: { level: sugar } };
    }
    else if (vitalType === 'temp') {
      // Temperature needs 1 value (e.g., "98.6")
      if (values.length !== 1) {
        return { valid: false, message: t('tempFormatError') };
      }
      const temp = values[0];
      if (temp < 95 || temp > 105) {
        return { valid: false, message: t('tempRangeError') };
      }
      return { valid: true, data: { value: temp } };
    }
    else if (vitalType === 'hr') {
      // Heart rate needs 1 value (e.g., "72")
      if (values.length !== 1) {
        return { valid: false, message: t('hrFormatError') };
      }
      const hr = values[0];
      if (hr < 40 || hr > 200) {
        return { valid: false, message: t('hrRangeError') };
      }
      return { valid: true, data: { bpm: hr } };
    }
    else if (vitalType === 'weight') {
      // Weight needs 1 value (e.g., "70")
      if (values.length !== 1) {
        return { valid: false, message: t('weightFormatError') };
      }
      const weight = values[0];
      if (weight < 10 || weight > 250) {
        return { valid: false, message: t('weightRangeError') };
      }
      return { valid: true, data: { kg: weight } };
    }
    else if (vitalType === 'spo2') {
      // SpO2 needs 1 value (e.g., "98")
      if (values.length !== 1) {
        return { valid: false, message: t('spo2FormatError') };
      }
      const spo2 = values[0];
      if (spo2 < 70 || spo2 > 100) {
        return { valid: false, message: t('spo2RangeError') };
      }
      return { valid: true, data: { percentage: spo2 } };
    }
  };

  const saveVitalReading = async (vitalType, vitalData) => {
    // Save to Firebase using the same structure as RecordVitalsScreen
    if (!user) {
      console.error('User not authenticated');
      addAIMessage(t('errorSavingVital'), 'buttons', [
        { label: t('tryAgain'), action: 'record_vitals' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
      return;
    }

    try {
      const vitalsRef = collection(db, 'users', effectiveProfileId, 'vitals');
      
      // Prepare data based on vital type
      let recordData = {};
      let vitalName = '';
      let valueString = '';
      
      if (vitalType === 'bp') {
        recordData = {
          systolic: vitalData.systolic,
          diastolic: vitalData.diastolic,
        };
        valueString = `${vitalData.systolic} / ${vitalData.diastolic} mmHg`;
        vitalName = t('bloodPressure');
      } else if (vitalType === 'sugar') {
        recordData = {
          level: vitalData.level,
          type: t('fasting'), // Default to fasting
        };
        valueString = `${vitalData.level} mg/dL (${t('fasting')})`;
        vitalName = t('bloodSugar');
      } else if (vitalType === 'temp') {
        recordData = {
          value: vitalData.value,
          unit: '°F',
        };
        valueString = `${vitalData.value} °F`;
        vitalName = t('temperature');
      } else if (vitalType === 'hr') {
        recordData = {
          bpm: vitalData.bpm,
        };
        valueString = `${vitalData.bpm} BPM`;
        vitalName = t('heartRate');
      } else if (vitalType === 'weight') {
        recordData = {
          kg: vitalData.kg,
        };
        valueString = `${vitalData.kg} kg`;
        vitalName = t('weight');
      } else if (vitalType === 'spo2') {
        recordData = {
          percentage: vitalData.percentage,
        };
        valueString = `${vitalData.percentage} %`;
        vitalName = 'SpO2';
      }

      // Evaluate the reading to determine status
      const status = evaluateVitalReading(vitalType, recordData);

      // Save to Firestore
      await addDoc(vitalsRef, {
        vitalId: vitalType,
        vitalName,
        ...recordData,
        valueString,
        status: status.status,
        statusMessage: status.message,
        recordedAt: serverTimestamp(),
      });

      console.log('Vital saved successfully:', vitalType, recordData);

      // Show success message
      addAIMessage(t('vitalSavedSuccessfully'), 'buttons', [
        { label: t('recordAnother'), action: 'record_vitals' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    } catch (error) {
      console.error('Error saving vital:', error);
      addAIMessage(t('errorSavingVital'), 'buttons', [
        { label: t('tryAgain'), action: 'record_vitals' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    }
  };

  // Evaluate vital reading for status (normal/low/high/critical)
  const evaluateVitalReading = (vitalId, data) => {
    let status = 'normal';
    let message = '';

    try {
      switch (vitalId) {
        case 'bp': {
          const systolic = Number(data.systolic);
          const diastolic = Number(data.diastolic);
          if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) break;
          if (systolic >= 180 || diastolic >= 120) {
            status = 'critical';
            message = t('hypertensiveCrisis');
          } else if (systolic >= 140 || diastolic >= 90) {
            status = 'high';
            message = t('highBP');
          } else if (systolic < 90 || diastolic < 60) {
            status = 'low';
            message = t('lowBP');
          }
          break;
        }
        case 'sugar': {
          const level = Number(data.level);
          if (!Number.isFinite(level)) break;
          if (level >= 126) {
            status = 'high';
            message = t('highGlucose');
          } else if (level < 70) {
            status = 'low';
            message = t('lowGlucose');
          }
          break;
        }
        case 'spo2': {
          const pct = Number(data.percentage);
          if (!Number.isFinite(pct)) break;
          if (pct < 90) {
            status = 'critical';
            message = t('veryLowSpO2');
          } else if (pct < 94) {
            status = 'low';
            message = t('lowSpO2');
          }
          break;
        }
        case 'temp': {
          let val = Number(data.value);
          if (!Number.isFinite(val)) break;
          // Input is in Fahrenheit, convert to Celsius for evaluation
          val = (val - 32) * (5 / 9);
          if (val >= 40) {
            status = 'critical';
            message = t('veryHighTemp');
          } else if (val >= 38) {
            status = 'high';
            message = t('fever');
          } else if (val < 35) {
            status = 'low';
            message = t('lowTemp');
          }
          break;
        }
        case 'hr': {
          const bpm = Number(data.bpm);
          if (!Number.isFinite(bpm)) break;
          if (bpm >= 130) {
            status = 'critical';
            message = t('veryHighHR');
          } else if (bpm > 100) {
            status = 'high';
            message = t('highHR');
          } else if (bpm < 50) {
            status = 'low';
            message = t('lowHR');
          }
          break;
        }
        case 'weight': {
          // Weight alone is not used for quick warnings
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.warn('evaluateVitalReading error', e);
    }

    return { status, message };
  };

  // AI Intent Recognition - Understand what user means
  const analyzeUserIntent = async (userInput, currentStep, context = '') => {
    try {
      const intentPrompt = `You are an intent analyzer for AarogyaMitra health app. Analyze what the user means by their input.
      
Current Step: ${currentStep} (expecting: ${
        currentStep === 'tablet_name' ? 'medicine name or "I don\'t know"' :
        currentStep === 'tablet_dosage' ? 'dosage like "1 tablet"' :
        currentStep === 'tablet_color' ? 'tablet color' :
        currentStep === 'tablet_purpose' ? 'what the medicine is for' :
        currentStep === 'tablet_time_ask' ? 'time of day' :
        'unknown'
      })

User said: "${userInput}"

Analyze the intent and respond with ONLY valid JSON (no markdown):
{
  "intent": "one of: [medicine_name, dont_know, color, purpose, dosage, time, other]",
  "confidence": 0.0 to 1.0,
  "value": "the extracted value or null",
  "reasoning": "brief explanation of what user meant",
  "nextAction": "what to do next (continue/switch_flow/ask_for_color/ask_for_purpose/etc)"
}

Examples:
- "i dint know" → {"intent": "dont_know", "confidence": 0.95, "nextAction": "ask_for_color"}
- "dont no" → {"intent": "dont_know", "confidence": 0.9, "nextAction": "ask_for_color"}
- "idk" → {"intent": "dont_know", "confidence": 0.85, "nextAction": "ask_for_color"}
- "paracetamol" → {"intent": "medicine_name", "confidence": 0.99, "value": "paracetamol", "nextAction": "ask_for_dosage"}
- "white" → {"intent": "color", "confidence": 0.95, "value": "white", "nextAction": "ask_for_purpose"}
- "for headache" → {"intent": "purpose", "confidence": 0.98, "value": "for headache", "nextAction": "ask_for_dosage"}`;

      const response = await fetch(`${API_URL}${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: intentPrompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) throw new Error('API Error');

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      try {
        const analyzed = JSON.parse(aiText);
        return analyzed;
      } catch (e) {
        console.warn('Failed to parse intent response:', aiText);
        return { intent: 'other', confidence: 0, nextAction: 'ask_again' };
      }
    } catch (error) {
      console.error('Intent analysis error:', error);
      return { intent: 'other', confidence: 0, nextAction: 'ask_again' };
    }
  };

  // AI-powered input parsing and confirmation
  const parseAndConfirmInput = async (userInput, fieldType, context = '') => {
    try {
      const parsePrompts = {
        time: `You are a parsing assistant for AarogyaMitra health app. The user entered: "${userInput}". 
               They meant to enter a time. Parse this and convert to HH:MM format in 24-hour or 12-hour with AM/PM.
               Respond with ONLY valid JSON (no markdown, no explanation):
               {"parsed": "14:30", "formatted": "2:30 PM", "isValid": true, "interpretation": "The user likely meant 2:30 PM"}
               OR if invalid: {"parsed": null, "formatted": null, "isValid": false, "interpretation": "Could not parse as time"}`,
        
        date: `You are a parsing assistant for AarogyaMitra health app. The user entered: "${userInput}".
               They meant to enter a date. Parse this and convert to DD-MM-YYYY format.
               Respond with ONLY valid JSON (no markdown, no explanation):
               {"parsed": "15-11-2025", "formatted": "15 November 2025", "isValid": true, "interpretation": "The user likely meant November 15, 2025"}
               OR if invalid: {"parsed": null, "formatted": null, "isValid": false, "interpretation": "Could not parse as date"}`,
        
        dosage: `You are a parsing assistant for AarogyaMitra health app. The user entered: "${userInput}".
                They meant to enter a medicine dosage. Normalize this to a standard format.
                Respond with ONLY valid JSON (no markdown, no explanation):
                {"parsed": "1 tablet", "formatted": "1 tablet", "isValid": true, "interpretation": "The user likely meant 1 tablet"}
                OR if invalid: {"parsed": null, "formatted": null, "isValid": false, "interpretation": "Could not understand the dosage"}`,
        
        color: `You are a parsing assistant for AarogyaMitra health app. The user entered: "${userInput}".
               They meant to describe a tablet color. Normalize this to a standard color description.
               Respond with ONLY valid JSON (no markdown, no explanation):
               {"parsed": "white", "formatted": "White", "isValid": true, "interpretation": "The user likely meant white color"}
               OR if invalid: {"parsed": null, "formatted": null, "isValid": false, "interpretation": "Could not identify a color"}`,
        
        purpose: `You are a parsing assistant for AarogyaMitra health app. The user entered: "${userInput}".
                 They meant to describe what a medicine is used for. Normalize this description.
                 Respond with ONLY valid JSON (no markdown, no explanation):
                 {"parsed": "for blood pressure", "formatted": "for blood pressure", "isValid": true, "interpretation": "The user likely meant for blood pressure management"}
                 OR if invalid: {"parsed": null, "formatted": null, "isValid": false, "interpretation": "Could not identify a medicine purpose"}`,
      };

      const prompt = parsePrompts[fieldType] || parsePrompts.time;

      const response = await fetch(`${API_URL}${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) throw new Error('API Error');

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      // Try to parse the JSON response
      try {
        const parsed = JSON.parse(aiText);
        return parsed;
      } catch (e) {
        console.warn('Failed to parse AI response:', aiText);
        return { isValid: false, interpretation: 'Could not parse response' };
      }
    } catch (error) {
      console.error('Parse and confirm error:', error);
      return { isValid: false, interpretation: 'Error parsing input' };
    }
  };

  // Save medicine reminder to Firebase
  const createMeetingUrl = (doctorLabel = 'AarogyaMitra') => {
    const sanitizedLabel = (doctorLabel || 'AarogyaMitra')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 24)
      || 'AarogyaMitra';
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `https://meet.jit.si/${sanitizedLabel}-${Date.now()}-${randomSuffix}`;
  };

  const saveAppointmentBookingRecord = async (
    doctorName,
    scheduledDateTime,
    notes = '',
    specialty = 'General',
    origin = 'reminders'
  ) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const appointmentsCollection = collection(db, 'users', effectiveProfileId, 'appointments');
    const meetingUrl = createMeetingUrl(doctorName);

    await addDoc(appointmentsCollection, {
  doctorName: (doctorName || t('genericDoctorName')).trim(),
      specialty: specialty || 'General',
      notes: notes.trim(),
      scheduledAt: Timestamp.fromDate(new Date(scheduledDateTime)),
      meetingUrl,
      status: 'scheduled',
      source: origin,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return meetingUrl;
  };

  // Save medicine reminder to Firebase
  const saveMedicineReminder = async (medicineName, dose, timeOfDay) => {
    if (!user) {
      console.error('User not authenticated');
      addAIMessage(t('errorSavingVital'), 'buttons', [
        { label: t('tryAgain'), action: 'reminders' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
      return;
    }

    try {
      const remindersCollection = collection(db, 'users', effectiveProfileId, 'reminders');
      
      // Calculate next occurrence (if time has passed today, schedule for tomorrow)
      const now = new Date();
      const nextOccurrence = new Date(now);
      nextOccurrence.setHours(timeOfDay.hour, timeOfDay.minute, 0, 0);
      if (nextOccurrence <= now) {
        nextOccurrence.setDate(nextOccurrence.getDate() + 1);
      }

      await addDoc(remindersCollection, {
        type: 'Medicine',
        medicineName: medicineName.trim(),
        dose: dose.trim(),
        scheduleType: 'daily',
        timeOfDay: {
          hour: timeOfDay.hour,
          minute: timeOfDay.minute,
        },
        scheduledAt: Timestamp.fromDate(nextOccurrence),
        notes: '',
        doctorName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('Medicine reminder saved successfully:', medicineName);

      const timeStr = `${String(timeOfDay.hour).padStart(2, '0')}:${String(timeOfDay.minute).padStart(2, '0')}`;
      const reminderText = t('medicineReminderConfirmation')
        .replace('{medicineName}', medicineName)
        .replace('{time}', timeStr);
      addAIMessage(reminderText, 'buttons', [
        { label: t('addAnother'), action: 'reminders' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    } catch (error) {
      console.error('Error saving medicine reminder:', error);
      addAIMessage(t('errorSavingVital'), 'buttons', [
        { label: t('tryAgain'), action: 'reminders' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    }
  };

  // Save appointment reminder to Firebase (and mirror in Appointments list)
  const saveAppointmentReminder = async (
    doctorName,
    appointmentDate,
    timeOfDay,
    notes = '',
    origin = 'reminders',
    specialty = 'General'
  ) => {
    if (!user) {
      console.error('User not authenticated');
      addAIMessage(t('errorSavingVital'), 'buttons', [
        { label: t('tryAgain'), action: 'reminders' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
      return;
    }

    try {
      const remindersCollection = collection(db, 'users', effectiveProfileId, 'reminders');
      
      // Create scheduled date/time
      const scheduledDateTime = new Date(appointmentDate);
      scheduledDateTime.setHours(timeOfDay.hour, timeOfDay.minute, 0, 0);

      await addDoc(remindersCollection, {
        type: 'Appointment',
        doctorName: doctorName.trim(),
        notes: notes.trim(),
        scheduleType: 'one-time',
        scheduledAt: Timestamp.fromDate(scheduledDateTime),
        medicineName: null,
        dose: null,
        timeOfDay: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await saveAppointmentBookingRecord(
        doctorName,
        scheduledDateTime,
        notes,
        specialty,
        origin
      );

      console.log('Appointment reminder saved successfully:', doctorName);

      const dateStr = appointmentDate.toLocaleDateString();
      const timeStr = `${String(timeOfDay.hour).padStart(2, '0')}:${String(timeOfDay.minute).padStart(2, '0')}`;
      const followUpButtons = origin === 'known_doctor'
        ? [
            { label: t('bookAnotherAppointment'), action: 'appointments' },
            { label: t('backToMenu'), action: 'back_to_menu' },
          ]
        : [
            { label: t('addAnother'), action: 'reminders' },
            { label: t('backToMenu'), action: 'back_to_menu' },
          ];

      const confirmationText = t('appointmentReminderConfirmation')
        .replace('{doctorName}', doctorName)
        .replace('{date}', dateStr)
        .replace('{time}', timeStr);

      addAIMessage(confirmationText, 'buttons', followUpButtons);
    } catch (error) {
      console.error('Error saving appointment reminder:', error);
      addAIMessage(t('errorSavingVital'), 'buttons', [
        { label: t('tryAgain'), action: 'reminders' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
    }
  };

  const fetchDoctorsForSpecialty = async (specialty) => {
    const normalized = mapToSupportedSpecialty(specialty);
    try {
      const doctorsRef = collection(db, 'doctors');
      const doctorQuery = query(
        doctorsRef,
        where('specialization', '==', normalized),
        orderBy('experienceYears', 'desc'),
        limit(5)
      );
      const snapshot = await getDocs(doctorQuery);
      const fetched = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      if (fetched.length) {
        return fetched;
      }
    } catch (error) {
      console.error('Failed to load doctors for specialty:', specialty, error);
    }
    return getFallbackDoctorsBySpecialty(normalized);
  };

  const inferSpecialtyFromSymptoms = async (symptomText) => {
    const defaultAnalysis = {
      specialty: 'General Medicine',
      symptomSummary: symptomText,
      reasoning: 'Defaulted to a general physician when AI insight was unavailable.',
      urgency: 'moderate',
    };

    if (!API_KEY) {
      console.warn('Gemini API key missing. Falling back to default specialty.');
      return defaultAnalysis;
    }

    const prompt = `You triage patients for AarogyaMitra, a rural telehealth assistant.
The user described their symptoms as: "${symptomText}".
Allowed specialties: ${SUPPORTED_SPECIALTIES.join(', ')}.
Pick the single most relevant specialty. If unsure, choose General Medicine.
Respond with ONLY valid JSON (no markdown):
{
  "symptomSummary": "one-line summary",
  "recommendedSpecialty": "One of the allowed specialties",
  "reasoning": "why this specialty fits",
  "urgency": "low|moderate|high"
}`;

    try {
      const response = await fetch(`${API_URL}${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error('Specialty inference failed');
      }

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseAiJsonResponse(aiText);
      if (!parsed) {
        throw new Error('Could not parse AI JSON payload');
      }
      return {
        specialty: mapToSupportedSpecialty(parsed.recommendedSpecialty),
        symptomSummary: parsed.symptomSummary || symptomText,
        reasoning: parsed.reasoning || 'AI recommendation',
        urgency: parsed.urgency || 'moderate',
      };
    } catch (error) {
      console.error('Symptom-to-specialty inference error:', error);
      return defaultAnalysis;
    }
  };

  const presentDoctorSuggestion = (doctor, analysis) => {
    if (!doctor) {
      addAIMessage(t('doctorSuggestionMissing'));
      return;
    }

    const languageLine = doctor.languages?.length ? doctor.languages.join(', ') : t('english');
    const availabilityLine = doctor.acceptingNewPatients
      ? t('acceptingNewPatients')
      : t('currentlyWaitlisted');

    const summaryText = analysis.symptomSummary
      ? t('symptomUnderstanding').replace('{summary}', analysis.symptomSummary)
      : t('thanksForDetails');
    const specialtyLabel = localizeSpecialtyLabel(analysis.specialty || doctor.specialization || 'General Medicine');

    addAIMessage(`${summaryText}
${t('bestSpecialtyFit').replace('{specialty}', specialtyLabel)}`);

    const doctorSpecialty = localizeSpecialtyLabel(doctor.specialization || analysis.specialty);
    const experienceLine = t('doctorExperienceLabel').replace('{years}', doctor.experienceYears ?? '1');
    const languagesLine = t('doctorLanguagesLabel').replace('{languages}', languageLine);
    const statusLine = t('doctorStatusLabel').replace('{status}', availabilityLine);

    const doctorDetails = `${doctor.name}
${doctorSpecialty} • ${doctor.hospital}
${experienceLine}
${languagesLine}
${statusLine}`;

    addAIMessage(doctorDetails, 'buttons', [
      { label: t('bookWithThisDoctor'), action: 'accept_suggested_doctor' },
      { label: t('showAnotherDoctor'), action: 'suggest_alternate_doctor' },
      { label: t('backToMenu'), action: 'back_to_menu' },
    ]);

    if (analysis.urgency === 'high') {
      setTimeout(() => {
        addAIMessage(t('seriousSymptomWarning'));
      }, 350);
    }
  };

  const startSuggestedDoctorFlow = () => {
    setChatContext({
      hasDoctor: false,
      appointmentNotes: '',
      appointmentFlowOrigin: 'suggested_doctor',
      step: 'symptom_description',
      doctorName: '',
      appointmentDate: null,
      appointmentTime: null,
      pendingDate: null,
      pendingAppointmentTime: null,
      specialty: 'General Medicine',
      symptomDescription: '',
      symptomSummary: '',
      inferredSpecialty: '',
      suggestedDoctor: null,
      suggestedDoctorsQueue: [],
      suggestedDoctorHistory: [],
      suggestionReasoning: '',
      suggestionUrgency: 'moderate',
    });
    setCurrentState('appointments_chat_suggest');
    setTimeout(() => {
      addAIMessage(t('describeProblem'));
    }, 300);
  };

  const confirmSuggestedDoctorSelection = () => {
    const doctor = chatContext.suggestedDoctor;
    if (!doctor) {
      addAIMessage(t('noDoctorSelected'));
      return;
    }

    setChatContext(prev => ({
      ...prev,
      doctorName: doctor.name,
      specialty: doctor.specialization || prev.inferredSpecialty || prev.specialty || 'General Medicine',
      step: 'appointment_date_ask',
      appointmentNotes: prev.symptomSummary || prev.symptomDescription || prev.appointmentNotes || '',
    }));

    setTimeout(() => {
      addAIMessage(t('findingSlotWithDoctor').replace('{doctorName}', doctor.name));
      handleAppointmentDateTimeInput('__calendar_trigger__');
    }, 300);
  };

  const showAlternateDoctorOption = async () => {
    const specialty = chatContext.inferredSpecialty || chatContext.specialty || 'General Medicine';
    const history = chatContext.suggestedDoctorHistory || [];
    let queue = chatContext.suggestedDoctorsQueue || [];
    let nextDoctor = null;

    if (queue.length) {
      [nextDoctor, ...queue] = queue;
    } else {
      const refreshed = await fetchDoctorsForSpecialty(specialty);
      const unseen = refreshed.filter((doc) => {
        const identifier = doc.id || doc.name;
        return identifier ? !history.includes(identifier) : true;
      });
      if (unseen.length) {
        [nextDoctor, ...queue] = unseen;
      }
    }

    if (!nextDoctor) {
      addAIMessage(t('doctorSuggestionSummary'), 'buttons', [
        { label: t('bookPreviousDoctor'), action: 'accept_suggested_doctor' },
        { label: t('describeSymptomsAgain'), action: 'restart_doctor_suggestion' },
        { label: t('backToMenu'), action: 'back_to_menu' },
      ]);
      return;
    }

    setChatContext(prev => ({
      ...prev,
      suggestedDoctor: nextDoctor,
      suggestedDoctorsQueue: queue,
      suggestedDoctorHistory: [...history, nextDoctor.id || nextDoctor.name],
    }));

    presentDoctorSuggestion(nextDoctor, {
      specialty,
      symptomSummary: chatContext.symptomSummary || chatContext.symptomDescription,
      reasoning: chatContext.suggestionReasoning,
      urgency: chatContext.suggestionUrgency,
    });
  };

  const restartDoctorSuggestionFlow = () => {
    setChatContext(prev => ({
      ...prev,
      step: 'symptom_description',
      symptomDescription: '',
      symptomSummary: '',
      suggestedDoctor: null,
      suggestedDoctorsQueue: [],
      suggestedDoctorHistory: [],
      inferredSpecialty: '',
      specialty: 'General Medicine',
    }));
    setTimeout(() => {
      addAIMessage(t('describeSymptomsPrompt'));
    }, 300);
  };

  const handleSuggestedDoctorFlowInput = async (messageText) => {
    const trimmed = messageText.trim();

    if (!chatContext.step || chatContext.step === 'symptom_description') {
      if (!trimmed) {
        addAIMessage(t('symptomDescriptionShortPrompt'));
        return;
      }

      const analysis = await inferSpecialtyFromSymptoms(trimmed);
      const specialty = analysis.specialty || 'General Medicine';
      const doctors = await fetchDoctorsForSpecialty(specialty);

      if (!doctors.length) {
        setChatContext(prev => ({
          ...prev,
          appointmentNotes: trimmed,
          symptomDescription: trimmed,
          symptomSummary: analysis.symptomSummary || trimmed,
          inferredSpecialty: specialty,
          specialty,
        }));
        setCurrentState('appointments_chat_specialty');
        setTimeout(() => {
          addAIMessage(t('chooseSpecialtyPrompt'), 'buttons', [
            { label: t('generalCheckup'), action: 'specialty_general' },
            { label: t('cardiology'), action: 'specialty_cardio' },
            { label: t('neurology'), action: 'specialty_neuro' },
            { label: t('dermatology'), action: 'specialty_derm' },
            { label: t('backToMenu'), action: 'back_to_menu' },
          ]);
        }, 300);
        return;
      }

      const [primaryDoctor, ...remaining] = doctors;

      setChatContext(prev => ({
        ...prev,
        appointmentNotes: trimmed,
        symptomDescription: trimmed,
        symptomSummary: analysis.symptomSummary || trimmed,
        inferredSpecialty: specialty,
        specialty,
        suggestedDoctor: primaryDoctor,
        suggestedDoctorsQueue: remaining,
        suggestedDoctorHistory: primaryDoctor ? [primaryDoctor.id || primaryDoctor.name] : [],
        suggestionReasoning: analysis.reasoning,
        suggestionUrgency: analysis.urgency,
        step: 'suggestion_presented',
      }));

      presentDoctorSuggestion(primaryDoctor, analysis);
      return;
    }

    if (chatContext.step === 'suggestion_presented') {
      const normalized = trimmed.toLowerCase();
      if (YES_KEYWORDS.some(keyword => normalized.includes(keyword))) {
        confirmSuggestedDoctorSelection();
      } else if (normalized.includes('another') || NO_KEYWORDS.some(keyword => normalized.includes(keyword))) {
        showAlternateDoctorOption();
      } else {
        addAIMessage(t('bookOrAnotherPrompt'));
      }
      return;
    }

    const handled = await handleAppointmentDateTimeInput(messageText);
    if (!handled) {
      addAIMessage(t('useCardsHint'));
    }
  };

  const handleButtonPress = async (action, navTo) => {
    // Navigation actions
    if (navTo) {
      if (navTo === 'RecordVitals') {
        navigation.navigate('Vitals', { screen: 'RecordVitals' });
      } else if (navTo === 'BookAppointment') {
        navigation.navigate('Appointments', { screen: 'BookAppointment' });
      } else if (navTo === 'MedicalDocuments') {
        // Navigate to Documents screen with fromChat flag
        navigation.navigate('Documents', { fromChat: true });
      }
      return;
    }

    // Main menu selections
    if (action === 'symptom_check' || action === 'record_vitals' || action === 'appointments' || action === 'reminders' || action === 'medical_docs') {
      handleMainMenuSelection(action);
    }
    // Vital selection from vitals_selection state (e.g., select_vital_bp -> bp)
    else if (action.startsWith('select_vital_')) {
      const vitalType = action.replace('select_vital_', '');
      handleVitalSelection(vitalType);
    }
    // Vital recording (e.g., vital_bp_record -> bp)
    else if (action.startsWith('vital_')) {
      const vitalType = action.replace('vital_', '').replace('_record', '');
      handleVitalSelection(vitalType);
    }
    // Retry vital input
    else if (action === 'try_again') {
      setCurrentState('vitals_input');
      const vitalType = chatContext.selectedVital;
      if (vitalType === 'bp') {
        addAIMessage(t('bpInstructions'));
      } else if (vitalType === 'sugar') {
        addAIMessage(t('sugarInstructions'));
      } else if (vitalType === 'temp') {
        addAIMessage(t('tempInstructions'));
      } else if (vitalType === 'hr') {
        addAIMessage(t('hrInstructions'));
      } else if (vitalType === 'weight') {
        addAIMessage(t('weightInstructions'));
      } else if (vitalType === 'spo2') {
        addAIMessage(t('spo2Instructions'));
      }
    }
    // Appointment flow
    else if (action === 'have_doctor' || action === 'need_suggestion') {
      handleAppointmentFlow(action);
    } else if (action.startsWith('specialty_')) {
      handleSpecialtySelection(action);
    } else if (action.startsWith('known_doctor_select_')) {
      const index = Number(action.replace('known_doctor_select_', ''));
      handleKnownDoctorSuggestionSelection(Number.isNaN(index) ? -1 : index);
    } else if (action === 'confirm_manual_doctor') {
      confirmManualDoctorChoice();
    } else if (action === 'doctor_retry_name') {
      askDoctorNameAgain();
    } else if (action === 'accept_suggested_doctor') {
      confirmSuggestedDoctorSelection();
    } else if (action === 'suggest_alternate_doctor') {
      showAlternateDoctorOption();
    } else if (action === 'restart_doctor_suggestion') {
      restartDoctorSuggestionFlow();
    }
    // Reminder types
    else if (action === 'medicine_reminder') {
      handleMedicineReminder();
    } else if (action === 'appointment_reminder') {
      handleAppointmentReminder();
    }
    // Medical documents
    else if (action === 'upload_document') {
      addUserMessage(t('yes'));
      setTimeout(() => {
        addAIMessage(t('takingToUploadScreen'));
      }, 300);
      // Navigate to Documents flow with fromChat flag
      setTimeout(() => {
        navigation.navigate('Documents', { fromChat: true });
      }, 1000);
    } else if (action === 'skip_document') {
      addUserMessage(t('no'));
      setTimeout(() => {
        addAIMessage(t('documentUploadSkipped'), 'buttons', [
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 300);
    }
    // Symptom flow buttons
    else if (action === 'symptom_self_care') {
      const tips = [
        t('selfCareTip1'),
        t('selfCareTip2'),
        t('selfCareTip3'),
        t('selfCareTip4'),
        t('selfCareTip5'),
      ];
      const tipsText = tips.map((tip, index) => `${index + 1}. ${tip}`).join('\n');
      addAIMessage(`${t('selfCarePlanIntro')}\n\n${tipsText}`);

      setTimeout(() => {
        addAIMessage(t('needAnythingElse'), 'buttons', [
          { label: t('escalateToDoctor'), action: 'symptom_escalate' },
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 400);
    } else if (action === 'symptom_escalate') {
      addAIMessage(t('visitClinicSoon'));

      setTimeout(() => {
        addAIMessage(t('selfCareOrMenu'), 'buttons', [
          { label: t('selfCarePlan'), action: 'symptom_self_care' },
          { label: t('backToMenu'), action: 'back_to_menu' },
        ]);
      }, 400);
    }
    // Input confirmation handlers
    else if (action === 'confirm_time_yes') {
      // User confirmed the parsed time
      const timeStr = chatContext.pendingTime; // e.g., "14:30"
      const [hour, minute] = timeStr.split(':').map(Number);
      
      setChatContext({ 
        ...chatContext, 
        tabletTime: { hour, minute },
        step: 'save_medicine',
        pendingTime: null
      });
      
      // Save the reminder
      saveMedicineReminder(
        chatContext.tabletName,
        chatContext.tabletDosage,
        { hour, minute }
      );
    } else if (action === 'confirm_time_no') {
      // User rejected the parsed time, ask them to re-enter
      setChatContext({ ...chatContext, step: 'tablet_time_ask' });
      setTimeout(() => {
        addAIMessage(t('pickNewTime'));
        openClockPicker('medicine', {
          title: t('pickReminderTimeTitle'),
          subtitle: t('reminderTimeSubtitle'),
        });
      }, 300);
    } else if (action === 'confirm_date_yes') {
      // User confirmed the parsed date
      const dateStr = chatContext.pendingDate;
      const [day, month, year] = dateStr.split('-').map(Number);
      const appointmentDate = new Date(year, month - 1, day);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (appointmentDate < today) {
        setChatContext(prev => ({
          ...prev,
          step: 'appointment_date_ask',
          pendingDate: null,
        }));

        setTimeout(() => {
          addAIMessage(t('dateAlreadyPassedDetailed'));
          handleAppointmentDateTimeInput('__calendar_trigger__');
        }, 300);
        return;
      }
      
      setChatContext(prev => ({ 
        ...prev, 
        appointmentDate,
        step: 'appointment_time_ask',
        pendingDate: null
      }));
      
      setTimeout(() => {
        addAIMessage(t('askAppointmentTime'));
        handleAppointmentDateTimeInput('__timepicker_trigger__');
      }, 300);
    } else if (action === 'confirm_date_no') {
      // User rejected the parsed date, ask them to re-enter
      setChatContext({ ...chatContext, step: 'appointment_date_ask' });
      setTimeout(() => {
        addAIMessage(t('reenterDatePrompt'));
        handleAppointmentDateTimeInput('__calendar_trigger__');
      }, 300);
    } else if (action === 'confirm_appointment_time_yes') {
      // User confirmed the appointment time
      const timeStr = chatContext.pendingAppointmentTime; // e.g., "14:30"
      const [hour, minute] = timeStr.split(':').map(Number);
      const now = new Date();
      const appointmentDate = chatContext.appointmentDate ? new Date(chatContext.appointmentDate) : null;

      if (!appointmentDate) {
        setChatContext(prev => ({
          ...prev,
          pendingAppointmentTime: null,
          step: 'appointment_date_ask',
        }));
        setTimeout(() => {
          addAIMessage(t('needDateBeforeTime'));
        }, 300);
        return;
      }

      const scheduledDateTime = new Date(appointmentDate);
      scheduledDateTime.setHours(hour, minute, 0, 0);

      if (scheduledDateTime <= now) {
        setChatContext(prev => ({
          ...prev,
          pendingAppointmentTime: null,
          step: 'appointment_time_ask',
        }));

        setTimeout(() => {
          addAIMessage(t('chooseFutureTime'));
          handleAppointmentDateTimeInput('__timepicker_trigger__');
        }, 300);
        return;
      }
      
      setChatContext(prev => ({ 
        ...prev, 
        appointmentTime: { hour, minute },
        step: 'save_appointment',
        pendingAppointmentTime: null
      }));
      
      // Save the appointment reminder
      await saveAppointmentReminder(
        chatContext.doctorName,
        chatContext.appointmentDate,
        { hour, minute },
        chatContext.appointmentNotes || '',
        chatContext.appointmentFlowOrigin || 'reminders',
        chatContext.specialty || 'General'
      );
    } else if (action === 'confirm_appointment_time_no') {
      // User rejected the appointment time, ask them to re-enter
      setChatContext({ ...chatContext, step: 'appointment_time_ask' });
      setTimeout(() => {
        addAIMessage(t('reenterAppointmentTime'));
        handleAppointmentDateTimeInput('__timepicker_trigger__');
      }, 300);
    }
    // Navigation
    else if (action === 'back_to_menu') {
      handleBackToMenu();
    }
  };

  const handleBackToMenu = () => {
    setCurrentState('main_menu');
    setChatContext({});
    setSelectedImages([]);
    setShowCalendarPicker(false);
    setShowTimePicker(false);
    setTimePickerContext(null);
    setSymptomMessages([]);
    
    // Show main menu buttons
    const menuMessage = {
      id: generateMessageId('ai'),
      text: t('whatCanIHelpYouWith'),
      sender: 'ai',
      type: 'buttons',
      buttons: [
        { label: t('notFeelingWell'), action: 'symptom_check' },
        { label: t('recordMyVitals'), action: 'record_vitals' },
        { label: t('bookAppointment'), action: 'appointments' },
        { label: t('addReminder'), action: 'reminders' },
        { label: t('medicalDocuments'), action: 'medical_docs' },
      ],
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, menuMessage]);
  };

  const handleSymptomSubmission = async (text, attachments = []) => {
    if (!API_KEY) {
      addAIMessage(t('apiKeyMissing'));
      setIsLoading(false);
      return;
    }

  const fallbackText = text || (attachments.length ? t('reviewAttachedImage') : '');
    const userSymptomMessage = {
      id: `symptom-user-${Date.now()}`,
      text: fallbackText,
      sender: 'user',
      images: attachments,
    };

    const historyForRequest = [...symptomMessages, userSymptomMessage];
    setSymptomMessages(historyForRequest);

    const conversationHistory = historyForRequest.map((message) => {
      const parts = [];
      if (message.text) {
        parts.push({ text: message.text });
      }
      message.images?.forEach((image) => {
        if (image?.base64) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType ?? 'image/jpeg',
              data: image.base64,
            },
          });
        }
      });

      return {
        role: message.sender === 'user' ? 'user' : 'model',
        parts: parts.length ? parts : [{ text: '...' }],
      };
    });

    const payload = {
      contents: conversationHistory,
      systemInstruction: {
        parts: [{ text: buildSymptomSystemPrompt(language) }],
      },
    };

    try {
      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(`${API_URL}${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) break;
        if (response.status === 429 || response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        } else {
          break;
        }
      }

      if (!response || !response.ok) {
        throw new Error('Symptom AI request failed');
      }

      const data = await response.json();
      const aiParts = data?.candidates?.[0]?.content?.parts || [];
      const aiText = aiParts
        .map((part) => part.text)
        .filter(Boolean)
        .join('\n')
        .trim();

  const finalText = aiText || t('errorProcessingRequest');
      const aiSymptomMessage = {
        id: `symptom-ai-${Date.now()}`,
        text: finalText,
        sender: 'ai',
      };
      setSymptomMessages(prev => [...prev, aiSymptomMessage]);
      addAIMessage(finalText);

      // Heuristic: only show final action buttons if the AI response looks like an assessment
      const looksLikeFinal = /\b(based on|summary|recommend|you should|self-care|self care|consult a doctor|see a doctor|seek medical|escalate|suggest)\b/i.test(finalText);
      const looksLikeQuestion = /\?$/.test(finalText) || /\b(when|what|where|how|do you|did you|are you|have you|which|who|can you|is it|please tell)\b/i.test(finalText);

      if (looksLikeFinal || (!looksLikeQuestion && finalText.length < 300 && /\.\s/.test(finalText))) {
        // Likely a final assessment — show action buttons
        // Only show final action buttons when the AI response looks like a final assessment
        const lower = finalText.toLowerCase();
        const finalCues = [
          'based on',
          'i recommend',
          'i suggest',
          'self-care',
          'self care',
          'recommend seeing',
          'consult a doctor',
          'see a doctor',
          'please consult',
          'seek medical',
          'you should',
          'it is best',
          'you should consult',
          'escalat', // covers escalate/escalation
        ];

        const looksFinal = finalCues.some((cue) => lower.includes(cue));

        if (looksFinal) {
          setTimeout(() => {
            addAIMessage(t('selfCarePlanOrDoctor'), 'buttons', [
              { label: t('selfCarePlan'), action: 'symptom_self_care' },
              { label: t('escalateToDoctor'), action: 'symptom_escalate' },
              { label: t('backToMenu'), action: 'back_to_menu' },
            ]);
          }, 400);
        }
      } else {
        // AI likely asked a follow-up question — continue the conversation and do not show action buttons yet
        // Keep current state as 'symptom_chat' so user can reply and we'll send next submission
      }
    } catch (error) {
      console.error('Symptom AI Error:', error);
      addAIMessage(t('symptomNetworkIssue'));
    } finally {
      setIsLoading(false);
    }
  };

  const sendToAI = async (userText) => {
    const vitalPrompts = {
      bp: `You are AarogyaMitra. The user is recording their blood pressure. They need to enter readings in the format: systolic diastolic (e.g., 120 80). If they haven't provided this yet, ask them to do so. If they've provided readings, acknowledge and validate the format. Keep responses brief and friendly.`,
      sugar: `You are AarogyaMitra. The user is recording their blood sugar level. They need to enter a single value in mg/dL (e.g., 120). If they haven't provided this yet, ask them to do so. If they've provided a reading, acknowledge it and confirm the value. Keep responses brief and friendly.`,
      temp: `You are AarogyaMitra. The user is recording their body temperature. They need to enter a single value in Fahrenheit (e.g., 98.6). If they haven't provided this yet, ask them to do so. If they've provided a reading, acknowledge it and confirm the value. Keep responses brief and friendly.`,
      hr: `You are AarogyaMitra. The user is recording their heart rate. They need to enter a single value in beats per minute (e.g., 72). If they haven't provided this yet, ask them to do so. If they've provided a reading, acknowledge it and confirm the value. Keep responses brief and friendly.`,
      weight: `You are AarogyaMitra. The user is recording their weight. They need to enter a single value in kilograms (e.g., 70). If they haven't provided this yet, ask them to do so. If they've provided a reading, acknowledge it and confirm the value. Keep responses brief and friendly.`,
      spo2: `You are AarogyaMitra. The user is recording their SpO2 (oxygen saturation). They need to enter a single percentage value (e.g., 98). If they haven't provided this yet, ask them to do so. If they've provided a reading, acknowledge it and confirm the value. Keep responses brief and friendly.`,
    };

    const systemPrompts = {
      vitals_input: vitalPrompts[chatContext.selectedVital] || vitalPrompts.bp,
      symptom_chat: `You are AarogyaMitra, a friendly health assistant for Indians. The user is describing their symptoms. Ask follow-up questions to understand better. Keep responses brief and simple. Respond in a caring and professional manner.`,
      medicine_reminder_chat: `You are AarogyaMitra. Help the user set a medicine reminder. Ask clarifying questions about tablet name, dosage, and frequency. Be friendly and helpful.`,
      appointment_reminder_chat: `You are AarogyaMitra. Help the user set an appointment reminder. Ask about doctor name, appointment date/time, and any follow-up details.`,
      appointments_chat_problem: `You are AarogyaMitra. The user wants to book an appointment with a doctor they already know. Ask them to describe their health problem briefly so you can help them prepare.`,
      medical_docs_chat: `You are AarogyaMitra. Help the user understand how to upload medical documents. Explain the supported formats and the process in simple terms.`,
    };

    const systemPrompt = systemPrompts[currentState] || systemPrompts.symptom_chat;

    try {
      const response = await fetch(`${API_URL}${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                { text: `User: ${userText}` },
              ],
            },
          ],
        }),
      });

      if (!response.ok) throw new Error('API Error');

      const data = await response.json();
      const aiText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || t('errorProcessingRequest');

      addAIMessage(aiText);
    } catch (error) {
      console.error('AI API Error:', error);
      addAIMessage(t('errorProcessingRequest'));
    }
  };

  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    const hasImages = selectedImages.length > 0;

    if (currentState === 'symptom_chat') {
      if (!trimmedInput && !hasImages) {
        return;
      }
    } else if (!trimmedInput) {
      return;
    }

    const messageText = trimmedInput;
    let displayText = messageText;
    const imagePayload = currentState === 'symptom_chat' ? [...selectedImages] : [];

    if (currentState === 'symptom_chat' && !displayText) {
      displayText = imagePayload.length ? t('reviewAttachedImage') : '';
    }

    const imagesForUI = imagePayload.map(image => ({ uri: image.uri }));
    addUserMessage(displayText, imagesForUI);
    setUserInput('');
    if (currentState === 'symptom_chat') {
      setSelectedImages([]);
    }
    setIsLoading(true);

    // Store user input based on current state
    if (currentState === 'symptom_chat') {
      await handleSymptomSubmission(displayText, imagePayload);
      return;
    }

    if (currentState === 'vitals_input') {
      // Handle vital reading input
      const vitalType = chatContext.selectedVital;
      const validation = validateVitalReading(messageText, vitalType);
      
      if (validation.valid) {
        // Valid reading, save it
        await saveVitalReading(vitalType, validation.data);
      } else {
        // Invalid reading, show error and guide user
        setTimeout(() => {
          addAIMessage(validation.message, 'buttons', [
            { label: t('tryAgain'), action: 'try_again' },
            { label: t('backToMenu'), action: 'back_to_menu' },
          ]);
        }, 300);
      }
      setIsLoading(false);
    } else if (currentState === 'medicine_reminder_chat') {
      if (chatContext.step === 'tablet_name') {
        // Use AI to understand user's intent - handles typos and natural language variations
        const intent = await analyzeUserIntent(messageText, 'tablet_name');
        
        if (intent.intent === 'dont_know' && intent.confidence > 0.7) {
          // User doesn't know the medicine name (handles: "i dint know", "dont no", "idk", etc.)
          setChatContext({ ...chatContext, step: 'tablet_color' });
          setTimeout(() => {
            addAIMessage(t('tabletColorPrompt'), 'text');
          }, 300);
        } else if (intent.intent === 'medicine_name' && intent.confidence > 0.8) {
          // User provided medicine name
          setChatContext({ ...chatContext, tabletName: messageText, step: 'tablet_dosage' });
          setTimeout(() => {
            addAIMessage(t('tabletDosage'));
          }, 300);
        } else {
          // Unclear input - ask for clarification
          setTimeout(() => {
            addAIMessage(t('medicineNameClarification'), 'text');
          }, 300);
        }
      } else if (chatContext.step === 'tablet_color') {
        // Use AI to understand color - handles color descriptions with flexibility
        const intent = await analyzeUserIntent(messageText, 'tablet_color', 'Expected a color like white, red, blue, yellow, etc.');
        
        if ((intent.intent === 'color' || intent.intent === 'medicine_name') && intent.confidence > 0.6) {
          // User provided color
          setChatContext({ ...chatContext, tabletColor: messageText, step: 'tablet_purpose' });
          setTimeout(() => {
            addAIMessage(t('tabletPurposePrompt'), 'text');
          }, 300);
        } else {
          // Try to clarify
          addAIMessage(t('tabletColorClarification'), 'text');
        }
      } else if (chatContext.step === 'tablet_purpose') {
        // Use AI to understand purpose - handles various descriptions of what the medicine is for
        const intent = await analyzeUserIntent(messageText, 'tablet_purpose', 'Expected what the medicine is for, like for heart, blood pressure, headache, fever, etc.');
        
        if ((intent.intent === 'purpose' || intent.intent === 'medicine_name') && intent.confidence > 0.6) {
          // User provided purpose
          const description = `${chatContext.tabletColor} tablet for ${messageText}`;
          setChatContext({ ...chatContext, tabletPurpose: messageText, tabletName: description, step: 'tablet_dosage' });
          setTimeout(() => {
            addAIMessage(t('tabletDosage'));
          }, 300);
        } else {
          // Ask for clarification
          addAIMessage(t('tabletUsageClarification'), 'text');
        }
      } else if (chatContext.step === 'tablet_dosage') {
        // Use AI to understand dosage - handles "1 tablet", "one tab", "half", "1 each day", typos, etc.
        const intent = await analyzeUserIntent(messageText, 'tablet_dosage', `Expected dosage like "1 tablet", "one tab", "half", etc.`);
        
        if (intent.intent === 'dosage' && intent.confidence > 0.7) {
          // User provided valid dosage
          setChatContext({ ...chatContext, tabletDosage: messageText, step: 'tablet_time_ask' });
          setTimeout(() => {
            addAIMessage(t('tabletReminderTimePrompt'));
            openClockPicker('medicine', {
              title: t('pickReminderTimeTitle'),
              subtitle: t('reminderTimeSubtitle'),
            });
          }, 300);
        } else if (intent.intent === 'dont_know' && intent.confidence > 0.7) {
          // User doesn't know dosage
          addAIMessage(t('estimateDosagePrompt'), 'text');
        } else {
          // Unclear input
          addAIMessage(t('dosageClarificationPrompt'), 'text');
        }
      } else if (chatContext.step === 'tablet_time_ask') {
        // Use AI to parse the time
        const parseResult = await parseAndConfirmInput(messageText, 'time');
        
        if (parseResult.isValid) {
          // AI successfully parsed the time, ask for confirmation
          setChatContext({ 
            ...chatContext, 
            pendingTime: parseResult.parsed,
            step: 'confirm_time' 
          });
          
          addAIMessage(
            t('confirmParsedTime').replace('{value}', parseResult.formatted),
            'buttons',
            [
              { label: t('yes'), action: 'confirm_time_yes' },
              { label: t('no'), action: 'confirm_time_no' },
            ]
          );
        } else {
          // AI couldn't parse the time, ask user to retry
          addAIMessage(
            t('medicineTimeParseHint').replace('{userInput}', messageText),
            'text'
          );
          openClockPicker('medicine', {
            title: t('pickReminderTimeTitle'),
            subtitle: t('reminderTimeSubtitle'),
          });
        }
      }
      setIsLoading(false);
    } else if (currentState === 'appointments_chat_problem') {
      await handleKnownDoctorAppointmentInput(messageText);
      setIsLoading(false);
    } else if (currentState === 'appointments_chat_suggest') {
      await handleSuggestedDoctorFlowInput(messageText);
      setIsLoading(false);
    } else if (currentState === 'appointment_reminder_chat') {
      await handleAppointmentReminderInput(messageText);
      setIsLoading(false);
    } else if (currentState === 'medical_docs_chat') {
      // Medical documents chat flow
      addUserMessage(messageText);
      
      // Check if user wants to upload or skip
      const lowerInput = messageText.toLowerCase().trim();
      const yesKeywords = ['yes', 'yeah', 'sure', 'ok', 'okay', 'haan', 'ha', 'hn', 'si', 'ya'];
      const noKeywords = ['no', 'nope', 'na', 'nah', 'not', 'dont', 'don\'t', 'nahi', 'nahin'];
      
      if (yesKeywords.some(keyword => lowerInput.includes(keyword))) {
        // User wants to upload
        setTimeout(() => {
          addAIMessage(t('takingToUploadScreen'), 'buttons', [
            { label: t('continueToUpload'), action: 'upload_document', navTo: 'MedicalDocuments' },
          ]);
        }, 300);
      } else if (noKeywords.some(keyword => lowerInput.includes(keyword))) {
        // User wants to skip
        setTimeout(() => {
          addAIMessage(t('documentUploadSkipped'), 'buttons', [
            { label: t('backToMenu'), action: 'back_to_menu' },
          ]);
        }, 300);
      } else {
        // Unclear response, offer options
        setTimeout(() => {
          addAIMessage(t('documentUploadQuestion'), 'buttons', [
            { label: t('yes'), action: 'upload_document', navTo: 'MedicalDocuments' },
            { label: t('no'), action: 'skip_document' },
          ]);
        }, 300);
      }
      setIsLoading(false);
    } else {
      // For other chat states, send to AI
      await sendToAI(messageText);
    }
  };

  const renderMessage = (msg) => {
    if (msg.type === 'buttons') {
      return (
        <View key={msg.id} style={[styles.messageBubble, styles.aiBubble]}>
          <Text style={styles.messageText}>{msg.text}</Text>
          <View style={styles.buttonsContainer}>
            {msg.buttons.map((button, idx) => (
              <TouchableOpacity
                key={`${msg.id}-button-${button.action}-${idx}`}
                style={styles.optionButton}
                onPress={() => handleButtonPress(button.action, button.navTo)}
              >
                <Text style={styles.optionButtonText}>{button.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View
        key={msg.id}
        style={[
          styles.messageBubble,
          msg.sender === 'ai' ? styles.aiBubble : styles.userBubble,
        ]}
      >
        <Text style={[styles.messageText, msg.sender === 'user' && styles.userMessageText]}>
          {msg.text}
        </Text>
        {msg.images?.length ? (
          <View style={styles.messageImageRow}>
            {msg.images.map((image, index) => (
              <Image
                key={`${msg.id}-img-${index}`}
                source={{ uri: image.uri }}
                style={styles.messageImage}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderCalendarPickerCard = () => {
    const todayIso = format(new Date(), 'yyyy-MM-dd');
    return (
      <View style={[styles.messageBubble, styles.inlinePickerCard]}>
        <Text style={styles.inlinePickerTitle}>{t('selectDate')}</Text>
        <Calendar
          current={calendarSelectionDate}
          minDate={todayIso}
          onDayPress={handleCalendarDaySelect}
          markedDates={{
            [calendarSelectionDate]: {
              selected: true,
              selectedColor: '#007AFF',
            },
          }}
          style={styles.inlineCalendar}
          theme={{
            arrowColor: '#007AFF',
            todayTextColor: '#007AFF',
            selectedDayBackgroundColor: '#007AFF',
            textMonthFontWeight: 'bold',
          }}
        />
      </View>
    );
  };

  const renderTimePickerCard = () => {
    const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
    const clockSize = 240;
    const hourRadius = 100;
    const minuteRadius = 70;

    const renderRing = (values, radius, selectedValue, onSelect, isMinute = false) => (
      values.map(value => {
        const denominator = isMinute ? 60 : 12;
        const angle = ((value % denominator) / denominator) * 2 * Math.PI - Math.PI / 2;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        return (
          <TouchableOpacity
            key={`${isMinute ? 'minute' : 'hour'}-${value}`}
            style={[
              styles.clockNumber,
              isMinute && styles.clockMinuteNumber,
              selectedValue === value && styles.clockNumberSelected,
              {
                top: '50%',
                left: '50%',
                marginLeft: -20,
                marginTop: -20,
                transform: [{ translateX: x }, { translateY: y }],
              },
            ]}
            onPress={() => onSelect(value)}
          >
            <Text
              style={[
                styles.clockNumberText,
                selectedValue === value && styles.clockNumberTextSelected,
              ]}
            >
              {isMinute ? String(value).padStart(2, '0') : value}
            </Text>
          </TouchableOpacity>
        );
      })
    );

    const formatted = `${String(clockSelection.hour).padStart(2, '0')}:${String(clockSelection.minute).padStart(2, '0')} ${clockSelection.period}`;

    return (
      <View style={[styles.messageBubble, styles.inlinePickerCard]}>
        <Text style={styles.inlinePickerTitle}>{timePickerTitle}</Text>
        {timePickerSubtitle ? (
          <Text style={styles.inlinePickerSubtitle}>{timePickerSubtitle}</Text>
        ) : null}
        <View style={[styles.clockFace, { width: clockSize, height: clockSize }]}>
          {renderRing(hours, hourRadius, clockSelection.hour, value =>
            setClockSelection(prev => ({ ...prev, hour: value }))
          )}
          {renderRing(
            minutes,
            minuteRadius,
            clockSelection.minute,
            value => setClockSelection(prev => ({ ...prev, minute: value })),
            true
          )}
          <View style={styles.clockCenterDot} />
        </View>
        <View style={styles.periodToggleRow}>
          {['AM', 'PM'].map(period => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodChip,
                clockSelection.period === period && styles.periodChipActive,
              ]}
              onPress={() => setClockSelection(prev => ({ ...prev, period }))}
            >
              <Text
                style={[
                  styles.periodChipText,
                  clockSelection.period === period && styles.periodChipTextActive,
                ]}
              >
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.timeConfirmButton} onPress={handleClockConfirm}>
          <Text style={styles.timeConfirmButtonText}>Set {formatted}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const shouldShowInput =
    currentState !== 'main_menu' &&
    currentState !== 'vitals_selection' &&
    currentState !== 'reminders_select' &&
    currentState !== 'vitals_chat' &&
    currentState !== 'appointments_chat' &&
    currentState !== 'appointments_chat_specialty';

  const pickerActive = showCalendarPicker || showTimePicker;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => navigation.navigate('Home')}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <MaterialCommunityIcons name="robot" size={28} color="#007AFF" />
          <Text style={styles.headerTitle}>{t('aiChat')}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Chat Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollToBottom()}
        >
          {messages.map(renderMessage)}
          {showCalendarPicker && renderCalendarPickerCard()}
          {showTimePicker && renderTimePickerCard()}
          {isLoading && (
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.messageText}>{t('thinking')}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Input Area */}
      {shouldShowInput && (
        <View style={styles.inputContainer}>
          {currentState === 'symptom_chat' && selectedImages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.previewScroll}
              contentContainerStyle={styles.previewRow}
            >
              {selectedImages.map((image, index) => (
                <View key={`preview-${index}`} style={styles.previewItem}>
                  <Image source={{ uri: image.uri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.previewRemove}
                    onPress={() => handleRemoveImage(index)}
                  >
                    <MaterialCommunityIcons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            {currentState === 'symptom_chat' && (
              <TouchableOpacity style={styles.attachButton} onPress={handleAttachPress}>
                <MaterialCommunityIcons name="image-plus" size={24} color="#007AFF" />
              </TouchableOpacity>
            )}
            <TextInput
              style={styles.textInput}
              placeholder={t('typeYourMessage')}
              placeholderTextColor="#999"
              value={userInput}
              onChangeText={setUserInput}
              editable={!pickerActive}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={styles.sendIconButton}
              onPress={handleSendMessage}
              disabled={currentState === 'symptom_chat'
                ? (!userInput.trim() && selectedImages.length === 0) || pickerActive
                : !userInput.trim() || pickerActive}
            >
              <MaterialCommunityIcons
                name="send"
                size={24}
                color={currentState === 'symptom_chat'
                  ? userInput.trim() || selectedImages.length > 0 ? (pickerActive ? '#ccc' : '#007AFF') : '#ccc'
                  : userInput.trim() && !pickerActive ? '#007AFF' : '#ccc'}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <BottomNavBar navigation={navigation} />
    </SafeAreaView>
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
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 35,
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    padding: 15,
    paddingBottom: 20,
  },
  messageBubble: {
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    maxWidth: '85%',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8E8E8',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  buttonsContainer: {
    marginTop: 10,
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 4,
  },
  optionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  inlinePickerCard: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    backgroundColor: '#fff',
  },
  inlinePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  inlinePickerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  inlineCalendar: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  clockFace: {
    alignSelf: 'center',
    marginVertical: 12,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    position: 'relative',
  },
  clockNumber: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clockMinuteNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  clockNumberSelected: {
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  clockNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  clockNumberTextSelected: {
    color: '#fff',
  },
  clockCenterDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    top: '50%',
    left: '50%',
    marginLeft: -6,
    marginTop: -6,
  },
  periodToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  periodChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  periodChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  periodChipTextActive: {
    color: '#fff',
  },
  timeConfirmButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
  },
  timeConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendIconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewScroll: {
    maxHeight: 80,
  },
  previewRow: {
    alignItems: 'center',
    gap: 12,
  },
  previewItem: {
    position: 'relative',
  },
  previewImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
  },
  previewRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 3,
  },
  messageImageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  messageImage: {
    width: 110,
    height: 110,
    borderRadius: 12,
  },
});

export default AIChatScreen;
