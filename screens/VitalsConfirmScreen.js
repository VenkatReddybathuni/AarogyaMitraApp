import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// This is the "Confirmation" screen (Flow H, Screen 4)
const VitalsConfirmScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { vitalType, valueString } = route.params;

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
          onPress={() => navigation.popToTop()} // Go back to start of flow
        >
          <MaterialCommunityIcons name="close" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirmation</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <MaterialCommunityIcons
          name="check-circle"
          size={100}
          color="#34A853"
        />
        <Text style={styles.title}>
          Saved: {vitalType} {valueString}
        </Text>
        <Text style={styles.subtitle}>
          Your reading has been saved to your profile.
        </Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() =>
            navigation.navigate('VitalsHistory', { vitalType: vitalType })
          }
        >
          <Text style={styles.actionButtonText}>View History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          // This integrates with the Reminders flow
          onPress={() => navigation.navigate('Reminders')}
        >
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            Set Reminder
          </Text>
        </TouchableOpacity>
      </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
    marginBottom: 30,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
});

export default VitalsConfirmScreen;