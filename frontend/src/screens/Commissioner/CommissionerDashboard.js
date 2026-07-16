import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, ScrollView, Alert, useWindowDimensions } from 'react-native';
import MapView, { Polygon, Polyline, Marker, RoadsLayer, Callout } from '../../components/MapViewWrapper';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
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
const MemoizedRoadLayers = React.memo(({ pendingRoads, activeRoads, completedRoads, isZoomedOut, onRoadPress }) => {
  const w = isZoomedOut ? 1.0 : 1.75;
  return (
    <>
      {/* Pending roads — Red, lowest priority */}
      <RoadsLayer
        features={pendingRoads}
        color={Colors.accent}
        weight={w}
        onFeaturePress={onRoadPress}
      />
      {/* Completed roads — Green */}
      <RoadsLayer
        features={completedRoads}
        color={Colors.success}
        weight={w + 0.5}
        onFeaturePress={onRoadPress}
      />
      {/* Active roads — Yellow, highest priority */}
      <RoadsLayer
        features={activeRoads}
        color={Colors.warning}
        weight={w + 0.75}
        onFeaturePress={onRoadPress}
      />
    </>
  );
}, (prevProps, nextProps) => {
  return prevProps.pendingRoads === nextProps.pendingRoads &&
         prevProps.activeRoads === nextProps.activeRoads &&
         prevProps.completedRoads === nextProps.completedRoads &&
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

  const [activeTab, setActiveTab] = useState('map'); // 'map' or 'registrations'
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  const [selectedWardFilter, setSelectedWardFilter] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const mapRef = useRef(null);

  const getDivisionList = () => {
    return [...wardStats].sort((a, b) => {
      const numA = parseInt(a.name?.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.name?.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  };

  const getSelectedWardNo = () => {
    if (!selectedWardFilter) return null;
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
    const roads = infrastructure.filter(item => item.type === 'road');
    const wardNo = getSelectedWardNo();
    if (!wardNo) return roads;
    return roads.filter(road => {
      const props = road.properties || {};
      const roadWard = props.Ward_No || props.ward_no;
      return roadWard && roadWard.toString().trim() === wardNo.toString().trim();
    });
  };

  const getFilteredRows = () => {
    if (selectedWardFilter === 'parks') return [];
    const rows = infrastructure.filter(item => item.type === 'row');
    const wardNo = getSelectedWardNo();
    if (!wardNo) return rows;
    return rows.filter(row => {
      const props = row.properties || {};
      const rowWard = props.Ward_No || props.ward_no;
      return rowWard && rowWard.toString().trim() === wardNo.toString().trim();
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

    filteredRoads.forEach(road => {
      const props = road.properties || {};
      const lineId = props.Line_ID || props.line_id;
      const matchingTask = lineId ? taskMap[lineId.toString()] : null;

      if (matchingTask) {
        if (matchingTask.status === 'approved') {
          completed++;
        } else if (matchingTask.status === 'submitted' || matchingTask.status === 'in_progress') {
          active++;
        } else {
          pending++;
        }
      } else {
        pending++;
      }
    });

    return { completed, active, pending };
  };

  const getStatsForWard = (wardObj) => {
    if (!wardObj) return { completed: 0, active: 0, pending: 0 };
    
    const match = wardObj.name?.match(/\d+/);
    const wardNo = match ? match[0] : wardObj.name;
    if (!wardNo) return { completed: 0, active: 0, pending: 0 };

    const roads = infrastructure.filter(item => item.type === 'road');
    const filteredRoads = roads.filter(road => {
      const props = road.properties || {};
      const roadWard = props.Ward_No || props.ward_no;
      return roadWard && roadWard.toString().trim() === wardNo.toString().trim();
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
      default: 
        return '#EF4444'; // Red
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
        } else if (t.status === 'submitted' || t.status === 'in_progress') {
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
    
    const roads = infrastructure.filter(item => item.type === 'road');
    return getRoadStats(roads);
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
        api.get('/registrations/pending')
      ];

      const shouldFetchInfra = !hasLoadedInfra.current;
      if (shouldFetchInfra) {
        promises.push(api.get('/infrastructure?limit=6000'));
      }

      const results = await Promise.all(promises);
      const [statsRes, machinesRes, tasksRes, summaryRes, pendingRes] = results;

      if (shouldFetchInfra) {
        const infraRes = results[5];
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

  const onRegionChangeComplete = (newRegion) => {
    regionRef.current = newRegion;
    const newZoomedOut = newRegion.latitudeDelta >= 0.05;
    if (newZoomedOut !== isZoomedOut) {
      setIsZoomedOut(newZoomedOut);
    }
  };

  const { pendingRoads, activeRoads, completedRoads } = useMemo(() => {
    const filteredRoads = getFilteredRoads();
    const taskMap = {};
    tasks.forEach(t => {
      if (t.line_id) taskMap[t.line_id.toString()] = t;
    });

    const pending = [];
    const active = [];
    const completed = [];

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
      } else if (task.status === 'submitted' || task.status === 'in_progress') {
        active.push(entry);
      } else {
        pending.push(entry);
      }
    });

    return { pendingRoads: pending, activeRoads: active, completedRoads: completed };
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
                  {u.role === 'worker' ? 'Jawan' : 'Inspector'}
                </Text>
              </View>
            </View>
            
            <View style={styles.regDetailRow}>
              <Ionicons name="grid-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.regDetailText}>
                {u.role === 'worker' ? `Assigned Division: ${u.divisions}` : `Divisions List: ${u.divisions}`}
              </Text>
            </View>
            
            <View style={styles.regActions}>
              <TouchableOpacity 
                style={[styles.regBtn, styles.rejectBtn, Colors.shadowLow]} 
                onPress={() => handleReject(u.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={16} color={Colors.white} />
                <Text style={styles.regBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.regBtn, styles.approveBtn, Colors.shadowLow]} 
                onPress={() => handleApprove(u.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
                <Text style={styles.regBtnText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderLargeSidebarStats = () => {
    const statsValues = getStatsValues();
    return (
      <View style={styles.sidebarStatsContainer}>
          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.successBg }, Colors.shadowLow]}>
            <Ionicons name="checkbox-outline" size={20} color={Colors.success} />
            <Text style={[styles.statVal, { color: Colors.success }]}>{statsValues.completed}</Text>
            <Text style={styles.statLabel}>Cleaned</Text>
          </View>
          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.warningBg }, Colors.shadowLow]}>
            <Ionicons name="hourglass-outline" size={20} color={Colors.warning} />
            <Text style={[styles.statVal, { color: Colors.warning }]}>{statsValues.active}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={[styles.sidebarStatBox, { backgroundColor: Colors.errorBg }, Colors.shadowLow]}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.accent} />
            <Text style={[styles.statVal, { color: Colors.accent }]}>{statsValues.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.sidebarStatBox, { backgroundColor: `${Colors.blue}10` }, Colors.shadowLow]}>
            <Ionicons 
              name={selectedWardFilter === 'parks' ? "leaf-outline" : "bus-outline"} 
              size={20} 
              color={Colors.blue} 
            />
            <Text style={[styles.statVal, { color: Colors.blue }]}>
              {selectedWardFilter === 'parks'
                ? tasks.filter(t => t.task_type === 'park').length
                : machines.length}
            </Text>
            <Text style={styles.statLabel}>
              {selectedWardFilter === 'parks' ? 'Parks' : 'Trucks'}
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
              <Text style={styles.headerTitle}>Municipal Control</Text>
              <Text style={styles.headerRole}>Commissioner panel</Text>
            </View>
            <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'map' && styles.activeTabButton]}
              onPress={() => setActiveTab('map')}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={18} color={activeTab === 'map' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.tabText, activeTab === 'map' && styles.activeTabText]}>Overview Map</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'registrations' && styles.activeTabButton]}
              onPress={() => setActiveTab('registrations')}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={18} color={activeTab === 'registrations' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.tabText, activeTab === 'registrations' && styles.activeTabText]}>Pending</Text>
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              )}
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
                    <Text style={styles.dropdownButtonText}>
                      {selectedWardFilter === 'parks'
                        ? 'Parks'
                        : selectedWardFilter 
                          ? `Division: ${wardStats.find(w => w.id === selectedWardFilter)?.name}` 
                          : 'All Wards / Divisions'}
                    </Text>
                  </View>
                  <Ionicons 
                    name={showDropdown ? "chevron-up" : "chevron-down"} 
                    size={18} 
                    color={Colors.textSecondary} 
                  />
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
                          All Divisions
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
                          Parks
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
                            {ward.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {renderLargeSidebarStats()}
            </View>
          ) : (
            renderRegistrationRequests()
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
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.success }]} /><Text style={styles.legendText}>Cleaned</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.warning }]} /><Text style={styles.legendText}>Active</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.accent }]} /><Text style={styles.legendText}>Pending</Text></View>
           </View>

           {/* Selected Ward Info Hover Overlay */}
           {selectedWard && (
             <View style={[styles.hoverBox, Colors.shadowMedium]}>
               <View style={styles.hoverHeader}>
                 <Text style={styles.hoverTitle}>{selectedWard.name}</Text>
                 <TouchableOpacity onPress={() => setSelectedWard(null)} style={styles.closeBtn} activeOpacity={0.8}>
                   <Ionicons name="close" size={14} color={Colors.textSecondary} />
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
                     Pending: <Text style={{color: Colors.accent, fontWeight: '800'}}>{getStatsForWard(selectedWard).pending}</Text>
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
          <Text style={styles.headerTitle}>Municipal Control</Text>
          <Text style={styles.headerRole}>Commissioner Panel</Text>
        </View>
        <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'map' && styles.activeTabButton]}
          onPress={() => setActiveTab('map')}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={18} color={activeTab === 'map' ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'map' && styles.activeTabText]}>Overview Map</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'registrations' && styles.activeTabButton]}
          onPress={() => setActiveTab('registrations')}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={18} color={activeTab === 'registrations' ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'registrations' && styles.activeTabText]}>Pending</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
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
                <Text style={styles.dropdownButtonText}>
                  {selectedWardFilter === 'parks'
                    ? 'Parks'
                    : selectedWardFilter 
                      ? `Division: ${wardStats.find(w => w.id === selectedWardFilter)?.name}` 
                      : 'Select Division (All)'}
                </Text>
              </View>
              <Ionicons 
                name={showDropdown ? "chevron-up" : "chevron-down"} 
                size={18} 
                color={Colors.textSecondary} 
              />
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
                      All Divisions
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
                      Parks
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
                        {ward.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.statsContainer}>
              <View style={[styles.statBox, { backgroundColor: Colors.successBg }, Colors.shadowLow]}>
                <Text style={[styles.statVal, { color: Colors.success }]}>{getStatsValues().completed}</Text>
                <Text style={styles.statLabel}>Cleaned</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: Colors.warningBg }, Colors.shadowLow]}>
                <Text style={[styles.statVal, { color: Colors.warning }]}>{getStatsValues().active}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: Colors.errorBg }, Colors.shadowLow]}>
                <Text style={[styles.statVal, { color: Colors.accent }]}>{getStatsValues().pending}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: `${Colors.blue}10` }, Colors.shadowLow]}>
                <Text style={[styles.statVal, { color: Colors.blue }]}>
                  {selectedWardFilter === 'parks'
                    ? tasks.filter(t => t.task_type === 'park').length
                    : machines.length}
                </Text>
                <Text style={styles.statLabel}>
                  {selectedWardFilter === 'parks' ? 'Parks' : 'Trucks'}
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
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.success }]} /><Text style={styles.legendText}>Cleaned</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.warning }]} /><Text style={styles.legendText}>Active</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.accent }]} /><Text style={styles.legendText}>Pending</Text></View>
             </View>

             {/* Selected Ward Info Hover Overlay */}
             {selectedWard && (
               <View style={[styles.hoverBox, Colors.shadowMedium]}>
                 <View style={styles.hoverHeader}>
                   <Text style={styles.hoverTitle}>{selectedWard.name}</Text>
                   <TouchableOpacity onPress={() => setSelectedWard(null)} style={styles.closeBtn} activeOpacity={0.8}>
                     <Ionicons name="close" size={14} color={Colors.textSecondary} />
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
                       Pending: <Text style={{color: Colors.accent, fontWeight: '800'}}>{getStatsForWard(selectedWard).pending}</Text>
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
        </>
      ) : (
        renderRegistrationRequests()
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
});
