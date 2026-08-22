import React from 'react';
import { View, Text } from 'react-native';
import MapView, { Polygon, Polyline, Marker as RNMarker, Geojson, Callout } from 'react-native-maps';

// RoadsLayer is a web-only batched GeoJSON component.
// On native, we return null since roads are handled by individual Polylines.
export const RoadsLayer = () => null;

export const Marker = ({ coordinate, title, description, pinColor, children, label, labelColor, ...props }) => {
  if (label) {
    return (
      <RNMarker coordinate={coordinate} {...props}>
        <View style={{
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{
            fontSize: 16,
            fontWeight: '900',
            color: labelColor || '#EF4444',
            textShadowColor: '#FFFFFF',
            textShadowOffset: { width: 1.5, height: 1.5 },
            textShadowRadius: 1,
          }}>
            {label}
          </Text>
        </View>
      </RNMarker>
    );
  }
  return (
    <RNMarker coordinate={coordinate} title={title} description={description} pinColor={pinColor} {...props}>
      {children}
    </RNMarker>
  );
};
Marker.nativeName = 'Marker';

export { Polygon, Polyline, Geojson, Callout };
export default MapView;
