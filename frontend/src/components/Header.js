import React from 'react';
import { View, Image, StyleSheet, SafeAreaView, Platform, StatusBar } from 'react-native';
import Colors from '../constants/Colors';

const Header = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image
          source={require('../../assets/logo_telangana.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.spacer} />
        <Image
          source={require('../../assets/logo_khammam.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  logo: {
    width: 60,
    height: 60,
  },
  spacer: {
    flex: 1,
  },
});

export default Header;
