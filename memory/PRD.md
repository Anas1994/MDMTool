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

### P1 - Important (Next)
- [ ] User-defined keyword rules (Phase 2)
- [ ] Dynamic standard list management
- [ ] Batch deletion functionality

### P2 - Nice to Have
- [ ] Dark mode toggle
- [ ] Bulk export all batches
- [ ] Advanced analytics dashboard
- [ ] AI-powered matching (Phase 3)

## Next Tasks
1. Add ability for users to create custom keyword rules
2. Implement standard dictionary management UI
3. Add batch deletion and archive functionality
4. Performance optimization for very large files (>500K rows)
