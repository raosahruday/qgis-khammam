import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Polygon } from '../../components/MapViewWrapper';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

const MemoizedRoad = React.memo(({ geom, color, strokeWidth, onPress }) => {
  const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  return coords.map((cList, idx) => (
    <Polyline
      key={`cList-${idx}`}
      coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
      strokeColor={color}
      strokeWidth={strokeWidth}
      tappable={true}
      onPress={onPress}
      zIndex={11}
    />
  ));
}, (prev, next) => {
  return prev.color === next.color && prev.strokeWidth === next.strokeWidth && prev.geom === next.geom;
});

export default function OwnerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [infrastructure, setInfrastructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWardFilter, setSelectedWardFilter] = useState(null);
  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const mapRef = useRef(null);
  const hasCenteredMapRef = useRef(false);
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);

  const getWardsList = () => {
    const list = [];
    infrastructure.forEach(item => {
      if (item.type === 'ward') {
        const props = item.properties || {};
        const wardNo = props.Ward_No || props.ward_no || item.name;
        if (wardNo) {
          const wardStr = wardNo.toString().trim();
          if (wardStr && !list.includes(wardStr)) {
            list.push(wardStr);
          }
        }
      }
    });
    if (list.length === 0) {
      infrastructure.forEach(item => {
        if (item.type === 'road') {
          const props = item.properties || {};
          const wardNo = props.Ward_No || props.ward_no;
          if (wardNo) {
            const wardStr = wardNo.toString().trim();
            if (wardStr && !list.includes(wardStr)) {
              list.push(wardStr);
            }
          }
        }
      });
    }
    return list.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  };

  const getFilteredInfrastructure = () => {
    if (!selectedWardFilter) return infrastructure;
    return infrastructure.filter(item => {
      const props = item.properties || {};
      const itemWard = props.Ward_No || props.ward_no || (item.type === 'ward' ? item.name : null);
      if (!itemWard) return false;
      return itemWard.toString().trim() === selectedWardFilter.toString().trim();
    });
  };

  const handleWardSelect = (wardNo) => {
    setSelectedWardFilter(wardNo);
    if (!wardNo) {
      const wardFeatures = infrastructure.filter(item => item.type === 'ward');
      animateToWards(wardFeatures);
      return;
    }

    const selectedWardFeature = infrastructure.find(item => {
      if (item.type !== 'ward') return false;
      const props = item.properties || {};
      const itemWard = props.Ward_No || props.ward_no || item.name;
      return itemWard && itemWard.toString().trim() === wardNo.toString().trim();
    });

    if (selectedWardFeature && selectedWardFeature.geom_json) {
      try {
        const geom = JSON.parse(selectedWardFeature.geom_json);
        if (geom.coordinates && geom.coordinates[0]) {
          let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
          geom.coordinates[0].forEach(c => {
            const lng = c[0];
            const lat = c[1];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          });
          if (minLat !== 90) {
            const newRegion = {
              latitude: (minLat + maxLat) / 2,
              longitude: (minLng + maxLng) / 2,
              latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.015),
              longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.015),
            };
            setRegion(newRegion);
            if (mapRef.current) {
              mapRef.current.animateToRegion(newRegion, 1000);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to center selected ward', err);
      }
    }
  };

  const animateToWards = (wardFeatures) => {
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
        const newRegion = {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.04),
          longitudeDelta: Math.max((maxLng - minLng) * 1.3, 0.04),
        };
        setRegion(newRegion);
        if (mapRef.current) {
          setTimeout(() => {
            mapRef.current.animateToRegion(newRegion, 1000);
          }, 600);
        }
      }
    }
  };

  const fetchData = async () => {
    if (tasks.length === 0) {
      setLoading(true);
    }
    try {
      console.log('Fetching tasks from /tasks in OwnerDashboard...');
      const response = await api.get('/tasks');
      console.log('Received tasks length:', response.data?.length);
      setTasks(response.data || []);

      // Fetch supervisor's wards & roads only if not already loaded
      let infraData = infrastructure;
      if (infrastructure.length === 0) {
        console.log('Fetching supervisor infrastructure...');
        const infraResponse = await api.get('/infrastructure?limit=1500');
        infraData = infraResponse.data || [];
        setInfrastructure(infraData);
      }

      // Auto-center map around supervisor's wards (only on first load)
      const wardFeatures = infraData.filter(item => item.type === 'ward');
      if (wardFeatures.length > 0 && !hasCenteredMapRef.current) {
        animateToWards(wardFeatures);
        hasCenteredMapRef.current = true;
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
    const filteredInfra = getFilteredInfrastructure();
    const filteredRoads = filteredInfra.filter(item => item.type === 'road');

    // Filter database tasks by selected ward
    const filteredDbTasks = tasks.filter(t => {
      if (!selectedWardFilter) return true;
      // Look up this task's road in the main infrastructure list to see if its Ward matches
      const road = infrastructure.find(r => {
        if (r.type !== 'road') return false;
        const props = r.properties || {};
        const lineId = props.Line_ID || props.line_id;
        return lineId && lineId.toString() === t.line_id;
      });
      if (!road) return false;
      const props = road.properties || {};
      const roadWard = props.Ward_No || props.ward_no;
      return roadWard?.toString().trim() === selectedWardFilter.toString().trim();
    });

    const combined = [...filteredDbTasks];
    filteredRoads.forEach(road => {
      const props = road.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const rdName = props.Rd_Name || props.rd_name || road.name;
      
      const exists = filteredDbTasks.some(t => 
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

  const getRoadStats = () => {
    const combined = getCombinedTasks();
    let completed = 0;
    let active = 0;
    let pending = 0;

    combined.forEach(t => {
      if (t.status === 'approved') {
        completed++;
      } else if (t.status === 'submitted' || t.status === 'in_progress') {
        active++;
      } else {
        pending++;
      }
    });

    return { completed, active, pending };
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
      <Header small={true} />
      <View style={styles.titleSection}>
        <View>
          <Text style={styles.headerTitle}>Welcome, {user?.name}</Text>
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
          {/* Stats Summary Cards Row */}
          <View style={styles.statsContainer}>
            <View style={[styles.statBox, { backgroundColor: '#E8F5E9' }]}>
              <Text style={[styles.statVal, { color: '#2E7D32' }]}>{getRoadStats().completed}</Text>
              <Text style={styles.statLabel}>Cleaned</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: '#FFFDE7' }]}>
              <Text style={[styles.statVal, { color: '#FBC02D' }]}>{getRoadStats().active}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: '#FFEBEE' }]}>
              <Text style={[styles.statVal, { color: '#C62828' }]}>{getRoadStats().pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>

          {/* Horizontal Ward Selector Pill Row */}
          {getWardsList().length > 0 && (
            <View style={styles.filterContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedWardFilter === null && styles.filterChipActive
                  ]}
                  onPress={() => handleWardSelect(null)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedWardFilter === null && styles.filterChipTextActive
                    ]}
                  >
                    All Wards
                  </Text>
                </TouchableOpacity>
                
                {getWardsList().map(wardNo => (
                  <TouchableOpacity
                    key={`ward-pill-${wardNo}`}
                    style={[
                      styles.filterChip,
                      selectedWardFilter === wardNo && styles.filterChipActive
                    ]}
                    onPress={() => handleWardSelect(wardNo)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedWardFilter === wardNo && styles.filterChipTextActive
                      ]}
                    >
                      Ward {wardNo}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.mapWrapper}>
            <MapView
              ref={mapRef}
              style={styles.map}
              mapType="satellite"
              initialRegion={region}
            >
              {/* Draw Wards Assigned to Supervisor */}
              {getFilteredInfrastructure().filter(item => item.type === 'ward').map(ward => {
                if (!ward.geom_json) return null;
                const geom = JSON.parse(ward.geom_json);
                if (!geom.coordinates || !geom.coordinates[0]) return null;
                return (
                  <Polygon
                    key={`ward-${ward.id}`}
                    coordinates={geom.coordinates[0].map(c => ({ longitude: c[0], latitude: c[1] }))}
                    fillColor="rgba(255, 255, 255, 0.03)"
                    strokeColor="#FFFFFF"
                    strokeWidth={2}
                  />
                );
              })}

              {/* Draw Roads Colored by Task Status */}
              {getFilteredInfrastructure().filter(item => item.type === 'road').map(road => {
                if (!road.geom_json) return null;
                
                let geom;
                try {
                  geom = typeof road.geom_json === 'string' ? JSON.parse(road.geom_json) : road.geom_json;
                } catch (e) {
                  return null;
                }
                if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) return null;

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

                return (
                  <MemoizedRoad
                    key={`road-${road.id}`}
                    geom={geom}
                    color={roadColor}
                    strokeWidth={matchingTask ? 3.5 : 1.5}
                    onPress={() => {
                      if (matchingTask) {
                        navigation.navigate('TaskDetails', { taskId: matchingTask.id });
                      } else {
                        navigation.navigate('TaskDetails', { taskId: `virtual-${road.id}` });
                      }
                    }}
                  />
                );
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
    paddingHorizontal: 15, 
    paddingVertical: 6, 
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginBottom: 5
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.primary },
  logoutButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent },
  logoutText: { color: Colors.accent, fontWeight: '600', fontSize: 12 },
  subText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  buttonRow: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 8 },
  createButton: { 
    flex: 2,
    backgroundColor: Colors.primary, 
    padding: 12, 
    borderRadius: 8, 
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
    padding: 12,
    borderRadius: 8,
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
  createButtonText: { color: Colors.white, fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  listContainer: { paddingBottom: 20 },
  taskCard: { 
    backgroundColor: Colors.white, 
    marginHorizontal: 15, 
    marginBottom: 8, 
    borderRadius: 10, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden'
  },
  taskCardMain: { padding: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  taskTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.text, flex: 1, marginRight: 10 },
  statusBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  statusText: { color: Colors.white, fontSize: 9, fontWeight: 'bold' },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
    marginTop: -4,
  },
  metaText: {
    fontSize: 11,
    color: '#666',
    marginRight: 15,
    fontWeight: '600',
  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6 },
  workerName: { color: Colors.textSecondary, fontSize: 12 },
  viewDetails: { color: Colors.primary, fontWeight: '600', fontSize: 12 },
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
    marginBottom: 8,
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
  },
  filterContainer: {
    marginBottom: 5,
  },
  filterScroll: {
    paddingHorizontal: 15,
    paddingVertical: 3,
    alignItems: 'center',
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: '#ECEFF1',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: '#455A64',
    fontWeight: '600',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statVal: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
    marginTop: 0,
  },
});
