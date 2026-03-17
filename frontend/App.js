import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

// Auth Screens
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';

// Owner Screens
import OwnerDashboard from './src/screens/Owner/OwnerDashboard';
import MapTaskCreationScreen from './src/screens/Owner/MapTaskCreationScreen';
import TaskDetailsScreen from './src/screens/Owner/TaskDetailsScreen';
import PhotoReviewScreen from './src/screens/Owner/PhotoReviewScreen';
import CommissionerDashboard from './src/screens/Commissioner/CommissionerDashboard';
import QRDisplayScreen from './src/screens/Owner/QRDisplayScreen';

// Worker Screens
import WorkerDashboard from './src/screens/Worker/WorkerDashboard';
import MapNavigationScreen from './src/screens/Worker/MapNavigationScreen';
import CapturePhotoScreen from './src/screens/Worker/CapturePhotoScreen';
import QRScannerScreen from './src/screens/Auth/QRScannerScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const { user, isLoading } = useContext(AuthContext);

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
          <Stack.Screen name="PhotoReview" component={PhotoReviewScreen} options={{ title: 'Review Completion' }} />
          <Stack.Screen name="QRDisplay" component={QRDisplayScreen} options={{ title: 'Task QR Codes' }} />
        </>
      ) : (
        // Worker Flow
        <>
          <Stack.Screen name="WorkerDashboard" component={WorkerDashboard} options={{ title: 'My Assignments' }} />
          <Stack.Screen name="MapNavigation" component={MapNavigationScreen} options={{ title: 'Task Location' }} />
          <Stack.Screen name="CapturePhoto" component={CapturePhotoScreen} options={{ title: 'Upload Proof' }} />
          <Stack.Screen name="QRScanner" component={QRScannerScreen} options={{ title: 'Scan QR Code' }} />
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
