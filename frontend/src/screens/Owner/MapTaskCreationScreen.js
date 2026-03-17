import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
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
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const response = await api.get('/workers');
      setWorkers(response.data);
    } catch (error) {
      console.error('Failed to fetch workers', error);
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
        wardId: user?.ward_id || null,
        taskType: 'road'
      });
      Alert.alert('Success', 'Road Task created successfully!');
      navigation.replace('QRDisplay', { task: response.data });
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
        initialRegion={{
          latitude: 17.2473,
          longitude: 80.1514,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={handleMapPress}
      >
        {coordinates.map((coord, index) => (
          <Marker 
            key={index} 
            coordinate={coord} 
            anchor={{x: 0.5, y: 0.5}}
          >
            <View style={[styles.dotMarker, index === 0 && {backgroundColor: '#4CAF50'}]} />
          </Marker>
        ))}
        {coordinates.length >= 2 && (
          <Polyline 
            coordinates={coordinates} 
            strokeColor="#FFFF00" 
            strokeWidth={5} 
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

        <TouchableOpacity 
           style={[styles.button, (coordinates.length < 2 || loading) ? styles.buttonDisabled : null]} 
           onPress={handleCreateTask}
           disabled={coordinates.length < 2 || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>CREATE LINE TASK & GEN QR</Text>}
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
