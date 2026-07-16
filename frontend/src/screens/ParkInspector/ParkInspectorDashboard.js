import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions, Alert, Image, ScrollView } from 'react-native';
import MapView, { Polygon, Marker, Callout } from '../../components/MapViewWrapper';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function ParkInspectorDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [infrastructure, setInfrastructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskPhotos, setSelectedTaskPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  
  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const isFocused = useIsFocused();
  const { logout, user } = useContext(AuthContext);
  const mapRef = useRef(null);

  const fetchDashboardData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      
      const [tasksRes, infraRes] = await Promise.all([
        api.get('/tasks?task_type=park'),
        api.get('/infrastructure?type=ward&limit=100').catch(err => {
          console.log('No infrastructure found:', err.message);
          return { data: [] };
        })
      ]);

      const tasksData = tasksRes.data || [];
      setTasks(tasksData);

      // Parse ward geometries
      const parsedInfra = (infraRes.data || []).map(item => {
        try {
          item.parsedGeom = item.geom_json
            ? (typeof item.geom_json === 'string' ? JSON.parse(item.geom_json) : item.geom_json)
            : null;
        } catch (e) {
          console.log('Failed to parse geom_json for infra:', item.id, e.message);
          item.parsedGeom = null;
        }
        return item;
      });
      setInfrastructure(parsedInfra);

      // Center map around park markers
      if (tasksData.length > 0) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        let hasCoords = false;

        tasksData.forEach(task => {
          const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
          if (Array.isArray(coords) && coords.length > 0) {
            const pt = coords[0];
            if (pt && pt.latitude && pt.longitude) {
              hasCoords = true;
              if (pt.latitude < minLat) minLat = pt.latitude;
              if (pt.latitude > maxLat) maxLat = pt.latitude;
              if (pt.longitude < minLng) minLng = pt.longitude;
              if (pt.longitude > maxLng) maxLng = pt.longitude;
            }
          }
        });

        if (hasCoords) {
          const computedRegion = {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max(0.04, (maxLat - minLat) * 1.5),
            longitudeDelta: Math.max(0.04, (maxLng - minLng) * 1.5),
          };
          setRegion(computedRegion);
          if (mapRef.current) {
            mapRef.current.animateToRegion(computedRegion, 1000);
          }
        }
      }

    } catch (error) {
      console.error('Error fetching inspector dashboard data:', error);
      Alert.alert('Error', 'Failed to fetch dashboard data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchDashboardData(true);
      setSelectedTask(null);
      setSelectedTaskPhotos([]);
    }
  }, [isFocused]);

  const handleSelectTask = async (task) => {
    setSelectedTask(task);
    setSelectedTaskPhotos([]);
    setPhotosLoading(true);
    
    // Center map on the selected task
    const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
    const pt = coords[0];
    if (pt && pt.latitude && pt.longitude) {
      const zoomRegion = {
        latitude: pt.latitude,
        longitude: pt.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      mapRef.current?.animateToRegion(zoomRegion, 600);
    }

    try {
      const photosRes = await api.get(`/tasks/${task.id}/photos`);
      setSelectedTaskPhotos(photosRes.data || []);
    } catch (error) {
      console.error('Error fetching task photos:', error);
    } finally {
      setPhotosLoading(false);
    }
  };

  const handleApproveTask = async (taskId) => {
    Alert.alert(
      'Approve Task',
      'Are you sure you want to approve this park cleaning?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setLoading(true);
              await api.put(`/tasks/${taskId}/approve`);
              Alert.alert('Success', 'Park cleaning task has been approved.');
              setSelectedTask(null);
              fetchDashboardData(false);
            } catch (err) {
              console.error('Approve task error:', err);
              Alert.alert('Error', 'Failed to approve task.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleRejectTask = async (taskId) => {
    Alert.alert(
      'Reject Task',
      'Are you sure you want to reject this park cleaning? The park jawan will need to upload a new proof photo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.put(`/tasks/${taskId}/reject`);
              Alert.alert('Success', 'Park cleaning task has been rejected.');
              setSelectedTask(null);
              fetchDashboardData(false);
            } catch (err) {
              console.error('Reject task error:', err);
              Alert.alert('Error', 'Failed to reject task.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': 
        return '#10B981'; // Green
      case 'submitted': 
      case 'in_progress': 
        return '#F59E0B'; // Yellow/Amber
      case 'rejected': 
      default: 
        return '#EF4444'; // Red
    }
  };

  const renderTaskItem = ({ item }) => {
    const isSelected = selectedTask && selectedTask.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.taskCard, isSelected && styles.selectedTaskCard]}
        onPress={() => handleSelectTask(item)}
      >
        <View style={styles.taskCardHeader}>
          <Text style={styles.taskTitle} numberOfLines={1}>{item.title || 'Unnamed Park'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status ? item.status.toUpperCase() : 'PENDING'}
            </Text>
          </View>
        </View>

        <Text style={styles.taskSubtitle}>
          <Ionicons name="location-outline" size={13} color="#9CA3AF" /> {item.ward_name || 'Unknown Ward'}
        </Text>
        <Text style={styles.taskSubtitle}>
          <Ionicons name="person-outline" size={13} color="#9CA3AF" /> Jawan: {item.worker_name || 'Unassigned'}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading && tasks.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading portal data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header 
        title="Park Inspector" 
        subtitle="Manage & Verify Cleanings" 
        onLogout={logout} 
      />

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          mapType="satellite"
          showsUserLocation={true}
        >
          {/* Ward Boundaries */}
          {infrastructure.filter(item => item.type === 'ward').map(ward => {
            const geom = ward.parsedGeom;
            if (!geom) return null;
            const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
            return polys.map((poly, idx) => {
              const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
              return (
                <Polygon
                  key={`ward-boundary-inspector-${ward.id}-${idx}`}
                  coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                  strokeColor="#3B82F6"
                  fillColor="rgba(59, 130, 246, 0.03)"
                  strokeWidth={2}
                  zIndex={5}
                />
              );
            });
          })}

          {/* Park Task Pins */}
          {tasks.map(task => {
            const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
            const pt = coords[0];
            if (!pt || !pt.latitude || !pt.longitude) return null;

            return (
              <Marker
                key={`park-marker-${task.id}`}
                coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
                onPress={() => handleSelectTask(task)}
              >
                <View style={[styles.markerPin, { borderColor: getStatusColor(task.status) }]}>
                  <View style={[styles.markerInner, { backgroundColor: getStatusColor(task.status) }]}>
                    <Ionicons name="leaf" size={13} color="white" />
                  </View>
                </View>
                <Callout>
                  <View style={styles.calloutContainer}>
                    <Text style={styles.calloutTitle}>{task.title || 'Park'}</Text>
                    <Text style={styles.calloutStatus}>{task.status ? task.status.toUpperCase() : 'PENDING'}</Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>
      </View>

      {/* Main Bottom Section split into List or Detail View */}
      {selectedTask ? (
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setSelectedTask(null)} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="#1E293B" />
              <Text style={styles.backButtonText}>Back to List</Text>
            </TouchableOpacity>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedTask.status) + '15' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(selectedTask.status) }]}>
                {selectedTask.status ? selectedTask.status.toUpperCase() : 'PENDING'}
              </Text>
            </View>
          </View>

          <ScrollView style={styles.detailScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.detailTitle}>{selectedTask.title || 'Unnamed Park'}</Text>
            
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="map-outline" size={16} color="#4B5563" />
                <Text style={styles.metaLabel}>Ward:</Text>
                <Text style={styles.metaValue}>{selectedTask.ward_name || 'N/A'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={16} color="#4B5563" />
                <Text style={styles.metaLabel}>Jawan:</Text>
                <Text style={styles.metaValue}>{selectedTask.worker_name || 'Unassigned'}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Uploaded Proof Photos</Text>
            {photosLoading ? (
              <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 20 }} />
            ) : selectedTaskPhotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                {selectedTaskPhotos.map((photo, index) => (
                  <View key={photo.id || index} style={styles.photoContainer}>
                    <Image source={{ uri: photo.image_url }} style={styles.photo} />
                    <Text style={styles.photoTimestamp}>
                      {new Date(photo.uploaded_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.noPhotosText}>No proof photos uploaded for this cleaning session yet.</Text>
            )}

            {/* Action Buttons */}
            {selectedTask.status === 'submitted' && (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => handleApproveTask(selectedTask.id)}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Approve Cleaning</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleRejectTask(selectedTask.id)}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Reject Cleaning</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listSectionTitle}>All Parks ({tasks.length})</Text>
          <FlatList
            data={tasks}
            renderItem={renderTaskItem}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.listScroll}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchDashboardData(false);
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No park cleaning tasks registered.</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 14,
  },
  mapContainer: {
    height: height * 0.35,
    width: '100%',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  calloutContainer: {
    padding: 6,
    maxWidth: 150,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#1E293B',
  },
  calloutStatus: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  listScroll: {
    paddingBottom: 20,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  selectedTaskCard: {
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  taskCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  taskSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
    paddingHorizontal: 20,
    paddingTop: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 6,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  detailScroll: {
    flex: 1,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  photoScroll: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  photoContainer: {
    marginRight: 12,
    alignItems: 'center',
  },
  photo: {
    width: width * 0.4,
    height: width * 0.4 * 1.33,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  photoTimestamp: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 6,
  },
  noPhotosText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
    marginVertical: 12,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  actionBtn: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  approveBtn: {
    backgroundColor: '#10B981',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  markerPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  markerInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
