-- Create tables for F1 data
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for forum posts
CREATE TABLE IF NOT EXISTS postforum (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    username VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create gallery table
CREATE TABLE IF NOT EXISTS gallery (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    user_sub TEXT
);

-- Create med_journal table
CREATE TABLE IF NOT EXISTS med_journal (
    id UUID PRIMARY KEY,
    "patientSetting" TEXT NOT NULL,
    "interaction" TEXT NOT NULL,
    "canmedsRoles" JSONB,
    "learningObjectives" JSONB,
    "rotation" TEXT,
    "date" DATE,
    "location" TEXT,
    "hospital" TEXT,
    "doctor" TEXT,
    "whatIDidWell" TEXT,
    "whatICouldImprove" TEXT,
    user_sub TEXT NOT NULL
);

-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY,
    text TEXT NOT NULL,
    rotation TEXT NOT NULL,
    journal_entry_id UUID REFERENCES med_journal(id),
    user_sub TEXT NOT NULL
);

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;