import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

// A generic placeholder component
// It takes a 'title' prop and receives 'navigation' from the stack
const PlaceholderScreen = ({ navigation, title }) => {
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
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.contentText}>
          This is the placeholder screen for
        </Text>
        <Text style={styles.contentTitle}>{title}</Text>
        <Text style={styles.contentText}>
          You can build this feature here based on your Flow diagrams in
          G5_CS435_Assignment_2.pdf.
        </Text>
      </View>
    </View>
  );
};

// --- Export one component for each of your flows ---
// (AppointmentsScreen has been removed as it now has its own flow)
// (RemindersScreen has been removed as it now has its own flow)
// (DocumentsScreen has been removed as it now has its own flow)

// (Flow G)
// (FamilyProfilesScreen has been removed as it now has its own flow)
// (Flow H)
// (VitalsScreen has been removed as it now has its own flow)
// (Flow I)
// (HelpScreen has been removed as it now has its own flow)

// --- Styles ---
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
    width: 35, // To balance the back arrow
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
  contentText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  contentTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 10,
  },
});