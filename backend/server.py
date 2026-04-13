from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import pandas as pd
import io
import re
import unicodedata
from rapidfuzz import fuzz, process
import json
import asyncpg
import aiomysql
import aiosqlite
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="MDM Mapping Tool", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============ MODELS ============

class StandardDictionary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    label: str
    description: str = ""
    active_flag: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SynonymMapping(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_value_raw: str
    source_value_normalized: str
    standard_id: str
    standard_code: str
    standard_label: str
    confidence_default: float = 1.0
    rule_type: str  # exact, normalized, synonym, keyword, fuzzy
    approved_by: str = "system"
    approved_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BatchUpload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    column_name: str
    total_values: int = 0
    unique_values: int = 0
    auto_mapped: int = 0
    needs_review: int = 0
    unmapped: int = 0
    status: str = "processing"  # processing, completed, exported
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

class MappingResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    batch_id: str
    vendor_value: str
    normalized_value: str
    suggested_standard_id: Optional[str] = None
    suggested_standard_code: Optional[str] = None
    suggested_standard_label: Optional[str] = None
    confidence: float = 0.0
    match_type: str = "no_match"  # exact, normalized, synonym, keyword, fuzzy, manual, no_match
    final_standard_id: Optional[str] = None
    final_standard_code: Optional[str] = None
    final_standard_label: Optional[str] = None
    status: str = "pending"  # auto, needs_review, approved, unmapped
    occurrence_count: int = 1
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AuditLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: str  # upload, approve, bulk_approve, override, add_synonym, export
    entity_type: str  # batch, mapping, synonym
    entity_id: str
    details: Dict[str, Any] = {}
    user: str = "system"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ============ SESSION MODELS (Ingestion Pipeline) ============

class ColumnDefinition(BaseModel):
    name: str
    sample_values: List[str] = []
    inferred_type: str = "string"  # string, numeric, date, boolean
    data_type: Optional[str] = None
    standardize: bool = True
    domain: Optional[str] = None
    standard_reference_code: Optional[str] = None
    store_as_is: bool = False
    notes: Optional[str] = None  # Field-level documentation/comments
    custom_references: Optional[List[str]] = None

class SessionTable(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    table_name: str
    source_filename: Optional[str] = None
    columns: List[ColumnDefinition] = []
    raw_data: Optional[List[Dict[str, Any]]] = None  # Store actual data for processing
    description: Optional[str] = None  # Table-level notes

class IngestionSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    status: str = "draft"  # draft, ready, processing, completed
    tables: List[SessionTable] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    description: Optional[str] = None  # Session-level notes
    connection_id: Optional[str] = None  # Link to database connection

# ============ DATABASE CONNECTION MODELS ============

class DatabaseConnection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    db_type: str  # postgresql, mysql, sqlserver, sqlite
    host: Optional[str] = None
    port: Optional[int] = None
    database: str
    username: Optional[str] = None
    password: Optional[str] = None  # Will be stored encrypted in production
    ssl_enabled: bool = False
    connection_string: Optional[str] = None  # For custom connection strings
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_used: Optional[str] = None
    status: str = "active"  # active, inactive, error

# ============ KEYWORD RULE MODELS ============

class KeywordRuleModel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    keywords: List[str]  # list of keywords to match
    standard_code: str
    standard_label: str = ""
    confidence: float = 0.85
    rule_type: str = "simple"  # simple or compound
    required_keywords: List[str] = []  # for compound rules: all must match
    exclude_keywords: List[str] = []  # for compound rules: none must match
    active: bool = True
    created_by: str = "system"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ============ DOMAIN REFERENCE DATA ============

DOMAIN_REFERENCES = {
    "Disposition": ["Discharged", "Admitted", "Transferred", "Deceased", "Left AMA", "Observation", "LAMA", "DAMA", "LWBS"],
    "Ward": ["ICU", "Emergency", "Maternity", "Oncology", "Pediatrics", "Cardiology", "Neurology", "Orthopedics"],
    "Specialty": ["Cardiology", "Oncology", "Neurology", "Orthopedics", "Gastroenterology", "Pulmonology", "Nephrology", "Rheumatology"],
    "Status": ["Active", "Inactive", "Pending", "Cancelled", "Completed", "On Hold"],
    "Priority": ["Critical", "High", "Medium", "Low", "Routine"],
    "Gender": ["Male", "Female", "Other", "Unknown", "Non-binary"],
    "Country": ["United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "India", "Brazil"],
}

# ============ STANDARD DICTIONARY DATA ============

STANDARD_DICTIONARY = [
    {"code": "HOME", "label": "Home", "description": "Patient discharged to home"},
    {"code": "REFERRAL", "label": "Referral", "description": "Patient referred to another facility"},
    {"code": "GEN_WARD", "label": "General Ward", "description": "Admitted to general ward"},
    {"code": "LAMA", "label": "LAMA", "description": "Left Against Medical Advice"},
    {"code": "DAMA", "label": "DAMA", "description": "Discharged Against Medical Advice"},
    {"code": "LWBS", "label": "LWBS", "description": "Left Without Being Seen"},
    {"code": "ADULT_ICU", "label": "Adult ICU", "description": "Admitted to Adult ICU"},
    {"code": "PED_ICU", "label": "Pediatric ICU", "description": "Admitted to Pediatric ICU"},
    {"code": "NICU", "label": "Neonatal ICU", "description": "Admitted to Neonatal ICU"},
    {"code": "DECEASED", "label": "Deceased", "description": "Patient expired"},
    {"code": "ER", "label": "Emergency Room", "description": "Emergency Room discharge"},
    {"code": "OBSERVATION", "label": "Observation", "description": "Under observation"},
    {"code": "TRANSFER", "label": "Transfer", "description": "Transferred to another facility"},
]

# ============ KEYWORD RULES ============

KEYWORD_RULES = [
    {"keywords": ["lwbs", "left without being seen"], "standard_code": "LWBS", "confidence": 0.90},
    {"keywords": ["dama", "discharged against medical"], "standard_code": "DAMA", "confidence": 0.90},
    {"keywords": ["lama", "left against medical"], "standard_code": "LAMA", "confidence": 0.90},
    {"keywords": ["referral", "referred", "phc", "kfsh", "refer to"], "standard_code": "REFERRAL", "confidence": 0.88},
    {"keywords": ["admitted", "admission", "ward"], "standard_code": "GEN_WARD", "confidence": 0.85},
    {"keywords": ["picu", "pediatric icu"], "standard_code": "PED_ICU", "confidence": 0.92},
    {"keywords": ["nicu", "neonatal icu", "neonatal intensive"], "standard_code": "NICU", "confidence": 0.92},
    {"keywords": ["death", "expired", "deceased", "died", "mortality"], "standard_code": "DECEASED", "confidence": 0.94},
    {"keywords": ["discharge", "home", "normal discharge", "routine discharge"], "standard_code": "HOME", "confidence": 0.85},
    {"keywords": ["emergency", "er ", "e.r."], "standard_code": "ER", "confidence": 0.85},
    {"keywords": ["observation", "observe"], "standard_code": "OBSERVATION", "confidence": 0.85},
    {"keywords": ["transfer", "transferred"], "standard_code": "TRANSFER", "confidence": 0.88},
]

# Special rule: ICU + adult should map to Adult ICU
COMPOUND_RULES = [
    {"required": ["icu", "adult"], "exclude": ["pediatric", "picu", "neonatal", "nicu"], "standard_code": "ADULT_ICU", "confidence": 0.90},
]

# ============ HELPER FUNCTIONS ============

def normalize_text(text: str) -> str:
    """Normalize text for matching"""
    if not text:
        return ""
    # Convert to lowercase
    text = text.lower()
    # Normalize unicode (handle Arabic and other scripts)
    text = unicodedata.normalize('NFKD', text)
    # Remove punctuation except spaces
    text = re.sub(r'[^\w\s]', ' ', text)
    # Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text)
    # Strip whitespace
    text = text.strip()
    return text

def get_standard_by_code(code: str) -> Optional[dict]:
    """Get standard dictionary entry by code from hardcoded list (for seeding)"""
    for std in STANDARD_DICTIONARY:
        if std["code"] == code:
            return std
    return None

async def get_standard_by_code_db(code: str) -> Optional[dict]:
    """Get standard dictionary entry by code from database"""
    standard = await db.standards.find_one(
        {"code": code, "active_flag": {"$ne": False}}, 
        {"_id": 0}
    )
    if standard:
        return {"code": standard["code"], "label": standard["label"], "description": standard.get("description", "")}
    # Fallback to hardcoded list for backwards compatibility
    return get_standard_by_code(code)

async def match_exact(value: str, normalized: str) -> Optional[dict]:
    """Check for exact match in synonym table"""
    synonym = await db.synonyms.find_one(
        {"$or": [
            {"source_value_raw": value},
            {"source_value_raw": {"$regex": f"^{re.escape(value)}$", "$options": "i"}}
        ]},
        {"_id": 0}
    )
    if synonym:
        return {
            "standard_id": synonym["standard_id"],
            "standard_code": synonym["standard_code"],
            "standard_label": synonym["standard_label"],
            "confidence": 1.0,
            "match_type": "exact"
        }
    return None

async def match_normalized(normalized: str) -> Optional[dict]:
    """Check for normalized match in synonym table"""
    synonym = await db.synonyms.find_one(
        {"source_value_normalized": normalized},
        {"_id": 0}
    )
    if synonym:
        return {
            "standard_id": synonym["standard_id"],
            "standard_code": synonym["standard_code"],
            "standard_label": synonym["standard_label"],
            "confidence": 0.95,
            "match_type": "normalized"
        }
    return None

async def match_keyword_rules(normalized: str) -> Optional[dict]:
    """Check keyword-based rules from DB and hardcoded fallback"""
    # Load rules from DB first
    db_rules = await db.keyword_rules.find({"active": True}, {"_id": 0}).to_list(500)
    
    # Check compound rules first (from DB)
    for rule in db_rules:
        if rule.get("rule_type") == "compound":
            required = rule.get("required_keywords", [])
            exclude = rule.get("exclude_keywords", [])
            if required and all(kw in normalized for kw in required):
                if not any(kw in normalized for kw in exclude):
                    std = await get_standard_by_code_db(rule["standard_code"])
                    if std:
                        return {
                            "standard_id": std["code"],
                            "standard_code": std["code"],
                            "standard_label": std["label"],
                            "confidence": rule.get("confidence", 0.90),
                            "match_type": "keyword"
                        }
    
    # Fallback: hardcoded compound rules
    for rule in COMPOUND_RULES:
        required_match = all(kw in normalized for kw in rule["required"])
        exclude_match = any(kw in normalized for kw in rule["exclude"])
        if required_match and not exclude_match:
            std = get_standard_by_code(rule["standard_code"])
            if std:
                return {
                    "standard_id": std["code"],
                    "standard_code": std["code"],
                    "standard_label": std["label"],
                    "confidence": rule["confidence"],
                    "match_type": "keyword"
                }
    
    # Check simple keyword rules from DB
    for rule in db_rules:
        if rule.get("rule_type", "simple") == "simple":
            for keyword in rule.get("keywords", []):
                if keyword in normalized:
                    std = await get_standard_by_code_db(rule["standard_code"])
                    if std:
                        return {
                            "standard_id": std["code"],
                            "standard_code": std["code"],
                            "standard_label": std["label"],
                            "confidence": rule.get("confidence", 0.85),
                            "match_type": "keyword"
                        }
    
    # Fallback: hardcoded simple rules
    for rule in KEYWORD_RULES:
        for keyword in rule["keywords"]:
            if keyword in normalized:
                std = get_standard_by_code(rule["standard_code"])
                if std:
                    return {
                        "standard_id": std["code"],
                        "standard_code": std["code"],
                        "standard_label": std["label"],
                        "confidence": rule["confidence"],
                        "match_type": "keyword"
                    }
    return None

async def match_fuzzy(normalized: str) -> Optional[dict]:
    """Fuzzy matching against synonyms and standards"""
    best_match = None
    best_score = 0
    
    # Get all synonyms for fuzzy matching
    synonyms = await db.synonyms.find({}, {"_id": 0}).to_list(1000)
    
    # Build choices list
    choices = []
    for syn in synonyms:
        choices.append({
            "value": syn["source_value_normalized"],
            "standard_id": syn["standard_id"],
            "standard_code": syn["standard_code"],
            "standard_label": syn["standard_label"]
        })
    
    # Add standard labels
    for std in STANDARD_DICTIONARY:
        choices.append({
            "value": normalize_text(std["label"]),
            "standard_id": std["code"],
            "standard_code": std["code"],
            "standard_label": std["label"]
        })
    
    if not choices:
        return None
    
    # Find best fuzzy match
    for choice in choices:
        score = fuzz.ratio(normalized, choice["value"])
        if score > best_score:
            best_score = score
            best_match = choice
    
    if best_match and best_score >= 75:
        confidence = best_score / 100
        if best_score >= 90:
            match_type = "fuzzy"
            status = "auto"
        else:
            match_type = "fuzzy"
            status = "needs_review"
        
        return {
            "standard_id": best_match["standard_id"],
            "standard_code": best_match["standard_code"],
            "standard_label": best_match["standard_label"],
            "confidence": round(confidence, 2),
            "match_type": match_type,
            "status": status
        }
    
    return None

async def run_matching_engine(vendor_value: str) -> dict:
    """Run the full matching engine pipeline"""
    normalized = normalize_text(vendor_value)
    
    # Step 1: Exact match
    result = await match_exact(vendor_value, normalized)
    if result:
        result["status"] = "auto"
        return result
    
    # Step 2: Normalized match
    result = await match_normalized(normalized)
    if result:
        result["status"] = "auto"
        return result
    
    # Step 3: Keyword rules
    result = await match_keyword_rules(normalized)
    if result:
        result["status"] = "auto" if result["confidence"] >= 0.90 else "needs_review"
        return result
    
    # Step 4: Fuzzy matching
    result = await match_fuzzy(normalized)
    if result:
        return result
    
    # No match found
    return {
        "standard_id": None,
        "standard_code": None,
        "standard_label": None,
        "confidence": 0.0,
        "match_type": "no_match",
        "status": "unmapped"
    }

async def run_ai_matching(vendor_values: List[str], standards_list: List[dict]) -> List[dict]:
    """Use AI (GPT-5.2) to suggest matches for unmapped values"""
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        raise HTTPException(status_code=500, detail="AI matching not configured: missing EMERGENT_LLM_KEY")
    
    # Build standards context
    standards_text = "\n".join([f"- {s['code']}: {s['label']} ({s.get('description', '')})" for s in standards_list])
    
    system_message = f"""You are a healthcare data standardization expert. Your job is to map vendor-provided values to standard codes.

Available Standard Codes:
{standards_text}

Rules:
1. For each vendor value, suggest the BEST matching standard code
2. Provide a confidence score (0.0-1.0) based on how certain the match is
3. Provide brief reasoning for the match
4. If no good match exists, use standard_code: null and confidence: 0.0
5. Respond ONLY with valid JSON array"""

    # Build the prompt with all values
    values_text = "\n".join([f"- \"{v}\"" for v in vendor_values])
    
    prompt = f"""Map each of these vendor values to the best matching standard code.

Vendor Values:
{values_text}

Respond with a JSON array. Each element must have:
- "vendor_value": the original value
- "standard_code": the matched code (or null)
- "standard_label": the label of the matched standard (or null)
- "confidence": float 0.0-1.0
- "reasoning": brief explanation
- "suggested_synonym": boolean, true if this mapping should be saved as a synonym for future exact matching

Return ONLY the JSON array, no markdown formatting."""

    try:
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"ai-match-{uuid.uuid4().hex[:8]}",
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        user_msg = UserMessage(text=prompt)
        response = await chat.send_message(user_msg)
        
        # Parse JSON response
        response_text = response.strip()
        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
        
        results = json.loads(response_text)
        return results
        
    except json.JSONDecodeError as e:
        logging.error(f"AI matching JSON parse error: {e}, response: {response_text[:200]}")
        raise HTTPException(status_code=500, detail="AI returned invalid JSON response")
    except Exception as e:
        logging.error(f"AI matching error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI matching failed: {str(e)}")

# ============ SEED DATA ============

async def seed_standards():
    """Seed standard dictionary if empty"""
    count = await db.standards.count_documents({})
    if count == 0:
        for std in STANDARD_DICTIONARY:
            doc = StandardDictionary(
                id=std["code"],
                code=std["code"],
                label=std["label"],
                description=std["description"]
            ).model_dump()
            await db.standards.insert_one(doc)
        logging.info("Seeded standard dictionary")

async def seed_initial_synonyms():
    """Seed some initial synonyms"""
    count = await db.synonyms.count_documents({})
    if count == 0:
        initial_synonyms = [
            # Home variations
            {"raw": "Home", "code": "HOME"},
            {"raw": "Patient Discharged", "code": "HOME"},
            {"raw": "Normal Discharge", "code": "HOME"},
            {"raw": "Routine Discharge", "code": "HOME"},
            {"raw": "Discharge From Er", "code": "HOME"},
            {"raw": "Discharge From Er (خروج من الطوارئ)", "code": "HOME"},
            # Referral variations
            {"raw": "Referred to PHC", "code": "REFERRAL"},
            {"raw": "REFERRAL TO KFSH", "code": "REFERRAL"},
            {"raw": "Referral", "code": "REFERRAL"},
            # Ward variations
            {"raw": "Admitted to this hospital", "code": "GEN_WARD"},
            {"raw": "General Ward Admission", "code": "GEN_WARD"},
            # ICU variations
            {"raw": "PICU", "code": "PED_ICU"},
            {"raw": "Pediatric ICU", "code": "PED_ICU"},
            {"raw": "Adult ICU", "code": "ADULT_ICU"},
            {"raw": "NICU", "code": "NICU"},
            # Other
            {"raw": "LAMA", "code": "LAMA"},
            {"raw": "DAMA", "code": "DAMA"},
            {"raw": "LWBS", "code": "LWBS"},
            {"raw": "Deceased", "code": "DECEASED"},
            {"raw": "Expired", "code": "DECEASED"},
        ]
        
        for syn in initial_synonyms:
            std = get_standard_by_code(syn["code"])
            if std:
                doc = SynonymMapping(
                    source_value_raw=syn["raw"],
                    source_value_normalized=normalize_text(syn["raw"]),
                    standard_id=std["code"],
                    standard_code=std["code"],
                    standard_label=std["label"],
                    confidence_default=1.0,
                    rule_type="synonym",
                    approved_by="system"
                ).model_dump()
                await db.synonyms.insert_one(doc)
        logging.info("Seeded initial synonyms")

async def seed_keyword_rules():
    """Seed keyword rules from hardcoded lists if DB is empty"""
    count = await db.keyword_rules.count_documents({})
    if count == 0:
        # Seed simple rules
        for rule in KEYWORD_RULES:
            std = get_standard_by_code(rule["standard_code"])
            label = std["label"] if std else rule["standard_code"]
            doc = KeywordRuleModel(
                keywords=rule["keywords"],
                standard_code=rule["standard_code"],
                standard_label=label,
                confidence=rule["confidence"],
                rule_type="simple",
                created_by="system"
            ).model_dump()
            await db.keyword_rules.insert_one(doc)
        
        # Seed compound rules
        for rule in COMPOUND_RULES:
            std = get_standard_by_code(rule["standard_code"])
            label = std["label"] if std else rule["standard_code"]
            doc = KeywordRuleModel(
                keywords=[],
                standard_code=rule["standard_code"],
                standard_label=label,
                confidence=rule["confidence"],
                rule_type="compound",
                required_keywords=rule["required"],
                exclude_keywords=rule["exclude"],
                created_by="system"
            ).model_dump()
            await db.keyword_rules.insert_one(doc)
        
        logging.info("Seeded keyword rules")

# ============ API ENDPOINTS ============

@api_router.get("/")
async def root():
    return {"message": "MDM Mapping Tool API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Standards endpoints
@api_router.get("/standards")
async def get_standards(include_inactive: bool = False):
    """Get all standard dictionary entries"""
    query = {} if include_inactive else {"active_flag": {"$ne": False}}
    standards = await db.standards.find(query, {"_id": 0}).to_list(100)
    return {"standards": standards}

@api_router.post("/standards")
async def create_standard(
    code: str,
    label: str,
    description: str = "",
    user: str = "user"
):
    """Create a new standard dictionary entry"""
    # Normalize code to uppercase with underscores
    code = code.upper().strip().replace(" ", "_")
    
    # Check if code already exists
    existing = await db.standards.find_one({"code": code}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Standard code '{code}' already exists")
    
    standard = StandardDictionary(
        id=code,
        code=code,
        label=label.strip(),
        description=description.strip(),
        active_flag=True
    )
    doc = standard.model_dump()
    await db.standards.insert_one(doc)
    
    # Log audit
    audit = AuditLog(
        action="create_standard",
        entity_type="standard",
        entity_id=code,
        details={"code": code, "label": label},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {"success": True, "standard": standard.model_dump()}

@api_router.put("/standards/{code}")
async def update_standard(
    code: str,
    label: Optional[str] = None,
    description: Optional[str] = None,
    active_flag: Optional[bool] = None,
    user: str = "user"
):
    """Update a standard dictionary entry"""
    existing = await db.standards.find_one({"code": code}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Standard code '{code}' not found")
    
    update_data = {}
    if label is not None:
        update_data["label"] = label.strip()
    if description is not None:
        update_data["description"] = description.strip()
    if active_flag is not None:
        update_data["active_flag"] = active_flag
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.standards.update_one({"code": code}, {"$set": update_data})
    
    # Log audit
    audit = AuditLog(
        action="update_standard",
        entity_type="standard",
        entity_id=code,
        details={"code": code, "updates": update_data},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    updated = await db.standards.find_one({"code": code}, {"_id": 0})
    return {"success": True, "standard": updated}

@api_router.delete("/standards/{code}")
async def deactivate_standard(code: str, user: str = "user"):
    """Deactivate a standard (soft delete)"""
    existing = await db.standards.find_one({"code": code}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Standard code '{code}' not found")
    
    await db.standards.update_one({"code": code}, {"$set": {"active_flag": False}})
    
    # Log audit
    audit = AuditLog(
        action="deactivate_standard",
        entity_type="standard",
        entity_id=code,
        details={"code": code},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {"success": True, "message": f"Standard '{code}' deactivated"}

# Synonyms endpoints
@api_router.get("/synonyms")
async def get_synonyms(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    """Get all synonym mappings with pagination"""
    skip = (page - 1) * limit
    total = await db.synonyms.count_documents({})
    synonyms = await db.synonyms.find({}, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return {
        "synonyms": synonyms,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

@api_router.post("/synonyms")
async def create_synonym(
    source_value: str,
    standard_code: str,
    user: str = "user"
):
    """Create a new synonym mapping"""
    # Use database lookup to support user-created standards
    std = await get_standard_by_code_db(standard_code)
    if not std:
        raise HTTPException(status_code=400, detail=f"Invalid standard code: {standard_code}")
    
    # Check if synonym already exists
    existing = await db.synonyms.find_one(
        {"source_value_normalized": normalize_text(source_value)},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Synonym already exists")
    
    synonym_obj = SynonymMapping(
        source_value_raw=source_value,
        source_value_normalized=normalize_text(source_value),
        standard_id=std["code"],
        standard_code=std["code"],
        standard_label=std["label"],
        confidence_default=1.0,
        rule_type="synonym",
        approved_by=user
    )
    doc = synonym_obj.model_dump()
    
    await db.synonyms.insert_one(doc)
    
    # Log audit
    audit = AuditLog(
        action="add_synonym",
        entity_type="synonym",
        entity_id=synonym_obj.id,
        details={"source_value": source_value, "standard_code": standard_code},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    # Return the original object to avoid ObjectId serialization issue
    return {"success": True, "synonym": synonym_obj.model_dump()}

# File upload endpoint
@api_router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    column_name: str = Query(..., description="Column name to process")
):
    """Upload CSV/Excel file and process it"""
    try:
        # Read file content
        content = await file.read()
        filename = file.filename or "unknown"
        
        # Parse file based on extension
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")
        
        # Validate column exists
        if column_name not in df.columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Column '{column_name}' not found. Available: {list(df.columns)}"
            )
        
        # Create batch record
        batch = BatchUpload(
            filename=filename,
            column_name=column_name,
            total_values=len(df),
            status="processing"
        )
        batch_dict = batch.model_dump()
        await db.batches.insert_one(batch_dict)
        
        # Extract unique values with counts
        value_counts = df[column_name].fillna("").astype(str).value_counts().to_dict()
        unique_values = list(value_counts.keys())
        
        # Process each unique value
        auto_mapped = 0
        needs_review = 0
        unmapped = 0
        
        for vendor_value in unique_values:
            if not vendor_value.strip():
                continue
                
            normalized = normalize_text(vendor_value)
            match_result = await run_matching_engine(vendor_value)
            
            # Determine status
            status = match_result.get("status", "unmapped")
            if status == "auto":
                auto_mapped += 1
            elif status == "needs_review":
                needs_review += 1
            else:
                unmapped += 1
            
            # Create mapping result
            mapping = MappingResult(
                batch_id=batch.id,
                vendor_value=vendor_value,
                normalized_value=normalized,
                suggested_standard_id=match_result.get("standard_id"),
                suggested_standard_code=match_result.get("standard_code"),
                suggested_standard_label=match_result.get("standard_label"),
                confidence=match_result.get("confidence", 0.0),
                match_type=match_result.get("match_type", "no_match"),
                final_standard_id=match_result.get("standard_id") if status == "auto" else None,
                final_standard_code=match_result.get("standard_code") if status == "auto" else None,
                final_standard_label=match_result.get("standard_label") if status == "auto" else None,
                status=status,
                occurrence_count=value_counts.get(vendor_value, 1)
            ).model_dump()
            
            await db.mapping_results.insert_one(mapping)
        
        # Update batch stats
        await db.batches.update_one(
            {"id": batch.id},
            {"$set": {
                "unique_values": len([v for v in unique_values if v.strip()]),
                "auto_mapped": auto_mapped,
                "needs_review": needs_review,
                "unmapped": unmapped,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Log audit
        audit = AuditLog(
            action="upload",
            entity_type="batch",
            entity_id=batch.id,
            details={
                "filename": filename,
                "column_name": column_name,
                "total_values": len(df),
                "unique_values": len(unique_values)
            }
        ).model_dump()
        await db.audit_logs.insert_one(audit)
        
        return {
            "success": True,
            "batch_id": batch.id,
            "filename": filename,
            "column_name": column_name,
            "total_values": len(df),
            "unique_values": len([v for v in unique_values if v.strip()]),
            "auto_mapped": auto_mapped,
            "needs_review": needs_review,
            "unmapped": unmapped
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

# Batch endpoints
@api_router.get("/batches")
async def get_batches(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """Get all batches with pagination"""
    skip = (page - 1) * limit
    total = await db.batches.count_documents({})
    batches = await db.batches.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "batches": batches,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

@api_router.get("/batches/{batch_id}")
async def get_batch(batch_id: str):
    """Get a specific batch"""
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch

@api_router.get("/batches/{batch_id}/results")
async def get_batch_results(
    batch_id: str,
    status: Optional[str] = None,
    match_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    """Get mapping results for a batch"""
    # Build query
    query = {"batch_id": batch_id}
    if status:
        query["status"] = status
    if match_type:
        query["match_type"] = match_type
    if search:
        query["$or"] = [
            {"vendor_value": {"$regex": search, "$options": "i"}},
            {"normalized_value": {"$regex": search, "$options": "i"}}
        ]
    
    skip = (page - 1) * limit
    total = await db.mapping_results.count_documents(query)
    results = await db.mapping_results.find(query, {"_id": 0}).sort("confidence", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "results": results,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

# Mapping approval endpoints
@api_router.put("/mappings/{mapping_id}/approve")
async def approve_mapping(
    mapping_id: str,
    standard_code: Optional[str] = None,
    add_as_synonym: bool = False,
    user: str = "user"
):
    """Approve a mapping, optionally overriding the standard"""
    mapping = await db.mapping_results.find_one({"id": mapping_id}, {"_id": 0})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    # Determine final standard
    if standard_code:
        std = await get_standard_by_code_db(standard_code)
        if not std:
            raise HTTPException(status_code=400, detail=f"Invalid standard code: {standard_code}")
        final_id = std["code"]
        final_code = std["code"]
        final_label = std["label"]
    else:
        final_id = mapping.get("suggested_standard_id")
        final_code = mapping.get("suggested_standard_code")
        final_label = mapping.get("suggested_standard_label")
    
    if not final_code:
        raise HTTPException(status_code=400, detail="No standard to approve. Please provide a standard_code.")
    
    # Update mapping
    await db.mapping_results.update_one(
        {"id": mapping_id},
        {"$set": {
            "final_standard_id": final_id,
            "final_standard_code": final_code,
            "final_standard_label": final_label,
            "status": "approved",
            "approved_by": user,
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Add as synonym if requested
    if add_as_synonym:
        existing = await db.synonyms.find_one(
            {"source_value_normalized": mapping["normalized_value"]},
            {"_id": 0}
        )
        if not existing:
            syn_doc = SynonymMapping(
                source_value_raw=mapping["vendor_value"],
                source_value_normalized=mapping["normalized_value"],
                standard_id=final_id,
                standard_code=final_code,
                standard_label=final_label,
                confidence_default=1.0,
                rule_type="synonym",
                approved_by=user
            ).model_dump()
            await db.synonyms.insert_one(syn_doc)
    
    # Update batch stats
    batch = await db.batches.find_one({"id": mapping["batch_id"]}, {"_id": 0})
    if batch:
        old_status = mapping.get("status")
        if old_status == "needs_review":
            await db.batches.update_one(
                {"id": mapping["batch_id"]},
                {"$inc": {"needs_review": -1, "auto_mapped": 1}}
            )
        elif old_status == "unmapped":
            await db.batches.update_one(
                {"id": mapping["batch_id"]},
                {"$inc": {"unmapped": -1, "auto_mapped": 1}}
            )
    
    # Log audit
    audit = AuditLog(
        action="approve" if not standard_code else "override",
        entity_type="mapping",
        entity_id=mapping_id,
        details={
            "vendor_value": mapping["vendor_value"],
            "final_standard": final_code,
            "add_as_synonym": add_as_synonym
        },
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {"success": True, "final_standard_code": final_code}

@api_router.post("/mappings/bulk-approve")
async def bulk_approve_mappings(
    mapping_ids: List[str],
    user: str = "user"
):
    """Bulk approve mappings with their suggested standards"""
    approved_count = 0
    
    for mapping_id in mapping_ids:
        mapping = await db.mapping_results.find_one({"id": mapping_id}, {"_id": 0})
        if mapping and mapping.get("suggested_standard_code"):
            await db.mapping_results.update_one(
                {"id": mapping_id},
                {"$set": {
                    "final_standard_id": mapping["suggested_standard_id"],
                    "final_standard_code": mapping["suggested_standard_code"],
                    "final_standard_label": mapping["suggested_standard_label"],
                    "status": "approved",
                    "approved_by": user,
                    "approved_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            approved_count += 1
            
            # Update batch stats
            old_status = mapping.get("status")
            if old_status == "needs_review":
                await db.batches.update_one(
                    {"id": mapping["batch_id"]},
                    {"$inc": {"needs_review": -1, "auto_mapped": 1}}
                )
            elif old_status == "unmapped":
                await db.batches.update_one(
                    {"id": mapping["batch_id"]},
                    {"$inc": {"unmapped": -1, "auto_mapped": 1}}
                )
    
    # Log audit
    audit = AuditLog(
        action="bulk_approve",
        entity_type="mapping",
        entity_id=",".join(mapping_ids[:10]),
        details={"count": approved_count},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {"success": True, "approved_count": approved_count}

@api_router.put("/mappings/{mapping_id}/unmapped")
async def mark_unmapped(mapping_id: str, user: str = "user"):
    """Mark a mapping as unmapped"""
    mapping = await db.mapping_results.find_one({"id": mapping_id}, {"_id": 0})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    old_status = mapping.get("status")
    
    await db.mapping_results.update_one(
        {"id": mapping_id},
        {"$set": {
            "final_standard_id": None,
            "final_standard_code": None,
            "final_standard_label": None,
            "status": "unmapped",
            "approved_by": user,
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update batch stats
    if old_status == "auto" or old_status == "approved":
        await db.batches.update_one(
            {"id": mapping["batch_id"]},
            {"$inc": {"auto_mapped": -1, "unmapped": 1}}
        )
    elif old_status == "needs_review":
        await db.batches.update_one(
            {"id": mapping["batch_id"]},
            {"$inc": {"needs_review": -1, "unmapped": 1}}
        )
    
    return {"success": True}

# Export endpoint
@api_router.get("/batches/{batch_id}/export")
async def export_batch(batch_id: str):
    """Export batch results as CSV"""
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    results = await db.mapping_results.find({"batch_id": batch_id}, {"_id": 0}).to_list(100000)
    
    # Build export data
    export_data = []
    for r in results:
        export_data.append({
            batch["column_name"]: r["vendor_value"],
            f"{batch['column_name']}_NORMALIZED": r["normalized_value"],
            f"{batch['column_name']}_SUGGESTED": r.get("suggested_standard_label", ""),
            f"{batch['column_name']}_STANDARD": r.get("final_standard_label", ""),
            "CONFIDENCE": r.get("confidence", 0),
            "MATCH_TYPE": r.get("match_type", ""),
            "STATUS": r.get("status", ""),
            "OCCURRENCE_COUNT": r.get("occurrence_count", 1)
        })
    
    df = pd.DataFrame(export_data)
    
    # Create CSV in memory
    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)
    
    # Log audit
    audit = AuditLog(
        action="export",
        entity_type="batch",
        entity_id=batch_id,
        details={"filename": batch["filename"], "rows": len(results)}
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    filename = f"{batch['filename'].rsplit('.', 1)[0]}_mapped.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# Audit log endpoints
@api_router.get("/audit")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = None
):
    """Get audit logs with pagination"""
    query = {}
    if action:
        query["action"] = action
    
    skip = (page - 1) * limit
    total = await db.audit_logs.count_documents(query)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": logs,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

# Dashboard stats
@api_router.get("/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    total_batches = await db.batches.count_documents({})
    total_mappings = await db.mapping_results.count_documents({})
    total_synonyms = await db.synonyms.count_documents({})
    
    # Aggregate stats across all batches
    pipeline = [
        {"$group": {
            "_id": None,
            "total_values": {"$sum": "$total_values"},
            "auto_mapped": {"$sum": "$auto_mapped"},
            "needs_review": {"$sum": "$needs_review"},
            "unmapped": {"$sum": "$unmapped"}
        }}
    ]
    
    stats = await db.batches.aggregate(pipeline).to_list(1)
    
    if stats:
        return {
            "total_batches": total_batches,
            "total_mappings": total_mappings,
            "total_synonyms": total_synonyms,
            "total_values": stats[0].get("total_values", 0),
            "auto_mapped": stats[0].get("auto_mapped", 0),
            "needs_review": stats[0].get("needs_review", 0),
            "unmapped": stats[0].get("unmapped", 0)
        }
    
    return {
        "total_batches": total_batches,
        "total_mappings": total_mappings,
        "total_synonyms": total_synonyms,
        "total_values": 0,
        "auto_mapped": 0,
        "needs_review": 0,
        "unmapped": 0
    }

# ============ INGESTION SESSION ENDPOINTS ============

def infer_column_type(series: pd.Series) -> str:
    """Infer the data type of a pandas series"""
    # Drop nulls for analysis
    non_null = series.dropna()
    if len(non_null) == 0:
        return "string"
    
    # Check if numeric
    try:
        pd.to_numeric(non_null)
        return "numeric"
    except (ValueError, TypeError):
        pass
    
    # Check if date
    try:
        pd.to_datetime(non_null, format='mixed', dayfirst=True)
        # Additional check: if most values look like dates
        sample = non_null.head(10).astype(str)
        date_patterns = r'\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}'
        if sample.str.match(date_patterns).mean() > 0.5:
            return "date"
    except (ValueError, TypeError):
        pass
    
    # Check if boolean
    bool_values = {'true', 'false', 'yes', 'no', '1', '0', 't', 'f', 'y', 'n'}
    unique_lower = set(non_null.astype(str).str.lower().unique())
    if unique_lower.issubset(bool_values) and len(unique_lower) <= 4:
        return "boolean"
    
    return "string"

@api_router.post("/sessions")
async def create_session(name: str):
    """Create a new ingestion session"""
    session = IngestionSession(name=name)
    doc = session.model_dump()
    await db.sessions.insert_one(doc)
    return {"success": True, "session": session.model_dump()}

@api_router.get("/sessions")
async def list_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """List all sessions sorted by created_at descending"""
    skip = (page - 1) * limit
    total = await db.sessions.count_documents({})
    sessions = await db.sessions.find({}, {"_id": 0, "tables.raw_data": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "sessions": sessions,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get a single session with its tables and fields"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0, "tables.raw_data": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session"""
    result = await db.sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}

@api_router.get("/sessions/{session_id}/tables/{table_id}/preview")
async def preview_session_table(
    session_id: str,
    table_id: str,
    limit: int = Query(20, ge=1, le=200)
):
    """Get raw data preview for a specific table in a session"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    for table in session.get("tables", []):
        if table["id"] == table_id:
            raw_data = table.get("raw_data", [])
            columns = [c["name"] for c in table.get("columns", [])]
            return {
                "table_name": table["table_name"],
                "columns": columns,
                "data": raw_data[:limit],
                "total_rows": len(raw_data)
            }
    
    raise HTTPException(status_code=404, detail="Table not found")

@api_router.post("/sessions/{session_id}/upload")
async def upload_to_session(
    session_id: str,
    file: UploadFile = File(...)
):
    """Upload a CSV or Excel file to a session"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        content = await file.read()
        filename = file.filename or "unknown"
        
        # Parse file
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")
        
        # Extract table name from filename
        table_name = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
        
        # Detect columns with types and sample values
        columns = []
        for col in df.columns:
            sample_values = df[col].dropna().astype(str).unique()[:5].tolist()
            inferred_type = infer_column_type(df[col])
            columns.append(ColumnDefinition(
                name=col,
                sample_values=sample_values,
                inferred_type=inferred_type,
                data_type=inferred_type,
                standardize=(inferred_type == "string"),
                store_as_is=(inferred_type != "string")
            ).model_dump())
        
        # Store raw data for later processing
        raw_data = df.fillna("").astype(str).to_dict('records')
        
        # Create table entry
        table = SessionTable(
            table_name=table_name,
            source_filename=filename,
            columns=columns,
            raw_data=raw_data
        )
        
        # Add table to session
        await db.sessions.update_one(
            {"id": session_id},
            {"$push": {"tables": table.model_dump()}}
        )
        
        return {
            "success": True,
            "table": {
                "id": table.id,
                "table_name": table_name,
                "source_filename": filename,
                "columns": columns,
                "row_count": len(df)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@api_router.post("/sessions/{session_id}/tables")
async def create_manual_table(session_id: str, table_name: str):
    """Manually create a table without uploading a file"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    table = SessionTable(
        table_name=table_name,
        source_filename=None,
        columns=[],
        raw_data=[]
    )
    
    await db.sessions.update_one(
        {"id": session_id},
        {"$push": {"tables": table.model_dump()}}
    )
    
    return {"success": True, "table": {"id": table.id, "table_name": table_name}}

@api_router.delete("/sessions/{session_id}/tables/{table_id}")
async def delete_table(session_id: str, table_id: str):
    """Delete a table from a session"""
    result = await db.sessions.update_one(
        {"id": session_id},
        {"$pull": {"tables": {"id": table_id}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"success": True}

@api_router.post("/sessions/{session_id}/tables/{table_id}/columns")
async def add_column_to_table(
    session_id: str,
    table_id: str,
    name: str,
    inferred_type: str = "string"
):
    """Add a column manually to a table"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Find the table
    table_found = False
    for table in session.get("tables", []):
        if table["id"] == table_id:
            table_found = True
            break
    
    if not table_found:
        raise HTTPException(status_code=404, detail="Table not found")
    
    column = ColumnDefinition(
        name=name,
        inferred_type=inferred_type,
        data_type=inferred_type,
        standardize=(inferred_type == "string"),
        store_as_is=(inferred_type != "string")
    )
    
    await db.sessions.update_one(
        {"id": session_id, "tables.id": table_id},
        {"$push": {"tables.$.columns": column.model_dump()}}
    )
    
    return {"success": True, "column": column.model_dump()}

class FieldDefinition(BaseModel):
    column_name: str
    data_type: str
    standardize: bool = False
    domain: Optional[str] = None
    standard_reference_code: Optional[str] = None
    store_as_is: bool = True
    custom_references: Optional[List[str]] = None
    notes: Optional[str] = None  # Field-level documentation

class FieldDefinitionsRequest(BaseModel):
    fields: List[FieldDefinition]

@api_router.put("/sessions/{session_id}/tables/{table_id}/fields")
async def save_field_definitions(
    session_id: str,
    table_id: str,
    request: FieldDefinitionsRequest
):
    """Save field definitions for all columns in a table"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Find the table and update columns
    tables = session.get("tables", [])
    table_index = None
    for i, table in enumerate(tables):
        if table["id"] == table_id:
            table_index = i
            break
    
    if table_index is None:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # Update each column with the field definition
    columns = tables[table_index].get("columns", [])
    field_map = {f.column_name: f for f in request.fields}
    
    for col in columns:
        if col["name"] in field_map:
            field = field_map[col["name"]]
            col["data_type"] = field.data_type
            col["standardize"] = field.standardize
            col["domain"] = field.domain
            col["standard_reference_code"] = field.standard_reference_code
            col["store_as_is"] = field.store_as_is
            if field.custom_references:
                col["custom_references"] = field.custom_references
            if field.notes is not None:
                col["notes"] = field.notes
    
    # Update in database
    await db.sessions.update_one(
        {"id": session_id, "tables.id": table_id},
        {"$set": {"tables.$.columns": columns}}
    )
    
    return {"success": True}

@api_router.post("/sessions/{session_id}/process")
async def process_session(session_id: str):
    """Process all fields marked for standardization through the matching engine"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    batch_ids = []
    fields_processed = 0
    
    for table in session.get("tables", []):
        table_name = table.get("table_name", "Unknown")
        raw_data = table.get("raw_data", [])
        
        for column in table.get("columns", []):
            if not column.get("standardize", False):
                continue
            
            column_name = column["name"]
            
            # Extract unique values from raw data
            if raw_data:
                values = [row.get(column_name, "") for row in raw_data]
                df_col = pd.Series(values)
            else:
                # For manually created tables, use sample values
                df_col = pd.Series(column.get("sample_values", []))
            
            if df_col.empty:
                continue
            
            # Create batch record
            value_counts = df_col.fillna("").astype(str).value_counts().to_dict()
            unique_values = [v for v in value_counts.keys() if v.strip()]
            
            if not unique_values:
                continue
            
            batch = BatchUpload(
                filename=f"{table_name} - {column_name}",
                column_name=column_name,
                total_values=len(df_col),
                status="processing"
            )
            batch_dict = batch.model_dump()
            await db.batches.insert_one(batch_dict)
            
            # Process each unique value through matching engine
            auto_mapped = 0
            needs_review = 0
            unmapped = 0
            
            for vendor_value in unique_values:
                normalized = normalize_text(vendor_value)
                match_result = await run_matching_engine(vendor_value)
                
                status = match_result.get("status", "unmapped")
                if status == "auto":
                    auto_mapped += 1
                elif status == "needs_review":
                    needs_review += 1
                else:
                    unmapped += 1
                
                mapping = MappingResult(
                    batch_id=batch.id,
                    vendor_value=vendor_value,
                    normalized_value=normalized,
                    suggested_standard_id=match_result.get("standard_id"),
                    suggested_standard_code=match_result.get("standard_code"),
                    suggested_standard_label=match_result.get("standard_label"),
                    confidence=match_result.get("confidence", 0.0),
                    match_type=match_result.get("match_type", "no_match"),
                    final_standard_id=match_result.get("standard_id") if status == "auto" else None,
                    final_standard_code=match_result.get("standard_code") if status == "auto" else None,
                    final_standard_label=match_result.get("standard_label") if status == "auto" else None,
                    status=status,
                    occurrence_count=value_counts.get(vendor_value, 1)
                ).model_dump()
                
                await db.mapping_results.insert_one(mapping)
            
            # Update batch stats
            await db.batches.update_one(
                {"id": batch.id},
                {"$set": {
                    "unique_values": len(unique_values),
                    "auto_mapped": auto_mapped,
                    "needs_review": needs_review,
                    "unmapped": unmapped,
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            batch_ids.append(batch.id)
            fields_processed += 1
    
    # Update session status
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "completed"}}
    )
    
    return {
        "success": True,
        "batch_ids": batch_ids,
        "fields_processed": fields_processed
    }

@api_router.get("/domains")
async def get_domains():
    """Get all available domains and their reference values"""
    return {"domains": DOMAIN_REFERENCES}

# ============ KEYWORD RULES ENDPOINTS ============

class KeywordRuleCreateRequest(BaseModel):
    keywords: List[str] = []
    standard_code: str
    confidence: float = 0.85
    rule_type: str = "simple"
    required_keywords: List[str] = []
    exclude_keywords: List[str] = []

class KeywordRuleUpdateRequest(BaseModel):
    keywords: Optional[List[str]] = None
    standard_code: Optional[str] = None
    confidence: Optional[float] = None
    rule_type: Optional[str] = None
    required_keywords: Optional[List[str]] = None
    exclude_keywords: Optional[List[str]] = None
    active: Optional[bool] = None

@api_router.get("/keyword-rules")
async def list_keyword_rules(include_inactive: bool = False):
    """Get all keyword rules"""
    query = {} if include_inactive else {"active": True}
    rules = await db.keyword_rules.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"rules": rules, "total": len(rules)}

@api_router.post("/keyword-rules")
async def create_keyword_rule(request: KeywordRuleCreateRequest, user: str = "user"):
    """Create a new keyword rule"""
    std = await get_standard_by_code_db(request.standard_code)
    if not std:
        raise HTTPException(status_code=400, detail=f"Invalid standard code: {request.standard_code}")
    
    rule = KeywordRuleModel(
        keywords=[k.strip().lower() for k in request.keywords if k.strip()],
        standard_code=std["code"],
        standard_label=std["label"],
        confidence=request.confidence,
        rule_type=request.rule_type,
        required_keywords=[k.strip().lower() for k in request.required_keywords if k.strip()],
        exclude_keywords=[k.strip().lower() for k in request.exclude_keywords if k.strip()],
        created_by=user
    )
    doc = rule.model_dump()
    await db.keyword_rules.insert_one(doc)
    
    audit = AuditLog(
        action="create_keyword_rule",
        entity_type="keyword_rule",
        entity_id=rule.id,
        details={"standard_code": std["code"], "rule_type": request.rule_type},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {"success": True, "rule": rule.model_dump()}

@api_router.put("/keyword-rules/{rule_id}")
async def update_keyword_rule(rule_id: str, request: KeywordRuleUpdateRequest, user: str = "user"):
    """Update a keyword rule"""
    existing = await db.keyword_rules.find_one({"id": rule_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Keyword rule not found")
    
    update_data = {}
    if request.keywords is not None:
        update_data["keywords"] = [k.strip().lower() for k in request.keywords if k.strip()]
    if request.standard_code is not None:
        std = await get_standard_by_code_db(request.standard_code)
        if not std:
            raise HTTPException(status_code=400, detail=f"Invalid standard code: {request.standard_code}")
        update_data["standard_code"] = std["code"]
        update_data["standard_label"] = std["label"]
    if request.confidence is not None:
        update_data["confidence"] = request.confidence
    if request.rule_type is not None:
        update_data["rule_type"] = request.rule_type
    if request.required_keywords is not None:
        update_data["required_keywords"] = [k.strip().lower() for k in request.required_keywords if k.strip()]
    if request.exclude_keywords is not None:
        update_data["exclude_keywords"] = [k.strip().lower() for k in request.exclude_keywords if k.strip()]
    if request.active is not None:
        update_data["active"] = request.active
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.keyword_rules.update_one({"id": rule_id}, {"$set": update_data})
    
    audit = AuditLog(
        action="update_keyword_rule",
        entity_type="keyword_rule",
        entity_id=rule_id,
        details=update_data,
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    updated = await db.keyword_rules.find_one({"id": rule_id}, {"_id": 0})
    return {"success": True, "rule": updated}

@api_router.delete("/keyword-rules/{rule_id}")
async def delete_keyword_rule(rule_id: str, user: str = "user"):
    """Delete a keyword rule"""
    existing = await db.keyword_rules.find_one({"id": rule_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Keyword rule not found")
    
    result = await db.keyword_rules.delete_one({"id": rule_id})
    
    audit = AuditLog(
        action="delete_keyword_rule",
        entity_type="keyword_rule",
        entity_id=rule_id,
        details={"standard_code": existing.get("standard_code")},
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {"success": True}

# ============ MATCHING SANDBOX ENDPOINT ============

@api_router.post("/sandbox/test")
async def test_value_matching(value: str):
    """Test a single value against all matching steps and return detailed results"""
    normalized = normalize_text(value)
    steps = []
    
    # Step 1: Exact match
    exact_result = await match_exact(value, normalized)
    steps.append({
        "step": 1,
        "name": "Exact Match",
        "description": "Checks synonym table for exact raw value match",
        "matched": exact_result is not None,
        "result": exact_result
    })
    
    # Step 2: Normalized match
    norm_result = await match_normalized(normalized)
    steps.append({
        "step": 2,
        "name": "Normalized Match",
        "description": "Checks synonym table for normalized value match",
        "matched": norm_result is not None,
        "result": norm_result
    })
    
    # Step 3: Keyword rules
    kw_result = await match_keyword_rules(normalized)
    steps.append({
        "step": 3,
        "name": "Keyword Rules",
        "description": "Checks keyword patterns (simple and compound rules)",
        "matched": kw_result is not None,
        "result": kw_result
    })
    
    # Step 4: Fuzzy matching
    fuzzy_result = await match_fuzzy(normalized)
    steps.append({
        "step": 4,
        "name": "Fuzzy Match",
        "description": "Rapidfuzz similarity scoring against synonyms and standards",
        "matched": fuzzy_result is not None,
        "result": fuzzy_result
    })
    
    # Determine final result (first match wins)
    final = await run_matching_engine(value)
    
    return {
        "input_value": value,
        "normalized_value": normalized,
        "steps": steps,
        "final_result": final
    }

# ============ AI MATCHING ENDPOINTS ============

class AiMatchRequest(BaseModel):
    batch_id: str
    
@api_router.get("/ai-matching/status")
async def ai_matching_status():
    """Check if AI matching is available"""
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    return {"available": bool(llm_key), "model": "gpt-5.2"}

@api_router.post("/ai-matching/preview")
async def ai_matching_preview(request: AiMatchRequest):
    """Preview how many unmapped values would be sent to AI"""
    batch = await db.batches.find_one({"id": request.batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    unmapped = await db.mapping_results.find(
        {"batch_id": request.batch_id, "status": "unmapped"},
        {"_id": 0, "vendor_value": 1}
    ).to_list(10000)
    
    return {
        "batch_id": request.batch_id,
        "unmapped_count": len(unmapped),
        "values": [m["vendor_value"] for m in unmapped[:10]],  # Preview first 10
        "estimated_cost": "minimal"
    }

@api_router.post("/ai-matching/run")
async def run_ai_matching_endpoint(request: AiMatchRequest, user: str = "user"):
    """Run AI matching on unmapped values in a batch"""
    batch = await db.batches.find_one({"id": request.batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get unmapped values
    unmapped = await db.mapping_results.find(
        {"batch_id": request.batch_id, "status": "unmapped"},
        {"_id": 0}
    ).to_list(10000)
    
    if not unmapped:
        return {"success": True, "message": "No unmapped values to process", "matched": 0}
    
    vendor_values = [m["vendor_value"] for m in unmapped]
    
    # Get current standards
    standards = await db.standards.find(
        {"active_flag": {"$ne": False}},
        {"_id": 0, "code": 1, "label": 1, "description": 1}
    ).to_list(500)
    
    # Run AI matching
    ai_results = await run_ai_matching(vendor_values, standards)
    
    # Build lookup for quick access
    ai_lookup = {}
    for ar in ai_results:
        ai_lookup[ar.get("vendor_value", "")] = ar
    
    matched_count = 0
    needs_review_count = 0
    
    for mapping in unmapped:
        ai_result = ai_lookup.get(mapping["vendor_value"])
        if not ai_result or not ai_result.get("standard_code"):
            continue
        
        confidence = ai_result.get("confidence", 0.0)
        status = "auto" if confidence >= 0.85 else "needs_review"
        
        update_data = {
            "suggested_standard_id": ai_result["standard_code"],
            "suggested_standard_code": ai_result["standard_code"],
            "suggested_standard_label": ai_result.get("standard_label", ""),
            "confidence": confidence,
            "match_type": "ai",
            "status": status,
        }
        
        if status == "auto":
            update_data["final_standard_id"] = ai_result["standard_code"]
            update_data["final_standard_code"] = ai_result["standard_code"]
            update_data["final_standard_label"] = ai_result.get("standard_label", "")
            matched_count += 1
        else:
            needs_review_count += 1
        
        await db.mapping_results.update_one(
            {"id": mapping["id"]},
            {"$set": update_data}
        )
    
    # Update batch stats
    total_ai = matched_count + needs_review_count
    if total_ai > 0:
        await db.batches.update_one(
            {"id": request.batch_id},
            {"$inc": {
                "unmapped": -total_ai,
                "auto_mapped": matched_count,
                "needs_review": needs_review_count
            }}
        )
    
    # Audit log
    audit = AuditLog(
        action="ai_matching",
        entity_type="batch",
        entity_id=request.batch_id,
        details={
            "total_processed": len(vendor_values),
            "auto_mapped": matched_count,
            "needs_review": needs_review_count,
            "model": "gpt-5.2"
        },
        user=user
    ).model_dump()
    await db.audit_logs.insert_one(audit)
    
    return {
        "success": True,
        "total_processed": len(vendor_values),
        "auto_mapped": matched_count,
        "needs_review": needs_review_count,
        "still_unmapped": len(vendor_values) - total_ai
    }

# ============ DATABASE CONNECTION ENDPOINTS ============

async def get_db_connection(conn_config: dict):
    """Create a database connection based on type"""
    db_type = conn_config.get("db_type")
    
    if db_type == "postgresql":
        return await asyncpg.connect(
            host=conn_config.get("host", "localhost"),
            port=conn_config.get("port", 5432),
            database=conn_config.get("database"),
            user=conn_config.get("username"),
            password=conn_config.get("password"),
            ssl=conn_config.get("ssl_enabled", False)
        )
    elif db_type == "mysql":
        return await aiomysql.connect(
            host=conn_config.get("host", "localhost"),
            port=conn_config.get("port", 3306),
            db=conn_config.get("database"),
            user=conn_config.get("username"),
            password=conn_config.get("password")
        )
    elif db_type == "sqlite":
        return await aiosqlite.connect(conn_config.get("database"))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported database type: {db_type}")

async def fetch_tables_from_db(conn_config: dict) -> List[dict]:
    """Fetch table list from database"""
    db_type = conn_config.get("db_type")
    tables = []
    
    try:
        if db_type == "postgresql":
            conn = await get_db_connection(conn_config)
            try:
                rows = await conn.fetch("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                """)
                tables = [{"name": row["table_name"], "schema": "public"} for row in rows]
            finally:
                await conn.close()
        
        elif db_type == "mysql":
            conn = await get_db_connection(conn_config)
            try:
                async with conn.cursor() as cursor:
                    await cursor.execute("SHOW TABLES")
                    rows = await cursor.fetchall()
                    tables = [{"name": row[0], "schema": conn_config.get("database")} for row in rows]
            finally:
                conn.close()
        
        elif db_type == "sqlite":
            async with aiosqlite.connect(conn_config.get("database")) as conn:
                cursor = await conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
                rows = await cursor.fetchall()
                tables = [{"name": row[0], "schema": "main"} for row in rows]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {str(e)}")
    
    return tables

async def fetch_columns_from_db(conn_config: dict, table_name: str) -> List[dict]:
    """Fetch column information from a table"""
    db_type = conn_config.get("db_type")
    columns = []
    
    try:
        if db_type == "postgresql":
            conn = await get_db_connection(conn_config)
            try:
                rows = await conn.fetch("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = $1
                    ORDER BY ordinal_position
                """, table_name)
                columns = [{
                    "name": row["column_name"],
                    "db_type": row["data_type"],
                    "nullable": row["is_nullable"] == "YES"
                } for row in rows]
            finally:
                await conn.close()
        
        elif db_type == "mysql":
            conn = await get_db_connection(conn_config)
            try:
                async with conn.cursor() as cursor:
                    await cursor.execute(f"DESCRIBE `{table_name}`")
                    rows = await cursor.fetchall()
                    columns = [{
                        "name": row[0],
                        "db_type": row[1],
                        "nullable": row[2] == "YES"
                    } for row in rows]
            finally:
                conn.close()
        
        elif db_type == "sqlite":
            async with aiosqlite.connect(conn_config.get("database")) as conn:
                cursor = await conn.execute(f"PRAGMA table_info({table_name})")
                rows = await cursor.fetchall()
                columns = [{
                    "name": row[1],
                    "db_type": row[2],
                    "nullable": row[3] == 0
                } for row in rows]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch columns: {str(e)}")
    
    return columns

async def fetch_sample_data(conn_config: dict, table_name: str, columns: List[str], limit: int = 100) -> List[dict]:
    """Fetch sample data from a table"""
    db_type = conn_config.get("db_type")
    data = []
    
    try:
        col_list = ", ".join([f'"{c}"' if db_type == "postgresql" else f"`{c}`" for c in columns])
        
        if db_type == "postgresql":
            conn = await get_db_connection(conn_config)
            try:
                rows = await conn.fetch(f'SELECT {col_list} FROM "{table_name}" LIMIT {limit}')
                data = [dict(row) for row in rows]
            finally:
                await conn.close()
        
        elif db_type == "mysql":
            conn = await get_db_connection(conn_config)
            try:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute(f"SELECT {col_list} FROM `{table_name}` LIMIT {limit}")
                    data = await cursor.fetchall()
            finally:
                conn.close()
        
        elif db_type == "sqlite":
            col_list_sqlite = ", ".join([f'"{c}"' for c in columns])
            async with aiosqlite.connect(conn_config.get("database")) as conn:
                conn.row_factory = aiosqlite.Row
                cursor = await conn.execute(f'SELECT {col_list_sqlite} FROM "{table_name}" LIMIT {limit}')
                rows = await cursor.fetchall()
                data = [dict(row) for row in rows]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")
    
    return data

def map_db_type_to_inferred(db_type: str) -> str:
    """Map database column types to our inferred types"""
    db_type = db_type.lower()
    if any(t in db_type for t in ['int', 'numeric', 'decimal', 'float', 'double', 'real', 'money']):
        return "numeric"
    elif any(t in db_type for t in ['date', 'time', 'timestamp']):
        return "date"
    elif any(t in db_type for t in ['bool', 'bit']):
        return "boolean"
    else:
        return "string"

class ConnectionTestRequest(BaseModel):
    db_type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database: str
    username: Optional[str] = None
    password: Optional[str] = None
    ssl_enabled: bool = False

@api_router.post("/connections")
async def create_connection(
    name: str,
    db_type: str,
    database: str,
    host: Optional[str] = None,
    port: Optional[int] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    ssl_enabled: bool = False
):
    """Create a new database connection"""
    # Set default ports
    if port is None:
        default_ports = {"postgresql": 5432, "mysql": 3306, "sqlserver": 1433}
        port = default_ports.get(db_type)
    
    connection = DatabaseConnection(
        name=name,
        db_type=db_type,
        host=host,
        port=port,
        database=database,
        username=username,
        password=password,
        ssl_enabled=ssl_enabled
    )
    
    doc = connection.model_dump()
    await db.connections.insert_one(doc)
    
    # Don't return password or _id
    safe_doc = connection.model_dump()
    safe_doc.pop("password", None)
    return {"success": True, "connection": safe_doc}

@api_router.get("/connections")
async def list_connections():
    """List all database connections"""
    connections = await db.connections.find({"status": "active"}, {"_id": 0, "password": 0}).to_list(100)
    return {"connections": connections}

@api_router.get("/connections/{connection_id}")
async def get_connection(connection_id: str):
    """Get a specific connection"""
    connection = await db.connections.find_one({"id": connection_id}, {"_id": 0, "password": 0})
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection

@api_router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str):
    """Delete a database connection"""
    result = await db.connections.delete_one({"id": connection_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"success": True}

@api_router.post("/connections/test")
async def test_connection(request: ConnectionTestRequest):
    """Test a database connection"""
    try:
        conn_config = request.model_dump()
        
        if request.db_type == "postgresql":
            conn = await asyncpg.connect(
                host=request.host or "localhost",
                port=request.port or 5432,
                database=request.database,
                user=request.username,
                password=request.password,
                ssl=request.ssl_enabled
            )
            await conn.close()
        elif request.db_type == "mysql":
            conn = await aiomysql.connect(
                host=request.host or "localhost",
                port=request.port or 3306,
                db=request.database,
                user=request.username,
                password=request.password
            )
            conn.close()
        elif request.db_type == "sqlite":
            async with aiosqlite.connect(request.database) as conn:
                await conn.execute("SELECT 1")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported database type: {request.db_type}")
        
        return {"success": True, "message": "Connection successful"}
    
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}

@api_router.get("/connections/{connection_id}/tables")
async def get_connection_tables(connection_id: str):
    """Get list of tables from a database connection"""
    connection = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    tables = await fetch_tables_from_db(connection)
    
    # Update last_used
    await db.connections.update_one(
        {"id": connection_id},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"tables": tables}

@api_router.get("/connections/{connection_id}/tables/{table_name}/columns")
async def get_table_columns(connection_id: str, table_name: str):
    """Get columns for a specific table"""
    connection = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    columns = await fetch_columns_from_db(connection, table_name)
    return {"columns": columns}

@api_router.get("/connections/{connection_id}/tables/{table_name}/preview")
async def preview_table_data(
    connection_id: str, 
    table_name: str,
    limit: int = Query(100, ge=1, le=1000)
):
    """Preview data from a table"""
    connection = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    # Get columns first
    columns = await fetch_columns_from_db(connection, table_name)
    column_names = [c["name"] for c in columns]
    
    # Fetch sample data
    data = await fetch_sample_data(connection, table_name, column_names, limit)
    
    return {
        "columns": columns,
        "data": data,
        "row_count": len(data)
    }

@api_router.post("/sessions/{session_id}/import-from-db")
async def import_table_from_db(
    session_id: str,
    connection_id: str,
    table_name: str,
    columns: Optional[List[str]] = None,
    limit: int = Query(10000, ge=1, le=100000)
):
    """Import a table from database connection into a session"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    connection = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    # Get column info
    db_columns = await fetch_columns_from_db(connection, table_name)
    
    # Filter columns if specified
    if columns:
        db_columns = [c for c in db_columns if c["name"] in columns]
    
    column_names = [c["name"] for c in db_columns]
    
    # Fetch data
    data = await fetch_sample_data(connection, table_name, column_names, limit)
    
    # Build columns with sample values and inferred types
    session_columns = []
    for col_info in db_columns:
        col_name = col_info["name"]
        col_values = [str(row.get(col_name, "")) for row in data if row.get(col_name) is not None]
        unique_values = list(set(col_values))[:5]
        
        inferred_type = map_db_type_to_inferred(col_info["db_type"])
        
        session_columns.append(ColumnDefinition(
            name=col_name,
            sample_values=unique_values,
            inferred_type=inferred_type,
            data_type=inferred_type,
            standardize=(inferred_type == "string"),
            store_as_is=(inferred_type != "string")
        ).model_dump())
    
    # Create table entry
    table = SessionTable(
        table_name=table_name,
        source_filename=f"db://{connection['name']}/{table_name}",
        columns=session_columns,
        raw_data=data
    )
    
    # Add table to session
    await db.sessions.update_one(
        {"id": session_id},
        {
            "$push": {"tables": table.model_dump()},
            "$set": {"connection_id": connection_id}
        }
    )
    
    return {
        "success": True,
        "table": {
            "id": table.id,
            "table_name": table_name,
            "source": f"db://{connection['name']}/{table_name}",
            "columns": len(session_columns),
            "rows": len(data)
        }
    }

# ============ SESSION EXPORT/IMPORT ENDPOINTS ============

@api_router.get("/sessions/{session_id}/export")
async def export_session(session_id: str):
    """Export a session as JSON for backup"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Remove raw_data to reduce file size (can be re-uploaded)
    export_data = {
        "version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "session": {
            "id": session["id"],
            "name": session["name"],
            "status": session.get("status", "draft"),
            "description": session.get("description"),
            "created_at": session.get("created_at"),
            "tables": []
        }
    }
    
    for table in session.get("tables", []):
        table_export = {
            "id": table["id"],
            "table_name": table["table_name"],
            "source_filename": table.get("source_filename"),
            "description": table.get("description"),
            "columns": []
        }
        for col in table.get("columns", []):
            col_export = {
                "name": col["name"],
                "inferred_type": col.get("inferred_type", "string"),
                "data_type": col.get("data_type"),
                "standardize": col.get("standardize", False),
                "store_as_is": col.get("store_as_is", True),
                "domain": col.get("domain"),
                "notes": col.get("notes"),
                "custom_references": col.get("custom_references"),
                "sample_values": col.get("sample_values", [])[:5]  # Limit sample values
            }
            table_export["columns"].append(col_export)
        export_data["session"]["tables"].append(table_export)
    
    # Return as downloadable JSON
    import json
    json_str = json.dumps(export_data, indent=2)
    filename = f"session_{session['name'].replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.json"
    
    return StreamingResponse(
        iter([json_str]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

class SessionImportRequest(BaseModel):
    version: str
    session: Dict[str, Any]

@api_router.post("/sessions/import")
async def import_session(file: UploadFile = File(...)):
    """Import a session from exported JSON file"""
    try:
        content = await file.read()
        import json
        data = json.loads(content.decode('utf-8'))
        
        # Validate structure
        if "version" not in data or "session" not in data:
            raise HTTPException(status_code=400, detail="Invalid session export file format")
        
        session_data = data["session"]
        
        # Create new session with new ID but preserve structure
        new_session = IngestionSession(
            name=f"{session_data['name']} (Imported)",
            status="draft",  # Reset to draft
            description=session_data.get("description")
        )
        
        # Rebuild tables with new IDs
        for table_data in session_data.get("tables", []):
            new_table = SessionTable(
                table_name=table_data["table_name"],
                source_filename=table_data.get("source_filename"),
                description=table_data.get("description"),
                columns=[],
                raw_data=[]  # No raw data in export
            )
            
            for col_data in table_data.get("columns", []):
                new_col = ColumnDefinition(
                    name=col_data["name"],
                    inferred_type=col_data.get("inferred_type", "string"),
                    data_type=col_data.get("data_type"),
                    standardize=col_data.get("standardize", False),
                    store_as_is=col_data.get("store_as_is", True),
                    domain=col_data.get("domain"),
                    notes=col_data.get("notes"),
                    custom_references=col_data.get("custom_references"),
                    sample_values=col_data.get("sample_values", [])
                )
                new_table.columns.append(new_col)
            
            new_session.tables.append(new_table)
        
        # Save to database
        doc = new_session.model_dump()
        await db.sessions.insert_one(doc)
        
        return {
            "success": True,
            "session": {
                "id": new_session.id,
                "name": new_session.name,
                "tables_count": len(new_session.tables),
                "columns_count": sum(len(t.columns) for t in new_session.tables)
            }
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@api_router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None
):
    """Update session metadata"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if description is not None:
        update_data["description"] = description
    
    if update_data:
        await db.sessions.update_one({"id": session_id}, {"$set": update_data})
    
    return {"success": True}

@api_router.put("/sessions/{session_id}/tables/{table_id}")
async def update_table(
    session_id: str,
    table_id: str,
    table_name: Optional[str] = None,
    description: Optional[str] = None
):
    """Update table metadata"""
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    update_data = {}
    if table_name is not None:
        update_data["tables.$.table_name"] = table_name
    if description is not None:
        update_data["tables.$.description"] = description
    
    if update_data:
        result = await db.sessions.update_one(
            {"id": session_id, "tables.id": table_id},
            {"$set": update_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Table not found")
    
    return {"success": True}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    await seed_standards()
    await seed_initial_synonyms()
    await seed_keyword_rules()
    logger.info("MDM Mapping Tool started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
