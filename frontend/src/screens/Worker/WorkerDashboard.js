import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Dimensions, Alert } from 'react-native';
import MapView, { Polygon, Polyline, Marker, Geojson } from '../../components/MapViewWrapper';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function WorkerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardBoundary, setWardBoundary] = useState(null);
  const [infrastructure, setInfrastructure] = useState([]);
  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const isFocused = useIsFocused();
  const { logout, user, updateUserMachine } = useContext(AuthContext);
  const mapRef = useRef(null);

  const fetchData = async () => {
    if (tasks.length === 0) {
      setLoading(true);
    }
    try {
      Location.requestForegroundPermissionsAsync().catch(locErr => {
        console.log('Location permission request failed:', locErr);
      });

      const [tasksRes, machinesRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/machines')
      ]);
      
      const tasksData = tasksRes.data || [];
      setTasks(tasksData);
      setMachines(machinesRes.data || []);

      // Calculate task-based bounding box center as a fallback
      let computedRegion = null;
      if (tasksData.length > 0) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        let hasCoords = false;

        tasksData.forEach(task => {
          const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
          if (Array.isArray(coords)) {
            coords.forEach(pt => {
              if (pt && pt.latitude && pt.longitude) {
                hasCoords = true;
                if (pt.latitude < minLat) minLat = pt.latitude;
                if (pt.latitude > maxLat) maxLat = pt.latitude;
                if (pt.longitude < minLng) minLng = pt.longitude;
                if (pt.longitude > maxLng) maxLng = pt.longitude;
              }
            });
          }
        });

        if (hasCoords) {
          computedRegion = {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.3),
            longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.3),
          };
        }
      }

      // Fetch the ward boundary and infrastructure once on mount/refresh if not already loaded
      if (infrastructure.length === 0) {
        try {
          const [wardRes, infraRes] = await Promise.all([
            api.get('/infrastructure/ward-boundary').catch(err => {
              console.log('No ward boundary found (404/error):', err.response?.status || err.message);
              return { data: null };
            }),
            api.get('/infrastructure?limit=1000').catch(err => {
              console.log('Failed to fetch infrastructure:', err.message);
              return { data: [] };
            })
          ]);

          if (wardRes.data && wardRes.data.geom_json) {
            const wardData = wardRes.data;
            try {
              wardData.parsedGeom = typeof wardData.geom_json === 'string'
                ? JSON.parse(wardData.geom_json)
                : wardData.geom_json;
            } catch (e) {
              wardData.parsedGeom = null;
            }
            setWardBoundary(wardData);
            const bbox = wardData.bbox;
            if (bbox) {
              const newRegion = {
                latitude: (bbox.minLat + bbox.maxLat) / 2,
                longitude: (bbox.minLng + bbox.maxLng) / 2,
                latitudeDelta: Math.max(0.015, (bbox.maxLat - bbox.minLat) * 1.2),
                longitudeDelta: Math.max(0.015, (bbox.maxLng - bbox.minLng) * 1.2),
              };
              setRegion(newRegion);
              if (mapRef.current) {
                mapRef.current.animateToRegion(newRegion, 1000);
              }
            }
          } else if (computedRegion) {
            setRegion(computedRegion);
            if (mapRef.current) {
              mapRef.current.animateToRegion(computedRegion, 1000);
            }
          }

          const parsedInfra = (infraRes.data || []).map(item => {
            try {
              item.parsedGeom = item.geom_json
                ? (typeof item.geom_json === 'string' ? JSON.parse(item.geom_json) : item.geom_json)
                : null;
            } catch (e) {
              item.parsedGeom = null;
            }
            return item;
          });
          setInfrastructure(parsedInfra);
        } catch (wardErr) {
          console.warn('Failed to fetch ward boundary or infrastructure', wardErr);
        }
      } else {
        // Just animate to computed region if ward boundary wasn't previously loaded but computed region exists
        if (!wardBoundary && computedRegion) {
          setRegion(computedRegion);
          if (mapRef.current) {
            mapRef.current.animateToRegion(computedRegion, 1000);
          }
        }
      }
    } catch (error) {
      console.warn('Error fetching data', error);
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return '#2E7D32';
      case 'submitted':
      case 'in_progress':
        return '#FFD600';
      default: return '#D32F2F';
    }
  };

  const getRoadColor = (item) => {
    if (item.type !== 'road') return 'rgba(211,47,47,0.5)';
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    let task = null;
    if (lineId) {
      task = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else {
      task = tasks.find(t => 
        (rdName && t.rd_name === rdName) || 
        (t.title === rdName)
      );
    }

    if (task) {
      if (task.status === 'approved') return '#2E7D32';
      if (task.status === 'submitted' || task.status === 'in_progress') return '#FFD600';
    }
    return '#D32F2F'; // Roads default to red until completed
  };

  const isAssignedRoad = (item) => {
    if (item.type !== 'road') return false;
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    if (lineId) {
      return tasks.some(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else {
      return tasks.some(t => 
        (rdName && t.rd_name === rdName) || 
        (t.title === rdName)
      );
    }
  };

  const roadList = useMemo(() => {
    const roads = [];
    
    infrastructure.forEach(item => {
      const geom = item.parsedGeom;
      if (!geom) return;
      if (item.type !== 'road') return;
      if (geom.type !== 'LineString' && geom.type !== 'MultiLineString') return;
      
      if (user?.email === 'jawan_61') {
        if (!isAssignedRoad(item)) return;
      }
      
      const props = item.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const rdName = props.Rd_Name || props.rd_name || item.name;
      
      let status = 'pending';
      let task = null;
      if (lineId) {
        task = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
      } else {
        task = tasks.find(t => (rdName && t.rd_name === rdName) || (t.title === rdName));
      }
      if (task) status = task.status;
      
      let roadColor = '#D32F2F'; // Red (Pending)
      if (status === 'approved') {
        roadColor = '#2E7D32'; // Green (Completed)
      } else if (status === 'submitted' || status === 'in_progress') {
        roadColor = '#FFD600'; // Yellow (Active)
      }
      
      roads.push({
        id: item.id,
        geom,
        color: roadColor,
        item,
        task
      });
    });
    
    return roads;
  }, [infrastructure, tasks, user]);

  const nonRoadFeatures = useMemo(() => {
    return infrastructure.filter(item => item.type !== 'road');
  }, [infrastructure]);

  const getDistanceToSegment = (x, y, x1, y1, x2, y2) => {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.hypot(dx, dy);
  };

  const handleRoadPress = (item) => {
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    let task = null;
    if (lineId) {
      task = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else {
      task = tasks.find(t => 
        (rdName && t.rd_name === rdName) || 
        (t.title === rdName)
      );
    }

    if (task) {
      navigation.navigate('MapNavigation', { task });
    } else {
      Alert.alert("No Task", "This road is not currently assigned to you.");
    }
  };

  const handleMapPress = (coord) => {
    if (!coord) return;
    const { latitude, longitude } = coord;

    let closestRoad = null;
    let minDistance = Infinity;

    infrastructure.forEach(item => {
      if (item.type !== 'road') return;
      const geom = item.parsedGeom;
      if (!geom) return;
      
      const coordsList = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;

      coordsList.forEach(cList => {
        for (let i = 0; i < cList.length - 1; i++) {
          const dist = getDistanceToSegment(
            longitude, latitude,
            cList[i][0], cList[i][1],
            cList[i+1][0], cList[i+1][1]
          );
          if (dist < minDistance) {
            minDistance = dist;
            closestRoad = item;
          }
        }
      });
    });

    // 0.00045 degrees threshold is roughly 50 meters
    if (closestRoad && minDistance < 0.00045) {
      handleRoadPress(closestRoad);
    }
  };

  const onRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
  };

  const renderTask = ({ item }) => (
    <View style={styles.taskCard}>
      <TouchableOpacity
        onPress={() => navigation.navigate('MapNavigation', { task: item })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>

        {/* Render Ward, Line ID, and Road Name if they exist */}
        {(item.line_id || item.rd_name || item.ward_name) ? (
          <View style={styles.metaRow}>
            {item.ward_name ? <Text style={styles.metaText}>📍 Ward: {item.ward_name}</Text> : null}
            {item.line_id ? <Text style={styles.metaText}>🔗 Line ID: {item.line_id}</Text> : null}
            {item.rd_name ? <Text style={styles.metaText}>🛣️ Road Name: {item.rd_name}</Text> : null}
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.locationLabel}>📍 Tap to Navigate</Text>
          <Text style={styles.viewDetails}>Open Task →</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.titleSection}>
        <View>
          <Text style={styles.headerTitle}>Welcome, {user?.name}</Text>
          <Text style={styles.subText}>{wardBoundary?.wardName ? wardBoundary.wardName : (user?.ward_id ? `Ward ${user.ward_id}` : 'Unassigned')}</Text>
        </View>
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
          ref={mapRef}
          style={styles.map}
          mapType="satellite"
          initialRegion={region}
          onPress={(e) => handleMapPress(e.nativeEvent.coordinate)}
          showsUserLocation={true}
        >
          {/* Ward Boundary (Explicit Layer) */}
          {wardBoundary && user?.email !== 'jawan_61' && (() => {
             const geom = wardBoundary.parsedGeom;
             if (!geom) return null;
             const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
             return polys.map((poly, idx) => {
                const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
                return (
                  <Polygon
                    key={`ward-boundary-${wardBoundary.id}-${idx}`}
                    coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                    fillColor="rgba(255, 255, 255, 0.03)"
                    strokeColor="#FFFFFF"
                    strokeWidth={2}
                    zIndex={10}
                  />
                );
             });
          })()}

          {/* Grouped QGIS Infrastructure Roads */}
          {roadList.map(({ id, geom, color, item, task }) => {
             const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
             return coords.map((cList, idx) => (
               <Polyline
                 key={`road-${id}-${idx}`}
                 coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
                 strokeColor={color}
                 strokeWidth={task ? 4 : 2}
                 tappable={true}
                 onPress={() => handleRoadPress(item)}
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
                      strokeColor = "#FFFFFF";
                      strokeWidth = 2;
                      lineDash = null;
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
  taskDesc: { color: Colors.textSecondary, marginBottom: 8, fontSize: 13, lineHeight: 18 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
    marginTop: -2,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginRight: 10,
    marginBottom: 4,
  },
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
  machineNameActive: { color: '#2E7D32', fontWeight: 'bold' },
  subText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 }
});
