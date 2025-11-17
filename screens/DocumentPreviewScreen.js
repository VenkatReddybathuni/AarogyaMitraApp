import React, { useEffect, useMemo, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';
import CustomModal from '../components/CustomModal';
import { readAsStringAsync } from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';
import {
  getNetworkStatus,
  queueDocumentUpload,
  uploadDocumentNow,
} from '../services/documentUpload';

// This is the "Uploaded Document Preview" screen (Flow F, Figure 12)
// Now supports coming from Chat with fromChat parameter
const DocumentPreviewScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { effectiveProfileId } = useContext(ProfileContext);
  const { document, source = 'gallery', fromChat = false, profileId = null } = route.params ?? {};
  const scopedProfileId = profileId ?? effectiveProfileId;
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const defaultDocumentName = useMemo(() => {
    const today = new Date();
    const fallback = `Medical Document - ${format(today, 'MMM d, yyyy')}`;
    if (!document) {
      return fallback;
    }

    const fileName = document.fileName || document.filename;
    if (fileName) {
      const withoutExtension = fileName.replace(/\.[^.]+$/, '');
      return withoutExtension || fallback;
    }

    return fallback;
  }, [document]);

  const [documentName, setDocumentName] = useState(defaultDocumentName);

  useEffect(() => {
    setDocumentName(defaultDocumentName);
  }, [defaultDocumentName]);

  const filePreviewUri = useMemo(() => document?.uri ?? null, [document]);

  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const getFileExtension = () => {
    const uri = document?.uri ?? '';
    const uriMatch = uri.match(/\.([a-zA-Z0-9]+)(\?|$)/);
    if (uriMatch?.[1]) {
      return uriMatch[1].toLowerCase();
    }

    const fileName = document?.fileName || document?.filename || '';
    const nameMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    if (nameMatch?.[1]) {
      return nameMatch[1].toLowerCase();
    }

    if (document?.mimeType?.includes('pdf')) {
      return 'pdf';
    }

    return 'jpg';
  };

  const getMimeType = () => {
    if (document?.mimeType) {
      return document.mimeType;
    }
    const extension = getFileExtension();
    if (extension === 'pdf') {
      return 'application/pdf';
    }
    return 'image/jpeg';
  };

  const compressImage = async (imageUri) => {
    try {
      console.log('Compressing image...');
      const compressed = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800, height: 1000 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      console.log('Compression complete. Compressed URI:', compressed.uri);
      return compressed.uri;
    } catch (error) {
      console.warn('Image compression failed, using original:', error);
      return imageUri;
    }
  };

  const handleConfirm = async () => {
    if (isUploading) {
      return;
    }

    if (!scopedProfileId) {
      showModal(t('pleaseSignInToUploadDocs'), true);
      return;
    }

    if (!document?.uri) {
      showModal(t('documentNotAvailable'), true);
      return;
    }

    const trimmedName = documentName.trim();
    if (!trimmedName) {
      showModal(t('pleaseEnterDocumentName'), true);
      return;
    }

    try {
      setIsUploading(true);

      // Compress image before converting to base64
      const compressedUri = await compressImage(document.uri);

      // Read file as base64
      console.log('Reading file as base64:', compressedUri);
      const fileBase64 = await readAsStringAsync(compressedUri, {
        encoding: 'base64',
      });

      const extension = getFileExtension();
      const mimeType = getMimeType();

      console.log('File details:', {
        extension,
        mimeType,
        base64Size: fileBase64.length,
        base64SizeKB: (fileBase64.length / 1024).toFixed(2),
      });

      // Check if file is still too large
      if (fileBase64.length > 900000) {
        showModal(
          t('imageTooLargeAfterCompression'),
          true
        );
        setIsUploading(false);
        return;
      }

      const payload = {
        name: trimmedName,
        base64Data: fileBase64,
        mimeType,
        extension,
        fileSize: document.fileSize ?? null,
        sourceType: source,
        originalFileName: document.fileName || document.filename || null,
      };

      const isOnline = await getNetworkStatus();

      if (!isOnline) {
        await queueDocumentUpload(scopedProfileId, payload);
        console.log('Document queued for upload when online');
        showModal(t('documentUploadQueued'));
      } else {
        await uploadDocumentNow(scopedProfileId, payload);
        console.log('Document uploaded to Firestore successfully');
        showModal(t('documentUploadedSuccessfully'));
      }
    } catch (error) {
      console.error('Failed to upload document:', {
        code: error?.code,
        message: error?.message,
        customData: error?.customData,
        fullError: error,
      });
      const errorMessage =
        error?.code === 'permission-denied'
          ? t('permissionDeniedToUploadDocs')
          : error?.message?.includes('longer than')
          ? t('imageTooLargeAfterCompression2')
          : t('couldNotUploadDocument');
      showModal(errorMessage, true);
    } finally {
      setIsUploading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    if (!modalIsError) {
      // On success, check if we came from chat
      if (fromChat) {
        // Redirect back to AIChat screen (will show fresh welcome)
        navigation.navigate('AIChat');
      } else {
        // Otherwise go back to the document list
        navigation.popToTop();
      }
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
        <Text style={styles.headerTitle}>{t('preview')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.previewText}>
            {t('pleaseConfirmDocumentClear')}
          </Text>
          {filePreviewUri ? (
            <Image source={{ uri: filePreviewUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <MaterialCommunityIcons name="file-document" size={48} color="#B0B0B0" />
              <Text style={styles.previewPlaceholderText}>{t('previewNotAvailable')}</Text>
            </View>
          )}

          <View style={styles.formSection}>
            <Text style={styles.label}>{t('documentName')}</Text>
            <TextInput
              style={styles.textInput}
              value={documentName}
              onChangeText={setDocumentName}
              placeholder={t('addTitleToFindLater')}
              placeholderTextColor="#9B9B9B"
              returnKeyType="done"
              editable={!isUploading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirm Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, isUploading && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          activeOpacity={0.85}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>{t('confirmDocumentUpload')}</Text>
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
  content: {
    padding: 20,
    alignItems: 'center',
  },
  previewText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: '70%', // Take up most of the screen
    resizeMode: 'contain',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
  },
  previewPlaceholder: {
    width: '100%',
    height: 300,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  previewPlaceholderText: {
    marginTop: 12,
    color: '#999',
    fontSize: 14,
  },
  formSection: {
    width: '100%',
    marginTop: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
    fontSize: 16,
    color: '#333',
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

export default DocumentPreviewScreen;