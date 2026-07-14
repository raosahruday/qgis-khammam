import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from '../utils/storage';

const API_URL = __DEV__
  ? 'http://192.168.1.16:5000/api'
  : 'https://qgis-khammam.onrender.com/api';

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
