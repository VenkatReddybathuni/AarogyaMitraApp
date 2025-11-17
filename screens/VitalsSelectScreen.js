import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

// Data for the 6 vitals from your PDF (Flow H, Figure 16)
const vitals = [
  {
    id: 'bp',
    name: 'Blood Pressure',
    icon: 'heart-pulse',
    color: '#D93025',
  },
  {
    id: 'sugar',
    name: 'Blood Sugar',
    icon: 'water-percent', // Represents glucometer
    color: '#007AFF',
  },
  {
    id: 'spo2',
    name: 'SpO2',
    icon: 'gas-cylinder', // O2
    color: '#34A853',
  },
  {
    id: 'temp',
    name: 'Temperature',
    icon: 'thermometer',
    color: '#FAA918',
  },
  {
    id: 'hr',
    name: 'Heart Rate',
    icon: 'heart-outline',
    color: '#D93025',
  },
  {
    id: 'weight',
    name: 'Weight',
    icon: 'weight-kilogram',
    color: '#5F6368',
  },
];

// This is the "Select Vital Type" screen (Flow H, Screen 2)
const VitalsSelectScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

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
          onPress={() => navigation.navigate('Home')} // Go back to main Home
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Record Vitals</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Intro Text (Flow H, Screen 1 "Record Now" is combined) */}
      <Text style={styles.introText}>
        Select a vital sign you would like to record.
      </Text>

      {/* Grid of Vitals */}
      <ScrollView contentContainerStyle={styles.grid}>
        {vitals.map((vital) => (
          <TouchableOpacity
            key={vital.id}
            style={styles.gridItem}
            onPress={() =>
              navigation.navigate('VitalsInput', {
                vitalType: vital.name,
                vitalId: vital.id,
              })
            }
          >
            <MaterialCommunityIcons
              name={vital.icon}
              size={50}
              color={vital.color}
            />
            <Text style={styles.gridText}>{vital.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  introText: {
    fontSize: 16,
    color: '#666',
    padding: 20,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 10,
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    minHeight: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
    color: '#333',
  },
});

export default VitalsSelectScreen;