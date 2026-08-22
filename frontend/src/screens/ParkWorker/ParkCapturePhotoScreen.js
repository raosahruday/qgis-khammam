import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { useLocalization } from '../../context/LocalizationContext';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function ParkCapturePhotoScreen({ route, navigation }) {
  const { taskId } = route.params;
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [photosCount, setPhotosCount] = useState(0);
  const { t } = useLocalization();

  const fetchCurrentPhotosCount = async () => {
    try {
      const res = await api.get(`/tasks/${taskId}/photos`);
      setPhotosCount(res.data?.length || 0);
    } catch (e) {
      console.log('Error fetching photos count:', e.message);
    }
  };

  useEffect(() => {
    fetchCurrentPhotosCount();
  }, []);

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

  const uploadPhoto = async () => {
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
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      const formData = new FormData();
      formData.append('photo', {
        uri: photo.uri,
        name: `park-task-${taskId}-photo-${photosCount + 1}.jpg`,
        type: 'image/jpeg'
      });
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());

      await api.post(`/tasks/${taskId}/upload-photo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const nextCount = photosCount + 1;
      setPhotosCount(nextCount);
      setPhoto(null);

      if (nextCount < 4) {
        Alert.alert(
          t('photo_uploaded_alert_title'),
          `Photo ${nextCount}/4 ${t('photo_uploaded_alert_body')}`,
          [{ text: t('take_next_photo'), onPress: () => takePhoto() }]
        );
      } else {
        Alert.alert(
          t('min_uploads_met_title'),
          t('min_uploads_met_body'),
          [
            { text: t('upload_more_optional'), onPress: () => {} },
            { text: t('finish_go_back'), onPress: () => navigation.goBack() }
          ]
        );
      }

    } catch (error) {
      console.error(error);
      Alert.alert(t('upload_failed'), error.response?.data?.error || t('upload_failed_msg'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: '#F8FAFC' }} 
      contentContainerStyle={styles.container}
      bounces={false}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-outline" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('park_photo_proof')}</Text>
        <Text style={styles.headerSubtitle}>
          {t('upload_4_photos')}
        </Text>
      </View>

      <View style={styles.counterBox}>
        <Text style={styles.counterLabel}>{t('counterLabel') || t('photos_uploaded')}</Text>
        <Text style={[styles.counterValue, { color: photosCount >= 4 ? Colors.success : '#EF4444' }]}>
          {photosCount} / 4
        </Text>
      </View>

      <View style={[styles.previewContainer, Colors.shadowMedium]}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera-outline" size={44} color={Colors.textSecondary} />
            </View>
            <Text style={styles.placeholderText}>{t('camera_ready')}</Text>
            <Text style={styles.placeholderSubtext}>
              {t('take_clear_pictures')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.cameraBtn, Colors.shadowLow]} onPress={takePhoto} activeOpacity={0.8}>
          <Ionicons name="camera" size={20} color={Colors.white} />
          <Text style={styles.btnText}>
            {photo ? t('retake_photo') : `${t('take_photo')} #${photosCount + 1}`}
          </Text>
        </TouchableOpacity>

        {photo && (
          <TouchableOpacity 
            style={[styles.submitBtn, Colors.shadowLow]} 
            onPress={uploadPhoto} 
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color={Colors.white} />
                <Text style={styles.btnText}>{t('upload_proof')} #{photosCount + 1}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {photosCount >= 4 && !photo && (
          <TouchableOpacity 
            style={[styles.doneBtn, Colors.shadowLow]} 
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
            <Text style={styles.btnText}>{t('im_done')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flexGrow: 1, 
    padding: 24, 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  header: { 
    alignItems: 'center', 
    marginTop: 20,
    position: 'relative',
    width: '100%'
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 4,
  },
  headerTitle: { 
    fontSize: 19, 
    fontWeight: '800', 
    color: Colors.text, 
    letterSpacing: -0.2 
  },
  headerSubtitle: { 
    fontSize: 12, 
    color: Colors.textSecondary, 
    textAlign: 'center', 
    marginTop: 6, 
    lineHeight: 18, 
    paddingHorizontal: 20 
  },
  counterBox: {
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginTop: 10,
  },
  counterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 0.85,
    backgroundColor: 'white',
    borderRadius: Colors.radiusLarge,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 15,
  },
  preview: { 
    width: '100%', 
    height: '100%', 
    resizeMode: 'cover' 
  },
  placeholder: { 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  placeholderText: { 
    fontSize: 15, 
    fontWeight: '800', 
    color: Colors.text 
  },
  placeholderSubtext: { 
    fontSize: 12, 
    color: Colors.textSecondary, 
    textAlign: 'center', 
    marginTop: 6,
    lineHeight: 16,
    paddingHorizontal: 15
  },
  buttonRow: { 
    width: '100%', 
    marginBottom: 10 
  },
  cameraBtn: { 
    backgroundColor: Colors.blue, 
    padding: 15, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 10 
  },
  submitBtn: { 
    backgroundColor: Colors.success, 
    padding: 15, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  doneBtn: {
    backgroundColor: '#1E293B',
    padding: 15,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnText: { 
    color: Colors.white, 
    fontSize: 14, 
    fontWeight: '700', 
    marginLeft: 8 
  }
});
