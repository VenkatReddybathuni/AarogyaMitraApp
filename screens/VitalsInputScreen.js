import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// This is the dynamic input screen (Flow H, Screen 3)
// It shows different inputs based on `vitalId`
const VitalsInputScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { vitalType, vitalId } = route.params;

  // State for all possible inputs
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [level, setLevel] = useState('');
  const [sugarType, setSugarType] = useState('Fasting'); // Fasting / Post-Meal
  const [percentage, setPercentage] = useState('');
  const [temp, setTemp] = useState('');
  const [tempUnit, setTempUnit] = useState('°C'); // °C / °F
  const [bpm, setBpm] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg'); // kg / lbs

  // --- Dynamic Form Renderer ---
  // This function renders the correct inputs based on vitalId
  const renderVitalForm = () => {
    switch (vitalId) {
      case 'bp': // Blood Pressure
        return (
          <View style={styles.bpContainer}>
            <TextInput
              style={styles.bpInput}
              placeholder="Systolic (High)"
              placeholderTextColor="#888"
              value={systolic}
              onChangeText={setSystolic}
              keyboardType="number-pad"
            />
            <Text style={styles.bpSlash}>/</Text>
            <TextInput
              style={styles.bpInput}
              placeholder="Diastolic (Low)"
              placeholderTextColor="#888"
              value={diastolic}
              onChangeText={setDiastolic}
              keyboardType="number-pad"
            />
            <Text style={styles.unitText}>mmHg</Text>
          </View>
        );
      case 'sugar': // Blood Sugar
        return (
          <>
            <View style={styles.toggleContainer}>
              {['Fasting', 'Post-Meal'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleButton,
                    sugarType === type && styles.toggleButtonActive,
                  ]}
                  onPress={() => setSugarType(type)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      sugarType === type && styles.toggleTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Level"
                placeholderTextColor="#888"
                value={level}
                onChangeText={setLevel}
                keyboardType="number-pad"
              />
              <Text style={styles.unitText}>mg/dL</Text>
            </View>
          </>
        );
      case 'spo2': // SpO2
        return (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Percentage"
              placeholderTextColor="#888"
              value={percentage}
              onChangeText={setPercentage}
              keyboardType="number-pad"
            />
            <Text style={styles.unitText}>%</Text>
          </View>
        );
      case 'temp': // Temperature
        return (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Temperature"
              placeholderTextColor="#888"
              value={temp}
              onChangeText={setTemp}
              keyboardType="decimal-pad"
            />
            <View style={styles.unitToggle}>
              {['°C', '°F'].map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitButton,
                    tempUnit === unit && styles.unitButtonActive,
                  ]}
                  onPress={() => setTempUnit(unit)}
                >
                  <Text
                    style={[
                      styles.unitButtonText,
                      tempUnit === unit && styles.unitButtonTextActive,
                    ]}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 'hr': // Heart Rate
        return (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Beats per minute"
              placeholderTextColor="#888"
              value={bpm}
              onChangeText={setBpm}
              keyboardType="number-pad"
            />
            <Text style={styles.unitText}>BPM</Text>
          </View>
        );
      case 'weight': // Weight
        return (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Weight"
              placeholderTextColor="#888"
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
            <View style={styles.unitToggle}>
              {['kg', 'lbs'].map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitButton,
                    weightUnit === unit && styles.unitButtonActive,
                  ]}
                  onPress={() => setWeightUnit(unit)}
                >
                  <Text
                    style={[
                      styles.unitButtonText,
                      weightUnit === unit && styles.unitButtonTextActive,
                    ]}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  // --- Save Logic ---
  const handleSave = () => {
    let valueString = '';
    // Consolidate data for confirmation screen
    switch (vitalId) {
      case 'bp':
        valueString = `${systolic} / ${diastolic} mmHg`;
        break;
      case 'sugar':
        valueString = `${level} mg/dL (${sugarType})`;
        break;
      case 'spo2':
        valueString = `${percentage} %`;
        break;
      case 'temp':
        valueString = `${temp} ${tempUnit}`;
        break;
      case 'hr':
        valueString = `${bpm} BPM`;
        break;
      case 'weight':
        valueString = `${weight} ${weightUnit}`;
        break;
    }

    // TODO: Add validation
    navigation.navigate('VitalsConfirm', {
      vitalType,
      valueString,
    });
  };

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
        <Text style={styles.headerTitle}>Record {vitalType}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView}>
        <Text style={styles.label}>Enter your reading below:</Text>
        {renderVitalForm()}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Reading</Text>
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
  scrollView: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  // BP Styles
  bpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bpInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#eee',
    textAlign: 'center',
    flex: 1,
  },
  bpSlash: {
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 10,
  },
  unitText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  // Sugar Toggle
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#E0F0FF',
    borderColor: '#007AFF',
  },
  toggleText: {
    fontSize: 16,
    color: '#333',
  },
  toggleTextActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  // Unit Toggle (Temp/Weight)
  unitToggle: {
    flexDirection: 'row',
    marginLeft: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  unitButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  unitButtonActive: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  unitButtonText: {
    fontSize: 16,
    color: '#333',
  },
  unitButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Default Input Row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#eee',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default VitalsInputScreen;