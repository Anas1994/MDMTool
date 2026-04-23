"""
MDM Enterprise API Layer
========================
Production-ready REST APIs for MDM consumption:
- Domain management
- Standard value lookup
- Mapping CRUD with governance lifecycle
- Export (JSON, CSV, Business Dictionary)
- Snowflake schema generation
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import json
import io
import csv

mdm_router = APIRouter(prefix="/api/mdm", tags=["MDM Enterprise"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _uuid():
    return str(uuid.uuid4())


# ============ MODELS ============

class MappingCreateRequest(BaseModel):
    domain_name: str
    source_system: str = "unknown"
    source_field_name: str = ""
    source_value: str
    standard_code: Optional[str] = None
    confidence_score: float = 0.0
    mapping_method: str = "manual"

class MappingUpdateRequest(BaseModel):
    standard_code: Optional[str] = None
    confidence_score: Optional[float] = None
    mapping_status: Optional[str] = None

class ApproveRequest(BaseModel):
    approved_by: str = "user"

class RejectRequest(BaseModel):
    rejected_by: str = "user"
    rejection_reason: str = ""


# ============ SETUP (called from server.py) ============

_db = None

def init_mdm_router(db_instance):
    global _db
    _db = db_instance
    return mdm_router


# ============ DOMAIN APIs ============

@mdm_router.get("/domains")
async def list_domains():
    """List all MDM domains with counts"""
    standards = await _db.standards.find({"active_flag": {"$ne": False}}, {"_id": 0}).to_list(1000)
    synonyms_count = await _db.synonyms.count_documents({})
    rules_count = await _db.keyword_rules.count_documents({"active": True})

    # Group standards by domain-like categories
    domain_map = {}
    for std in standards:
        domain = "General"
        domain_map.setdefault(domain, {"standards": [], "count": 0})
        domain_map[domain]["standards"].append(std)
        domain_map[domain]["count"] += 1

    return {
        "domains": [
            {"name": "Disposition", "description": "ED Discharge Disposition", "standard_count": len(standards)},
            {"name": "Ward", "description": "Hospital ward/unit classification"},
            {"name": "Specialty", "description": "Medical specialty classification"},
            {"name": "Gender", "description": "Patient gender classification"},
            {"name": "Priority", "description": "Clinical priority levels"},
            {"name": "Status", "description": "General status codes"},
        ],
        "totals": {
            "standards": len(standards),
            "synonyms": synonyms_count,
            "keyword_rules": rules_count
        }
    }


@mdm_router.get("/domains/{domain}/standard-values")
async def get_domain_standards(domain: str, include_inactive: bool = False):
    """Get all standard values for a domain"""
    query = {} if include_inactive else {"active_flag": {"$ne": False}}
    standards = await _db.standards.find(query, {"_id": 0}).to_list(1000)

    result = []
    for std in standards:
        result.append({
            "standard_id": std.get("id", std.get("code")),
            "standard_code": std["code"],
            "standard_label": std["label"],
            "standard_description": std.get("description", ""),
            "domain_name": domain,
            "version_no": 1,
            "is_active": std.get("active_flag", True),
            "created_at": std.get("created_at", ""),
        })

    return {"domain": domain, "standards": result, "count": len(result)}


@mdm_router.get("/domains/{domain}/mappings")
async def get_domain_mappings(
    domain: str,
    status: Optional[str] = None,
    method: Optional[str] = None,
    source_system: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500)
):
    """Get all mappings for a domain with filters"""
    # Get all approved/auto mappings from mapping_results + synonyms
    query = {}
    if status:
        query["status"] = status

    skip = (page - 1) * limit
    results = await _db.mapping_results.find(query, {"_id": 0}).sort("confidence", -1).skip(skip).limit(limit).to_list(limit)
    total = await _db.mapping_results.count_documents(query)

    mappings = []
    for r in results:
        mappings.append({
            "mapping_id": r.get("id"),
            "domain_name": domain,
            "source_system": source_system or "unknown",
            "source_field_name": r.get("batch_id", ""),
            "source_value": r.get("vendor_value", ""),
            "source_value_normalized": r.get("normalized_value", ""),
            "standard_id": r.get("final_standard_id") or r.get("suggested_standard_id"),
            "standard_code": r.get("final_standard_code") or r.get("suggested_standard_code"),
            "standard_label": r.get("final_standard_label") or r.get("suggested_standard_label"),
            "confidence_score": r.get("confidence", 0.0),
            "mapping_status": _map_status(r.get("status")),
            "mapping_method": r.get("match_type", "unknown"),
            "approved_by": r.get("approved_by"),
            "approved_at": r.get("approved_at"),
            "version_no": 1,
            "is_active": True,
            "created_at": r.get("created_at"),
        })

    return {
        "domain": domain,
        "mappings": mappings,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@mdm_router.get("/domains/{domain}/lookup")
async def lookup_value(domain: str, source_value: str):
    """Real-time lookup: resolve a source value to its standard"""
    from server import normalize_text, run_matching_engine

    normalized = normalize_text(source_value)

    # Check synonyms first (fastest)
    synonym = await _db.synonyms.find_one(
        {"$or": [
            {"source_value_raw": {"$regex": f"^{source_value}$", "$options": "i"}},
            {"source_value_normalized": normalized}
        ]},
        {"_id": 0}
    )

    if synonym:
        return {
            "resolved": True,
            "source_value": source_value,
            "normalized_value": normalized,
            "standard_code": synonym["standard_code"],
            "standard_label": synonym["standard_label"],
            "confidence": synonym.get("confidence_default", 1.0),
            "match_type": "synonym_lookup",
            "domain": domain,
            "cached": True
        }

    # Run full matching engine
    result = await run_matching_engine(source_value)

    return {
        "resolved": result.get("standard_code") is not None,
        "source_value": source_value,
        "normalized_value": normalized,
        "standard_code": result.get("standard_code"),
        "standard_label": result.get("standard_label"),
        "confidence": result.get("confidence", 0.0),
        "match_type": result.get("match_type", "no_match"),
        "status": result.get("status", "unmapped"),
        "domain": domain,
        "cached": False
    }


# ============ WRITE APIs ============

@mdm_router.post("/mappings")
async def create_mapping(request: MappingCreateRequest):
    """Create a new mapping entry"""
    from server import normalize_text

    normalized = normalize_text(request.source_value)

    doc = {
        "id": _uuid(),
        "domain_name": request.domain_name,
        "source_system": request.source_system,
        "source_field_name": request.source_field_name,
        "source_value": request.source_value,
        "source_value_normalized": normalized,
        "standard_code": request.standard_code,
        "confidence_score": request.confidence_score,
        "mapping_status": "proposed",
        "mapping_method": request.mapping_method,
        "version_no": 1,
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": "user"
    }

    # If standard code provided, resolve label
    if request.standard_code:
        std = await _db.standards.find_one({"code": request.standard_code}, {"_id": 0})
        if std:
            doc["standard_label"] = std["label"]
            doc["standard_id"] = std.get("id", std["code"])

    await _db.mdm_mappings.insert_one(doc)

    # Track history
    await _db.mdm_history.insert_one({
        "id": _uuid(),
        "mapping_id": doc["id"],
        "action": "created",
        "new_status": "proposed",
        "new_standard_code": request.standard_code,
        "new_confidence": request.confidence_score,
        "version_no": 1,
        "changed_by": "user",
        "changed_at": _now()
    })

    safe_doc = {k: v for k, v in doc.items() if k != "_id"}
    return {"success": True, "mapping": safe_doc}


@mdm_router.put("/mappings/{mapping_id}/approve")
async def approve_mapping_mdm(mapping_id: str, request: ApproveRequest):
    """Approve a mapping — moves to approved status"""
    mapping = await _db.mdm_mappings.find_one({"id": mapping_id}, {"_id": 0})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    old_status = mapping.get("mapping_status")
    new_version = mapping.get("version_no", 1)

    await _db.mdm_mappings.update_one(
        {"id": mapping_id},
        {"$set": {
            "mapping_status": "approved",
            "approved_by": request.approved_by,
            "approved_at": _now(),
            "updated_at": _now()
        }}
    )

    await _db.mdm_history.insert_one({
        "id": _uuid(),
        "mapping_id": mapping_id,
        "action": "approved",
        "old_status": old_status,
        "new_status": "approved",
        "version_no": new_version,
        "changed_by": request.approved_by,
        "changed_at": _now()
    })

    return {"success": True, "mapping_id": mapping_id, "status": "approved"}


@mdm_router.put("/mappings/{mapping_id}/reject")
async def reject_mapping_mdm(mapping_id: str, request: RejectRequest):
    """Reject a mapping"""
    mapping = await _db.mdm_mappings.find_one({"id": mapping_id}, {"_id": 0})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    old_status = mapping.get("mapping_status")

    await _db.mdm_mappings.update_one(
        {"id": mapping_id},
        {"$set": {
            "mapping_status": "rejected",
            "rejected_by": request.rejected_by,
            "rejected_at": _now(),
            "rejection_reason": request.rejection_reason,
            "updated_at": _now()
        }}
    )

    await _db.mdm_history.insert_one({
        "id": _uuid(),
        "mapping_id": mapping_id,
        "action": "rejected",
        "old_status": old_status,
        "new_status": "rejected",
        "version_no": mapping.get("version_no", 1),
        "changed_by": request.rejected_by,
        "changed_at": _now(),
        "change_reason": request.rejection_reason
    })

    return {"success": True, "mapping_id": mapping_id, "status": "rejected"}


# ============ EXPORT APIs ============

@mdm_router.get("/exports/{domain}")
async def export_domain(
    domain: str,
    format: str = Query("json", enum=["json", "csv", "business_dictionary", "snowflake_sql"]),
    status: str = Query("approved", description="Filter by status: all, approved, auto, needs_review")
):
    """Export domain mappings in various formats"""

    # Build query
    query = {}
    if status != "all":
        if status == "approved":
            query["status"] = {"$in": ["approved", "auto"]}
        else:
            query["status"] = status

    mappings_raw = await _db.mapping_results.find(query, {"_id": 0}).to_list(100000)
    standards = await _db.standards.find({"active_flag": {"$ne": False}}, {"_id": 0}).to_list(1000)
    synonyms = await _db.synonyms.find({}, {"_id": 0}).to_list(10000)

    if format == "json":
        return _export_json(domain, mappings_raw, standards, synonyms)
    elif format == "csv":
        return _export_csv(domain, mappings_raw)
    elif format == "business_dictionary":
        return _export_business_dictionary(domain, standards, synonyms, mappings_raw)
    elif format == "snowflake_sql":
        return _export_snowflake_sql(domain, standards, mappings_raw, synonyms)


def _map_status(status):
    """Map internal status to MDM lifecycle status"""
    mapping = {
        "auto": "auto_mapped",
        "approved": "approved",
        "needs_review": "pending_review",
        "unmapped": "proposed",
        "pending": "pending_review"
    }
    return mapping.get(status, status)


def _export_json(domain, mappings, standards, synonyms):
    """Export as API-ready JSON"""
    output = {
        "domain": domain,
        "version": "1.0",
        "exported_at": _now(),
        "standards": [
            {
                "standard_code": s["code"],
                "standard_label": s["label"],
                "description": s.get("description", ""),
                "is_active": s.get("active_flag", True)
            }
            for s in standards
        ],
        "mappings": [
            {
                "source_value": m["vendor_value"],
                "normalized_value": m.get("normalized_value", ""),
                "standard_code": m.get("final_standard_code") or m.get("suggested_standard_code"),
                "standard_label": m.get("final_standard_label") or m.get("suggested_standard_label"),
                "confidence": m.get("confidence", 0.0),
                "match_type": m.get("match_type", ""),
                "status": _map_status(m.get("status", "")),
                "occurrence_count": m.get("occurrence_count", 1)
            }
            for m in mappings
            if m.get("final_standard_code") or m.get("suggested_standard_code")
        ],
        "synonyms": [
            {
                "source_value": s["source_value_raw"],
                "standard_code": s["standard_code"],
                "standard_label": s.get("standard_label", ""),
                "confidence": s.get("confidence_default", 1.0),
                "rule_type": s.get("rule_type", "")
            }
            for s in synonyms
        ],
        "summary": {
            "total_standards": len(standards),
            "total_mappings": len(mappings),
            "total_synonyms": len(synonyms)
        }
    }
    return output


def _export_csv(domain, mappings):
    """Export as CSV"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "source_value", "normalized_value", "standard_code", "standard_label",
        "confidence", "match_type", "status", "occurrence_count"
    ])
    for m in mappings:
        std_code = m.get("final_standard_code") or m.get("suggested_standard_code") or ""
        std_label = m.get("final_standard_label") or m.get("suggested_standard_label") or ""
        writer.writerow([
            m.get("vendor_value", ""),
            m.get("normalized_value", ""),
            std_code,
            std_label,
            m.get("confidence", 0),
            m.get("match_type", ""),
            _map_status(m.get("status", "")),
            m.get("occurrence_count", 1)
        ])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mdm_{domain}_mappings.csv"}
    )


def _export_business_dictionary(domain, standards, synonyms, mappings):
    """Export as Business Dictionary"""
    # Build synonym lookup
    syn_by_code = {}
    for s in synonyms:
        code = s.get("standard_code", "")
        syn_by_code.setdefault(code, []).append(s["source_value_raw"])

    # Build mapping stats
    mapping_stats = {}
    for m in mappings:
        code = m.get("final_standard_code") or m.get("suggested_standard_code")
        if code:
            mapping_stats.setdefault(code, {"total": 0, "methods": {}})
            mapping_stats[code]["total"] += 1
            method = m.get("match_type", "unknown")
            mapping_stats[code]["methods"][method] = mapping_stats[code]["methods"].get(method, 0) + 1

    entries = []
    for std in standards:
        code = std["code"]
        entries.append({
            "standard_code": code,
            "standard_label": std["label"],
            "definition": std.get("description", ""),
            "domain": domain,
            "synonyms": syn_by_code.get(code, []),
            "synonym_count": len(syn_by_code.get(code, [])),
            "mapping_rules": {
                "total_mapped_values": mapping_stats.get(code, {}).get("total", 0),
                "by_method": mapping_stats.get(code, {}).get("methods", {})
            },
            "data_owner": "Clinical Informatics",
            "version": "1.0",
            "is_active": std.get("active_flag", True),
            "last_updated": std.get("created_at", "")
        })

    return {
        "business_dictionary": {
            "domain": domain,
            "version": "1.0",
            "exported_at": _now(),
            "entries": entries,
            "summary": {
                "total_standards": len(standards),
                "total_synonyms": len(synonyms),
                "total_mappings": len(mappings)
            }
        }
    }


def _export_snowflake_sql(domain, standards, mappings, synonyms):
    """Generate Snowflake INSERT statements"""
    lines = [
        f"-- MDM Export: {domain}",
        f"-- Generated: {_now()}",
        "",
        "-- Standard Values",
        "INSERT INTO DIM_STANDARD_VALUES (standard_id, standard_code, standard_label, standard_description, domain_name) VALUES"
    ]

    std_values = []
    for s in standards:
        code = s["code"]
        label = s["label"].replace("'", "''")
        desc = s.get("description", "").replace("'", "''")
        std_values.append(f"    ('{code}', '{code}', '{label}', '{desc}', '{domain}')")
    lines.append(",\n".join(std_values) + ";\n")

    lines.append("-- Source-to-Standard Mappings")
    lines.append("INSERT INTO BRIDGE_SOURCE_TO_STANDARD (mapping_id, domain_name, source_value, source_value_normalized, standard_code, standard_label, confidence_score, mapping_status, mapping_method) VALUES")

    map_values = []
    for m in mappings:
        std_code = m.get("final_standard_code") or m.get("suggested_standard_code")
        if not std_code:
            continue
        mid = m.get("id", _uuid())
        sv = m.get("vendor_value", "").replace("'", "''")
        nv = m.get("normalized_value", "").replace("'", "''")
        sl = (m.get("final_standard_label") or m.get("suggested_standard_label") or "").replace("'", "''")
        conf = m.get("confidence", 0)
        status = _map_status(m.get("status", ""))
        method = m.get("match_type", "")
        map_values.append(f"    ('{mid}', '{domain}', '{sv}', '{nv}', '{std_code}', '{sl}', {conf}, '{status}', '{method}')")

    if map_values:
        lines.append(",\n".join(map_values) + ";")
    else:
        lines.append("-- No mappings to insert")

    return {
        "domain": domain,
        "format": "snowflake_sql",
        "sql": "\n".join(lines),
        "record_count": len(map_values)
    }


# ============ GOVERNANCE APIs ============

@mdm_router.get("/governance/lifecycle")
async def get_governance_lifecycle():
    """Return the mapping status lifecycle"""
    return {
        "lifecycle": {
            "statuses": [
                {"code": "proposed", "label": "Proposed", "description": "New mapping suggestion, not yet reviewed"},
                {"code": "auto_mapped", "label": "Auto-Mapped", "description": "Automatically matched with high confidence"},
                {"code": "pending_review", "label": "Pending Review", "description": "Needs human review before approval"},
                {"code": "approved", "label": "Approved", "description": "Reviewed and approved by authorized user"},
                {"code": "rejected", "label": "Rejected", "description": "Reviewed and rejected with reason"},
                {"code": "retired", "label": "Retired", "description": "Previously active, now decommissioned"},
            ],
            "transitions": [
                {"from": "proposed", "to": ["auto_mapped", "pending_review", "approved", "rejected"]},
                {"from": "auto_mapped", "to": ["approved", "rejected", "pending_review"]},
                {"from": "pending_review", "to": ["approved", "rejected"]},
                {"from": "approved", "to": ["retired", "rejected"]},
                {"from": "rejected", "to": ["proposed", "retired"]},
                {"from": "retired", "to": ["proposed"]},
            ]
        }
    }


@mdm_router.get("/governance/history/{mapping_id}")
async def get_mapping_history(mapping_id: str):
    """Get full change history for a mapping"""
    history = await _db.mdm_history.find(
        {"mapping_id": mapping_id},
        {"_id": 0}
    ).sort("changed_at", 1).to_list(100)

    return {"mapping_id": mapping_id, "history": history, "total_changes": len(history)}


@mdm_router.get("/governance/stats")
async def get_governance_stats():
    """Get governance overview statistics"""
    total = await _db.mapping_results.count_documents({})

    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_raw = await _db.mapping_results.aggregate(pipeline).to_list(20)
    by_status = {s["_id"]: s["count"] for s in status_raw}

    method_pipeline = [
        {"$group": {"_id": "$match_type", "count": {"$sum": 1}}}
    ]
    method_raw = await _db.mapping_results.aggregate(method_pipeline).to_list(20)
    by_method = {m["_id"]: m["count"] for m in method_raw}

    return {
        "total_mappings": total,
        "by_status": {
            "proposed": by_status.get("unmapped", 0),
            "auto_mapped": by_status.get("auto", 0),
            "pending_review": by_status.get("needs_review", 0),
            "approved": by_status.get("approved", 0),
        },
        "by_method": by_method,
        "coverage_rate": round(
            (by_status.get("auto", 0) + by_status.get("approved", 0)) / max(total, 1) * 100, 1
        )
    }


# ============ SNOWFLAKE SCHEMA DOWNLOAD ============

@mdm_router.get("/schema/snowflake")
async def get_snowflake_schema():
    """Download the full Snowflake DDL schema"""
    import os
    schema_path = os.path.join(os.path.dirname(__file__), "snowflake_schema.sql")
    with open(schema_path, "r") as f:
        sql = f.read()

    return StreamingResponse(
        iter([sql]),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=mdm_snowflake_schema.sql"}
    )
