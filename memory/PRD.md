# MDM Mapping Tool - Product Requirements Document

## Original Problem Statement
Build a production-ready MDM Mapping Tool – Controlled Standardization Engine that standardizes vendor-provided healthcare values (e.g., DISCHARGE_DESTINATION) against a predefined standard list using rule-based matching, normalization, and confidence scoring.

## User Choices
- **Database**: MongoDB (instead of PostgreSQL)
- **Authentication**: No authentication (single user/team access)
- **File Size**: Large files support (< 100MB, ~500K rows)
- **Theme**: Light mode default with clinical/professional feel
- **Design**: Modern medical-themed palette

## Architecture

### Backend (FastAPI)
- **Matching Engine**: 5-step pipeline
  1. Normalization (lowercase, punctuation removal, space collapsing)
  2. Exact match (synonym table lookup)
  3. Normalized match (normalized value lookup)
  4. Keyword rules (configurable patterns)
  5. Fuzzy matching (rapidfuzz, thresholds: ≥90 auto, 75-89 review)
- **Confidence Scoring**: exact=1.0, normalized=0.95, keyword=0.85-0.94, fuzzy=0.70-0.84
- **MongoDB Collections**: standards, synonyms, batches, mapping_results, audit_logs

### Frontend (React)
- Shadcn/UI components
- IBM Plex Sans typography
- Clinical light theme (sky-600 brand color)
- Phosphor Icons (duotone style)

## What's Been Implemented ✅

### Phase 1 MVP (April 7, 2026)
- [x] Standard Dictionary (13 healthcare discharge destinations)
- [x] Synonym Mapping Table (20+ pre-seeded mappings)
- [x] File Upload Module (CSV/Excel, drag-drop)
- [x] Matching Engine with confidence scoring
- [x] Review Workbench (table, filters, bulk actions)
- [x] Learning Loop (approved mappings → synonyms)
- [x] Export Module (CSV with mapped values)
- [x] Audit Logging (all mapping activities)
- [x] Dashboard with KPI cards
- [x] Batch History management

## What's Working
- Full upload → process → review → approve → export workflow
- Multilingual text support (English/Arabic)
- Fuzzy matching with rapidfuzz
- Keyword rule-based matching
- Bulk approval of mappings
- Add approved values as new synonyms
- Export mapped results as CSV

## Prioritized Backlog

### P0 - Critical (Done)
- ✅ Core matching engine
- ✅ File upload and processing
- ✅ Review and approval workflow
- ✅ Multi-step Ingestion Pipeline
- ✅ Session History & Export/Import
- ✅ Database Connectivity (PostgreSQL, MySQL, SQLite)
- ✅ User-defined Keyword Rules (Phase 2)
- ✅ AI-Powered Matching with GPT-5.2 (Phase 3)

### P1 - Important (Next)
- [ ] Dynamic standard list management improvements
- [ ] Batch retry for failed matching operations

### P2 - Nice to Have
- [ ] Dark mode toggle
- [ ] Bulk export all batches
- [ ] Advanced analytics dashboard
- [ ] AI-powered matching (Phase 3)

## Next Tasks
1. Add data preview in Discover step showing actual row data
2. User-defined keyword rules (Phase 2)
3. Batch retry for failed matching operations

---

## Phase 1.5 Enhancement: Multi-Step Ingestion Pipeline (April 13, 2026)

### New Features Added

#### Backend - Session Management
- `POST /api/sessions` - Create new ingestion session
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/{id}` - Get session details
- `DELETE /api/sessions/{id}` - Delete session
- `POST /api/sessions/{id}/upload` - Upload CSV/Excel with auto column detection
- `POST /api/sessions/{id}/tables` - Create manual table
- `POST /api/sessions/{id}/tables/{table_id}/columns` - Add column manually
- `PUT /api/sessions/{id}/tables/{table_id}/fields` - Save field definitions
- `POST /api/sessions/{id}/process` - Process through matching engine
- `GET /api/domains` - Get domain reference values

#### Frontend - 5-Step Ingestion Wizard (/ingest)
1. **Connect**: Create session, upload files or create tables manually
2. **Discover**: View detected columns, add columns to manual tables
3. **Define Fields**: Set data types, toggle standardize/store-as-is
4. **Standardization Gate**: Review which fields go to matching engine
5. **Domain & Reference**: Assign domains, view golden reference values, run matching

#### Domain References
- Disposition, Ward, Specialty, Status, Priority, Gender, Country, Custom

#### Session History & Export/Import (April 13, 2026)
- Export sessions as JSON backup
- Import sessions from JSON
- Resume sessions from Session History page
- Field-level notes/documentation

---

## Phase 1.6: Database Connectivity (April 13, 2026)

### New Features Added

#### Backend - Database Connection Endpoints
- `POST /api/connections` - Create a saved database connection
- `GET /api/connections` - List all saved connections
- `GET /api/connections/{id}` - Get specific connection
- `DELETE /api/connections/{id}` - Delete a connection
- `POST /api/connections/test` - Test connection details (PostgreSQL, MySQL, SQLite)
- `GET /api/connections/{id}/tables` - Browse tables in connected database
- `GET /api/connections/{id}/tables/{table}/columns` - Get column info for a table
- `GET /api/connections/{id}/tables/{table}/preview` - Preview sample data
- `POST /api/sessions/{id}/import-from-db` - Import table data into a session

#### Frontend - Database Connect Dialog
- Third card "Connect Database" in Ingestion Wizard Step 1 alongside Upload File and Manual Table
- Full dialog with 4 views: saved connections list, new connection form, table browser, column preview
- Supports PostgreSQL, MySQL, SQLite database types
- Test Connection button with real-time feedback
- Save & Browse Tables workflow
- Import table into session with row count confirmation
- Database icon indicator for DB-imported tables in session table list

### Technical Details
- Backend uses asyncpg (PostgreSQL), aiomysql (MySQL), aiosqlite (SQLite) for async connections
- Column types auto-mapped from DB types to inferred types (string, numeric, date, boolean)
- Imported tables include raw_data and sample_values for matching engine processing
- Connection passwords stored in MongoDB (encryption planned for production)
- Source tracking: `db://{connection_name}/{table_name}` format

### Testing
- 22/22 backend API tests passed
- All frontend UI workflows verified via Playwright automation
- SQLite end-to-end flow tested with sample healthcare data

---

## Phase 1.7: Data Preview in Discover Step (April 13, 2026)

### New Features Added
- "Preview Data" / "Hide Data" toggle button on each table in the Discover step (Step 2)
- Full data table showing actual row data with row numbers, column headers, and scrollable view
- Shows total rows count and currently displayed count
- Lazy-loads preview data on first click (doesn't slow down initial page load)

#### Backend
- `GET /api/sessions/{session_id}/tables/{table_id}/preview` - Returns raw data for a table with configurable limit (default 20, max 200)

#### Frontend
- Eye/EyeSlash toggle button in each table header
- Scrollable data table with alternating row colors
- Loading spinner while fetching
- Respects table expansion state

---

## Phase 2: User-Defined Keyword Rules (April 13, 2026)

### New Features Added

#### Backend
- `KeywordRuleModel` in MongoDB (`keyword_rules` collection) with support for simple and compound rules
- `GET /api/keyword-rules` - List all rules (with include_inactive filter)
- `POST /api/keyword-rules` - Create new simple or compound rule
- `PUT /api/keyword-rules/{id}` - Update rule (keywords, confidence, active toggle, standard)
- `DELETE /api/keyword-rules/{id}` - Delete a rule
- Matching engine (`match_keyword_rules`) upgraded to async, reads from DB first with hardcoded fallback
- Auto-seeds 13 rules (12 simple + 1 compound) from hardcoded lists on first startup
- Audit logging for all rule changes

#### Frontend — Keyword Rules Page (/keyword-rules)
- Two-section layout: Simple Rules and Compound Rules
- Each rule shows: standard code badge, label, confidence %, keyword chips
- Compound rules show Required (green) and Exclude (red) keyword chips
- Toggle switch to activate/deactivate rules
- Edit/delete buttons per rule
- Create/edit dialog with: rule type selector, keywords input, standard dropdown, confidence slider
- Added to sidebar navigation with Lightning icon

### Testing
- 18/18 backend API tests passed
- All frontend UI workflows verified
- Integration test: custom rules affect matching engine results

---

## Phase 3: AI-Powered Matching (April 13, 2026)

### New Features Added

#### Backend
- AI matching engine using GPT-5.2 via emergentintegrations library
- `GET /api/ai-matching/status` - Check if AI key is configured
- `POST /api/ai-matching/preview` - Preview unmapped values count and samples before AI run
- `POST /api/ai-matching/run` - Send unmapped values to GPT-5.2 for classification
- AI results auto-approve at >= 85% confidence, otherwise needs_review
- Batch stats auto-updated after AI matching
- Audit logging for AI matching runs (with model info)

#### Frontend — Review Workbench Enhancement
- "AI Match" button (purple, Brain icon) appears when batch has unmapped values
- Confirmation dialog shows value count, sample values, and GPT-5.2 model reference
- Loading state during AI processing
- Toast notification with matched/review/still-unmapped counts
- "AI" option added to match type filter dropdown

### Technical Details
- Uses emergentintegrations LlmChat with EMERGENT_LLM_KEY
- Sends structured prompt with all standard codes and descriptions for context
- AI returns JSON array with vendor_value, standard_code, confidence, reasoning
- Confidence >= 0.85 → auto-approved, < 0.85 → needs_review, null → stays unmapped
- Only processes values with status "unmapped" — never re-processes matched values

### Testing
- 11/11 backend API tests passed
- All frontend UI workflows verified
- Real GPT-5.2 integration tested with healthcare data

---

## Rule Testing Sandbox (April 13, 2026)

### New Features Added

#### Backend
- `POST /api/sandbox/test?value={value}` - Tests a value against ALL 4 matching steps independently (doesn't short-circuit), returning results from every step plus the final winner

#### Frontend — Test Sandbox Page (/sandbox)
- Large input field with Enter key support
- Shows normalized value
- 4-column pipeline visualization showing each step's result (matched/not, standard code, confidence bar)
- "WINNER" badge on the step that provides the final result
- Color-coded steps (sky/teal/amber/purple)
- Final Result card with standard label, code, match type, confidence, and status
- Recent Tests history (last 10) as clickable chips
- Added to sidebar with Flask icon
