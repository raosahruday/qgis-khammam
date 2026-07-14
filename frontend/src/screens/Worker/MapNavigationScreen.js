import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions, Linking, Platform, PanResponder, Animated } from 'react-native';
import MapView, { Polygon, Polyline, Marker, Geojson } from '../../components/MapViewWrapper';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
import Colors from '../../constants/Colors';

function SwipeButton({ onSwipeComplete, title, disabled, color = '#3F51B5' }) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [width, setWidth] = useState(0);
  const buttonWidth = 42;

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
        { backgroundColor: disabled ? '#F5F5F5' : `${color}15`, borderColor: disabled ? '#E0E0E0' : color }
      ]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.swipeHandle,
          {
            transform: [{ translateX: pan.x }],
            backgroundColor: disabled ? '#BDBDBD' : color,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.swipeHandleText}>➔</Text>
      </Animated.View>
      <Text style={[styles.swipeText, { color: disabled ? '#9E9E9E' : '#333' }]} pointerEvents="none">
        {title}
      </Text>
    </View>
  );
}

export default function MapNavigationScreen({ route, navigation }) {
  const { task } = route.params;
  const { user } = useContext(AuthContext);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [liveTask, setLiveTask] = useState(task);
  const [tasks, setTasks] = useState([]);
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

      const isAssigned = tasks.some(t => {
        if (lineId && t.line_id) {
          return t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase();
        }
        return (rdName && t.rd_name === rdName) || (t.title === rdName);
      }) || (liveTask && (
        (lineId && liveTask.line_id === lineId) ||
        (rdName && liveTask.rd_name === rdName)
      ));

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

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && mappedPoints.length > 0) {
      setTimeout(() => {
        mapRef.current.fitToCoordinates(mappedPoints, {
          edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
          animated: true,
        });
      }, 500);
    }
  }, [mappedPoints.length]);

  const fetchLatestTask = async () => {
    // 1. Fetch live task details in background
    api.get(`/tasks/${task.id}`)
      .then(res => {
        setLiveTask(res.data);
      })
      .catch(err => console.error('Failed to refresh live task details', err));

    // 2. Fetch all worker tasks status in background
    api.get('/tasks')
      .then(res => {
        setTasks(res.data || []);
      })
      .catch(err => console.error('Failed to refresh tasks status list', err));

    // 3. Fetch background infrastructure ward roads in background (takes the longest)
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
  };

  const startLocationTracking = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required.');
        return;
      }

      // 1. Get last known location immediately
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

      // 3. Get fresh current location in the background
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

    // Simplified: Find the nearest point in the polyline that hasn't been reached yet
    let nearestIndex = liveTask.last_point_reached || 0;
    
    // Check points after the current last_point_reached
    for (let i = nearestIndex + 1; i < points.length; i++) {
        const p = points[i];
        const dist = getDist(lat, lon, parseFloat(p.latitude), parseFloat(p.longitude));
        if (dist < 30) { // Within 30 meters of a path node
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
      // Update local state to reflect progress immediately
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
    if (item.type !== 'road') return 'rgba(211,47,47,0.5)';
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    let matchingTask = null;
    if (lineId) {
      matchingTask = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else {
      matchingTask = tasks.find(t => 
        (rdName && t.rd_name === rdName) || 
        (t.title === rdName)
      );
    }

    if (matchingTask) {
      if (matchingTask.status === 'approved') return '#2E7D32';
      if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') return '#FFD600';
    }

    if (liveTask && (
      (lineId && liveTask.line_id === lineId) || 
      (rdName && liveTask.rd_name === rdName)
    )) {
      if (liveTask.status === 'approved') return '#2E7D32';
      if (liveTask.status === 'submitted' || liveTask.status === 'in_progress') return '#FFD600';
    }
    return '#D32F2F';
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text>Initializing Navigation...</Text>
      </View>
    );
  }

  
  
  // Split points for live color conversion
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
      Alert.alert('Error', 'No road coordinates available.');
      return;
    }

    let loc = currentLocation;
    if (type === 'start') {
      if (!loc) {
        // 1. Try to get cached location on-demand
        try {
          const lastLoc = await Location.getLastKnownPositionAsync({});
          if (lastLoc && lastLoc.coords) {
            loc = lastLoc.coords;
            setCurrentLocation(lastLoc.coords);
          }
        } catch (e) {}
      }

      if (!loc) {
        // 2. Try to get fresh location on-demand with balanced accuracy and 3s timeout
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
          'GPS Lock Required',
          'Could not determine your location. Please check your GPS settings and wait for a location lock to start the task.'
        );
        return;
      }

      const targetPoint = mappedPoints[0];
      const dist = getDist(
        loc.latitude,
        loc.longitude,
        targetPoint.latitude,
        targetPoint.longitude
      );

      if (dist > 150) {
        Alert.alert(
          'Too Far Away!',
          `You are currently ${Math.round(dist)}m away from the Start Point of the road. You must be within 150 meters to start.`
        );
        return;
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
        Alert.alert('Success', `Task successfully ${type === 'start' ? 'started!' : 'submitted for approval!'}`);
        setLiveTask(prev => ({ ...prev, status: res.data.status }));
      }
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Failed to update task status.';
      Alert.alert('Error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToStart = () => {
    if (mappedPoints.length === 0) return;
    const startPoint = mappedPoints[0];
    const lat = startPoint.latitude;
    const lon = startPoint.longitude;
    
    // Construct Google Maps URL (works on both Android and iOS if app installed)
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
    
    // Fallback for iOS Apple Maps
    const appleUrl = `http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(appleUrl);
      }
    }).catch(err => {
      Alert.alert('Error', 'Could not open maps application.');
      console.error(err);
    });
  };

  const geom = liveTask.geom_json ? (typeof liveTask.geom_json === 'string' ? JSON.parse(liveTask.geom_json) : liveTask.geom_json) : null;
  const isArea = geom ? (geom.type === 'Polygon' || geom.type === 'MultiPolygon') : (liveTask.task_type === 'area');

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
                liveTask.status === 'approved' ? 'rgba(46, 125, 50, 0.25)' :
                liveTask.status === 'submitted' ? 'rgba(255, 214, 0, 0.25)' :
                'rgba(211, 47, 47, 0.25)'
              } 
              strokeColor={
                liveTask.status === 'approved' ? '#2E7D32' :
                liveTask.status === 'submitted' ? '#FFD600' :
                '#D32F2F'
              }
              strokeWidth={2}
              zIndex={20}
            />
         )}

          {!isArea && mappedPoints.length > 0 && (
            <Polyline 
              key={`task-line-${liveTask.id}`}
              coordinates={mappedPoints} 
              strokeColor={
                liveTask.status === 'approved' ? '#2E7D32' :
                liveTask.status === 'submitted' ? '#FFD600' :
                '#D32F2F'
              } 
              strokeWidth={3.5} 
              zIndex={20} 
            />
         )}

         {mappedPoints.length > 0 && (
            <Marker 
              key="start-pin"
              coordinate={mappedPoints[0]} 
              title="Start Point" 
              description="Start cleaning here"
              pinColor="red" 
              zIndex={22} 
            />
         )}

         {mappedPoints.length > 0 && (
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

      <View style={styles.footer}>
        <View style={styles.infoRow}>
           <View style={{ flex: 1 }}>
             <Text style={styles.title}>{liveTask.title}</Text>
             {liveTask.line_id ? <Text style={styles.metaText}>🔗 Line ID: {liveTask.line_id}</Text> : null}
             {liveTask.rd_name ? <Text style={styles.metaText}>🛣️ Road Name: {liveTask.rd_name}</Text> : null}
             <Text style={styles.ward}>{liveTask.ward_name || 'Ward Area'}</Text>
           </View>
           <View style={[styles.badge, { backgroundColor: liveTask.status === 'in_progress' ? '#FFC107' : '#E0E0E0' }]}>
             <Text style={styles.badgeText}>{liveTask.status.replace('_', ' ').toUpperCase()}</Text>
           </View>
        </View>

        {liveTask.status === 'pending' && (
           <>
             <TouchableOpacity style={[styles.qrBtn, { backgroundColor: '#FF5722', marginBottom: 10 }]} onPress={handleNavigateToStart}>
                <Text style={styles.btnText}>📍 Navigate to Start Point</Text>
             </TouchableOpacity>
             <SwipeButton 
                title="Swipe to Start Task"
                color="#3F51B5"
                onSwipeComplete={() => handleSwipeStatus('start')}
              />
           </>
        )}

        {liveTask.status === 'in_progress' && (
           <>
             <TouchableOpacity style={[styles.qrBtn, { backgroundColor: '#FF5722', marginBottom: 10 }]} onPress={handleNavigateToStart}>
                <Text style={styles.btnText}>📍 Re-Navigate to Start</Text>
             </TouchableOpacity>
                           <SwipeButton 
                title="Swipe to Complete Task"
                color="#009688"
                onSwipeComplete={() => handleSwipeStatus('complete')}
              />
             <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#007bff', marginTop: 10 }]} onPress={() => navigation.navigate('CapturePhoto', { task: liveTask })}>
                <Text style={styles.btnText}>📷 Upload Photo Proof</Text>
             </TouchableOpacity>
           </>
        )}

        {liveTask.status === 'submitted' && (
           <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CapturePhoto', { task: liveTask })}>
              <Text style={styles.btnText}>Capture Final Proof for Supervisor</Text>
           </TouchableOpacity>
        )}
        
        {liveTask.status === 'approved' && (
           <View style={styles.approvedBox}>
              <Text style={styles.approvedText}>✅ Task Completed & Approved</Text>
           </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: { 
    paddingHorizontal: 15, 
    paddingTop: 10, 
    paddingBottom: Platform.OS === 'ios' ? 30 : 50, 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: -2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    elevation: 5 
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  metaText: { fontSize: 11, color: '#666', marginTop: 1, fontWeight: '600' },
  ward: { color: '#666', fontSize: 11 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  qrBtn: { backgroundColor: '#3F51B5', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 6 },
  actionBtn: { backgroundColor: '#28a745', padding: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  approvedBox: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8, alignItems: 'center' },
  approvedText: { color: '#2E7D32', fontWeight: 'bold', fontSize: 13 },
  swipeContainer: {
    height: 42,
    borderRadius: 21,
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
    width: 42,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  swipeHandleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  swipeText: {
    fontSize: 13,
    fontWeight: 'bold',
  }
});
