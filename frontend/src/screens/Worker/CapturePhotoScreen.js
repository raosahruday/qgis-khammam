import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../../api/axios';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function CapturePhotoScreen({ route, navigation }) {
  const { task } = route.params;
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);

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

  const submitWork = async () => {
    if (!photo) {
      Alert.alert("Error", "Please take a photo first.");
      return;
    }

    setUploading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required to verify task completion.');
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

      Alert.alert('Success', 'Photo proof uploaded successfully! Please swipe to complete the task.');
      navigation.goBack();
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
        <Text style={styles.headerTitle}>Upload Photo Proof</Text>
        <Text style={styles.headerSubtitle}>Capture clear evidence of the completed road cleanup.</Text>
      </View>

      <View style={[styles.previewContainer, Colors.shadowMedium]}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera-outline" size={48} color={Colors.textSecondary} />
            </View>
            <Text style={styles.placeholderText}>Camera Ready</Text>
            <Text style={styles.placeholderSubtext}>Tap the button below to take a picture.</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.cameraBtn, Colors.shadowLow]} onPress={takePhoto} activeOpacity={0.8}>
          <Ionicons name="camera" size={20} color={Colors.white} />
          <Text style={styles.btnText}>Take Photo</Text>
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
                <Text style={styles.btnText}>Upload Proof</Text>
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
