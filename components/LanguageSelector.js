import React from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, Text, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';

const LanguageSelector = ({ isVisible, onClose }) => {
  const { language, changeLanguage, t } = useLanguage();

  const languages = [
    { code: 'en', label: t('english'), flag: '🇬🇧' },
    { code: 'hi', label: t('hindi'), flag: '🇮🇳' },
  ];

  const handleSelectLanguage = (code) => {
    changeLanguage(code);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('selectLanguage')}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={28} color="#000" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={languages}
            keyExtractor={(item) => item.code}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.languageItem,
                  language === item.code && styles.languageItemActive,
                ]}
                onPress={() => handleSelectLanguage(item.code)}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text
                  style={[
                    styles.languageLabel,
                    language === item.code && styles.languageLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
                {language === item.code && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={24}
                    color="#007AFF"
                  />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    paddingVertical: 20,
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  languageItemActive: {
    backgroundColor: '#F0F7FF',
  },
  flag: {
    fontSize: 24,
    marginRight: 12,
  },
  languageLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    fontWeight: '500',
  },
  languageLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default LanguageSelector;
