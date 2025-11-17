import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { auth, db } from '../firebaseConfig';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import BottomNavBar from '../components/BottomNavBar';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';

// This is the main "Manage Profiles" screen (Flow G)
// Loads current user + linked family members from Firebase
const ProfilesListScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { switchProfile, activeProfileId: contextActiveProfileId } = useContext(ProfileContext);
  const [user, setUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [linkedProfiles, setLinkedProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get current authenticated user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  // Load current user data and linked family members
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return () => {};
    }

    setIsLoading(true);

    // Get current user data
    const currentUserRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(
      currentUserRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setCurrentUserData({
            uid: user.uid,
            ...docSnap.data(),
          });
        } else {
          setCurrentUserData({ uid: user.uid });
        }
      },
      (error) => {
        console.error('Failed to load current user:', error);
      }
    );

    // Load linked family members
    const familyLinksRef = collection(db, 'users', user.uid, 'familyLinks');
    const linksQuery = query(familyLinksRef, where('status', '==', 'verified'));

    const unsubscribeLinks = onSnapshot(
      linksQuery,
      async (snapshot) => {
        const links = [];
        for (const docSnap of snapshot.docs) {
          links.push({
            linkId: docSnap.id,
            ...docSnap.data(),
          });
        }
        setLinkedProfiles(links);
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load family links:', error);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeLinks();
    };
  }, [user]);

  const resolveOwnProfileName = () => {
    if (currentUserData?.name && currentUserData.name.trim().length > 0) {
      return currentUserData.name.trim();
    }
    if (user?.displayName && user.displayName.trim().length > 0) {
      return user.displayName.trim();
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    if (user?.phoneNumber) {
      return user.phoneNumber;
    }
    return t('yourProfile');
  };

  const handleProfileSelect = (profileId, profileName) => {
    // Update global context
    switchProfile(profileId, profileName);
    // Go back to Home
    navigation.navigate('Home');
  };

  const renderCurrentUserProfile = () => {
    if (!currentUserData) return null;

    return (
      <TouchableOpacity
        key={currentUserData.uid}
        style={[
          styles.profileItem,
          contextActiveProfileId === currentUserData.uid && styles.profileItemActive,
        ]}
        onPress={() =>
          handleProfileSelect(currentUserData.uid, resolveOwnProfileName())
        }
      >
        <MaterialCommunityIcons
          name="account-circle"
          size={40}
          color={contextActiveProfileId === currentUserData.uid ? '#007AFF' : '#999'}
        />
        <View style={styles.profileTextContainer}>
          <Text style={styles.profileName}>{resolveOwnProfileName()}</Text>
          <Text style={styles.profileRelation}>Self</Text>
        </View>
        {contextActiveProfileId === currentUserData.uid && (
          <View style={styles.activeTag}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#4CAF50" />
          </View>
        )}
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={contextActiveProfileId === currentUserData.uid ? '#007AFF' : '#B0B0B0'}
        />
      </TouchableOpacity>
    );
  };

  const renderLinkedProfile = (profile) => (
    <TouchableOpacity
      key={profile.linkId}
      style={[
        styles.profileItem,
        contextActiveProfileId === profile.linkedUserId && styles.profileItemActive,
      ]}
      onPress={() =>
        handleProfileSelect(profile.linkedUserId, profile.linkedUserName)
      }
    >
      <MaterialCommunityIcons
        name="account-multiple"
        size={40}
        color={contextActiveProfileId === profile.linkedUserId ? '#007AFF' : '#999'}
      />
      <View style={styles.profileTextContainer}>
        <Text style={styles.profileName}>{profile.linkedUserName}</Text>
        <Text style={styles.profileRelation}>{profile.linkedUserPhone}</Text>
      </View>
      {contextActiveProfileId === profile.linkedUserId && (
        <View style={styles.activeTag}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#4CAF50" />
        </View>
      )}
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color={
          contextActiveProfileId === profile.linkedUserId ? '#007AFF' : '#B0B0B0'
        }
      />
    </TouchableOpacity>
  );

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
          onPress={() => navigation.navigate('Home')}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('familyProfiles')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading profiles…</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {/* Current User */}
          {currentUserData && (
            <>
              <Text style={styles.sectionTitle}>{resolveOwnProfileName()}</Text>
              {renderCurrentUserProfile()}
            </>
          )}

          {/* Linked Family Members */}
          {linkedProfiles.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Linked Family Members</Text>
              {linkedProfiles.map(renderLinkedProfile)}
            </>
          )}

          {linkedProfiles.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={48}
                color="#B0B0B0"
              />
              <Text style={styles.emptyTitle}>No family members linked</Text>
              <Text style={styles.emptySubtitle}>
                Add family members to access and manage their health data
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add Member Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddFamilyMember')}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#fff" />
          <Text style={styles.addButtonText}>{t('addFamilyMember')}</Text>
        </TouchableOpacity>
      </View>

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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    marginTop: 10,
    marginLeft: 5,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  profileItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  profileItemActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  profileTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  profileRelation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  activeTag: {
    marginRight: 10,
  },
  currentProfileText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
    paddingHorizontal: 5,
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
});

export default ProfilesListScreen;