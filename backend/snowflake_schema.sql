-- ============================================================
-- MDM MAPPING TOOL — SNOWFLAKE ENTERPRISE SCHEMA
-- Version: 1.0
-- Purpose: Production-ready data model for healthcare MDM
-- ============================================================

-- ============ DIMENSION TABLES (Standard Values) ============

CREATE OR REPLACE TABLE DIM_STANDARD_VALUES (
    standard_id         VARCHAR(64)     NOT NULL PRIMARY KEY,
    standard_code       VARCHAR(50)     NOT NULL,
    standard_label      VARCHAR(255)    NOT NULL,
    standard_description VARCHAR(1000)  DEFAULT '',
    domain_name         VARCHAR(100)    NOT NULL,
    version_no          INTEGER         DEFAULT 1,
    is_active           BOOLEAN         DEFAULT TRUE,
    effective_from      TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    effective_to        TIMESTAMP_NTZ   DEFAULT '9999-12-31',
    created_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    created_by          VARCHAR(100)    DEFAULT 'system',
    UNIQUE (domain_name, standard_code, version_no)
);

-- Domain-specific views for convenience
CREATE OR REPLACE VIEW DIM_STANDARD_ED_DISPOSITION AS
SELECT * FROM DIM_STANDARD_VALUES WHERE domain_name = 'Disposition' AND is_active = TRUE;

CREATE OR REPLACE VIEW DIM_STANDARD_SPECIALTY AS
SELECT * FROM DIM_STANDARD_VALUES WHERE domain_name = 'Specialty' AND is_active = TRUE;

CREATE OR REPLACE VIEW DIM_STANDARD_WARD AS
SELECT * FROM DIM_STANDARD_VALUES WHERE domain_name = 'Ward' AND is_active = TRUE;

CREATE OR REPLACE VIEW DIM_STANDARD_GENDER AS
SELECT * FROM DIM_STANDARD_VALUES WHERE domain_name = 'Gender' AND is_active = TRUE;

CREATE OR REPLACE VIEW DIM_STANDARD_PRIORITY AS
SELECT * FROM DIM_STANDARD_VALUES WHERE domain_name = 'Priority' AND is_active = TRUE;

CREATE OR REPLACE VIEW DIM_STANDARD_STATUS AS
SELECT * FROM DIM_STANDARD_VALUES WHERE domain_name = 'Status' AND is_active = TRUE;


-- ============ MAPPING BRIDGE TABLE ============

CREATE OR REPLACE TABLE BRIDGE_SOURCE_TO_STANDARD (
    mapping_id          VARCHAR(64)     NOT NULL PRIMARY KEY,
    domain_name         VARCHAR(100)    NOT NULL,
    source_system       VARCHAR(100)    DEFAULT 'unknown',
    source_field_name   VARCHAR(255)    DEFAULT '',
    source_value        VARCHAR(1000)   NOT NULL,
    source_value_normalized VARCHAR(1000) DEFAULT '',
    standard_id         VARCHAR(64)     REFERENCES DIM_STANDARD_VALUES(standard_id),
    standard_code       VARCHAR(50),
    standard_label      VARCHAR(255),
    confidence_score    FLOAT           DEFAULT 0.0,
    mapping_status      VARCHAR(30)     DEFAULT 'proposed',  -- proposed/auto_mapped/pending_review/approved/rejected/retired
    mapping_method      VARCHAR(30)     DEFAULT 'manual',    -- exact/normalized/keyword/fuzzy/ai/manual
    approved_by         VARCHAR(100),
    approved_at         TIMESTAMP_NTZ,
    rejected_by         VARCHAR(100),
    rejected_at         TIMESTAMP_NTZ,
    rejection_reason    VARCHAR(500),
    version_no          INTEGER         DEFAULT 1,
    is_active           BOOLEAN         DEFAULT TRUE,
    effective_from      TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    effective_to        TIMESTAMP_NTZ   DEFAULT '9999-12-31',
    created_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    created_by          VARCHAR(100)    DEFAULT 'system'
);

-- Indexes for performance
CREATE OR REPLACE INDEX IDX_BRIDGE_DOMAIN ON BRIDGE_SOURCE_TO_STANDARD (domain_name);
CREATE OR REPLACE INDEX IDX_BRIDGE_SOURCE ON BRIDGE_SOURCE_TO_STANDARD (source_value);
CREATE OR REPLACE INDEX IDX_BRIDGE_STANDARD ON BRIDGE_SOURCE_TO_STANDARD (standard_id);
CREATE OR REPLACE INDEX IDX_BRIDGE_STATUS ON BRIDGE_SOURCE_TO_STANDARD (mapping_status);
CREATE OR REPLACE INDEX IDX_BRIDGE_LOOKUP ON BRIDGE_SOURCE_TO_STANDARD (domain_name, source_value_normalized, is_active);


-- ============ SYNONYM TABLE ============

CREATE OR REPLACE TABLE DIM_SYNONYMS (
    synonym_id              VARCHAR(64)     NOT NULL PRIMARY KEY,
    source_value_raw        VARCHAR(1000)   NOT NULL,
    source_value_normalized VARCHAR(1000)   NOT NULL,
    standard_id             VARCHAR(64)     REFERENCES DIM_STANDARD_VALUES(standard_id),
    standard_code           VARCHAR(50)     NOT NULL,
    standard_label          VARCHAR(255),
    domain_name             VARCHAR(100),
    confidence_default      FLOAT           DEFAULT 1.0,
    rule_type               VARCHAR(30),    -- exact/normalized/synonym/keyword/fuzzy
    is_active               BOOLEAN         DEFAULT TRUE,
    approved_by             VARCHAR(100)    DEFAULT 'system',
    approved_at             TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    created_at              TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    updated_at              TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE INDEX IDX_SYNONYM_NORMALIZED ON DIM_SYNONYMS (source_value_normalized);
CREATE OR REPLACE INDEX IDX_SYNONYM_STANDARD ON DIM_SYNONYMS (standard_code);


-- ============ KEYWORD RULES TABLE ============

CREATE OR REPLACE TABLE DIM_KEYWORD_RULES (
    rule_id             VARCHAR(64)     NOT NULL PRIMARY KEY,
    rule_type           VARCHAR(20)     NOT NULL,  -- simple/compound
    keywords            VARIANT,        -- JSON array of keywords
    required_keywords   VARIANT,        -- JSON array (compound rules)
    exclude_keywords    VARIANT,        -- JSON array (compound rules)
    standard_code       VARCHAR(50)     NOT NULL,
    standard_label      VARCHAR(255),
    domain_name         VARCHAR(100),
    confidence          FLOAT           DEFAULT 0.85,
    is_active           BOOLEAN         DEFAULT TRUE,
    created_by          VARCHAR(100)    DEFAULT 'system',
    created_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP()
);


-- ============ MAPPING HISTORY TABLE (SCD Type 2) ============

CREATE OR REPLACE TABLE MAPPING_HISTORY (
    history_id          VARCHAR(64)     NOT NULL PRIMARY KEY,
    mapping_id          VARCHAR(64)     NOT NULL,
    action              VARCHAR(30)     NOT NULL,  -- created/updated/approved/rejected/retired/reactivated
    field_changed       VARCHAR(100),
    old_value           VARCHAR(1000),
    new_value           VARCHAR(1000),
    old_status          VARCHAR(30),
    new_status          VARCHAR(30),
    old_standard_code   VARCHAR(50),
    new_standard_code   VARCHAR(50),
    old_confidence      FLOAT,
    new_confidence      FLOAT,
    version_no          INTEGER,
    changed_by          VARCHAR(100)    DEFAULT 'system',
    changed_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    change_reason       VARCHAR(500)
);

CREATE OR REPLACE INDEX IDX_HISTORY_MAPPING ON MAPPING_HISTORY (mapping_id);
CREATE OR REPLACE INDEX IDX_HISTORY_ACTION ON MAPPING_HISTORY (action);
CREATE OR REPLACE INDEX IDX_HISTORY_DATE ON MAPPING_HISTORY (changed_at);


-- ============ AUDIT LOG TABLE ============

CREATE OR REPLACE TABLE MDM_AUDIT_LOG (
    audit_id            VARCHAR(64)     NOT NULL PRIMARY KEY,
    action              VARCHAR(50)     NOT NULL,
    entity_type         VARCHAR(50)     NOT NULL,  -- standard/mapping/synonym/rule/export
    entity_id           VARCHAR(64),
    details             VARIANT,        -- JSON details
    user_name           VARCHAR(100)    DEFAULT 'system',
    ip_address          VARCHAR(45),
    session_id          VARCHAR(64),
    created_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE INDEX IDX_AUDIT_ENTITY ON MDM_AUDIT_LOG (entity_type, entity_id);
CREATE OR REPLACE INDEX IDX_AUDIT_DATE ON MDM_AUDIT_LOG (created_at);


-- ============ DOMAIN REGISTRY ============

CREATE OR REPLACE TABLE DIM_DOMAINS (
    domain_id           VARCHAR(64)     NOT NULL PRIMARY KEY,
    domain_name         VARCHAR(100)    NOT NULL UNIQUE,
    domain_description  VARCHAR(500),
    domain_owner        VARCHAR(100),
    standard_count      INTEGER         DEFAULT 0,
    mapping_count       INTEGER         DEFAULT 0,
    is_active           BOOLEAN         DEFAULT TRUE,
    created_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP()
);


-- ============ EXPORT METADATA TABLE ============

CREATE OR REPLACE TABLE MDM_EXPORTS (
    export_id           VARCHAR(64)     NOT NULL PRIMARY KEY,
    domain_name         VARCHAR(100),
    export_format       VARCHAR(20)     NOT NULL,  -- csv/json/sql/business_dictionary
    export_scope        VARCHAR(30)     DEFAULT 'full',  -- full/incremental/domain
    record_count        INTEGER         DEFAULT 0,
    file_path           VARCHAR(500),
    exported_by         VARCHAR(100)    DEFAULT 'system',
    exported_at         TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    version_no          INTEGER         DEFAULT 1
);


-- ============================================================
-- SAMPLE DATA INSERTS
-- ============================================================

-- Insert domains
INSERT INTO DIM_DOMAINS (domain_id, domain_name, domain_description, domain_owner)
VALUES
    ('dom-001', 'Disposition', 'ED Discharge Disposition codes', 'Clinical Informatics'),
    ('dom-002', 'Ward', 'Hospital ward/unit classification', 'Facility Management'),
    ('dom-003', 'Specialty', 'Medical specialty classification', 'Medical Affairs'),
    ('dom-004', 'Gender', 'Patient gender classification', 'Registration'),
    ('dom-005', 'Priority', 'Clinical priority levels', 'Clinical Operations'),
    ('dom-006', 'Status', 'General status codes', 'IT Operations');

-- Insert standard values
INSERT INTO DIM_STANDARD_VALUES (standard_id, standard_code, standard_label, standard_description, domain_name)
VALUES
    ('std-home',     'HOME',        'Home',              'Patient discharged to home',              'Disposition'),
    ('std-referral', 'REFERRAL',    'Referral',          'Patient referred to another facility',    'Disposition'),
    ('std-genward',  'GEN_WARD',    'General Ward',      'Admitted to general ward',                'Disposition'),
    ('std-lama',     'LAMA',        'LAMA',              'Left Against Medical Advice',             'Disposition'),
    ('std-dama',     'DAMA',        'DAMA',              'Discharged Against Medical Advice',       'Disposition'),
    ('std-lwbs',     'LWBS',        'LWBS',              'Left Without Being Seen',                 'Disposition'),
    ('std-adulticu', 'ADULT_ICU',   'Adult ICU',         'Admitted to Adult ICU',                   'Disposition'),
    ('std-pedicu',   'PED_ICU',     'Pediatric ICU',     'Admitted to Pediatric ICU',               'Disposition'),
    ('std-nicu',     'NICU',        'Neonatal ICU',      'Admitted to Neonatal ICU',                'Disposition'),
    ('std-deceased', 'DECEASED',    'Deceased',          'Patient expired',                         'Disposition'),
    ('std-er',       'ER',          'Emergency Room',    'Emergency Room discharge',                'Disposition'),
    ('std-obs',      'OBSERVATION', 'Observation',       'Under observation',                       'Disposition'),
    ('std-transfer', 'TRANSFER',    'Transfer',          'Transferred to another facility',         'Disposition');

-- Insert sample mappings
INSERT INTO BRIDGE_SOURCE_TO_STANDARD (mapping_id, domain_name, source_system, source_field_name, source_value, source_value_normalized, standard_id, standard_code, standard_label, confidence_score, mapping_status, mapping_method)
VALUES
    ('map-001', 'Disposition', 'HIS-Alpha', 'discharge_disposition', 'Discharged Home', 'discharged home', 'std-home', 'HOME', 'Home', 1.0, 'approved', 'exact'),
    ('map-002', 'Disposition', 'HIS-Alpha', 'discharge_disposition', 'LAMA', 'lama', 'std-lama', 'LAMA', 'LAMA', 1.0, 'approved', 'exact'),
    ('map-003', 'Disposition', 'HIS-Alpha', 'discharge_disposition', 'Referred to KFSH', 'referred to kfsh', 'std-referral', 'REFERRAL', 'Referral', 0.88, 'approved', 'keyword'),
    ('map-004', 'Disposition', 'HIS-Alpha', 'discharge_disposition', 'Patient expired', 'patient expired', 'std-deceased', 'DECEASED', 'Deceased', 0.94, 'auto_mapped', 'keyword'),
    ('map-005', 'Disposition', 'HIS-Beta',  'visit_outcome', 'Left Without Being Seen', 'left without being seen', 'std-lwbs', 'LWBS', 'LWBS', 0.90, 'approved', 'keyword');

-- Insert sample history
INSERT INTO MAPPING_HISTORY (history_id, mapping_id, action, old_status, new_status, old_standard_code, new_standard_code, old_confidence, new_confidence, version_no, changed_by, change_reason)
VALUES
    ('hist-001', 'map-003', 'created', NULL, 'proposed', NULL, 'REFERRAL', NULL, 0.88, 1, 'system', 'Initial matching'),
    ('hist-002', 'map-003', 'approved', 'proposed', 'approved', 'REFERRAL', 'REFERRAL', 0.88, 0.88, 1, 'admin', 'Verified mapping');


-- ============================================================
-- USEFUL QUERIES
-- ============================================================

-- Lookup: Get standard for a source value
-- SELECT standard_code, standard_label, confidence_score, mapping_method
-- FROM BRIDGE_SOURCE_TO_STANDARD
-- WHERE domain_name = 'Disposition'
--   AND source_value_normalized = 'discharged home'
--   AND is_active = TRUE
--   AND mapping_status = 'approved';

-- Analytics: Mapping coverage by domain
-- SELECT domain_name,
--        COUNT(*) as total_mappings,
--        SUM(CASE WHEN mapping_status = 'approved' THEN 1 ELSE 0 END) as approved,
--        SUM(CASE WHEN mapping_status = 'pending_review' THEN 1 ELSE 0 END) as pending,
--        SUM(CASE WHEN mapping_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
--        ROUND(AVG(confidence_score), 2) as avg_confidence
-- FROM BRIDGE_SOURCE_TO_STANDARD
-- WHERE is_active = TRUE
-- GROUP BY domain_name;

-- History: Track changes for a mapping
-- SELECT * FROM MAPPING_HISTORY
-- WHERE mapping_id = 'map-003'
-- ORDER BY changed_at;
