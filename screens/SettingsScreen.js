import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { auth, db } from '../firebaseConfig';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import CustomModal from '../components/CustomModal';
import BottomNavBar from '../components/BottomNavBar';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';

// Settings screen for editing own profile and logout
const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user: authUser, effectiveProfileId } = useContext(ProfileContext);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalIsError, setModalIsError] = useState(false);

  const showModal = useCallback((message, isError = false) => {
    setModalMessage(message);
    setModalIsError(isError);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => setModalVisible(false), []);

  // Load user data on mount
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            setFirstName(data.firstName || '');
            setLastName(data.lastName || '');
            setEmail(currentUser.email || '');
            setPhone(data.phone || '');
          }
        } catch (error) {
          console.error('Failed to load user data:', error);
          showModal('Failed to load profile', true);
        }
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, [showModal]);

  const handleSaveChanges = async () => {
    if (!user || !firstName.trim()) {
      showModal('Please enter at least a first name', true);
      return;
    }

    try {
      setIsSaving(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        updatedAt: new Date(),
      });

      setUserData({
        ...userData,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });

      setIsEditing(false);
      showModal('Profile updated successfully');
    } catch (error) {
      console.error('Failed to save profile:', error);
      showModal('Failed to update profile', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setFirstName(userData.firstName || '');
    setLastName(userData.lastName || '');
    setPhone(userData.phone || '');
    setIsEditing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Log Out',
          onPress: async () => {
            try {
              // Sign out from Firebase
              await signOut(auth);
              // Navigate to Welcome - it will detect no auth and show login
              navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              });
            } catch (error) {
              console.error('Failed to log out:', error);
              showModal('Failed to log out', true);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // Check if viewing a linked profile instead of own profile
  const isOwnProfile = user && effectiveProfileId === user.uid;

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
        <Text style={styles.headerTitle}>{t('settings') || 'Settings'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {!isOwnProfile ? (
        <View style={styles.linkedProfileMessage}>
          <MaterialCommunityIcons name="information-outline" size={40} color="#FF9800" />
          <Text style={styles.linkedProfileMessageText}>
            Settings are only available for your own account.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.backButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Profile Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Information</Text>

            {!isEditing ? (
              <>
                {/* Display Mode */}
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>
                  {firstName} {lastName}
                </Text>
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{email}</Text>
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{phone || 'Not provided'}</Text>
              </View>

              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}
              >
                <MaterialCommunityIcons name="pencil" size={18} color="#007AFF" />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Edit Mode */}
              <Text style={styles.editLabel}>First Name</Text>
              <TextInput
                style={styles.textInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First Name"
                placeholderTextColor="#9B9B9B"
                editable={!isSaving}
              />

              <Text style={styles.editLabel}>Last Name</Text>
              <TextInput
                style={styles.textInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last Name"
                placeholderTextColor="#9B9B9B"
                editable={!isSaving}
              />

              <Text style={styles.editLabel}>Phone</Text>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone Number"
                placeholderTextColor="#9B9B9B"
                keyboardType="phone-pad"
                editable={!isSaving}
              />

              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                  disabled={isSaving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.saveButton, isSaving && styles.buttonDisabled]}
                  onPress={handleSaveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={20} color="#D32F2F" />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      )}

      <BottomNavBar navigation={navigation} />

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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
  },
  headerSpacer: {
    width: 30,
  },
  linkedProfileMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  linkedProfileMessageText: {
    fontSize: 16,
    color: '#FF9800',
    fontWeight: '500',
    marginTop: 15,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 25,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  infoItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  editButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  editLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  logoutButtonText: {
    color: '#D32F2F',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default SettingsScreen;
