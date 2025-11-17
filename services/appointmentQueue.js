import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const QUEUE_STORAGE_KEY = 'appointment_queue_v1';
let isFlushInProgress = false;

const readQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read appointment queue', error);
    return [];
  }
};

const writeQueue = async (queue) => {
  try {
    if (!queue || queue.length === 0) {
      await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('Failed to persist appointment queue', error);
  }
};

export const getNetworkStatus = async () => {
  try {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected && (state.isInternetReachable ?? true));
  } catch (error) {
    console.warn('Failed to determine network status for appointments', error);
    return false;
  }
};

const buildEntry = (profileId, operation, payload) => ({
  entryId: `appt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  profileId,
  operation,
  queuedAt: Date.now(),
  payload,
});

const toFirestorePayload = (payload, { includeCreatedAt } = { includeCreatedAt: false }) => {
  const scheduledAt = payload.scheduledAtISO ? new Date(payload.scheduledAtISO) : null;

  const base = {
    doctorName: payload.doctorName ?? null,
    doctorId: payload.doctorId ?? null,
    specialty: payload.specialty ?? null,
    notes: payload.notes ?? '',
    scheduledAt: scheduledAt ? Timestamp.fromDate(scheduledAt) : null,
    meetingUrl: payload.meetingUrl ?? null,
    status: payload.status ?? 'scheduled',
    updatedAt: serverTimestamp(),
  };

  if (includeCreatedAt) {
    base.createdAt = serverTimestamp();
  }

  return base;
};

const appendToQueue = async (entry) => {
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
  return entry;
};

export const queueAppointmentCreate = async (profileId, payload) => {
  return appendToQueue(buildEntry(profileId, 'create', payload));
};

export const queueAppointmentUpdate = async (profileId, appointmentId, payload) => {
  return appendToQueue(
    buildEntry(profileId, 'update', {
      appointmentId,
      ...payload,
    })
  );
};

const createAppointmentNowInternal = async (profileId, payload) => {
  const appointmentsRef = collection(db, 'users', profileId, 'appointments');
  return addDoc(appointmentsRef, toFirestorePayload(payload, { includeCreatedAt: true }));
};

const updateAppointmentNowInternal = async (profileId, appointmentId, payload) => {
  const appointmentRef = doc(db, 'users', profileId, 'appointments', appointmentId);
  await updateDoc(appointmentRef, toFirestorePayload(payload));
};

export const createAppointmentNow = async (profileId, payload) => {
  return createAppointmentNowInternal(profileId, payload);
};

export const updateAppointmentNow = async (profileId, appointmentId, payload) => {
  await updateAppointmentNowInternal(profileId, appointmentId, payload);
};

export const getQueuedAppointmentEntries = async (profileId) => {
  const queue = await readQueue();
  if (!profileId) {
    return queue;
  }
  return queue.filter((entry) => entry.profileId === profileId);
};

export const removeQueuedAppointmentEntry = async (entryId) => {
  const queue = await readQueue();
  const next = queue.filter((entry) => entry.entryId !== entryId);
  await writeQueue(next);
};

export const flushQueuedAppointmentOperations = async ({
  profileId = null,
  onProcessed,
  onError,
} = {}) => {
  if (isFlushInProgress) {
    const existingQueue = await readQueue();
    const relevantCount = profileId
      ? existingQueue.filter((entry) => entry.profileId === profileId).length
      : existingQueue.length;
    return { synced: 0, remaining: relevantCount };
  }

  isFlushInProgress = true;
  try {
    const queue = await readQueue();
    if (!queue.length) {
      return { synced: 0, remaining: 0 };
    }

    const isOnline = await getNetworkStatus();
    if (!isOnline) {
      return { synced: 0, remaining: queue.length };
    }

    const remaining = [];
    let synced = 0;

    for (const entry of queue) {
      if (profileId && entry.profileId !== profileId) {
        remaining.push(entry);
        continue;
      }

      try {
        if (entry.operation === 'create') {
          await createAppointmentNowInternal(entry.profileId, entry.payload);
        } else if (entry.operation === 'update') {
          await updateAppointmentNowInternal(
            entry.profileId,
            entry.payload.appointmentId,
            entry.payload
          );
        } else {
          console.warn('Unknown appointment queue operation', entry.operation);
          remaining.push(entry);
          continue;
        }

        synced += 1;
        onProcessed?.(entry);
      } catch (error) {
        console.warn('Failed to flush appointment queue entry', entry.entryId, error);
        remaining.push(entry);
        onError?.(entry, error);
      }
    }

    await writeQueue(remaining);

    return { synced, remaining: remaining.length };
  } finally {
    isFlushInProgress = false;
  }
};
