import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Dimensions, Alert } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function WorkerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFocused = useIsFocused();
  const { logout, user, updateUserMachine } = useContext(AuthContext);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tasksRes, machinesRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/machines')
      ]);
      setTasks(tasksRes.data);
      setMachines(machinesRes.data);
    } catch (error) {
      console.error('Error fetching data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  const handleSelectMachine = async (machineId) => {
    try {
      await api.put('/machines/link-worker', { machineId });
      updateUserMachine(machineId);
    } catch (error) {
       console.error('Failed to link machine', error);
    }
  };

  const renderTask = ({ item }) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => navigation.navigate('MapNavigation', { task: item })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.taskTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.locationLabel}>📍 Tap to Navigate</Text>
        <Text style={styles.viewDetails}>Open Task →</Text>
      </View>
    </TouchableOpacity>
  );

  const getTaskColor = (status) => {
    switch (status) {
      case 'approved': return '#2E7D32';
      case 'in_progress':
      case 'submitted': return '#FFD600';
      default: return '#D32F2F';
    }
  };

  const mapTasks = tasks.filter(t => t.geom_json);

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.titleSection}>
        <Text style={styles.headerTitle}>Welcome, {user?.name}</Text>
        <View style={{flexDirection: 'row'}}>
            <TouchableOpacity style={[styles.logoutButton, {marginRight: 10}]} onPress={fetchData}>
              <Text style={{color: Colors.primary, fontWeight: 'bold'}}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={styles.machineSelector}>
        <Text style={styles.sectionTitle}>🚜 Your Tractor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.machineList}>
          {machines.map(m => (
            <TouchableOpacity 
              key={m.id} 
              style={[styles.machineChip, user.current_machine_id === m.id && styles.machineChipActive]}
              onPress={() => handleSelectMachine(m.id)}
            >
              <Text style={styles.machineEmoji}>🚜</Text>
              <Text style={[styles.machineName, user.current_machine_id === m.id && styles.machineNameActive]}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          mapType="satellite"
          initialRegion={{
            latitude: 17.2473,
            longitude: 80.1514,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {mapTasks.map(task => {
            const geom = JSON.parse(task.geom_json);
            const color = getTaskColor(task.status);
            if (geom.type === 'LineString') {
              return (
                <Polyline
                  key={`task-${task.id}`}
                  coordinates={geom.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }))}
                  strokeColor={color}
                  strokeWidth={5}
                  tappable
                  onPress={() => navigation.navigate('MapNavigation', { task })}
                />
              );
            }
            return null;
          })}
        </MapView>
        
        <View style={styles.legend}>
           <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2E7D32' }]} /><Text style={styles.legendText}>Cleaned</Text></View>
           <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FFD600' }]} /><Text style={styles.legendText}>Active</Text></View>
           <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#D32F2F' }]} /><Text style={styles.legendText}>Pending</Text></View>
        </View>
      </View>

      <Text style={styles.subHeader}>Your Assigned Tasks</Text>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTask}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No tasks assigned yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  titleSection: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 15, 
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginBottom: 10
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
  logoutButton: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  logoutText: { color: Colors.accent, fontWeight: '600' },
  subHeader: { fontSize: 18, fontWeight: 'bold', marginHorizontal: 20, marginBottom: 15, color: Colors.text },
  listContainer: { paddingBottom: 20 },
  taskCard: { 
    backgroundColor: Colors.white, 
    padding: 16, 
    marginHorizontal: 15, 
    marginBottom: 12, 
    borderRadius: 15, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  taskTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, flex: 1, marginRight: 10 },
  taskDesc: { color: Colors.textSecondary, marginBottom: 12, fontSize: 14 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusText: { color: Colors.white, fontSize: 10, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  locationLabel: { color: Colors.primary, fontSize: 14, fontWeight: '500' },
  viewDetails: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  mapWrapper: { position: 'relative', marginBottom: 10 },
  map: { width: Dimensions.get('window').width, height: 280 },
  legend: { 
    position: 'absolute', 
    bottom: 15, 
    right: 15, 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    padding: 8, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 10, fontWeight: 'bold', color: '#444' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: Colors.textSecondary, fontSize: 16 },
  machineSelector: { backgroundColor: Colors.white, padding: 15, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 10 },
  machineList: { flexDirection: 'row' },
  machineChip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F5F5F5', 
    paddingHorizontal: 15, 
    paddingVertical: 10, 
    borderRadius: 20, 
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  machineChipActive: { 
    backgroundColor: '#E8F5E9', 
    borderColor: '#4CAF50' 
  },
  machineEmoji: { fontSize: 18, marginRight: 5 },
  machineName: { fontSize: 14, color: '#666', fontWeight: '500' },
  machineNameActive: { color: '#2E7D32', fontWeight: 'bold' }
});
