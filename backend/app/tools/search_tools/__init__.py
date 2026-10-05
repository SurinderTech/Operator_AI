"""
Search Tools — RAG-powered knowledge base search for the agent.
Industry-agnostic: returns raw knowledge chunks for any business type.
"""
from __future__ import annotations
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import logger
from app.rag.pipeline import rag_pipeline


async def search_knowledge(
    query: str,
    business_id: str,
    db: AsyncSession,
    top_k: int = 5,
) -> dict[str, Any]:
    """
    Semantic search over the business's knowledge base.
    Works for any business type — returns raw chunks that the agent uses
    to answer any question (services, pricing, FAQs, policies, products, etc.).

    Returns: {results: [{content, similarity, metadata}, ...], context: str, found: bool}
    """
    try:
        results = await rag_pipeline.search(
            query=query,
            business_id=business_id,
            db=db,
            top_k=top_k,
        )
        context = "\n\n---\n\n".join(r["content"] for r in results)
        logger.info(f"🔍 RAG search '{query[:50]}' → {len(results)} chunks")
        return {
            "results": results,
            "context": context,
            "found": len(results) > 0,
        }
    except Exception as e:
        logger.error(f"Knowledge search failed: {e}")
        return {"results": [], "context": "", "found": False, "error": str(e)}


async def search_items(
    query: str,
    business_id: str,
    db: AsyncSession,
    filters: dict | None = None,
    industry: str = "general",
) -> dict[str, Any]:
    """
    Generic item/service/product search with optional filters.
    Replaces the old real-estate-only search_properties function.

    Builds a targeted query from filters and returns structured results
    plus raw context string for the LLM.

    filters: {location, service_requested, budget, quantity, ...}
    Returns: {items: [...], context: str, found: bool}
    """
    filter_parts: list[str] = []
    if filters:
        if filters.get("service_requested"):
            filter_parts.append(filters["service_requested"])
        if filters.get("location"):
            filter_parts.append(f"in {filters['location']}")
        if filters.get("budget"):
            filter_parts.append(f"under ₹{filters['budget']} budget")
        if filters.get("quantity"):
            filter_parts.append(f"quantity {filters['quantity']}")

    full_query = f"{query} {' '.join(filter_parts)}".strip()
    result = await search_knowledge(full_query, business_id, db, top_k=5)

    return {
        "items": _extract_items_from_results(result["results"], industry),
        "context": result["context"],
        "found": result["found"],
    }


def _extract_items_from_results(results: list[dict], industry: str = "general") -> list[dict]:
    """
    Extract structured items from RAG chunks.
    Tries to use metadata if the document was ingested with structure;
    otherwise returns text snippets as generic info cards.
    """
    items = []
    for r in results[:4]:
        meta = r.get("metadata", {})
        content_snippet = r.get("content", "")[:300]

        if meta:
            # Structured metadata — format generically
            item = {
                "title": meta.get("name") or meta.get("title") or meta.get("service") or "Item",
                "description": content_snippet,
                "price": (
                    meta.get("price")
                    or meta.get("price_lakhs")
                    or meta.get("cost")
                    or meta.get("fee")
                    or None
                ),
                "location": meta.get("location") or meta.get("branch") or None,
                "metadata": {k: v for k, v in meta.items() if v is not None},
                "similarity": r.get("similarity", 0),
            }
        else:
            # Unstructured — return as a plain info card
            item = {
                "title": "Information",
                "description": content_snippet,
                "price": None,
                "location": None,
                "metadata": {},
                "similarity": r.get("similarity", 0),
            }
        items.append(item)
    return items


# ── Backward compatibility alias (used by old lead_agent code) ────────────────

async def search_properties(
    query: str,
    business_id: str,
    db: AsyncSession,
    filters: dict | None = None,
) -> dict[str, Any]:
    """
    Legacy alias for real-estate property search.
    Delegates to search_items with real-estate industry context.
    """
    result = await search_items(
        query=query,
        business_id=business_id,
        db=db,
        filters=filters,
        industry="real_estate",
    )
    # Remap "items" → "properties" for backward compat
    return {
        "properties": _items_to_property_format(result["items"]),
        "context": result["context"],
        "found": result["found"],
    }


def _items_to_property_format(items: list[dict]) -> list[dict]:
    """Convert generic items to the old property card format."""
    return [
        {
            "name": item.get("title", "Property Option"),
            "location": item.get("location", ""),
            "price_lakhs": item.get("price", "?"),
            "bedrooms": item.get("metadata", {}).get("bedrooms", "?"),
            "area_sqft": item.get("metadata", {}).get("area_sqft", "?"),
            "description": item.get("description", ""),
        }
        for item in items
    ]
