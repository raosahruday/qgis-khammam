import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export const getItemAsync = async (key) => {
  if (isWeb) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error('localStorage getItem error:', e);
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
};

export const setItemAsync = async (key, value) => {
  if (isWeb) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('localStorage setItem error:', e);
    }
    return;
  }
  return SecureStore.setItemAsync(key, value);
};

export const deleteItemAsync = async (key) => {
  if (isWeb) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('localStorage deleteItem error:', e);
    }
    return;
  }
  return SecureStore.deleteItemAsync(key);
};
