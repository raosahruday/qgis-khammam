import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from '../utils/storage';

let API_URL = 'https://qgis-khammam.onrender.com/api';

if (__DEV__) {
  if (Platform.OS === 'web') {
    API_URL = 'http://localhost:5000/api';
  } else {
    try {
      const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer');
      const devServer = getDevServer();
      if (devServer && devServer.url) {
        const ip = devServer.url.split('://')[1].split(':')[0];
        API_URL = `http://${ip}:5000/api`;
      } else {
        API_URL = 'http://192.168.1.11:5000/api';
      }
    } catch (e) {
      API_URL = 'http://192.168.1.11:5000/api';
    }
  }
}

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
