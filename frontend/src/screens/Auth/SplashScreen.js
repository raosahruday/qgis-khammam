import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import Colors from '../../constants/Colors';

const { width, height } = Dimensions.get('window');

const SweepingWorker = ({ direction = 'left' }) => {
  const isLeft = direction === 'left';
  return (
    <View style={styles.workerContainer}>
      {/* 1. Yellow Safety Helmet */}
      <View style={styles.helmetShape}>
        {/* Brim of helmet */}
        <View style={styles.helmetBrim} />
      </View>
      
      {/* 2. Face / Head */}
      <View style={styles.headShape} />
      
      {/* 3. Orange High-Visibility Safety Jacket / Vest */}
      <View style={styles.safetyJacket}>
        {/* Reflective Stripes (Silver bands running horizontally) */}
        <View style={styles.reflectiveBand} />
        <View style={[styles.reflectiveBand, { marginTop: 6 }]} />
        
        {/* Vertical suspender reflective stripes */}
        <View style={styles.suspenderLeft} />
        <View style={styles.suspenderRight} />
      </View>

      {/* 4. Legs on the ground */}
      <View style={styles.legsRow}>
        <View style={styles.leg} />
        <View style={styles.leg} />
      </View>

      {/* 5. Broomstick (Held in hands, slanting down to the road) */}
      <View 
        style={[
          styles.broomstickAssembly, 
          isLeft ? { left: -10, transform: [{ rotate: '-35deg' }] } : { right: -10, transform: [{ rotate: '35deg' }] }
        ]}
      >
        {/* Wooden Handle */}
        <View style={styles.broomHandle} />
        {/* Straw/Plastic Bristles */}
        <View style={styles.broomBristles} />
      </View>

      {/* 6. Hand dots holding the broom */}
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
      <StatusBar barStyle="light-content" backgroundColor="#104A18" />
      
      {/* Subtle backdrop circle layouts */}
      <View style={[styles.bgCircle, { top: -height * 0.1, left: -width * 0.2, backgroundColor: 'rgba(255,255,255,0.03)' }]} />
      <View style={[styles.bgCircle, { bottom: -height * 0.15, right: -width * 0.2, backgroundColor: 'rgba(255,255,255,0.04)' }]} />

      {/* Top Header Section */}
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

      {/* Graphic Section with Roads & Sweeping Workers */}
      <View style={styles.graphicContainer}>
        {/* Skyline background silhouette */}
        <View style={styles.skylineBackground}>
          <MaterialCommunityIcons name="city-variant-outline" size={70} color="rgba(255, 255, 255, 0.08)" />
          <MaterialCommunityIcons name="city-variant-outline" size={90} color="rgba(255, 255, 255, 0.06)" style={{ marginLeft: -15 }} />
          <MaterialCommunityIcons name="city-variant-outline" size={70} color="rgba(255, 255, 255, 0.08)" style={{ marginLeft: -15 }} />
        </View>

        {/* Greenery / Forest elements */}
        <View style={styles.forestBackground}>
          <MaterialCommunityIcons name="pine-tree" size={28} color="rgba(255, 255, 255, 0.2)" />
          <MaterialCommunityIcons name="pine-tree" size={36} color="rgba(255, 255, 255, 0.25)" style={{ marginHorizontal: 8, marginTop: -6 }} />
          <MaterialCommunityIcons name="pine-tree" size={28} color="rgba(255, 255, 255, 0.2)" />
        </View>

        {/* Interactive illustration card containing the street scene */}
        <View style={[styles.illustrationCard, Colors.shadowHigh]}>
          
          {/* Active road canvas */}
          <View style={styles.roadCanvas}>
            {/* White side lane lines */}
            <View style={styles.roadBoundaryLine} />
            
            {/* Center dashed lane markers */}
            <View style={styles.centerDividerContainer}>
              <View style={styles.centerStripe} />
              <View style={styles.centerStripe} />
              <View style={styles.centerStripe} />
              <View style={styles.centerStripe} />
              <View style={styles.centerStripe} />
            </View>

            <View style={[styles.roadBoundaryLine, { marginTop: 'auto' }]} />
            
            {/* Swept sparkles to indicate cleanliness success */}
            <View style={[styles.sparkleDecoration, { left: 45, top: 8 }]}>
              <Ionicons name="sparkles" size={12} color={Colors.secondary} />
            </View>
            <View style={[styles.sparkleDecoration, { right: 45, bottom: 8 }]}>
              <Ionicons name="sparkles" size={12} color={Colors.secondary} />
            </View>
          </View>

          {/* Overlaying the sweeping Jawans */}
          <View style={styles.workersOverlayRow}>
            {/* Jawan sweeping left side of the road */}
            <View style={{ marginRight: 25 }}>
              <SweepingWorker direction="left" />
            </View>

            {/* Middle decorative emblem of clean mission */}
            <View style={styles.cleanEmblemContainer}>
              <View style={styles.emblemCircle}>
                <MaterialCommunityIcons name="leaf" size={24} color={Colors.successText} />
              </View>
              <Text style={styles.emblemText}>CLEAN ROAD</Text>
            </View>

            {/* Jawan sweeping right side of the road */}
            <View style={{ marginLeft: 25 }}>
              <SweepingWorker direction="right" />
            </View>
          </View>
        </View>
      </View>

      {/* Secure footer */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={16} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
        <Text style={styles.footerText}>SECURE WORKSPACE PORTAL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#104A18', // Rich green theme
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
    width: '92%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  skylineBackground: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: -10,
    zIndex: 1,
  },
  forestBackground: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    zIndex: 2,
  },
  illustrationCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: Colors.radiusLarge,
    paddingHorizontal: 16,
    paddingTop: 45,
    paddingBottom: 25,
    alignItems: 'center',
    zIndex: 3,
    position: 'relative',
  },
  roadCanvas: {
    width: '100%',
    height: 60,
    backgroundColor: '#334155', // Slate road color
    borderRadius: 6,
    paddingVertical: 4,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  roadBoundaryLine: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  centerDividerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10,
  },
  centerStripe: {
    width: 25,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  sparkleDecoration: {
    position: 'absolute',
    zIndex: 2,
  },
  workersOverlayRow: {
    position: 'absolute',
    top: -30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    paddingHorizontal: 10,
  },
  cleanEmblemContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -22,
  },
  emblemCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.successBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.success,
  },
  emblemText: {
    fontSize: 9,
    fontWeight: '900',
    color: Colors.successText,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  /* Worker Vector Styling */
  workerContainer: {
    alignItems: 'center',
    width: 65,
    height: 110,
    position: 'relative',
  },
  helmetShape: {
    width: 24,
    height: 11,
    backgroundColor: '#FDD835', // Safety Yellow Helmet
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    zIndex: 5,
    position: 'relative',
  },
  helmetBrim: {
    position: 'absolute',
    bottom: -1.5,
    left: -3,
    width: 30,
    height: 2.5,
    backgroundColor: '#FBC02D',
    borderRadius: 1,
  },
  headShape: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFCC80', // Peach face tone
    marginTop: 1,
    zIndex: 4,
  },
  safetyJacket: {
    width: 28,
    height: 34,
    backgroundColor: '#FF5722', // High-Vis Safety Orange Vest
    borderRadius: 5,
    marginTop: 2,
    zIndex: 3,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#E64A19',
    position: 'relative',
  },
  reflectiveBand: {
    width: '100%',
    height: 3.5,
    backgroundColor: '#CBD5E1', // Silver/Grey reflective stripe
    marginTop: 8,
  },
  suspenderLeft: {
    position: 'absolute',
    top: 0,
    left: 4,
    width: 3,
    height: '100%',
    backgroundColor: '#CBD5E1',
  },
  suspenderRight: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 3,
    height: '100%',
    backgroundColor: '#CBD5E1',
  },
  legsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 16,
    height: 12,
    marginTop: 1,
    zIndex: 2,
  },
  leg: {
    width: 5,
    height: '100%',
    backgroundColor: '#334155', // Grey trousers
    borderRadius: 1,
  },
  handsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    top: 44,
    width: '100%',
    zIndex: 6,
  },
  handDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFCC80',
    marginHorizontal: 3,
  },
  broomstickAssembly: {
    position: 'absolute',
    bottom: -15, // Broom bristles sit right on the road surface
    height: 75,
    alignItems: 'center',
    zIndex: 7,
  },
  broomHandle: {
    width: 2.5,
    height: 60,
    backgroundColor: '#8D6E63', // Wooden pole handle
    borderRadius: 1,
  },
  broomBristles: {
    width: 18,
    height: 15,
    backgroundColor: '#FBC02D', // Broom bristles/brush sweeping the road
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    borderWidth: 0.5,
    borderColor: '#F57F17',
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
