import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, FlatList, Alert, TouchableOpacity } from 'react-native';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';

// IMPORTANT: Adjust to your local network URL if testing on a real device
const API_BASE_URL = 'http://192.168.0.114:5000';

export default function PhotoReviewScreen({ route, navigation }) {
  const { taskId } = route.params;
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const res = await api.get(`/tasks/${taskId}/photos`);
        setPhotos(res.data);
      } catch (error) {
        Alert.alert('Error', 'Failed to fetch photos');
      } finally {
        setLoading(false);
      }
    };
    fetchPhotos();
  }, [taskId]);

  const updateStatus = async (status) => {
    try {
      await api.put(`/tasks/${taskId}/${status}`);
      Alert.alert('Success', `Task ${status}ed successfully`);
      navigation.goBack();
    } catch (error) {
      const errorMsg = error.response?.data?.details || error.response?.data?.error || error.message;
      Alert.alert('Error', `Failed to ${status} task: ${errorMsg}`);
    }
  };

  const renderPhoto = ({ item }) => (
    <View style={styles.photoContainer}>
      <Image source={{ uri: `${API_BASE_URL}${item.image_url}` }} style={styles.image} />
      <Text style={styles.caption}>Uploaded: {new Date(item.uploaded_at).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" style={{ marginTop: 20 }} />
      ) : (
        <>
          <FlatList
            data={photos}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderPhoto}
            ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No photos submitted yet.</Text>}
          />
          {user?.role !== 'commissioner' && (
            <View style={styles.actionContainer}>
              <TouchableOpacity style={[styles.button, styles.rejectBtn]} onPress={() => updateStatus('reject')}>
                <Text style={styles.btnText}>Reject Task</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.approveBtn]} onPress={() => updateStatus('approve')}>
                <Text style={styles.btnText}>Approve Task</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  photoContainer: { padding: 15, backgroundColor: '#fff', marginBottom: 10, alignItems: 'center' },
  image: { width: 300, height: 300, borderRadius: 10, resizeMode: 'cover' },
  caption: { marginTop: 10, color: '#666' },
  actionContainer: { flexDirection: 'row', justifyContent: 'space-around', padding: 20, backgroundColor: '#fff' },
  button: { padding: 15, borderRadius: 10, flex: 1, marginHorizontal: 5, alignItems: 'center' },
  rejectBtn: { backgroundColor: '#dc3545' },
  approveBtn: { backgroundColor: '#28a745' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
