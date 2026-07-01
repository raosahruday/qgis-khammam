import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from '../utils/storage';

// Replace with your local machine's IP address (e.g., 192.168.1.X) if testing on physical device
// Use 10.0.2.2 for Android Emulator, or localhost for iOS simulator
const API_URL = Platform.OS === 'web'
  ? 'http://localhost:5000/api'
  : 'http://192.168.1.33:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
