-- =====================================================================
-- Pharmaceutical Supply Chain Serialized Traceability Engine
-- PostgreSQL schema  (run:  psql -U postgres -d pharma_trace -f schema.sql)
-- =====================================================================

-- Clean re-run (demonstrates DROP)
DROP VIEW  IF EXISTS v_expiring_stock, v_chain_of_custody, v_recall_impact, v_stock_by_org CASCADE;
DROP TABLE IF EXISTS audit_log, dispensations, recalls, custody_transfers,
                     shipment_items, shipments, serial_units, batches,
                     drugs, users, organizations CASCADE;

-- =====================================================================
-- 1. TABLES (DDL: CREATE, PK, FK, constraints)
-- =====================================================================

CREATE TABLE organizations (
    org_id      SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    org_type    VARCHAR(20)  NOT NULL
                CHECK (org_type IN ('MANUFACTURER','DISTRIBUTOR','PHARMACY','REGULATOR')),
    license_no  VARCHAR(40)  NOT NULL UNIQUE,
    address     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    email          VARCHAR(150) NOT NULL UNIQUE
                   CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password_hash  VARCHAR(255) NOT NULL,
    full_name      VARCHAR(100) NOT NULL,
    role           VARCHAR(20)  NOT NULL
                   CHECK (role IN ('ADMIN','MANUFACTURER','DISTRIBUTOR','PHARMACY')),
    org_id         INT REFERENCES organizations(org_id) ON DELETE RESTRICT,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    -- every non-admin user must belong to an organization
    CONSTRAINT chk_user_org CHECK (role = 'ADMIN' OR org_id IS NOT NULL)
);

CREATE TABLE drugs (
    drug_id          SERIAL PRIMARY KEY,
    name             VARCHAR(120) NOT NULL,
    generic_name     VARCHAR(120) NOT NULL,
    strength         VARCHAR(40)  NOT NULL,
    dosage_form      VARCHAR(40)  NOT NULL,
    manufacturer_id  INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    storage_temp_min NUMERIC(4,1) DEFAULT 2.0,    -- cold-chain limits (deg C)
    storage_temp_max NUMERIC(4,1) DEFAULT 25.0,
    CONSTRAINT chk_temp CHECK (storage_temp_min < storage_temp_max),
    -- Full-text search column (auto maintained)
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(name,'') || ' ' || coalesce(generic_name,'') || ' ' || coalesce(dosage_form,''))
    ) STORED
);

CREATE TABLE batches (
    batch_id     SERIAL PRIMARY KEY,
    drug_id      INT NOT NULL REFERENCES drugs(drug_id) ON DELETE RESTRICT,
    batch_no     VARCHAR(40) NOT NULL,
    mfg_date     DATE NOT NULL,
    expiry_date  DATE NOT NULL,
    status       VARCHAR(15) NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','RECALLED')),
    UNIQUE (drug_id, batch_no),
    CONSTRAINT chk_dates CHECK (expiry_date > mfg_date)
);

CREATE TABLE serial_units (
    serial_no             VARCHAR(40) PRIMARY KEY,           -- globally unique serial
    batch_id              INT NOT NULL REFERENCES batches(batch_id) ON DELETE RESTRICT,
    current_owner_org_id  INT NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    status                VARCHAR(15) NOT NULL DEFAULT 'IN_STOCK'
                          CHECK (status IN ('IN_STOCK','IN_TRANSIT','DISPENSED','RECALLED')),
    created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE shipments (
    shipment_id    SERIAL PRIMARY KEY,
    from_org_id    INT NOT NULL REFERENCES organizations(org_id),
    to_org_id      INT NOT NULL REFERENCES organizations(org_id),
    ship_date      TIMESTAMP NOT NULL DEFAULT NOW(),
    received_date  TIMESTAMP,
    status         VARCHAR(15) NOT NULL DEFAULT 'IN_TRANSIT'
                   CHECK (status IN ('IN_TRANSIT','RECEIVED','CANCELLED')),
    CONSTRAINT chk_diff_orgs CHECK (from_org_id <> to_org_id),
    CONSTRAINT chk_received  CHECK (received_date IS NULL OR received_date >= ship_date)
);

CREATE TABLE shipment_items (          -- M:N between shipments and serial_units
    shipment_id INT NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    serial_no   VARCHAR(40) NOT NULL REFERENCES serial_units(serial_no) ON DELETE RESTRICT,
    PRIMARY KEY (shipment_id, serial_no)
);

CREATE TABLE custody_transfers (
    transfer_id     SERIAL PRIMARY KEY,
    serial_no       VARCHAR(40) NOT NULL REFERENCES serial_units(serial_no) ON DELETE RESTRICT,
    from_org_id     INT REFERENCES organizations(org_id),     -- NULL = initial manufacture
    to_org_id       INT NOT NULL REFERENCES organizations(org_id),
    shipment_id     INT REFERENCES shipments(shipment_id),
    transferred_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE recalls (
    recall_id   SERIAL PRIMARY KEY,
    batch_id    INT NOT NULL REFERENCES batches(batch_id),
    reason      TEXT NOT NULL CHECK (length(trim(reason)) >= 10),
    issued_by   INT NOT NULL REFERENCES users(user_id),
    issued_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE dispensations (
    dispense_id   SERIAL PRIMARY KEY,
    serial_no     VARCHAR(40) NOT NULL UNIQUE REFERENCES serial_units(serial_no),  -- a pack is dispensed once
    pharmacy_id   INT NOT NULL REFERENCES organizations(org_id),
    dispensed_by  INT REFERENCES users(user_id),
    dispensed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
    log_id      BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(50) NOT NULL,
    action      VARCHAR(10) NOT NULL,
    record_id   VARCHAR(60),
    old_data    JSONB,
    new_data    JSONB,
    changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ALTER examples (demonstrates ALTER)
ALTER TABLE organizations ADD COLUMN contact_phone VARCHAR(20);
ALTER TABLE organizations ADD CONSTRAINT chk_phone
      CHECK (contact_phone IS NULL OR contact_phone ~ '^[0-9+\- ]{7,20}$');
ALTER TABLE batches ADD COLUMN quantity_planned INT CHECK (quantity_planned IS NULL OR quantity_planned > 0);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================
CREATE INDEX idx_serial_batch    ON serial_units(batch_id);
CREATE INDEX idx_serial_owner    ON serial_units(current_owner_org_id, status);
CREATE INDEX idx_batch_expiry    ON batches(expiry_date);
CREATE INDEX idx_custody_serial  ON custody_transfers(serial_no, transferred_at);
CREATE INDEX idx_shipment_status ON shipments(status);
CREATE INDEX idx_drug_fts        ON drugs USING GIN (search_vector);   -- full-text search

-- =====================================================================
-- 3. TRIGGERS
-- =====================================================================

-- 3a. Audit trigger (generic)
CREATE OR REPLACE FUNCTION fn_audit() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log(table_name, action, record_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'UPDATE',
                COALESCE(NEW.serial_no, NEW.batch_id::text),
                to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_audit_serial() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.current_owner_org_id IS DISTINCT FROM NEW.current_owner_org_id THEN
        INSERT INTO audit_log(table_name, action, record_id, old_data, new_data)
        VALUES ('serial_units','UPDATE', NEW.serial_no, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_serial
AFTER UPDATE ON serial_units
FOR EACH ROW EXECUTE FUNCTION fn_audit_serial();

-- 3b. Block shipping of expired / recalled / not-owned / not-in-stock units
CREATE OR REPLACE FUNCTION fn_validate_shipment_item() RETURNS TRIGGER AS $$
DECLARE
    v_unit     serial_units%ROWTYPE;
    v_batch    batches%ROWTYPE;
    v_from_org INT;
BEGIN
    SELECT * INTO v_unit  FROM serial_units WHERE serial_no = NEW.serial_no;
    SELECT * INTO v_batch FROM batches      WHERE batch_id  = v_unit.batch_id;
    SELECT from_org_id INTO v_from_org FROM shipments WHERE shipment_id = NEW.shipment_id;

    IF v_batch.status = 'RECALLED' OR v_unit.status = 'RECALLED' THEN
        RAISE EXCEPTION 'Serial % belongs to a RECALLED batch and cannot be shipped', NEW.serial_no;
    END IF;
    IF v_batch.expiry_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Serial % is EXPIRED (expiry %)', NEW.serial_no, v_batch.expiry_date;
    END IF;
    IF v_unit.current_owner_org_id <> v_from_org THEN
        RAISE EXCEPTION 'Serial % is not owned by the sending organization', NEW.serial_no;
    END IF;
    IF v_unit.status <> 'IN_STOCK' THEN
        RAISE EXCEPTION 'Serial % is not IN_STOCK (current status: %)', NEW.serial_no, v_unit.status;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_shipment_item
BEFORE INSERT ON shipment_items
FOR EACH ROW EXECUTE FUNCTION fn_validate_shipment_item();

-- 3c. Recall cascade: when a recall is issued, flag the batch and every unit not yet dispensed
CREATE OR REPLACE FUNCTION fn_recall_cascade() RETURNS TRIGGER AS $$
BEGIN
    UPDATE batches      SET status = 'RECALLED' WHERE batch_id = NEW.batch_id;
    UPDATE serial_units SET status = 'RECALLED'
     WHERE batch_id = NEW.batch_id AND status <> 'DISPENSED';
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recall_cascade
AFTER INSERT ON recalls
FOR EACH ROW EXECUTE FUNCTION fn_recall_cascade();

-- 3d. Dispensing validation + status update
CREATE OR REPLACE FUNCTION fn_validate_dispense() RETURNS TRIGGER AS $$
DECLARE
    v_unit  serial_units%ROWTYPE;
    v_exp   DATE;
BEGIN
    SELECT * INTO v_unit FROM serial_units WHERE serial_no = NEW.serial_no;
    SELECT expiry_date INTO v_exp FROM batches WHERE batch_id = v_unit.batch_id;

    IF v_unit.status = 'RECALLED' THEN
        RAISE EXCEPTION 'Serial % is RECALLED - do not dispense', NEW.serial_no;
    END IF;
    IF v_exp < CURRENT_DATE THEN
        RAISE EXCEPTION 'Serial % is EXPIRED - do not dispense', NEW.serial_no;
    END IF;
    IF v_unit.current_owner_org_id <> NEW.pharmacy_id OR v_unit.status <> 'IN_STOCK' THEN
        RAISE EXCEPTION 'Serial % is not in stock at this pharmacy', NEW.serial_no;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_dispense
BEFORE INSERT ON dispensations
FOR EACH ROW EXECUTE FUNCTION fn_validate_dispense();

CREATE OR REPLACE FUNCTION fn_after_dispense() RETURNS TRIGGER AS $$
BEGIN
    UPDATE serial_units SET status = 'DISPENSED' WHERE serial_no = NEW.serial_no;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_after_dispense
AFTER INSERT ON dispensations
FOR EACH ROW EXECUTE FUNCTION fn_after_dispense();

-- =====================================================================
-- 4. STORED FUNCTIONS (each runs as ONE atomic transaction)
-- =====================================================================

-- 4a. Generate serial numbers for a batch (manufacturer)
CREATE OR REPLACE FUNCTION generate_serials(p_batch_id INT, p_manufacturer_org INT, p_count INT)
RETURNS INT AS $$
DECLARE
    v_start INT;
    i INT;
    v_serial TEXT;
BEGIN
    IF p_count <= 0 OR p_count > 100000 THEN
        RAISE EXCEPTION 'Count must be between 1 and 100000';
    END IF;
    SELECT COUNT(*) + 1 INTO v_start FROM serial_units WHERE batch_id = p_batch_id;
    FOR i IN v_start .. v_start + p_count - 1 LOOP
        v_serial := 'SN-' || LPAD(p_batch_id::text, 5, '0') || '-' || LPAD(i::text, 7, '0');
        INSERT INTO serial_units(serial_no, batch_id, current_owner_org_id, status)
        VALUES (v_serial, p_batch_id, p_manufacturer_org, 'IN_STOCK');
        INSERT INTO custody_transfers(serial_no, from_org_id, to_org_id)
        VALUES (v_serial, NULL, p_manufacturer_org);
    END LOOP;
    RETURN p_count;
END; $$ LANGUAGE plpgsql;

-- 4b. Create a shipment. Any invalid serial raises an exception => whole shipment rolls back.
CREATE OR REPLACE FUNCTION create_shipment(p_from INT, p_to INT, p_serials TEXT[])
RETURNS INT AS $$
DECLARE
    v_ship_id INT;
    s TEXT;
BEGIN
    INSERT INTO shipments(from_org_id, to_org_id) VALUES (p_from, p_to)
    RETURNING shipment_id INTO v_ship_id;

    FOREACH s IN ARRAY p_serials LOOP
        INSERT INTO shipment_items(shipment_id, serial_no) VALUES (v_ship_id, s);  -- trigger validates
        UPDATE serial_units SET status = 'IN_TRANSIT' WHERE serial_no = s;
    END LOOP;
    RETURN v_ship_id;
END; $$ LANGUAGE plpgsql;

-- 4c. Receive a shipment: transfer custody for every item atomically
CREATE OR REPLACE FUNCTION receive_shipment(p_shipment_id INT, p_receiving_org INT)
RETURNS INT AS $$
DECLARE
    v_ship shipments%ROWTYPE;
    v_cnt  INT := 0;
    r RECORD;
BEGIN
    SELECT * INTO v_ship FROM shipments WHERE shipment_id = p_shipment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shipment % not found', p_shipment_id; END IF;
    IF v_ship.status <> 'IN_TRANSIT' THEN
        RAISE EXCEPTION 'Shipment % is already %', p_shipment_id, v_ship.status;
    END IF;
    IF v_ship.to_org_id <> p_receiving_org THEN
        RAISE EXCEPTION 'Shipment % is not addressed to this organization', p_shipment_id;
    END IF;

    FOR r IN SELECT serial_no FROM shipment_items WHERE shipment_id = p_shipment_id LOOP
        INSERT INTO custody_transfers(serial_no, from_org_id, to_org_id, shipment_id)
        VALUES (r.serial_no, v_ship.from_org_id, v_ship.to_org_id, p_shipment_id);

        UPDATE serial_units
           SET current_owner_org_id = v_ship.to_org_id,
               status = CASE WHEN status = 'RECALLED' THEN 'RECALLED' ELSE 'IN_STOCK' END
         WHERE serial_no = r.serial_no;
        v_cnt := v_cnt + 1;
    END LOOP;

    UPDATE shipments SET status = 'RECEIVED', received_date = NOW() WHERE shipment_id = p_shipment_id;
    RETURN v_cnt;
END; $$ LANGUAGE plpgsql;

-- 4d. Issue a recall (trigger does the cascade) and return number of impacted units
CREATE OR REPLACE FUNCTION initiate_recall(p_batch_id INT, p_reason TEXT, p_user INT)
RETURNS INT AS $$
DECLARE v_impacted INT;
BEGIN
    INSERT INTO recalls(batch_id, reason, issued_by) VALUES (p_batch_id, p_reason, p_user);
    SELECT COUNT(*) INTO v_impacted FROM serial_units WHERE batch_id = p_batch_id AND status = 'RECALLED';
    RETURN v_impacted;
END; $$ LANGUAGE plpgsql;

-- 4e. Public verification of a serial number
CREATE OR REPLACE FUNCTION verify_serial(p_serial TEXT)
RETURNS TABLE(result TEXT, drug_name TEXT, batch_no TEXT, expiry_date DATE, current_owner TEXT, status TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT CASE
             WHEN b.status = 'RECALLED' OR u.status = 'RECALLED' THEN 'RECALLED - DO NOT USE'
             WHEN b.expiry_date < CURRENT_DATE                  THEN 'EXPIRED'
             WHEN u.status = 'DISPENSED'                         THEN 'ALREADY DISPENSED'
             ELSE 'GENUINE'
           END,
           d.name::text, b.batch_no::text, b.expiry_date, o.name::text, u.status::text
      FROM serial_units u
      JOIN batches b       ON b.batch_id = u.batch_id
      JOIN drugs d         ON d.drug_id  = b.drug_id
      JOIN organizations o ON o.org_id   = u.current_owner_org_id
     WHERE u.serial_no = p_serial;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT FOUND - POSSIBLE COUNTERFEIT'::text, NULL::text, NULL::text, NULL::date, NULL::text, NULL::text;
    END IF;
END; $$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. VIEWS
-- =====================================================================
CREATE VIEW v_expiring_stock AS
SELECT o.name AS organization, d.name AS drug, b.batch_no, b.expiry_date,
       (b.expiry_date - CURRENT_DATE) AS days_left, COUNT(*) AS units
  FROM serial_units u
  JOIN batches b       ON b.batch_id = u.batch_id
  JOIN drugs d         ON d.drug_id = b.drug_id
  JOIN organizations o ON o.org_id = u.current_owner_org_id
 WHERE u.status = 'IN_STOCK' AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
 GROUP BY o.name, d.name, b.batch_no, b.expiry_date;

CREATE VIEW v_chain_of_custody AS
SELECT c.serial_no, c.transferred_at,
       COALESCE(f.name, 'MANUFACTURED') AS from_org,
       t.name AS to_org, c.shipment_id
  FROM custody_transfers c
  LEFT JOIN organizations f ON f.org_id = c.from_org_id
  JOIN organizations t      ON t.org_id = c.to_org_id
 ORDER BY c.serial_no, c.transferred_at;

CREATE VIEW v_recall_impact AS
SELECT r.recall_id, b.batch_no, d.name AS drug, o.name AS holder, o.org_type,
       u.status, COUNT(*) AS units
  FROM recalls r
  JOIN batches b       ON b.batch_id = r.batch_id
  JOIN drugs d         ON d.drug_id = b.drug_id
  JOIN serial_units u  ON u.batch_id = b.batch_id
  JOIN organizations o ON o.org_id = u.current_owner_org_id
 GROUP BY r.recall_id, b.batch_no, d.name, o.name, o.org_type, u.status;

CREATE VIEW v_stock_by_org AS
SELECT o.org_id, o.name AS organization, d.name AS drug, COUNT(*) AS units_in_stock
  FROM serial_units u
  JOIN batches b       ON b.batch_id = u.batch_id
  JOIN drugs d         ON d.drug_id = b.drug_id
  JOIN organizations o ON o.org_id = u.current_owner_org_id
 WHERE u.status = 'IN_STOCK'
 GROUP BY o.org_id, o.name, d.name;

-- =====================================================================
-- 6. SEED DATA
-- (password_hash values are placeholders: create real users through the
--  app's register route or a seed script that uses bcrypt.)
-- =====================================================================
INSERT INTO organizations(name, org_type, license_no, address) VALUES
 ('Medico Pharma Ltd',     'MANUFACTURER', 'MFG-KA-001', 'Bengaluru'),
 ('SwiftMed Distributors', 'DISTRIBUTOR',  'DST-KA-014', 'Mysuru'),
 ('CityCare Pharmacy',     'PHARMACY',     'PHR-KA-107', 'Mysuru'),
 ('HealthPlus Pharmacy',   'PHARMACY',     'PHR-KA-221', 'Mandya'),
 ('State Drug Regulator',  'REGULATOR',    'REG-KA-001', 'Bengaluru');

INSERT INTO users(email, password_hash, full_name, role, org_id) VALUES
 ('admin@pharma.test',  'CHANGE_ME', 'Admin User',  'ADMIN',        NULL),
 ('mfg@pharma.test',    'CHANGE_ME', 'Mfg Manager', 'MANUFACTURER', 1),
 ('dist@pharma.test',   'CHANGE_ME', 'Dist Manager','DISTRIBUTOR',  2),
 ('pharm@pharma.test',  'CHANGE_ME', 'Pharmacist',  'PHARMACY',     3);

INSERT INTO drugs(name, generic_name, strength, dosage_form, manufacturer_id) VALUES
 ('Calpol 500',  'Paracetamol',   '500 mg', 'Tablet',    1),
 ('Amoxil 250',  'Amoxicillin',   '250 mg', 'Capsule',   1),
 ('InsuSafe',    'Human Insulin', '100 IU/ml', 'Injection', 1);

INSERT INTO batches(drug_id, batch_no, mfg_date, expiry_date) VALUES
 (1, 'B2026-A1', '2026-01-10', '2028-01-09'),
 (2, 'B2026-B7', '2026-02-15', '2027-02-14'),
 (3, 'B2023-OLD','2023-01-01', '2024-12-31');          -- expired batch for testing

SELECT generate_serials(1, 1, 50);
SELECT generate_serials(2, 1, 30);
SELECT generate_serials(3, 1, 10);

-- Sample flow: manufacturer -> distributor -> pharmacy
-- SELECT create_shipment(1, 2, ARRAY['SN-00001-0000001','SN-00001-0000002']);
-- SELECT receive_shipment(1, 2);
