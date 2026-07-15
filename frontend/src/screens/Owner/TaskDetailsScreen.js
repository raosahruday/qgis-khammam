import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from '../../components/MapViewWrapper';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axios';
import Colors from '../../constants/Colors';

const API_BASE_URL = api.defaults.baseURL?.replace('/api', '') || 'http://192.168.1.103';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
};

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
  const [commentFocused, setCommentFocused] = useState(false);

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

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 30 }} color={Colors.primary} />;
  if (!task) return <Text style={{ textAlign: 'center', marginTop: 20, color: Colors.textSecondary }}>Task not found</Text>;
  
  const initialRegion = mappedPoints.length > 0 ? {
     latitude: mappedPoints[0].latitude,
     longitude: mappedPoints[0].longitude,
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  } : { latitude: 17.2473, longitude: 80.1514, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  let strokeColor = Colors.accent;
  if (task.status === 'submitted') {
      strokeColor = Colors.warning;
  } else if (task.status === 'approved') {
      strokeColor = Colors.success;
  }

  const getStatusBadgeColors = (status) => {
    switch (status) {
      case 'approved': return { bg: Colors.successBg, text: Colors.successText };
      case 'submitted': return { bg: Colors.warningBg, text: Colors.warningText };
      case 'in_progress': return { bg: Colors.infoBg, text: Colors.infoText };
      default: return { bg: Colors.errorBg, text: Colors.errorText };
    }
  };

  const badgeColors = getStatusBadgeColors(task.status);

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

                 let roadColor = Colors.accent; // Default: Pending (Red)
                 if (matchingTask) {
                   if (matchingTask.status === 'approved') {
                     roadColor = Colors.success; // Completed (Green)
                   } else if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') {
                     roadColor = Colors.warning; // Active/Submitted (Yellow)
                   }
                 }

                 const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
                 coords.forEach((cList, idx) => {
                    elements.push(
                      <Polyline
                        key={`infra-road-${item.id}-${idx}`}
                        coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
                        strokeColor={roadColor}
                        strokeWidth={matchingTask ? 5 : 3}
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
                    let fillColor = "rgba(255, 255, 255, 0.02)";
                    let strokeColor = "rgba(255, 255, 255, 0.1)";
                    let strokeWidth = 0.5;
                    
                    if (item.type === 'row') {
                       fillColor = "rgba(245, 158, 11, 0.12)";
                       strokeColor = "rgba(245, 158, 11, 0.5)";
                       strokeWidth = 1.5;
                    } else if (item.type === 'ward') {
                       fillColor = "rgba(255, 255, 255, 0.02)";
                       strokeColor = "rgba(255, 255, 255, 0.4)";
                       strokeWidth = 1.5;
                    }
                    
                    elements.push(
                      <Polygon 
                        key={`infra-poly-${item.id}-${idx}`}
                        coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                        fillColor={fillColor}
                        strokeColor={strokeColor}
                        strokeWidth={strokeWidth}
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
             fillColor="rgba(255, 193, 7, 0.2)" 
             strokeColor={strokeColor}
             strokeWidth={2.5}
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
      
      <ScrollView style={[styles.detailsContainer, Colors.shadowHigh]} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{task.title}</Text>
            <Text style={styles.description}>{task.description}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badgeColors.bg }]}>
            <Text style={[styles.statusText, { color: badgeColors.text }]}>
              {task.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>
        
        {(task.line_id || task.rd_name) ? (
          <View style={styles.metaRow}>
            {task.line_id ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>🔗 Line: {task.line_id}</Text>
              </View>
            ) : null}
            {task.rd_name ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>🛣️ Road: {task.rd_name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {task.review_comment ? (
          <View style={styles.commentLogBox}>
            <View style={styles.commentLogHeader}>
              <Ionicons name="chatbox-ellipses-outline" size={16} color={Colors.primary} />
              <Text style={styles.commentLogLabel}>Review Feedback</Text>
            </View>
            <Text style={styles.commentLogText}>{task.review_comment}</Text>
          </View>
        ) : null}

        <View style={styles.actionSection}>
            <View style={[styles.jawanInfoSection, Colors.shadowLow]}>
                <Text style={styles.jawanLabel}>Assigned Jawan</Text>
                <View style={styles.jawanProfileRow}>
                  <View style={styles.jawanAvatar}>
                    <Ionicons name="construct" size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.jawanNameText}>{task.worker_name || 'Unassigned'}</Text>
                </View>
            </View>

            {(task.status === 'submitted' || task.status === 'in_progress') && (
              <View style={styles.reviewSection}>
                {photos.length > 0 ? (
                  <View style={styles.photoGallerySection}>
                    <Text style={styles.galleryLabel}>📸 Uploaded Proofs ({photos.length})</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                      {photos.map((item) => (
                        <View key={item.id} style={[styles.photoWrapper, Colors.shadowLow]}>
                          <Image source={{ uri: getImageUrl(item.image_url) }} style={styles.galleryImage} />
                          <View style={styles.photoMeta}>
                            <Ionicons name="calendar-outline" size={10} color={Colors.textSecondary} />
                            <Text style={styles.photoDate}>
                              {new Date(item.uploaded_at).toLocaleDateString()} {new Date(item.uploaded_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : (
                  <View style={styles.noPhotosBox}>
                    <Ionicons name="images-outline" size={24} color={Colors.textSecondary} />
                    <Text style={styles.noPhotosText}>No photos submitted yet.</Text>
                  </View>
                )}

                {(user.role === 'owner' || user.role === 'supervisor') && (
                  <View style={styles.reviewForm}>
                    <Text style={styles.label}>Review Feedback Comment</Text>
                    <TextInput
                      style={[styles.commentInput, commentFocused && styles.commentInputFocused]}
                      placeholder="Write review comments or rejection reason here..."
                      placeholderTextColor={Colors.placeholder}
                      value={reviewComment}
                      onChangeText={setReviewComment}
                      multiline
                      onFocus={() => setCommentFocused(true)}
                      onBlur={() => setCommentFocused(false)}
                    />
                    <View style={styles.reviewActionsRow}>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.rejectButton, Colors.shadowLow]} 
                        onPress={() => handleUpdateStatus('rejected')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="close-circle-outline" size={18} color={Colors.white} />
                        <Text style={styles.actionButtonText}>Reject</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.approveButton, Colors.shadowLow]} 
                        onPress={() => handleUpdateStatus('approved')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                        <Text style={styles.actionButtonText}>Approve</Text>
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
  container: { flex: 1, backgroundColor: Colors.background },
  map: { height: 260 },
  detailsContainer: { 
    padding: 24, 
    backgroundColor: Colors.card, 
    borderTopLeftRadius: Colors.radiusLarge, 
    borderTopRightRadius: Colors.radiusLarge, 
    marginTop: -25, 
    flex: 1 
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
    marginBottom: 10 
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.2, marginBottom: 4 },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    marginHorizontal: -2,
  },
  metaChip: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 2,
    marginVertical: 2,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  metaChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
  },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  
  actionSection: { marginTop: 10 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  jawanInfoSection: { 
    backgroundColor: `${Colors.primary}08`, 
    padding: 16, 
    borderRadius: 14, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: `${Colors.primary}20` 
  },
  jawanLabel: { fontSize: 11, color: Colors.primary, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  jawanProfileRow: { flexDirection: 'row', alignItems: 'center' },
  jawanAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  jawanNameText: { fontSize: 16, color: Colors.text, fontWeight: '800' },
  
  commentLogBox: { 
    backgroundColor: Colors.background, 
    borderLeftWidth: 4, 
    borderLeftColor: Colors.primary, 
    padding: 16, 
    borderRadius: 10, 
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  commentLogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  commentLogLabel: { fontWeight: '800', color: Colors.text, fontSize: 13, marginLeft: 6 },
  commentLogText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 18 },
  
  reviewSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 20 },
  photoGallerySection: { marginBottom: 20 },
  galleryLabel: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  photoScroll: { flexDirection: 'row' },
  photoWrapper: { 
    marginRight: 15, 
    alignItems: 'center', 
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: 140,
  },
  galleryImage: { width: 140, height: 110, resizeMode: 'cover' },
  photoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  photoDate: { fontSize: 9, color: Colors.textSecondary, fontWeight: '700', marginLeft: 4 },
  
  noPhotosBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  noPhotosText: { color: Colors.textSecondary, fontStyle: 'italic', fontSize: 13, marginTop: 6 },
  
  reviewForm: { marginTop: 10 },
  commentInput: { 
    backgroundColor: Colors.card, 
    borderWidth: 1.5, 
    borderColor: Colors.border, 
    borderRadius: 12, 
    padding: 12, 
    fontSize: 14, 
    minHeight: 72, 
    textAlignVertical: 'top', 
    marginBottom: 15, 
    color: Colors.text 
  },
  commentInputFocused: {
    borderColor: Colors.primary,
  },
  reviewActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -6 },
  actionButton: { 
    flex: 1, 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    flexDirection: 'row',
    marginHorizontal: 6 
  },
  rejectButton: { backgroundColor: Colors.accent },
  approveButton: { backgroundColor: Colors.success },
  actionButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15, marginLeft: 6 }
});
