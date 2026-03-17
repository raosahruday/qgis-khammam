import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../../api/axios';

export default function CapturePhotoScreen({ route, navigation }) {
  const { task } = route.params;
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);

  const takePhoto = async () => {
    // Request permission
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
      // Get current location strictly at upload time
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required to verify task completion.');
        setUploading(false);
        return;
      }
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });

      // Create FormData
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

      Alert.alert('Success', 'Task submitted for review successfully!');
      navigation.navigate('WorkerDashboard');
    } catch (error) {
      console.error(error);
      Alert.alert('Upload Failed', error.response?.data?.error || 'Failed to upload photo and location');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} />
      ) : (
        <View style={styles.placeholder}>
          <Text>No Photo Captured</Text>
        </View>
      )}

      <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
        <Text style={styles.btnText}>Take Photo</Text>
      </TouchableOpacity>

      {photo && (
        <TouchableOpacity style={styles.submitBtn} onPress={submitWork} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Submit Work</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  preview: { width: 300, height: 400, borderRadius: 10, marginBottom: 20 },
  placeholder: { width: 300, height: 400, backgroundColor: '#eee', borderRadius: 10, marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
  cameraBtn: { backgroundColor: '#007bff', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center', marginBottom: 15 },
  submitBtn: { backgroundColor: '#28a745', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
