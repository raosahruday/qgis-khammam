import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from 'react-native-maps';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';
import api from '../../api/axios';

export default function CommissionerDashboard({ navigation }) {
  const [wardStats, setWardStats] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const { logout } = useContext(AuthContext);

  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });

  useEffect(() => {
    fetchData(region);
    const interval = setInterval(() => fetchData(region), 10000); 
    return () => clearInterval(interval);
  }, []);

  const fetchData = async (currentRegion = null) => {
    try {
      let taskUrl = '/tasks?limit=400'; 
      if (currentRegion) {
        const { latitude, longitude, latitudeDelta, longitudeDelta } = currentRegion;
        const minLat = latitude - latitudeDelta / 2;
        const maxLat = latitude + latitudeDelta / 2;
        const minLng = longitude - longitudeDelta / 2;
        const maxLng = longitude + longitudeDelta / 2;
        taskUrl += `&minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}`;
      }

      const [statsRes, machinesRes, tasksRes] = await Promise.all([
        api.get('/wards/stats'),
        api.get('/machines'),
        api.get(taskUrl)
      ]);
      setWardStats(statsRes.data);
      setMachines(machinesRes.data || []);
      setTasks(tasksRes.data || []);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const onRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
    fetchData(newRegion);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text>Loading Municipal Overview...</Text>
      </View>
    );
  }

  const getTaskColor = (status) => {
      switch(status) {
          case 'approved': return '#2E7D32'; // Green
          case 'in_progress':
          case 'submitted': return '#FFD600'; // Yellow
          default: return '#D32F2F'; // Red
      }
  };

  const totals = wardStats.reduce((acc, curr) => ({
    total: acc.total + parseInt(curr.total_tasks),
    completed: acc.completed + parseInt(curr.completed_tasks),
    active: acc.active + parseInt(curr.active_tasks),
    pending: acc.pending + parseInt(curr.pending_tasks)
  }), { total: 0, completed: 0, active: 0, pending: 0 });

  return (
    <View style={styles.container}>
      <Header />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Khammam Progress</Text>
        <TouchableOpacity style={styles.logout} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
          <View style={[styles.statBox, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.statVal, { color: '#2E7D32' }]}>{totals.completed}</Text>
            <Text style={styles.statLabel}>Cleaned</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#FFFDE7' }]}>
            <Text style={[styles.statVal, { color: '#FBC02D' }]}>{totals.active}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#FFEBEE' }]}>
            <Text style={[styles.statVal, { color: '#C62828' }]}>{totals.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.statVal, { color: '#1565C0' }]}>{machines.length}</Text>
            <Text style={styles.statLabel}>Trucks</Text>
          </View>
      </View>

      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          mapType="satellite"
          initialRegion={region}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {/* Ward Boundaries */}
          {wardStats.map(ward => {
             const geom = ward.geom_json ? JSON.parse(ward.geom_json) : null;
             if (!geom || !geom.coordinates) return null;
             
             return (
               <Polygon
                 key={`ward-${ward.id}`}
                 coordinates={geom.coordinates[0].map(c => ({ longitude: c[0], latitude: c[1] }))}
                 fillColor="rgba(255, 255, 255, 0.05)"
                 strokeColor="rgba(255, 255, 255, 0.3)"
                 strokeWidth={1}
               />
             );
          })}

          {/* Road Tasks (Lines) */}
          {tasks.map(task => {
              if (!task.geom_json) return null;
              const geom = JSON.parse(task.geom_json);
              const color = getTaskColor(task.status);

              if (geom.type === 'LineString') {
                  return (
                      <Polyline 
                          key={`task-${task.id}`}
                          coordinates={geom.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }))}
                          strokeColor={color}
                          strokeWidth={task.status === 'in_progress' ? 6 : 4} // Thicker for active
                          lineDashPattern={task.status === 'pending' ? [5, 5] : null} // Dashed for pending
                          tappable
                          onPress={() => Alert.alert(task.title, `Status: ${task.status.toUpperCase()}\nWard: ${task.ward_name}`)}
                      />
                  );
              }
              return null;
          })}

          {machines.map(m => (
             <Marker
               key={m.id}
               coordinate={{ latitude: parseFloat(m.current_lat), longitude: parseFloat(m.current_lng) }}
               title={m.name}
               description={`Last updated: ${new Date(m.last_updated).toLocaleTimeString()}`}
             >
                <View style={styles.machineMarkerContainer}>
                   <View style={styles.truckIconWrapper}>
                      <Text style={{fontSize: 24}}>🚜</Text>
                      <View style={styles.statusDot} />
                   </View>
                   <View style={styles.labelBubble}>
                      <Text style={styles.labelText}>{m.name}</Text>
                   </View>
                </View>
             </Marker>
          ))}
        </MapView>
        
        {/* Map Legend */}
        <View style={styles.legend}>
           <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2E7D32' }]} /><Text style={styles.legendText}>Cleaned</Text></View>
           <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FFD600' }]} /><Text style={styles.legendText}>Active</Text></View>
           <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#D32F2F' }]} /><Text style={styles.legendText}>Pending</Text></View>
        </View>
      </View>

      <ScrollView style={styles.wardList}>
         <Text style={styles.listTitle}>Ward-wise Summary (60 Wards)</Text>
         {wardStats.map(ward => (
            <View key={ward.id} style={styles.wardItem}>
               <Text style={styles.wardName}>{ward.name}</Text>
               <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { 
                      width: ward.total_tasks > 0 ? `${(ward.completed_tasks / ward.total_tasks) * 100}%` : '0%',
                      backgroundColor: ward.completed_tasks == ward.total_tasks ? '#4CAF50' : '#FF9800'
                  }]} />
               </View>
               <Text style={styles.wardCount}>{ward.completed_tasks}/{ward.total_tasks}</Text>
            </View>
         ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
  logout: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D32F2F' },
  logoutText: { color: '#D32F2F', fontWeight: 'bold' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 10 },
  statBox: { width: '23.5%', padding: 10, borderRadius: 12, alignItems: 'center', elevation: 2 },
  statVal: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { fontSize: 10, color: '#666', marginTop: 2, fontWeight: '600' },
  mapWrapper: { position: 'relative' },
  map: { width: Dimensions.get('window').width, height: 350 },
  legend: { 
    position: 'absolute', 
    bottom: 20, 
    right: 20, 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    padding: 10, 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  legendText: { fontSize: 12, fontWeight: 'bold', color: '#444' },
  machineMarkerContainer: { alignItems: 'center', justifyContent: 'center' },
  truckIconWrapper: { 
    backgroundColor: '#fff', 
    padding: 5, 
    borderRadius: 15, 
    borderWidth: 2, 
    borderColor: '#3F51B5',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    position: 'relative'
  },
  statusDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    backgroundColor: '#4CAF50', 
    borderWidth: 1.5, 
    borderColor: '#fff', 
    position: 'absolute', 
    bottom: -2, 
    right: -2 
  },
  labelBubble: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2
  },
  labelText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  wardList: { flex: 1, padding: 15 },
  listTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  wardItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 10 },
  wardName: { flex: 1, fontSize: 14, fontWeight: '600' },
  progressTrack: { flex: 1, height: 10, backgroundColor: '#EEE', borderRadius: 5, marginHorizontal: 10, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 5 },
  wardCount: { fontSize: 12, color: '#666', width: 40, textAlign: 'right' }
});
