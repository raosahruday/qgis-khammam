import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import MapView, { Polygon, Polyline, Marker, Geojson, RoadsLayer } from '../../components/MapViewWrapper';
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
             fillColor={isSelected ? "rgba(255, 214, 0, 0.12)" : "rgba(255, 255, 255, 0.05)"}
             strokeColor={isSelected ? "#FFD600" : "rgba(255, 255, 255, 0.65)"}
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
// This prevents the race condition of 4,332+ simultaneous Leaflet useEffect calls
// that caused most roads to be invisible on production.
const MemoizedRoadLayers = React.memo(({ pendingRoads, activeRoads, completedRoads, isZoomedOut, onRoadPress }) => {
  const w = isZoomedOut ? 1.0 : 1.75;
  return (
    <>
      {/* Pending roads — Red, lowest priority */}
      <RoadsLayer
        features={pendingRoads}
        color="#D32F2F"
        weight={w}
        onFeaturePress={onRoadPress}
      />
      {/* Completed roads — Green */}
      <RoadsLayer
        features={completedRoads}
        color="#2E7D32"
        weight={w + 0.5}
        onFeaturePress={onRoadPress}
      />
      {/* Active roads — Yellow, highest priority */}
      <RoadsLayer
        features={activeRoads}
        color="#FFD600"
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
                   fillColor="rgba(255, 152, 0, 0.15)"
                   strokeColor="rgba(255, 152, 0, 0.6)"
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
    if (!selectedWardFilter) return wardStats;
    return wardStats.filter(w => w.id === selectedWardFilter);
  };

  const getFilteredRoads = () => {
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

  const getStatsValues = () => {
    if (selectedWardFilter) {
      const selectedWardObj = wardStats.find(w => w.id === selectedWardFilter);
      return getStatsForWard(selectedWardObj);
    }
    
    const roads = infrastructure.filter(item => item.type === 'road');
    return getRoadStats(roads);
  };

  const handleWardSelect = (wardId) => {
    setSelectedWardFilter(wardId);
    if (!wardId) {
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
  const debounceTimer = useRef(null);
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

  // Pre-classify all filtered roads into pending/active/completed buckets.
  // useMemo ensures this only recalculates when data actually changes,
  // and the result is passed as stable arrays to MemoizedRoadLayers.
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
        // No task assigned — road is pending
        pending.push(entry);
      } else if (task.status === 'approved') {
        // SI approved — road is cleaned (green)
        completed.push(entry);
      } else if (task.status === 'submitted' || task.status === 'in_progress') {
        // Jawan submitted / actively working — road is active (yellow)
        active.push(entry);
      } else {
        // Task exists but status is 'pending' or unknown — still show as pending (red)
        pending.push(entry);
      }
    });

    return { pendingRoads: pending, activeRoads: active, completedRoads: completed };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infrastructure, tasks, selectedWardFilter]);

  // Road press handler for map tap info
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
        <Text>Loading Municipal Overview...</Text>
      </View>
    );
  }

  const getTaskColor = (status) => {
      switch(status) {
          case 'approved': return '#2E7D32'; // Green
          case 'submitted': return '#FFD600'; // Yellow
          default: return '#D32F2F'; // Red
      }
  };

  return (
    <View style={styles.container}>
      <Header />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Khammam Progress</Text>
        <TouchableOpacity style={styles.logout} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'map' && styles.activeTabButton]}
          onPress={() => setActiveTab('map')}
        >
          <Ionicons name="map-outline" size={18} color={activeTab === 'map' ? Colors.primary : '#666'} />
          <Text style={[styles.tabText, activeTab === 'map' && styles.activeTabText]}>Overview Map</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'registrations' && styles.activeTabButton]}
          onPress={() => setActiveTab('registrations')}
        >
          <Ionicons name="people-outline" size={18} color={activeTab === 'registrations' ? Colors.primary : '#666'} />
          <Text style={[styles.tabText, activeTab === 'registrations' && styles.activeTabText]}>New Registrations</Text>
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
              style={styles.dropdownButton} 
              onPress={() => setShowDropdown(!showDropdown)}
            >
              <View style={styles.dropdownButtonContent}>
                <Ionicons name="filter-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dropdownButtonText}>
                  {selectedWardFilter 
                    ? `Division: ${wardStats.find(w => w.id === selectedWardFilter)?.name}` 
                    : 'Select Division (All)'}
                </Text>
              </View>
              <Ionicons 
                name={showDropdown ? "chevron-up" : "chevron-down"} 
                size={18} 
                color="#666" 
              />
            </TouchableOpacity>

            {showDropdown && (
              <View style={styles.dropdownMenu}>
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
              <View style={[styles.statBox, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[styles.statVal, { color: '#2E7D32' }]}>{getStatsValues().completed}</Text>
                <Text style={styles.statLabel}>Cleaned</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FFFDE7' }]}>
                <Text style={[styles.statVal, { color: '#FBC02D' }]}>{getStatsValues().active}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FFEBEE' }]}>
                <Text style={[styles.statVal, { color: '#C62828' }]}>{getStatsValues().pending}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#E3F2FD' }]}>
                <Text style={[styles.statVal, { color: '#1565C0' }]}>{machines.length}</Text>
                <Text style={styles.statLabel}>Trucks</Text>
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
              {/* Ward Boundaries (Memoized to prevent UI thread lag) */}
              <MemoizedWards
                wardStats={getFilteredWards()}
                selectedWardId={selectedWard ? selectedWard.id : null}
                onWardPress={setSelectedWard}
              />

              {/* Draw all QGIS infrastructure roads colored by task status.
                  Uses batched GeoJSON layers (3 operations) instead of individual
                  Polylines (4,332+ operations) to fix the race condition on production. */}
              <MemoizedRoadLayers
                pendingRoads={pendingRoads}
                activeRoads={activeRoads}
                completedRoads={completedRoads}
                isZoomedOut={isZoomedOut}
                onRoadPress={handleRoadPress}
              />

              {/* Non-road infrastructure geometries (Memoized) */}
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
                          <Text style={{fontSize: 24}}>🚜</Text>
                          <View style={styles.statusDot} />
                       </View>
                       <View style={styles.labelBubble}>
                          <Text style={styles.labelText}>{m.name}</Text>
                       </View>
                    </View>
                 </Marker>
              ))}
            </MapView>
            
             {/* Map Legend */}
             <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2E7D32' }]} /><Text style={styles.legendText}>Cleaned</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FFD600' }]} /><Text style={styles.legendText}>Active</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#D32F2F' }]} /><Text style={styles.legendText}>Pending</Text></View>
             </View>

             {/* Selected Ward Info Hover Overlay */}
             {selectedWard && (
               <View style={styles.hoverBox}>
                 <View style={styles.hoverHeader}>
                   <Text style={styles.hoverTitle}>{selectedWard.name}</Text>
                   <TouchableOpacity onPress={() => setSelectedWard(null)} style={styles.closeBtn}>
                     <Text style={styles.closeText}>✕</Text>
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
                       Cleaned: <Text style={{color: '#2E7D32', fontWeight: 'bold'}}>{getStatsForWard(selectedWard).completed}</Text> | 
                       Active: <Text style={{color: '#FBC02D', fontWeight: 'bold'}}>{getStatsForWard(selectedWard).active}</Text> | 
                       Pending: <Text style={{color: '#C62828', fontWeight: 'bold'}}>{getStatsForWard(selectedWard).pending}</Text>
                     </Text>
                   </View>
                 </View>
               </View>
             )}

             {/* Zoom suggestion hint */}
             {isZoomedOut && (
               <View style={styles.zoomHintBox}>
                 <Text style={styles.zoomHintText}>🔍 Zoom in to view detailed road networks</Text>
               </View>
             )}
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.registrationsList}>
          {pendingUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={60} color="#999" />
              <Text style={styles.emptyText}>No pending registrations to approve</Text>
            </View>
          ) : (
            pendingUsers.map(u => (
              <View key={u.id} style={styles.regCard}>
                <View style={styles.regHeader}>
                  <Text style={styles.regName}>{u.name}</Text>
                  <View style={[
                    styles.regRoleTag, 
                    { backgroundColor: u.role === 'worker' ? '#E3F2FD' : '#EDE7F6' }
                  ]}>
                    <Text style={[
                      styles.regRoleText, 
                      { color: u.role === 'worker' ? '#1565C0' : '#5E35B1' }
                    ]}>
                      {u.role === 'worker' ? 'Jawan' : 'Sanitary Inspector'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.regDetailRow}>
                  <Ionicons name="call-outline" size={16} color="#666" style={{ marginRight: 8 }} />
                  <Text style={styles.regDetailText}>{u.phone || 'No mobile listed'}</Text>
                </View>
                
                <View style={styles.regDetailRow}>
                  <Ionicons name="grid-outline" size={16} color="#666" style={{ marginRight: 8 }} />
                  <Text style={styles.regDetailText}>
                    {u.role === 'worker' ? `Division: ${u.divisions}` : `Divisions: ${u.divisions}`}
                  </Text>
                </View>
                
                <View style={styles.regActions}>
                  <TouchableOpacity 
                    style={[styles.regBtn, styles.approveBtn]} 
                    onPress={() => handleApprove(u.id)}
                  >
                    <Text style={styles.regBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.regBtn, styles.rejectBtn]} 
                    onPress={() => handleReject(u.id)}
                  >
                    <Text style={styles.regBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
  logout: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D32F2F' },
  logoutText: { color: '#D32F2F', fontWeight: 'bold' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#fff' },
  statBox: { width: '23.5%', padding: 12, borderRadius: 15, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  statVal: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 10, color: '#666', marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  mapWrapper: { flex: 1, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  legend: { 
    position: 'absolute', 
    bottom: 25, 
    right: 20, 
    backgroundColor: 'rgba(255,255,255,0.95)', 
    padding: 12, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendText: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  machineMarkerContainer: { alignItems: 'center', justifyContent: 'center' },
  truckIconWrapper: { 
    backgroundColor: '#fff', 
    padding: 6, 
    borderRadius: 18, 
    borderWidth: 2, 
    borderColor: '#3F51B5',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    position: 'relative'
  },
  statusDot: { 
    width: 12, 
    height: 12, 
    borderRadius: 6, 
    backgroundColor: '#4CAF50', 
    borderWidth: 2, 
    borderColor: '#fff', 
    position: 'absolute', 
    bottom: -3, 
    right: -3 
  },
  labelBubble: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4
  },
  labelText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  hoverBox: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    zIndex: 100,
  },
  hoverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 8,
    marginBottom: 8,
  },
  hoverTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 12,
    color: '#888',
    fontWeight: 'bold',
  },
  hoverContent: {
    marginTop: 4,
  },
  hoverSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  jawanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  jawanName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  jawanPhone: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
  },
  jawanPhoneNo: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  noJawanText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginVertical: 4,
  },
  progressRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    textAlign: 'center',
  },
  zoomHintBox: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 99,
  },
  zoomHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: Colors.primary || '#007bff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginLeft: 6,
  },
  activeTabText: {
    color: Colors.primary || '#007bff',
  },
  badge: {
    backgroundColor: '#D32F2F',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  registrationsList: {
    padding: 15,
  },
  regCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  regHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 8,
  },
  regName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  regRoleTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  regRoleText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  regDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  regDetailText: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
  regActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  regBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  approveBtn: {
    backgroundColor: '#2E7D32',
  },
  rejectBtn: {
    backgroundColor: '#C62828',
  },
  regBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 10,
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 10000,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  dropdownOptionSelected: {
    backgroundColor: '#E8F5E9',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#555',
  },
  dropdownOptionTextSelected: {
    color: '#2E7D32',
    fontWeight: 'bold',
  },
});
