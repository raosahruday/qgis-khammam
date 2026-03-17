DROP TABLE IF EXISTS photos CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('owner', 'worker')) NOT NULL
);

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    area_geojson JSONB NOT NULL,
    assigned_worker_id INT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE photos (
    id SERIAL PRIMARY KEY, 
    task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
    worker_id INT REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example Seed Data (Passwords are 'password123' hashed with bcrypt, round 10)
-- password123 hash: $2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m
INSERT INTO users (name, email, password, role) VALUES 
('Admin Owner', 'owner@example.com', '$2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m', 'owner'),
('Worker One', 'worker1@example.com', '$2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m', 'worker');
