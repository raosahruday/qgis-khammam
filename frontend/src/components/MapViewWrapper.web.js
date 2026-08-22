import React, { createContext, useContext, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

// Context to share the Leaflet map instance with child layer components
export const MapContext = createContext(null);

export const Polygon = ({ coordinates, strokeColor, strokeWidth, fillColor, onPress }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map) return;
    const coords = coordinates?.map(c => [c.latitude, c.longitude]) || [];
    if (coords.length === 0) return;

    const poly = window.L.polygon(coords, {
      color: strokeColor || '#FFD600',
      weight: strokeWidth || 3.5,
      fillColor: fillColor || 'rgba(255, 214, 0, 0.12)',
      fillOpacity: 0.3
    }).addTo(map);

    if (onPress) {
      poly.on('click', () => onPress());
    }

    return () => {
      map.removeLayer(poly);
    };
  }, [map, coordinates, strokeColor, strokeWidth, fillColor, onPress]);

  return null;
};
Polygon.nativeName = 'Polygon';

export const Polyline = ({ coordinates, strokeColor, strokeWidth, onPress }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map) return;
    const coords = coordinates?.map(c => [c.latitude, c.longitude]) || [];
    if (coords.length === 0) return;

    const line = window.L.polyline(coords, {
      color: strokeColor || '#D32F2F',
      weight: strokeWidth || 3
    }).addTo(map);

    if (onPress) {
      line.on('click', () => onPress());
    }

    return () => {
      map.removeLayer(line);
    };
  }, [map, coordinates, strokeColor, strokeWidth, onPress]);

  return null;
};
Polyline.nativeName = 'Polyline';

export const Marker = ({ coordinate, title, description, pinColor, children, label, labelColor }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map) return;
    const lat = coordinate?.latitude;
    const lng = coordinate?.longitude;
    if (!lat || !lng) return;

    // Check if custom styles exist on child component
    let dotColor = '#1A73E8'; // Default blue
    let hasCustomChild = false;
    
    if (children) {
       hasCustomChild = true;
       const childEl = React.Children.toArray(children)[0];
       if (childEl) {
          const childProps = childEl.props || {};
          const childStyle = Array.isArray(childProps.style) 
            ? Object.assign({}, ...childProps.style) 
            : childProps.style || {};
          if (childStyle.backgroundColor) {
             dotColor = childStyle.backgroundColor;
          }
       }
    }

    let markerEmoji = '🚜';
    let badgeColor = 'rgba(0,0,0,0.85)';
    if (pinColor === 'red' || title === 'Start Point') {
       markerEmoji = '📍';
       badgeColor = '#D32F2F';
    } else if (pinColor === 'green' || title === 'End Point') {
       markerEmoji = '🏁';
       badgeColor = '#2E7D32';
    }

    let iconHtml = '';
    if (label) {
       iconHtml = `<div style="display: flex; align-items: center; justify-content: center; font-family: sans-serif; font-size: 16px; font-weight: 900; color: ${labelColor || '#EF4444'}; text-shadow: -1.5px -1.5px 0 #FFF, 1.5px -1.5px 0 #FFF, -1.5px 1.5px 0 #FFF, 1.5px 1.5px 0 #FFF, 0px 2px 4px rgba(0,0,0,0.5); pointer-events: none; white-space: nowrap;">
                     ${label}
                   </div>`;
    } else if (hasCustomChild) {
       iconHtml = `<div style="display: flex; align-items: center; justify-content: center;">
                     <div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${dotColor}; border: 2px solid white; box-shadow: 0px 0px 4px rgba(0,0,0,0.5);"></div>
                   </div>`;
    } else {
       iconHtml = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
                     <span style="font-size:28px; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">${markerEmoji}</span>
                     <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; white-space: nowrap; margin-top:-2px; border: 1px solid rgba(255,255,255,0.3); font-family: sans-serif; box-shadow: 0px 2px 4px rgba(0,0,0,0.25);">${title || 'Point'}</span>
                   </div>`;
    }

    const marker = window.L.marker([lat, lng], {
      icon: window.L.divIcon({
        html: iconHtml,
        className: label ? 'custom-leaflet-label' : (hasCustomChild ? 'custom-leaflet-dot' : 'custom-leaflet-truck'),
        iconSize: label ? [40, 20] : (hasCustomChild ? [20, 20] : [60, 60]),
        iconAnchor: label ? [20, 10] : (hasCustomChild ? [10, 10] : [30, 45])
      })
    }).addTo(map);

    if (description) {
      marker.bindPopup(`<b>${title || 'Point'}</b><br/>${description}`);
    }

    return () => {
      map.removeLayer(marker);
    };
  }, [map, coordinate, title, description, pinColor, children, label, labelColor]);

  return null;
};
Marker.nativeName = 'Marker';

export const Geojson = ({ geojson, strokeColor, strokeWidth }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map || !geojson) return;
    const geojsonLayer = window.L.geoJSON(geojson, {
      style: {
        color: strokeColor || '#D32F2F',
        weight: strokeWidth || 1.5,
        opacity: 0.8
      }
    }).addTo(map);

    return () => {
      map.removeLayer(geojsonLayer);
    };
  }, [map, geojson, strokeColor, strokeWidth]);

  return null;
};
Geojson.nativeName = 'Geojson';

/**
 * RoadsLayer — Renders ALL roads of one status as a SINGLE batched Leaflet GeoJSON layer.
 * This replaces the old pattern of one <Polyline> per road (which caused a race condition
 * on production where 4,332+ simultaneous useEffect calls dropped most roads).
 *
 * @param {Array} features  - Array of { geom: GeoJSONGeometry, properties: {} }
 * @param {string} color    - Stroke color (e.g. '#D32F2F')
 * @param {number} weight   - Line weight in pixels
 * @param {function} onFeaturePress - Optional click handler receiving feature properties
 */
export const RoadsLayer = ({ features, color, weight, onFeaturePress }) => {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map || !features || features.length === 0) return;

    const geojsonData = {
      type: 'FeatureCollection',
      features: features
        .filter(f => f.geom && f.geom.type)
        .map(f => ({
          type: 'Feature',
          geometry: f.geom,
          properties: f.properties || {}
        }))
    };

    if (geojsonData.features.length === 0) return;

    const layer = window.L.geoJSON(geojsonData, {
      style: {
        color: color || '#D32F2F',
        weight: weight || 1.5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      },
      onEachFeature: (feature, lyr) => {
        if (onFeaturePress) {
          lyr.on('click', () => onFeaturePress(feature.properties));
        }
      }
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, features, color, weight, onFeaturePress]);

  return null;
};
RoadsLayer.nativeName = 'RoadsLayer';

const MapView = forwardRef(({ children, style, initialRegion, mapType, onRegionChangeComplete }, ref) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);

  // Expose imperative methods to parent refs
  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration) => {
      if (mapRef.current) {
        const delta = Math.max(region.latitudeDelta || 0, region.longitudeDelta || 0);
        let zoom = mapRef.current.getZoom();
        if (delta > 0) {
          zoom = Math.round(Math.log2(360 / delta)) - 1;
        }
        zoom = Math.max(1, Math.min(19, zoom));
        mapRef.current.flyTo([region.latitude, region.longitude], zoom, {
          duration: (duration || 1000) / 1000
        });
      }
    },
    fitToCoordinates: (coordinates, options) => {
      if (mapRef.current && coordinates && coordinates.length > 0) {
        const latlngs = coordinates.map(c => [c.latitude, c.longitude]);
        const animated = options?.animated !== false;
        mapRef.current.fitBounds(latlngs, {
          animate: animated,
          padding: options?.edgePadding 
            ? [options.edgePadding.top || 50, options.edgePadding.left || 50] 
            : [50, 50]
        });
      }
    }
  }));

  // 1. Load Leaflet assets dynamically from CDN
  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);
  }, []);

  // 2. Initialize Leaflet Map once script loads
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current) return;

    const lat = initialRegion?.latitude || 17.2473;
    const lng = initialRegion?.longitude || 80.1514;
    const zoom = 13;

    const map = window.L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([lat, lng], zoom);

    // Use High Quality Esri Satellite Tiles for satellite map view
    const tiles = mapType === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png';

    window.L.tileLayer(tiles, {
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;
    setMapInstance(map);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [leafletLoaded, mapType]);

  // 3. Listen to region change events and call onRegionChangeComplete
  useEffect(() => {
    if (!mapInstance) return;

    const handleMoveEnd = () => {
      if (onRegionChangeComplete) {
        const center = mapInstance.getCenter();
        const bounds = mapInstance.getBounds();
        
        // Safety checks in case bounds are invalid/not ready
        if (bounds && bounds.getNorth && bounds.getSouth && bounds.getEast && bounds.getWest) {
          onRegionChangeComplete({
            latitude: center.lat,
            longitude: center.lng,
            latitudeDelta: bounds.getNorth() - bounds.getSouth(),
            longitudeDelta: bounds.getEast() - bounds.getWest()
          });
        }
      }
    };

    mapInstance.on('moveend', handleMoveEnd);

    // Initial trigger once Leaflet has completed setup & layout
    mapInstance.whenReady(() => {
      // Delay slightly to ensure browser has updated size and computed valid bounds
      setTimeout(handleMoveEnd, 100);
    });

    return () => {
      mapInstance.off('moveend', handleMoveEnd);
    };
  }, [mapInstance, onRegionChangeComplete]);

  return (
    <MapContext.Provider value={mapInstance}>
      <div 
        ref={containerRef} 
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          ...style
        }}
      />
      {leafletLoaded && mapInstance && children}
    </MapContext.Provider>
  );
});

export const Callout = () => null;
Callout.nativeName = 'Callout';

export default MapView;
