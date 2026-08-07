# Project Proposal: RVS Eco

## Smart Municipal Cleaning & Waste Monitoring System
**Prepared For:** Ramagundam Municipal Corporation, Telangana  
**Prepared By:** RVS Eco Projects  
**Date:** July 31, 2026  

---

## Table of Contents
1. Executive Summary  
2. Introduction & Background (Ramagundam City Profile)  
3. The Problem Statement & Market Gap  
4. Proposed Solution: The RVS Eco System  
5. System Architecture & Core Technologies  
6. Detailed Workflow & AI Automated Adjudication  
7. Database Schema & GIS Spatial Mapping Methodology  
8. Security, Data Privacy & Scalability  
9. Project Implementation Plan & Phased Roadmap  
10. Expected Outcomes, Metrics & Social Impact  

---

## 1. Executive Summary

Municipal sanitation and solid waste management are critical pillars of urban administration. As Ramagundam expands rapidly as a key energy and industrial hub, standard monitoring methods fail to ensure complete accountability. The **RVS Eco Smart Municipal Cleaning & Waste Monitoring System** is a GIS-linked, AI-driven software platform designed to manage, verify, and report road cleaning and waste clearance operations in real-time.

This proposal outlines the implementation of a comprehensive software suite consisting of:
* An **Android Mobile App** for field Jawans with built-in location and photo uploading.
* A **GIS Integration Engine** that maps municipal wards, right-of-way zones, and road networks.
* An **AI automated Verification System** that evaluates photo uploads and geofence locations to approve or reject cleaning tasks instantly.
* A **Central Web Dashboard** providing real-time data, worker transfer controls, and detailed analytics for the Municipal Commissioner and Ward Supervisors.

By automating verification and allocating resources based on live spatial data, Ramagundam Municipal Corporation (RMC) can eliminate monitoring gaps, optimize manual labor, and significantly clean the city.

---

## 2. Introduction & Background

Ramagundam is a major municipal corporation in Peddapalli district, Telangana. Home to vital industries like NTPC, SCCL coal mines, and FCI, the city has a unique spatial profile blending dense residential colonies, transit corridors, and industrial zones.

Maintaining sanitation along the city's extensive road network is challenging. Traditional monitoring relies on physical supervision by Sanitary Inspectors, manual checklists, and subjective feedback, which:
* Lacks audit logs and geographic tracking.
* Restricts supervisors from verifying every cleaned segment in real-time.
* Misses data logs on Jawan attendance, swept area status, or vehicle movement.

RVS Eco digitizes this entire workflow, replacing manual reporting with auditable, geofenced tracking.

---

## 3. The Problem Statement & Market Gap

Urban centers in Telangana face recurring issues in municipal sanitation monitoring:
1. **The "Ghost Worker" & Absence Challenge**: Lack of verification that a sweeper cleaned their designated route.
2. **Subjective Manual Approvals**: Supervisors cannot verify hundreds of daily road cleaning submissions in person, leading to backlogs.
3. **Disconnected GIS Data**: Wards, roads, and ROW shapefiles are kept in desktop GIS applications (like QGIS/ArcMap) instead of being used on the ground.
4. **No Real-Time Map Analytics**: Senior administrators lack visual data showing which roads are cleaned, active, or pending on a live dashboard.

---

## 4. Proposed Solution: The RVS Eco System

RVS Eco bridges these gaps by combining mobile GIS tracking, QR verification, and vision AI:

```
┌────────────────────────────────────────────────────────┐
│            1. GIS MAPPING & SCHEDULING                 │
│  Wards, Roads & ROW mapped in database using PostGIS.  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             2. MOBILE FIELD EXECUTION                  │
│  Jawan scans START QR ➔ Cleans Road ➔ Scans END QR     │
│  and uploads photo proof.                              │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             3. AI AUTOMATED VERIFICATION               │
│  AI Engine checks image cleanliness + GPS geofence.    │
│  Auto-approves or auto-rejects task in 3 seconds.      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             4. ADMINISTRATIVE MONITORING               │
│  Commissioner and Supervisors view updated status and  │
│  cleanliness scores on live interactive map.           │
└────────────────────────────────────────────────────────┘
```

---

## 5. System Architecture & Core Technologies

The system is built on a reliable, modern stack designed for high availability:

* **Backend**: Node.js and Express.js running REST APIs.
* **Geospatial Database**: PostgreSQL with PostGIS extension for managing coordinates, polygon ward bounds, and road polyline routing.
* **AI Evaluation Engine**: Gemini 1.5 Flash Vision API (hosted on Google Cloud) to process photo cleanliness metrics and detect solid waste.
* **Mobile Client**: React Native/Expo app configured for offline storage (SQLite/AsyncStorage), GPS fetching, and camera handling.
* **Admin Web Panel**: React.js with Leaflet/React-Native-Web-Map rendering for the Commissioner Dashboard.

---

## 6. Detailed Workflow & AI Automated Adjudication

### 6.1 The Daily Sanitation Flow
1. **Task Assignment**: Roads are auto-assigned to Jawans based on their designated ward.
2. **Start Scan**: Jawan scans the physical QR code mounted on a utility pole at the starting point. The app logs the time and coordinates.
3. **Execution**: Jawan performs the cleaning route.
4. **End Scan & Photo Upload**: Jawan scans the ending QR code and takes a photo proof of the cleaned road segment.

### 6.2 The AI Verification Logic
The uploaded photo is processed by our **AI Verification Engine**, which checks three criteria:
1. **GPS Geofence Match**: Evaluates if the photo geotag matches the target road segment line geometry within 50 meters.
2. **Litter & Dirt Detection**: Checks for plastic waste, leaf piles, or mud accumulation on the pavement.
3. **Image Validity**: Ensures the photo is not black, blurry, or copied from another source.

The task is marked **AI Approved** (if score $\ge 80\%$) or **AI Rejected** (with auto-comments detailing unswept areas or GPS mismatches).

---

## 7. Database Schema & GIS Spatial Mapping Methodology

### 7.1 PostgreSQL Schema Overview
The database uses specialized geospatial indexes (`GIST`) to run fast calculations on coordinates:

```sql
-- Infrastructure Table (Wards & Roads shapefiles)
CREATE TABLE infrastructure (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  type VARCHAR(50), -- 'road', 'ward', 'row'
  properties JSONB,
  geom GEOMETRY(Geometry, 4326)
);

-- Tasks Table (Cleanliness records)
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  assigned_worker_id INT REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'submitted', 'approved', 'rejected'
  ward_id INT REFERENCES wards(id),
  source_qr_id VARCHAR(255),
  destination_qr_id VARCHAR(255),
  review_comment TEXT,
  geom GEOMETRY(Geometry, 4326)
);
```

### 7.2 GIS Shapefile Integration
1. Shapefiles (`Export_Output_APP.shp` for roads, `Export_Output_2.shp` for wards) are processed.
2. Coordinates are converted from projection `EPSG:32644` to standard WGS84 `EPSG:4326` using PostGIS:
   `ST_Transform(ST_SetSRID(geom, 32644), 4326)`.
3. Road polylines are aligned to ensure clear segment boundaries on the map.

---

## 8. Security, Data Privacy & Scalability

1. **Authentication**: All API requests are protected with JSON Web Tokens (JWT) and role-based access rules.
2. **Offline Data Security**: Stored mobile data is encrypted locally using SQLite utilities.
3. **Scaling for Ramagundam**:
   - The Postgres/PostGIS layer uses spatial indexes (`idx_tasks_geom_gist`) to handle queries for thousands of road segments instantly.
   - Dynamic caching on Leaflet maps prevents rendering lag on mobile devices and desktops.

---

## 9. Project Implementation Plan

We propose a **12-week deployment timeline** for Ramagundam Municipal Corporation:

```
[ Week 1-2 ]   ➔ GIS Data Gathering, Ward Boundary Mapping, Shapefile alignment.
[ Week 3-4 ]   ➔ Database Integration & API setup (PostGIS).
[ Week 5-6 ]   ➔ Mobile Jawan Application testing and configuration.
[ Week 7-8 ]   ➔ AI Engine testing and setting confidence thresholds.
[ Week 9-10 ]  ➔ Physical QR installation on utility poles and Jawan training.
[ Week 11-12 ] ➔ Live Trial in 2 pilot Wards, followed by full rollout.
```

---

## 10. Expected Outcomes & Social Impact

* **High Cleanliness Standard**: Automated, real-time feedback loops motivate field workers to maintain quality.
* **Cost Efficiency**: Reduces field fuel costs for inspectors by automating photo audits.
* **Modern Administration**: Brings Ramagundam Municipal Corporation to the forefront of technology-driven governance in Telangana.
