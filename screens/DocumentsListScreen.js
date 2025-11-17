import React, { useCallback, useEffect, useMemo, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
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
import {
  flushQueuedDocumentUploads,
  getQueuedDocumentUploads,
  getNetworkStatus,
} from '../services/documentUpload';

// This is the main "Medical Documents" screen (Flow F)
const DocumentsListScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, effectiveProfileId } = useContext(ProfileContext);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [queuedDocuments, setQueuedDocuments] = useState([]);

  const showModal = useCallback((message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => setModalVisible(false), []);

  const formatUploadedDate = useCallback((date) => {
    if (!date) {
      return t('dateUnavailable');
    }
    try {
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return t('dateUnavailable');
    }
  }, [t]);

  const refreshQueuedDocuments = useCallback(async () => {
    if (!effectiveProfileId) {
      setQueuedDocuments([]);
      return;
    }

    const queued = await getQueuedDocumentUploads(effectiveProfileId);
    const normalized = queued
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        base64Data: entry.base64Data,
        mimeType: entry.mimeType,
        extension: entry.extension,
        fileSize: entry.fileSize,
        sourceType: entry.sourceType,
        originalFileName: entry.originalFileName,
        queuedAt: entry.queuedAt,
        uploadedAt: entry.queuedAt ? new Date(entry.queuedAt) : null,
        queued: true,
      }))
      .sort((a, b) => (b.queuedAt || 0) - (a.queuedAt || 0));

    setQueuedDocuments(normalized);
  }, [effectiveProfileId]);

  useEffect(() => {
    if (!effectiveProfileId) {
      setDocuments([]);
      setIsLoading(false);
      return () => {};
    }

    setIsLoading(true);

    const documentsRef = collection(db, 'users', effectiveProfileId, 'documents');
    const q = query(documentsRef, orderBy('uploadedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextDocuments = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            uploadedAt: data.uploadedAt?.toDate?.() ?? null,
          };
        });
        setDocuments(nextDocuments);
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load documents:', error);
        setDocuments([]);
        setIsLoading(false);
        showModal(t('unableToLoadDocuments'), true);
      }
    );

    return unsubscribe;
  }, [showModal, effectiveProfileId, t]);

  useEffect(() => {
    if (!effectiveProfileId) {
      setQueuedDocuments([]);
      return undefined;
    }

    let isMounted = true;

    const attemptFlush = async () => {
      try {
        const isOnline = await getNetworkStatus();
        if (!isOnline) {
          return;
        }

        const result = await flushQueuedDocumentUploads({ profileId: effectiveProfileId });
        if (isMounted && result.synced > 0) {
          await refreshQueuedDocuments();
        }
      } catch (error) {
        console.warn('Failed to flush queued documents on mount', error);
      }
    };

    attemptFlush();

    return () => {
      isMounted = false;
    };
  }, [effectiveProfileId, refreshQueuedDocuments]);

  useFocusEffect(
    useCallback(() => {
      refreshQueuedDocuments();
    }, [refreshQueuedDocuments])
  );

  const handleDocumentPress = useCallback(
    (item) => {
      // For images, open in preview modal
      if (item.mimeType?.includes('image')) {
        setPreviewDocument(item);
        setPreviewModalVisible(true);
      } else if (item.mimeType?.includes('pdf')) {
        // PDFs would need a PDF viewer library; for now show a message
        showModal(t('pdfViewerNotImplemented'), false);
      } else {
        showModal(t('documentFormatNotSupported'), false);
      }
    },
    [showModal, t]
  );

  const renderListItem = useCallback(
    (item) => {
      const metaText = item.queued
        ? t('documentPendingSync')
        : formatUploadedDate(item.uploadedAt);

      return (
        <TouchableOpacity
          key={item.id}
          style={styles.documentItem}
          onPress={() => handleDocumentPress(item)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={item.mimeType?.includes('pdf') ? 'file-pdf-box' : 'file-image'}
            size={30}
            color={item.queued ? '#9AA0A6' : item.mimeType?.includes('pdf') ? '#D93025' : '#1E8E3E'}
          />
          <View style={styles.documentTextContainer}>
            <View style={styles.documentTitleRow}>
              <Text style={styles.documentName}>{item.name || t('untitledDocument')}</Text>
              {item.queued ? (
                <View style={styles.queuedBadge}>
                  <Text style={styles.queuedBadgeText}>{t('queuedLabel')}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[styles.documentMeta, item.queued && styles.documentMetaQueued]}
            >
              {metaText}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={item.queued ? 'cloud-upload-outline' : 'open-in-new'}
            size={20}
            color={item.queued ? '#9AA0A6' : '#007AFF'}
          />
        </TouchableOpacity>
      );
    },
    [formatUploadedDate, handleDocumentPress, t]
  );

  const combinedDocuments = useMemo(() => {
    return [...queuedDocuments, ...documents];
  }, [queuedDocuments, documents]);

  const hasDocuments = useMemo(() => combinedDocuments.length > 0, [combinedDocuments]);

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
        <Text style={styles.headerTitle}>{t('medicalDocuments')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : hasDocuments ? (
          combinedDocuments.map(renderListItem)
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-document-outline" size={48} color="#B0B0B0" />
            <Text style={styles.emptyTitle}>{t('noDocumentsYet')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('uploadPrescriptionsLabReports')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Upload Document Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('DocumentUploadOptions', {
            profileId: effectiveProfileId,
          })}
        >
          <MaterialCommunityIcons name="upload" size={24} color="#fff" />
          <Text style={styles.addButtonText}>{t('uploadDocument')}</Text>
        </TouchableOpacity>
      </View>

      <CustomModal
        isVisible={modalVisible}
        message={modalMessage}
        isError={modalIsError}
        onClose={closeModal}
      />

      {/* Image Preview Modal */}
      <Modal
        visible={previewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalHeader}>
            <TouchableOpacity
              style={styles.previewModalCloseButton}
              onPress={() => setPreviewModalVisible(false)}
            >
              <MaterialCommunityIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.previewModalTitle}>{previewDocument?.name}</Text>
            <View style={styles.previewModalSpacer} />
          </View>
          {previewDocument?.base64Data ? (
            <Image
              source={{ uri: `data:${previewDocument.mimeType};base64,${previewDocument.base64Data}` }}
              style={styles.previewModalImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.previewModalPlaceholder}>
              <MaterialCommunityIcons name="file-document" size={48} color="#B0B0B0" />
              <Text style={styles.previewModalPlaceholderText}>{t('previewNotAvailable')}</Text>
            </View>
          )}
        </View>
      </Modal>

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
  documentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    padding: 15,
  },
  documentMetaQueued: {
    color: '#9AA0A6',
    fontStyle: 'italic',
  },
  queuedBadge: {
    borderRadius: 6,
    backgroundColor: '#F1F3F4',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  queuedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5F6368',
  },
  loadingState: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentItem: {
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
  documentTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  documentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  documentMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    paddingTop: 50,
    backgroundColor: '#1a1a1a',
    zIndex: 10,
  },
  previewModalCloseButton: {
    padding: 5,
  },
  previewModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginLeft: 15,
    textAlign: 'center',
  },
  previewModalSpacer: {
    width: 35,
  },
  previewModalImage: {
    flex: 1,
    width: '100%',
  },
  previewModalPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewModalPlaceholderText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
});

export default DocumentsListScreen;