import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import CustomModal from '../components/CustomModal';

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  !(typeof global !== 'undefined' && global.nativeFabricUIManager)
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Data for FAQs based on your PDF (Flow I, Figure 17)
const faqs = [
  {
    id: 'q1',
    question: '1. What is AarogyaMitra?',
    answer:
      'AarogyaMitra is a smart telehealth platform designed to connect you with healthcare providers from the comfort of your home, especially for those in rural areas.',
  },
  {
    id: 'q2',
    question: '2. How do I book an appointment?',
    answer:
      'You can book an appointment by tapping the "My Appointments" card on the home screen, then tapping "Book new appointment" and following the steps.',
  },
  {
    id: 'q3',
    question: '3. Is my data secure?',
    answer:
      'Yes, all your health data is encrypted and stored securely. We take your privacy very seriously. You can manage your data in the "Family Profiles" section.',
  },
];

// This is the main "Help and Support" screen (Flow I, Screen 2)
const HelpCenterScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const toggleFAQ = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  const watchTutorial = () => {
    setModalVisible(true);
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
          onPress={() => navigation.navigate('Home')} // Go back to main Home
        >
          <MaterialCommunityIcons name="arrow-left" size={30} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help and Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Video Tutorial Section */}
        <Text style={styles.sectionTitle}>Video Tutorial</Text>
        <TouchableOpacity style={styles.card} onPress={watchTutorial}>
          <MaterialCommunityIcons
            name="play-circle-outline"
            size={40}
            color="#D93025"
          />
          <Text style={styles.cardText}>Watch video tutorial to use app</Text>
        </TouchableOpacity>

        {/* FAQ Section */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions (FAQ)</Text>
        {faqs.map((faq) => (
          <View key={faq.id} style={styles.faqContainer}>
            <TouchableOpacity style={styles.card} onPress={() => toggleFAQ(faq.id)}>
              <Text style={styles.faqQuestion}>{faq.question}</Text>
              <MaterialCommunityIcons
                name={expandedId === faq.id ? 'chevron-up' : 'chevron-down'}
                size={24}
                color="#007AFF"
              />
            </TouchableOpacity>
            {expandedId === faq.id && (
              <View style={styles.faqAnswerContainer}>
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Ask AI Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AISupport')}
        >
          <MaterialCommunityIcons name="robot" size={24} color="#fff" />
          <Text style={styles.addButtonText}>Ask AI Support</Text>
        </TouchableOpacity>
      </View>

      <CustomModal
        isVisible={modalVisible}
        message="This would open a video player with a tutorial on how to use the app."
        isError={false}
        onClose={() => setModalVisible(false)}
      />
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 15,
    flex: 1,
  },
  faqContainer: {
    marginBottom: 10,
  },
  faqQuestion: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  faqAnswerContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  faqAnswer: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
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

export default HelpCenterScreen;