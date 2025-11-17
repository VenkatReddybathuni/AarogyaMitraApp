import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import CustomModal from '../components/CustomModal';
import { useLanguage } from '../context/LanguageContext';

// This is the "Upload Options" screen (Flow F, Figure 12)
// Now supports coming from Chat with fromChat parameter
const DocumentUploadOptionsScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [modalVisible, setModalVisible] = useState(false);
  const fromChat = route?.params?.fromChat ?? false;

  // --- Image Picker Functions ---

  const pickFromGallery = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted' && status !== 'limited') {
      alert(t('cameraRollPermissionDenied'));
      return;
    }

    // Launch gallery
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.length) {
      navigation.navigate('DocumentPreview', {
        document: result.assets[0],
        source: 'gallery',
        fromChat,
      });
    }
  };

  const takePhoto = async () => {
    // Request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert(t('cameraPermissionDenied'));
      return;
    }

    // Launch camera
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.length) {
      navigation.navigate('DocumentPreview', {
        document: result.assets[0],
        source: 'camera',
        fromChat,
      });
    }
  };

  // --- Tutorial Modal ---
  const watchTutorial = () => {
    setModalVisible(true);
  };

  const handleBackPress = () => {
    if (fromChat) {
      // If we came from chat, go back to chat directly
      navigation.navigate('AIChat');
    } else {
      // Otherwise go back normally
      navigation.goBack();
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
          onPress={handleBackPress}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('uploadOptions')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <TouchableOpacity style={styles.optionButton} onPress={pickFromGallery}>
          <MaterialCommunityIcons
            name="image-multiple"
            size={30}
            color="#007AFF"
          />
          <Text style={styles.optionText}>{t('uploadFromGallery')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionButton} onPress={takePhoto}>
          <MaterialCommunityIcons name="camera" size={30} color="#34A853" />
          <Text style={styles.optionText}>{t('scanOrCapture')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={watchTutorial}
        >
          <MaterialCommunityIcons
            name="play-circle"
            size={30}
            color="#D93025"
          />
          <Text style={styles.optionText}>
            {t('watchVideoToUnderstand')}
          </Text>
        </TouchableOpacity>
      </View>

      <CustomModal
        isVisible={modalVisible}
        message={t('watchVideoMessage')}
        isError={false}
        onClose={() => setModalVisible(false)}
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
    padding: 20,
    justifyContent: 'flex-start',
  },
  optionButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  optionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 15,
    flex: 1, // Allow text to wrap
  },
});

export default DocumentUploadOptionsScreen;