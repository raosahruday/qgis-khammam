import React, { useContext, useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { LocalizationProvider, useLocalization } from './src/context/LocalizationContext';
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

// Park Inspector Screens
import ParkInspectorDashboard from './src/screens/ParkInspector/ParkInspectorDashboard';


const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const { user, isLoading } = useContext(AuthContext);
  const [showSplash, setShowSplash] = useState(true);
  const { t } = useLocalization();

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
          <Stack.Screen name="CommissionerDashboard" component={CommissionerDashboard} options={{ title: t('municipal_commissioner') }} />
          <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} options={{ title: t('ward_details') }} />
        </>
      ) : user.role === 'owner' || user.role === 'supervisor' ? (
        // Supervisor/Owner Flow
        <>
          <Stack.Screen name="OwnerDashboard" component={OwnerDashboard} options={{ title: t('dashboard') }} />
          <Stack.Screen name="MapTaskCreation" component={MapTaskCreationScreen} options={{ title: t('create_task') }} />
          <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} options={{ title: t('task_details') }} />
        </>
      ) : user.role === 'park_jawan' ? (
        // Park Worker Flow
        <>
          <Stack.Screen name="ParkWorkerDashboard" component={ParkWorkerDashboard} options={{ headerShown: false }} />
          <Stack.Screen name="ParkMapNavigation" component={ParkMapNavigationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ParkCapturePhoto" component={ParkCapturePhotoScreen} options={{ headerShown: false }} />
        </>
      ) : user.role === 'park_inspector' ? (
        // Park Inspector Flow
        <>
          <Stack.Screen name="ParkInspectorDashboard" component={ParkInspectorDashboard} options={{ headerShown: false }} />
        </>
      ) : (
        // Worker Flow
        <>
          <Stack.Screen name="WorkerDashboard" component={WorkerDashboard} options={{ title: t('my_assignments') }} />
          <Stack.Screen name="MapNavigation" component={MapNavigationScreen} options={{ title: t('task_location') }} />
          <Stack.Screen name="CapturePhoto" component={CapturePhotoScreen} options={{ title: t('upload_proof') }} />
        </>
      )}
    </Stack.Navigator>
  );
};

export default function App() {
  return (
    <LocalizationProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </LocalizationProvider>
  );
}
