import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import BottomNavBar from '../components/BottomNavBar';
import { useLanguage } from '../context/LanguageContext';

// --- Gemini API Configuration ---
// Per the Task 3 PDF, we need to integrate an AI API.
const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=';
const API_KEY = Constants.expoConfig?.extra?.geminiApiKey ?? '';

// System prompt based on your Task 2 PDF (Flow C: AI Symptom Checker)
const SYSTEM_PROMPT = `You are "AarogyaMitra," a friendly and cautious AI symptom checker for a rural telehealth app. Your goal is to gather information safely.
- NEVER provide a diagnosis.
- Ask clarifying questions one at a time (e.g., "When did it start?", "Do you have a fever?").
- Keep your language simple and easy to understand (low-literacy friendly).
- When symptoms sound minor, suggest gentle self-care routines the user can do at home.
- When symptoms sound serious or unclear, firmly advise the user to visit or call a doctor/clinic immediately. Do **not** ask for their permission—simply explain why professional care is needed.
- Always prioritize advising medical attention if you are unsure.
- Be empathetic, concise, and reassuring.
`;
// ----------------------------------

const SymptomCheckerScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const scrollViewRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: 'Hi, I am AarogyaMitra. How can I help you today? Please tell me about your symptoms.',
      sender: 'ai',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);

  // Update initial message with translation
  React.useEffect(() => {
    setMessages([
      {
        id: '1',
        text: t('aarogyaMitraGreeting'),
        sender: 'ai',
      },
    ]);
  }, [t]);

  const appendImageAsset = (asset) => {
    if (!asset?.uri || !asset?.base64) {
      Alert.alert(t('imageError'), t('unableToReadImage'));
      return;
    }

    setSelectedImages((prev) => [
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
        Alert.alert(t('permissionNeeded'), t('allowPhotoAccess'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
        allowsMultipleSelection: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      appendImageAsset(result.assets[0]);
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert(t('imageError'), t('couldNotPickImage'));
    }
  };

  const captureImageWithCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('permissionNeeded'), t('allowCameraAccess'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      appendImageAsset(result.assets[0]);
    } catch (error) {
      console.error('Camera capture failed:', error);
      Alert.alert(t('cameraError'), t('couldNotCaptureImage'));
    }
  };

  const handleAttachPress = () => {
    const options = [t('chooseFromGallery'), t('takeAPhoto'), t('cancel')];
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            pickImageFromLibrary();
          } else if (buttonIndex === 1) {
            captureImageWithCamera();
          }
        }
      );
    } else {
      Alert.alert(t('attachImage'), t('chooseAnOption'), [
        { text: t('chooseFromGallery'), onPress: pickImageFromLibrary },
        { text: t('takeAPhoto'), onPress: captureImageWithCamera },
        { text: t('cancel'), style: 'cancel' },
      ]);
    }
  };

  const handleRemoveImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if ((trimmedInput === '' && selectedImages.length === 0) || isLoading) {
      return;
    }

    if (!API_KEY) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: 'Gemini API key is not configured. Please add it in app.json extra.geminiApiKey.',
          sender: 'ai',
        },
      ]);
      return;
    }

    const attachments = selectedImages.map((image) => ({
      uri: image.uri,
      base64: image.base64,
      mimeType: image.mimeType,
    }));

    const fallbackText = trimmedInput || (attachments.length ? 'Please review the attached image.' : '');

    const userMessage = {
      id: Date.now().toString(),
      text: fallbackText,
      sender: 'user',
      images: attachments,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSelectedImages([]);
    setIsLoading(true);

    // Construct the API payload
    const conversationHistory = [...messages, userMessage].map((message) => {
      const parts = [];

      if (message.text) {
        parts.push({ text: message.text });
      }

      if (message.images?.length) {
        message.images.forEach((image) => {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            },
          });
        });
      }

      return {
        role: message.sender === 'user' ? 'user' : 'model',
        parts,
      };
    });

    const payload = {
      contents: conversationHistory,
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      // Note: We are not using grounding for a symptom checker
      // to avoid providing external medical advice.
    };

    try {
      // Exponential backoff for retries
      let response;
      for (let i = 0; i < 3; i++) {
        response = await fetch(`${API_URL}${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) break; // Success
        if (response.status === 429 || response.status >= 500) {
          // Retry on rate limit or server error
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
        } else {
          break; // Don't retry on other errors (e.g., 400)
        }
      }

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const result = await response.json();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (aiText) {
        const aiMessage = {
          id: (Date.now() + 1).toString(),
          text: aiText,
          sender: 'ai',
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        throw new Error('No content in AI response.');
      }
    } catch (error) {
      console.error('Gemini API call failed:', error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I am having trouble connecting. Please try again in a moment.',
        sender: 'ai',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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
        <Text style={styles.headerTitle}>{t('aiSymptomChecker')}</Text>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => navigation.navigate('Help')}
        >
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={30}
            color="#000"
          />
        </TouchableOpacity>
      </View>

      {/* Chat Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContent}
          ref={scrollViewRef}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.sender === 'user'
                  ? styles.userMessage
                  : styles.aiMessage,
              ]}
            >
              {!!msg.text && (
                <Text
                  style={
                    msg.sender === 'user'
                      ? styles.userMessageText
                      : styles.aiMessageText
                  }
                >
                  {msg.text}
                </Text>
              )}
              {msg.images?.length ? (
                <View style={styles.messageImageRow}>
                  {msg.images.map((image, idx) => (
                    <Image
                      key={`${msg.id}-attachment-${idx}`}
                      source={{ uri: image.uri }}
                      style={styles.messageImage}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {isLoading && (
            <View style={[styles.messageBubble, styles.aiMessage]}>
              <ActivityIndicator size="small" color="#0059B2" />
            </View>
          )}
        </ScrollView>

        {selectedImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewRow}
            style={styles.previewScroll}
          >
            {selectedImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.previewItem}>
                <Image source={{ uri: image.uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.previewRemove}
                  onPress={() => handleRemoveImage(index)}
                >
                  <MaterialCommunityIcons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[styles.attachButton, isLoading && styles.attachButtonDisabled]}
            onPress={handleAttachPress}
            disabled={isLoading}
          >
            <MaterialCommunityIcons name="image-plus" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={t('typeSymptoms')}
            placeholderTextColor="#888"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={isLoading}
          >
            <MaterialCommunityIcons name="send" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    padding: 10,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    maxWidth: '80%',
  },
  userMessage: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
  },
  aiMessage: {
    backgroundColor: '#E5E5EA',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
  },
  userMessageText: {
    color: '#fff',
    fontSize: 16,
  },
  aiMessageText: {
    color: '#000',
    fontSize: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#E8F1FF',
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  previewScroll: {
    maxHeight: 90,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  previewRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  previewItem: {
    marginRight: 12,
    position: 'relative',
  },
  previewImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
  },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    padding: 3,
  },
  messageImageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  messageImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
});

export default SymptomCheckerScreen;