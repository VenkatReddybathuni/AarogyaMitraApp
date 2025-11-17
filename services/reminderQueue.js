import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const QUEUE_STORAGE_KEY = 'reminder_queue_v1';
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
    console.warn('Failed to read reminder queue', error);
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
    console.warn('Failed to persist reminder queue', error);
  }
};

export const getNetworkStatus = async () => {
  try {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected && (state.isInternetReachable ?? true));
  } catch (error) {
    console.warn('Failed to determine network status for reminders', error);
    return false;
  }
};

const buildEntry = (profileId, operation, payload) => ({
  entryId: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  profileId,
  operation,
  queuedAt: Date.now(),
  payload,
});

const toFirestorePayload = (payload, { includeCreatedAt } = { includeCreatedAt: false }) => {
  const scheduledAt = payload.scheduledAtISO ? new Date(payload.scheduledAtISO) : null;

  const base = {
    type: payload.type,
    scheduleType: payload.scheduleType ?? null,
    medicineName: payload.type === 'Medicine' ? payload.medicineName ?? null : null,
    dose: payload.type === 'Medicine' ? payload.dose ?? null : null,
    doctorName: payload.type === 'Appointment' ? payload.doctorName ?? null : null,
    notes: payload.notes ?? '',
    timeOfDay: payload.type === 'Medicine' ? payload.timeOfDay ?? null : null,
    scheduledAt: scheduledAt ? Timestamp.fromDate(scheduledAt) : null,
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

export const queueReminderCreate = async (profileId, payload) => {
  return appendToQueue(buildEntry(profileId, 'create', payload));
};

export const queueReminderUpdate = async (profileId, reminderId, payload) => {
  return appendToQueue(
    buildEntry(profileId, 'update', {
      reminderId,
      ...payload,
    })
  );
};

export const queueReminderDelete = async (profileId, reminderId) => {
  return appendToQueue(
    buildEntry(profileId, 'delete', {
      reminderId,
    })
  );
};

const createReminderNowInternal = async (profileId, payload) => {
  const remindersRef = collection(db, 'users', profileId, 'reminders');
  await addDoc(remindersRef, toFirestorePayload(payload, { includeCreatedAt: true }));
};

const updateReminderNowInternal = async (profileId, reminderId, payload) => {
  const reminderRef = doc(db, 'users', profileId, 'reminders', reminderId);
  await updateDoc(reminderRef, toFirestorePayload(payload));
};

const deleteReminderNowInternal = async (profileId, reminderId) => {
  const reminderRef = doc(db, 'users', profileId, 'reminders', reminderId);
  await deleteDoc(reminderRef);
};

export const createReminderNow = async (profileId, payload) => {
  await createReminderNowInternal(profileId, payload);
};

export const updateReminderNow = async (profileId, reminderId, payload) => {
  await updateReminderNowInternal(profileId, reminderId, payload);
};

export const deleteReminderNow = async (profileId, reminderId) => {
  await deleteReminderNowInternal(profileId, reminderId);
};

export const getQueuedReminderEntries = async (profileId) => {
  const queue = await readQueue();
  if (!profileId) {
    return queue;
  }
  return queue.filter((entry) => entry.profileId === profileId);
};

export const removeQueuedReminderEntry = async (entryId) => {
  const queue = await readQueue();
  const next = queue.filter((entry) => entry.entryId !== entryId);
  await writeQueue(next);
};

export const flushQueuedReminderOperations = async ({
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

    let synced = 0;
    const remaining = [];

    for (const entry of queue) {
      if (profileId && entry.profileId !== profileId) {
        remaining.push(entry);
        continue;
      }

      try {
        switch (entry.operation) {
          case 'create':
            await createReminderNowInternal(entry.profileId, entry.payload);
            break;
          case 'update':
            await updateReminderNowInternal(entry.profileId, entry.payload.reminderId, entry.payload);
            break;
          case 'delete':
            await deleteReminderNowInternal(entry.profileId, entry.payload.reminderId);
            break;
          default:
            console.warn('Unknown reminder queue operation', entry.operation);
            remaining.push(entry);
            continue;
        }

        synced += 1;
        onProcessed?.(entry);
      } catch (error) {
        console.warn('Failed to flush reminder queue entry', entry.entryId, error);
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
