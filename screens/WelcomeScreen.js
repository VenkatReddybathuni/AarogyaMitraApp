import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';

// This is the first screen (Flow A) from your report
// Splash screen that auto-navigates after 1.5 seconds
// OR directly to Home if user is already logged in
const WelcomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Check if user is already authenticated
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // User is logged in, go directly to Home
        navigation.replace('Home');
      } else {
        // User is not logged in, go to Login after 1.5 seconds
        const timer = setTimeout(() => {
          navigation.replace('Login');
        }, 1500);

        return () => clearTimeout(timer);
      }
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to</Text>

        {/* Logo Area - as described in your PDF */}
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons
            name="hospital-building"
            size={50}
            color="#0059B2"
          />
          <MaterialCommunityIcons name="heart-pulse" size={70} color="#34A853" />
          <MaterialCommunityIcons
            name="account-heart"
            size={50}
            color="#0059B2"
          />
        </View>
        <Text style={styles.appName}>AarogyaMitra</Text>
        <Text style={styles.subtitle}>Your Smart Telehealth Platform</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    color: '#333',
    fontWeight: '300',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0059B2',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
});

export default WelcomeScreen;