"""
graph_builder.py — Extract triples + write to Neo4j with project_id tagging
"""

import json
import logging
import re
from typing import Optional

import spacy
from app.rag.ollama_client import generate
from app.rag.neo4j_client import get_driver, clear_document_graph

logger = logging.getLogger(__name__)

_nlp = None

def get_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            _nlp = None
    return _nlp


SPACY_TO_TYPE = {
    "PERSON": "Person", "ORG": "Organization", "GPE": "Place",
    "LOC": "Place", "PRODUCT": "Product", "EVENT": "Event",
    "WORK_OF_ART": "Concept", "LAW": "Concept", "NORP": "Organization",
    "FAC": "Place",
}


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
                        "subject_type": t.get("subject_type", "Concept"),
                        "object_type":  t.get("object_type", "Concept"),
                    })
        return valid
    except Exception as e:
        logger.warning(f"Triple extraction failed: {e}")
        return []


def enrich_with_spacy(triples: list[dict], text: str) -> list[dict]:
    nlp = get_nlp()
    if not nlp:
        return triples
    doc = nlp(text[:5000])
    entity_map = {
        ent.text.lower(): SPACY_TO_TYPE.get(ent.label_, "Concept")
        for ent in doc.ents
    }
    for t in triples:
        for key in ("subject", "object"):
            word = t[key].lower()
            type_key = f"{key}_type"
            if word in entity_map:
                t[type_key] = entity_map[word]
            else:
                for k, v in entity_map.items():
                    if k in word or word in k:
                        t[type_key] = v
                        break
    return triples


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
                    "obj_type":   t.get("object_type", "Concept"),
                    "doc_id":     doc_id,
                    "user_id":    user_id,
                    "project_id": project_id,
                }
            )
    logger.info(f"Wrote {len(triples)} triples for doc {doc_id} project {project_id}")


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

    return {"nodes": nodes, "edges": edges, "node_count": len(nodes), "edge_count": len(edges)}


def build_graph_from_chunks(
    chunks: list[str],
    doc_id: int,
    user_id: int,
    max_chunks: int = 15,
    project_id: Optional[int] = None,
) -> dict:
    clear_document_graph(doc_id)
    all_triples = []
    processed = 0

    for i, chunk in enumerate(chunks[:max_chunks]):
        try:
            triples = extract_triples(chunk)
            if triples:
                triples = enrich_with_spacy(triples, chunk)
                all_triples.extend(triples)
            processed += 1
        except Exception as e:
            logger.warning(f"Chunk {i} failed: {e}")
            continue

    # Deduplicate
    seen = set()
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