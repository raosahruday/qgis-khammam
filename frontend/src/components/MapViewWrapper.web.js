import React, { useEffect, useRef, useState } from 'react';

// Mock components so React Native doesn't crash on unrecognized child elements
export const Polygon = () => null;
Polygon.nativeName = 'Polygon';

export const Polyline = () => null;
Polyline.nativeName = 'Polyline';

export const Marker = () => null;
Marker.nativeName = 'Marker';

export const Geojson = () => null;
Geojson.nativeName = 'Geojson';

export default function MapView({ children, style, initialRegion, mapType }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [leafletLoaded, mapType]);

  // 3. Process coordinates and add geometries dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !leafletLoaded) return;

    const layers = [];

    const flattenChildren = (childrenList) => {
      const flat = [];
      React.Children.forEach(childrenList, (child) => {
        if (!child) return;
        if (child.type === React.Fragment) {
          flat.push(...flattenChildren(child.props.children));
        } else if (Array.isArray(child)) {
          flat.push(...flattenChildren(child));
        } else {
          flat.push(child);
        }
      });
      return flat;
    };

    const flatChildren = flattenChildren(children);

    flatChildren.forEach((child) => {
      // Resolve component name safely, preserving names through minification via nativeName static property
      const typeObj = child.type;
      const typeName = typeObj?.nativeName || typeObj?.type?.nativeName || typeObj?.displayName || typeObj?.name || typeObj;
      const props = child.props || {};

      if (typeName === 'Polygon') {
        const coords = props.coordinates?.map(c => [c.latitude, c.longitude]) || [];
        if (coords.length > 0) {
          const poly = window.L.polygon(coords, {
            color: props.strokeColor || '#FFD600',
            weight: props.strokeWidth || 3.5,
            fillColor: props.fillColor || 'rgba(255, 214, 0, 0.12)',
            fillOpacity: 0.3
          }).addTo(map);
          
          if (props.onPress) {
            poly.on('click', () => props.onPress());
          }
          layers.push(poly);
        }
      } 
      else if (typeName === 'Polyline') {
        const coords = props.coordinates?.map(c => [c.latitude, c.longitude]) || [];
        if (coords.length > 0) {
          const line = window.L.polyline(coords, {
            color: props.strokeColor || '#D32F2F',
            weight: props.strokeWidth || 3
          }).addTo(map);

          if (props.onPress) {
            line.on('click', () => props.onPress());
          }
          layers.push(line);
        }
      } 
      else if (typeName === 'Marker') {
        const lat = props.coordinate?.latitude;
        const lng = props.coordinate?.longitude;
        if (lat && lng) {
          // Check if custom styles exist on child component
          let dotColor = '#1A73E8'; // Default blue
          let hasCustomChild = false;
          
          if (child.props.children) {
             hasCustomChild = true;
             // Extract child properties (like style) to find background color
             const childEl = React.Children.toArray(child.props.children)[0];
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
          if (props.pinColor === 'red' || props.title === 'Start Point') {
             markerEmoji = '📍';
             badgeColor = '#D32F2F';
          } else if (props.pinColor === 'green' || props.title === 'End Point') {
             markerEmoji = '🏁';
             badgeColor = '#2E7D32';
          }

          let iconHtml = '';
          if (hasCustomChild) {
             iconHtml = `<div style="display: flex; align-items: center; justify-content: center;">
                           <div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${dotColor}; border: 2px solid white; box-shadow: 0px 0px 4px rgba(0,0,0,0.5);"></div>
                         </div>`;
          } else {
             iconHtml = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
                           <span style="font-size:28px; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">${markerEmoji}</span>
                           <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; white-space: nowrap; margin-top:-2px; border: 1px solid rgba(255,255,255,0.3); font-family: sans-serif; box-shadow: 0px 2px 4px rgba(0,0,0,0.25);">${props.title || 'Point'}</span>
                         </div>`;
          }

          const marker = window.L.marker([lat, lng], {
            icon: window.L.divIcon({
              html: iconHtml,
              className: hasCustomChild ? 'custom-leaflet-dot' : 'custom-leaflet-truck',
              iconSize: hasCustomChild ? [20, 20] : [60, 60],
              iconAnchor: hasCustomChild ? [10, 10] : [30, 45]
            })
          }).addTo(map);

          if (props.description) {
            marker.bindPopup(`<b>${props.title || 'Point'}</b><br/>${props.description}`);
          }
          layers.push(marker);
        }
      } 
      else if (typeName === 'Geojson') {
        if (props.geojson) {
          const geojsonLayer = window.L.geoJSON(props.geojson, {
            style: {
              color: props.strokeColor || '#D32F2F',
              weight: props.strokeWidth || 1.5,
              opacity: 0.8
            }
          }).addTo(map);
          layers.push(geojsonLayer);
        }
      }
    });

    return () => {
      layers.forEach(layer => map.removeLayer(layer));
    };
  }, [children, leafletLoaded]);

  return (
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
  );
}
