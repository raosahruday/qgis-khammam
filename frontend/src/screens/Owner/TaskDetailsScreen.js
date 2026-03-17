import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, Button, TouchableOpacity } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axios';
import Colors from '../../constants/Colors';

export default function TaskDetailsScreen({ route, navigation }) {
  const { taskId } = route.params;
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workerIdInput, setWorkerIdInput] = useState('');
  const { user } = useContext(AuthContext);

  const fetchTaskDetails = async () => {
    try {
      const response = await api.get(`/tasks/${taskId}`);
      setTask(response.data);
      if (response.data.assigned_worker_id) {
          setWorkerIdInput(response.data.assigned_worker_id.toString());
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
  }, [taskId]);

  const handleAssign = async () => {
    if (!workerIdInput) return;
    try {
      await api.put(`/tasks/${taskId}/assign`, { workerId: parseInt(workerIdInput) });
      Alert.alert('Success', 'Worker assigned successfully.');
      fetchTaskDetails();
    } catch (error) {
      Alert.alert('Error', 'Failed to assign worker. Is the ID correct?');
    }
  };

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 20 }} color={Colors.primary} />;
  if (!task) return <Text style={{ textAlign: 'center', marginTop: 20 }}>Task not found</Text>;

  const area = typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson;
  
  const initialRegion = area && area.length > 0 ? {
     latitude: parseFloat(area[0].latitude),
     longitude: parseFloat(area[0].longitude),
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  } : { latitude: 17.2473, longitude: 80.1514, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  let polygonColor = "rgba(211, 47, 47, 0.4)"; 
  let strokeColor = "#D32F2F";
  if (task.status === 'submitted' || task.status === 'in_progress') {
      polygonColor = "rgba(255, 214, 0, 0.4)"; 
      strokeColor = "#FFD600";
  } else if (task.status === 'approved') {
      polygonColor = "rgba(46, 125, 50, 0.4)"; 
      strokeColor = "#2E7D32";
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapType="satellite"
        initialRegion={initialRegion}
      >
        {area && area.length >= 3 && (
           <Polygon 
             coordinates={area.map(c => ({latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude)}))} 
             fillColor={polygonColor} 
             strokeColor={strokeColor}
             strokeWidth={2}
           />
        )}
      </MapView>
      
      <View style={styles.detailsContainer}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.description}>{task.description}</Text>
        <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{task.status.toUpperCase()}</Text>
        </View>

        <View style={styles.actionSection}>
            { (user.role === 'owner' || user.role === 'supervisor') && (
              <>
                <Text style={styles.label}>Assignment:</Text>
                <View style={styles.assignRow}>
                    <TextInput 
                        style={styles.input} 
                        placeholder="Worker ID"
                        value={workerIdInput} 
                        onChangeText={setWorkerIdInput}
                        keyboardType="numeric"
                    />
                    <TouchableOpacity style={styles.assignBtn} onPress={handleAssign}>
                        <Text style={styles.assignBtnText}>Assign</Text>
                    </TouchableOpacity>
                </View>
              </>
            )}

            { (user.role === 'owner' || user.role === 'supervisor' || user.role === 'commissioner') && (
                <TouchableOpacity 
                    style={styles.qrButton} 
                    onPress={() => navigation.navigate('QRDisplay', { task })}
                >
                    <Ionicons name="qr-code" size={24} color="#fff" />
                    <Text style={styles.qrButtonText}>VIEW TASK QR CODES</Text>
                </TouchableOpacity>
            )}

            {task.status === 'submitted' && (user.role === 'owner' || user.role === 'supervisor' || user.role === 'commissioner') && (
               <TouchableOpacity 
                 style={styles.reviewBtn} 
                 onPress={() => navigation.navigate('PhotoReview', { taskId })}
               >
                 <Text style={styles.btnText}>Review Proof & Photos</Text>
               </TouchableOpacity>
            )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  map: { height: 280 },
  detailsContainer: { padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -30, flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  description: { fontSize: 16, color: '#666', marginBottom: 15 },
  statusBadge: { backgroundColor: '#EEE', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 25 },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  actionSection: { marginTop: 10 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#444', marginBottom: 8 },
  assignRow: { flexDirection: 'row', marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#F0F0F0', borderRadius: 10, padding: 12, marginRight: 10, fontSize: 16 },
  assignBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  assignBtnText: { color: '#fff', fontWeight: 'bold' },
  qrButton: { backgroundColor: '#3F51B5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 15, marginBottom: 15, elevation: 3 },
  qrButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },
  reviewBtn: { backgroundColor: Colors.success, padding: 18, borderRadius: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
