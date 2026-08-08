import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Polygon } from '../../components/MapViewWrapper';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

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

export default function OwnerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [infrastructure, setInfrastructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWardFilter, setSelectedWardFilter] = useState(null);
  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const mapRef = useRef(null);
  const hasCenteredMapRef = useRef(false);
  const isFocused = useIsFocused();
  const { user, logout } = useContext(AuthContext);
  const { t } = useLocalization();

  const getWardsList = () => {
    const list = [];
    infrastructure.forEach(item => {
      if (item.type === 'ward') {
        const props = item.properties || {};
        const wardNo = props.Ward_No || props.ward_no || item.name;
        if (wardNo) {
          const wardStr = wardNo.toString().trim();
          if (wardStr && !list.includes(wardStr)) {
            list.push(wardStr);
          }
        }
      }
    });
    if (list.length === 0) {
      infrastructure.forEach(item => {
        if (item.type === 'road') {
          const props = item.properties || {};
          const wardNo = props.Ward_No || props.ward_no;
          if (wardNo) {
            const wardStr = wardNo.toString().trim();
            if (wardStr && !list.includes(wardStr)) {
              list.push(wardStr);
            }
          }
        }
      });
    }
    return list.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  };

  const getFilteredInfrastructure = () => {
    if (!selectedWardFilter) return infrastructure;
    return infrastructure.filter(item => {
      const props = item.properties || {};
      const itemWard = props.Ward_No || props.ward_no || (item.type === 'ward' ? item.name : null);
      if (!itemWard) return false;
      return itemWard.toString().trim() === selectedWardFilter.toString().trim();
    });
  };

  const handleWardSelect = (wardNo) => {
    setSelectedWardFilter(wardNo);
    if (!wardNo) {
      const wardFeatures = infrastructure.filter(item => item.type === 'ward');
      animateToWards(wardFeatures);
      return;
    }

    const selectedWardFeature = infrastructure.find(item => {
      if (item.type !== 'ward') return false;
      const props = item.properties || {};
      const itemWard = props.Ward_No || props.ward_no || item.name;
      return itemWard && itemWard.toString().trim() === wardNo.toString().trim();
    });

    if (selectedWardFeature && selectedWardFeature.geom_json) {
      try {
        const geom = JSON.parse(selectedWardFeature.geom_json);
        if (geom.coordinates && geom.coordinates[0]) {
          let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
          geom.coordinates[0].forEach(c => {
            const lng = c[0];
            const lat = c[1];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          });
          if (minLat !== 90) {
            const newRegion = {
              latitude: (minLat + maxLat) / 2,
              longitude: (minLng + maxLng) / 2,
              latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.015),
              longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.015),
            };
            setRegion(newRegion);
            if (mapRef.current) {
              mapRef.current.animateToRegion(newRegion, 1000);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to center selected ward', err);
      }
    }
  };

  const animateToWards = (wardFeatures) => {
    if (wardFeatures.length > 0) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      wardFeatures.forEach(w => {
        if (w.geom_json) {
          const geom = JSON.parse(w.geom_json);
          if (geom.coordinates && geom.coordinates[0]) {
            geom.coordinates[0].forEach(c => {
              const lng = c[0];
              const lat = c[1];
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
            });
          }
        }
      });
      if (minLat !== 90) {
        const newRegion = {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.04),
          longitudeDelta: Math.max((maxLng - minLng) * 1.3, 0.04),
        };
        setRegion(newRegion);
        if (mapRef.current) {
          setTimeout(() => {
            mapRef.current.animateToRegion(newRegion, 1000);
          }, 600);
        }
      }
    }
  };

  const fetchData = async () => {
    if (tasks.length === 0) {
      setLoading(true);
    }
    try {
      const response = await api.get('/tasks');
      setTasks(response.data || []);

      let infraData = infrastructure;
      if (infrastructure.length === 0) {
        const infraResponse = await api.get('/infrastructure?limit=1500');
        infraData = infraResponse.data || [];
        setInfrastructure(infraData);
      }

      const wardFeatures = infraData.filter(item => item.type === 'ward');
      if (wardFeatures.length > 0 && !hasCenteredMapRef.current) {
        animateToWards(wardFeatures);
        hasCenteredMapRef.current = true;
      }
    } catch (error) {
      console.warn('Error fetching dashboard data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  const handleDeleteAll = async () => {
    Alert.alert(
      t('danger_area'),
      t('purge_all_alert_body'),
      [
        { text: t('cancel'), style: "cancel" },
        { 
          text: t('yes_purge_everything'), 
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t('final_confirmation'),
              t('delete_all_confirm_body'),
              [
                { text: t('cancel'), style: "cancel" },
                {
                  text: t('purge_all'),
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.delete('/tasks/all');
                      Alert.alert(t('success'), t('purge_success'));
                      fetchData();
                    } catch (err) {
                      Alert.alert(t('error'), t('purge_failed'));
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const getCombinedTasks = () => {
    const filteredInfra = getFilteredInfrastructure();
    const filteredRoads = filteredInfra.filter(item => item.type === 'road');

    const filteredDbTasks = tasks.filter(t => {
      if (!selectedWardFilter) return true;
      const road = infrastructure.find(r => {
        if (r.type !== 'road') return false;
        const props = r.properties || {};
        const lineId = props.Line_ID || props.line_id;
        return lineId && lineId.toString() === t.line_id;
      });
      if (!road) return false;
      const props = road.properties || {};
      const roadWard = props.Ward_No || props.ward_no;
      return roadWard?.toString().trim() === selectedWardFilter.toString().trim();
    });

    const combined = [...filteredDbTasks];
    filteredRoads.forEach(road => {
      const props = road.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const rdName = props.Rd_Name || props.rd_name || road.name;
      
      const exists = filteredDbTasks.some(t => 
        lineId && t.line_id === lineId.toString()
      );
      
      if (!exists) {
        combined.push({
          id: `virtual-${road.id}`,
          title: road.name || props.Rd_Name || 'Unnamed Road',
          status: 'pending',
          worker_name: props.JAWAN_NAME || props.jawan_name || 'Unassigned',
          line_id: lineId ? lineId.toString() : null,
          rd_name: rdName || null,
          isVirtual: true
        });
      }
    });
    return combined;
  };

  const getRoadStats = () => {
    const combined = getCombinedTasks();
    let completed = 0;
    let active = 0;
    let pending = 0;

    combined.forEach(t => {
      if (t.status === 'approved') {
        completed++;
      } else if (t.status === 'submitted') {
        active++;
      } else {
        pending++;
      }
    });

    return { completed, active, pending };
  };

  const getBadgeStyle = (status) => {
    switch (status) {
      case 'approved': return { bg: Colors.successBg, text: Colors.successText };
      case 'submitted': return { bg: Colors.warningBg, text: Colors.warningText };
      case 'in_progress': return { bg: Colors.infoBg, text: Colors.infoText };
      case 'rejected':
      case 'redo':
        return { bg: Colors.rejectedBg || 'rgba(249, 115, 22, 0.15)', text: Colors.rejectedText || '#F97316' };
      default: return { bg: Colors.errorBg, text: Colors.errorText };
    }
  };

  const getUserInitials = (name) => {
    if (!name) return 'SI';
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
          style={styles.taskCardMain}
          onPress={() => navigation.navigate('TaskDetails', { taskId: item.id })}
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

          {(item.line_id || item.rd_name) ? (
            <View style={styles.metaRow}>
              {item.line_id ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>🔗 {t('line_label')}: {item.line_id}</Text>
                </View>
              ) : null}
              {item.rd_name ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>🛣️ {t('road_label')}: {item.rd_name}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={styles.workerContainer}>
              <Ionicons name="construct-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.workerName}>{t('jawan_label')}: {item.worker_name || t('unassigned')}</Text>
            </View>
            <Text style={styles.viewDetails}>{t('view_details_arrow')}</Text>
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
            <Text style={styles.headerTitle}>{t('welcome_comma')}{user?.name}</Text>
            <Text style={styles.subText}>
              🛡️ {t('sanitary_inspector')} • {tasks.length} {t('assigned')} / {getCombinedTasks().length} {t('road_segments')}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </View>

      {user?.role !== 'supervisor' && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.createButton, Colors.shadowLow]}
            onPress={() => navigation.navigate('MapTaskCreation')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
            <Text style={styles.createButtonText}>{t('create_road_task').toUpperCase()}</Text>
          </TouchableOpacity>

          {tasks.length > 0 && (
            <TouchableOpacity
              style={[styles.deleteAllBtn, Colors.shadowLow]}
              onPress={handleDeleteAll}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.white} />
              <Text style={styles.deleteAllText}>{t('purge_all').toUpperCase()}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <>
          {/* Stats Summary Cards Row */}
          <View style={styles.statsContainer}>
            <View style={[styles.statBox, { backgroundColor: Colors.successBg }, Colors.shadowLow]}>
              <Ionicons name="checkbox-outline" size={18} color={Colors.success} />
              <Text style={[styles.statVal, { color: Colors.success }]}>{getRoadStats().completed}</Text>
              <Text style={styles.statLabel}>{t('cleaned')}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: Colors.warningBg }, Colors.shadowLow]}>
              <Ionicons name="hourglass-outline" size={18} color={Colors.warning} />
              <Text style={[styles.statVal, { color: Colors.warning }]}>{getRoadStats().active}</Text>
              <Text style={styles.statLabel}>{t('active')}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: Colors.errorBg }, Colors.shadowLow]}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.accent} />
              <Text style={[styles.statVal, { color: Colors.accent }]}>{getRoadStats().pending}</Text>
              <Text style={styles.statLabel}>{t('pending')}</Text>
            </View>
          </View>

          {/* Horizontal Ward Selector Pill Row */}
          {getWardsList().length > 0 && (
            <View style={styles.filterContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedWardFilter === null && styles.filterChipActive
                  ]}
                  onPress={() => handleWardSelect(null)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedWardFilter === null && styles.filterChipTextActive
                    ]}
                  >
                    {t('all_wards')}
                  </Text>
                </TouchableOpacity>
                
                {getWardsList().map(wardNo => (
                  <TouchableOpacity
                    key={`ward-pill-${wardNo}`}
                    style={[
                      styles.filterChip,
                      selectedWardFilter === wardNo && styles.filterChipActive
                    ]}
                    onPress={() => handleWardSelect(wardNo)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedWardFilter === wardNo && styles.filterChipTextActive
                      ]}
                    >
                      {t('ward_number')}{wardNo}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.mapContainer}>
            <View style={[styles.mapWrapper, Colors.shadowMedium]}>
              <MapView
                ref={mapRef}
                style={styles.map}
                mapType="satellite"
                initialRegion={region}
              >
                {/* Draw Wards Assigned to Supervisor */}
                {getFilteredInfrastructure().filter(item => item.type === 'ward').map(ward => {
                  if (!ward.geom_json) return null;
                  const geom = JSON.parse(ward.geom_json);
                  if (!geom.coordinates || !geom.coordinates[0]) return null;
                  return (
                    <Polygon
                      key={`ward-${ward.id}`}
                      coordinates={geom.coordinates[0].map(c => ({ longitude: c[0], latitude: c[1] }))}
                      fillColor="rgba(255, 255, 255, 0.03)"
                      strokeColor="#FFFFFF"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Draw Roads Colored by Task Status */}
                {getFilteredInfrastructure().filter(item => item.type === 'road').map(road => {
                  if (!road.geom_json) return null;
                  
                  let geom;
                  try {
                    geom = typeof road.geom_json === 'string' ? JSON.parse(road.geom_json) : road.geom_json;
                  } catch (e) {
                    return null;
                  }
                  if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) return null;

                  const props = road.properties || {};
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
                    } else if (matchingTask.status === 'rejected' || matchingTask.status === 'redo') {
                      roadColor = Colors.rejected || '#F97316'; // Redo / Rejected (Orange)
                    }
                  }

                  return (
                    <MemoizedRoad
                      key={`road-${road.id}`}
                      geom={geom}
                      color={roadColor}
                      strokeWidth={matchingTask ? 3.5 : 1.5}
                      onPress={() => {
                        if (matchingTask) {
                          navigation.navigate('TaskDetails', { taskId: matchingTask.id });
                        } else {
                          navigation.navigate('TaskDetails', { taskId: `virtual-${road.id}` });
                        }
                      }}
                    />
                  );
                })}
              </MapView>
            </View>
          </View>

          <FlatList
            data={getCombinedTasks()}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderTask}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={40} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>{t('no_tasks_found_area')}</Text>
              </View>
            }
          />
        </>
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
  subText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
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
  
  buttonRow: { flexDirection: 'row', paddingHorizontal: 15, marginVertical: 10 },
  createButton: { 
    flex: 2.2,
    backgroundColor: Colors.primary, 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexDirection: 'row',
  },
  createButtonText: { color: Colors.white, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginLeft: 6 },
  deleteAllBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  deleteAllText: { color: Colors.white, fontSize: 13, fontWeight: '700', marginLeft: 4 },
  
  listContainer: { paddingBottom: 30, paddingHorizontal: 5 },
  taskCard: { 
    backgroundColor: Colors.card, 
    marginHorizontal: 15, 
    marginBottom: 10, 
    borderRadius: Colors.radiusMedium, 
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden'
  },
  taskCardMain: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  taskTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1, marginRight: 10, letterSpacing: -0.1, lineHeight: 20 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    marginHorizontal: -2,
  },
  metaChip: {
    backgroundColor: Colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
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

  cardFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderTopWidth: 1, 
    borderTopColor: Colors.border, 
    paddingTop: 12,
    marginTop: 2,
  },
  workerContainer: { flexDirection: 'row', alignItems: 'center' },
  workerName: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  viewDetails: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  
  emptyContainer: { alignItems: 'center', marginTop: 40, padding: 20 },
  emptyText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700', marginTop: 10 },
  
  mapContainer: {
    paddingHorizontal: 15,
    marginBottom: 12,
  },
  mapWrapper: {
    height: 250,
    borderRadius: Colors.radiusMedium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  
  filterContainer: {
    marginBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 15,
    paddingVertical: 4,
    alignItems: 'center',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    marginVertical: 12,
  },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
});
