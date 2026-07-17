import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker, Polygon } from '../../components/MapViewWrapper';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function MapTaskCreationScreen({ navigation }) {
  const [coordinates, setCoordinates] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workers, setWorkers] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedWardId, setSelectedWardId] = useState('');
  const [lineId, setLineId] = useState('');
  const [rdName, setRdName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useContext(AuthContext);
  const { t } = useLocalization();

  const [titleFocused, setTitleFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  const [region, setRegion] = useState({
    latitude: 17.2473,
    longitude: 80.1514,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [infrastructure, setInfrastructure] = useState([]);
  const debounceTimer = useRef(null);

  const fetchInfrastructure = async (activeRegion) => {
    try {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = activeRegion;
      
      if (latitudeDelta > 0.025) {
         setInfrastructure([]);
         return;
      }

      const minLat = latitude - latitudeDelta / 2;
      const maxLat = latitude + latitudeDelta / 2;
      const minLng = longitude - longitudeDelta / 2;
      const maxLng = longitude + longitudeDelta / 2;

      const res = await api.get(
        `/infrastructure?minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}&latDelta=${latitudeDelta}&limit=500`
      );
      
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
    } catch (err) {
      console.error('Failed to fetch infrastructure', err);
    }
  };

  const onRegionChangeComplete = (newRegion) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchInfrastructure(newRegion), 400);
  };

  useEffect(() => {
    fetchWorkers();
    fetchWards();
  }, []);

  const fetchWorkers = async () => {
    try {
      const response = await api.get('/workers');
      setWorkers(response.data);
    } catch (error) {
      console.error('Failed to fetch workers', error);
    }
  };

  const fetchWards = async () => {
    try {
      const response = await api.get('/wards');
      setWards(response.data);
      if (response.data.length > 0 && user?.role === 'supervisor') {
        setSelectedWardId(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch wards', error);
    }
  };

  const handleMapPress = (e) => {
    setCoordinates([...coordinates, e.nativeEvent.coordinate]);
  };

  const undoLastPoint = () => {
    setCoordinates(coordinates.slice(0, -1));
  };

  const clearPoints = () => {
    setCoordinates([]);
    setLineId('');
    setRdName('');
  };

  const handleCreateTask = async () => {
    if (!title || coordinates.length < 2) {
      Alert.alert(t('error'), t('draw_line_validation_alert'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/tasks', {
        title,
        description,
        area_geojson: coordinates,
        assignedWorkerId: selectedWorkerId || null,
        wardId: selectedWardId || null,
        taskType: 'road',
        lineId: lineId || null,
        rdName: rdName || title
      });
      Alert.alert(t('success'), t('road_task_created_success'));
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('error'), t('road_task_created_failed'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header />
      
      <View style={styles.infoBanner}>
        <Ionicons name="git-branch-outline" size={18} color={Colors.primary} />
        <Text style={styles.infoBannerText}>{t('draw_road_segment_hint')}</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          mapType="satellite"
          initialRegion={region}
          onRegionChangeComplete={onRegionChangeComplete}
          onPress={handleMapPress}
          showsUserLocation={true}
        >
          {/* QGIS Infrastructure Layers */}
          {infrastructure.map(item => {
             const geom = item.parsedGeom;
             if (!geom) return null;
             
             if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
                const coords = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
                return coords.map((cList, idx) => (
                  <Polyline
                    key={`infra-road-${item.id}-${idx}`}
                    coordinates={cList.map(c => ({ longitude: c[0], latitude: c[1] }))}
                    strokeColor={item.type === 'road' ? '#3B82F6' : 'rgba(59, 130, 246, 0.5)'}
                    strokeWidth={item.type === 'road' ? 2 : 1}
                    zIndex={11}
                    tappable={true}
                    onPress={() => {
                       const props = item.properties || {};
                       const lineIdVal = props.Line_ID || props.line_id || '';
                       const rdNameVal = props.Rd_Name || props.rd_name || item.name || '';
                       
                       setTitle(rdNameVal);
                       setLineId(lineIdVal.toString());
                       setRdName(rdNameVal);
                       
                       const polyCoords = cList.map(c => ({ longitude: c[0], latitude: c[1] }));
                       setCoordinates(polyCoords);
                       
                       Alert.alert(t('road_selected_alert'), `${t('road_label')}: ${rdNameVal}\n${t('line_label')}: ${lineIdVal}`);
                    }}
                  />
                ));
             } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
                const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
                return polys.map((poly, idx) => {
                   const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
                   let fillColor = "rgba(255, 255, 255, 0.02)";
                   let strokeColor = "rgba(255, 255, 255, 0.1)";
                   let strokeWidth = 0.5;
                   
                   if (item.type === 'row') {
                      fillColor = "rgba(245, 158, 11, 0.12)";
                      strokeColor = "rgba(245, 158, 11, 0.5)";
                      strokeWidth = 1;
                   } else if (item.type === 'ward') {
                      fillColor = "rgba(255, 255, 255, 0.02)";
                      strokeColor = "rgba(255, 255, 255, 0.4)";
                      strokeWidth = 1;
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

          {coordinates.map((coord, index) => (
            <Marker 
              key={index} 
              coordinate={coord} 
              anchor={{x: 0.5, y: 0.5}}
              zIndex={21}
            >
              <View style={[styles.dotMarker, index === 0 && {backgroundColor: Colors.success}]} />
            </Marker>
          ))}
          {coordinates.length >= 2 && (
            <Polyline 
              coordinates={coordinates} 
              strokeColor="#FFEB3B" 
              strokeWidth={3} 
              zIndex={20}
            />
          )}
        </MapView>
      </View>

      <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
           <Text style={styles.helpText}>
             {coordinates.length === 0 ? t('tap_maps_to_start_drawing') : `${coordinates.length} ${t('points_marked')}`}
           </Text>
           {coordinates.length > 0 && (
              <View style={styles.drawingActions}>
                <TouchableOpacity onPress={undoLastPoint} style={[styles.drawBtn, { marginRight: 8 }]} activeOpacity={0.8}>
                   <Ionicons name="arrow-undo-outline" size={14} color={Colors.primary} />
                   <Text style={styles.undoText}>{t('undo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={clearPoints} style={[styles.drawBtn, { backgroundColor: Colors.errorBg, borderColor: `${Colors.error}20` }]} activeOpacity={0.8}>
                   <Ionicons name="trash-outline" size={14} color={Colors.error} />
                   <Text style={[styles.undoText, {color: Colors.error}]}>{t('clear')}</Text>
                </TouchableOpacity>
              </View>
           )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('road_segment_title')}</Text>
          <TextInput
            style={[styles.input, titleFocused && styles.inputFocused]}
            placeholder={t('eg_road_title')}
            placeholderTextColor={Colors.placeholder}
            value={title}
            onChangeText={setTitle}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('instructions')}</Text>
          <TextInput
            style={[styles.input, {height: 72, textAlignVertical: 'top'}, descFocused && styles.inputFocused]}
            placeholder={t('eg_road_instructions')}
            placeholderTextColor={Colors.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            onFocus={() => setDescFocused(true)}
            onBlur={() => setDescFocused(false)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('assign_jawan_optional')}</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedWorkerId}
              onValueChange={(itemValue) => setSelectedWorkerId(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label={t('select_worker_placeholder')} value="" style={styles.pickerPlaceholderItem} />
              {workers.map(worker => (
                <Picker.Item 
                  key={worker.id} 
                  label={worker.name} 
                  value={worker.id} 
                />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('assign_ward_area')}</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedWardId}
              onValueChange={(itemValue) => setSelectedWardId(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label={t('select_ward_placeholder')} value="" style={styles.pickerPlaceholderItem} />
              {wards.map(ward => (
                <Picker.Item 
                  key={ward.id} 
                  label={ward.name} 
                  value={ward.id} 
                />
              ))}
            </Picker>
          </View>
        </View>

        <TouchableOpacity 
           style={[styles.button, (coordinates.length < 2 || loading) ? styles.buttonDisabled : null, Colors.shadowMedium]} 
           onPress={handleCreateTask}
           disabled={coordinates.length < 2 || loading}
           activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
              <Text style={styles.buttonText}>{t('create_line_task').toUpperCase()}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  infoBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoBannerText: { marginLeft: 8, fontWeight: '700', color: Colors.text, fontSize: 13 },
  
  mapContainer: {
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  map: { 
    width: '100%', 
    height: 250, 
    borderRadius: Colors.radiusMedium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  
  dotMarker: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, borderWidth: 2, borderColor: '#fff' },
  formContainer: { paddingHorizontal: 20, paddingTop: 15, flex: 1 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  helpText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  drawingActions: { flexDirection: 'row' },
  drawBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: `${Colors.primary}08`, 
    paddingVertical: 5, 
    paddingHorizontal: 8, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: `${Colors.primary}20` 
  },
  undoText: { fontWeight: '700', fontSize: 11, color: Colors.primary, marginLeft: 4 },
  
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { 
    backgroundColor: Colors.card, 
    padding: 12, 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: Colors.primary,
  },
  
  pickerContainer: { 
    borderWidth: 1.5, 
    borderColor: Colors.border, 
    borderRadius: 12, 
    backgroundColor: Colors.card, 
    overflow: 'hidden',
  },
  picker: {
    color: Colors.text,
    height: 50,
  },
  pickerPlaceholderItem: {
    color: Colors.placeholder,
  },
  
  button: { 
    backgroundColor: Colors.primary, 
    padding: 15, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 15, 
  },
  buttonDisabled: { backgroundColor: Colors.placeholder },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 15, marginLeft: 8 }
});
