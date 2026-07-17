import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const { locale, setLocale, t } = useLocalization();

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('error'), t('fill_all_fields_alert'));
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (error) {
      Alert.alert(t('login_failed'), error.response?.data?.error || t('something_went_wrong'));
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
            {/* Language Selector Toggle */}
            <View style={styles.languageToggleContainer}>
              <TouchableOpacity 
                style={[styles.languageToggleBtn, locale === 'en' && styles.languageToggleBtnActive]} 
                onPress={() => setLocale('en')}
              >
                <Text style={[styles.languageToggleText, locale === 'en' && styles.languageToggleTextActive]}>English</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.languageToggleBtn, locale === 'te' && styles.languageToggleBtnActive]} 
                onPress={() => setLocale('te')}
              >
                <Text style={[styles.languageToggleText, locale === 'te' && styles.languageToggleTextActive]}>తెలుగు</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.headerSection}>
              <View style={styles.iconCircle}>
                <Ionicons name="leaf-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.title}>{t('login_title')}</Text>
              <Text style={styles.subtitle}>{t('login_subtitle')}</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('email')}</Text>
              <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
                <Ionicons name="person-outline" size={20} color={emailFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('enter_email')}
                  placeholderTextColor={Colors.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="default"
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('password')}</Text>
              <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
                <Ionicons name="lock-closed-outline" size={20} color={passwordFocused ? Colors.primary : Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.passwordInput}
                  placeholder={t('enter_password')}
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
            
            <TouchableOpacity style={[styles.button, Colors.shadowLow]} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>{t('login_btn')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkContainer}>
              <Text style={styles.linkText}>{t('no_account')}<Text style={styles.linkHighlight}>{t('register')}</Text></Text>
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
    padding: 30,
    borderRadius: Colors.radiusLarge,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  languageToggleContainer: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    backgroundColor: `${Colors.textSecondary}15`,
    borderRadius: 8,
    padding: 3,
    marginBottom: 15,
  },
  languageToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  languageToggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  languageToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  languageToggleTextActive: {
    color: Colors.white,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 30,
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
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 56,
  },
  inputWrapperFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.card,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    height: '100%',
  },
  passwordInput: { flex: 1, fontSize: 16, color: Colors.text, height: '100%' },
  eyeIcon: { padding: 10 },
  button: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    marginBottom: 20,
  },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  linkContainer: { paddingVertical: 10 },
  linkText: { color: Colors.textSecondary, textAlign: 'center', fontSize: 15 },
  linkHighlight: { color: Colors.primary, fontWeight: '700' }
});
