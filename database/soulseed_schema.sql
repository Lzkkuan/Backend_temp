SET timezone = 'Asia/Singapore';
SET TIME ZONE 'Asia/Singapore';

CREATE TABLE IF NOT EXISTS roles (
  role TEXT PRIMARY KEY
);
INSERT INTO roles (role) VALUES
  ('user'), ('admin')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS departments (
  dept TEXT PRIMARY KEY
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  email VARCHAR(254) PRIMARY KEY, -- RFC 3696 style length
  password_hash CHAR(64) NOT NULL, -- SHA-256 hex
  name VARCHAR(254) NOT NULL,
  role TEXT NOT NULL REFERENCES roles(role),
);
