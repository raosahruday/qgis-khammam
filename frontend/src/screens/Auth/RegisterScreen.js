import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('worker');
  const [loading, setLoading] = useState(false);
  const { register } = useContext(AuthContext);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, role);
      Alert.alert('Success', 'Registered successfully. Please login.');
      navigation.navigate('Login');
    } catch (error) {
      Alert.alert('Registration Failed', error.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.mainContainer}>
      <Header />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.card}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join us to start managing cleaning tasks efficiently.</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Enter your full name" 
                value={name} 
                onChangeText={setName} 
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Enter your email" 
                value={email} 
                onChangeText={setEmail} 
                autoCapitalize="none" 
                keyboardType="email-address" 
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput 
                  style={styles.passwordInput} 
                  placeholder="Create a password" 
                  value={password} 
                  onChangeText={setPassword} 
                  secureTextEntry={!showPassword} 
                />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Register as</Text>
              <View style={styles.roleGrid}>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'worker' && styles.roleActive]} 
                  onPress={() => setRole('worker')}>
                  <Ionicons name="construct-outline" size={18} color={role === 'worker' ? Colors.white : Colors.primary} />
                  <Text style={role === 'worker' ? styles.roleTextActive : styles.roleText}>Worker</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'supervisor' && styles.roleActive]} 
                  onPress={() => setRole('supervisor')}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={role === 'supervisor' ? Colors.white : Colors.primary} />
                  <Text style={role === 'supervisor' ? styles.roleTextActive : styles.roleText}>Supervisor</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.roleGrid, { marginTop: 10 }]}>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'commissioner' && styles.roleActive]} 
                  onPress={() => setRole('commissioner')}>
                  <Ionicons name="ribbon-outline" size={18} color={role === 'commissioner' ? Colors.white : Colors.primary} />
                  <Text style={role === 'commissioner' ? styles.roleTextActive : styles.roleText}>Commissioner</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'owner' && styles.roleActive]} 
                  onPress={() => setRole('owner')}>
                  <Ionicons name="business-outline" size={18} color={role === 'owner' ? Colors.white : Colors.primary} />
                  <Text style={role === 'owner' ? styles.roleTextActive : styles.roleText}>Admin/Owner</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>REGISTER</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Already have an account? <Text style={styles.linkHighlight}>Login</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: Colors.background },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: Colors.white,
    padding: 25,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: Colors.primary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 25 },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  passwordInput: { flex: 1, padding: 15, fontSize: 16 },
  eyeIcon: { padding: 10, marginRight: 5 },
  roleGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  roleButton: { 
    width: '48%', 
    flexDirection: 'row',
    padding: 10, 
    borderWidth: 1, 
    borderColor: Colors.primary, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
  roleActive: { backgroundColor: Colors.primary },
  roleText: { color: Colors.primary, fontWeight: 'bold', marginLeft: 5, fontSize: 12 },
  roleTextActive: { color: Colors.white, fontWeight: 'bold', marginLeft: 5, fontSize: 12 },
  button: {
    backgroundColor: Colors.success,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 20,
    elevation: 3,
  },
  buttonText: { color: Colors.white, fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  linkText: { color: Colors.textSecondary, textAlign: 'center', fontSize: 15 },
  linkHighlight: { color: Colors.primary, fontWeight: 'bold' }
});
