"""
graph_builder.py — Extract triples + write to Neo4j
spaCy removed for deployment compatibility.
Entity typing uses keyword-based heuristics instead.
"""

import json
import logging
import re
from typing import Optional

from app.rag.ollama_client import generate
from app.rag.neo4j_client import get_driver, clear_document_graph

logger = logging.getLogger(__name__)


# ─── Keyword-based entity type classifier (replaces spaCy) ───────────────────
PERSON_HINTS = {
    "ceo", "founder", "president", "director", "engineer", "scientist",
    "researcher", "professor", "dr", "mr", "mrs", "ms", "phd",
    "geoffrey", "yann", "yoshua", "andrew", "elon", "sam", "sundar",
    "hinton", "lecun", "bengio", "turing", "minsky", "mccarthy",
}
ORG_HINTS = {
    "inc", "corp", "ltd", "llc", "university", "institute", "lab",
    "laboratory", "company", "organization", "foundation", "group",
    "openai", "anthropic", "google", "microsoft", "meta", "apple",
    "deepmind", "nvidia", "hugging face", "stanford", "mit", "oxford",
}
PLACE_HINTS = {
    "city", "country", "state", "region", "continent", "ocean", "river",
    "mountain", "street", "avenue", "road", "park",
    "california", "london", "new york", "paris", "beijing", "tokyo",
    "silicon valley", "seattle", "boston",
}


def classify_entity_type(name: str) -> str:
    """Classify entity type using keyword heuristics."""
    lower = name.lower()
    words = set(lower.split())

    if words & PERSON_HINTS or any(h in lower for h in PERSON_HINTS):
        return "Person"
    if words & ORG_HINTS or any(h in lower for h in ORG_HINTS):
        return "Organization"
    if words & PLACE_HINTS or any(h in lower for h in PLACE_HINTS):
        return "Place"

    # Capitalized single words that aren't concepts → likely named entity
    if name[0].isupper() and len(name.split()) <= 2:
        return "Concept"

    return "Concept"


# ─── Extract triples via Ollama LLM ──────────────────────────────────────────
def extract_triples(text_chunk: str) -> list[dict]:
    prompt = f"""Extract knowledge graph triples from the text below.
Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.
Each element must have exactly: "subject", "relation", "object"

Rules:
- Subject and object must be specific named entities or concepts (not pronouns)
- Relation must be a short verb phrase (2-4 words max)
- Extract 3-8 triples maximum
- If no clear relationships exist, return []

Text:
{text_chunk[:1500]}

JSON array:"""

    try:
        raw = generate(prompt).strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return []
        triples = json.loads(match.group())
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
                        "subject_type": t.get("subject_type", classify_entity_type(subj)),
                        "object_type":  t.get("object_type",  classify_entity_type(obj)),
                    })
        return valid
    except Exception as e:
        logger.warning(f"Triple extraction failed: {e}")
        return []


def write_to_neo4j(
    triples: list[dict],
    doc_id: int,
    user_id: int,
    project_id: Optional[int] = None,
):
    """Write triples to Neo4j. Nodes tagged with doc_id, user_id, project_id."""
    if not triples:
        return
    driver = get_driver()
    with driver.session() as session:
        for t in triples:
            session.run(
                """
                MERGE (a:Entity {name: $subj, doc_id: $doc_id, user_id: $user_id})
                SET a.type = $subj_type, a.project_id = $project_id

                MERGE (b:Entity {name: $obj, doc_id: $doc_id, user_id: $user_id})
                SET b.type = $obj_type, b.project_id = $project_id

                MERGE (a)-[r:RELATES {doc_id: $doc_id}]->(b)
                SET r.relation = $relation, r.project_id = $project_id
                """,
                {
                    "subj":       t["subject"],
                    "obj":        t["object"],
                    "relation":   t["relation"],
                    "subj_type":  t.get("subject_type", "Concept"),
                    "obj_type":   t.get("object_type",  "Concept"),
                    "doc_id":     doc_id,
                    "user_id":    user_id,
                    "project_id": project_id,
                }
            )
    logger.info(f"Wrote {len(triples)} triples for doc {doc_id}")


def fetch_graph_json(doc_id: int, user_id: int) -> dict:
    driver = get_driver()
    with driver.session() as session:
        node_result = session.run(
            """
            MATCH (n:Entity {doc_id: $doc_id, user_id: $user_id})
            RETURN n.name AS name, n.type AS type
            """,
            {"doc_id": doc_id, "user_id": user_id}
        )
        nodes_raw = [dict(r) for r in node_result]

        edge_result = session.run(
            """
            MATCH (a:Entity {doc_id: $doc_id, user_id: $user_id})
                  -[r:RELATES]->(b:Entity {doc_id: $doc_id, user_id: $user_id})
            RETURN a.name AS source, b.name AS target, r.relation AS relation
            """,
            {"doc_id": doc_id, "user_id": user_id}
        )
        edges_raw = [dict(r) for r in edge_result]

    node_names = {n["name"] for n in nodes_raw}
    nodes = [
        {"id": n["name"], "label": n["name"], "type": n.get("type") or "Concept"}
        for n in nodes_raw
    ]
    edges = [
        {"source": e["source"], "target": e["target"], "relation": e["relation"]}
        for e in edges_raw
        if e["source"] in node_names and e["target"] in node_names
    ]

    return {
        "nodes":      nodes,
        "edges":      edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


def build_graph_from_chunks(
    chunks: list[str],
    doc_id: int,
    user_id: int,
    max_chunks: int = 15,
    project_id: Optional[int] = None,
) -> dict:
    clear_document_graph(doc_id)
    all_triples = []
    processed   = 0

    for i, chunk in enumerate(chunks[:max_chunks]):
        try:
            triples = extract_triples(chunk)
            if triples:
                all_triples.extend(triples)
            processed += 1
        except Exception as e:
            logger.warning(f"Chunk {i} failed: {e}")
            continue

    # Deduplicate
    seen   = set()
    unique = []
    for t in all_triples:
        key = (t["subject"].lower(), t["relation"].lower(), t["object"].lower())
        if key not in seen:
            seen.add(key)
            unique.append(t)

    if unique:
        write_to_neo4j(unique, doc_id, user_id, project_id)

    return {
        "chunks_processed":  processed,
        "triples_extracted": len(unique),
        "status":            "done" if unique else "no_triples",
    }