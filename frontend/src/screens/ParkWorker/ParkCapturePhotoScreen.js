import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../../api/axios';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function ParkCapturePhotoScreen({ route, navigation }) {
  const { taskId } = route.params;
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [photosCount, setPhotosCount] = useState(0);

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
      Alert.alert("Permission to access camera is required!");
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
      Alert.alert("Error", "Please take a photo first.");
      return;
    }

    setUploading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required to upload task photos.');
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
          'Photo Uploaded',
          `Photo ${nextCount}/4 uploaded successfully! Please upload ${4 - nextCount} more photo(s) to complete the task.`,
          [{ text: 'Take Next Photo', onPress: () => takePhoto() }]
        );
      } else {
        Alert.alert(
          'Minimum Uploads Met',
          `Successfully uploaded ${nextCount} photos! You have met the minimum requirement of 4 photos.`,
          [
            { text: 'Upload More (Optional)', onPress: () => {} },
            { text: 'Finish & Go back', onPress: () => navigation.goBack() }
          ]
        );
      }

    } catch (error) {
      console.error(error);
      Alert.alert('Upload Failed', error.response?.data?.error || 'Failed to upload photo and location');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-outline" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Park Photo Proof</Text>
        <Text style={styles.headerSubtitle}>
          Upload at least 4 photos of different areas in the park.
        </Text>
      </View>

      <View style={styles.counterBox}>
        <Text style={styles.counterLabel}>Photos Uploaded</Text>
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
            <Text style={styles.placeholderText}>Camera Ready</Text>
            <Text style={styles.placeholderSubtext}>
              Take clear pictures of the swept pathways and clean areas.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.cameraBtn, Colors.shadowLow]} onPress={takePhoto} activeOpacity={0.8}>
          <Ionicons name="camera" size={20} color={Colors.white} />
          <Text style={styles.btnText}>
            {photo ? 'Re-take Photo' : `Take Photo #${photosCount + 1}`}
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
                <Text style={styles.btnText}>Upload Photo #{photosCount + 1}</Text>
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
            <Text style={styles.btnText}>I'm Done - Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 24, 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#F8FAFC' 
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
