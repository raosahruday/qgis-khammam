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

  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const [divsFocused, setDivsFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, Colors.shadowMedium]}>
            <View style={styles.headerSection}>
              <View style={styles.iconCircle}>
                <Ionicons name="person-add-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join the municipal network to start work.</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={[styles.inputWrapper, nameFocused && styles.inputWrapperFocused]}>
                <Ionicons name="card-outline" size={20} color={nameFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="Enter your full name" 
                  placeholderTextColor={Colors.placeholder}
                  value={name} 
                  onChangeText={setName} 
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Register as</Text>
              <View style={styles.roleGrid}>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'worker' && styles.roleActive]} 
                  onPress={() => setRole('worker')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="construct-outline" size={20} color={role === 'worker' ? Colors.white : Colors.primary} />
                  <Text style={role === 'worker' ? styles.roleTextActive : styles.roleText}>Jawan</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.roleButton, role === 'supervisor' && styles.roleActive]} 
                  onPress={() => setRole('supervisor')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shield-checkmark-outline" size={20} color={role === 'supervisor' ? Colors.white : Colors.primary} />
                  <Text style={role === 'supervisor' ? styles.roleTextActive : styles.roleText}>Sanitary Inspector</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <View style={[styles.phoneContainer, phoneFocused && styles.phoneContainerFocused]}>
                <Ionicons name="call-outline" size={20} color={phoneFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={styles.phoneInput} 
                  placeholder="10-digit mobile number" 
                  placeholderTextColor={Colors.placeholder}
                  value={phone} 
                  onChangeText={setPhone} 
                  keyboardType="phone-pad"
                  maxLength={10}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
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
              <View style={[styles.inputWrapper, otpFocused && styles.inputWrapperFocused]}>
                <Ionicons name="keypad-outline" size={20} color={otpFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="Enter 6-digit OTP code" 
                  placeholderTextColor={Colors.placeholder}
                  value={otp} 
                  onChangeText={setOtp} 
                  keyboardType="number-pad"
                  maxLength={6}
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {role === 'worker' ? 'Division Number' : 'Division Numbers (up to 15)'}
              </Text>
              <View style={[styles.inputWrapper, divsFocused && styles.inputWrapperFocused]}>
                <Ionicons name="grid-outline" size={20} color={divsFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder={role === 'worker' ? "e.g. 53" : "e.g. 1, 2, 3 (comma separated)"} 
                  placeholderTextColor={Colors.placeholder}
                  value={divisions} 
                  onChangeText={setDivisions} 
                  onFocus={() => setDivsFocused(true)}
                  onBlur={() => setDivsFocused(false)}
                />
              </View>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
                <Ionicons name="lock-closed-outline" size={20} color={passwordFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput 
                  style={styles.passwordInput} 
                  placeholder="Create a password" 
                  placeholderTextColor={Colors.placeholder}
                  value={password} 
                  onChangeText={setPassword} 
                  secureTextEntry={!showPassword} 
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.button, Colors.shadowLow]} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>REGISTER</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkContainer}>
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
    backgroundColor: Colors.card,
    padding: 25,
    borderRadius: Colors.radiusLarge,
    borderWidth: 1,
    borderColor: Colors.border,
    marginVertical: 10,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 25,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: Colors.primary,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    height: '100%',
  },
  phoneContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingLeft: 12,
    height: 52,
    overflow: 'hidden',
  },
  phoneContainerFocused: {
    borderColor: Colors.primary,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    height: '100%',
  },
  otpButton: {
    backgroundColor: Colors.primary,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  otpButtonDisabled: {
    backgroundColor: Colors.border,
  },
  otpButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  passwordInput: { flex: 1, fontSize: 15, color: Colors.text, height: '100%' },
  eyeIcon: { padding: 10 },
  roleGrid: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  roleButton: { 
    width: '48%', 
    flexDirection: 'row',
    paddingVertical: 12, 
    borderWidth: 1.5, 
    borderColor: Colors.border, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  roleActive: { 
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  roleText: { color: Colors.textSecondary, fontWeight: '700', marginLeft: 8, fontSize: 12 },
  roleTextActive: { color: Colors.white, fontWeight: '700', marginLeft: 8, fontSize: 12 },
  button: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    marginBottom: 15,
  },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  linkContainer: { paddingVertical: 5 },
  linkText: { color: Colors.textSecondary, textAlign: 'center', fontSize: 14 },
  linkHighlight: { color: Colors.primary, fontWeight: '700' }
});
