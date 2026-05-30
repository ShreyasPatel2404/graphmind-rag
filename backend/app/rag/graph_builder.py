"""
graph_builder.py — Extract entity-relation triples from text chunks
and write them to Neo4j as a knowledge graph.

Pipeline:
  1. spaCy NER  → fast entity detection
  2. Ollama LLM → extract (subject, relation, object) triples as JSON
  3. Neo4j       → store nodes + edges tagged with doc_id
"""

import json
import logging
import re
from typing import Optional

import spacy
from app.rag.ollama_client import generate
from app.rag.neo4j_client import get_driver, clear_document_graph

logger = logging.getLogger(__name__)

# ─── spaCy model (loaded once) ────────────────────────────────────────────────
_nlp = None

def get_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("spaCy model not found — run: python -m spacy download en_core_web_sm")
            _nlp = None
    return _nlp


# ─── Entity type mapping ──────────────────────────────────────────────────────
SPACY_TO_TYPE = {
    "PERSON":   "Person",
    "ORG":      "Organization",
    "GPE":      "Place",
    "LOC":      "Place",
    "PRODUCT":  "Product",
    "EVENT":    "Event",
    "WORK_OF_ART": "Concept",
    "LAW":      "Concept",
    "NORP":     "Organization",
    "FAC":      "Place",
}


# ─── Extract triples via Ollama LLM ──────────────────────────────────────────
def extract_triples(text_chunk: str) -> list[dict]:
    """
    Use Ollama to extract (subject, relation, object) triples from a text chunk.
    Returns: [{"subject": str, "relation": str, "object": str, "subject_type": str, "object_type": str}]
    """
    prompt = f"""Extract knowledge graph triples from the text below.
Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.
Each element must have exactly these keys: "subject", "relation", "object"

Rules:
- Subject and object must be specific named entities or concepts (not pronouns)
- Relation must be a short verb phrase (2-4 words max)
- Extract 3-8 triples maximum
- If no clear relationships exist, return []

Text:
{text_chunk[:1500]}

JSON array:"""

    try:
        raw = generate(prompt)
        # Strip markdown code blocks if present
        raw = raw.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip()
        raw = raw.rstrip("`").strip()

        # Find the JSON array in the response
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return []

        triples = json.loads(match.group())

        # Validate structure
        valid = []
        for t in triples:
            if isinstance(t, dict) and all(k in t for k in ("subject", "relation", "object")):
                subj = str(t["subject"]).strip()[:100]
                rel  = str(t["relation"]).strip()[:100]
                obj  = str(t["object"]).strip()[:100]
                if subj and rel and obj and subj != obj:
                    valid.append({
                        "subject":      subj,
                        "relation":     rel,
                        "object":       obj,
                        "subject_type": t.get("subject_type", "Concept"),
                        "object_type":  t.get("object_type", "Concept"),
                    })
        return valid

    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Triple extraction failed: {e}")
        return []


# ─── Enrich entity types with spaCy ──────────────────────────────────────────
def enrich_with_spacy(triples: list[dict], text: str) -> list[dict]:
    """Use spaCy NER to assign proper entity types to subjects/objects."""
    nlp = get_nlp()
    if not nlp:
        return triples

    doc = nlp(text[:5000])
    entity_map = {ent.text.lower(): SPACY_TO_TYPE.get(ent.label_, "Concept") for ent in doc.ents}

    for t in triples:
        subj_lower = t["subject"].lower()
        obj_lower  = t["object"].lower()

        # Direct match
        if subj_lower in entity_map:
            t["subject_type"] = entity_map[subj_lower]
        else:
            # Partial match
            for key, val in entity_map.items():
                if key in subj_lower or subj_lower in key:
                    t["subject_type"] = val
                    break

        if obj_lower in entity_map:
            t["object_type"] = entity_map[obj_lower]
        else:
            for key, val in entity_map.items():
                if key in obj_lower or obj_lower in key:
                    t["object_type"] = val
                    break

    return triples


# ─── Write triples to Neo4j ───────────────────────────────────────────────────
def write_to_neo4j(triples: list[dict], doc_id: int, user_id: int):
    """
    Upsert entities and relationships into Neo4j.
    Nodes tagged with doc_id + user_id for isolation.
    """
    if not triples:
        return

    driver = get_driver()
    with driver.session() as session:
        for t in triples:
            session.run(
                """
                MERGE (a:Entity {name: $subj, doc_id: $doc_id, user_id: $user_id})
                SET a.type = $subj_type

                MERGE (b:Entity {name: $obj, doc_id: $doc_id, user_id: $user_id})
                SET b.type = $obj_type

                MERGE (a)-[r:RELATES {doc_id: $doc_id}]->(b)
                SET r.relation = $relation
                """,
                {
                    "subj":      t["subject"],
                    "obj":       t["object"],
                    "relation":  t["relation"],
                    "subj_type": t.get("subject_type", "Concept"),
                    "obj_type":  t.get("object_type", "Concept"),
                    "doc_id":    doc_id,
                    "user_id":   user_id,
                }
            )

    logger.info(f"Wrote {len(triples)} triples to Neo4j for doc {doc_id}")


# ─── Fetch graph JSON for frontend ───────────────────────────────────────────
def fetch_graph_json(doc_id: int, user_id: int) -> dict:
    """
    Query Neo4j and return {nodes: [...], edges: [...]} for D3.js.
    """
    driver = get_driver()
    with driver.session() as session:
        # Nodes
        node_result = session.run(
            """
            MATCH (n:Entity {doc_id: $doc_id, user_id: $user_id})
            RETURN n.name AS name, n.type AS type, id(n) AS neo4j_id
            """,
            {"doc_id": doc_id, "user_id": user_id}
        )
        nodes_raw = [dict(r) for r in node_result]

        # Edges
        edge_result = session.run(
            """
            MATCH (a:Entity {doc_id: $doc_id, user_id: $user_id})
                  -[r:RELATES]->(b:Entity {doc_id: $doc_id, user_id: $user_id})
            RETURN a.name AS source, b.name AS target, r.relation AS relation
            """,
            {"doc_id": doc_id, "user_id": user_id}
        )
        edges_raw = [dict(r) for r in edge_result]

    # Build node id map
    node_map = {n["name"]: i for i, n in enumerate(nodes_raw)}

    nodes = [
        {
            "id":    n["name"],
            "label": n["name"],
            "type":  n.get("type") or "Concept",
        }
        for n in nodes_raw
    ]

    edges = [
        {
            "source":   e["source"],
            "target":   e["target"],
            "relation": e["relation"],
        }
        for e in edges_raw
        if e["source"] in node_map and e["target"] in node_map
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


# ─── Full pipeline: chunks → triples → Neo4j ─────────────────────────────────
def build_graph_from_chunks(
    chunks: list[str],
    doc_id: int,
    user_id: int,
    max_chunks: int = 15,
) -> dict:
    """
    Main entry point. Process up to max_chunks text chunks,
    extract triples, enrich with spaCy, write to Neo4j.
    Returns summary stats.
    """
    # Clear old graph for this doc
    clear_document_graph(doc_id)

    all_triples = []
    processed = 0

    # Limit chunks to avoid very long processing times
    chunks_to_process = chunks[:max_chunks]

    for i, chunk in enumerate(chunks_to_process):
        try:
            triples = extract_triples(chunk)
            if triples:
                triples = enrich_with_spacy(triples, chunk)
                all_triples.extend(triples)
            processed += 1
            logger.info(f"Chunk {i+1}/{len(chunks_to_process)}: extracted {len(triples)} triples")
        except Exception as e:
            logger.warning(f"Chunk {i} failed: {e}")
            continue

    # Deduplicate triples
    seen = set()
    unique_triples = []
    for t in all_triples:
        key = (t["subject"].lower(), t["relation"].lower(), t["object"].lower())
        if key not in seen:
            seen.add(key)
            unique_triples.append(t)

    # Write to Neo4j
    if unique_triples:
        write_to_neo4j(unique_triples, doc_id, user_id)

    return {
        "chunks_processed": processed,
        "triples_extracted": len(unique_triples),
        "status": "done" if unique_triples else "no_triples",
    }
