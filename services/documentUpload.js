import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const QUEUE_STORAGE_KEY = 'document_upload_queue_v1';

const readQueue = async () => {
	try {
		const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.warn('Failed to read document upload queue', error);
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
		console.warn('Failed to persist document upload queue', error);
	}
};

export const getNetworkStatus = async () => {
	try {
		const state = await NetInfo.fetch();
		return Boolean(state.isConnected && (state.isInternetReachable ?? true));
	} catch (error) {
		console.warn('Failed to determine network status for document uploads', error);
		return false;
	}
};

const buildQueueEntry = (profileId, payload) => {
	const now = Date.now();
	return {
		id: payload.id || `doc-${now}-${Math.random().toString(36).slice(2, 8)}`,
		profileId,
		queuedAt: now,
		name: payload.name,
		base64Data: payload.base64Data,
		mimeType: payload.mimeType,
		extension: payload.extension,
		fileSize: payload.fileSize ?? null,
		sourceType: payload.sourceType ?? 'unknown',
		originalFileName: payload.originalFileName ?? null,
	};
};

const uploadDocumentToFirestore = async (profileId, payload) => {
	const documentsRef = collection(db, 'users', profileId, 'documents');
	await addDoc(documentsRef, {
		name: payload.name,
		base64Data: payload.base64Data,
		mimeType: payload.mimeType,
		extension: payload.extension,
		fileSize: payload.fileSize ?? null,
		sourceType: payload.sourceType ?? 'unknown',
		originalFileName: payload.originalFileName ?? null,
		uploadedAt: serverTimestamp(),
	});
};

export const uploadDocumentNow = async (profileId, payload) => {
	await uploadDocumentToFirestore(profileId, payload);
};

export const queueDocumentUpload = async (profileId, payload) => {
	const entry = buildQueueEntry(profileId, payload);
	const queue = await readQueue();
	queue.push(entry);
	await writeQueue(queue);
	return entry;
};

export const getQueuedDocumentUploads = async (profileId) => {
	const queue = await readQueue();
	if (!profileId) {
		return queue;
	}
	return queue.filter((entry) => entry.profileId === profileId);
};

export const removeQueuedDocumentUpload = async (id) => {
	const queue = await readQueue();
	const next = queue.filter((entry) => entry.id !== id);
	await writeQueue(next);
};

export const flushQueuedDocumentUploads = async ({
	profileId = null,
	onUploaded,
	onError,
} = {}) => {
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
			await uploadDocumentToFirestore(entry.profileId, entry);
			synced += 1;
			if (onUploaded) {
				onUploaded(entry);
			}
		} catch (error) {
			console.warn('Failed to flush queued document upload', entry.id, error);
			remaining.push(entry);
			if (onError) {
				onError(entry, error);
			}
		}
	}

	await writeQueue(remaining);

	return { synced, remaining: remaining.length };
};
