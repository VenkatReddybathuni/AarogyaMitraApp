import React, { useCallback, useEffect, useMemo, useState, useContext } from 'react';
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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { format } from 'date-fns';
import Constants from 'expo-constants';
import { db } from '../firebaseConfig';
import BottomNavBar from '../components/BottomNavBar';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import CustomModal from '../components/CustomModal';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';
// Gemini API configuration for vital parsing
const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=';
const API_KEY = Constants.expoConfig?.extra?.geminiApiKey ?? '';

// Vitals config (will be created dynamically with translations inside component)
const VITALS_CONFIG_BASE = [
  {
    id: 'bp',
    icon: 'heart-pulse',
    color: '#D93025',
    inputType: 'bp',
    labelKey: 'bloodPressure',
  },
  {
    id: 'sugar',
    icon: 'water-percent',
    color: '#007AFF',
    inputType: 'sugar',
    labelKey: 'bloodSugar',
  },
  {
    id: 'spo2',
    icon: 'gas-cylinder',
    color: '#34A853',
    inputType: 'spo2',
    labelKey: 'spO2',
  },
  {
    id: 'temp',
    icon: 'thermometer',
    color: '#FAA918',
    inputType: 'temp',
    labelKey: 'temperature',
  },
  {
    id: 'hr',
    icon: 'heart-outline',
    color: '#D93025',
    inputType: 'hr',
    labelKey: 'heartRate',
  },
  {
    id: 'weight',
    icon: 'weight-kilogram',
    color: '#5F6368',
    inputType: 'weight',
    labelKey: 'weight',
  },
];

const QUEUED_STATUS_HINT = 'Queued - will sync when online';

const getVitalsHistoryKey = (profileId, vitalId) => `vitals_history__${profileId}__${vitalId}`;
const getVitalsConfigKey = (profileId) => `vitals_config__${profileId}`;

const cacheVitalsReadings = async (profileId, vitalId, readings) => {
  try {
    const payload = JSON.stringify({ readings, cachedAt: Date.now() });
    await AsyncStorage.setItem(getVitalsHistoryKey(profileId, vitalId), payload);
  } catch (error) {
    console.warn('Failed to cache vitals history', profileId, vitalId, error);
  }
};

const getCachedVitalsReadings = async (profileId, vitalId) => {
  try {
    const stored = await AsyncStorage.getItem(getVitalsHistoryKey(profileId, vitalId));
    if (!stored) {
      return null;
    }
    return JSON.parse(stored);
  } catch (error) {
    console.warn('Failed to read cached vitals history', profileId, vitalId, error);
    return null;
  }
};

const cacheAllVitals = async (profileId, vitalsConfig) => {
  try {
    const payload = JSON.stringify({ config: vitalsConfig, cachedAt: Date.now() });
    await AsyncStorage.setItem(getVitalsConfigKey(profileId), payload);
  } catch (error) {
    console.warn('Failed to cache vitals config', profileId, error);
  }
};

const getVitalsQueueKey = (profileId) => `vitals_queue__${profileId}`;

const readQueuedVitals = async (profileId) => {
  try {
    const raw = await AsyncStorage.getItem(getVitalsQueueKey(profileId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read queued vitals', profileId, error);
    return [];
  }
};

const persistQueuedVitals = async (profileId, queue) => {
  try {
    if (!queue || queue.length === 0) {
      await AsyncStorage.removeItem(getVitalsQueueKey(profileId));
      return;
    }
    await AsyncStorage.setItem(getVitalsQueueKey(profileId), JSON.stringify(queue));
  } catch (error) {
    console.warn('Failed to persist queued vitals', profileId, error);
  }
};

const enqueueQueuedVital = async (profileId, entry) => {
  try {
    const queue = await readQueuedVitals(profileId);
    queue.push(entry);
    await persistQueuedVitals(profileId, queue);
  } catch (error) {
    console.warn('Failed to enqueue vital', profileId, error);
  }
};

// Helper: determine severity for a reading. Returns 'normal' | 'warning' | 'danger'
const getSeverityForVital = (vitalId, data) => {
  try {
    switch (vitalId) {
      case 'bp': {
        const s = parseInt(data.systolic ?? data.s ?? NaN);
        const d = parseInt(data.diastolic ?? data.d ?? NaN);
        if (isNaN(s) || isNaN(d)) return 'normal';
        if (s >= 180 || d >= 120) return 'danger'; // hypertensive crisis
        if (s >= 140 || d >= 90) return 'warning'; // high
        if (s < 90 || d < 60) return 'warning'; // low
        return 'normal';
      }
      case 'sugar': {
        const lvl = parseInt(data.level ?? data.l ?? NaN);
        const type = (data.type || 'Fasting').toLowerCase();
        if (isNaN(lvl)) return 'normal';
        if (lvl < 54) return 'danger'; // severe hypoglycemia
        // Handle both English and lowercase versions for backward compatibility
        if (type === 'fasting' || type.includes('fasting')) {
          if (lvl >= 126) return 'danger';
          if (lvl >= 100) return 'warning';
          return 'normal';
        } else {
          // Post-meal
          if (lvl >= 200) return 'danger';
          if (lvl >= 140) return 'warning';
          return 'normal';
        }
      }
      case 'spo2': {
        const p = parseInt(data.percentage ?? data.p ?? NaN);
        if (isNaN(p)) return 'normal';
        if (p < 90) return 'danger';
        if (p < 95) return 'warning';
        return 'normal';
      }
      case 'temp': {
        let v = parseFloat(data.value ?? data.v ?? NaN);
        const unit = data.unit || '°C';
        if (isNaN(v)) return 'normal';
        if (unit === '°F') v = (v - 32) * (5 / 9);
        if (v < 35) return 'danger';
        if (v < 36.1) return 'warning';
        if (v >= 39) return 'danger';
        if (v >= 37.5) return 'warning';
        return 'normal';
      }
      case 'hr': {
        const b = parseInt(data.bpm ?? data.b ?? NaN);
        if (isNaN(b)) return 'normal';
        if (b < 40 || b > 130) return 'danger';
        if (b < 60 || b > 100) return 'warning';
        return 'normal';
      }
      case 'weight': {
        const w = parseFloat(data.value ?? data.w ?? NaN);
        if (isNaN(w)) return 'normal';
        if (w < 30 || w > 200) return 'warning';
        return 'normal';
      }
      default:
        return 'normal';
    }
  } catch (e) {
    return 'normal';
  }
};

const RecordVitalsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, effectiveProfileId } = useContext(ProfileContext);
  const [expandedVital, setExpandedVital] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  // State for all vital inputs
  const [inputs, setInputs] = useState({
    bp: { systolic: '', diastolic: '' },
    sugar: { level: '', type: '' }, // will be set in useEffect
    spo2: { percentage: '' },
    temp: { value: '', unit: '°C' },
    hr: { bpm: '' },
    weight: { value: '', unit: 'kg' },
  });

  // Initialize sugar type with translation
  useEffect(() => {
    setInputs(prev => ({
      ...prev,
      sugar: { ...prev.sugar, type: prev.sugar.type || t('fasting') }
    }));
  }, [t]);

  // State for vitals history
  const [history, setHistory] = useState({
    bp: [],
    sugar: [],
    spo2: [],
    temp: [],
    hr: [],
    weight: [],
  });

  // State for AI-powered input confirmation
  const [confirmationModalVisible, setConfirmationModalVisible] = useState(false);
  const [pendingVitalId, setPendingVitalId] = useState(null);
  const [pendingParsedData, setPendingParsedData] = useState(null);
  const [pendingConfirmationMessage, setPendingConfirmationMessage] = useState('');

  // Build VITALS_CONFIG with translations
  const VITALS_CONFIG = useMemo(() => {
    return VITALS_CONFIG_BASE.map((vital) => ({
      ...vital,
      name: t(vital.labelKey),
    }));
  }, [t]);
  const showModal = useCallback((message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  }, []);

  const resolveOnlineStatus = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      const online = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      return online;
    } catch (error) {
      console.warn('Failed to resolve network status', error);
      return false;
    }
  }, []);

  const handleInputChange = useCallback((vitalId, field, value) => {
    setInputs((prev) => ({
      ...prev,
      [vitalId]: {
        ...prev[vitalId],
        [field]: value,
      },
    }));
  }, []);

  const formatRecordedAt = (date) => {
    if (!date) return t('unknownTime');
    try {
      return format(date, 'MMM d, h:mm a');
    } catch {
      return t('unknownTime');
    }
  };

  // Evaluate reading against simple clinical thresholds and return status + message
  const evaluateReading = useCallback((vitalId, data) => {
    // status: 'normal' | 'low' | 'high' | 'critical'
    let status = 'normal';
    let message = '';

    try {
      switch (vitalId) {
        case 'bp': {
          const systolic = Number(data.systolic ?? data.systolic);
          const diastolic = Number(data.diastolic ?? data.diastolic);
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
          const level = Number(data.level ?? data.level);
          const type = (data.type || t('fasting'));
          if (!Number.isFinite(level)) break;
          if (type === t('fasting')) {
            if (level >= 126) { status = 'high'; message = t('highGlucose'); }
            else if (level < 70) { status = 'low'; message = t('lowGlucose'); }
          } else {
            // Post-Meal
            if (level >= 200) { status = 'high'; message = t('highPostMeal'); }
            else if (level < 70) { status = 'low'; message = t('lowGlucose'); }
          }
          break;
        }
        case 'spo2': {
          const pct = Number(data.percentage ?? data.percentage);
          if (!Number.isFinite(pct)) break;
          if (pct < 90) { status = 'critical'; message = t('veryLowSpO2'); }
          else if (pct < 94) { status = 'low'; message = t('lowSpO2'); }
          break;
        }
        case 'temp': {
          let val = Number(data.value ?? data.value);
          const unit = data.unit || '°C';
          if (!Number.isFinite(val)) break;
          if (unit === '°F') {
            // convert to °C
            val = (val - 32) * (5 / 9);
          }
          if (val >= 40) { status = 'critical'; message = t('veryHighTemp'); }
          else if (val >= 38) { status = 'high'; message = t('fever'); }
          else if (val < 35) { status = 'low'; message = t('lowTemp'); }
          break;
        }
        case 'hr': {
          const bpm = Number(data.bpm ?? data.bpm);
          if (!Number.isFinite(bpm)) break;
          if (bpm >= 130) { status = 'critical'; message = t('veryHighHR'); }
          else if (bpm > 100) { status = 'high'; message = t('highHR'); }
          else if (bpm < 50) { status = 'low'; message = t('lowHR'); }
          break;
        }
        case 'weight': {
          // Weight alone is not used for quick warnings here
          break;
        }
        default:
          break;
      }
    } catch (e) {
      // ignore evaluation errors and default to normal
      console.warn('evaluateReading error', e);
    }

    return { status, message };
  }, [t]);

  const prepareRecordFromInputs = useCallback(
    (vitalId) => {
      const vital = VITALS_CONFIG.find((item) => item.id === vitalId);
      const input = inputs[vitalId];
      if (!vital || !input) {
        return { isValid: false };
      }

      let recordData = {};
      let valueString = '';
      let isValid = false;

      switch (vitalId) {
        case 'bp': {
          const systolicText = input.systolic?.trim();
          const diastolicText = input.diastolic?.trim();
          const systolic = systolicText ? parseInt(systolicText, 10) : NaN;
          const diastolic = diastolicText ? parseInt(diastolicText, 10) : NaN;
          if (Number.isFinite(systolic) && Number.isFinite(diastolic)) {
            isValid = true;
            valueString = `${systolic} / ${diastolic} mmHg`;
            recordData = {
              systolic,
              diastolic,
              valueString,
            };
          }
          break;
        }
        case 'sugar': {
          const levelText = input.level?.trim();
          const type = input.type || t('fasting');
          const level = levelText ? parseInt(levelText, 10) : NaN;
          if (Number.isFinite(level)) {
            isValid = true;
            valueString = `${level} mg/dL (${type})`;
            recordData = {
              level,
              type,
              valueString,
            };
          }
          break;
        }
        case 'spo2': {
          const pctText = input.percentage?.trim();
          const percentage = pctText ? parseInt(pctText, 10) : NaN;
          if (Number.isFinite(percentage)) {
            isValid = true;
            valueString = `${percentage} %`;
            recordData = {
              percentage,
              valueString,
            };
          }
          break;
        }
        case 'temp': {
          const valueText = input.value?.trim();
          const unit = input.unit || '°C';
          const value = valueText ? parseFloat(valueText) : NaN;
          if (Number.isFinite(value)) {
            isValid = true;
            valueString = `${value} ${unit}`;
            recordData = {
              value,
              unit,
              valueString,
            };
          }
          break;
        }
        case 'hr': {
          const bpmText = input.bpm?.trim();
          const bpm = bpmText ? parseInt(bpmText, 10) : NaN;
          if (Number.isFinite(bpm)) {
            isValid = true;
            valueString = `${bpm} BPM`;
            recordData = {
              bpm,
              valueString,
            };
          }
          break;
        }
        case 'weight': {
          const valueText = input.value?.trim();
          const unit = input.unit || 'kg';
          const value = valueText ? parseFloat(valueText) : NaN;
          if (Number.isFinite(value)) {
            isValid = true;
            valueString = `${value} ${unit}`;
            recordData = {
              value,
              unit,
              valueString,
            };
          }
          break;
        }
        default:
          break;
      }

      if (!isValid) {
        return { isValid: false };
      }

      return { isValid: true, recordData, valueString };
    },
    [inputs, t, VITALS_CONFIG]
  );

  const resetInputsForVital = useCallback(
    (vitalId) => {
      setInputs((prev) => {
        const next = { ...prev };
        const current = { ...next[vitalId] };

        switch (vitalId) {
          case 'bp':
            next[vitalId] = { systolic: '', diastolic: '' };
            break;
          case 'sugar':
            next[vitalId] = {
              ...current,
              level: '',
              type: current.type || t('fasting'),
            };
            break;
          case 'spo2':
            next[vitalId] = { percentage: '' };
            break;
          case 'temp':
            next[vitalId] = {
              ...current,
              value: '',
              unit: current.unit || '°C',
            };
            break;
          case 'hr':
            next[vitalId] = { bpm: '' };
            break;
          case 'weight':
            next[vitalId] = {
              ...current,
              value: '',
              unit: current.unit || 'kg',
            };
            break;
          default:
            next[vitalId] = current;
            break;
        }

        return next;
      });
    },
    [t]
  );

  const removeQueuedEntriesFromHistory = useCallback((vitalIds) => {
    if (!Array.isArray(vitalIds) || vitalIds.length === 0) {
      return;
    }

    setHistory((prev) => {
      const next = { ...prev };
      vitalIds.forEach((vitalId) => {
        const existing = next[vitalId];
        if (Array.isArray(existing)) {
          next[vitalId] = existing.filter((item) => !item?.queued);
        }
      });
      return next;
    });
  }, []);

  const loadHistory = useCallback(async () => {
    if (!effectiveProfileId) return;

    try {
      setIsLoading(true);
      const isOnline = await resolveOnlineStatus();
      const vitalsRef = collection(db, 'users', effectiveProfileId, 'vitals');
      console.log('Loading vitals history for profile:', effectiveProfileId);
      const queuedEntries = await readQueuedVitals(effectiveProfileId);

      for (const vital of VITALS_CONFIG) {
        let readings = [];

        if (isOnline) {
          try {
            const q = query(
              vitalsRef,
              where('vitalId', '==', vital.id),
              orderBy('recordedAt', 'desc'),
              limit(15)
            );

            const snapshot = await getDocs(q);
            readings = snapshot.docs.map((doc) => {
              const data = doc.data();
              const recordedAt = data.recordedAt?.toDate?.() ?? new Date();
              let status = data.status;
              let statusMessage = data.statusMessage;
              if (!status) {
                const evalRes = evaluateReading(data.vitalId || vital.id, data);
                status = evalRes.status;
                statusMessage = evalRes.message;
              }
              return {
                id: doc.id,
                ...data,
                recordedAt,
                status,
                statusMessage,
              };
            });

            if (readings.length > 0) {
              await cacheVitalsReadings(effectiveProfileId, vital.id, readings);
            }

            console.log(`Loaded ${readings.length} readings for ${vital.name}`);
          } catch (error) {
            console.warn(`Failed to fetch fresh vitals for ${vital.id}, trying cache:`, error);
          }
        }

        if (readings.length === 0) {
          const cached = await getCachedVitalsReadings(effectiveProfileId, vital.id);
          if (cached?.readings) {
            readings = cached.readings;
            console.log(`Loaded ${readings.length} cached readings for ${vital.name}`);
          }
        }

        const pendingQueued = queuedEntries
          .filter((entry) => entry.vitalId === vital.id)
          .sort((a, b) => (b.queuedAt || 0) - (a.queuedAt || 0))
          .map((entry) => ({
            id: `queued-${entry.queuedAt}`,
            ...entry.recordData,
            valueString: entry.valueString || entry.recordData?.valueString,
            recordedAt: new Date(entry.queuedAt || Date.now()),
            status: entry.status,
            statusMessage: entry.statusMessage || QUEUED_STATUS_HINT,
            queued: true,
          }));

        if (pendingQueued.length > 0) {
          readings = [...pendingQueued, ...readings];
        }

        setHistory((prev) => ({
          ...prev,
          [vital.id]: readings,
        }));
      }

      await cacheAllVitals(effectiveProfileId, VITALS_CONFIG);
    } catch (error) {
      console.error('Failed to load vitals history:', error);
      showModal('Could not load vitals history', true);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveProfileId, VITALS_CONFIG, evaluateReading, resolveOnlineStatus, showModal]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const flushQueuedVitals = useCallback(async () => {
    if (!effectiveProfileId) return;

    try {
      const queued = await readQueuedVitals(effectiveProfileId);
      if (!queued.length) {
        return;
      }

      const vitalsRef = collection(db, 'users', effectiveProfileId, 'vitals');
      const remaining = [];
      let syncedCount = 0;
      const syncedVitalIds = new Set();

      for (const entry of queued) {
        try {
          await addDoc(vitalsRef, {
            vitalId: entry.vitalId,
            vitalName: entry.vitalName,
            ...entry.recordData,
            status: entry.status,
            statusMessage: entry.statusMessage,
            recordedAt: serverTimestamp(),
          });
          syncedCount += 1;
          syncedVitalIds.add(entry.vitalId);
        } catch (error) {
          console.warn('Failed to sync queued vital', entry, error);
          remaining.push(entry);
        }
      }

      await persistQueuedVitals(effectiveProfileId, remaining);

      if (syncedCount > 0) {
        const message = syncedCount === 1
          ? 'Queued reading synced successfully.'
          : `${syncedCount} queued readings synced successfully.`;
        removeQueuedEntriesFromHistory(Array.from(syncedVitalIds));
        showModal(message);
        await loadHistory();
      }
    } catch (error) {
      console.warn('Error flushing queued vitals', error);
    }
  }, [effectiveProfileId, loadHistory, removeQueuedEntriesFromHistory, showModal]);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      const online = await resolveOnlineStatus();
      if (online) {
        await flushQueuedVitals();
      }
    };

    initialize();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      if (online) {
        flushQueuedVitals().catch((error) => console.warn('Sync queued vitals listener error', error));
      }
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [flushQueuedVitals, resolveOnlineStatus]);

  // AI-powered vital input parsing with confirmation
  // Understands natural language: "hundred and twenty" → 120, "one fifty" → 150, etc.
  const parseAndConfirmVitalInput = async (vitalId, rawInput) => {
    try {
      let prompt = '';
      
      switch (vitalId) {
        case 'bp':
          prompt = `You are a health data parser for a rural health app. User entered: "${rawInput}" for Blood Pressure.
The user may speak naturally in various ways: "one twenty over eighty", "120 80", "hundred twenty / eighty", "twelve-oh-eighty", etc.
IMPORTANT: Convert spoken numbers to digits. Handle all natural language variations.
Examples: "one twenty" → 120, "hundred and eighty" → 180, "eighty five" → 85
Extract systolic and diastolic values. Respond with ONLY valid JSON (no markdown):
{"parsed": true, "systolic": 120, "diastolic": 80, "formatted": "120/80 mmHg", "interpretation": "User said 'one twenty over eighty' - you understood 120/80"}
OR if invalid: {"parsed": false, "formatted": null, "interpretation": "Could not understand this as blood pressure"}`;
          break;
        case 'sugar':
          prompt = `You are a health data parser for a rural health app. User entered: "${rawInput}" for Blood Sugar level.
The user may use natural language: "one twenty", "hundred twenty", "one hundred and twenty", "one-two-zero", numbers with text, etc.
IMPORTANT: Convert ANY spoken or written number format to numeric value. Examples: "hundred and twenty" → 120, "one-o-five" → 105
Extract glucose level value. Respond with ONLY valid JSON (no markdown):
{"parsed": true, "level": 120, "formatted": "120 mg/dL", "interpretation": "User said 'one hundred twenty' - you understood 120"}
OR if invalid: {"parsed": false, "formatted": null, "interpretation": "Could not understand this as a number"}`;
          break;
        case 'spo2':
          prompt = `You are a health data parser for a rural health app. User entered: "${rawInput}" for SpO2 (oxygen saturation).
The user may say: "ninety eight", "nine-eight", "98 percent", "98%", "ninety-eight", "nine eight", "nighty-eight", etc.
IMPORTANT: Convert spoken numbers to digits. Examples: "ninety five" → 95, "nine-five" → 95
Extract oxygen percentage (0-100). Respond with ONLY valid JSON (no markdown):
{"parsed": true, "percentage": 98, "formatted": "98%", "interpretation": "User said 'ninety eight' - you understood 98%"}
OR if invalid: {"parsed": false, "formatted": null, "interpretation": "Could not understand this as a percentage"}`;
          break;
        case 'temp':
          prompt = `You are a health data parser for a rural health app. User entered: "${rawInput}" for Temperature.
The user may say: "ninety eight point six", "98.6", "98 6", "ninety eight Fahrenheit", "37 Celsius", "thirty seven", etc.
IMPORTANT: Convert spoken/written numbers to digits. Determine unit (°C or °F) from context or assume °F for Western-style temps.
Examples: "ninety eight point six" → 98.6°F, "thirty-seven" → 37°C, "98 6 F" → 98.6°F
Extract temperature value and unit. Respond with ONLY valid JSON (no markdown):
{"parsed": true, "value": 98.6, "unit": "°F", "formatted": "98.6°F", "interpretation": "User said 'ninety eight point six' - you understood 98.6°F"}
OR if invalid: {"parsed": false, "formatted": null, "interpretation": "Could not understand this as a temperature"}`;
          break;
        case 'hr':
          prompt = `You are a health data parser for a rural health app. User entered: "${rawInput}" for Heart Rate (beats per minute).
The user may say: "seventy two", "seven-two", "72 bpm", "one hundred", "hundred beats", "ninety", etc.
IMPORTANT: Convert spoken numbers to digits. Examples: "seventy" → 70, "one hundred" → 100, "one-oh-five" → 105
Extract BPM value (typically 40-200). Respond with ONLY valid JSON (no markdown):
{"parsed": true, "bpm": 72, "formatted": "72 BPM", "interpretation": "User said 'seventy-two' - you understood 72 BPM"}
OR if invalid: {"parsed": false, "formatted": null, "interpretation": "Could not understand this as a heart rate"}`;
          break;
        case 'weight':
          prompt = `You are a health data parser for a rural health app. User entered: "${rawInput}" for Weight.
The user may say naturally: "seventy kilos", "seventy kg", "one fifty pounds", "one-five-zero", "hundred and twenty kg", "eighty", etc.
IMPORTANT: Convert ANY spoken number format to numeric. Examples: "one fifty" → 150, "hundred and twenty" → 120, "eight-five" → 85
Detect unit if mentioned (kg, lbs, pounds, kilos). Default to kg if not specified.
Extract weight value and unit. Respond with ONLY valid JSON (no markdown):
{"parsed": true, "value": 70, "unit": "kg", "formatted": "70 kg", "interpretation": "User said 'seventy kilos' - you understood 70 kg"}
OR if invalid: {"parsed": false, "formatted": null, "interpretation": "Could not understand this as a weight"}`;
          break;
        default:
          return null;
      }

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
      
      try {
        const parsed = JSON.parse(aiText);
        return parsed;
      } catch (e) {
        console.warn('Failed to parse vital response:', aiText);
        return { parsed: false, formatted: null, interpretation: 'Error parsing input' };
      }
    } catch (error) {
      console.error('Vital parsing error:', error);
      return { parsed: false, formatted: null, interpretation: 'Error parsing input' };
    }
  };

  // Enhanced handler with AI parsing and confirmation
  const handleSaveReadingWithAIParsing = async (vitalId) => {
    if (!user) {
      showModal('Please sign in to record vitals', true);
      return;
    }

    if (!effectiveProfileId) {
      showModal('Please select a patient profile before recording vitals.', true);
      return;
    }

    const vital = VITALS_CONFIG.find((v) => v.id === vitalId);
    const input = inputs[vitalId];

    // Collect raw input based on vital type
    let rawInput = '';
    switch (vitalId) {
      case 'bp':
        rawInput = `${input.systolic}/${input.diastolic}`;
        break;
      case 'sugar':
        rawInput = input.level;
        break;
      case 'spo2':
        rawInput = input.percentage;
        break;
      case 'temp':
        rawInput = `${input.value}${input.unit}`;
        break;
      case 'hr':
        rawInput = input.bpm;
        break;
      case 'weight':
        rawInput = `${input.value}${input.unit}`;
        break;
    }

    if (!rawInput || rawInput.includes('undefined')) {
      showModal(`Please enter ${vital.name.toLowerCase()} reading`, true);
      return;
    }

    try {
      setIsSaving(true);

      const online = await resolveOnlineStatus();

      if (!online) {
        const { isValid, recordData, valueString } = prepareRecordFromInputs(vitalId);
        if (!isValid) {
          showModal(`Please enter valid ${vital.name.toLowerCase()} reading`, true);
          setIsSaving(false);
          return;
        }

        const evalResult = evaluateReading(vitalId, recordData);
        const queuedEntry = {
          vitalId,
          vitalName: vital.name,
          recordData,
          valueString,
          status: evalResult.status,
          statusMessage: evalResult.message || '',
          queuedAt: Date.now(),
        };

        await enqueueQueuedVital(effectiveProfileId, queuedEntry);

        setHistory((prev) => ({
          ...prev,
          [vitalId]: [
            {
              id: `queued-${queuedEntry.queuedAt}`,
              ...queuedEntry.recordData,
              valueString: queuedEntry.valueString,
              recordedAt: new Date(queuedEntry.queuedAt),
              status: queuedEntry.status,
              statusMessage:
                queuedEntry.statusMessage || QUEUED_STATUS_HINT,
              queued: true,
            },
            ...((prev[vitalId] || []).filter((item) => !item?.queued)),
          ],
        }));

        resetInputsForVital(vitalId);

        showModal(`${vital.name} reading queued. It will sync automatically when you are back online.`);
        setIsSaving(false);
        return;
      }

      // Use AI to parse the input
      const parseResult = await parseAndConfirmVitalInput(vitalId, rawInput);

      if (!parseResult || !parseResult.parsed) {
        // AI couldn't parse - ask user to retry
        showModal(
          `I didn't understand "${rawInput}". ${parseResult?.interpretation || 'Please try again with a clearer format.'}`,
          true
        );
        setIsSaving(false);
        return;
      }

      // AI successfully parsed - show confirmation
      setPendingVitalId(vitalId);
      setPendingParsedData(parseResult);
      setPendingConfirmationMessage(
        `Did you mean ${parseResult.formatted}? Is that correct?`
      );
      setConfirmationModalVisible(true);
      setIsSaving(false);
    } catch (error) {
      console.error('Error in AI parsing handler:', error);
      showModal('Error processing input. Please try again.', true);
      setIsSaving(false);
    }
  };

  // Confirm parsed data and save
  const handleConfirmParsedData = async () => {
    if (!pendingVitalId || !pendingParsedData) return;

    const vital = VITALS_CONFIG.find((v) => v.id === pendingVitalId);
    let recordData = {};
    let valueString = '';

    try {
      setIsSaving(true);
      setConfirmationModalVisible(false);

      // Prepare data based on vital type
      switch (pendingVitalId) {
        case 'bp':
          recordData = {
            systolic: pendingParsedData.systolic,
            diastolic: pendingParsedData.diastolic,
            valueString: pendingParsedData.formatted,
          };
          break;
        case 'sugar':
          recordData = {
            level: pendingParsedData.level,
            type: inputs[pendingVitalId].type,
            valueString: `${pendingParsedData.formatted} (${inputs[pendingVitalId].type})`,
          };
          break;
        case 'spo2':
          recordData = {
            percentage: pendingParsedData.percentage,
            valueString: pendingParsedData.formatted,
          };
          break;
        case 'temp':
          recordData = {
            value: pendingParsedData.value,
            unit: pendingParsedData.unit,
            valueString: pendingParsedData.formatted,
          };
          break;
        case 'hr':
          recordData = {
            bpm: pendingParsedData.bpm,
            valueString: pendingParsedData.formatted,
          };
          break;
        case 'weight':
          recordData = {
            value: pendingParsedData.value,
            unit: pendingParsedData.unit,
            valueString: pendingParsedData.formatted,
          };
          break;
      }

      const vitalsRef = collection(db, 'users', effectiveProfileId, 'vitals');
      console.log('Saving parsed vital to Firestore:', {
        profileId: effectiveProfileId,
        vitalId: pendingVitalId,
        vitalName: vital.name,
        recordData,
      });

      // Evaluate status before saving
      const evalResult = evaluateReading(pendingVitalId, recordData);
      await addDoc(vitalsRef, {
        vitalId: pendingVitalId,
        vitalName: vital.name,
        ...recordData,
        status: evalResult.status,
        statusMessage: evalResult.message,
        recordedAt: serverTimestamp(),
      });

      console.log('Vital saved successfully:', pendingVitalId);

      // Clear input
      resetInputsForVital(pendingVitalId);

      if (evalResult && evalResult.status && evalResult.status !== 'normal') {
        const warningText = `${vital.name} reading saved — ${evalResult.message || evalResult.status}`;
        showModal(warningText, true);
      } else {
        showModal(`${vital.name} reading saved successfully!`);
      }

      // Reload history
      const q = query(
        vitalsRef,
        where('vitalId', '==', pendingVitalId),
        orderBy('recordedAt', 'desc'),
        limit(15)
      );

      const snapshot = await getDocs(q);
      const readings = snapshot.docs.map((doc) => {
        const data = doc.data();
        const recordedAt = data.recordedAt?.toDate?.() ?? new Date();
        let status = data.status;
        let statusMessage = data.statusMessage;
        if (!status) {
          const evalRes = evaluateReading(data.vitalId || pendingVitalId, data);
          status = evalRes.status;
          statusMessage = evalRes.message;
        }
        return {
          id: doc.id,
          ...data,
          recordedAt,
          status,
          statusMessage,
        };
      });

      setHistory((prev) => ({
        ...prev,
        [pendingVitalId]: readings,
      }));

      // Clear pending states
      setPendingVitalId(null);
      setPendingParsedData(null);
      setPendingConfirmationMessage('');
    } catch (error) {
      console.error('Error saving parsed vital:', error);
      showModal('Error saving vital. Please try again.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveReading = async (vitalId) => {
    if (!user) {
      showModal('Please sign in to record vitals', true);
      return;
    }

    if (!effectiveProfileId) {
      showModal('Please select a patient profile before recording vitals.', true);
      return;
    }

  const vital = VITALS_CONFIG.find((v) => v.id === vitalId);
  const { isValid, recordData } = prepareRecordFromInputs(vitalId);

    if (!isValid || !recordData) {
      showModal(`Please enter valid ${vital.name.toLowerCase()} reading`, true);
      return;
    }

    try {
      setIsSaving(true);

      const vitalsRef = collection(db, 'users', effectiveProfileId, 'vitals');
      console.log('Saving vital to Firestore:', {
        profileId: effectiveProfileId,
        vitalId,
        vitalName: vital.name,
        recordData,
      });

      // evaluate status before saving so it can be persisted and shown in history
      const evalResult = evaluateReading(vitalId, recordData);
      await addDoc(vitalsRef, {
        vitalId,
        vitalName: vital.name,
        ...recordData,
        status: evalResult.status,
        statusMessage: evalResult.message,
        recordedAt: serverTimestamp(),
      });

      console.log('Vital saved successfully:', vitalId);

      // Clear input
      resetInputsForVital(vitalId);

      if (evalResult && evalResult.status && evalResult.status !== 'normal') {
        // show warning/modal for abnormal values
        const warningText = `${vital.name} reading saved — ${evalResult.message || evalResult.status}`;
        showModal(warningText, true);
      } else {
        showModal(`${vital.name} reading saved successfully!`);
      }

      // Reload history
      const q = query(
        vitalsRef,
        where('vitalId', '==', vitalId),
        orderBy('recordedAt', 'desc'),
        limit(15)
      );
      const snapshot = await getDocs(q);
      const readings = snapshot.docs.map((doc) => {
        const data = doc.data();
        const recordedAt = data.recordedAt?.toDate?.() ?? new Date();
        let status = data.status;
        let statusMessage = data.statusMessage;
        if (!status) {
          const evalRes = evaluateReading(data.vitalId || vitalId, data);
          status = evalRes.status;
          statusMessage = evalRes.message;
        }
        return {
          id: doc.id,
          ...data,
          recordedAt,
          status,
          statusMessage,
        };
      });

      console.log(`History reloaded for ${vital.name}:`, readings.length, 'readings');

      setHistory((prev) => ({
        ...prev,
        [vitalId]: readings,
      }));
    } catch (error) {
      console.error('Failed to save vital reading:', {
        vitalId,
        vitalName: vital.name,
        error: error.message,
        code: error.code,
      });
      showModal('Could not save reading. Please try again.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const renderVitalInput = (vitalId) => {
    const input = inputs[vitalId];

    switch (vitalId) {
      case 'bp':
        return (
          <View style={styles.inputGroup}>
            <View style={styles.bpInputContainer}>
              <TextInput
                style={styles.bpInput}
                placeholder="Systolic"
                placeholderTextColor="#aaa"
                value={input.systolic}
                onChangeText={(val) =>
                  handleInputChange(vitalId, 'systolic', val)
                }
                keyboardType="number-pad"
              />
              <Text style={styles.bpSeparator}>/</Text>
              <TextInput
                style={styles.bpInput}
                placeholder="Diastolic"
                placeholderTextColor="#aaa"
                value={input.diastolic}
                onChangeText={(val) =>
                  handleInputChange(vitalId, 'diastolic', val)
                }
                keyboardType="number-pad"
              />
              <Text style={styles.unitLabel}>mmHg</Text>
            </View>
          </View>
        );
      case 'sugar':
        return (
          <View style={styles.inputGroup}>
            <View style={styles.toggleContainer}>
              {[t('fasting'), t('postMeal')].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleButton,
                    input.type === type && styles.toggleButtonActive,
                  ]}
                  onPress={() => handleInputChange(vitalId, 'type', type)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      input.type === type && styles.toggleTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Level (mg/dL)"
                placeholderTextColor="#aaa"
                value={input.level}
                onChangeText={(val) => handleInputChange(vitalId, 'level', val)}
                keyboardType="number-pad"
              />
            </View>
          </View>
        );
      case 'spo2':
        return (
          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Percentage (%)"
                placeholderTextColor="#aaa"
                value={input.percentage}
                onChangeText={(val) =>
                  handleInputChange(vitalId, 'percentage', val)
                }
                keyboardType="number-pad"
              />
            </View>
          </View>
        );
      case 'temp':
        return (
          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Temperature"
                placeholderTextColor="#aaa"
                value={input.value}
                onChangeText={(val) => handleInputChange(vitalId, 'value', val)}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitToggle}>
                {['°C', '°F'].map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.unitButton,
                      input.unit === unit && styles.unitButtonActive,
                    ]}
                    onPress={() => handleInputChange(vitalId, 'unit', unit)}
                  >
                    <Text
                      style={[
                        styles.unitButtonText,
                        input.unit === unit && styles.unitButtonTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );
      case 'hr':
        return (
          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="BPM"
                placeholderTextColor="#aaa"
                value={input.bpm}
                onChangeText={(val) => handleInputChange(vitalId, 'bpm', val)}
                keyboardType="number-pad"
              />
            </View>
          </View>
        );
      case 'weight':
        return (
          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Weight"
                placeholderTextColor="#aaa"
                value={input.value}
                onChangeText={(val) => handleInputChange(vitalId, 'value', val)}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitToggle}>
                {['kg', 'lbs'].map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.unitButton,
                      input.unit === unit && styles.unitButtonActive,
                    ]}
                    onPress={() => handleInputChange(vitalId, 'unit', unit)}
                  >
                    <Text
                      style={[
                        styles.unitButtonText,
                        input.unit === unit && styles.unitButtonTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const renderVitalCard = (vital) => {
    const isExpanded = expandedVital === vital.id;
    const readings = history[vital.id] || [];

    // Prepare a preview evaluation for current inputs so we can warn before saving
    const currentInput = inputs[vital.id] || {};
    let previewRecord = {};
    switch (vital.id) {
      case 'bp':
        previewRecord = {
          systolic: currentInput.systolic ? parseInt(currentInput.systolic) : undefined,
          diastolic: currentInput.diastolic ? parseInt(currentInput.diastolic) : undefined,
        };
        break;
      case 'sugar':
        previewRecord = {
          level: currentInput.level ? parseInt(currentInput.level) : undefined,
          type: currentInput.type || t('fasting'),
        };
        break;
      case 'spo2':
        previewRecord = { percentage: currentInput.percentage ? parseInt(currentInput.percentage) : undefined };
        break;
      case 'temp':
        previewRecord = { value: currentInput.value ? parseFloat(currentInput.value) : undefined, unit: currentInput.unit || '°C' };
        break;
      case 'hr':
        previewRecord = { bpm: currentInput.bpm ? parseInt(currentInput.bpm) : undefined };
        break;
      case 'weight':
        previewRecord = { value: currentInput.value ? parseFloat(currentInput.value) : undefined, unit: currentInput.unit || 'kg' };
        break;
      default:
        previewRecord = {};
    }
    const previewEval = evaluateReading(vital.id, previewRecord);

    return (
      <View key={vital.id} style={styles.vitalCard}>
        {/* Header - Always visible */}
        <TouchableOpacity
          style={styles.vitalHeader}
          onPress={() =>
            setExpandedVital(isExpanded ? null : vital.id)
          }
          activeOpacity={0.7}
        >
          <View style={styles.vitalHeaderLeft}>
            <MaterialCommunityIcons
              name={vital.icon}
              size={28}
              color={vital.color}
            />
            <View style={styles.vitalHeaderInfo}>
              <Text style={styles.vitalName}>{vital.name}</Text>
              {readings.length > 0 && (
                <Text style={styles.lastRecording}>
                  Last: {readings[0].valueString}
                </Text>
              )}
            </View>
          </View>
          <MaterialCommunityIcons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#666"
          />
        </TouchableOpacity>

        {/* Expanded Content */}
        {isExpanded && (
          <View style={styles.vitalContent}>
            {/* Input Section */}
            <View style={styles.inputSection}>
              <Text style={styles.sectionTitle}>Record Reading</Text>
              {renderVitalInput(vital.id)}
              {previewEval && previewEval.status && previewEval.status !== 'normal' && (
                <View style={styles.previewWarning}>
                  <Text style={[styles.previewWarningText, previewEval.status === 'critical' && styles.previewDangerText]}>
                    {previewEval.message || (previewEval.status === 'critical' ? 'Critical reading' : 'Abnormal reading')}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  isSaving && styles.saveButtonDisabled,
                ]}
                onPress={() => handleSaveReadingWithAIParsing(vital.id)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('saveReading')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* History Section */}
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>
                {t('history')} ({readings.length})
              </Text>
              {readings.length > 0 ? (
                <View>
                  {readings.map((reading) => {
                    const status = reading.status || 'normal';
                    const statusStyles =
                      status === 'high'
                        ? { borderLeftWidth: 4, borderLeftColor: '#D93025', paddingLeft: 10 }
                        : status === 'low'
                        ? { borderLeftWidth: 4, borderLeftColor: '#FAA918', paddingLeft: 10 }
                        : status === 'critical'
                        ? { borderLeftWidth: 4, borderLeftColor: '#8B0000', paddingLeft: 10 }
                        : {};
                    const valueColor =
                      status === 'high'
                        ? '#D93025'
                        : status === 'low'
                        ? '#B36B00'
                        : status === 'critical'
                        ? '#8B0000'
                        : '#333';

                    return (
                      <View key={reading.id} style={[styles.historyItem, statusStyles]}>
                        <Text style={[styles.historyValue, { color: valueColor }]}>
                          {reading.valueString}
                        </Text>
                        <Text style={styles.historyDate}>
                          {formatRecordedAt(reading.recordedAt)}
                        </Text>
                        {reading.statusMessage ? (
                          <Text style={[styles.statusMessage, { color: valueColor }]}>
                            {reading.statusMessage}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.noHistoryText}>
                  {t('noReadings')}
                </Text>
              )}
            </View>
          </View>
        )}
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
          onPress={() => navigation.navigate('Home')}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Record Vitals</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.introText}>
              Tap on any vital to record or view history
            </Text>
            {VITALS_CONFIG.map((vital) => renderVitalCard(vital))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* AI-Powered Vital Input Confirmation Modal */}
      <Modal
        transparent={true}
        visible={confirmationModalVisible}
        animationType="fade"
        onRequestClose={() => setConfirmationModalVisible(false)}
      >
        <View style={styles.confirmationOverlay}>
          <View style={styles.confirmationModalContent}>
            <Text style={styles.confirmationTitle}>Confirm Input</Text>
            <Text style={styles.confirmationMessage}>{pendingConfirmationMessage}</Text>
            
            <View style={styles.confirmationButtonsContainer}>
              <TouchableOpacity
                style={[styles.confirmationButton, styles.confirmYesButton]}
                onPress={handleConfirmParsedData}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>{t('yes')}</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmationButton, styles.confirmNoButton]}
                onPress={() => {
                  setConfirmationModalVisible(false);
                  setPendingVitalId(null);
                  setPendingParsedData(null);
                }}
                disabled={isSaving}
              >
                <Text style={styles.confirmButtonText}>{t('no')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomModal
        isVisible={modalVisible}
        message={modalMessage}
        isError={modalIsError}
        onClose={() => setModalVisible(false)}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
  },
  introText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  vitalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  vitalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  vitalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vitalHeaderInfo: {
    marginLeft: 12,
    flex: 1,
  },
  vitalName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  lastRecording: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  vitalContent: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  bpInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bpInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  bpSeparator: {
    marginHorizontal: 8,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  unitLabel: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  toggleText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
  },
  unitToggle: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  unitButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
  },
  unitButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  unitButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  unitButtonTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  historySection: {
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  historyItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  historyValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statusMessage: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  previewWarning: {
    marginVertical: 8,
    backgroundColor: '#FFF7E6',
    padding: 8,
    borderRadius: 8,
  },
  previewWarningText: {
    color: '#AA6A00',
    fontSize: 13,
    fontWeight: '600',
  },
  previewDangerText: {
    color: '#D93025',
  },
  noHistoryText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  // AI Input Confirmation Modal Styles
  confirmationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmationModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 300,
    alignItems: 'center',
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
  },
  confirmationMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  confirmationButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  confirmationButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmYesButton: {
    backgroundColor: '#34A853',
  },
  confirmNoButton: {
    backgroundColor: '#D93025',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RecordVitalsScreen;
