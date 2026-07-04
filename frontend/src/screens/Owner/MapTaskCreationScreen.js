import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker, Polygon } from '../../components/MapViewWrapper';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
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
      
      // GIS Zoom optimization: if zoomed out too far, don't load detailed overlays
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
      // Auto-select the first ward for supervisors (they typically manage one)
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
      Alert.alert('Error', 'Please provide a title and at least 2 points to draw a line on the map.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/tasks', {
        title,
        description,
        area_geojson: coordinates,
        assignedWorkerId: selectedWorkerId || null,
        wardId: selectedWardId || null,
        taskType: 'road',
        lineId: lineId || null,
        rdName: rdName || title
      });
      Alert.alert('Success', 'Road Task created successfully!');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to create task');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header />
      
      <View style={styles.infoBanner}>
        <Ionicons name="git-commit-outline" size={20} color={Colors.primary} />
        <Text style={styles.infoBannerText}>Draw Road Segment (Multiple points for curves)</Text>
      </View>

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
                  strokeColor={item.type === 'road' ? '#1A73E8' : 'rgba(66,133,244,0.5)'}
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
                     
                     // Set coordinates to match this polyline
                     const polyCoords = cList.map(c => ({ longitude: c[0], latitude: c[1] }));
                     setCoordinates(polyCoords);
                     
                     Alert.alert('Road Selected', `Road: ${rdNameVal}\nLine ID: ${lineIdVal}`);
                  }}
                />
              ));
           } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
              const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
              return polys.map((poly, idx) => {
                 const ring = Array.isArray(poly[0][0]) ? poly[0] : poly;
                 // Style based on type
                 let fillColor = "rgba(255, 255, 255, 0.02)";
                 let strokeColor = "rgba(255, 255, 255, 0.1)";
                 let strokeWidth = 0.5;
                 let lineDash = null;
                 
                 if (item.type === 'row') {
                    fillColor = "rgba(255, 152, 0, 0.15)";
                    strokeColor = "rgba(255, 152, 0, 0.6)";
                    strokeWidth = 1;
                 } else if (item.type === 'ward') {
                    fillColor = "rgba(255, 255, 255, 0.03)";
                    strokeColor = "rgba(255, 255, 255, 0.45)";
                    strokeWidth = 1;
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

        {coordinates.map((coord, index) => (
          <Marker 
            key={index} 
            coordinate={coord} 
            anchor={{x: 0.5, y: 0.5}}
            zIndex={21}
          >
            <View style={[styles.dotMarker, index === 0 && {backgroundColor: '#4CAF50'}]} />
          </Marker>
        ))}
        {coordinates.length >= 2 && (
          <Polyline 
            coordinates={coordinates} 
            strokeColor="#FFFF00" 
            strokeWidth={2.5} 
            zIndex={20}
          />
        )}
      </MapView>

      <ScrollView style={styles.formContainer}>
        <View style={styles.headerRow}>
           <Text style={styles.helpText}>
             Tap on the map to mark the path of the road.
           </Text>
           {coordinates.length > 0 && (
              <View style={{flexDirection: 'row'}}>
                <TouchableOpacity onPress={undoLastPoint} style={{marginRight: 10, backgroundColor: '#f0f0f0', padding: 5, borderRadius: 5}}>
                   <Text style={styles.undoText}>Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={clearPoints} style={{backgroundColor: '#FFEBEE', padding: 5, borderRadius: 5}}>
                   <Text style={[styles.undoText, {color: '#D32F2F'}]}>Clear All</Text>
                </TouchableOpacity>
              </View>
           )}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Road Name / Segment Title"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, {height: 80, textAlignVertical: 'top'}]}
          placeholder="Specific instructions for this road..."
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedWorkerId}
            onValueChange={(itemValue) => setSelectedWorkerId(itemValue)}
          >
            <Picker.Item label="-- Assign Worker --" value="" />
            {workers.map(worker => (
              <Picker.Item 
                key={worker.id} 
                label={`${worker.name}`} 
                value={worker.id} 
              />
            ))}
          </Picker>
        </View>

        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedWardId}
            onValueChange={(itemValue) => setSelectedWardId(itemValue)}
          >
            <Picker.Item label="-- Assign Ward --" value="" />
            {wards.map(ward => (
              <Picker.Item 
                key={ward.id} 
                label={ward.name} 
                value={ward.id} 
              />
            ))}
          </Picker>
        </View>

        <TouchableOpacity 
           style={[styles.button, (coordinates.length < 2 || loading) ? styles.buttonDisabled : null]} 
           onPress={handleCreateTask}
           disabled={coordinates.length < 2 || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>CREATE LINE TASK</Text>}
        </TouchableOpacity>
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9f9f9', borderBottomWidth: 1, borderBottomColor: '#eee' },
  infoBannerText: { marginLeft: 10, fontWeight: 'bold', color: '#444', fontSize: 13 },
  map: { width: Dimensions.get('window').width, height: 350 },
  dotMarker: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, borderWidth: 2, borderColor: '#fff' },
  formContainer: { padding: 20, flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  helpText: { color: '#666', fontSize: 13, fontStyle: 'italic' },
  undoText: { color: Colors.primary, fontWeight: 'bold', fontSize: 12 },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  pickerContainer: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, backgroundColor: '#f9f9f9', marginBottom: 20 },
  button: { backgroundColor: Colors.primary, padding: 18, borderRadius: 12, alignItems: 'center', elevation: 3 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
