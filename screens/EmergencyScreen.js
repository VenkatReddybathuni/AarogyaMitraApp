import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLanguage } from '../context/LanguageContext';

// This is the "Emergency Initiated" screen (Flow A, Figure 1)
const EmergencyScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [statusText, setStatusText] = useState('');
  const [isAlerting, setIsAlerting] = useState(true);

  // Initialize status text with translation
  useEffect(() => {
    setStatusText(t('alertingNearestAmbulance'));
  }, [t]);

  // Simulate the "map coordination" step from your PDF
  useEffect(() => {
    let timer;
    if (isAlerting && statusText) {
      timer = setTimeout(() => {
        setStatusText(t('ambulanceDispatched'));
      }, 5000); // 5-second delay
    }
    return () => clearTimeout(timer);
  }, [isAlerting, t, statusText]);

  const handleCancel = () => {
    setIsAlerting(false);
    setStatusText(t('emergencyAlertCancelled'));
    // Navigate back to Home after a short delay
    setTimeout(() => {
      navigation.goBack();
    }, 2000);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.content}>
        {isAlerting && (
          <View style={styles.iconContainer}>
            {/* Simple pulsing animation effect */}
            <MaterialCommunityIcons
              name="radio-tower"
              size={100}
              color="#fff"
            />
          </View>
        )}
        <Text style={styles.title}>
          {isAlerting ? t('emergencyAlertActive') : t('alertCancelled')}
        </Text>
        <Text style={styles.statusText}>{statusText}</Text>

        {/* Show a map placeholder if alert is confirmed */}
        {!isAlerting && statusText.includes('cancelled') ? null : (
          <View style={styles.mapPlaceholder}>
            <MaterialCommunityIcons
              name="map-marker-path"
              size={50}
              color="#fff"
            />
            <Text style={styles.mapText}>
              {statusText.includes('Ambulance') || statusText.includes('एम्बुलेंस')
                ? t('liveMapTracking')
                : t('locating')}
            </Text>
          </View>
        )}
      </View>

      {/* Cancel Button (Flow A, Figure 1 "Click here to stop") */}
      {isAlerting && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
          >
            <Text style={styles.cancelButtonText}>{t('clickHereToStop')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D93025', // Emergency Red
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    // TODO: Add a real pulsing animation
    opacity: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 24,
  },
  mapPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 10,
    marginTop: 30,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  mapText: {
    color: '#fff',
    marginTop: 10,
    textAlign: 'center',
  },
  footer: {
    padding: 20,
    paddingBottom: 30, // Extra padding for safety area
  },
  cancelButton: {
    backgroundColor: '#fff',
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
  cancelButtonText: {
    color: '#D93025',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default EmergencyScreen;