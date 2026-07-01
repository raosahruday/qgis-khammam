import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from '../utils/storage';
import api from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const userData = await SecureStore.getItemAsync('userData');
        if (userData) {
          setUser(JSON.parse(userData));
        }
      } catch (e) {
        console.warn('Error restoring token', e);
      }
      setIsLoading(false);
    };

    bootstrapAsync();

    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          console.warn('Session expired or unauthorized. Logging out...');
          await logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/login', { email, password });
      const { token, user: userData } = response.data;
      await SecureStore.setItemAsync('userToken', token);
      await SecureStore.setItemAsync('userData', JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      throw error;
    }
  };

  const register = async (name, phone, password, role, divisions, otp) => {
    try {
      await api.post('/register', { name, phone, password, role, divisions, otp });
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userData');
    setUser(null);
  };

  const updateUserMachine = async (machineId) => {
    const updatedUser = { ...user, current_machine_id: machineId };
    setUser(updatedUser);
    await SecureStore.setItemAsync('userData', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUserMachine }}>
      {children}
    </AuthContext.Provider>
  );
};
