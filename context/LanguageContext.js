import React, { createContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../localization/en';
import hi from '../localization/hi';

// Map of available languages
const translations = {
  en,
  hi,
};

// Create context
export const LanguageContext = createContext();

// Language provider component
export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved language preference on app start
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('appLanguage');
        if (savedLanguage && translations[savedLanguage]) {
          setLanguage(savedLanguage);
        }
      } catch (error) {
        console.warn('Failed to load language preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, []);

  // Change language and save preference
  const changeLanguage = useCallback(async (newLanguage) => {
    if (translations[newLanguage]) {
      setLanguage(newLanguage);
      try {
        await AsyncStorage.setItem('appLanguage', newLanguage);
      } catch (error) {
        console.warn('Failed to save language preference:', error);
      }
    }
  }, []);

  // Get translation string
  const t = useCallback((key) => {
    return translations[language]?.[key] || translations.en?.[key] || key;
  }, [language]);

  // Get all translations for current language
  const currentTranslations = translations[language] || translations.en;

  const value = {
    language,
    changeLanguage,
    t,
    currentTranslations,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

// Custom hook to use language context
export const useLanguage = () => {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export default LanguageContext;
