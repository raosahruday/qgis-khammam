import MapView, { Polygon, Polyline, Marker, Geojson, Callout } from 'react-native-maps';

// RoadsLayer is a web-only batched GeoJSON component.
// On native, we return null since roads are handled by individual Polylines.
export const RoadsLayer = () => null;

export { Polygon, Polyline, Marker, Geojson, Callout };
export default MapView;
