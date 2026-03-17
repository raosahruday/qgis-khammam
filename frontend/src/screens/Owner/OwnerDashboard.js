import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useIsFocused } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import Header from '../../components/Header';
import Colors from '../../constants/Colors';

export default function OwnerDashboard({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFocused = useIsFocused();
  const { logout } = useContext(AuthContext);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await api.get('/tasks');
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchTasks();
    }
  }, [isFocused]);

  const handleResetTask = async (taskId) => {
    Alert.alert(
      "Reset Task",
      "Are you sure you want to reset this task to PENDING? All progress will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset", 
          style: "destructive",
          onPress: async () => {
             try {
               await api.put(`/tasks/${taskId}/reset`);
               fetchTasks();
             } catch (err) {
               Alert.alert("Error", "Failed to reset task");
             }
          }
        }
      ]
    );
  };

  const handleDeleteTask = async (taskId) => {
    Alert.alert(
      "Delete Task",
      "Are you sure you want to PERMANENTLY delete this task?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
             try {
               await api.delete(`/tasks/${taskId}`);
               fetchTasks();
             } catch (err) {
               Alert.alert("Error", "Failed to delete task");
             }
          }
        }
      ]
    );
  };

  const handleDeleteAll = async () => {
    Alert.alert(
      "🧨 DANGER AREA",
      "This will PERMANENTLY DELETE ALL current tasks in your network. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "YES, DELETE EVERYTHING", 
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "Type 'DELETE' is not possible here, but are you absolutely 100% sure?",
              [
                { text: "Stop", style: "cancel" },
                {
                  text: "PROCEED WITH PURGE",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.delete('/tasks/all');
                      Alert.alert("Success", "All tasks have been purged.");
                      fetchTasks();
                    } catch (err) {
                      Alert.alert("Error", "Bulk delete failed");
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

  const renderTask = ({ item }) => (
    <View style={styles.taskCard}>
      <TouchableOpacity
        style={styles.taskCardMain}
        onPress={() => navigation.navigate('TaskDetails', { taskId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.workerName}>Worker: {item.worker_name || 'Unassigned'}</Text>
          <Text style={styles.viewDetails}>View Details →</Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleResetTask(item.id)}>
          <Ionicons name="refresh-circle" size={24} color={Colors.primary} />
          <Text style={styles.actionText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteTask(item.id)}>
          <Ionicons name="trash-outline" size={24} color="#D32F2F" />
          <Text style={[styles.actionText, { color: '#D32F2F' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'submitted': return '#2196F3';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return Colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.titleSection}>
        <View>
          <Text style={styles.headerTitle}>Task Dashboard</Text>
          <Text style={styles.subText}>{tasks.length} Road Segments Active</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('MapTaskCreation')}
        >
          <Text style={styles.createButtonText}>+ CREATE TASK</Text>
        </TouchableOpacity>

        {tasks.length > 0 && (
          <TouchableOpacity
            style={styles.deleteAllBtn}
            onPress={handleDeleteAll}
          >
            <Ionicons name="flash" size={20} color="#fff" />
            <Text style={styles.deleteAllText}>PURGE ALL</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTask}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No tasks found</Text>
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
    paddingVertical: 15, 
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginBottom: 10
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: Colors.primary },
  logoutButton: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  logoutText: { color: Colors.accent, fontWeight: '600' },
  subText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  buttonRow: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15 },
  createButton: { 
    flex: 2,
    backgroundColor: Colors.primary, 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center',
    marginRight: 10,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  deleteAllBtn: {
    flex: 1,
    backgroundColor: '#D32F2F',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    elevation: 4,
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  deleteAllText: { color: Colors.white, fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  createButtonText: { color: Colors.white, fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  listContainer: { paddingBottom: 20 },
  taskCard: { 
    backgroundColor: Colors.white, 
    marginHorizontal: 15, 
    marginBottom: 12, 
    borderRadius: 15, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden'
  },
  taskCardMain: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  taskTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, flex: 1, marginRight: 10 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusText: { color: Colors.white, fontSize: 10, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  workerName: { color: Colors.textSecondary, fontSize: 14 },
  viewDetails: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  actionRow: { 
    flexDirection: 'row', 
    borderTopWidth: 1, 
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    padding: 8
  },
  actionBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: 5
  },
  actionText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: Colors.primary },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: Colors.textSecondary, fontSize: 16 }
});
