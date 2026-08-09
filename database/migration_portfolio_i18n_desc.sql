-- Migration: replace description + features with i18n description fields
-- Run once against the database

ALTER TABLE portfolio_projects
    ADD COLUMN IF NOT EXISTS description_ru TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description_pl TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT '';

-- Copy existing description into all three languages (for existing rows)
UPDATE portfolio_projects
SET description_ru = description,
    description_pl = description,
    description_en = description
WHERE description IS NOT NULL AND description <> '';

-- Drop old columns
ALTER TABLE portfolio_projects
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS features;
