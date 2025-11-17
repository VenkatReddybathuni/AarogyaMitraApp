import React, { useState, useMemo, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MaterialCommunityIcons,
  MaterialIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import LanguageSelector from '../components/LanguageSelector';
import BottomNavBar from '../components/BottomNavBar';
import { useLanguage } from '../context/LanguageContext';
import { ProfileContext } from '../context/ProfileContext';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

// --- Card Data Base ---
// Uses translation keys to be populated dynamically
const cardsDataBase = [
  {
    id: 'symptoms',
    titleKey: 'symptoms',
    subtitleKey: 'startChat',
    icon: 'microphone-outline',
    iconType: 'MaterialCommunityIcons',
    navigateTo: 'SymptomChecker',
  },
  {
    id: 'appointments',
    titleKey: 'appointments',
    subtitleKey: 'upcomingPast',
    icon: 'calendar',
    iconType: 'MaterialCommunityIcons',
    navigateTo: 'Appointments',
  },
  {
    id: 'reminders',
    titleKey: 'reminders',
    subtitleKey: 'medicinesFollowUp',
    icon: 'bell-outline',
    iconType: 'MaterialCommunityIcons',
    navigateTo: 'Reminders',
  },
  {
    id: 'medical_docs',
    titleKey: 'medicalDocs',
    subtitleKey: 'uploadView',
    icon: 'file-document-outline',
    iconType: 'MaterialCommunityIcons',
    navigateTo: 'Documents',
  },
  {
    id: 'family_profiles',
    titleKey: 'familyProfiles',
    subtitleKey: 'manageSwitchFamily',
    icon: 'account-group-outline',
    iconType: 'MaterialCommunityIcons',
    navigateTo: 'FamilyProfiles',
  },
  {
    id: 'record_vitals',
    titleKey: 'recordVitals',
    subtitleKey: 'recordBPSugarSpO2',
    icon: 'heart-outline',
    iconType: 'MaterialCommunityIcons',
    navigateTo: 'Vitals',
  },
];

// --- Custom Icon Component (Same as your file) ---
const CustomIcon = ({ name, type, size, color }) => {
  switch (type) {
    case 'MaterialCommunityIcons':
      return <MaterialCommunityIcons name={name} size={size} color={color} />;
    case 'MaterialIcons':
      return <MaterialIcons name={name} size={size} color={color} />;
    case 'FontAwesome5':
      return <FontAwesome5 name={name} size={size} color={color} />;
    default:
      return null;
  }
};

// --- Main Home Screen Component ---
// It now receives the 'navigation' prop from React Navigation
const HomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [langModalVisible, setLangModalVisible] = useState(false);
  const { t } = useLanguage();
  const { activeProfileId, activeProfileName, user, isOwnProfile } =
    useContext(ProfileContext);
  const [displayName, setDisplayName] = useState('');

  // Load the active profile name with robust fallbacks
  useEffect(() => {
    const loadProfileName = async () => {
      if (!activeProfileId) return;

      const fallbackOwnName = () =>
        (activeProfileName && activeProfileName.trim()) ||
        user?.displayName?.trim() ||
        user?.email?.split('@')[0] ||
        user?.phoneNumber ||
        t('yourProfile');

      const fallbackLinkedName = () =>
        (activeProfileName && activeProfileName.trim()) || 'Profile';

      try {
        const userRef = doc(db, 'users', activeProfileId);
        const userSnap = await getDoc(userRef);

        let resolvedName = null;
        if (userSnap.exists()) {
          const fetchedName = userSnap.data().name;
          if (typeof fetchedName === 'string' && fetchedName.trim().length > 0) {
            resolvedName = fetchedName.trim();
          }
        }

        if (!resolvedName) {
          resolvedName =
            activeProfileId === user?.uid
              ? fallbackOwnName()
              : fallbackLinkedName();
        }

        setDisplayName(resolvedName);
      } catch (error) {
        console.error('Failed to load profile name:', error);
        setDisplayName(
          activeProfileId === user?.uid
            ? fallbackOwnName()
            : fallbackLinkedName()
        );
      }
    };

    loadProfileName();
  }, [activeProfileId, activeProfileName, user, t]);

  // Build cardsData with translations
  const cardsData = useMemo(() => {
    return cardsDataBase.map((card) => ({
      ...card,
      title: t(card.titleKey),
      subtitle: t(card.subtitleKey),
    }));
  }, [t]);

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
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => setLangModalVisible(true)}
          >
            <MaterialCommunityIcons
              name="translate"
              size={28}
              color="#0066CC"
            />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => navigation.navigate('Emergency')}
        >
          <MaterialCommunityIcons
            name="information-outline"
            size={30}
            color="red"
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* AI Chat Hero */}
        <TouchableOpacity
          style={styles.aiHeroCard}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('AIChat')}
        >
          <View style={styles.aiHeroHeaderRow}>
            <View>
              <Text style={styles.aiHeroTitle}>{t('aiChat')}</Text>
              <Text style={styles.aiHeroSubtitle}>
                {t('aiChat')} • {t('aiHeroSubtitle')}
              </Text>
            </View>
            <View style={styles.aiHeroIconBubble}>
              <MaterialCommunityIcons name="robot" size={32} color="#fff" />
            </View>
          </View>

          <View style={styles.aiHeroChipsRow}>
            <View style={styles.aiHeroChip}>
              <Text style={styles.aiHeroChipText}>{t('aiHeroDescribeSymptoms')}</Text>
            </View>
            <View style={styles.aiHeroChip}>
              <Text style={styles.aiHeroChipText}>{t('aiHeroBookDoctors')}</Text>
            </View>
            <View style={styles.aiHeroChip}>
              <Text style={styles.aiHeroChipText}>{t('aiHeroSetReminders')}</Text>
            </View>
          </View>

          <View style={styles.aiHeroCTA}>
            <Text style={styles.aiHeroCTAText}>{t('aiHeroChatNow')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Cards Grid */}
        <View style={styles.cardsGrid}>
          {cardsData.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={[
                styles.card,
                { backgroundColor: card.backgroundColor || '#fff' },
                card.id === 'family_profiles' &&
                  !isOwnProfile &&
                  styles.cardActive,
              ]}
              // This is the magic! It navigates to the screen specified in cardData
              onPress={() =>
                card.navigateTo && navigation.navigate(card.navigateTo)
              }
            >
              {/* --- MODIFICATION START --- */}
              {/* This now uses the correct logic (displayName) with the correct styles (activeTagContainer) */}
              {/* This will show the green "Active: " tag ONLY on the family card, just like your image */}
              {card.id === 'family_profiles' && displayName !== '' && (
                <View style={styles.activeTagContainer}>
                  <Text style={styles.activeTagText}>
                    {t('active')}: {displayName}
                  </Text>
                </View>
              )}
              {/* --- MODIFICATION END --- */}

              <Text
                style={[styles.cardTitle, { color: card.textColor || '#000' }]}
              >
                {card.title}
              </Text>
              <Text
                style={[
                  styles.cardSubtitle,
                  { color: card.textColor || '#666' },
                ]}
              >
                {card.subtitle}
              </Text>

              {/* I removed the other 'activeProfileInfo' block from here,
                as its logic was moved to the 'activeTagContainer' above.
              */}

              <CustomIcon
                name={card.icon}
                type={card.iconType}
                size={50}
                color={card.textColor || '#444'}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavBar navigation={navigation} />

      {/* Language Selector Modal */}
      <LanguageSelector
        isVisible={langModalVisible}
        onClose={() => setLangModalVisible(false)}
      />
    </View>
  );
};

// --- Stylesheet (Same as your file) ---
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSpacer: {
    width: 30,
  },
  headerIcon: {
    padding: 5,
  },
  scrollViewContent: {
    padding: 10,
  },
  aiHeroCard: {
    backgroundColor: '#0A84FF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 5,
  },
  aiHeroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  aiHeroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  aiHeroSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 6,
    maxWidth: Platform.OS === 'web' ? '70%' : '90%',
  },
  aiHeroIconBubble: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 12,
    borderRadius: 16,
  },
  aiHeroChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 16,
  },
  aiHeroChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  aiHeroChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiHeroCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  aiHeroCTAText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginRight: 6,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    minHeight: 180,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardActive: {
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  // This style block was for the *internal* text, we don't need it for the tag
  activeProfileInfo: {
    width: '100%',
    backgroundColor: '#F4F4F4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  activeProfileInfoFamily: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  activeProfileLabel: {
    fontSize: 10,
    color: '#555',
    fontWeight: '600',
  },
  activeProfileLabelFamily: {
    color: '#2E7D32',
  },
  activeProfileName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  activeProfileNameSelf: {
    color: '#333',
  },
  activeProfileNameFamily: {
    color: '#2E7D32',
  },
  // This is the style we want! It positions the tag at the top right.
  activeTagContainer: {
    // position: 'absolute', // <-- REMOVED this
    // top: 10, // <-- REMOVED this
    // right: 10, // <-- REMOVED this
    alignSelf: 'flex-end', // <-- ADDED this to push it right
    marginBottom: 4, // <-- ADDED this to give it space
    backgroundColor: '#D4EDDA', // Green background
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeTagText: {
    fontSize: 10,
    color: '#155724', // Dark green text
    fontWeight: 'bold',
  },
});

export default HomeScreen;