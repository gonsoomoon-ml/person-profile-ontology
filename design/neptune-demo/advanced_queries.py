#!/usr/bin/env python3
"""
음식 배달 사용자 프로파일링 그래프에 대한 고급 openCypher + Neptune Analytics
그래프 알고리즘 예제. 데이터가 이미 적재되어 있다고 가정한다(먼저 load_and_query.py 실행).

사용법:
    python3 advanced_queries.py <graph-id> [--region us-east-1] [--a Jiwon] [--b Tae]

참고: PageRank / Louvain 예제는 *.mutate로 노드 속성(pr, community)을 기록한다 —
일회용 데모 그래프에서는 무해하며, 재실행 시 덮어쓴다.
"""
import json, argparse, boto3

def q(client, gid, cypher, params=None):
    kw = dict(graphIdentifier=gid, queryString=cypher, language="OPEN_CYPHER")
    if params is not None:
        kw["parameters"] = json.loads(json.dumps(params))
    return json.loads(client.execute_query(**kw)["payload"].read())["results"]

def table(rows):
    if not rows:
        print("   (no rows)"); return
    cols = list(rows[0].keys())
    def cell(v):
        if isinstance(v, list): return ", ".join(map(str, v))
        if isinstance(v, float): return f"{v:.4f}"
        return str(v)
    w = {c: max(len(c), *(len(cell(r.get(c, ""))) for r in rows)) for c in cols}
    print("   " + " | ".join(c.ljust(w[c]) for c in cols))
    print("   " + "-+-".join("-" * w[c] for c in cols))
    for r in rows:
        print("   " + " | ".join(cell(r.get(c, "")).ljust(w[c]) for c in cols))

def section(title): print("\n### " + title)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph_id")
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--a", default="Jiwon", help="user A (CF / path / jaccard)")
    ap.add_argument("--b", default="Tae", help="user B (path)")
    args = ap.parse_args()
    c, gid = boto3.client("neptune-graph", region_name=args.region), args.graph_id

    print("="*78 + "\n고급 쿼리 — 음식 배달 사용자 프로파일링 그래프\n" + "="*78)

    section(f"1) '{args.a}' 협업 필터링(CF) 식당 추천 "
            "(식당을 공유하는 이웃 → 그들의 미경험 식당)")
    table(q(c, gid, """
        MATCH (me:User {name:$name})-[:PLACED]->(:Order)-[:AT]->(:Restaurant)
              <-[:AT]-(:Order)<-[:PLACED]-(peer:User)
        WHERE peer <> me
        MATCH (peer)-[:PLACED]->(:Order)-[:AT]->(rec:Restaurant)
        WHERE NOT (me)-[:PLACED]->(:Order)-[:AT]->(rec)
        RETURN rec.name AS recommended, count(DISTINCT peer) AS peers, rec.rating AS rating
        ORDER BY peers DESC, rating DESC LIMIT 5""", {"name": args.a}))

    section("2) 요리 동시출현 (장바구니: X를 주문하는 사용자가 Y도 주문)")
    table(q(c, gid, """
        MATCH (u:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c1:Cuisine)
        MATCH (u)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c2:Cuisine)
        WHERE c1.name < c2.name
        RETURN c1.name AS cuisineA, c2.name AS cuisineB, count(DISTINCT u) AS users
        ORDER BY users DESC, cuisineA LIMIT 8"""))

    section(f"3) '{args.a}' ↔ '{args.b}' 최단 연결 경로")
    table(q(c, gid, """
        MATCH p=(a:User {name:$a})-[*1..6]-(b:User {name:$b})
        RETURN length(p) AS hops, [n IN nodes(p) | coalesce(n.name, labels(n)[0])] AS path
        ORDER BY hops ASC LIMIT 1""", {"a": args.a, "b": args.b}))

    section(f"4) Jaccard 요리집합 유사도 '{args.a}' vs 다른 모든 사용자")
    table(q(c, gid, """
        MATCH (a:User {name:$a})-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(ca:Cuisine)
        WITH a, collect(DISTINCT ca.name) AS A
        MATCH (b:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(cb:Cuisine)
        WHERE b <> a
        WITH a, A, b, collect(DISTINCT cb.name) AS B
        WITH a, b, A, B, [x IN A WHERE x IN B] AS inter
        RETURN b.name AS otherUser, size(inter) AS shared,
               toFloat(size(inter))/(size(A)+size(B)-size(inter)) AS jaccard
        ORDER BY jaccard DESC LIMIT 5""", {"a": args.a}))

    section("5) PageRank 중심성 (Neptune Analytics 알고리즘) — 그래프 허브")
    q(c, gid, "CALL neptune.algo.pageRank.mutate({writeProperty:'pr', numOfIterations:20, dampingFactor:0.85}) YIELD success RETURN success")
    table(q(c, gid, """
        MATCH (n) WHERE n.pr IS NOT NULL
        RETURN labels(n)[0] AS type, coalesce(n.name,'?') AS name, n.pr AS pagerank
        ORDER BY pagerank DESC LIMIT 8"""))

    section("6) Louvain 커뮤니티 탐지 (Neptune Analytics 알고리즘) — 자동 사용자 세그먼트")
    q(c, gid, "CALL neptune.algo.louvain.mutate({writeProperty:'community', maxLevels:3}) YIELD success RETURN success")
    table(q(c, gid, """
        MATCH (u:User)
        RETURN u.community AS community, collect(u.name) AS members
        ORDER BY community"""))

if __name__ == "__main__":
    main()
