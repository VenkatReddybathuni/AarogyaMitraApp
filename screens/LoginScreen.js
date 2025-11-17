import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  signInWithEmailAndPassword,
} from 'firebase/auth';
import CustomModal from '../components/CustomModal';
import { auth } from '../firebaseConfig';
import { useLanguage } from '../context/LanguageContext';

// Login Screen - Username & Password only
const LoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  const handleLogin = async () => {
    if (!username || !password) {
      showModal('Please enter your username and password.', true);
      return;
    }

    try {
      setIsProcessing(true);
      const normalizedUsername = username.trim().toLowerCase();
      const email = `${normalizedUsername}@aarogyamitra.app`;
      await signInWithEmailAndPassword(auth, email, password);
      navigation.replace('Home');
    } catch (error) {
      console.error('Login failed:', error);
      let message = 'Invalid username or password. Please try again.';
      if (error?.code === 'auth/user-not-found') {
        message = 'Account not found. Please sign up first.';
      } else if (error?.code === 'auth/wrong-password') {
        message = 'Incorrect password. Please try again.';
      } else if (error?.code === 'auth/invalid-email') {
        message = 'Invalid email format.';
      }
      showModal(message, true);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.containerWrapper}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <StatusBar style="dark" />

        {/* Back Arrow */}
        {/*<TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>*/}

        <View style={styles.content}>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>Please login to your account.</Text>

          {/* Username Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="account" size={20} color="#007AFF" />
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                editable={!isProcessing}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="lock" size={20} color="#007AFF" />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                editable={!isProcessing}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                disabled={isProcessing}
              >
                <MaterialCommunityIcons
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color="#007AFF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isProcessing && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Sign Up Link */}
          <TouchableOpacity
            style={styles.signUpButton}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.signUpButtonText}>
              New user? <Text style={styles.signUpLink}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <CustomModal
          isVisible={modalVisible}
          message={modalMessage}
          isError={modalIsError}
          onClose={closeModal}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  containerWrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 5,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0059B2',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  input: {
    flex: 1,
    fontSize: 14,
    marginLeft: 10,
    color: '#333',
  },
  loginButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#0059B2',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signUpButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  signUpButtonText: {
    fontSize: 14,
    color: '#666',
  },
  signUpLink: {
    color: '#0059B2',
    fontWeight: '600',
  },
});

export default LoginScreen;