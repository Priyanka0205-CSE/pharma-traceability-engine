-- Additional seed data for Pharmaceutical Supply Chain Traceability
-- Adds 7 drugs and 5 batches while avoiding duplicate inserts.

BEGIN;

-- Add 7 drugs. Manufacturer organization ID 1 is Medico Pharma Ltd.
INSERT INTO drugs
    (name, generic_name, strength, dosage_form, manufacturer_id,
     storage_temp_min, storage_temp_max)
SELECT v.name, v.generic_name, v.strength, v.dosage_form, 1,
       v.storage_temp_min, v.storage_temp_max
FROM (VALUES
    ('Dolo 650', 'Paracetamol', '650 mg', 'Tablet', 15, 30),
    ('Azithral 500', 'Azithromycin', '500 mg', 'Tablet', 15, 30),
    ('Metformin 500', 'Metformin', '500 mg', 'Tablet', 15, 30),
    ('Cetirizine 10', 'Cetirizine', '10 mg', 'Tablet', 15, 30),
    ('Pantoprazole 40', 'Pantoprazole', '40 mg', 'Tablet', 15, 30),
    ('ORS Sachet', 'Oral Rehydration Salts', '21.8 g', 'Powder', 15, 30),
    ('Amoxiclav 625', 'Amoxicillin + Clavulanic Acid', '625 mg', 'Tablet', 15, 30)
) AS v(name, generic_name, strength, dosage_form,
       storage_temp_min, storage_temp_max)
WHERE NOT EXISTS (
    SELECT 1 FROM drugs d WHERE d.name = v.name
);

-- Add 5 batches, linked to the drugs by name.
-- Existing batch numbers are preserved.
INSERT INTO batches
    (drug_id, batch_no, mfg_date, expiry_date, quantity_planned)
SELECT d.drug_id, v.batch_no, v.mfg_date, v.expiry_date, v.quantity_planned
FROM (VALUES
    ('Dolo 650',       'DOLO-2026-01', DATE '2026-08-01', DATE '2028-07-31', 100),
    ('Azithral 500',   'AZI-2026-01',  DATE '2026-08-10', DATE '2028-08-09', 100),
    ('Metformin 500',  'MET-2026-01',  DATE '2026-07-15', DATE '2028-07-14', 150),
    ('Cetirizine 10',  'CET-2026-01',  DATE '2026-09-01', DATE '2028-08-31', 100),
    ('Pantoprazole 40','PAN-2026-01',  DATE '2026-09-10', DATE '2028-09-09', 100)
) AS v(drug_name, batch_no, mfg_date, expiry_date, quantity_planned)
JOIN drugs d ON d.name = v.drug_name
WHERE NOT EXISTS (
    SELECT 1
    FROM batches b
    WHERE b.drug_id = d.drug_id
      AND b.batch_no = v.batch_no
);

COMMIT;
