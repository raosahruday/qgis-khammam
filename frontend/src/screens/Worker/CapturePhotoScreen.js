import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { useLocalization } from '../../context/LocalizationContext';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function CapturePhotoScreen({ route, navigation }) {
  const { task } = route.params;
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { t } = useLocalization();

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert(t('camera_permission_required'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.5,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0]);
    }
  };

  const submitWork = async () => {
    if (!photo) {
      Alert.alert(t('error'), t('take_photo_first'));
      return;
    }

    setUploading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error'), t('location_permission_required'));
        setUploading(false);
        return;
      }
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });

      const formData = new FormData();
      formData.append('photo', {
        uri: photo.uri,
        name: `task-${task.id}-photo.jpg`,
        type: 'image/jpeg'
      });
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());

      await api.post(`/tasks/${task.id}/upload-photo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Alert.alert(t('success') || 'Success', t('photo_uploaded_success'));
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert(t('upload_failed'), error.response?.data?.error || t('upload_failed_msg'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('upload_photo_proof')}</Text>
        <Text style={styles.headerSubtitle}>{t('capture_evidence')}</Text>
        <View style={styles.roadHintBadge}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
          <Text style={styles.roadHintText}>
            AI Audit Enforced: Capture outdoor road surface only (Cement, Asphalt, Pavers, Gravel). Laptops/indoor photos will be rejected.
          </Text>
        </View>
      </View>
 
      <View style={[styles.previewContainer, Colors.shadowMedium]}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera-outline" size={48} color={Colors.textSecondary} />
            </View>
            <Text style={styles.placeholderText}>{t('camera_ready')}</Text>
            <Text style={styles.placeholderSubtext}>{t('take_picture_hint')}</Text>
          </View>
        )}
      </View>
 
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.cameraBtn, Colors.shadowLow]} onPress={takePhoto} activeOpacity={0.8}>
          <Ionicons name="camera" size={20} color={Colors.white} />
          <Text style={styles.btnText}>{t('take_photo')}</Text>
        </TouchableOpacity>

        {photo && (
          <TouchableOpacity 
            style={[styles.submitBtn, Colors.shadowLow]} 
            onPress={submitWork} 
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color={Colors.white} />
                <Text style={styles.btnText}>{t('upload_proof')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.background },
  header: { alignItems: 'center', marginTop: 20 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18, paddingHorizontal: 10 },
  roadHintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    maxWidth: '100%',
  },
  roadHintText: {
    fontSize: 11.5,
    color: '#92400E',
    fontWeight: '600',
    marginLeft: 6,
    flexShrink: 1,
  },
  
  previewContainer: {
    width: '100%',
    aspectRatio: 0.85,
    backgroundColor: Colors.card,
    borderRadius: Colors.radiusLarge,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  preview: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  placeholderText: { fontSize: 16, fontWeight: '800', color: Colors.text },
  placeholderSubtext: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6 },

  buttonRow: { width: '100%', marginBottom: 15 },
  cameraBtn: { 
    backgroundColor: Colors.blue, 
    padding: 16, 
    borderRadius: 14, 
    width: '100%', 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12 
  },
  submitBtn: { 
    backgroundColor: Colors.success, 
    padding: 16, 
    borderRadius: 14, 
    width: '100%', 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnText: { color: Colors.white, fontSize: 15, fontWeight: '700', marginLeft: 8 }
});
