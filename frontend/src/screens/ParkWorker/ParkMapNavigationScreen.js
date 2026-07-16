import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions, ScrollView, Image, PanResponder, Animated, Platform } from 'react-native';
import MapView, { Polygon, Marker, Polyline } from '../../components/MapViewWrapper';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
import Colors from '../../constants/Colors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

function SwipeButton({ onSwipeComplete, title, disabled, color = '#1B5E20' }) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [btnWidth, setBtnWidth] = useState(0);
  const buttonSize = 50;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderMove: (e, gestureState) => {
        const newValue = Math.max(0, Math.min(gestureState.dx, btnWidth - buttonSize));
        pan.x.setValue(newValue);
      },
      onPanResponderRelease: (e, gestureState) => {
        const threshold = (btnWidth - buttonSize) * 0.85;
        if (gestureState.dx >= threshold || pan.x._value >= threshold) {
          Animated.timing(pan.x, {
            toValue: btnWidth - buttonSize,
            duration: 100,
            useNativeDriver: false,
          }).start(() => {
            onSwipeComplete();
            Animated.timing(pan.x, {
              toValue: 0,
              duration: 200,
              useNativeDriver: false,
            }).start();
          });
        } else {
          Animated.spring(pan.x, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View 
      style={[
        styles.swipeContainer, 
        { 
          backgroundColor: disabled ? '#F1F5F9' : `${color}08`, 
          borderColor: disabled ? '#E2E8F0' : `${color}30` 
        }
      ]}
      onLayout={(e) => setBtnWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.swipeHandle,
          {
            transform: [{ translateX: pan.x }],
            backgroundColor: disabled ? '#94A3B8' : color,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="arrow-forward-outline" size={18} color={Colors.white} />
      </Animated.View>
      <Text style={[styles.swipeText, { color: disabled ? '#94A3B8' : Colors.text }]} pointerEvents="none">
        {title}
      </Text>
    </View>
  );
}

export default function ParkMapNavigationScreen({ route, navigation }) {
  const { taskId } = route.params;
  const { user } = useContext(AuthContext);
  const isFocused = useIsFocused();

  const [currentLocation, setCurrentLocation] = useState(null);
  const [liveTask, setLiveTask] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardBoundary, setWardBoundary] = useState(null);
  
  const mapRef = useRef(null);
  const locationSubscription = useRef(null);

  const fetchTaskDetails = async () => {
    try {
      const [tasksRes, photosRes] = await Promise.all([
        api.get('/tasks'),
        api.get(`/tasks/${taskId}/photos`)
      ]);

      const foundTask = (tasksRes.data || []).find(t => t.id === taskId);
      if (foundTask) {
        setLiveTask(foundTask);
      }
      setPhotos(photosRes.data || []);

      // Fetch ward boundary
      try {
        const wardRes = await api.get('/infrastructure/ward-boundary');
        if (wardRes.data && wardRes.data.geom_json) {
          const wardData = wardRes.data;
          wardData.parsedGeom = typeof wardData.geom_json === 'string'
            ? JSON.parse(wardData.geom_json)
            : wardData.geom_json;
          setWardBoundary(wardData);
        }
      } catch (e) {
        console.log('No ward boundary in navigation:', e.message);
      }

    } catch (err) {
      console.error('Fetch task details error:', err);
      Alert.alert('Error', 'Failed to fetch task details.');
    } finally {
      setLoading(false);
    }
  };

  const startLocationTracking = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required.');
        return;
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
        },
        (location) => {
          if (location && location.coords) {
            setCurrentLocation(location.coords);
          }
        }
      );

      const initialLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      if (initialLoc && initialLoc.coords) {
        setCurrentLocation(initialLoc.coords);
      }
    } catch (e) {
      console.error('Location tracking error:', e);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchTaskDetails();
      startLocationTracking();
    }

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [isFocused]);

  // Center map on park point
  useEffect(() => {
    if (liveTask && mapRef.current) {
      const coords = typeof liveTask.area_geojson === 'string' ? JSON.parse(liveTask.area_geojson) : liveTask.area_geojson;
      const pt = coords && coords[0];
      if (pt && pt.latitude && pt.longitude) {
        setTimeout(() => {
          mapRef.current?.animateToRegion({
            latitude: pt.latitude,
            longitude: pt.longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          }, 1000);
        }, 300);
      }
    }
  }, [liveTask]);

  const parkCoordinate = useMemo(() => {
    if (!liveTask) return null;
    const coords = typeof liveTask.area_geojson === 'string' ? JSON.parse(liveTask.area_geojson) : liveTask.area_geojson;
    const pt = coords && coords[0];
    if (pt && pt.latitude && pt.longitude) {
      return { latitude: pt.latitude, longitude: pt.longitude };
    }
    return null;
  }, [liveTask]);

  const handleStartTask = async () => {
    try {
      setLoading(true);
      const lat = currentLocation?.latitude || 17.25;
      const lon = currentLocation?.longitude || 80.15;
      
      const res = await api.post(`/tasks/${taskId}/swipe-status`, {
        type: 'start',
        latitude: lat,
        longitude: lon,
      });

      if (res.data && res.data.success) {
        setLiveTask(prev => ({ ...prev, status: 'in_progress' }));
        Alert.alert('Task Started', 'Park cleaning task has started successfully. Please upload at least 4 photo proofs.');
      }
    } catch (err) {
      console.error('Start task error:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to start task.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async () => {
    try {
      setLoading(true);
      const lat = currentLocation?.latitude || 17.25;
      const lon = currentLocation?.longitude || 80.15;

      const res = await api.post(`/tasks/${taskId}/swipe-status`, {
        type: 'complete',
        latitude: lat,
        longitude: lon,
      });

      if (res.data && res.data.success) {
        setLiveTask(prev => ({ ...prev, status: 'submitted' }));
        Alert.alert('Success', 'Park cleaning photos submitted successfully for review.');
        navigation.navigate('ParkWorkerDashboard');
      }
    } catch (err) {
      console.error('Complete task error:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to complete task.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPhoto = () => {
    navigation.navigate('ParkCapturePhoto', { taskId: liveTask.id });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': 
        return Colors.success || '#10B981'; // Green
      case 'submitted': 
      case 'in_progress': 
        return '#F59E0B'; // Yellow/Amber
      case 'rejected': 
      default: 
        return '#EF4444'; // Red
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'submitted': return 'Submitted';
      case 'rejected': return 'Rejected';
      case 'in_progress': return 'In Progress';
      default: return 'Pending';
    }
  };

  if (!liveTask) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Custom navigation header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-outline" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{liveTask.title}</Text>
          <Text style={styles.headerSubtitle}>Park Cleaning Task</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          mapType="satellite"
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {/* Ward boundary polygon */}
          {wardBoundary && (() => {
            const geom = wardBoundary.parsedGeom;
            if (!geom) return null;
            const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
            return polys.map((poly, idx) => {
              const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
              return (
                <Polygon
                  key={`ward-boundary-nav-${idx}`}
                  coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                  strokeColor="#10B981"
                  fillColor="rgba(16, 185, 129, 0.03)"
                  strokeWidth={2}
                  zIndex={1}
                />
              );
            });
          })()}

          {/* Guide Line from current location to Park */}
          {currentLocation && parkCoordinate && (
            <Polyline
              coordinates={[
                { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                parkCoordinate
              ]}
              strokeColor="#60A5FA"
              strokeWidth={3}
              lineDashPattern={[5, 5]}
              zIndex={5}
            />
          )}

          {/* Park marker */}
          {parkCoordinate && (
            <Marker coordinate={parkCoordinate}>
              <View style={[styles.markerPin, { borderColor: getStatusColor(liveTask.status) }]}>
                <View style={[styles.markerInner, { backgroundColor: getStatusColor(liveTask.status) }]}>
                  <MaterialCommunityIcons name="pine-tree" size={20} color="white" />
                </View>
              </View>
            </Marker>
          )}
        </MapView>
      </View>

      {/* Bottom Panel */}
      <View style={[styles.detailsPanel, Colors.shadowHigh]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* Title & Status */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelTitle}>{liveTask.title}</Text>
              <Text style={styles.panelWard}>📍 {liveTask.ward_name || 'Assigned Ward'}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(liveTask.status) + '15' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(liveTask.status) }]}>
                {getStatusLabel(liveTask.status)}
              </Text>
            </View>
          </View>

          {/* Review Feedback */}
          {liveTask.status === 'rejected' && liveTask.review_comment && (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackTitle}>⚠️ SI Feedback (Rejected):</Text>
              <Text style={styles.feedbackBody}>{liveTask.review_comment}</Text>
            </View>
          )}

          {/* Description */}
          <Text style={styles.description}>{liveTask.description}</Text>

          {/* Photo progress if task is active or finished */}
          {liveTask.status === 'in_progress' && (
            <View style={styles.progressBox}>
              <Text style={styles.progressText}>
                📸 Photos Uploaded: <Text style={{ fontWeight: '800', color: photos.length >= 4 ? Colors.success : '#EF4444' }}>{photos.length} / 4</Text> (Minimum 4 required)
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, (photos.length / 4) * 100)}%`, backgroundColor: photos.length >= 4 ? Colors.success : '#EF4444' }]} />
              </View>
            </View>
          )}

          {/* Photos Thumbnails list if uploaded */}
          {photos.length > 0 && (
            <View style={styles.photosSection}>
              <Text style={styles.photosTitle}>Uploaded Proofs ({photos.length})</Text>
              <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                {photos.map((ph, idx) => (
                  <View key={`nav-photo-${idx}`} style={styles.photoContainer}>
                    <Image source={{ uri: ph.image_url }} style={styles.photoImage} />
                    <View style={styles.photoIndexBadge}>
                      <Text style={styles.photoIndexText}>{idx + 1}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Actions depending on Task state */}
          <View style={styles.actionSection}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              (() => {
                if (liveTask.status === 'pending' || liveTask.status === 'rejected') {
                  return (
                    <View style={styles.swipeButtonWrapper}>
                      <SwipeButton
                        title={liveTask.status === 'rejected' ? 'Swipe to Re-do Task' : 'Swipe to Start Task'}
                        onSwipeComplete={handleStartTask}
                        color={liveTask.status === 'rejected' ? '#EF4444' : Colors.primary}
                      />
                    </View>
                  );
                } else if (liveTask.status === 'in_progress') {
                  return (
                    <View style={styles.inProgressContainer}>
                      <TouchableOpacity style={styles.photoButton} onPress={handleUploadPhoto} activeOpacity={0.8}>
                        <Ionicons name="camera" size={20} color="white" style={{ marginRight: 8 }} />
                        <Text style={styles.photoButtonText}>
                          {photos.length === 0 ? 'Upload First Photo' : 'Upload Next Photo'}
                        </Text>
                      </TouchableOpacity>

                      <View style={[styles.swipeButtonWrapper, { marginTop: 12 }]}>
                        <SwipeButton
                          title={photos.length >= 4 ? 'Swipe to Complete' : 'Need 4 Photos to Complete'}
                          disabled={photos.length < 4}
                          onSwipeComplete={handleCompleteTask}
                          color={Colors.success}
                        />
                      </View>
                    </View>
                  );
                } else if (liveTask.status === 'submitted') {
                  return (
                    <View style={styles.messageBox}>
                      <Ionicons name="hourglass-outline" size={24} color="#D97706" />
                      <Text style={styles.messageText}>Under Review by Sanitary Inspector</Text>
                    </View>
                  );
                } else if (liveTask.status === 'approved') {
                  return (
                    <View style={[styles.messageBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                      <Ionicons name="checkmark-circle" size={24} color="#059669" />
                      <Text style={[styles.messageText, { color: '#047857' }]}>Task Approved & Closed</Text>
                    </View>
                  );
                }
              })()
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    height: Platform.OS === 'ios' ? 100 : 80,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
  },
  backButton: {
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  markerInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.43,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  panelWard: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  feedbackBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  feedbackTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
  },
  feedbackBody: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
    lineHeight: 15,
  },
  description: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 14,
  },
  progressBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 14,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  photosSection: {
    marginBottom: 16,
  },
  photosTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  photoScroll: {
    flexDirection: 'row',
  },
  photoContainer: {
    position: 'relative',
    marginRight: 10,
  },
  photoImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  photoIndexBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndexText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '800',
  },
  actionSection: {
    marginTop: 10,
    alignItems: 'center',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: '100%',
  },
  photoButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  swipeButtonWrapper: {
    width: '100%',
  },
  inProgressContainer: {
    width: '100%',
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
  },
  messageText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
    marginLeft: 10,
  },

  /* SwipeButton internal styling (to ensure it aligns with standard app layout) */
  swipeContainer: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 10,
  },
  swipeHandle: {
    position: 'absolute',
    left: 2,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  swipeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
