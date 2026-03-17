# Cleaning Task Monitoring App - Backend

## Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL (v12+ recommended)

## Setup Instructions

1. **Database Setup**
   - Create a PostgreSQL database (e.g., `cleaning_task_app`).
   - Run the SQL script located in `database.sql` to create the essential tables (`users`, `tasks`, `photos`) and insert sample seed data.

2. **Environment Configuration**
   - Rename `.env.example` to `.env` (or create a `.env` file).
   - Configure your Postgres details and a JWT Secret:
     ```env
     PORT=5000
     DB_USER=postgres
     DB_HOST=localhost
     DB_NAME=cleaning_task_app
     DB_PASSWORD=YOUR_PASSWORD
     DB_PORT=5432
     JWT_SECRET=super_secret_jwt_key
     ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Run the Server**
   ```bash
   npm start
   ```
   (Alternatively use `nodemon server.js` for development).

## API Documentation

### Auth
- \`POST /api/register\`: { name, email, password, role ('owner'|'worker') }
- \`POST /api/login\`: { email, password } -> Returns token

### Tasks (Owner)
- \`POST /api/tasks\`: { title, description, latitude, longitude }
- \`PUT /api/tasks/:id/assign\`: { workerId }
- \`GET /api/tasks/:id/photos\`: View submitted photos
- \`PUT /api/tasks/:id/approve\` / \`reject\`: Update status

### Worker
- \`GET /api/tasks\`: Retrieves tasks assigned to logged-in worker
- \`POST /api/tasks/:id/upload-photo\`: Upload multipart/form-data (photo, latitude, longitude)
