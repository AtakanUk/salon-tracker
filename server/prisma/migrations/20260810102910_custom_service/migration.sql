-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "custom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SessionItem" ADD COLUMN     "note" TEXT;

-- The "Özel işlem" tile is an ordinary service row, so records, statistics and
-- the Excel export keep working unchanged; only its amount comes from the
-- employee instead of the price list. Inserted here rather than in the seed
-- because every installation that already exists has been seeded once already.
INSERT INTO "Service" ("nameTr", "nameDe", "priceCents", "sortOrder", "active", "custom")
SELECT 'Özel işlem',
       'Sonderleistung',
       0,
       COALESCE((SELECT MAX("sortOrder") + 1 FROM "Service"), 0),
       true,
       true
WHERE NOT EXISTS (SELECT 1 FROM "Service" WHERE "custom" = true);
