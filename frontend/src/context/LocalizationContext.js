import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from '../utils/storage';
import { translations } from '../constants/Translations';

export const LocalizationContext = createContext();

export const LocalizationProvider = ({ children }) => {
  const [locale, setLocaleState] = useState('en');
  const [isLoadingLocale, setIsLoadingLocale] = useState(true);

  useEffect(() => {
    const loadLocale = async () => {
      try {
        const savedLocale = await SecureStore.getItemAsync('userLocale');
        if (savedLocale === 'en' || savedLocale === 'te') {
          setLocaleState(savedLocale);
        }
      } catch (e) {
        console.warn('Error loading locale', e);
      } finally {
        setIsLoadingLocale(false);
      }
    };
    loadLocale();
  }, []);

  const setLocale = async (newLocale) => {
    if (newLocale === 'en' || newLocale === 'te') {
      setLocaleState(newLocale);
      try {
        await SecureStore.setItemAsync('userLocale', newLocale);
      } catch (e) {
        console.error('Error saving locale', e);
      }
    }
  };

  const t = (key) => {
    const dict = translations[locale] || translations['en'];
    return dict[key] !== undefined ? dict[key] : key;
  };

  return (
    <LocalizationContext.Provider value={{ locale, setLocale, t, isLoadingLocale }}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = () => useContext(LocalizationContext);
