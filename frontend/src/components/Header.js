import React from 'react';
import { View, Image, StyleSheet, SafeAreaView, Platform, StatusBar } from 'react-native';
import Colors from '../constants/Colors';

const Header = ({ small }) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, small && styles.containerSmall]}>
        <Image
          source={require('../../assets/logo_telangana.jpeg')}
          style={[styles.logo, small && styles.logoSmall]}
          resizeMode="contain"
        />
        <View style={styles.spacer} />
        <Image
          source={require('../../assets/logo_khammam.jpeg')}
          style={[styles.logo, small && styles.logoSmall]}
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
  containerSmall: {
    paddingVertical: 5,
    paddingHorizontal: 15,
  },
  logo: {
    width: 60,
    height: 60,
  },
  logoSmall: {
    width: 40,
    height: 40,
  },
  spacer: {
    flex: 1,
  },
});

export default Header;
