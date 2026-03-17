-- Migration: Add supervisor and commissioner roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'worker', 'supervisor', 'commissioner'));

-- Add Seed Users (Password: password123)
-- Hash: $2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m
INSERT INTO users (name, email, password, role) VALUES 
('Khammam Commissioner', 'commissioner@test.com', '$2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m', 'commissioner'),
('Ward Supervisor', 'supervisor@test.com', '$2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m', 'supervisor')
ON CONFLICT (email) DO NOTHING;
