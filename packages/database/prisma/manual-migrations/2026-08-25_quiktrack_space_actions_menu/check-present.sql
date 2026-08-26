-- READ-ONLY: reports whether this migration has already been applied to the
-- target DB. Run this FIRST. `present = false` rows are what migration.sql
-- creates. Nothing is modified by these queries.

-- 1. QtProject.background column
SELECT 'QtProject.background' AS object,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'app_quiktrack'
           AND table_name   = 'QtProject'
           AND column_name  = 'background'
       ) AS present;

-- 2. QtSpaceTemplate table
SELECT 'QtSpaceTemplate' AS object,
       to_regclass('app_quiktrack."QtSpaceTemplate"') IS NOT NULL AS present;
