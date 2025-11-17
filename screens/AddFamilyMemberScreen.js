import React, { useState } from 'react';
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
import { format } from 'date-fns';
import { auth, db } from '../firebaseConfig';
import { USE_STATIC_OTP, STATIC_OTP } from '../constants/otpConfig';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

const normalizePhoneNumber = (raw) => {
  const cleaned = raw.replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('0')) return `+91${cleaned.slice(1)}`;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return cleaned;
};

// This is the multi-step "Add Family Member" flow (Flow G)
// It's a simplified version of the SignUpScreen flow
const AddFamilyMemberScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('choice'); // 'choice' | 1 | 2 | 3 | 4 | 'complete'
  const [userType, setUserType] = useState(null); // 'existing' | 'new'

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  // Date Picker state
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  // Form States
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState(null);
  const [aadhaar, setAadhaar] = useState('');
  const [conditions, setConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const genders = ['Male', 'Female', 'Other'];

  // --- Modal Helper Functions ---
  const showModal = (message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    // If it was a success message, go back to the list
    if (!modalIsError && step === 'complete') {
      navigation.goBack();
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

  const linkExistingFamilyMember = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        showModal('Please sign in again to link a family member.', true);
        return;
      }

      setIsProcessing(true);
      const normalizedPhone = normalizePhoneNumber(mobile);

      const usersRef = collection(db, 'users');
      const userQuery = query(usersRef, where('phone', '==', normalizedPhone));
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        showModal('No AarogyaMitra account was found with that phone number.', true);
        return;
      }

      const linkedDoc = userSnapshot.docs[0];
      if (linkedDoc.id === currentUser.uid) {
        showModal('This phone number already belongs to your account.', true);
        return;
      }

      const linkedData = linkedDoc.data() || {};
      const linkedName = `${linkedData.firstName || ''} ${linkedData.lastName || ''}`
        .trim()
        .replace(/\s+/g, ' ');
      const fallbackName = linkedData.fullName || linkedData.name || 'Family Member';

      const familyLinksRef = collection(db, 'users', currentUser.uid, 'familyLinks');
      const existingLinkQuery = query(
        familyLinksRef,
        where('linkedUserId', '==', linkedDoc.id)
      );
      const existingLinkSnapshot = await getDocs(existingLinkQuery);
      if (!existingLinkSnapshot.empty) {
        showModal('This family member is already linked to your account.', false);
        setStep('complete');
        return;
      }

      await addDoc(familyLinksRef, {
        linkedUserId: linkedDoc.id,
        linkedUserName: linkedName || fallbackName,
        linkedUserPhone: normalizedPhone,
        status: 'verified',
        addedAt: serverTimestamp(),
        verifiedAt: serverTimestamp(),
      });

      showModal('Family member linked successfully!', false);
      setStep('complete');
    } catch (error) {
      console.error('Failed to link family member:', error);
      showModal('Failed to link family member. Please try again.', true);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Navigation Logic ---
  const handleNext = async () => {
    if (isProcessing) {
      return;
    }

    // --- Handle initial choice ---
    if (step === 'choice') {
      if (!userType) {
        showModal('Please select whether they are an existing or new user.', true);
        return;
      }
      // Move to appropriate flow
      if (userType === 'existing') {
        setStep(1); // Go to phone number step for OTP
      } else {
        // For new users, redirect to sign up
        navigation.navigate('SignUp', { isAddingFamilyMember: true });
      }
      return;
    }

    // --- Validation logic for existing user flow ---
    if (userType === 'existing') {
      if (step === 1) {
        if (!mobile) {
          showModal("Please enter the family member's mobile number.", true);
          return;
        }
        const normalizedPhone = normalizePhoneNumber(mobile);
        if (!normalizedPhone || normalizedPhone.length < 10) {
          showModal('Please enter a valid mobile number with country code.', true);
          return;
        }
        setStep(2);
        const message = USE_STATIC_OTP
          ? `Demo mode: ask the family member to provide OTP ${STATIC_OTP}.`
          : `We have sent an OTP to ${normalizedPhone} to verify their consent.`;
        showModal(message, false);
        return;
      }

      if (step === 2) {
        if (!otp) {
          showModal('Please enter the OTP for consent.', true);
          return;
        }
        if (USE_STATIC_OTP && otp !== STATIC_OTP) {
          showModal(`Invalid OTP. For this demo, please enter ${STATIC_OTP}.`, true);
          return;
        }
        await linkExistingFamilyMember();
        return;
      }
    }
  };

  const handleBack = () => {
    if (step === 'choice') {
      navigation.goBack(); // Go back to Profile list
    } else if (step === 1) {
      setStep('choice'); // Back to user type choice
    } else if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack(); // Go back to Profile list
    }
  };

  // --- Helper to render the correct step ---
  const renderStep = () => {
    switch (step) {
      case 'choice': // Choose between existing and new user
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Add Family Member</Text>
            <Text style={styles.stepSubtitle}>
              Is the family member an existing user or new to AarogyaMitra?
            </Text>
            <View style={styles.choiceContainer}>
              <TouchableOpacity
                style={[
                  styles.choiceButton,
                  userType === 'existing' && styles.choiceButtonSelected,
                ]}
                onPress={() => setUserType('existing')}
              >
                <MaterialCommunityIcons
                  name="account-check"
                  size={40}
                  color={userType === 'existing' ? '#007AFF' : '#999'}
                />
                <Text
                  style={[
                    styles.choiceButtonText,
                    userType === 'existing' && styles.choiceButtonTextSelected,
                  ]}
                >
                  Existing User
                </Text>
                <Text style={styles.choiceButtonSubtext}>
                  They already have an account
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.choiceButton,
                  userType === 'new' && styles.choiceButtonSelected,
                ]}
                onPress={() => setUserType('new')}
              >
                <MaterialCommunityIcons
                  name="account-plus"
                  size={40}
                  color={userType === 'new' ? '#007AFF' : '#999'}
                />
                <Text
                  style={[
                    styles.choiceButtonText,
                    userType === 'new' && styles.choiceButtonTextSelected,
                  ]}
                >
                  New User
                </Text>
                <Text style={styles.choiceButtonSubtext}>
                  They need to create an account
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 1: // Mobile Number (for consent)
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Verify Consent</Text>
            <Text style={styles.stepSubtitle}>
              Enter the family member's mobile no. to receive and verify an OTP.
              This verifies their consent.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter mobile no."
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
            />
          </View>
        );
      case 2: // Verify OTP
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Verify Consent</Text>
            <Text style={styles.stepSubtitle}>
              {USE_STATIC_OTP
                ? `Demo mode: Enter OTP ${STATIC_OTP} to confirm consent.`
                : `Please enter the 4-digit OTP sent to ${mobile}.`}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={USE_STATIC_OTP ? `Enter ${STATIC_OTP}` : 'Enter OTP (e.g., 1234)'}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={USE_STATIC_OTP ? STATIC_OTP.length : 4}
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

      {/* Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Family Member</Text>
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
            (isProcessing || step === 'complete') && styles.proceedButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={isProcessing || step === 'complete'}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.proceedButtonText}>
              {step === 'complete' ? 'Linked' : 'Proceed'}
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
        maximumDate={new Date()}
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
  choiceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 20,
    gap: 12,
  },
  choiceButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceButtonSelected: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  choiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  choiceButtonTextSelected: {
    color: '#007AFF',
  },
  choiceButtonSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
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

export default AddFamilyMemberScreen;