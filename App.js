import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from './context/LanguageContext';
import { ProfileProvider } from './context/ProfileContext';
import { requestNotificationPermissions } from './services/notificationService';

// Import your screens
import WelcomeScreen from './screens/WelcomeScreen';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreen from './screens/homescreen';
import SymptomCheckerScreen from './screens/SymptomCheckerScreen';
import RemindersFlow from './screens/RemindersScreen';
import AppointmentsFlow from './screens/AppointmentsScreen';
import DocumentsFlow from './screens/DocumentsScreen';
import VitalsFlow from './screens/VitalsScreen';
import FamilyProfilesFlow from './screens/FamilyProfilesScreen';
import SettingsScreen from './screens/SettingsScreen';
import EmergencyScreen from './screens/EmergencyScreen';
import AIChatScreen from './screens/AIChatScreen';

// 1. Import the new HelpFlow
import HelpFlow from './screens/HelpScreen';

// 2. 'HelpScreen' is now removed from placeholders
// (This import will now be empty, which is fine, or you can delete it)
import {} from './screens/placeholders';

const Stack = createNativeStackNavigator();

export default function App() {
  // Request notification permissions on app start
  React.useEffect(() => {
    try {
      requestNotificationPermissions();
    } catch (error) {
      console.warn('Failed to initialize notifications (Expo Go SDK 53+ limitation):', error.message);
      // App continues to work even if notifications fail to initialize
    }
  }, []);

  return (
    <ProfileProvider>
      <LanguageProvider>
        <SafeAreaProvider>
          <NavigationContainer>
            <Stack.Navigator
              // Start the app on the new WelcomeScreen
              initialRouteName="Welcome"
              screenOptions={{
                headerShown: false, // Hides the header for all screens
              }}
            >
          {/* Auth Flow Screens */}
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />

          {/* Main App Screens */}
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="SymptomChecker"
            component={SymptomCheckerScreen}
          />
          <Stack.Screen name="Emergency" component={EmergencyScreen} />
          {/* 3. Update this line to use the new AppointmentsFlow */}
          <Stack.Screen name="Appointments" component={AppointmentsFlow} />
          <Stack.Screen name="Reminders" component={RemindersFlow} />
          <Stack.Screen name="Documents" component={DocumentsFlow} />
          {/* 3. Update this line to use the new FamilyProfilesFlow */}
          <Stack.Screen name="FamilyProfiles" component={FamilyProfilesFlow} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Vitals" component={VitalsFlow} />
          {/* 3. Update this line to use the new HelpFlow */}
          <Stack.Screen name="Help" component={HelpFlow} />
          <Stack.Screen name="AIChat" component={AIChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
        </SafeAreaProvider>
      </LanguageProvider>
    </ProfileProvider>
  );
}