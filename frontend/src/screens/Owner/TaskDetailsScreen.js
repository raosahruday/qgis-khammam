import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, Button, TouchableOpacity, ScrollView, Image } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from '../../components/MapViewWrapper';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axios';
import Colors from '../../constants/Colors';

const API_BASE_URL = api.defaults.baseURL?.replace('/api', '') || 'http://192.168.1.103';

export default function TaskDetailsScreen({ route, navigation }) {
  const { taskId } = route.params;
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workerIdInput, setWorkerIdInput] = useState('');
  const [photos, setPhotos] = useState([]);
  const [reviewComment, setReviewComment] = useState('');
  const { user } = useContext(AuthContext);

  const [infrastructure, setInfrastructure] = useState([]);
  const [tasks, setTasks] = useState([]);
  const debounceTimer = useRef(null);

  const fetchInfrastructure = async (activeRegion) => {
    try {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = activeRegion;
      const minLat = latitude - latitudeDelta / 2;
      const maxLat = latitude + latitudeDelta / 2;
      const minLng = longitude - longitudeDelta / 2;
      const maxLng = longitude + longitudeDelta / 2;

      const res = await api.get(
        `/infrastructure?minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}&latDelta=${latitudeDelta}&limit=500`
      );
      
      const parsedData = (res.data || []).map(item => {
         try {
            item.parsedGeom = item.geom_json
              ? (typeof item.geom_json === 'string' ? JSON.parse(item.geom_json) : item.geom_json)
              : null;
         } catch (e) {
            item.parsedGeom = null;
         }
         return item;
      });
      setInfrastructure(parsedData);
    } catch (err) {
      console.error('Failed to fetch infrastructure', err);
    }
  };

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

  const fetchPhotos = async () => {
    try {
      const res = await api.get(`/tasks/${taskId}/photos`);
      setPhotos(res.data || []);
    } catch (err) {
      console.log('Failed to fetch task photos', err);
    }
  };

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks');
      setTasks(response.data || []);
    } catch (e) {
      console.log('Failed to fetch tasks in TaskDetailsScreen', e);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
    fetchTasks();
    if (taskId && !taskId.toString().startsWith('virtual-')) {
      fetchPhotos();
    }
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

  const handleUpdateStatus = async (status) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status, comment: reviewComment });
      Alert.alert('Success', `Task ${status === 'approved' ? 'approved' : 'rejected'} successfully.`);
      setReviewComment('');
      fetchTaskDetails();
    } catch (error) {
      const errorMsg = error.response?.data?.details || error.response?.data?.error || error.message;
      Alert.alert('Error', `Failed to update task: ${errorMsg}`);
    }
  };

  const areaGeojsonStr = useMemo(() => {
    if (!task || !task.area_geojson) return '';
    return typeof task.area_geojson === 'string'
      ? task.area_geojson
      : JSON.stringify(task.area_geojson);
  }, [task]);

  const area = useMemo(() => {
    if (!areaGeojsonStr) return [];
    try {
      return JSON.parse(areaGeojsonStr) || [];
    } catch (e) {
      return [];
    }
  }, [areaGeojsonStr]);

  const mappedPoints = useMemo(() => {
    return area.map(c => ({
      latitude: parseFloat(c.latitude),
      longitude: parseFloat(c.longitude)
    }));
  }, [area]);

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 20 }} color={Colors.primary} />;
  if (!task) return <Text style={{ textAlign: 'center', marginTop: 20 }}>Task not found</Text>;
  
  const initialRegion = mappedPoints.length > 0 ? {
     latitude: mappedPoints[0].latitude,
     longitude: mappedPoints[0].longitude,
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  } : { latitude: 17.2473, longitude: 80.1514, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  let polygonColor = "rgba(211, 47, 47, 0.4)"; 
  let strokeColor = "#D32F2F";
  if (task.status === 'submitted') {
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
        onRegionChangeComplete={(newRegion) => {
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => fetchInfrastructure(newRegion), 400);
        }}
      >
        {/* QGIS Infrastructure Layers */}
        {(() => {
           const elements = [];
           infrastructure.forEach(item => {
              const geom = item.parsedGeom;
              if (!geom) return;
              
              if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
                 const props = item.properties || {};
                 const lineId = props.Line_ID || props.line_id;
                 
                 const matchingTask = tasks.find(t => 
                   lineId && t.line_id === lineId.toString()
                 );

                 let roadColor = '#D32F2F'; // Red (Pending/Unassigned)
                 if (matchingTask) {
                   if (matchingTask.status === 'approved') {
                     roadColor = '#2E7D32'; // Green (Completed)
                   } else if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') {
                     roadColor = '#FFD600'; // Yellow (Active)
                   }
                 }

                 const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
                 coords.forEach((cList, idx) => {
                    elements.push(
                      <Polyline
                        key={`infra-road-${item.id}-${idx}`}
                        coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
                        strokeColor={roadColor}
                        strokeWidth={matchingTask ? 6 : 4}
                        zIndex={11}
                        tappable={true}
                        onPress={() => {
                          if (matchingTask) {
                            navigation.navigate('TaskDetails', { taskId: matchingTask.id });
                          } else {
                            navigation.navigate('TaskDetails', { taskId: `virtual-${item.id}` });
                          }
                        }}
                      />
                    );
                 });
              } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
                 const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
                 polys.forEach((poly, idx) => {
                    const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
                    // Style based on type
                    let fillColor = "rgba(255, 255, 255, 0.02)";
                    let strokeColor = "rgba(255, 255, 255, 0.1)";
                    let strokeWidth = 0.5;
                    let lineDash = null;
                    
                    if (item.type === 'row') {
                       fillColor = "rgba(255, 152, 0, 0.15)";
                       strokeColor = "rgba(255, 152, 0, 0.6)";
                       strokeWidth = 1.5;
                    } else if (item.type === 'ward') {
                       fillColor = "rgba(255, 255, 255, 0.03)";
                       strokeColor = "rgba(255, 255, 255, 0.45)";
                       strokeWidth = 1.5;
                       lineDash = [6, 6];
                    }
                    
                    elements.push(
                      <Polygon 
                        key={`infra-poly-${item.id}-${idx}`}
                        coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                        fillColor={fillColor}
                        strokeColor={strokeColor}
                        strokeWidth={strokeWidth}
                        lineDashPattern={lineDash}
                        zIndex={5}
                      />
                    );
                 });
              }
           });
           return elements;
        })()}

        {task.task_type === 'road' && mappedPoints.length >= 2 && (
           <Polyline 
             coordinates={mappedPoints} 
             strokeColor={strokeColor}
             strokeWidth={6}
             zIndex={20}
           />
        )}
        {task.task_type !== 'road' && mappedPoints.length >= 3 && (
           <Polygon 
             coordinates={mappedPoints} 
             fillColor={polygonColor} 
             strokeColor={strokeColor}
             strokeWidth={2}
             zIndex={20}
           />
        )}

        {task.task_type === 'road' && mappedPoints.length > 0 && (
           <Marker 
             key="start-pin"
             coordinate={mappedPoints[0]} 
             title="Start Point" 
             description="Start cleaning here"
             pinColor="red" 
             zIndex={22} 
           />
        )}

        {task.task_type === 'road' && mappedPoints.length > 0 && (
           <Marker 
             key="end-pin"
             coordinate={mappedPoints[mappedPoints.length - 1]} 
             title="End Point" 
             description="End cleaning here"
             pinColor="green" 
             zIndex={22} 
           />
        )}
      </MapView>
      
      <ScrollView style={styles.detailsContainer} contentContainerStyle={{ paddingBottom: 50 }}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.description}>{task.description}</Text>
        
        {/* Render Line ID and Road Name if they exist */}
        {(task.line_id || task.rd_name) ? (
          <View style={styles.metaRow}>
            {task.line_id ? <Text style={styles.metaText}>🔗 Line ID: {task.line_id}</Text> : null}
            {task.rd_name ? <Text style={styles.metaText}>🛣️ Road Name: {task.rd_name}</Text> : null}
          </View>
        ) : null}

        <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{task.status.toUpperCase()}</Text>
        </View>

        {task.review_comment ? (
          <View style={styles.commentLogBox}>
            <Text style={styles.commentLogLabel}>Review Comment:</Text>
            <Text style={styles.commentLogText}>{task.review_comment}</Text>
          </View>
        ) : null}

        <View style={styles.actionSection}>
            <View style={styles.jawanInfoSection}>
                <Text style={styles.jawanLabel}>👷 Attached Jawan:</Text>
                <Text style={styles.jawanNameText}>{task.worker_name || 'Unassigned'}</Text>
            </View>

            {/* Photo Gallery & Review Section for Yellow Lines (Submitted/In Progress) */}
            {(task.status === 'submitted' || task.status === 'in_progress') && (
              <View style={styles.reviewSection}>
                {photos.length > 0 ? (
                  <View style={styles.photoGallerySection}>
                    <Text style={styles.galleryLabel}>📸 Uploaded Proofs:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                      {photos.map((item) => (
                        <View key={item.id} style={styles.photoWrapper}>
                          <Image source={{ uri: `${API_BASE_URL}${item.image_url}` }} style={styles.galleryImage} />
                          <Text style={styles.photoDate}>{new Date(item.uploaded_at).toLocaleString()}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : (
                  <Text style={styles.noPhotosText}>No photos submitted yet.</Text>
                )}

                {/* Comment box and Accept/Reject buttons for Owner & Supervisor */}
                {(user.role === 'owner' || user.role === 'supervisor') && (
                  <View style={styles.reviewForm}>
                    <Text style={styles.label}>Review Feedback:</Text>
                    <TextInput
                      style={styles.commentInput}
                      placeholder="Write feedback/review comment..."
                      placeholderTextColor="#999"
                      value={reviewComment}
                      onChangeText={setReviewComment}
                      multiline
                    />
                    <View style={styles.reviewActionsRow}>
                      <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => handleUpdateStatus('rejected')}>
                        <Text style={styles.actionButtonText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => handleUpdateStatus('approved')}>
                        <Text style={styles.actionButtonText}>Accept</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  map: { height: 280 },
  detailsContainer: { padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -30, flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  description: { fontSize: 16, color: '#666', marginBottom: 15 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
    marginTop: -5,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    marginRight: 15,
    fontWeight: '600',
  },
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
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  jawanInfoSection: { backgroundColor: '#F0F4C3', padding: 15, borderRadius: 10, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#82B1FF' },
  jawanLabel: { fontSize: 11, color: '#558B2F', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 },
  jawanNameText: { fontSize: 18, color: '#33691E', fontWeight: 'bold' },
  commentLogBox: { backgroundColor: '#F9F9F9', borderLeftWidth: 4, borderLeftColor: Colors.primary, padding: 15, borderRadius: 8, marginBottom: 25 },
  commentLogLabel: { fontWeight: 'bold', color: '#444', fontSize: 14, marginBottom: 4 },
  commentLogText: { color: '#666', fontSize: 15 },
  reviewSection: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 20 },
  photoGallerySection: { marginBottom: 20 },
  galleryLabel: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  photoScroll: { flexDirection: 'row' },
  photoWrapper: { marginRight: 15, alignItems: 'center' },
  galleryImage: { width: 150, height: 150, borderRadius: 10, resizeMode: 'cover' },
  photoDate: { fontSize: 11, color: '#888', marginTop: 5, maxWidth: 150, textAlign: 'center' },
  noPhotosText: { color: '#888', fontStyle: 'italic', textAlign: 'center', marginVertical: 15 },
  reviewForm: { marginTop: 10 },
  commentInput: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 15, color: '#333' },
  reviewActionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  rejectButton: { backgroundColor: '#D32F2F' },
  approveButton: { backgroundColor: '#2E7D32' },
  actionButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
