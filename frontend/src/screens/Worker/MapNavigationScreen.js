import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions, Linking, Platform, PanResponder, Animated } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from '../../components/MapViewWrapper';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

function SwipeButton({ onSwipeComplete, title, disabled, color = '#1B5E20' }) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [width, setWidth] = useState(0);
  const buttonWidth = 50;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderMove: (e, gestureState) => {
        const newValue = Math.max(0, Math.min(gestureState.dx, width - buttonWidth));
        pan.x.setValue(newValue);
      },
      onPanResponderRelease: (e, gestureState) => {
        const threshold = (width - buttonWidth) * 0.85;
        if (gestureState.dx >= threshold || pan.x._value >= threshold) {
          Animated.timing(pan.x, {
            toValue: width - buttonWidth,
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
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
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

export default function MapNavigationScreen({ route, navigation }) {
  const { task } = route.params;
  const { user } = useContext(AuthContext);
  const { t } = useLocalization();
  const [currentLocation, setCurrentLocation] = useState(null);
  const [liveTask, setLiveTask] = useState(task);
  const [tasks, setTasks] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const locationSubscription = useRef(null);
  const mapRef = useRef(null);

  const areaGeojsonStr = useMemo(() => {
    if (!liveTask.area_geojson) return '';
    return typeof liveTask.area_geojson === 'string'
      ? liveTask.area_geojson
      : JSON.stringify(liveTask.area_geojson);
  }, [liveTask.area_geojson]);

  const mappedPoints = useMemo(() => {
    if (!areaGeojsonStr) return [];
    try {
      const points = JSON.parse(areaGeojsonStr) || [];
      return Array.isArray(points) ? points.map(c => ({ latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) })) : [];
    } catch (e) {
      return [];
    }
  }, [areaGeojsonStr]);

  const initialPoints = typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson;
  const [region, setRegion] = useState({
     latitude: (initialPoints && initialPoints.length > 0) ? parseFloat(initialPoints[0].latitude) : 17.2473,
     longitude: (initialPoints && initialPoints.length > 0) ? parseFloat(initialPoints[0].longitude) : 80.1514,
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  });
  const [infrastructure, setInfrastructure] = useState([]);
  const roadFeatures = useMemo(() => {
    const roads = [];
    infrastructure.forEach(item => {
      const geom = item.parsedGeom;
      if (!geom) return;
      if (item.type !== 'road') return;
      if (geom.type !== 'LineString' && geom.type !== 'MultiLineString') return;
      
      const props = item.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const rdName = props.Rd_Name || props.rd_name || item.name;

      const matchesTask = (lineId && tasks.some(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase())) ||
                          (rdName && tasks.some(t => t.rd_name && t.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase()));

      const matchesLive = liveTask && (
        lineId && liveTask.line_id
          ? liveTask.line_id.toString().toLowerCase() === lineId.toString().toLowerCase()
          : rdName && liveTask.rd_name
            ? liveTask.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase()
            : false
      );

      const isAssigned = matchesTask || matchesLive;

      if (!isAssigned) return;

      roads.push({
        id: item.id,
        geom,
        item
      });
    });
    return roads;
  }, [infrastructure, tasks, liveTask]);

  const nonRoadFeatures = useMemo(() => {
    return infrastructure.filter(item => item.type !== 'road');
  }, [infrastructure]);

  useEffect(() => {
    fetchLatestTask();
    startLocationTracking();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchLatestTask();
    });

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (mapRef.current && mappedPoints.length > 0) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.fitToCoordinates(mappedPoints, {
            edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
            animated: true,
          });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mappedPoints.length]);

  const fetchLatestTask = async () => {
    api.get(`/tasks/${task.id}`)
      .then(res => {
        setLiveTask(res.data);
      })
      .catch(err => console.error('Failed to refresh live task details', err));

    api.get('/tasks')
      .then(res => {
        setTasks(res.data || []);
      })
      .catch(err => console.error('Failed to refresh tasks status list', err));

    api.get('/infrastructure?limit=1000')
      .then(res => {
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
      })
      .catch(err => console.error('Failed to fetch infrastructure ward roads', err));

    api.get(`/tasks/${task.id}/photos`)
      .then(res => {
        setPhotos(res.data || []);
      })
      .catch(err => console.error('Failed to fetch task photos', err));
  };

  const startLocationTracking = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error'), t('location_permission_required'));
        return;
      }

      try {
        let lastLoc = await Location.getLastKnownPositionAsync({});
        if (lastLoc && lastLoc.coords) {
          setCurrentLocation(lastLoc.coords);
        }
      } catch (err) {
        console.warn('Error getting last known position:', err);
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
        },
        (location) => {
          if (location && location.coords) {
            setCurrentLocation(location.coords);
            const { latitude, longitude } = location.coords;
            if (user && user.current_machine_id) {
               api.post(`/machines/${user.current_machine_id}/location`, {
                 latitude,
                 longitude
               }).catch(err => console.error('Machine location update failed', err));
            }
            if (liveTask && liveTask.status === 'in_progress') {
               checkAndNotifyProgress(latitude, longitude);
            }
          }
        }
      );

      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      }).then(initialLoc => {
        if (initialLoc && initialLoc.coords) {
          setCurrentLocation(initialLoc.coords);
        }
      }).catch(err => {
        console.warn('Error getting current position in background:', err);
      });

    } catch (e) {
      console.error('Error starting location tracking:', e);
    }
  };

  const checkAndNotifyProgress = async (lat, lon) => {
    const points = typeof liveTask.area_geojson === 'string' ? JSON.parse(liveTask.area_geojson) : liveTask.area_geojson;
    if (!points || points.length === 0) return;

    let nearestIndex = liveTask.last_point_reached || 0;
    
    for (let i = nearestIndex + 1; i < points.length; i++) {
        const p = points[i];
        const dist = getDist(lat, lon, parseFloat(p.latitude), parseFloat(p.longitude));
        if (dist < 30) {
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

  const getRoadColor = (item) => {
    if (item.type !== 'road') return 'rgba(198,40,40,0.5)';
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    let matchingTask = null;
    if (lineId) {
      matchingTask = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else if (rdName) {
      matchingTask = tasks.find(t => t.rd_name && t.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase());
    }

    if (matchingTask) {
      if (matchingTask.status === 'approved') return Colors.success;
      if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') return Colors.warning;
    }

    const matchesLive = liveTask && (
      lineId && liveTask.line_id
        ? liveTask.line_id.toString().toLowerCase() === lineId.toString().toLowerCase()
        : rdName && liveTask.rd_name
          ? liveTask.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase()
          : false
    );

    if (matchesLive) {
      if (liveTask.status === 'approved') return Colors.success;
      if (liveTask.status === 'submitted' || liveTask.status === 'in_progress') return Colors.warning;
    }
    return Colors.accent;
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t('initializing_navigation')}</Text>
      </View>
    );
  }

  const lastReached = liveTask.last_point_reached || 0;
  const completedPath = mappedPoints.slice(0, lastReached + 1);
  const remainingPath = mappedPoints.slice(lastReached);

  const initialRegion = mappedPoints.length > 0 ? {
     latitude: mappedPoints[0].latitude,
     longitude: mappedPoints[0].longitude,
     latitudeDelta: 0.01,
     longitudeDelta: 0.01,
  } : { latitude: 17.2473, longitude: 80.1514, latitudeDelta: 0.02, longitudeDelta: 0.02 };

  const handleSwipeStatus = async (type) => {
    if (mappedPoints.length === 0) {
      Alert.alert(t('error'), t('no_coordinates_alert'));
      return;
    }

    let loc = currentLocation;
    if (type === 'start') {
      if (!loc) {
        try {
          const lastLoc = await Location.getLastKnownPositionAsync({});
          if (lastLoc && lastLoc.coords) {
            loc = lastLoc.coords;
            setCurrentLocation(lastLoc.coords);
          }
        } catch (e) {}
      }

      if (!loc) {
        try {
          const freshLoc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 3000
          });
          if (freshLoc && freshLoc.coords) {
            loc = freshLoc.coords;
            setCurrentLocation(freshLoc.coords);
          }
        } catch (e) {}
      }

      if (!loc) {
        Alert.alert(
          t('gps_lock_required'),
          t('gps_lock_required_msg')
        );
        return;
      }

      const isWard61 = liveTask.ward_name && liveTask.ward_name.includes('61');
      if (!isWard61) {
        const targetPoint = mappedPoints[0];
        const dist = getDist(
          loc.latitude,
          loc.longitude,
          targetPoint.latitude,
          targetPoint.longitude
        );

        if (dist > 150) {
          Alert.alert(
            t('too_far_away'),
            t('te') ? `మీరు ప్రస్తుతం రోడ్డు ప్రారంభ స్థానానికి ${Math.round(dist)}మీటర్ల దూరంలో ఉన్నారు. ప్రారంభించడానికి మీరు 150 మీటర్ల లోపల ఉండాలి.` : `You are currently ${Math.round(dist)}m away from the Start Point of the road. You must be within 150 meters to start.`
          );
          return;
        }
      }
    }

    try {
      setLoading(true);
      const res = await api.post(`/tasks/${liveTask.id}/swipe-status`, {
        type,
        latitude: loc ? loc.latitude : 0,
        longitude: loc ? loc.longitude : 0
      });
      if (res.data.success) {
        Alert.alert(t('success') || 'Success', type === 'start' ? t('task_started') : t('task_submitted_for_approval'));
        setLiveTask(prev => ({ ...prev, status: res.data.status }));
      }
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || t('failed_update_status');
      Alert.alert(t('error'), errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToStart = () => {
    if (mappedPoints.length === 0) return;
    
    const isWard61 = liveTask.ward_name && liveTask.ward_name.includes('61');
    
    if (isWard61) {
      const startPoint = mappedPoints[0];
      const endPoint = mappedPoints[mappedPoints.length - 1];
      let midPoints = mappedPoints.slice(1, -1);
      
      const MAX_WAYPOINTS = 10;
      if (midPoints.length > MAX_WAYPOINTS) {
        const step = Math.floor(midPoints.length / MAX_WAYPOINTS);
        midPoints = midPoints.filter((_, idx) => idx % step === 0).slice(0, MAX_WAYPOINTS);
      }
      
      const waypointsStr = midPoints.map(p => `${p.latitude},${p.longitude}`).join('%7C');
      
      const url = `https://www.google.com/maps/dir/?api=1&origin=${startPoint.latitude},${startPoint.longitude}&destination=${endPoint.latitude},${endPoint.longitude}&waypoints=${waypointsStr}&travelmode=driving`;
      const appleUrl = `http://maps.apple.com/?saddr=${startPoint.latitude},${startPoint.longitude}&daddr=${endPoint.latitude},${endPoint.longitude}`;
      
      Linking.canOpenURL(url).then(supported => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(appleUrl);
        }
      }).catch(err => {
        Alert.alert(t('error'), t('no_maps_app_alert'));
        console.error(err);
      });
    } else {
      const startPoint = mappedPoints[0];
      const lat = startPoint.latitude;
      const lon = startPoint.longitude;
      
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
      const appleUrl = `http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;

      Linking.canOpenURL(url).then(supported => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(appleUrl);
        }
      }).catch(err => {
        Alert.alert(t('error'), t('no_maps_app_alert'));
        console.error(err);
      });
    }
  };

  const geom = liveTask.geom_json ? (typeof liveTask.geom_json === 'string' ? JSON.parse(liveTask.geom_json) : liveTask.geom_json) : null;
  const isArea = geom ? (geom.type === 'Polygon' || geom.type === 'MultiPolygon') : (liveTask.task_type === 'area');

  const getStatusBadgeColors = (status) => {
    switch (status) {
      case 'approved': return { bg: Colors.successBg, text: Colors.successText };
      case 'submitted': return { bg: Colors.warningBg, text: Colors.warningText };
      case 'in_progress': return { bg: Colors.infoBg, text: Colors.infoText };
      default: return { bg: Colors.errorBg, text: Colors.errorText };
    }
  };

  const badgeColors = getStatusBadgeColors(liveTask.status);
  const isWard61 = liveTask.ward_name && liveTask.ward_name.includes('61');

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="satellite"
        initialRegion={initialRegion}
        showsUserLocation={true}
        followsUserLocation={false}
      >
        {/* Grouped QGIS Infrastructure Roads */}
        {roadFeatures.map(({ id, geom, item }) => {
           const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
           const color = getRoadColor(item);
           return coords.map((cList, idx) => (
             <Polyline
               key={`road-${id}-${idx}`}
               coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
               strokeColor={color}
               strokeWidth={2}
               zIndex={11}
             />
           ));
        })}

        {/* Non-road Infrastructure (ROW and Ward Polygons) */}
        {nonRoadFeatures.map(item => {
           const geom = item.parsedGeom;
           if (!geom) return null;
           if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
              const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
              return polys.map((poly, idx) => {
                 const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
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
                 
                 return (
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
           return null;
        })}

        {isArea && mappedPoints.length > 0 && (
          <Polygon 
            key={`task-poly-${liveTask.id}-${mappedPoints.length}`}
            coordinates={mappedPoints} 
            fillColor={
              liveTask.status === 'approved' ? 'rgba(16, 185, 129, 0.25)' :
              (liveTask.status === 'submitted' || liveTask.status === 'in_progress') ? 'rgba(245, 158, 11, 0.25)' :
              'rgba(239, 68, 68, 0.25)'
            } 
            strokeColor={
              liveTask.status === 'approved' ? Colors.success :
              (liveTask.status === 'submitted' || liveTask.status === 'in_progress') ? Colors.warning :
              Colors.accent
            }
            strokeWidth={2.5}
            zIndex={20}
          />
        )}

        {!isArea && mappedPoints.length > 0 && (
          <Polyline 
            key={`task-line-${liveTask.id}`}
            coordinates={mappedPoints} 
            strokeColor={
              liveTask.status === 'approved' ? Colors.success :
              (liveTask.status === 'submitted' || liveTask.status === 'in_progress') ? Colors.warning :
              Colors.accent
            } 
            strokeWidth={4.5} 
            zIndex={20} 
          />
        )}

        {mappedPoints.length > 0 && (
          <Marker 
            key="start-pin"
            coordinate={mappedPoints[0]} 
            title={t('start_point')} 
            description={t('start_cleaning_here')}
            pinColor="red" 
            zIndex={22} 
          />
        )}

        {mappedPoints.length > 0 && (
          <Marker 
            key="end-pin"
            coordinate={mappedPoints[mappedPoints.length - 1]} 
            title={t('end_point')} 
            description={t('end_cleaning_here')}
            pinColor="green" 
            zIndex={22} 
          />
        )}
      </MapView>

      <View style={[styles.footer, Colors.shadowHigh]}>
        <View style={styles.infoRow}>
           <View style={{ flex: 1 }}>
             <Text style={styles.title}>{liveTask.title}</Text>
             <View style={styles.metaBadgeRow}>
               {liveTask.line_id ? (
                 <View style={styles.metaBadge}>
                   <Text style={styles.metaBadgeText}>🔗 {t('line_id') || 'ID'}: {liveTask.line_id}</Text>
                 </View>
               ) : null}
               {liveTask.rd_name ? (
                 <View style={styles.metaBadge}>
                   <Text style={styles.metaBadgeText}>🛣️ {t('road') || 'Road'}: {liveTask.rd_name}</Text>
                 </View>
               ) : null}
               <View style={[styles.metaBadge, { backgroundColor: '#F1F5F9' }]}>
                 <Text style={[styles.metaBadgeText, { color: Colors.textSecondary }]}>
                   📍 {liveTask.ward_name || t('ward_text') || 'Ward Area'}
                 </Text>
               </View>
             </View>
           </View>
           <View style={[styles.statusBadge, { backgroundColor: badgeColors.bg }]}>
             <Text style={[styles.statusText, { color: badgeColors.text }]}>
               {t(liveTask.status.toLowerCase()) || liveTask.status.replace('_', ' ').toUpperCase()}
             </Text>
           </View>
        </View>

        {(liveTask.status === 'pending' || liveTask.status === 'rejected') && (
           <View style={styles.actionContainer}>
             {liveTask.status === 'rejected' && (
                <View style={[styles.statusMessageBox, { backgroundColor: Colors.errorBg, borderColor: Colors.accent, marginBottom: 12, marginTop: 0 }]}>
                   <Ionicons name="alert-circle-outline" size={20} color={Colors.errorText} />
                   <Text style={[styles.statusMessageText, { color: Colors.errorText, flex: 1 }]}>
                      {t('rejected')}: {liveTask.review_comment || t('no_reason_provided')}
                   </Text>
                </View>
             )}
             <TouchableOpacity style={[styles.navBtn, Colors.shadowLow]} onPress={handleNavigateToStart} activeOpacity={0.8}>
                <Ionicons name="location-outline" size={18} color={Colors.white} />
                <Text style={styles.btnText}>{isWard61 ? t('navigate_route') : t('navigate_to_start')}</Text>
             </TouchableOpacity>
             <SwipeButton 
                title={liveTask.status === 'rejected' ? t('swipe_to_redo') : t('swipe_to_start')}
                color={Colors.primary}
                onSwipeComplete={() => handleSwipeStatus('start')}
             />
           </View>
        )}

        {liveTask.status === 'in_progress' && (
           <View style={styles.actionContainer}>
             <TouchableOpacity style={[styles.navBtn, { backgroundColor: '#E2E8F0', borderOpacity: 0.1 }, Colors.shadowLow]} onPress={handleNavigateToStart} activeOpacity={0.8}>
                <Ionicons name="location-outline" size={18} color={Colors.text} />
                <Text style={[styles.btnText, { color: Colors.text }]}>{isWard61 ? t('re_navigate_route') : t('re_navigate_to_start')}</Text>
             </TouchableOpacity>
             
             <View style={styles.actionButtonsRow}>
               <TouchableOpacity 
                 style={[styles.cameraBtn, Colors.shadowLow]} 
                 onPress={() => navigation.navigate('CapturePhoto', { task: liveTask })}
                 activeOpacity={0.8}
               >
                  <Ionicons name="camera-outline" size={18} color={Colors.white} />
                  <Text style={styles.btnText}>{t('photo_proof_btn')}</Text>
               </TouchableOpacity>

               <TouchableOpacity 
                  style={[
                    styles.completeBtn, 
                    photos.length === 0 && styles.completeBtnDisabled,
                    Colors.shadowLow
                   ]}
                  disabled={photos.length === 0}
                  onPress={() => handleSwipeStatus('complete')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                  <Text style={styles.btnText}>
                    {photos.length > 0 ? t('complete_task_btn') : t('locked_need_photo')}
                  </Text>
               </TouchableOpacity>
             </View>
           </View>
        )}

        {liveTask.status === 'submitted' && (
           <View style={[styles.statusMessageBox, { backgroundColor: Colors.warningBg, borderColor: Colors.warning }]}>
              <Ionicons name="time-outline" size={20} color={Colors.warningText} />
              <Text style={[styles.statusMessageText, { color: Colors.warningText }]}>
                {t('submitted_pending_approval')}
              </Text>
           </View>
        )}
        
        {liveTask.status === 'approved' && (
           <View style={[styles.statusMessageBox, { backgroundColor: Colors.successBg, borderColor: Colors.success }]}>
              <Ionicons name="checkmark-done-circle" size={20} color={Colors.successText} />
              <Text style={[styles.statusMessageText, { color: Colors.successText }]}>
                {t('task_approved_excellent')}
              </Text>
           </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { marginTop: 10, color: Colors.textSecondary, fontWeight: '600' },
  footer: { 
    paddingHorizontal: 20, 
    paddingTop: 16, 
    paddingBottom: Platform.OS === 'ios' ? 48 : 42, 
    backgroundColor: Colors.card, 
    borderTopLeftRadius: Colors.radiusLarge, 
    borderTopRightRadius: Colors.radiusLarge, 
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  
  metaBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginHorizontal: -2 },
  metaBadge: { 
    backgroundColor: `${Colors.primary}08`, 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 6, 
    marginHorizontal: 2,
    marginVertical: 2,
    borderWidth: 0.5,
    borderColor: `${Colors.primary}20`,
  },
  metaBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  
  actionContainer: { marginTop: 5 },
  navBtn: { 
    backgroundColor: '#FF6B35', 
    paddingVertical: 12, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 10 
  },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 14, marginLeft: 6 },
  
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cameraBtn: { 
    backgroundColor: Colors.blue, 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginRight: 6 
  },
  completeBtn: { 
    backgroundColor: Colors.success, 
    flex: 1.3, 
    paddingVertical: 12, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginLeft: 6 
  },
  completeBtnDisabled: { 
    backgroundColor: Colors.placeholder, 
  },

  statusMessageBox: { 
    flexDirection: 'row',
    alignItems: 'center', 
    justifyContent: 'center',
    padding: 14, 
    borderRadius: 12, 
    borderWidth: 1,
    marginTop: 5,
  },
  statusMessageText: { fontWeight: '700', fontSize: 13, marginLeft: 8 },

  swipeContainer: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 6,
  },
  swipeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 47,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  swipeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  }
});
