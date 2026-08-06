import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions, Alert, Linking, Platform } from 'react-native';
import MapView, { Polygon, Marker, Callout } from '../../components/MapViewWrapper';
import * as Location from 'expo-location';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function ParkWorkerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
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
  const { logout, user } = useContext(AuthContext);
  const { t } = useLocalization();
  const mapRef = useRef(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Request location permission
      Location.requestForegroundPermissionsAsync().catch(locErr => {
        console.log('Location permission request failed:', locErr);
      });

      const [tasksRes, wardRes, infraRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/infrastructure/ward-boundary').catch(err => {
          console.log('No ward boundary found:', err.message);
          return { data: null };
        }),
        api.get('/infrastructure?limit=1000').catch(err => {
          console.log('No infrastructure found:', err.message);
          return { data: [] };
        })
      ]);

      const tasksData = (tasksRes.data || []).filter(t => t.task_type === 'park');
      setTasks(tasksData);

      // Focus map to fit the park markers
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
            latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.5),
            longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.5),
          };
          setRegion(computedRegion);
          if (mapRef.current) {
            mapRef.current.animateToRegion(computedRegion, 1000);
          }
        }
      }

      if (wardRes.data && wardRes.data.geom_json) {
        const wardData = wardRes.data;
        wardData.parsedGeom = typeof wardData.geom_json === 'string'
          ? JSON.parse(wardData.geom_json)
          : wardData.geom_json;
        setWardBoundary(wardData);
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

    } catch (error) {
      console.error('Fetch dashboard error:', error);
      Alert.alert(t('error'), t('fetch_failed_alert'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchDashboardData();
    }
  }, [isFocused]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': 
        return Colors.success || '#10B981'; // Green
      case 'submitted': 
        return '#F59E0B'; // Yellow/Amber
      case 'in_progress':
      case 'rejected': 
      default: 
        return '#EF4444'; // Red
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'approved': return t('approved');
      case 'submitted': return t('submitted');
      case 'rejected': return t('rejected');
      case 'in_progress': return t('in_progress');
      default: return t('pending');
    }
  };

  const handleTaskPress = (task) => {
    navigation.navigate('ParkMapNavigation', { taskId: task.id });
  };

  const handleNavigateToPark = (task) => {
    const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
    const pt = coords[0];
    if (!pt || !pt.latitude || !pt.longitude) {
      Alert.alert(t('error'), t('no_coordinates_alert'));
      return;
    }
    const lat = pt.latitude;
    const lon = pt.longitude;
    
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
  };

  const renderTaskItem = ({ item }) => {
    const coords = (typeof item.area_geojson === 'string' ? JSON.parse(item.area_geojson) : item.area_geojson) || [];
    const point = coords[0] || null;
    const statusColor = getStatusColor(item.status);

    return (
      <View style={styles.cardContainer}>
        <TouchableOpacity
          style={[styles.taskCard, { borderLeftColor: statusColor }]}
          onPress={() => handleTaskPress(item)}
          activeOpacity={0.9}
        >
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleGroup}>
              <MaterialCommunityIcons name="pine-tree" size={20} color={statusColor} style={{ marginRight: 6 }} />
              <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>

          <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>

          {item.ward_name && (
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>📍 {t('ward_text') || 'Ward'}: {item.ward_name}</Text>
              </View>
            </View>
          )}

          {item.status === 'rejected' && item.review_comment && (
            <View style={styles.rejectCommentBox}>
              <Text style={styles.rejectLabel}>{t('si_feedback')}</Text>
              <Text style={styles.rejectText}>{item.review_comment}</Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity 
              style={styles.navigateButtonInline} 
              onPress={() => handleNavigateToPark(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="navigate-circle-outline" size={16} color={Colors.primary} />
              <Text style={styles.navigateButtonInlineText}>{t('navigate')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.openTaskButtonInline}
              onPress={() => handleTaskPress(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.openTaskButtonInlineText}>{t('open_task')}</Text>
            </TouchableOpacity>
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
              🌳 {t('jawan')} • {wardBoundary?.wardName || (user?.ward_id ? `${t('ward_text')} ${user.ward_id}` : t('park_area'))}
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
            showsUserLocation={true}
          >
            {/* All Ward Boundaries */}
            {infrastructure.filter(item => item.type === 'ward').map(ward => {
              const geom = ward.parsedGeom;
              if (!geom) return null;
              const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
              const isAssigned = wardBoundary && ward.name.toLowerCase().includes(wardBoundary.wardName.toLowerCase());
              return polys.map((poly, idx) => {
                const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
                return (
                  <Polygon
                    key={`ward-poly-${ward.id}-${idx}`}
                    coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                    strokeColor="#3B82F6"
                    fillColor="rgba(59, 130, 246, 0.03)"
                    strokeWidth={2}
                    zIndex={5}
                  />
                );
              });
            })}

            {/* Park Markers */}
            {tasks.map(task => {
              const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
              const pt = coords[0];
              if (!pt || !pt.latitude || !pt.longitude) return null;
              
              const statusColor = getStatusColor(task.status);
              return (
                <Marker
                  key={`park-marker-${task.id}`}
                  coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
                  onCalloutPress={() => handleTaskPress(task)}
                >
                  <View style={[styles.markerPin, { borderColor: statusColor }]}>
                    <View style={[styles.markerInner, { backgroundColor: statusColor }]}>
                      <MaterialCommunityIcons name="pine-tree" size={16} color="white" />
                    </View>
                  </View>
                  <Callout style={styles.callout}>
                    <Text style={styles.calloutTitle}>{task.title}</Text>
                    <Text style={styles.calloutStatus}>{getStatusLabel(task.status)}</Text>
                    <Text style={styles.calloutHint}>{t('tap_to_view_details')}</Text>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <Text style={styles.sectionHeader}>{t('assigned_parks')} ({tasks.length})</Text>
        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-decagram" size={48} color={Colors.success} />
            <Text style={styles.emptyText}>{t('no_parks_found')}</Text>
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderTaskItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileText: {
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  logoutText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
    marginLeft: 4,
  },
  mapContainer: {
    height: 240,
    width: '100%',
    padding: 12,
  },
  mapWrapper: {
    flex: 1,
    borderRadius: Colors.radiusMedium,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  markerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  markerInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callout: {
    width: 150,
    padding: 6,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  calloutStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  calloutHint: {
    fontSize: 9,
    fontWeight: '500',
    color: '#3B82F6',
    marginTop: 4,
  },
  bottomSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
  },
  listContainer: {
    paddingBottom: 20,
  },
  cardContainer: {
    marginBottom: 12,
  },
  taskCard: {
    backgroundColor: Colors.white,
    borderRadius: Colors.radiusMedium,
    borderLeftWidth: 5,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  taskDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  metaChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    marginBottom: 4,
  },
  metaChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  rejectCommentBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  rejectLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#991B1B',
  },
  rejectText: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  navigateButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  navigateButtonInlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginLeft: 4,
  },
  openTaskButtonInline: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  openTaskButtonInlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
});
