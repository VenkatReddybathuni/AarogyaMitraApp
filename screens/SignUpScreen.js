import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CustomModal from '../components/CustomModal';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { format } from 'date-fns'; // We'll use this to format the date nicely
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import {
  PhoneAuthProvider,
  signInWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../firebaseConfig';
import { USE_STATIC_OTP, STATIC_OTP } from '../constants/otpConfig';

const normalizePhoneNumber = (raw) => {
  const cleaned = raw.replace(/\s+/g, '');
  if (!cleaned) {
    return '';
  }
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('0')) {
    return `+91${cleaned.slice(1)}`;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  return cleaned;
};

// This is the multi-step signup flow (Flow B)
const SignUpScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1); // Manages which step we are on
  const recaptchaVerifier = useRef(null);
  const [verificationId, setVerificationId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Modal state for success/error messages
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  // Date Picker state
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  // Form States
  const [language, setLanguage] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState(''); // Now a selector
  const [dob, setDob] = useState(null); // Now a date object
  const [aadhaar, setAadhaar] = useState('');
  const [conditions, setConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [disability, setDisability] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const languages = ['English', 'Hindi', 'Gujarati', 'Marathi', 'Other'];
  const genders = ['Male', 'Female', 'Other'];

  const handleMobileChange = (value) => {
    setMobile(value);
    if (phoneVerified) {
      setPhoneVerified(false);
      setVerificationId(null);
    }
  };

  const sendOtp = async (phoneNumber) => {
    if (USE_STATIC_OTP) {
      setVerificationId('STATIC');
      setOtp('');
      setPhoneVerified(false);
      showModal(
        `Demo mode: use OTP ${STATIC_OTP} to continue (no SMS will be sent).`,
        false
      );
      return true;
    }

    if (!recaptchaVerifier.current) {
      showModal('Security check is still initializing. Please wait a moment and try again.', true);
      return false;
    }
    try {
      setIsProcessing(true);
      if (auth.currentUser) {
        await signOut(auth);
      }
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber(
        phoneNumber,
        recaptchaVerifier.current
      );
      setVerificationId(id);
      setOtp('');
      setPhoneVerified(false);
      showModal(`We have sent an OTP to ${phoneNumber}.`, false);
      return true;
    } catch (error) {
      console.error('Failed to send OTP:', error);
      const message =
        error?.message?.includes('TOO_SHORT')
          ? 'The mobile number is too short. Please include the full number.'
          : 'Could not send OTP. Please check the number and try again.';
      showModal(message, true);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const verifyOtpCode = async () => {
    if (USE_STATIC_OTP) {
      if (otp === STATIC_OTP) {
        setPhoneVerified(true);
        setVerificationId(null);
        setOtp('');
        showModal('Phone number verified (demo mode).', false);
        return true;
      }
      showModal(`Invalid OTP. For this demo, please enter ${STATIC_OTP}.`, true);
      return false;
    }

    if (!verificationId) {
      showModal('Please request a new OTP before verifying.', true);
      return false;
    }
    try {
      setIsProcessing(true);
      const credential = PhoneAuthProvider.credential(verificationId, otp);
      await signInWithCredential(auth, credential);
      setPhoneVerified(true);
    setVerificationId(null);
      setOtp('');
      showModal('Phone number verified successfully.', false);
      return true;
    } catch (error) {
      console.error('OTP verification failed:', error);
      showModal('Invalid OTP. Please try again.', true);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const completeSignup = async () => {
    const normalizedPhone = normalizePhoneNumber(mobile);
    const normalizedUsername = username.trim().toLowerCase();
    const email = `${normalizedUsername}@aarogyamitra.app`;

    try {
      setIsProcessing(true);
      let currentUser = auth.currentUser;

      if (currentUser) {
        const emailCredential = EmailAuthProvider.credential(email, password);
        try {
          await linkWithCredential(currentUser, emailCredential);
        } catch (linkError) {
          if (linkError.code === 'auth/credential-already-in-use') {
            throw linkError;
          }
          if (linkError.code !== 'auth/provider-already-linked') {
            throw linkError;
          }
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        currentUser = userCredential.user;
      }

      if (currentUser) {
        await updateProfile(currentUser, {
          displayName: `${firstName} ${lastName}`.trim(),
        });

        await setDoc(doc(db, 'users', currentUser.uid), {
          language,
          phone: normalizedPhone,
          firstName,
          lastName,
          gender,
          dob: dob ? dob.toISOString() : null,
          aadhaar,
          conditions,
          allergies,
          emergencyContact,
          disability,
          username: normalizedUsername,
          createdAt: serverTimestamp(),
        });
      }

  setStep('complete');
  setModalVisible(false);
  navigation.replace('Home');
    } catch (error) {
      console.error('Signup failed:', error);
      let message = 'Something went wrong. Please try again.';
      if (
        error?.code === 'auth/email-already-in-use' ||
        error?.code === 'auth/credential-already-in-use'
      ) {
        message = 'That username is already taken. Please choose another.';
      }
      showModal(message, true);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Modal Helper Functions ---
  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    // If it was a success message, navigate to Home
    if (!modalIsError && step === 'complete') {
      navigation.replace('Home');
    }
  };

  // --- Date Picker Functions ---
  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleDateConfirm = (date) => {
    setDob(date);
    hideDatePicker();
  };

  // --- Navigation Logic ---
  const handleNext = async () => {
    if (isProcessing) {
      return;
    }

    if (step === 1) {
      if (!language) {
        showModal('Please select a language.', true);
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!mobile) {
        showModal('Please enter your mobile number.', true);
        return;
      }
      const normalizedPhone = normalizePhoneNumber(mobile);
      if (normalizedPhone.length < 10) {
        showModal('Please enter a valid mobile number.', true);
        return;
      }
      const sent = await sendOtp(normalizedPhone);
      if (sent) {
        setStep(3);
      }
      return;
    }

    if (step === 3) {
      if (!otp) {
        showModal('Please enter the OTP.', true);
        return;
      }
      const verified = await verifyOtpCode();
      if (verified) {
        setStep(4);
      }
      return;
    }

    if (
      step === 4 &&
      (!firstName || !lastName || !gender || !dob || !aadhaar)
    ) {
      showModal('Please fill in all personal details.', true);
      return;
    }

    if (step === 4) {
      setStep(5);
      return;
    }

    if (step === 5) {
      setStep(6);
      return;
    }

    if (step === 6) {
      if (!username || !password || !confirmPassword) {
        showModal('Please set your login details.', true);
        return;
      }
      if (password !== confirmPassword) {
        showModal('Passwords do not match.', true);
        return;
      }
      if (!phoneVerified) {
        showModal('Please verify your mobile number before continuing.', true);
        return;
      }
      await completeSignup();
      return;
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack(); // Go back to Login screen
    }
  };

  // --- Helper to render the correct step ---
  const renderStep = () => {
    switch (step) {
      case 1: // Select Language
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Begin your health journey...</Text>
            <Text style={styles.stepSubtitle}>Select your preferred language</Text>
            {languages.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.optionButton,
                  language === lang && styles.optionButtonSelected,
                ]}
                onPress={() => setLanguage(lang)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    language === lang && styles.optionButtonTextSelected,
                  ]}
                >
                  {lang}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 2: // Mobile Number
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Verify Your Mobile Number</Text>
            <Text style={styles.stepSubtitle}>
              We will send a one-time password (OTP) to this number.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Mobile Number"
              value={mobile}
              onChangeText={handleMobileChange}
              keyboardType="phone-pad"
            />
          </View>
        );
      // NEW Step 3: OTP Verification
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Verify Your Number</Text>
            <Text style={styles.stepSubtitle}>
              {USE_STATIC_OTP
                ? `For this demo, enter OTP ${STATIC_OTP}.`
                : `Please enter the 6-digit OTP sent to ${mobile}.`}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Verify OTP (e.g., 123456)"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
        );
      case 4: // Personal Details (Old Step 2, now 4)
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Fill Personal Details</Text>
            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={firstName}
              onChangeText={setFirstName}
              autoComplete="given-name"
              textContentType="givenName"
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
              autoComplete="family-name"
              textContentType="familyName"
            />
            {/* NEW Gender Selector */}
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderContainer}>
              {genders.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderButton,
                    gender === g && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender(g)}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      gender === g && styles.genderButtonTextSelected,
                    ]}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* NEW Date of Birth Selector */}
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity style={styles.dateInput} onPress={showDatePicker}>
              <Text style={styles.dateInputText}>
                {dob ? format(dob, 'dd / MM / yyyy') : 'Select your birthday'}
              </Text>
              <MaterialCommunityIcons name="calendar" size={24} color="#007AFF" />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="12-Digit Aadhaar Card Number"
              value={aadhaar}
              onChangeText={setAadhaar}
              keyboardType="number-pad"
            />
          </View>
        );
      case 5: // Basic Medical Info (Old Step 3, now 5)
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Enter basic medical information</Text>
            <TextInput
              style={styles.input}
              placeholder="Existing Health Conditions"
              value={conditions}
              onChangeText={setConditions}
            />
            <TextInput
              style={styles.input}
              placeholder="Any allergies"
              value={allergies}
              onChangeText={setAllergies}
            />
            <TextInput
              style={styles.input}
              placeholder="Emergency Contact (Name and Number)"
              value={emergencyContact}
              onChangeText={setEmergencyContact}
            />
            <TextInput
              style={styles.input}
              placeholder="Disability or Accessibility Needs"
              value={disability}
              onChangeText={setDisability}
            />
          </View>
        );
      case 6: // Set Login Details (Old Step 4, now 6)
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Set Login Details</Text>
            <TextInput
              style={styles.input}
              placeholder="Set Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Set Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>
        );
      default:
        return null;
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
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={firebaseConfig}
        attemptInvisibleVerification
      />

      {/* Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Form Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
      >
        {renderStep()}
      </ScrollView>

      {/* Next/Proceed Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.proceedButton,
            isProcessing && styles.proceedButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.proceedButtonText}>
              {step === 6 ? 'Complete Profile' : 'Proceed'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal for Error/Success Messages */}
      <CustomModal
        isVisible={modalVisible}
        message={modalMessage}
        isError={modalIsError}
        onClose={closeModal}
      />

      {/* Date Picker Modal */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={hideDatePicker}
        maximumDate={new Date()} // User cannot be born in the future
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
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 35, // To balance the back arrow
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 20,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0059B2',
    marginBottom: 10,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    marginLeft: 5,
  },
  genderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  genderButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  genderButtonSelected: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  genderButtonText: {
    fontSize: 16,
    color: '#333',
  },
  genderButtonTextSelected: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  dateInput: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateInputText: {
    fontSize: 16,
    color: '#333',
  },
  optionButton: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  optionButtonSelected: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  optionButtonText: {
    fontSize: 16,
    color: '#333',
  },
  optionButtonTextSelected: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  proceedButton: {
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
  proceedButtonDisabled: {
    opacity: 0.7,
  },
  proceedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default SignUpScreen;