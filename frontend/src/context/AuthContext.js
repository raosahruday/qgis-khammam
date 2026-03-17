import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
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
        console.error('Error restoring token', e);
      }
      setIsLoading(false);
    };

    bootstrapAsync();
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

  const register = async (name, email, password, role) => {
    try {
      await api.post('/register', { name, email, password, role });
      // Automate login after register if desired, or let user do it
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
