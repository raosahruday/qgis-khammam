import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import Colors from '../../constants/Colors';

const { width, height } = Dimensions.get('window');

const SweepingWorker = ({ scale = 1, direction = 'left' }) => {
  const isLeft = direction === 'left';
  return (
    <View style={[styles.workerContainer, { transform: [{ scale }] }]}>
      {/* 1. Yellow Safety Helmet */}
      <View style={styles.helmetShape}>
        <View style={styles.helmetBrim} />
      </View>
      
      {/* 2. Face */}
      <View style={styles.headShape} />
      
      {/* 3. Orange High-Vis Jacket / Vest */}
      <View style={styles.safetyJacket}>
        {/* Silver Reflective Stripes */}
        <View style={styles.reflectiveBand} />
        <View style={[styles.reflectiveBand, { marginTop: 5 }]} />
        
        {/* Vertical Reflective Bands */}
        <View style={styles.suspenderLeft} />
        <View style={styles.suspenderRight} />
      </View>

      {/* 4. Legs */}
      <View style={styles.legsRow}>
        <View style={styles.leg} />
        <View style={styles.leg} />
      </View>

      {/* 5. Broomstick (sweeping the road) */}
      <View 
        style={[
          styles.broomstickAssembly, 
          isLeft ? { left: -10, transform: [{ rotate: '-35deg' }] } : { right: -10, transform: [{ rotate: '35deg' }] }
        ]}
      >
        <View style={styles.broomHandle} />
        <View style={styles.broomBristles} />
      </View>

      {/* 6. Hands holding the broom */}
      <View style={styles.handsRow}>
        <View style={styles.handDot} />
        <View style={[styles.handDot, { marginTop: -2 }]} />
      </View>
    </View>
  );
};

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#051329" />
      
      {/* Abstract decorative background rings */}
      <View style={[styles.bgCircle, { top: -height * 0.1, left: -width * 0.2, backgroundColor: 'rgba(255,255,255,0.02)' }]} />
      <View style={[styles.bgCircle, { bottom: -height * 0.15, right: -width * 0.2, backgroundColor: 'rgba(255,255,255,0.03)' }]} />

      {/* 1. Header Section */}
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

      {/* 2. Middle Canvas (City Silhouette, Road, and Workers) */}
      <View style={styles.canvasContainer}>
        
        {/* City Skyline Silhouettes (Layered Blue Buildings) */}
        <View style={styles.skylineWrapper}>
          {/* Layer 1: Distant Light Blue Buildings */}
          <View style={styles.skylineLayer1}>
            <View style={[styles.building, { height: 110, width: 35 }]} />
            <View style={[styles.building, { height: 150, width: 45 }]} />
            <View style={[styles.building, { height: 90, width: 30 }]} />
            <View style={[styles.building, { height: 170, width: 40 }]} />
            <View style={[styles.building, { height: 120, width: 35 }]} />
            <View style={[styles.building, { height: 140, width: 45 }]} />
            <View style={[styles.building, { height: 100, width: 30 }]} />
          </View>
          
          {/* Layer 2: Mid-ground Medium Blue Buildings */}
          <View style={styles.skylineLayer2}>
            <View style={[styles.buildingMid, { height: 80, width: 40 }]} />
            <View style={[styles.buildingMid, { height: 110, width: 42 }]} />
            <View style={[styles.buildingMid, { height: 75, width: 35 }]} />
            <View style={[styles.buildingMid, { height: 130, width: 48 }]} />
            <View style={[styles.buildingMid, { height: 95, width: 38 }]} />
            <View style={[styles.buildingMid, { height: 115, width: 40 }]} />
          </View>
        </View>

        {/* Green Trees (Overlapping the skyline on the right/left sides) */}
        <View style={styles.treeLeft}>
          <View style={[styles.leafCircle, { width: 36, height: 36, backgroundColor: '#065F46' }]} />
          <View style={[styles.leafCircle, { width: 46, height: 46, backgroundColor: '#047857', marginTop: -20, marginLeft: 10 }]} />
          <View style={[styles.leafCircle, { width: 36, height: 36, backgroundColor: '#065F46', marginTop: -25, marginLeft: -10 }]} />
          <View style={styles.trunk} />
        </View>

        <View style={styles.treeRight}>
          <View style={[styles.leafCircle, { width: 40, height: 40, backgroundColor: '#047857' }]} />
          <View style={[styles.leafCircle, { width: 52, height: 52, backgroundColor: '#059669', marginTop: -24, marginRight: 8 }]} />
          <View style={[styles.leafCircle, { width: 40, height: 40, backgroundColor: '#047857', marginTop: -30, marginLeft: 12 }]} />
          <View style={styles.trunk} />
        </View>

        {/* Asphalt Road Canvas (Replacing vehicles with sweeping workers) */}
        <View style={styles.roadCanvas}>
          {/* Top curb border */}
          <View style={styles.curbBorder} />

          {/* Lane Dividers */}
          <View style={styles.roadCenterLines}>
            <View style={styles.laneStripe} />
            <View style={styles.laneStripe} />
            <View style={styles.laneStripe} />
            <View style={styles.laneStripe} />
            <View style={styles.laneStripe} />
          </View>

          {/* Bottom curb border */}
          <View style={[styles.curbBorder, { marginTop: 'auto' }]} />
        </View>

        {/* Sweeping Workers Overlay (3 workers placed at left, middle, right on the road) */}
        <View style={styles.workersOverlay}>
          {/* Left Worker */}
          <View style={[styles.workerPosition, { left: width * 0.08 }]}>
            <SweepingWorker scale={0.9} direction="left" />
          </View>

          {/* Center Worker */}
          <View style={[styles.workerPosition, { left: width * 0.38, bottom: -10 }]}>
            <SweepingWorker scale={1.0} direction="right" />
          </View>

          {/* Right Worker */}
          <View style={[styles.workerPosition, { right: width * 0.08 }]}>
            <SweepingWorker scale={0.9} direction="left" />
          </View>
        </View>

        {/* Sparkle Clean Effect decor */}
        <View style={styles.sparkleOverlay}>
          <Ionicons name="sparkles" size={16} color={Colors.secondary} />
          <Text style={styles.cleanLabel}>KEEPIN' KHAMMAM CLEAN</Text>
          <Ionicons name="sparkles" size={16} color={Colors.secondary} />
        </View>

      </View>

      {/* 3. Secure Footer */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={16} color="rgba(255,255,255,0.6)" style={{ marginRight: 6 }} />
        <Text style={styles.footerText}>SECURE WORKSPACE PORTAL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#051E3C', // Deep Royal Blue Background matching KMC-FRS
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
    marginTop: height * 0.01,
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
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subTitleTelugu: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
  },
  canvasContainer: {
    width: '92%',
    height: 240,
    justifyContent: 'flex-end',
    position: 'relative',
    marginVertical: 10,
  },
  skylineWrapper: {
    position: 'absolute',
    bottom: 80,
    width: '100%',
    height: 180,
    zIndex: 1,
  },
  skylineLayer1: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  building: {
    backgroundColor: 'rgba(37, 99, 235, 0.16)', // Distant soft light-blue silhouettes
    borderRadius: 3,
  },
  skylineLayer2: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: 20,
  },
  buildingMid: {
    backgroundColor: 'rgba(30, 58, 138, 0.35)', // Midground medium-blue silhouettes
    borderRadius: 3,
  },
  treeLeft: {
    position: 'absolute',
    left: -10,
    bottom: 75,
    zIndex: 3,
    alignItems: 'center',
  },
  treeRight: {
    position: 'absolute',
    right: -10,
    bottom: 75,
    zIndex: 3,
    alignItems: 'center',
  },
  leafCircle: {
    borderRadius: 30,
  },
  trunk: {
    width: 6,
    height: 20,
    backgroundColor: '#78350F',
    marginTop: -2,
  },
  roadCanvas: {
    width: '100%',
    height: 85,
    backgroundColor: '#1E293B', // Dark slate road
    borderRadius: 8,
    zIndex: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  curbBorder: {
    width: '100%',
    height: 3,
    backgroundColor: '#94A3B8', // Grey road lines
  },
  roadCenterLines: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    marginTop: 38,
  },
  laneStripe: {
    width: 25,
    height: 2,
    backgroundColor: '#F8FAFC', // White divider stripes
  },
  workersOverlay: {
    position: 'absolute',
    bottom: 10,
    width: '100%',
    height: 120,
    zIndex: 4,
  },
  workerPosition: {
    position: 'absolute',
    bottom: 0,
  },
  sparkleOverlay: {
    position: 'absolute',
    bottom: -32,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 5,
  },
  cleanLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#34D399',
    marginHorizontal: 6,
    letterSpacing: 1,
  },

  /* Worker Vector Styles */
  workerContainer: {
    alignItems: 'center',
    width: 60,
    height: 100,
    position: 'relative',
  },
  helmetShape: {
    width: 20,
    height: 10,
    backgroundColor: '#FACC15', // Yellow hard hat
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    zIndex: 5,
  },
  helmetBrim: {
    position: 'absolute',
    bottom: -1,
    left: -2,
    width: 24,
    height: 2,
    backgroundColor: '#CA8A04',
  },
  headShape: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FED7AA', // Face skin tone
    zIndex: 4,
  },
  safetyJacket: {
    width: 24,
    height: 28,
    backgroundColor: '#F97316', // Neon Orange High-Vis Jacket
    borderRadius: 4,
    marginTop: 1,
    zIndex: 3,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#EA580C',
    position: 'relative',
  },
  reflectiveBand: {
    width: '100%',
    height: 3,
    backgroundColor: '#E2E8F0', // Horizontal reflective silver band
    marginTop: 6,
  },
  suspenderLeft: {
    position: 'absolute',
    top: 0,
    left: 3,
    width: 2.5,
    height: '100%',
    backgroundColor: '#E2E8F0',
  },
  suspenderRight: {
    position: 'absolute',
    top: 0,
    right: 3,
    width: 2.5,
    height: '100%',
    backgroundColor: '#E2E8F0',
  },
  legsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 14,
    height: 10,
    zIndex: 2,
  },
  leg: {
    width: 4,
    height: '100%',
    backgroundColor: '#475569', // Dark grey pants
  },
  handsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    top: 38,
    width: '100%',
    zIndex: 6,
  },
  handDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FED7AA',
    marginHorizontal: 2,
  },
  broomstickAssembly: {
    position: 'absolute',
    bottom: -15, // Broom rests on road surface
    height: 65,
    alignItems: 'center',
    zIndex: 7,
  },
  broomHandle: {
    width: 2,
    height: 52,
    backgroundColor: '#78350F', // Wooden handle
  },
  broomBristles: {
    width: 16,
    height: 13,
    backgroundColor: '#FACC15', // Yellow straw broom brush
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderWidth: 0.5,
    borderColor: '#CA8A04',
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
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '800',
    letterSpacing: 1,
  },
});
