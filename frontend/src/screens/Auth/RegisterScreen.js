import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';
import api from '../../api/axios';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [divisions, setDivisions] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('worker'); // 'worker' is Jawan, 'supervisor' is Sanitary Inspector
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const { register } = useContext(AuthContext);

  const handleSendOTP = async () => {
    if (!phone || !/^\d{10}$/.test(phone.trim())) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    setOtpLoading(true);
    try {
      const response = await api.post('/otp/send', { phone: phone.trim() });
      setOtpSent(true);
      Alert.alert(
        'OTP Sent (Simulator)',
        `OTP sent to ${phone.trim()}.\nVerification code is: ${response.data.otp}`
      );
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name || !phone || !divisions || !password || !otp) {
      Alert.alert('Error', 'Please fill in all fields and verify OTP');
      return;
    }

    const cleanDivs = divisions.trim();
    if (role === 'worker') {
      if (!/^\d+$/.test(cleanDivs)) {
        Alert.alert('Validation Error', 'Jawan must enter a single numeric division number (e.g. 53)');
        return;
      }
    } else {
      const parts = cleanDivs.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) {
        Alert.alert('Validation Error', 'Sanitary Inspector must enter division numbers');
        return;
      }
      if (parts.length > 15) {
        Alert.alert('Validation Error', 'Sanitary Inspector can enter up to 15 divisions only');
        return;
      }
      for (const part of parts) {
        if (!/^\d+$/.test(part)) {
          Alert.alert('Validation Error', 'All division numbers must be numeric');
          return;
        }
      }
    }

    setLoading(true);
    try {
      await register(name, phone.trim(), password, role, cleanDivs, otp.trim());
      Alert.alert('Success', 'Registered successfully. Please wait for Commissioner approval.');
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
              <Text style={styles.label}>Register as</Text>
              <View style={styles.roleGrid}>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'worker' && styles.roleActive]} 
                  onPress={() => setRole('worker')}>
                  <Ionicons name="construct-outline" size={18} color={role === 'worker' ? Colors.white : Colors.primary} />
                  <Text style={role === 'worker' ? styles.roleTextActive : styles.roleText}>Jawan</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'supervisor' && styles.roleActive]} 
                  onPress={() => setRole('supervisor')}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={role === 'supervisor' ? Colors.white : Colors.primary} />
                  <Text style={role === 'supervisor' ? styles.roleTextActive : styles.roleText}>Sanitary Inspector</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.phoneContainer}>
                <TextInput 
                  style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                  placeholder="Enter 10-digit mobile number" 
                  value={phone} 
                  onChangeText={setPhone} 
                  keyboardType="phone-pad"
                  maxLength={10}
                />
                <TouchableOpacity 
                  style={[styles.otpButton, (!phone || phone.length < 10) && styles.otpButtonDisabled]} 
                  onPress={handleSendOTP} 
                  disabled={otpLoading || !phone || phone.length < 10}
                >
                  {otpLoading ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.otpButtonText}>{otpSent ? 'RESEND' : 'GET OTP'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Verification Code (OTP)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Enter 6-digit OTP code" 
                value={otp} 
                onChangeText={setOtp} 
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {role === 'worker' ? 'Division Number' : 'Division Numbers (up to 15)'}
              </Text>
              <TextInput 
                style={styles.input} 
                placeholder={role === 'worker' ? "e.g. 53" : "e.g. 1, 2, 3 (comma separated)"} 
                value={divisions} 
                onChangeText={setDivisions} 
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
    marginVertical: 10,
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
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  otpButton: {
    backgroundColor: Colors.primary,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  otpButtonDisabled: {
    backgroundColor: Colors.border,
    borderColor: Colors.border,
  },
  otpButtonText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 13,
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
    padding: 14, 
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
