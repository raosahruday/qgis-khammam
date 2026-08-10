import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, ScrollView, Alert, useWindowDimensions } from 'react-native';
import MapView, { Polygon, Polyline, Marker, RoadsLayer, Callout } from '../../components/MapViewWrapper';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';
import api from '../../api/axios';

// --- Memoized Components to prevent bridge congestion during map movement ---
const MemoizedWards = React.memo(({ wardStats, selectedWardId, onWardPress }) => {
  return (
    <>
      {wardStats.map(ward => {
         const geom = ward.parsedGeom;
         if (!geom || !geom.coordinates) return null;
         
         const isSelected = selectedWardId === ward.id;
         return (
           <Polygon
             key={`ward-${ward.id}`}
             coordinates={geom.coordinates[0].map(c => ({ longitude: c[0], latitude: c[1] }))}
             fillColor={isSelected ? "rgba(255, 214, 0, 0.08)" : "rgba(255, 255, 255, 0.03)"}
             strokeColor={isSelected ? Colors.warning : "rgba(255, 255, 255, 0.55)"}
             strokeWidth={isSelected ? 2 : 0.75}
             lineDashPattern={isSelected ? null : [10, 10]}
             tappable={true}
             onPress={() => onWardPress(ward)}
           />
         );
      })}
    </>
  );
}, (prevProps, nextProps) => {
  return prevProps.wardStats === nextProps.wardStats &&
         prevProps.selectedWardId === nextProps.selectedWardId;
});

// --- Batched road layer: renders all roads of one status as a SINGLE GeoJSON layer ---
const MemoizedRoadLayers = React.memo(({ pendingRoads, activeRoads, completedRoads, rejectedRoads, isZoomedOut, onRoadPress }) => {
  const w = isZoomedOut ? 1.0 : 1.75;
  return (
    <>
      {/* Pending & Uncleaned roads — Red */}
      <RoadsLayer
        features={pendingRoads}
        color={Colors.accent || '#EF4444'}
        weight={w}
        onFeaturePress={onRoadPress}
      />
      {/* Rejected (Invalid Photo / Laptop) roads — Orange */}
      <RoadsLayer
        features={rejectedRoads}
        color={Colors.orange || '#F97316'}
        weight={w + 0.25}
        onFeaturePress={onRoadPress}
      />
      {/* Completed roads — Green */}
      <RoadsLayer
        features={completedRoads}
        color={Colors.success || '#10B981'}
        weight={w + 0.5}
        onFeaturePress={onRoadPress}
      />
      {/* Active / Submitted roads — Yellow */}
      <RoadsLayer
        features={activeRoads}
        color={Colors.warning || '#F59E0B'}
        weight={w + 0.75}
        onFeaturePress={onRoadPress}
      />
    </>
  );
}, (prevProps, nextProps) => {
  return prevProps.pendingRoads === nextProps.pendingRoads &&
         prevProps.activeRoads === nextProps.activeRoads &&
         prevProps.completedRoads === nextProps.completedRoads &&
         prevProps.rejectedRoads === nextProps.rejectedRoads &&
         prevProps.isZoomedOut === nextProps.isZoomedOut;
});

const MemoizedRows = React.memo(({ rows, isZoomedOut }) => {
  if (isZoomedOut) return null;
  return (
    <>
      {rows.map(item => {
         const geom = item.parsedGeom;
         if (!geom) return null;
         
         if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
            const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
            return polys.map((poly, idx) => {
               const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
               return (
                 <Polygon 
                   key={`infra-poly-${item.id}-${idx}`}
                   coordinates={ring.map(c => ({ longitude: c[0], latitude: c[1] }))}
                   fillColor="rgba(255, 152, 0, 0.12)"
                   strokeColor="rgba(255, 152, 0, 0.5)"
                   strokeWidth={1.5}
                   zIndex={5}
                 />
               );
            });
         }
         return null;
      })}
    </>
  );
}, (prevProps, nextProps) => {
  return prevProps.rows === nextProps.rows &&
         prevProps.isZoomedOut === nextProps.isZoomedOut;
});

export default function CommissionerDashboard({ navigation }) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const [wardStats, setWardStats] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [machines, setMachines] = useState([]);
  const [infrastructure, setInfrastructure] = useState([]);
  const [totals, setTotals] = useState({ completed: 0, active: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedWard, setSelectedWard] = useState(null);
  const { logout } = useContext(AuthContext);
  const { t } = useLocalization();

  const [activeTab, setActiveTab] = useState('map'); // 'map' or 'registrations' or 'workers'
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  
  const [workers, setWorkers] = useState([]);
  const [wardsList, setWardsList] = useState([]);
  const [transferringJawan, setTransferringJawan] = useState(null);
  const [selectedTargetWard, setSelectedTargetWard] = useState(null);

  const [selectedWardFilter, setSelectedWardFilter] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const mapRef = useRef(null);

  const roadsOnly = useMemo(() => {
    return infrastructure.filter(item => item.type === 'road');
  }, [infrastructure]);

  const rowsOnly = useMemo(() => {
    return infrastructure.filter(item => item.type === 'row');
  }, [infrastructure]);

  const getDivisionList = () => {
    const list = [...wardStats].sort((a, b) => {
      const numA = parseInt(a.name?.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.name?.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
    if (!list.some(w => w.name === 'Ward 61' || w.id === 'ward_61')) {
      list.push({ id: 'ward_61', name: 'Ward 61' });
    }
    return list;
  };

  const getSelectedWardNo = () => {
    if (!selectedWardFilter) return null;
    if (selectedWardFilter === 'ward_61') return '61';
    const selectedWardObj = wardStats.find(w => w.id === selectedWardFilter);
    if (!selectedWardObj) return null;
    const match = selectedWardObj.name?.match(/\d+/);
    return match ? match[0] : selectedWardObj.name;
  };

  const getFilteredWards = () => {
    if (!selectedWardFilter || selectedWardFilter === 'parks') return wardStats;
    return wardStats.filter(w => w.id === selectedWardFilter);
  };

  const getFilteredRoads = () => {
    if (selectedWardFilter === 'parks') return [];
    const wardNo = getSelectedWardNo();
    if (!wardNo) return roadsOnly;
    return roadsOnly.filter(road => {
      const props = road.properties || {};
      const roadWard = props.Ward_No || props.ward_no;
      if (!roadWard) return false;
      const roadWardStr = roadWard.toString().trim();
      const wardNoStr = wardNo.toString().trim();
      return roadWardStr === wardNoStr || roadWardStr.startsWith(wardNoStr + '_') || roadWardStr.startsWith(wardNoStr + '.');
    });
  };

  const getFilteredRows = () => {
    if (selectedWardFilter === 'parks') return [];
    const wardNo = getSelectedWardNo();
    if (!wardNo) return rowsOnly;
    return rowsOnly.filter(row => {
      const props = row.properties || {};
      const rowWard = props.Ward_No || props.row_no;
      if (!rowWard) return false;
      const rowWardStr = rowWard.toString().trim();
      const wardNoStr = wardNo.toString().trim();
      return rowWardStr === wardNoStr || rowWardStr.startsWith(wardNoStr + '_') || rowWardStr.startsWith(wardNoStr + '.');
    });
  };

  const getRoadStats = (filteredRoads) => {
    const taskMap = {};
    tasks.forEach(t => {
      if (t.line_id) {
        taskMap[t.line_id.toString()] = t;
      }
    });

    let completed = 0;
    let active = 0;
    let pending = 0;
    let rejected = 0;

    filteredRoads.forEach(road => {
      const props = road.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const matchingTask = lineId ? taskMap[lineId.toString()] : null;

      if (matchingTask) {
        if (matchingTask.status === 'approved') {
          completed++;
        } else if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') {
          active++;
        } else if (matchingTask.status === 'rejected') {
          rejected++;
        } else {
          pending++;
        }
      } else {
        pending++;
      }
    });

    return { completed, active, pending, rejected };
  };

  const getStatsForWard = (wardObj) => {
    let wardNo = null;
    if (selectedWardFilter === 'ward_61' || wardObj?.name === 'Ward 61') {
      wardNo = '61';
    } else if (wardObj) {
      const match = wardObj.name?.match(/\d+/);
      wardNo = match ? match[0] : wardObj.name;
    }
    if (!wardNo) return { completed: 0, active: 0, pending: 0, rejected: 0 };

    const filteredRoads = roadsOnly.filter(road => {
      const props = road.properties || {};
      const roadWard = props.Ward_No || props.ward_no;
      if (!roadWard) return false;
      const roadWardStr = roadWard.toString().trim();
      const wardNoStr = wardNo.toString().trim();
      return roadWardStr === wardNoStr || roadWardStr.startsWith(wardNoStr + '_') || roadWardStr.startsWith(wardNoStr + '.');
    });

    return getRoadStats(filteredRoads);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return '#10B981'; // Green
      case 'submitted': 
      case 'in_progress':
        return '#F59E0B'; // Yellow/Amber
      case 'rejected': 
        return Colors.rejected || '#F97316'; // Orange for Rejected Photos
      case 'uncleaned':
      default: 
        return '#EF4444'; // Red for Uncleaned / Pending
    }
  };

  const getStatsValues = () => {
    if (selectedWardFilter === 'parks') {
      const parkTasks = tasks.filter(t => t.task_type === 'park');
      let completed = 0;
      let active = 0;
      let pending = 0;

      parkTasks.forEach(t => {
        if (t.status === 'approved') {
          completed++;
        } else if (t.status === 'submitted') {
          active++;
        } else {
          pending++;
        }
      });

      return { completed, active, pending };
    }

    if (selectedWardFilter) {
      const selectedWardObj = wardStats.find(w => w.id === selectedWardFilter);
      return getStatsForWard(selectedWardObj);
    }
    
    return getRoadStats(roadsOnly);
  };

  const handleWardSelect = (wardId) => {
    setSelectedWardFilter(wardId);
    if (!wardId || wardId === 'parks') {
      setSelectedWard(null);
      const defaultRegion = {
        latitude: 17.2473,
        longitude: 80.1514,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      if (mapRef.current) {
        mapRef.current.animateToRegion(defaultRegion, 1000);
      }
      return;
    }

    const selectedWardObj = wardStats.find(w => w.id === wardId);
    setSelectedWard(selectedWardObj);

    if (selectedWardObj && selectedWardObj.parsedGeom) {
      const geom = selectedWardObj.parsedGeom;
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
          if (mapRef.current) {
            mapRef.current.animateToRegion(newRegion, 1000);
          }
        }
      }
    }
  };

  const regionRef = useRef({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [isZoomedOut, setIsZoomedOut] = useState(true);
  const isFetchingRef = useRef(false);
  const isFirstLoad = useRef(true);
  const hasLoadedInfra = useRef(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 10000); 
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isFirstLoad.current) {
      setLoading(true);
    }
    try {
      const promises = [
        api.get('/wards/stats'),
        api.get('/machines'),
        api.get('/tasks?limit=5000'),
        api.get('/tasks/summary'),
        api.get('/registrations/pending'),
        api.get('/workers'),
        api.get('/wards')
      ];

      const shouldFetchInfra = !hasLoadedInfra.current;
      if (shouldFetchInfra) {
        promises.push(api.get('/infrastructure?limit=6000'));
      }

      const results = await Promise.all(promises);
      const [statsRes, machinesRes, tasksRes, summaryRes, pendingRes, workersRes, wardsRes] = results;

      if (shouldFetchInfra) {
        const infraRes = results[7];
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
        hasLoadedInfra.current = true;
      }

      const parsedWards = (statsRes.data || []).map(ward => {
        try {
          ward.parsedGeom = ward.geom_json
            ? (typeof ward.geom_json === 'string' ? JSON.parse(ward.geom_json) : ward.geom_json)
            : null;
        } catch (e) {
          ward.parsedGeom = null;
        }
        return ward;
      });

      setWardStats(parsedWards);
      setMachines(machinesRes.data || []);
      setTasks(tasksRes.data || []);
      setTotals(summaryRes.data);
      setPendingUsers(pendingRes.data || []);
      setPendingCount(pendingRes.data ? pendingRes.data.length : 0);
      setWorkers(workersRes.data || []);
      setWardsList(wardsRes.data || []);
      isFirstLoad.current = false;
    } catch (err) {
      console.warn('Failed to fetch data', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  const handleApprove = async (id) => {
    try {
      setLoading(true);
      await api.put(`/registrations/${id}/approve`);
      Alert.alert('Approved', 'User registration approved successfully!');
      fetchData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to approve registration');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id) => {
    Alert.alert(
      'Confirm Rejection',
      'Are you sure you want to reject and delete this registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reject', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.put(`/registrations/${id}/reject`);
              Alert.alert('Rejected', 'User registration rejected.');
              fetchData();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to reject registration');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleTransferJawan = async (workerId, targetWardId) => {
    if (!targetWardId) {
      Alert.alert(t('error'), t('select_target_ward'));
      return;
    }
    try {
      setLoading(true);
      await api.put(`/workers/${workerId}/transfer`, { ward_id: targetWardId });
      Alert.alert(t('success'), t('transfer_success'));
      setTransferringJawan(null);
      setSelectedTargetWard(null);
      fetchData();
    } catch (err) {
      Alert.alert(t('error'), err.response?.data?.error || 'Failed to transfer jawan');
    } finally {
      setLoading(false);
    }
  };

  const onRegionChangeComplete = (newRegion) => {
    regionRef.current = newRegion;
    const newZoomedOut = newRegion.latitudeDelta >= 0.05;
    if (newZoomedOut !== isZoomedOut) {
      setIsZoomedOut(newZoomedOut);
    }
  };

  const { pendingRoads, activeRoads, completedRoads, rejectedRoads } = useMemo(() => {
    const filteredRoads = getFilteredRoads();
    const taskMap = {};
    tasks.forEach(t => {
      if (t.line_id) taskMap[t.line_id.toString()] = t;
    });

    const pending = [];
    const active = [];
    const completed = [];
    const rejected = [];

    filteredRoads.forEach(road => {
      const geom = road.parsedGeom;
      if (!geom || (geom.type !== 'LineString' && geom.type !== 'MultiLineString')) return;

      const props = road.properties || {};
      const lineId = (props.Line_ID || props.line_id)?.toString();
      const task = lineId ? taskMap[lineId] : null;
      const entry = { geom, properties: props };

      if (!task) {
        pending.push(entry);
      } else if (task.status === 'approved') {
        completed.push(entry);
      } else if (task.status === 'rejected') {
        rejected.push(entry); // Invalid photo / Laptop (Orange)
      } else if (task.status === 'submitted' || task.status === 'in_progress') {
        active.push(entry); // Active (Yellow)
      } else {
        pending.push(entry); // Uncleaned / Pending (Red)
      }
    });

    return { pendingRoads: pending, activeRoads: active, completedRoads: completed, rejectedRoads: rejected };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infrastructure, tasks, selectedWardFilter]);

  const handleRoadPress = (props) => {
    const wardText = props.Ward_No ? `Ward ${props.Ward_No}` : 'Unknown Ward';
    const rdName = props.Rd_Name || props.rd_name || 'Unnamed Road';
    const lineId = props.Line_ID || props.line_id || 'N/A';
    Alert.alert(rdName, `${wardText}\nLine ID: ${lineId}`);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading Municipal Overview...</Text>
      </View>
    );
  }

  const renderRegistrationRequests = () => {
    if (pendingUsers.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="people-outline" size={48} color={Colors.textSecondary} />
          </View>
          <Text style={styles.emptyText}>All Caught Up!</Text>
          <Text style={styles.emptySubtext}>No pending user accounts currently require your approval.</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.registrationsList} showsVerticalScrollIndicator={false}>
        {pendingUsers.map(u => (
          <View key={u.id} style={[styles.regCard, Colors.shadowLow]}>
            <View style={styles.regHeader}>
              <View>
                <Text style={styles.regName}>{u.name}</Text>
                <Text style={styles.regPhone}>{u.phone || 'No mobile listed'}</Text>
              </View>
              <View style={[
                styles.regRoleTag, 
                { backgroundColor: u.role === 'worker' ? `${Colors.primary}12` : `${Colors.blue}12` }
              ]}>
                <Text style={[
                  styles.regRoleText, 
                  { color: u.role === 'worker' ? Colors.primary : Colors.blue }
                ]}>
                  {u.role === 'worker' ? t('jawan') : t('inspector')}
                </Text>
              </View>
            </View>
            
            <View style={styles.regDetailRow}>
              <Ionicons name="grid-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.regDetailText}>
                {u.role === 'worker' ? `${t('division_text')}: ${u.divisions}` : `${t('all_divisions')}: ${u.divisions}`}
              </Text>
            </View>
            
            <View style={styles.regActions}>
              <TouchableOpacity 
                style={[styles.regBtn, styles.rejectBtn, Colors.shadowLow]} 
                onPress={() => handleReject(u.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={16} color={Colors.white} />
                <Text style={styles.regBtnText}>{t('reject')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.regBtn, styles.approveBtn, Colors.shadowLow]} 
                onPress={() => handleApprove(u.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
                <Text style={styles.regBtnText}>{t('approve')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderWorkerManagement = () => {
    const roadWorkers = workers.filter(w => w.role !== 'park_jawan');
    
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.registrationsList} showsVerticalScrollIndicator={false}>
          {roadWorkers.map(w => {
            const isCustomWard61 = w.ward_name === 'Ward 61';
            const displayedWardName = isCustomWard61 ? t('highways') : (w.ward_name || 'Unassigned');

            return (
              <View key={w.id} style={[styles.regCard, Colors.shadowLow]}>
                <View style={styles.regHeader}>
                  <View>
                    <Text style={styles.regName}>{w.name}</Text>
                    <Text style={styles.regPhone}>{w.email}</Text>
                  </View>
                  <View style={[styles.regRoleTag, { backgroundColor: `${Colors.primary}12` }]}>
                    <Text style={[styles.regRoleText, { color: Colors.primary }]}>
                      {t('jawan_label')}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.regDetailRow}>
                  <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.regDetailText}>
                    {t('current_ward')}: {displayedWardName}
                  </Text>
                </View>

                <View style={styles.regDetailRow}>
                  <Ionicons name="list-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.regDetailText}>
                    Active/Pending Tasks: {w.active_task_count || 0}
                  </Text>
                </View>
                
                <View style={styles.regActions}>
                  <TouchableOpacity 
                    style={[styles.regBtn, styles.approveBtn, { backgroundColor: Colors.primary }, Colors.shadowLow]} 
                    onPress={() => {
                      setTransferringJawan(w);
                      setSelectedTargetWard(w.ward_id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="swap-horizontal-outline" size={16} color={Colors.white} />
                    <Text style={styles.regBtnText}>{t('transfer')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Custom Transfer Modal overlay */}
        {transferringJawan && (
          <View style={styles.modalOverlay}>
            <View style={[styles.transferModal, Colors.shadowHigh]}>
              <Text style={styles.modalTitle}>
                {t('transfer')}: {transferringJawan.name}
              </Text>
              
              <Text style={styles.modalSub}>{t('select_target_ward')}</Text>
              
              <View style={styles.modalWardsListWrapper}>
                <ScrollView style={{ flex: 1 }} nestedScrollEnabled={true}>
                  {wardsList.map(ward => {
                    const isSelected = selectedTargetWard === ward.id;
                    const isWard61 = ward.name === 'Ward 61';
                    const wardDisplayName = isWard61 ? t('highways') : ward.name;

                    return (
                      <TouchableOpacity
                        key={ward.id}
                        style={[
                          styles.modalWardItem,
                          isSelected && styles.modalWardItemSelected
                        ]}
                        onPress={() => setSelectedTargetWard(ward.id)}
                      >
                        <Text style={[
                          styles.modalWardItemText,
                          isSelected && styles.modalWardItemTextSelected
                        ]}>
                          {wardDisplayName}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color={Colors.white} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalCancelBtn]} 
                  onPress={() => {
                    setTransferringJawan(null);
                    setSelectedTargetWard(null);
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalConfirmBtn]} 
                  onPress={() => handleTransferJawan(transferringJawan.id, selectedTargetWard)}
                >
                  <Text style={styles.modalConfirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderLargeSidebarStats = () => {
    const statsValues = getStatsValues();
    return (
      <View style={styles.sidebarStatsContainer}>
          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.successBg }, Colors.shadowLow]}>
            <View style={styles.statIconBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.emojiFallback}>✅</Text>
            </View>
            <Text style={[styles.statVal, { color: Colors.success }]}>{statsValues.completed}</Text>
            <Text style={styles.statLabel}>{t('cleaned')}</Text>
          </View>

          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.warningBg }, Colors.shadowLow]}>
            <View style={styles.statIconBadge}>
              <Ionicons name="time" size={18} color={Colors.warning} />
              <Text style={styles.emojiFallback}>⚡</Text>
            </View>
            <Text style={[styles.statVal, { color: Colors.warning }]}>{statsValues.active}</Text>
            <Text style={styles.statLabel}>{t('active')}</Text>
          </View>

          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.errorBg }, Colors.shadowLow]}>
            <View style={styles.statIconBadge}>
              <Ionicons name="alert-circle" size={18} color={Colors.accent} />
              <Text style={styles.emojiFallback}>🔴</Text>
            </View>
            <Text style={[styles.statVal, { color: Colors.accent }]}>{statsValues.pending}</Text>
            <Text style={styles.statLabel}>{t('pending')}</Text>
          </View>

          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.rejectedBg }, Colors.shadowLow]}>
            <View style={styles.statIconBadge}>
              <Ionicons name="close-circle" size={18} color={Colors.rejected} />
              <Text style={styles.emojiFallback}>🚫</Text>
            </View>
            <Text style={[styles.statVal, { color: Colors.rejected }]}>{statsValues.rejected || 0}</Text>
            <Text style={styles.statLabel}>REJECTED</Text>
          </View>

          <View style={[styles.sidebarStatBox, { backgroundColor: `${Colors.blue}10`, width: '100%' }, Colors.shadowLow]}>
            <View style={styles.statIconBadge}>
              <Ionicons 
                name={selectedWardFilter === 'parks' ? "leaf" : "bus"} 
                size={18} 
                color={Colors.blue} 
              />
              <Text style={styles.emojiFallback}>{selectedWardFilter === 'parks' ? '🍃' : '🚛'}</Text>
            </View>
            <Text style={[styles.statVal, { color: Colors.blue }]}>
              {selectedWardFilter === 'parks'
                ? tasks.filter(t => t.task_type === 'park').length
                : machines.length}
            </Text>
            <Text style={styles.statLabel}>
              {selectedWardFilter === 'parks' ? t('parks') : t('trucks')}
            </Text>
          </View>
      </View>
    );
  };

  if (isLargeScreen) {
    return (
      <View style={styles.largeMainContainer}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          <Header small={true} />
          
          <View style={styles.sidebarHeader}>
            <View>
              <Text style={styles.headerTitle}>{t('login_title')}</Text>
              <Text style={styles.headerRole}>{t('login_subtitle')}</Text>
            </View>
            <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
              <Text style={{ fontSize: 13, marginRight: 4 }}>🚪</Text>
              <Text style={styles.logoutText}>{t('logout')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'map' && styles.activeTabButton]}
              onPress={() => setActiveTab('map')}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={18} color={activeTab === 'map' ? Colors.primary : Colors.textSecondary} />
              <Text style={{ fontSize: 15, marginRight: 4 }}>🗺️</Text>
              <Text style={[styles.tabText, activeTab === 'map' && styles.activeTabText]}>{t('overview_map')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'registrations' && styles.activeTabButton]}
              onPress={() => setActiveTab('registrations')}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={18} color={activeTab === 'registrations' ? Colors.primary : Colors.textSecondary} />
              <Text style={{ fontSize: 15, marginRight: 4 }}>👥</Text>
              <Text style={[styles.tabText, activeTab === 'registrations' && styles.activeTabText]}>{t('pending')}</Text>
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'workers' && styles.activeTabButton]}
              onPress={() => setActiveTab('workers')}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={activeTab === 'workers' ? Colors.primary : Colors.textSecondary} />
              <Text style={{ fontSize: 15, marginRight: 4 }}>👷</Text>
              <Text style={[styles.tabText, activeTab === 'workers' && styles.activeTabText]}>{t('manage_jawans')}</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'map' ? (
            <View style={{ flex: 1 }}>
              {/* Dropdown Division Selector */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity 
                  style={[styles.dropdownButton, Colors.shadowLow]} 
                  onPress={() => setShowDropdown(!showDropdown)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownButtonContent}>
                    <Ionicons name="filter-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, marginRight: 6 }}>🔍</Text>
                    <Text style={styles.dropdownButtonText}>
                      {selectedWardFilter === 'parks'
                        ? t('parks')
                        : selectedWardFilter 
                          ? (wardStats.find(w => w.id === selectedWardFilter)?.name === 'Ward 61'
                             ? t('highways')
                             : `${t('division_text')}: ${wardStats.find(w => w.id === selectedWardFilter)?.name || (typeof selectedWardFilter === 'string' ? selectedWardFilter : t('all_divisions'))}`) 
                          : t('all_divisions')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons 
                      name={showDropdown ? "chevron-up" : "chevron-down"} 
                      size={18} 
                      color={Colors.textSecondary} 
                    />
                    <Text style={{ fontSize: 11, color: Colors.textSecondary, fontWeight: '900', marginLeft: 4 }}>{showDropdown ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {showDropdown && (
                  <View style={[styles.dropdownMenu, Colors.shadowMedium]}>
                    <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled={true}>
                      <TouchableOpacity
                        style={[
                          styles.dropdownOption,
                          !selectedWardFilter && styles.dropdownOptionSelected
                        ]}
                        onPress={() => {
                          handleWardSelect(null);
                          setShowDropdown(false);
                        }}
                      >
                        <Text style={[
                          styles.dropdownOptionText,
                          !selectedWardFilter && styles.dropdownOptionTextSelected
                        ]}>
                          {t('all_divisions')}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.dropdownOption,
                          selectedWardFilter === 'parks' && styles.dropdownOptionSelected
                        ]}
                        onPress={() => {
                          handleWardSelect('parks');
                          setShowDropdown(false);
                        }}
                      >
                        <Text style={[
                          styles.dropdownOptionText,
                          selectedWardFilter === 'parks' && styles.dropdownOptionTextSelected
                        ]}>
                          {t('parks')}
                        </Text>
                      </TouchableOpacity>

                      {getDivisionList().map(ward => (
                        <TouchableOpacity
                          key={`dropdown-ward-${ward.id}`}
                          style={[
                            styles.dropdownOption,
                            selectedWardFilter === ward.id && styles.dropdownOptionSelected
                          ]}
                          onPress={() => {
                            handleWardSelect(ward.id);
                            setShowDropdown(false);
                          }}
                        >
                          <Text style={[
                            styles.dropdownOptionText,
                            selectedWardFilter === ward.id && styles.dropdownOptionTextSelected
                          ]}>
                            {ward.name === 'Ward 61' ? t('highways') : ward.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {renderLargeSidebarStats()}
            </View>
          ) : activeTab === 'registrations' ? (
            renderRegistrationRequests()
          ) : (
            renderWorkerManagement()
          )}
        </View>

        {/* Map on the Right, taking full screen */}
        <View style={styles.largeMapWrapper}>
          <MapView
            ref={mapRef}
            style={styles.map}
            mapType="satellite"
            initialRegion={regionRef.current}
            onRegionChangeComplete={onRegionChangeComplete}
          >
            <MemoizedWards
              wardStats={getFilteredWards()}
              selectedWardId={selectedWard ? selectedWard.id : null}
              onWardPress={setSelectedWard}
            />

            <MemoizedRoadLayers
              pendingRoads={pendingRoads}
              activeRoads={activeRoads}
              completedRoads={completedRoads}
              rejectedRoads={rejectedRoads}
              isZoomedOut={isZoomedOut}
              onRoadPress={handleRoadPress}
            />

            <MemoizedRows
              rows={getFilteredRows()}
              isZoomedOut={isZoomedOut}
            />

            {machines.map(m => (
               <Marker
                 key={m.id}
                 coordinate={{ latitude: parseFloat(m.current_lat), longitude: parseFloat(m.current_lng) }}
                 title={m.name}
                 description={`Last updated: ${new Date(m.last_updated).toLocaleTimeString()}`}
                 tracksViewChanges={false}
               >
                  <View style={styles.machineMarkerContainer}>
                     <View style={styles.truckIconWrapper}>
                        <Text style={{fontSize: 22}}>🚜</Text>
                        <View style={styles.statusDot} />
                     </View>
                     <View style={styles.labelBubble}>
                        <Text style={styles.labelText}>{m.name}</Text>
                     </View>
                  </View>
               </Marker>
            ))}

            {selectedWardFilter === 'parks' && tasks.filter(t => t.task_type === 'park').map(task => {
              const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
              const pt = coords[0];
              if (!pt || !pt.latitude || !pt.longitude) return null;

              const statusColor = getStatusColor(task.status);
              return (
                <Marker
                  key={`park-large-${task.id}`}
                  coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
                  title={task.title || 'Park'}
                  description={`Status: ${task.status ? task.status.toUpperCase() : 'PENDING'}`}
                >
                  <View style={[styles.markerPin, { backgroundColor: statusColor }]}>
                    <Ionicons name="leaf" size={12} color="white" />
                  </View>
                  <Callout>
                    <View style={styles.calloutContainer}>
                      <Text style={styles.calloutTitle}>{task.title || 'Park'}</Text>
                      <Text style={styles.calloutStatus}>{task.status ? task.status.toUpperCase() : 'PENDING'}</Text>
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
          
           {/* Map Legend */}
           <View style={[styles.legend, Colors.shadowMedium]}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.success || '#10B981' }]} /><Text style={styles.legendText}>Cleaned (Green)</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.warning || '#F59E0B' }]} /><Text style={styles.legendText}>Active (Yellow)</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.uncleaned || '#EF4444' }]} /><Text style={styles.legendText}>Uncleaned (Red)</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.rejected || '#F97316' }]} /><Text style={styles.legendText}>Rejected Photo (Orange)</Text></View>
           </View>

           {/* Selected Ward Info Hover Overlay */}
           {selectedWard && (
             <View style={[styles.hoverBox, Colors.shadowMedium]}>
               <View style={styles.hoverHeader}>
                 <Text style={styles.hoverTitle}>{selectedWard.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedWard(null)} style={styles.closeBtn} activeOpacity={0.7} accessibilityLabel="Close Ward Info">
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
               </View>
               <View style={styles.hoverContent}>
                 <Text style={styles.hoverSubtitle}>👷 Assigned Jawans:</Text>
                 {selectedWard.jawans && selectedWard.jawans.length > 0 ? (
                   selectedWard.jawans.map((jawan, idx) => (
                     <View key={idx} style={styles.jawanRow}>
                       <Text style={styles.jawanName}>• {jawan.name || 'Unknown'}</Text>
                       {jawan.phone ? (
                         <Text style={styles.jawanPhone}>📞 {jawan.phone}</Text>
                       ) : (
                         <Text style={styles.jawanPhoneNo}>No mobile listed</Text>
                       )}
                     </View>
                   ))
                 ) : (
                   <Text style={styles.noJawanText}>No jawans assigned to this ward</Text>
                 )}
                 
                 <View style={styles.progressRow}>
                   <Text style={styles.progressText}>
                     Cleaned: <Text style={{color: Colors.success, fontWeight: '800'}}>{getStatsForWard(selectedWard).completed}</Text> | 
                     Active: <Text style={{color: Colors.warning, fontWeight: '800'}}>{getStatsForWard(selectedWard).active}</Text> | 
                     Pending: <Text style={{color: Colors.accent, fontWeight: '800'}}>{getStatsForWard(selectedWard).pending}</Text> | Rejected: <Text style={{color: Colors.rejected || '#F97316', fontWeight: '800'}}>{getStatsForWard(selectedWard).rejected || 0}</Text>
                   </Text>
                 </View>
               </View>
             </View>
           )}

           {isZoomedOut && (
             <View style={styles.zoomHintBox}>
               <Text style={styles.zoomHintText}>🔍 Zoom in to view detailed road networks</Text>
             </View>
           )}
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <View style={styles.container}>
      <Header small={true} />
      
      <View style={[styles.header, Colors.shadowLow]}>
        <View>
          <Text style={styles.headerTitle}>{t('login_title')}</Text>
          <Text style={styles.headerRole}>{t('login_subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
          <Text style={{ fontSize: 13, marginRight: 4 }}>🚪</Text>
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'map' && styles.activeTabButton]}
          onPress={() => setActiveTab('map')}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={18} color={activeTab === 'map' ? Colors.primary : Colors.textSecondary} />
          <Text style={{ fontSize: 15, marginRight: 4 }}>🗺️</Text>
          <Text style={[styles.tabText, activeTab === 'map' && styles.activeTabText]}>{t('overview_map')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'registrations' && styles.activeTabButton]}
          onPress={() => setActiveTab('registrations')}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={18} color={activeTab === 'registrations' ? Colors.primary : Colors.textSecondary} />
          <Text style={{ fontSize: 15, marginRight: 4 }}>👥</Text>
          <Text style={[styles.tabText, activeTab === 'registrations' && styles.activeTabText]}>{t('pending')}</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'workers' && styles.activeTabButton]}
          onPress={() => setActiveTab('workers')}
          activeOpacity={0.8}
        >
          <Ionicons name="swap-horizontal-outline" size={18} color={activeTab === 'workers' ? Colors.primary : Colors.textSecondary} />
          <Text style={{ fontSize: 15, marginRight: 4 }}>👷</Text>
          <Text style={[styles.tabText, activeTab === 'workers' && styles.activeTabText]}>{t('manage_jawans')}</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'map' ? (
        <>
          {/* Dropdown Division Selector */}
          <View style={styles.dropdownContainer}>
            <TouchableOpacity 
              style={[styles.dropdownButton, Colors.shadowLow]} 
              onPress={() => setShowDropdown(!showDropdown)}
              activeOpacity={0.8}
            >
              <View style={styles.dropdownButtonContent}>
                <Ionicons name="filter-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, marginRight: 6 }}>🔍</Text>
                <Text style={styles.dropdownButtonText}>
                  {selectedWardFilter === 'parks'
                    ? t('parks')
                    : selectedWardFilter 
                      ? (wardStats.find(w => w.id === selectedWardFilter)?.name === 'Ward 61'
                         ? t('highways')
                         : `${t('division_text')}: ${wardStats.find(w => w.id === selectedWardFilter)?.name || (typeof selectedWardFilter === 'string' ? selectedWardFilter : t('select_division'))}`) 
                      : t('select_division')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons 
                  name={showDropdown ? "chevron-up" : "chevron-down"} 
                  size={18} 
                  color={Colors.textSecondary} 
                />
                <Text style={{ fontSize: 11, color: Colors.textSecondary, fontWeight: '900', marginLeft: 4 }}>{showDropdown ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>

            {showDropdown && (
              <View style={[styles.dropdownMenu, Colors.shadowMedium]}>
                <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled={true}>
                  <TouchableOpacity
                    style={[
                      styles.dropdownOption,
                      !selectedWardFilter && styles.dropdownOptionSelected
                    ]}
                    onPress={() => {
                      handleWardSelect(null);
                      setShowDropdown(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownOptionText,
                      !selectedWardFilter && styles.dropdownOptionTextSelected
                    ]}>
                      {t('all_divisions')}
                    </Text>
                  </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.dropdownOption,
                          selectedWardFilter === 'parks' && styles.dropdownOptionSelected
                        ]}
                        onPress={() => {
                          handleWardSelect('parks');
                          setShowDropdown(false);
                        }}
                      >
                    <Text style={[
                      styles.dropdownOptionText,
                      selectedWardFilter === 'parks' && styles.dropdownOptionTextSelected
                    ]}>
                      {t('parks')}
                    </Text>
                  </TouchableOpacity>

                  {getDivisionList().map(ward => (
                    <TouchableOpacity
                      key={`dropdown-ward-${ward.id}`}
                      style={[
                        styles.dropdownOption,
                        selectedWardFilter === ward.id && styles.dropdownOptionSelected
                      ]}
                      onPress={() => {
                        handleWardSelect(ward.id);
                        setShowDropdown(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownOptionText,
                        selectedWardFilter === ward.id && styles.dropdownOptionTextSelected
                      ]}>
                        {ward.name === 'Ward 61' ? t('highways') : ward.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.statsContainer}>
              <View style={[styles.statBox, { backgroundColor: Colors.successBg }, Colors.shadowLow]}>
                <Ionicons name="checkbox-outline" size={20} color={Colors.success} style={{ marginBottom: 2 }} />
                <Text style={[styles.statVal, { color: Colors.success }]}>{getStatsValues().completed}</Text>
                <Text style={styles.statLabel}>{t('cleaned')}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: Colors.warningBg }, Colors.shadowLow]}>
                <Ionicons name="hourglass-outline" size={20} color={Colors.warning} style={{ marginBottom: 2 }} />
                <Text style={[styles.statVal, { color: Colors.warning }]}>{getStatsValues().active}</Text>
                <Text style={styles.statLabel}>{t('active')}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: Colors.errorBg }, Colors.shadowLow]}>
                <Ionicons name="alert-circle-outline" size={20} color={Colors.accent} style={{ marginBottom: 2 }} />
                <Text style={[styles.statVal, { color: Colors.accent }]}>{getStatsValues().pending}</Text>
                <Text style={styles.statLabel}>{t('pending')}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: `${Colors.blue}10` }, Colors.shadowLow]}>
                <Ionicons 
                  name={selectedWardFilter === 'parks' ? "leaf-outline" : "bus-outline"} 
                  size={20} 
                  color={Colors.blue} 
                  style={{ marginBottom: 2 }}
                />
                <Text style={[styles.statVal, { color: Colors.blue }]}>
                  {selectedWardFilter === 'parks'
                    ? tasks.filter(t => t.task_type === 'park').length
                    : machines.length}
                </Text>
                <Text style={styles.statLabel}>
                  {selectedWardFilter === 'parks' ? t('parks') : t('trucks')}
                </Text>
              </View>
          </View>

          <View style={styles.mapWrapper}>
            <MapView
              ref={mapRef}
              style={styles.map}
              mapType="satellite"
              initialRegion={regionRef.current}
              onRegionChangeComplete={onRegionChangeComplete}
            >
              <MemoizedWards
                wardStats={getFilteredWards()}
                selectedWardId={selectedWard ? selectedWard.id : null}
                onWardPress={setSelectedWard}
              />

              <MemoizedRoadLayers
                pendingRoads={pendingRoads}
                activeRoads={activeRoads}
                completedRoads={completedRoads}
                rejectedRoads={rejectedRoads}
                isZoomedOut={isZoomedOut}
                onRoadPress={handleRoadPress}
              />

              <MemoizedRows
                rows={getFilteredRows()}
                isZoomedOut={isZoomedOut}
              />

              {machines.map(m => (
                 <Marker
                   key={m.id}
                   coordinate={{ latitude: parseFloat(m.current_lat), longitude: parseFloat(m.current_lng) }}
                   title={m.name}
                   description={`Last updated: ${new Date(m.last_updated).toLocaleTimeString()}`}
                   tracksViewChanges={false}
                 >
                    <View style={styles.machineMarkerContainer}>
                       <View style={styles.truckIconWrapper}>
                          <Text style={{fontSize: 22}}>🚜</Text>
                          <View style={styles.statusDot} />
                       </View>
                       <View style={styles.labelBubble}>
                          <Text style={styles.labelText}>{m.name}</Text>
                       </View>
                    </View>
                 </Marker>
              ))}

              {selectedWardFilter === 'parks' && tasks.filter(t => t.task_type === 'park').map(task => {
                const coords = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
                const pt = coords[0];
                if (!pt || !pt.latitude || !pt.longitude) return null;

                const statusColor = getStatusColor(task.status);
                return (
                  <Marker
                    key={`park-${task.id}`}
                    coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
                    title={task.title || 'Park'}
                    description={`Status: ${task.status ? task.status.toUpperCase() : 'PENDING'}`}
                  >
                    <View style={[styles.markerPin, { backgroundColor: statusColor }]}>
                      <Ionicons name="leaf" size={12} color="white" />
                    </View>
                    <Callout>
                      <View style={styles.calloutContainer}>
                        <Text style={styles.calloutTitle}>{task.title || 'Park'}</Text>
                        <Text style={styles.calloutStatus}>{task.status ? task.status.toUpperCase() : 'PENDING'}</Text>
                      </View>
                    </Callout>
                  </Marker>
                );
              })}
            </MapView>
            
            {/* Map Legend */}
            <View style={[styles.legend, Colors.shadowMedium]}>
               <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.success || '#10B981' }]} /><Text style={styles.legendText}>{t('cleaned')} (Green)</Text></View>
               <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.warning || '#F59E0B' }]} /><Text style={styles.legendText}>{t('active')} (Yellow)</Text></View>
               <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.uncleaned || '#EF4444' }]} /><Text style={styles.legendText}>Uncleaned (Red)</Text></View>
               <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.rejected || '#F97316' }]} /><Text style={styles.legendText}>Rejected (Orange)</Text></View>
            </View>

            {/* Selected Ward Info Hover Overlay */}
            {selectedWard && (
              <View style={[styles.hoverBox, Colors.shadowMedium]}>
                <View style={styles.hoverHeader}>
                  <Text style={styles.hoverTitle}>{selectedWard.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedWard(null)} style={styles.closeBtn} activeOpacity={0.7} accessibilityLabel="Close Ward Info">
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.hoverContent}>
                  <Text style={styles.hoverSubtitle}>👷 {t('active_jawan')}:</Text>
                  {selectedWard.jawans && selectedWard.jawans.length > 0 ? (
                    selectedWard.jawans.map((jawan, idx) => (
                      <View key={idx} style={styles.jawanRow}>
                        <Text style={styles.jawanName}>• {jawan.name || 'Unknown'}</Text>
                        {jawan.phone ? (
                          <Text style={styles.jawanPhone}>📞 {jawan.phone}</Text>
                        ) : (
                          <Text style={styles.jawanPhoneNo}>{t('no_mobile_listed')}</Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noJawanText}>{t('no_jawans_assigned')}</Text>
                  )}
                  
                  <View style={styles.progressRow}>
                    <Text style={styles.progressText}>
                      {t('cleaned')}: <Text style={{color: Colors.success, fontWeight: '800'}}>{getStatsForWard(selectedWard).completed}</Text> | 
                      {t('active')}: <Text style={{color: Colors.warning, fontWeight: '800'}}>{getStatsForWard(selectedWard).active}</Text> | 
                      {t('pending')}: <Text style={{color: Colors.accent, fontWeight: '800'}}>{getStatsForWard(selectedWard).pending}</Text> | 
                      Rejected: <Text style={{color: Colors.rejected, fontWeight: '800'}}>{getStatsForWard(selectedWard).rejected || 0}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {isZoomedOut && (
              <View style={styles.zoomHintBox}>
                <Text style={styles.zoomHintText}>🔍 {t('zoom_hint')}</Text>
              </View>
            )}
          </View>
        </>
      ) : activeTab === 'registrations' ? (
        renderRegistrationRequests()
      ) : (
        renderWorkerManagement()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { marginTop: 10, color: Colors.textSecondary, fontWeight: '600' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  headerRole: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginTop: 1 },
  logout: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 6, 
    paddingHorizontal: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: `${Colors.accent}30`,
    backgroundColor: `${Colors.accent}08`
  },
  logoutText: { color: Colors.accent, fontWeight: '700', fontSize: 11, marginLeft: 4 },
  
  statsContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: Colors.background 
  },
  statBox: { 
    width: '23%', 
    paddingVertical: 10, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 4, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.2 },
  
  mapWrapper: { flex: 1, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  legend: { 
    position: 'absolute', 
    bottom: 20, 
    right: 15, 
    backgroundColor: 'rgba(255,255,255,0.92)', 
    padding: 10, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendText: { fontSize: 11, fontWeight: '800', color: Colors.text },
  
  machineMarkerContainer: { alignItems: 'center', justifyContent: 'center' },
  truckIconWrapper: { 
    backgroundColor: Colors.white, 
    padding: 6, 
    borderRadius: 18, 
    borderWidth: 2, 
    borderColor: Colors.primary,
    position: 'relative'
  },
  statusDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: Colors.success, 
    borderWidth: 1.5, 
    borderColor: '#fff', 
    position: 'absolute', 
    bottom: -2, 
    right: -2 
  },
  labelBubble: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4
  },
  labelText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  
  hoverBox: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 100,
  },
  hoverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  hoverTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    zIndex: 10,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 18,
    textAlign: 'center',
  },
  hoverContent: {
    marginTop: 4,
  },
  hoverSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  jawanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  jawanName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  jawanPhone: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
  },
  jawanPhoneNo: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  noJawanText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginVertical: 4,
  },
  progressRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  zoomHintBox: {
    position: 'absolute',
    top: 15,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 99,
  },
  zoomHintText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  activeTabText: {
    color: Colors.primary,
  },
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  
  registrationsList: {
    padding: 20,
  },
  regCard: {
    backgroundColor: Colors.card,
    borderRadius: Colors.radiusMedium,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  regHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 10,
  },
  regName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.1,
  },
  regPhone: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  regRoleTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  regRoleText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  regDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  regDetailText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
    marginLeft: 6,
  },
  regActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -5,
  },
  regBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginHorizontal: 5,
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  rejectBtn: {
    backgroundColor: Colors.accent,
  },
  regBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 4,
  },
  
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  
  dropdownContainer: {
    marginHorizontal: 15,
    marginVertical: 10,
    zIndex: 1000,
    position: 'relative',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  dropdownButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 10000,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownOptionSelected: {
    backgroundColor: `${Colors.primary}08`,
  },
  dropdownOptionText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dropdownOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '800',
  },
  
  largeMainContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
    height: '100%',
    width: '100%',
  },
  sidebar: {
    width: 360,
    height: '100%',
    backgroundColor: Colors.card,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sidebarStatsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 15,
    justifyContent: 'space-between',
  },
  sidebarStatBox: {
    width: '47%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emojiFallback: {
    fontSize: 14,
    marginLeft: 3,
  },
  largeMapWrapper: {
    flex: 1,
    height: '100%',
    position: 'relative',
  },
  markerPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  calloutContainer: {
    padding: 8,
    minWidth: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  calloutStatus: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  transferModal: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  modalWardsListWrapper: {
    height: 250,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  modalWardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalWardItemSelected: {
    backgroundColor: Colors.primary,
  },
  modalWardItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  modalWardItemTextSelected: {
    color: Colors.white,
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 10,
  },
  modalCancelBtn: {
    backgroundColor: 'rgba(100,116,139,0.15)',
  },
  modalConfirmBtn: {
    backgroundColor: Colors.primary,
  },
  modalCancelBtnText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  modalConfirmBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
