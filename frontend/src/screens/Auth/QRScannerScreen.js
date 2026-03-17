import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../../api/axios';
import Colors from '../../constants/Colors';

export default function QRScannerScreen({ route, navigation }) {
  const { taskId, type } = route.params; // type: 'source' or 'destination'
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.text}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ type: qrType, data }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const response = await api.post('/tasks/verify-qr', {
        taskId,
        qrCode: data,
        type
      });

      if (response.data.success) {
        Alert.alert('Success', `${type === 'source' ? 'Source' : 'Destination'} QR Verified!`);
        navigation.goBack(); // Back to navigation screen
      } else {
        Alert.alert('Error', 'Invalid QR code for this location.');
        setScanned(false);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Verification failed. Please try again.');
      setScanned(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
           <Text style={styles.overlayText}>Scan {type === 'source' ? 'Source' : 'Destination'} QR Code</Text>
           <View style={styles.scanBox} />
        </View>
      </CameraView>
      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
         <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    color: '#fff',
    marginTop: 100,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    borderRadius: 10,
  },
  button: {
    backgroundColor: Colors.primary || '#2E7D32',
    padding: 15,
    borderRadius: 8,
    alignSelf: 'center',
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 15,
    borderRadius: 30,
  },
  cancelText: {
    color: '#000',
    fontWeight: 'bold',
  }
});
