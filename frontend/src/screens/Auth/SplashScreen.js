import React from 'react';
import { View, Image, StyleSheet, StatusBar, useWindowDimensions, Platform } from 'react-native';

export default function SplashScreen() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <Image
        source={require('../../../assets/splash_custom.png')}
        style={
          isWeb 
            ? styles.webSplashImage 
            : [styles.mobileSplashImage, { width, height }]
        }
        resizeMode={isWeb ? "contain" : "cover"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08371B', // Dark Green matching the splash image background
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileSplashImage: {
    // sized dynamically based on window dimensions
  },
  webSplashImage: {
    width: '90%',
    height: '90%',
    maxWidth: 600,
    maxHeight: 600,
  },
});
