import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions, Alert } from 'react-native';
import MapView, { Polygon, Polyline, Marker } from '../../components/MapViewWrapper';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

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
  const { t } = useLocalization();
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

  const getBadgeStyle = (status) => {
    switch (status) {
      case 'approved':
        return { bg: Colors.successBg, text: Colors.successText };
      case 'submitted':
      case 'in_progress':
        return { bg: Colors.warningBg, text: Colors.warningText };
      default:
        return { bg: Colors.errorBg, text: Colors.errorText };
    }
  };

  const getRoadColor = (item) => {
    if (item.type !== 'road') return 'rgba(198,40,40,0.5)';
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    let task = null;
    if (lineId) {
      task = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else if (rdName) {
      task = tasks.find(t => t.rd_name && t.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase());
    }

    if (task) {
      if (task.status === 'approved') return Colors.success;
      if (task.status === 'submitted' || task.status === 'in_progress') return Colors.warning;
    }
    return Colors.accent; // Default pending (Red)
  };

  const isAssignedRoad = (item) => {
    if (item.type !== 'road') return false;
    const props = item.properties || {};
    const lineId = props.Line_ID || props.line_id;
    const rdName = props.Rd_Name || props.rd_name || item.name;

    if (lineId) {
      return tasks.some(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
    } else if (rdName) {
      return tasks.some(t => t.rd_name && t.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase());
    }
    return false;
  };

  const roadList = useMemo(() => {
    const roads = [];
    
    infrastructure.forEach(item => {
      const geom = item.parsedGeom;
      if (!geom) return;
      if (item.type !== 'road') return;
      if (geom.type !== 'LineString' && geom.type !== 'MultiLineString') return;
      
      if (!isAssignedRoad(item)) return;
      
      const props = item.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const rdName = props.Rd_Name || props.rd_name || item.name;
      
      let status = 'pending';
      let task = null;
      if (lineId) {
        task = tasks.find(t => t.line_id && t.line_id.toString().toLowerCase() === lineId.toString().toLowerCase());
      } else if (rdName) {
        task = tasks.find(t => t.rd_name && t.rd_name.toString().toLowerCase() === rdName.toString().toLowerCase());
      }
      if (task) status = task.status;
      
      let roadColor = Colors.accent; // Red (Pending)
      if (status === 'approved') {
        roadColor = Colors.success; // Emerald Green (Completed)
      } else if (status === 'submitted' || status === 'in_progress') {
        roadColor = Colors.warning; // Amber (Active)
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
      Alert.alert(t('no_task_assigned_alert_title'), t('no_task_assigned_alert_body'));
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

  const getUserInitials = (name) => {
    if (!name) return 'JW';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const renderTask = ({ item }) => {
    const badge = getBadgeStyle(item.status);
    return (
      <View style={[styles.taskCard, Colors.shadowLow]}>
        <TouchableOpacity
          onPress={() => navigation.navigate('MapNavigation', { task: item })}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.taskTitle}>{item.title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusText, { color: badge.text }]}>
                {t(item.status.toLowerCase()) || item.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>

          {(item.line_id || item.rd_name || item.ward_name) ? (
            <View style={styles.metaRow}>
              {item.ward_name ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>📍 {t('ward_text') || 'Ward'}: {item.ward_name}</Text>
                </View>
              ) : null}
              {item.line_id ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>🔗 {t('line_id') || 'Line ID'}: {item.line_id}</Text>
                </View>
              ) : null}
              {item.rd_name ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>🛣️ {t('road') || 'Road'}: {item.rd_name}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={styles.actionPrompt}>
              <Ionicons name="navigate-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.locationLabel}>{t('tap_to_navigate')}</Text>
            </View>
            <Text style={styles.viewDetails}>{t('open_task')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header small={true} />
      
      <View style={[styles.titleSection, Colors.shadowLow]}>
        <View style={styles.profileRow}>
          <View style={styles.profileText}>
            <Text style={styles.headerTitle}>{t('welcome')}, {user?.name}</Text>
            <Text style={styles.subText}>
              👷 {t('jawan')} • {wardBoundary?.wardName ? wardBoundary.wardName : (user?.ward_id ? `${t('ward_text')} ${user.ward_id}` : 'Ward Area')}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <View style={[styles.mapWrapper, Colors.shadowMedium]}>
          <MapView
            ref={mapRef}
            style={styles.map}
            mapType="satellite"
            initialRegion={region}
            onPress={(e) => handleMapPress(e.nativeEvent.coordinate)}
            showsUserLocation={true}
          >
            {/* Ward Boundary (Explicit Layer) */}
            {wardBoundary && user?.email !== 'jawan_61' && user?.email !== 'jawan_highway' && user?.email !== 'jawan_highway@test.com' && (() => {
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
            {roadList.map(({ id, geom, color, item, task }) => (
               <MemoizedRoad
                 key={`road-${id}`}
                 geom={geom}
                 color={color}
                 strokeWidth={task ? 4 : 2}
                 onPress={() => handleRoadPress(item)}
               />
            ))}

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
                     
                     if (item.type === 'row') {
                        fillColor = "rgba(255, 152, 0, 0.15)";
                        strokeColor = "rgba(255, 152, 0, 0.6)";
                        strokeWidth = 1.5;
                     } else if (item.type === 'ward') {
                        fillColor = "rgba(255, 255, 255, 0.03)";
                        strokeColor = "#FFFFFF";
                        strokeWidth = 2;
                     }
                     
                     return (
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
               return null;
            })}
          </MapView>
          
          <View style={styles.legend}>
             <View style={styles.legendItem}>
               <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
               <Text style={styles.legendText}>{t('cleaned')}</Text>
             </View>
             <View style={styles.legendItem}>
               <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
               <Text style={styles.legendText}>{t('active')}</Text>
             </View>
             <View style={styles.legendItem}>
               <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
               <Text style={styles.legendText}>{t('pending')}</Text>
             </View>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.subHeader}>{t('assigned_cleaning_tasks')}</Text>
        <View style={styles.badgeCount}>
          <Text style={styles.badgeCountText}>{tasks.length}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTask}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="clipboard-outline" size={40} color={Colors.textSecondary} />
              </View>
              <Text style={styles.emptyText}>{t('no_tasks')}</Text>
              <Text style={styles.emptySubtext}>{t('contact_supervisor')}</Text>
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
    paddingVertical: 12, 
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
  },
  avatarText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  profileText: { justifyContent: 'center', flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  subText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  logoutButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 6, 
    paddingHorizontal: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: `${Colors.accent}30`,
    backgroundColor: `${Colors.accent}08`,
    flexShrink: 0
  },
  logoutText: { color: Colors.accent, fontWeight: '700', fontSize: 11, marginLeft: 4 },
  
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 10,
  },
  subHeader: { fontSize: 15, fontWeight: '800', color: Colors.text, marginRight: 8, letterSpacing: -0.2 },
  badgeCount: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCountText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },

  listContainer: { paddingBottom: 30, paddingHorizontal: 5 },
  taskCard: { 
    backgroundColor: Colors.card, 
    padding: 16, 
    marginHorizontal: 15, 
    marginBottom: 12, 
    borderRadius: Colors.radiusMedium, 
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  taskTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1, marginRight: 10, lineHeight: 20, letterSpacing: -0.1 },
  taskDesc: { color: Colors.textSecondary, marginBottom: 12, fontSize: 13, lineHeight: 18 },
  
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    marginHorizontal: -3,
  },
  metaChip: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: 3,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
  },

  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  cardFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderTopWidth: 1, 
    borderTopColor: Colors.border, 
    paddingTop: 12,
    marginTop: 4,
  },
  actionPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationLabel: { color: Colors.primary, fontSize: 13, fontWeight: '700', marginLeft: 4 },
  viewDetails: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
  
  mapContainer: {
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  mapWrapper: { 
    position: 'relative', 
    borderRadius: Colors.radiusMedium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  map: { width: '100%', height: 260 },
  legend: { 
    position: 'absolute', 
    bottom: 12, 
    right: 12, 
    backgroundColor: 'rgba(255,255,255,0.92)', 
    padding: 10, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendText: { fontSize: 11, fontWeight: '800', color: Colors.text },
  
  emptyContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 30 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  emptyText: { color: Colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  emptySubtext: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 }
});
