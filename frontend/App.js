import React, { useContext, useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

// Auth Screens
import SplashScreen from './src/screens/Auth/SplashScreen';
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';

// Owner Screens
import OwnerDashboard from './src/screens/Owner/OwnerDashboard';
import MapTaskCreationScreen from './src/screens/Owner/MapTaskCreationScreen';
import TaskDetailsScreen from './src/screens/Owner/TaskDetailsScreen';
import CommissionerDashboard from './src/screens/Commissioner/CommissionerDashboard';


// Worker Screens
import WorkerDashboard from './src/screens/Worker/WorkerDashboard';
import MapNavigationScreen from './src/screens/Worker/MapNavigationScreen';
import CapturePhotoScreen from './src/screens/Worker/CapturePhotoScreen';

// Park Jawan Screens
import ParkWorkerDashboard from './src/screens/ParkWorker/ParkWorkerDashboard';
import ParkMapNavigationScreen from './src/screens/ParkWorker/ParkMapNavigationScreen';
import ParkCapturePhotoScreen from './src/screens/ParkWorker/ParkCapturePhotoScreen';


const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const { user, isLoading } = useContext(AuthContext);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {user == null ? (
        // Auth Flow
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
        </>
      ) : user.role === 'commissioner' ? (
        // Commissioner Flow
        <>
          <Stack.Screen name="CommissionerDashboard" component={CommissionerDashboard} options={{ title: 'Municipal Commissioner' }} />
          <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} options={{ title: 'Ward Details' }} />
        </>
      ) : user.role === 'owner' || user.role === 'supervisor' ? (
        // Supervisor/Owner Flow
        <>
          <Stack.Screen name="OwnerDashboard" component={OwnerDashboard} options={{ title: 'Dashboard' }} />
          <Stack.Screen name="MapTaskCreation" component={MapTaskCreationScreen} options={{ title: 'Create Task' }} />
          <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} options={{ title: 'Task Details' }} />
        </>
      ) : user.role === 'park_jawan' ? (
        // Park Worker Flow
        <>
          <Stack.Screen name="ParkWorkerDashboard" component={ParkWorkerDashboard} options={{ headerShown: false }} />
          <Stack.Screen name="ParkMapNavigation" component={ParkMapNavigationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ParkCapturePhoto" component={ParkCapturePhotoScreen} options={{ headerShown: false }} />
        </>
      ) : (
        // Worker Flow
        <>
          <Stack.Screen name="WorkerDashboard" component={WorkerDashboard} options={{ title: 'My Assignments' }} />
          <Stack.Screen name="MapNavigation" component={MapNavigationScreen} options={{ title: 'Task Location' }} />
          <Stack.Screen name="CapturePhoto" component={CapturePhotoScreen} options={{ title: 'Upload Proof' }} />
        </>
      )}
    </Stack.Navigator>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
