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

// Dummy data for history
const dummyHistory = {
  'Blood Pressure': [
    { id: '1', date: 'Nov 10, 2:30 PM', value: '122 / 80 mmHg' },
    { id: '2', date: 'Nov 9, 1:00 PM', value: '124 / 84 mmHg' },
  ],
  'Blood Sugar': [
    { id: '1', date: 'Nov 10, 8:00 AM', value: '98 mg/dL (Fasting)' },
    { id: '2', date: 'Nov 9, 12:00 PM', value: '135 mg/dL (Post-Meal)' },
  ],
  // Add other types as needed
};

// This is the "View History" screen (Flow H, Screen 5)
const VitalsHistoryScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { vitalType } = route.params;
  const history = dummyHistory[vitalType] || [];

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
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{vitalType} History</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView}>
        {history.length > 0 ? (
          history.map((item) => (
            <View key={item.id} style={styles.historyItem}>
              <Text style={styles.itemValue}>{item.value}</Text>
              <Text style={styles.itemDate}>{item.date}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noDataText}>No history found for {vitalType}.</Text>
        )}
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
  scrollView: {
    flex: 1,
    padding: 15,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  itemDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  noDataText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default VitalsHistoryScreen;