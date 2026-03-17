import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
import Colors from '../../constants/Colors';

export default function MapNavigationScreen({ route, navigation }) {
  const { task } = route.params;
  const { user } = useContext(AuthContext);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [liveTask, setLiveTask] = useState(task);
  const [loading, setLoading] = useState(true);
  const locationSubscription = useRef(null);

  useEffect(() => {
    fetchLatestTask();
    startLocationTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  const fetchLatestTask = async () => {
    try {
      const response = await api.get(`/tasks/${task.id}`);
      setLiveTask(response.data);
    } catch (err) {
      console.error('Failed to refresh task', err);
    } finally {
      setLoading(false);
    }
  };

  const startLocationTracking = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Error', 'Location permission is required.');
      return;
    }

    let initialLoc = await Location.getCurrentPositionAsync({});
    setCurrentLocation(initialLoc.coords);

    // Watch position
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10, // Update every 10 meters
      },
      (location) => {
        const { latitude, longitude } = location.coords;
        setCurrentLocation(location.coords);
        
        // Report location to machine tracking if worker is linked to a machine
        if (user.current_machine_id) {
           api.post(`/machines/${user.current_machine_id}/location`, {
             latitude,
             longitude
           }).catch(err => console.error('Machine location update failed', err));
        }

        if (liveTask.status === 'in_progress') {
           checkAndNotifyProgress(latitude, longitude);
        }
      }
    );
  };

  const checkAndNotifyProgress = async (lat, lon) => {
    const points = typeof liveTask.area_geojson === 'string' ? JSON.parse(liveTask.area_geojson) : liveTask.area_geojson;
    if (!points || points.length === 0) return;

    // Simplified: Find the nearest point in the polyline that hasn't been reached yet
    let nearestIndex = liveTask.last_point_reached || 0;
    
    // Check points after the current last_point_reached
    for (let i = nearestIndex + 1; i < points.length; i++) {
        const p = points[i];
        const dist = getDist(lat, lon, parseFloat(p.latitude), parseFloat(p.longitude));
        if (dist < 30) { // Within 30 meters of a path node
            nearestIndex = i;
            updateBackendProgress(i, lat, lon);
            break;
        }
    }
  };

  const updateBackendProgress = async (index, lat, lon) => {
    try {
      await api.post('/tasks/live-progress', {
        taskId: liveTask.id,
        latitude: lat,
        longitude: lon,
        pointIndex: index
      });
      // Update local state to reflect progress immediately
      setLiveTask(prev => ({ ...prev, last_point_reached: index }));
    } catch (err) {
      console.error('Failed to update progress', err);
    }
  };

  const getDist = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  if (loading || !currentLocation) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text>Initializing Navigation...</Text>
      </View>
    );
  }

  const points = typeof liveTask.area_geojson === 'string' ? JSON.parse(liveTask.area_geojson) : liveTask.area_geojson;
  const mappedPoints = points.map(c => ({ latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) }));
  
  // Split points for live color conversion
  const lastReached = liveTask.last_point_reached || 0;
  const completedPath = mappedPoints.slice(0, lastReached + 1);
  const remainingPath = mappedPoints.slice(lastReached);

  const initialRegion = mappedPoints.length > 0 ? {
     latitude: mappedPoints[0].latitude,
     longitude: mappedPoints[0].longitude,
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  } : { latitude: 17.2473, longitude: 80.1514, latitudeDelta: 0.02, longitudeDelta: 0.02 };

  const handleScanQR = (type) => {
    navigation.navigate('QRScanner', { taskId: liveTask.id, type });
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapType="satellite"
        initialRegion={initialRegion}
        showsUserLocation={true}
        followsUserLocation={true}
      >
        {liveTask.task_type === 'area' ? (
           <Polygon 
             coordinates={mappedPoints} 
             fillColor="rgba(0, 0, 255, 0.3)" 
             strokeColor="#0000FF"
             strokeWidth={2}
           />
        ) : (
           <>
             {/* Yellow = Cleaned */}
             {completedPath.length > 1 && (
               <Polyline coordinates={completedPath} strokeColor="#FFFF00" strokeWidth={6} />
             )}
             {/* Red = Remaining */}
             {remainingPath.length > 1 && (
               <Polyline coordinates={remainingPath} strokeColor="#FF0000" strokeWidth={6} />
             )}
             {/* Source/Destination Markers */}
             <Marker coordinate={mappedPoints[0]} title="Start Point (Source QR)" pinColor="red" />
             <Marker coordinate={mappedPoints[mappedPoints.length - 1]} title="End Point (Destination QR)" pinColor="orange" />
           </>
        )}
      </MapView>

      <View style={styles.footer}>
        <View style={styles.infoRow}>
           <View>
             <Text style={styles.title}>{liveTask.title}</Text>
             <Text style={styles.ward}>{liveTask.ward_name || 'Ward Area'}</Text>
           </View>
           <View style={[styles.badge, { backgroundColor: liveTask.status === 'in_progress' ? '#FFC107' : '#E0E0E0' }]}>
             <Text style={styles.badgeText}>{liveTask.status.replace('_', ' ').toUpperCase()}</Text>
           </View>
        </View>

        {liveTask.status === 'pending' && (
           <TouchableOpacity style={styles.qrBtn} onPress={() => handleScanQR('source')}>
              <Text style={styles.btnText}>Scan Start QR at Source</Text>
           </TouchableOpacity>
        )}

        {liveTask.status === 'in_progress' && (
           <TouchableOpacity style={[styles.qrBtn, { backgroundColor: '#FF9800' }]} onPress={() => handleScanQR('destination')}>
              <Text style={styles.btnText}>Scan End QR at Destination</Text>
           </TouchableOpacity>
        )}

        {liveTask.status === 'submitted' && (
           <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CapturePhoto', { task: liveTask })}>
              <Text style={styles.btnText}>Capture Final Proof for Supervisor</Text>
           </TouchableOpacity>
        )}
        
        {liveTask.status === 'approved' && (
           <View style={styles.approvedBox}>
              <Text style={styles.approvedText}>✅ Task Completed & Approved</Text>
           </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: { padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  ward: { color: '#666', fontSize: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15 },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  qrBtn: { backgroundColor: '#3F51B5', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  actionBtn: { backgroundColor: '#28a745', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  approvedBox: { backgroundColor: '#E8F5E9', padding: 15, borderRadius: 10, alignItems: 'center' },
  approvedText: { color: '#2E7D32', fontWeight: 'bold' }
});
