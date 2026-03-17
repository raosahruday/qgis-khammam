# Cleaning Task Monitoring App - Frontend

## Prerequisites
- Node.js installed
- Expo CLI (\`npm install -g expo-cli\`)
- Expo Go app on your physical device for testing, or Android Studio / Xcode for emulators.

## Setup Instructions

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **API Configuration**
   - Open \`src/api/axios.js\`.
   - Update the \`API_URL\` constant to point to your backend server.
   - If using Android emulator, \`10.0.2.2:5000\` connects to your local machine's \`localhost:5000\`.
   - If testing on a physical device, find your machine's local IP address (e.g., \`192.168.x.x\`) and use that instead. Do the same in \`src/screens/Owner/PhotoReviewScreen.js\` (\`API_BASE_URL\`).

3. **Run the App**
   \`\`\`bash
   npx expo start
   \`\`\`
   - Scan the QR code with your phone (Expo Go app) or press 'a' to open on an Android emulator.

## Features implemented
- Role-based navigation based on JWT (Owner vs Worker)
- React Native Maps integration
- Reverse Location tracking & Haversine distance calculations
- Camera & File upload
- Axios Interceptors for secure requests
