import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import Colors from '../../constants/Colors';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#144218" />
      
      {/* Decorative background abstract circles for premium look */}
      <View style={[styles.bgCircle, { top: -height * 0.1, left: -width * 0.2, backgroundColor: 'rgba(255,255,255,0.03)' }]} />
      <View style={[styles.bgCircle, { bottom: -height * 0.15, right: -width * 0.2, backgroundColor: 'rgba(255,255,255,0.04)' }]} />

      {/* Top Header Log & Title */}
      <View style={styles.header}>
        <View style={[styles.logoWrapper, Colors.shadowHigh]}>
          <Image
            source={require('../../../assets/logo_khammam.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.appTitle}>KMC-CLEANUP</Text>
        <Text style={styles.subTitleEnglish}>Khammam Municipal Corporation</Text>
        <Text style={styles.subTitleTelugu}>ఖమ్మం నగర పాలక సంస్థ</Text>
      </View>

      {/* Central Graphic Section: Workers standing & cleaning the roads with broomstick */}
      <View style={styles.graphicContainer}>
        {/* City Skyline Silhouette */}
        <View style={styles.skylineRow}>
          <MaterialCommunityIcons name="city-variant-outline" size={80} color="rgba(255, 255, 255, 0.12)" />
          <MaterialCommunityIcons name="city-variant-outline" size={100} color="rgba(255, 255, 255, 0.08)" style={{ marginLeft: -20 }} />
          <MaterialCommunityIcons name="city-variant-outline" size={80} color="rgba(255, 255, 255, 0.12)" style={{ marginLeft: -20 }} />
        </View>

        {/* Trees / Eco elements */}
        <View style={styles.ecoRow}>
          <MaterialCommunityIcons name="pine-tree" size={32} color="rgba(255, 255, 255, 0.25)" />
          <MaterialCommunityIcons name="pine-tree" size={40} color="rgba(255, 255, 255, 0.3)" style={{ marginHorizontal: 10, marginTop: -8 }} />
          <MaterialCommunityIcons name="pine-tree" size={32} color="rgba(255, 255, 255, 0.25)" />
        </View>

        {/* Cleaning Illustration Area */}
        <View style={[styles.illustrationCard, Colors.shadowHigh]}>
          {/* Street / Road Design */}
          <View style={styles.road}>
            <View style={styles.roadLine} />
            <View style={[styles.roadLine, { borderStyle: 'dashed' }]} />
            <View style={styles.roadLine} />
          </View>

          {/* Workers Row */}
          <View style={styles.workersRow}>
            {/* Worker 1 */}
            <View style={styles.workerContainer}>
              <View style={styles.avatarOutline}>
                <FontAwesome5 name="user-alt" size={24} color={Colors.successText} />
                {/* Safety hard hat overlay */}
                <View style={styles.helmetBadge}>
                  <MaterialCommunityIcons name="account-hard-hat" size={12} color={Colors.white} />
                </View>
              </View>
              <Text style={styles.workerTag}>Jawan</Text>
              
              {/* Broomstick tool */}
              <View style={[styles.toolWrapper, { transform: [{ rotate: '-25deg' }], left: 16 }]}>
                <MaterialCommunityIcons name="broom" size={20} color={Colors.warning} />
              </View>
            </View>

            {/* Clean leaf symbol of work achievement */}
            <View style={styles.centerDecor}>
              <Ionicons name="leaf-outline" size={28} color={Colors.success} style={{ opacity: 0.8 }} />
              <Text style={styles.decorText}>SPRUCE</Text>
            </View>

            {/* Worker 2 */}
            <View style={styles.workerContainer}>
              <View style={styles.avatarOutline}>
                <FontAwesome5 name="user-alt" size={24} color={Colors.successText} />
                <View style={styles.helmetBadge}>
                  <MaterialCommunityIcons name="account-hard-hat" size={12} color={Colors.white} />
                </View>
              </View>
              <Text style={styles.workerTag}>Jawan</Text>
              
              {/* Broomstick tool */}
              <View style={[styles.toolWrapper, { transform: [{ rotate: '25deg' }], right: 16 }]}>
                <MaterialCommunityIcons name="broom" size={20} color={Colors.warning} />
              </View>
            </View>
          </View>
          
          {/* Cleaning feedback line */}
          <View style={styles.sparkleRow}>
            <Ionicons name="sparkles" size={16} color={Colors.secondary} />
            <Text style={styles.sparkleText}>KEEPING KHAMMAM CLEAN</Text>
            <Ionicons name="sparkles" size={16} color={Colors.secondary} />
          </View>
        </View>
      </View>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={18} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
        <Text style={styles.footerText}>SECURE WORKSPACE PORTAL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#144218', // Deep premium forest green background
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: height * 0.08,
  },
  bgCircle: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
  },
  header: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginTop: height * 0.02,
  },
  logoWrapper: {
    backgroundColor: Colors.white,
    borderRadius: 50,
    padding: 3,
    marginBottom: 16,
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  subTitleEnglish: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subTitleTelugu: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
  },
  graphicContainer: {
    width: '90%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  skylineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: -10,
    zIndex: 1,
  },
  ecoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    zIndex: 2,
  },
  illustrationCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: Colors.radiusLarge,
    padding: 20,
    alignItems: 'center',
    zIndex: 3,
  },
  road: {
    width: '100%',
    height: 8,
    backgroundColor: '#475569',
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 20,
  },
  roadLine: {
    width: '28%',
    height: 1,
    borderColor: '#FFFFFF',
    borderWidth: 0.5,
  },
  workersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
  },
  workerContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  avatarOutline: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: Colors.success,
    backgroundColor: Colors.successBg,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  helmetBadge: {
    position: 'absolute',
    top: -5,
    right: -2,
    backgroundColor: '#FF9800',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.white,
  },
  workerTag: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.successText,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  toolWrapper: {
    position: 'absolute',
    bottom: 25,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
    elevation: 3,
  },
  centerDecor: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.success,
    letterSpacing: 1,
    marginTop: 4,
  },
  sparkleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 5,
  },
  sparkleText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#137333',
    marginHorizontal: 8,
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: height * 0.02,
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '800',
    letterSpacing: 1,
  },
});
