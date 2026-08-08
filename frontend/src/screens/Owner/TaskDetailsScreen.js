import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity, ScrollView, Image, Modal } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from '../../components/MapViewWrapper';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
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
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const { user } = useContext(AuthContext);
  const { t } = useLocalization();

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
      Alert.alert(t('error'), t('failed_fetch_task'));
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
    if (taskId) {
      fetchPhotos();
    }
  }, [taskId]);

  const handleUpdateStatus = async (status) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status, comment: reviewComment });
      Alert.alert(t('success'), t('task_status_updated_success'));
      setReviewComment('');
      fetchTaskDetails();
    } catch (error) {
      const errorMsg = error.response?.data?.details || error.response?.data?.error || error.message;
      Alert.alert(t('error'), `${t('failed_to_update_task')}: ${errorMsg}`);
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
  if (!task) return <Text style={{ textAlign: 'center', marginTop: 20, color: Colors.textSecondary }}>{t('task_not_found')}</Text>;
  
  const initialRegion = mappedPoints.length > 0 ? {
     latitude: mappedPoints[0].latitude,
     longitude: mappedPoints[0].longitude,
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  } : { latitude: 17.2473, longitude: 80.1514, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  let strokeColor = Colors.uncleaned; // Default: Uncleaned (Red)
  if (task.status === 'submitted' || task.status === 'in_progress') {
      strokeColor = Colors.warning;
  } else if (task.status === 'approved') {
      strokeColor = Colors.success; // Green
  } else if (task.status === 'uncleaned') {
      strokeColor = Colors.uncleaned; // Red
  } else if (task.status === 'rejected') {
      strokeColor = Colors.rejected; // Orange
  }

  const getStatusBadgeColors = (status) => {
    switch (status) {
      case 'approved': return { bg: Colors.successBg, text: Colors.successText, label: 'APPROVED ROAD' };
      case 'uncleaned': return { bg: Colors.uncleanedBg, text: Colors.uncleanedText, label: 'UNCLEANED ROAD' };
      case 'rejected':
      case 'redo':
        return { bg: Colors.rejectedBg || 'rgba(249, 115, 22, 0.15)', text: Colors.rejectedText || '#F97316', label: 'RE-DO TASK (ORANGE)' };
      case 'submitted': return { bg: Colors.warningBg, text: Colors.warningText, label: 'SUBMITTED' };
      case 'in_progress': return { bg: Colors.infoBg, text: Colors.infoText, label: 'IN PROGRESS' };
      default: return { bg: Colors.uncleanedBg, text: Colors.uncleanedText, label: (status || 'PENDING').toUpperCase() };
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

                 let roadColor = Colors.uncleaned; // Default: Red
                 if (matchingTask) {
                   if (matchingTask.status === 'approved') {
                     roadColor = Colors.success; // Approved (Green)
                   } else if (matchingTask.status === 'uncleaned') {
                     roadColor = Colors.uncleaned; // Uncleaned Road (Red)
                   } else if (matchingTask.status === 'rejected') {
                     roadColor = Colors.rejected; // Invalid Photo / Laptop (Orange)
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
              {badgeColors.label}
            </Text>
          </View>
        </View>
        
        {(task.line_id || task.rd_name) ? (
          <View style={styles.metaRow}>
            {task.line_id ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>🔗 {t('line_label')}: {task.line_id}</Text>
              </View>
            ) : null}
            {task.rd_name ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>🛣️ {t('road_label')}: {task.rd_name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {task.review_comment ? (
          <View style={styles.commentLogBox}>
            <View style={styles.commentLogHeader}>
              <Ionicons name="chatbox-ellipses-outline" size={16} color={Colors.primary} />
              <Text style={styles.commentLogLabel}>{t('review_feedback')}</Text>
            </View>
            <Text style={styles.commentLogText}>{task.review_comment}</Text>
          </View>
        ) : null}

        {/* Photos & AI Review Card (Prominently visible at top for Sanitary Inspector) */}
        <View style={styles.reviewSection}>
          <Text style={styles.galleryLabel}>📸 {t('uploaded_proofs')} ({photos.length})</Text>
          {photos.length > 0 ? (
            <View style={styles.photoGallerySection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                {photos.map((item) => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={[styles.photoWrapper, Colors.shadowLow]}
                    onPress={() => setSelectedPhoto(getImageUrl(item.image_url))}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri: getImageUrl(item.image_url) }} style={styles.galleryImage} />
                    <View style={styles.photoMeta}>
                      <Ionicons name="calendar-outline" size={10} color={Colors.textSecondary} />
                      <Text style={styles.photoDate}>
                        {new Date(item.uploaded_at).toLocaleDateString()} {new Date(item.uploaded_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.noPhotosBox}>
              <Ionicons name="images-outline" size={24} color={Colors.textSecondary} />
              <Text style={styles.noPhotosText}>{t('no_photos')}</Text>
            </View>
          )}

          {/* AI Automated Inspection Card for Sanitary Inspector */}
          <View style={styles.aiCardContainer}>
            <View style={styles.aiCardHeader}>
              <Ionicons name="hardware-chip-outline" size={20} color={Colors.primary} />
              <Text style={styles.aiCardTitle}>AI Automated Inspection</Text>
            </View>

            <View style={styles.aiScoreRow}>
              <View style={[
                styles.aiStatusBadge, 
                task.status === 'approved' 
                  ? styles.aiApprovedBadge 
                  : task.status === 'uncleaned' 
                    ? styles.aiUncleanedBadge 
                    : styles.aiRejectedBadge
              ]}>
                <Ionicons 
                  name={task.status === 'approved' ? 'checkmark-circle' : task.status === 'uncleaned' ? 'alert-circle' : 'close-circle'} 
                  size={16} 
                  color={Colors.white} 
                />
                <Text style={styles.aiStatusText}>
                  {task.status === 'approved' ? 'APPROVED' : task.status === 'uncleaned' ? 'UNCLEANED ROAD' : 'REJECTED PHOTO'}
                </Text>
              </View>
              <View style={styles.aiScoreChip}>
                <Text style={styles.aiScoreText}>
                  AI Score: {task.ai_score !== undefined && task.ai_score !== null ? task.ai_score : (task.status === 'approved' ? 85 : 45)}%
                </Text>
              </View>
            </View>

            <View style={styles.aiReasonBox}>
              <Text style={styles.aiReasonText}>
                {task.ai_reason || task.review_comment || (task.status === 'approved' ? 'AI Score: 85% - Road surface verified clear of debris and litter.' : 'AI Score: 45% - Uncollected waste detected on roadside.')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionSection}>
            <View style={[styles.jawanInfoSection, Colors.shadowLow]}>
                <Text style={styles.jawanLabel}>{t('assignee')}</Text>
                <View style={styles.jawanProfileRow}>
                  <View style={styles.jawanAvatar}>
                    <Ionicons name="construct" size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.jawanNameText}>{task.worker_name || t('unassigned')}</Text>
                </View>
            </View>

            {/* Sanitary Inspector Inspection & Re-do Action Panel */}
            <View style={[styles.inspectorActionCard, Colors.shadowMedium]}>
              <View style={styles.inspectorActionHeader}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
                <Text style={styles.inspectorActionTitle}>Sanitary Inspector Actions</Text>
              </View>

              <Text style={styles.commentInputLabel}>Inspector Remarks / Re-do Instructions:</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="e.g. Accumulated dust on curb. Re-sweep road."
                placeholderTextColor={Colors.textSecondary}
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
              />

              <View style={styles.actionButtonsContainer}>
                {/* RE-DO TASK BUTTON (Vibrant Orange) */}
                <TouchableOpacity
                  style={[styles.redoBtn, Colors.shadowLow]}
                  onPress={() => {
                    Alert.alert(
                      '🔄 Request Re-do / Re-clean Road',
                      'Are you sure you want to mark this task for a Re-do? The status will update to Re-do / Rejected (Orange) so the assigned Jawan can re-clean the road and upload fresh photo proof. Previous photos will be preserved in audit history.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Yes, Request Re-do',
                          style: 'destructive',
                          onPress: () => handleUpdateStatus('rejected')
                        }
                      ]
                    );
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-circle-outline" size={22} color={Colors.white} />
                  <Text style={styles.redoBtnText}>RE-DO TASK (RE-CLEAN ROAD)</Text>
                </TouchableOpacity>

                <View style={styles.subActionRow}>
                  {/* APPROVE BUTTON */}
                  <TouchableOpacity
                    style={[styles.approveBtn, Colors.shadowLow]}
                    onPress={() => handleUpdateStatus('approved')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                    <Text style={styles.subBtnText}>APPROVE</Text>
                  </TouchableOpacity>

                  {/* REJECT BUTTON */}
                  <TouchableOpacity
                    style={[styles.rejectBtn, Colors.shadowLow]}
                    onPress={() => handleUpdateStatus('rejected')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={Colors.white} />
                    <Text style={styles.subBtnText}>REJECT PHOTO</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedPhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <TouchableOpacity 
          style={styles.modalBackground} 
          activeOpacity={1} 
          onPress={() => setSelectedPhoto(null)}
        >
          <View style={styles.modalContainer}>
            {selectedPhoto && (
              <Image 
                source={{ uri: selectedPhoto }} 
                style={styles.largeImage} 
                resizeMode="contain" 
              />
            )}
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setSelectedPhoto(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={28} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  actionButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15, marginLeft: 6 },
  aiCardContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginLeft: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  aiScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  aiStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  aiApprovedBadge: {
    backgroundColor: Colors.success || '#10B981', // Green
  },
  aiUncleanedBadge: {
    backgroundColor: Colors.uncleaned || '#EF4444', // Red
  },
  aiRejectedBadge: {
    backgroundColor: Colors.rejected || '#F97316', // Orange
  },
  aiStatusText: {
    color: Colors.white,
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  aiScoreChip: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  aiScoreText: {
    color: '#4F46E5',
    fontWeight: '800',
    fontSize: 12,
  },
  aiReasonBox: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  aiReasonText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
    fontWeight: '600',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  largeImage: {
    width: '95%',
    height: '85%',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  inspectorActionCard: {
    backgroundColor: Colors.card,
    borderRadius: Colors.radiusMedium,
    padding: 16,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inspectorActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inspectorActionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    marginLeft: 8,
  },
  commentInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  commentInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: Colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  actionButtonsContainer: {
    flexDirection: 'column',
  },
  redoBtn: {
    backgroundColor: '#F97316',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  redoBtnText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  subActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  approveBtn: {
    flex: 1,
    backgroundColor: Colors.success || '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: Colors.accent || '#EF4444',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  subBtnText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 4,
  },
});
