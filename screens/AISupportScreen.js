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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';

// --- Gemini API Configuration ---
const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=';
const API_KEY = Constants.expoConfig?.extra?.geminiApiKey ?? '';

// NEW System prompt for AI Support (Flow I, Figure 17)
const SYSTEM_PROMPT = `You are "Aarogya," a friendly and helpful AI Support assistant for the AarogyaMitra telehealth app. Your goal is to help users with technical problems or questions about using the app.
- DO NOT answer medical questions. If asked, politely redirect them to the "Symptom Checker" feature or their doctor.
- Answer questions about app features (e.g., "How do I book an appointment?", "My video call isn't working").
- Provide simple, stepped instructions that are easy to follow.
- If you cannot solve the problem, offer to connect the user to a human customer support agent.
- Keep your language simple and empathetic.
`;
// ----------------------------------

// This component is a clone of SymptomCheckerScreen, but for AI Support
const AISupportScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: 'Hi, I am Aarogya, your AI support assistant. How can I help you with the app today?',
      sender: 'ai',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return;

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

    const userMessage = { id: Date.now().toString(), text: input, sender: 'user' };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Construct the API payload
    const conversationHistory = [...messages, userMessage].map((message) => ({
      role: message.sender === 'user' ? 'user' : 'model',
      parts: [{ text: message.text }],
    }));

    const payload = {
      contents: conversationHistory,
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
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

        if (response.ok) break;
        if (response.status === 429 || response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
        } else {
          break;
        }
      }

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const result = await response.json();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;

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
        <Text style={styles.headerTitle}>AI Support</Text>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() =>
            alert('This would connect to a human support agent.')
          }
        >
          <MaterialCommunityIcons name="account-tie" size={30} color="#000" />
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
              <Text
                style={
                  msg.sender === 'user'
                    ? styles.userMessageText
                    : styles.aiMessageText
                }
              >
                {msg.text}
              </Text>
            </View>
          ))}
          {isLoading && (
            <View style={[styles.messageBubble, styles.aiMessage]}>
              <ActivityIndicator size="small" color="#0059B2" />
            </View>
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about the app..."
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
    </View>
  );
};

// --- Styles (Identical to SymptomCheckerScreen) ---
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
});

export default AISupportScreen;