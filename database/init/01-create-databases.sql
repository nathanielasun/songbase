-- Create databases for Songbase
-- This script runs as superuser during container initialization

-- Create the main metadata database
SELECT 'CREATE DATABASE songbase_metadata'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'songbase_metadata')\gexec

-- Create the image database
SELECT 'CREATE DATABASE songbase_images'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'songbase_images')\gexec
