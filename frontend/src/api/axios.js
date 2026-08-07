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
        if (ip === 'localhost' || ip === '127.0.0.1') {
          API_URL = 'https://qgis-khammam.onrender.com/api';
        } else {
          API_URL = `http://${ip}:5000/api`;
        }
      } else {
        API_URL = 'https://qgis-khammam.onrender.com/api';
      }
    } catch (e) {
      API_URL = 'https://qgis-khammam.onrender.com/api';
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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response && (response.status === 502 || response.status === 503 || response.status === 504)) {
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < 2) {
        config._retryCount += 1;
        console.log(`[Axios] Server initialising (HTTP ${response.status}). Retrying attempt #${config._retryCount}...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return api(config);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
