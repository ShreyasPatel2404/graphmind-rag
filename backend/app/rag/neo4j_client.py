"""
neo4j_client.py — Neo4j driver singleton + helpers
"""

import logging
from typing import Optional
from neo4j import GraphDatabase, Driver
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_driver: Optional[Driver] = None


# ─── Driver singleton ─────────────────────────────────────────────────────────
def get_driver() -> Driver:
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
        )
    return _driver


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


# ─── Health check ─────────────────────────────────────────────────────────────
def check_neo4j_health() -> dict:
    try:
        driver = get_driver()
        driver.verify_connectivity()
        with driver.session() as session:
            result = session.run("RETURN 1 AS ok")
            result.single()
        return {"connected": True, "uri": settings.neo4j_uri}
    except Exception as e:
        return {"connected": False, "error": str(e)}


# ─── Run a query (read) ───────────────────────────────────────────────────────
def run_read(query: str, params: dict = None) -> list[dict]:
    driver = get_driver()
    with driver.session() as session:
        result = session.run(query, params or {})
        return [dict(record) for record in result]


# ─── Run a query (write) ──────────────────────────────────────────────────────
def run_write(query: str, params: dict = None):
    driver = get_driver()
    with driver.session() as session:
        session.run(query, params or {})


# ─── Clear all nodes for a document ──────────────────────────────────────────
def clear_document_graph(doc_id: int):
    run_write(
        "MATCH (n {doc_id: $doc_id}) DETACH DELETE n",
        {"doc_id": doc_id}
    )
    logger.info(f"Cleared graph for doc {doc_id}")
    