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
    """Get standard dictionary entry by code"""
    for std in STANDARD_DICTIONARY:
        if std["code"] == code:
            return std
    return None

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

def match_keyword_rules(normalized: str) -> Optional[dict]:
    """Check keyword-based rules"""
    # Check compound rules first
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
    
    # Check simple keyword rules
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
    result = match_keyword_rules(normalized)
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
    std = get_standard_by_code(standard_code)
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
        std = get_standard_by_code(standard_code)
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
            std = get_standard_by_code(final_code)
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
    logger.info("MDM Mapping Tool started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
