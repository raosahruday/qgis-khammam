# End-to-End Production Deployment Guide

This guide describes how to deploy the **Khammam Cleanup QGIS Project** backend and database to Render, and set up photo storage on Supabase.

---

## Part 1: Set up PostgreSQL Database on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New** (top right) $\rightarrow$ **PostgreSQL**.
3. Fill out the configuration fields:
   - **Name**: `qgis-database`
   - **Region**: Choose a region close to your target location (e.g., `Singapore`).
   - **Database Name**: `qgis_db` (or leave default)
   - **Instance Type**: Select **Basic (256 MB RAM / 0.1 CPU)** for **$6/month**. *(Do not use Free as it expires after 30 days).*
   - **Storage**: Set storage capacity to **1 GB** (costs **$0.30/month**).
4. Click **Create Database**.
5. Once the database status changes to **Available**, scroll down to the **Connection** block and copy the **Internal Database URL** (e.g. `postgresql://...`).

---

## Part 2: Set up Supabase Storage Bucket
1. Log in to your [Supabase Dashboard](https://supabase.com).
2. Click **New Project** (if you don't have one) and complete the basic project setup.
3. Click on **Storage** in the left-hand sidebar (the bucket icon).
4. Click **New Bucket**.
5. Configure the bucket:
   - **Name**: `task-photos`
   - **Public Bucket**: **Toggle ON** *(required so the Commissioner dashboard can fetch public image links).*
6. Click **Save**.
## Part 2B: Set up Fast2SMS for Mobile OTPs
1. Go to [Fast2SMS](https://www.fast2sms.com) and register for a free account.
2. Log in and copy your **API Authorization Key** from your Dev API dashboard.
3. Recharge your wallet (you can add ₹100 using UPI/Google Pay/Paytm).
4. Add the key as an environment variable in Render (`FAST2SMS_API_KEY`).

## Part 2C: Get your Supabase API Keys
1. Go to **Project Settings** (the gear icon at the bottom of the left sidebar) $\rightarrow$ **API**.
2. Copy the following credentials:
   - **Project URL** (This is your `SUPABASE_URL`)
   - **`service_role` Secret API Key** (This is your `SUPABASE_KEY` - click *Reveal* to copy it. *Do not use the public/anon key*).

---

## Part 3: Deploy the Web Service on Render
1. Go back to your [Render Dashboard](https://dashboard.render.com).
2. Click **New** $\rightarrow$ **Web Service**.
3. Select your connected GitHub repository: **`qgis-khammam`**.
4. Configure the Web Service settings:
   - **Name**: `khammam-cleanup-backend`
   - **Region**: *Select the exact same region as your PostgreSQL database* (e.g., `Singapore`).
   - **Branch**: `main`
   - **Root Directory**: `QGIS/QGIS/backend` *(This tells Render to enter the backend folder directly).*
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Select **Starter ($7/month)** to keep it awake 24/7 or **Free**.

---

## Part 4: Add Environment Variables on Render
Before launching the Web Service, scroll down to the **Environment Variables** section (or click **Add Environment Variable** under the *Environment* settings page) and input the following values:

| Key | Value | Notes |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | *(Paste the **Internal Database URL** from Part 1)* | Render internal database link |
| **`JWT_SECRET`** | `quejwrllmnvfhshsjk__9920_58ujd` | A secure string for encrypting user login tokens |
| **`PORT`** | `5000` | Backend port |
| **`SUPABASE_URL`** | *(Paste the Supabase Project URL from Part 2)* | Supabase API connection |
| **`SUPABASE_KEY`** | *(Paste the Supabase `service_role` key from Part 2)* | Supabase credentials |
| **`SUPABASE_BUCKET`** | `task-photos` | Supabase Bucket name |
| **`FAST2SMS_API_KEY`** | *(Paste the Fast2SMS API Authorization Key from Part 2B)* | Fast2SMS Gateway credential (optional, fallback to console simulated OTP if left empty) |

Click **Create Web Service** (or **Save Changes**). Render will pull your GitHub repository, install packages, and deploy the live backend.

---

## Part 5: Update the Frontend API Connection URL
Once the Render Web Service deployment succeeds, copy the **Live Service URL** (e.g., `https://khammam-cleanup-backend.onrender.com`) from the top of the page.

In your local code or build configuration:
1. Open `QGIS/QGIS/frontend/src/api/axios.js`.
2. Update the `baseURL` to point to your new Live Service URL instead of `http://localhost:5000/api`.
3. Commit and push the frontend changes to GitHub!

---

## Part 6: Deploy the Web Dashboard (Static Site) on Render
1. Go back to your [Render Dashboard](https://dashboard.render.com).
2. Click **New** $\rightarrow$ **Static Site**.
3. Select your connected GitHub repository: **`qgis-khammam`**.
4. Configure the Static Site settings:
   - **Name**: `khammam-cleanup-dashboard`
   - **Branch**: `main`
   - **Root Directory**: `QGIS/QGIS/frontend` *(This tells Render to enter the frontend folder).*
   - **Build Command**: `npx expo export` *(This compiles the React Native web files into a production build).*
   - **Publish Directory**: `dist` *(This is the directory where the compiled web build is outputted).*
5. Click **Create Static Site**.
6. Once the deployment completes, Render will provide you with a live URL (e.g., `https://khammam-cleanup-dashboard.onrender.com`). You and the Commissioner can open this URL in any browser to access the dashboard!

---

## Part 7: Build the Mobile App APK (Without Google Play Store)
If you want to generate a direct installer (`.apk` file) to share with your workers via WhatsApp:
1. Open your terminal in the frontend directory (`QGIS/QGIS/frontend`).
2. Install EAS CLI globally if you haven't already:
   ```bash
   npm install -g eas-cli
   ```
3. Log in to your Expo account:
   ```bash
   eas login
   ```
4. Initialize EAS configuration (if not already done):
   ```bash
   eas build:configure
   ```
   *(Select "All" or "Android" when prompted).*
5. Run the build command for a direct installable APK:
   ```bash
   eas build --platform android --profile preview
   ```
6. EAS will build the app in the cloud. Once completed, it will output a downloadable link to your **`.apk`** file. Send this file to your workers to install directly on their phones!
