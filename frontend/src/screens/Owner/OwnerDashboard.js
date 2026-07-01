import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Polygon } from '../../components/MapViewWrapper';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function OwnerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [infrastructure, setInfrastructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching tasks from /tasks in OwnerDashboard...');
      const response = await api.get('/tasks');
      console.log('Received tasks length:', response.data?.length);
      setTasks(response.data || []);

      // Fetch supervisor's wards & roads
      console.log('Fetching supervisor infrastructure...');
      const infraResponse = await api.get('/infrastructure?limit=1500');
      const infraData = infraResponse.data || [];
      setInfrastructure(infraData);

      // Auto-center map around supervisor's wards
      const wardFeatures = infraData.filter(item => item.type === 'ward');
      if (wardFeatures.length > 0) {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        wardFeatures.forEach(w => {
          if (w.geom_json) {
            const geom = JSON.parse(w.geom_json);
            if (geom.coordinates && geom.coordinates[0]) {
              geom.coordinates[0].forEach(c => {
                const lng = c[0];
                const lat = c[1];
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
              });
            }
          }
        });
        if (minLat !== 90) {
          setRegion({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.04),
            longitudeDelta: Math.max((maxLng - minLng) * 1.3, 0.04),
          });
        }
      }
    } catch (error) {
      console.warn('Error fetching dashboard data:', error.response ? error.response.data : error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);



  const handleDeleteAll = async () => {
    Alert.alert(
      "🧨 DANGER AREA",
      "This will PERMANENTLY DELETE ALL current tasks in your network. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "YES, DELETE EVERYTHING", 
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "Type 'DELETE' is not possible here, but are you absolutely 100% sure?",
              [
                { text: "Stop", style: "cancel" },
                {
                  text: "PROCEED WITH PURGE",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.delete('/tasks/all');
                      Alert.alert("Success", "All tasks have been purged.");
                      fetchData();
                    } catch (err) {
                      Alert.alert("Error", "Bulk delete failed");
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const getCombinedTasks = () => {
    const combined = [...tasks];
    const roads = infrastructure.filter(item => item.type === 'road');
    roads.forEach(road => {
      const props = road.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const rdName = props.Rd_Name || props.rd_name || road.name;
      
      const exists = tasks.some(t => 
        lineId && t.line_id === lineId.toString()
      );
      
      if (!exists) {
        combined.push({
          id: `virtual-${road.id}`,
          title: road.name || props.Rd_Name || 'Unnamed Road',
          status: 'pending',
          worker_name: props.JAWAN_NAME || props.jawan_name || 'Unassigned',
          line_id: lineId ? lineId.toString() : null,
          rd_name: rdName || null,
          isVirtual: true
        });
      }
    });
    return combined;
  };

  const renderTask = ({ item }) => (
    <View style={styles.taskCard}>
      <TouchableOpacity
        style={styles.taskCardMain}
        onPress={() => navigation.navigate('TaskDetails', { taskId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Render Line ID and Road Name if they exist */}
        {(item.line_id || item.rd_name) ? (
          <View style={styles.metaRow}>
            {item.line_id ? <Text style={styles.metaText}>🔗 Line ID: {item.line_id}</Text> : null}
            {item.rd_name ? <Text style={styles.metaText}>🛣️ Road Name: {item.rd_name}</Text> : null}
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.workerName}>Worker: {item.worker_name || 'Unassigned'}</Text>
          <Text style={styles.viewDetails}>View Details →</Text>
        </View>
      </TouchableOpacity>
      

    </View>
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#D32F2F'; // Red
      case 'submitted': return '#FFD600'; // Yellow
      case 'approved': return '#2E7D32'; // Green
      case 'rejected': return '#D32F2F'; // Red
      default: return Colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.titleSection}>
        <View>
          <Text style={styles.headerTitle}>Task Dashboard</Text>
          <Text style={styles.subText}>{tasks.length} Assigned / {getCombinedTasks().length} Total Road Segments</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {user?.role !== 'supervisor' && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('MapTaskCreation')}
          >
            <Text style={styles.createButtonText}>+ CREATE TASK</Text>
          </TouchableOpacity>

          {tasks.length > 0 && (
            <TouchableOpacity
              style={styles.deleteAllBtn}
              onPress={handleDeleteAll}
            >
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.deleteAllText}>PURGE ALL</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <>
          <View style={styles.mapWrapper}>
            <MapView
              style={styles.map}
              mapType="satellite"
              region={region}
              onRegionChangeComplete={(r) => setRegion(r)}
            >
              {/* Draw Wards Assigned to Supervisor */}
              {infrastructure.filter(item => item.type === 'ward').map(ward => {
                if (!ward.geom_json) return null;
                const geom = JSON.parse(ward.geom_json);
                if (!geom.coordinates || !geom.coordinates[0]) return null;
                return (
                  <Polygon
                    key={`ward-${ward.id}`}
                    coordinates={geom.coordinates[0].map(c => ({ longitude: c[0], latitude: c[1] }))}
                    fillColor="rgba(255, 255, 255, 0.03)"
                    strokeColor="#FFFFFF"
                    strokeWidth={4}
                  />
                );
              })}

              {/* Draw Roads Colored by Task Status */}
              {infrastructure.filter(item => item.type === 'road').map(road => {
                if (!road.geom_json) return null;
                const geom = JSON.parse(road.geom_json);
                if (geom.type !== 'LineString' && geom.type !== 'MultiLineString') return null;

                const props = road.properties || {};
                const lineId = props.Line_ID || props.line_id;
                const rdName = props.Rd_Name || props.rd_name || road.name;
                
                // Find matching task for status coloring using Line ID strictly
                const matchingTask = tasks.find(t => 
                  lineId && t.line_id === lineId.toString()
                );

                // Status coloring: green for approved, yellow for submitted/active, red for pending/unstarted
                let roadColor = '#D32F2F'; // Default: Pending/Unstarted (Red)
                if (matchingTask) {
                  if (matchingTask.status === 'approved') {
                    roadColor = '#2E7D32'; // Completed (Green)
                  } else if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') {
                    roadColor = '#FFD600'; // Active/Submitted (Yellow)
                  }
                }

                const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
                return coords.map((cList, idx) => (
                  <Polyline
                    key={`road-${road.id}-${idx}`}
                    coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
                    strokeColor={roadColor}
                    strokeWidth={matchingTask ? 6 : 3}
                    tappable={true}
                    onPress={() => {
                      if (matchingTask) {
                        navigation.navigate('TaskDetails', { taskId: matchingTask.id });
                      } else {
                        navigation.navigate('TaskDetails', { taskId: `virtual-${road.id}` });
                      }
                    }}
                  />
                ));
              })}
            </MapView>
          </View>

          <FlatList
            data={getCombinedTasks()}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderTask}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No tasks found</Text>
              </View>
            }
          />
        </>
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
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: Colors.primary },
  logoutButton: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  logoutText: { color: Colors.accent, fontWeight: '600' },
  subText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  buttonRow: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15 },
  createButton: { 
    flex: 2,
    backgroundColor: Colors.primary, 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center',
    marginRight: 10,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  deleteAllBtn: {
    flex: 1,
    backgroundColor: '#D32F2F',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    elevation: 4,
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  deleteAllText: { color: Colors.white, fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  createButtonText: { color: Colors.white, fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  listContainer: { paddingBottom: 20 },
  taskCard: { 
    backgroundColor: Colors.white, 
    marginHorizontal: 15, 
    marginBottom: 12, 
    borderRadius: 15, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden'
  },
  taskCardMain: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  taskTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, flex: 1, marginRight: 10 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusText: { color: Colors.white, fontSize: 10, fontWeight: 'bold' },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    marginTop: -4,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
    marginRight: 15,
    fontWeight: '600',
  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  workerName: { color: Colors.textSecondary, fontSize: 14 },
  viewDetails: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  actionRow: { 
    flexDirection: 'row', 
    borderTopWidth: 1, 
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    padding: 8
  },
  actionBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: 5
  },
  actionText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: Colors.primary },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: Colors.textSecondary, fontSize: 16 },
  mapWrapper: {
    height: 280,
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  }
});
