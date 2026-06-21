#!/usr/bin/env python3
"""
합성 음식 배달 사용자 프로파일링 그래프를 Amazon Neptune Analytics(openCypher)에
적재하고 프로파일링 쿼리를 실행한다.

사용법:
    python3 load_and_query.py <graph-id> [--region us-east-1] [--reset]

요구사항: boto3, 해당 그래프에 neptune-graph:* 권한이 있는 유효한 AWS 자격증명.
그래프 데이터 API는 HTTPS + SigV4(VPC 불필요); 그래프는 --public-connectivity로
생성되어 있어야 한다.
"""
import sys, json, argparse
import boto3

# ----------------------------- synthetic dataset -----------------------------
CUISINES = [("korean","Korean"),("japanese","Japanese"),("italian","Italian"),
            ("mexican","Mexican"),("indian","Indian"),("american","American")]
REGIONS  = [("gangnam","Gangnam"),("mapo","Mapo"),("songpa","Songpa")]

USERS = [  # id, name, ageBand, diet, region
    ("u1","Jiwon","20s","none","gangnam"),
    ("u2","Minho","30s","none","gangnam"),
    ("u3","Soyeon","20s","vegetarian","mapo"),
    ("u4","Daniel","40s","none","mapo"),
    ("u5","Haeun","30s","vegan","mapo"),
    ("u6","Junseo","20s","none","gangnam"),
    ("u7","Yuna","30s","halal","songpa"),
    ("u8","Tae","40s","none","mapo"),
]
RESTAURANTS = [  # id, name, cuisine, region, priceTier, rating
    ("r1","SeoulBBQ","korean","gangnam","$$",4.6),
    ("r2","SushiHan","japanese","gangnam","$$$",4.8),
    ("r3","PastaLab","italian","mapo","$$",4.3),
    ("r4","TacoMaria","mexican","mapo","$",4.1),
    ("r5","CurryHouse","indian","songpa","$$",4.5),
    ("r6","BurgerWorks","american","gangnam","$",4.0),
    ("r7","GreenBowl","korean","mapo","$$",4.4),
    ("r8","RamenYa","japanese","songpa","$",4.2),
    ("r9","EdoSushi","japanese","gangnam","$$",4.5),
    ("r10","SeoulGalbi","korean","gangnam","$$",4.4),
    ("r11","ElToro","mexican","mapo","$",4.2),
]
DISHES = [  # id, name, cuisine, vegetarian, spicy
    ("d1","Bulgogi","korean",False,False),("d2","Bibimbap","korean",True,True),
    ("d3","KimchiStew","korean",False,True),("d4","SalmonNigiri","japanese",False,False),
    ("d5","VeggieRoll","japanese",True,False),("d6","TonkotsuRamen","japanese",False,False),
    ("d7","Margherita","italian",True,False),("d8","Carbonara","italian",False,False),
    ("d9","VeggieTaco","mexican",True,True),("d10","BeefBurrito","mexican",False,True),
    ("d11","PaneerCurry","indian",True,True),("d12","ChickenTikka","indian",False,True),
    ("d13","Cheeseburger","american",False,False),("d14","VeggieBurger","american",True,False),
    ("d15","TofuBibimbap","korean",True,False),("d16","AvocadoRoll","japanese",True,False),
    ("d17","VeggiePizza","italian",True,False),
]
ORDERS = [  # id, user, restaurant, total, [dishes]
    ("o1","u1","r2",38,["d4","d5"]),("o2","u1","r2",25,["d4"]),("o3","u1","r8",14,["d6"]),("o4","u1","r1",22,["d1"]),
    ("o5","u2","r1",30,["d1","d3"]),("o6","u2","r1",18,["d2"]),("o7","u2","r1",26,["d1"]),("o8","u2","r6",12,["d13"]),
    ("o9","u3","r3",16,["d7"]),("o10","u3","r7",15,["d15"]),("o11","u3","r4",11,["d9"]),("o27","u3","r3",13,["d7"]),
    ("o12","u4","r4",20,["d10"]),("o13","u4","r4",18,["d10","d9"]),("o14","u4","r6",13,["d13"]),
    ("o15","u5","r7",17,["d15"]),("o16","u5","r7",16,["d15"]),("o17","u5","r3",14,["d7"]),
    ("o18","u6","r2",33,["d4"]),("o19","u6","r2",28,["d16"]),("o20","u6","r1",19,["d2"]),
    ("o21","u7","r5",24,["d12"]),("o22","u7","r5",22,["d11","d12"]),("o23","u7","r4",12,["d10"]),
    ("o24","u8","r3",28,["d8"]),("o25","u8","r3",24,["d7"]),("o26","u8","r3",20,["d8"]),
]
LIKES = [  # user, cuisine  (STATED preference)
    ("u1","japanese"),("u2","korean"),("u3","italian"),("u4","italian"),  # u4 = stated italian, behaves mexican
    ("u5","korean"),("u6","japanese"),("u7","indian"),("u8","italian"),
]

# ------------------------------- query helpers -------------------------------
def q(client, gid, cypher, params=None):
    kw = dict(graphIdentifier=gid, queryString=cypher, language="OPEN_CYPHER")
    if params is not None:
        kw["parameters"] = json.loads(json.dumps(params))  # tuples -> JSON lists
    resp = client.execute_query(**kw)
    return json.loads(resp["payload"].read())["results"]

def load(client, gid):
    print("노드 적재 중 …")
    q(client, gid, "UNWIND $r AS x MERGE (n:Cuisine {cuisineId:x[0]}) SET n.name=x[1]", {"r":CUISINES})
    q(client, gid, "UNWIND $r AS x MERGE (n:Region {regionId:x[0]}) SET n.name=x[1]", {"r":REGIONS})
    q(client, gid, "UNWIND $r AS x MERGE (n:User {userId:x[0]}) SET n.name=x[1], n.ageBand=x[2], n.diet=x[3]", {"r":USERS})
    q(client, gid, "UNWIND $r AS x MERGE (n:Restaurant {restId:x[0]}) SET n.name=x[1], n.priceTier=x[4], n.rating=x[5]", {"r":RESTAURANTS})
    q(client, gid, "UNWIND $r AS x MERGE (n:Dish {dishId:x[0]}) SET n.name=x[1], n.vegetarian=x[3], n.spicy=x[4]", {"r":DISHES})
    q(client, gid, "UNWIND $r AS x MERGE (n:Order {orderId:x[0]}) SET n.total=x[3]", {"r":ORDERS})

    print("엣지 적재 중 …")
    q(client, gid, "UNWIND $r AS x MATCH (a:Restaurant {restId:x[0]}),(b:Cuisine {cuisineId:x[2]}) MERGE (a)-[:SERVES]->(b)", {"r":RESTAURANTS})
    q(client, gid, "UNWIND $r AS x MATCH (a:Restaurant {restId:x[0]}),(b:Region {regionId:x[3]}) MERGE (a)-[:LOCATED_IN]->(b)", {"r":RESTAURANTS})
    q(client, gid, "UNWIND $r AS x MATCH (a:Dish {dishId:x[0]}),(b:Cuisine {cuisineId:x[2]}) MERGE (a)-[:OF_CUISINE]->(b)", {"r":DISHES})
    q(client, gid, "UNWIND $r AS x MATCH (a:User {userId:x[0]}),(b:Region {regionId:x[4]}) MERGE (a)-[:LIVES_IN]->(b)", {"r":USERS})
    q(client, gid, "UNWIND $r AS x MATCH (u:User {userId:x[1]}),(o:Order {orderId:x[0]}) MERGE (u)-[:PLACED]->(o)", {"r":ORDERS})
    q(client, gid, "UNWIND $r AS x MATCH (o:Order {orderId:x[0]}),(rest:Restaurant {restId:x[2]}) MERGE (o)-[:AT]->(rest)", {"r":ORDERS})
    contains = [[o[0], d] for o in ORDERS for d in o[4]]
    q(client, gid, "UNWIND $r AS x MATCH (o:Order {orderId:x[0]}),(d:Dish {dishId:x[1]}) MERGE (o)-[:CONTAINS]->(d)", {"r":contains})
    q(client, gid, "UNWIND $r AS x MATCH (u:User {userId:x[0]}),(c:Cuisine {cuisineId:x[1]}) MERGE (u)-[:LIKES_CUISINE]->(c)", {"r":LIKES})

    counts = q(client, gid, "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC")
    print("적재된 노드 수:", {r["label"]: r["n"] for r in counts})

QUERIES = [
    ("1) 드러난 요리 선호도 (사용자 × 요리 주문 수)",
     "각 사용자가 실제 주문에서 어떤 요리를 얼마나 주문했는지 집계 — 행동 기반 취향 파악.",
     """MATCH (u:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
        RETURN u.name AS user, c.name AS cuisine, count(*) AS orders
        ORDER BY user, orders DESC"""),

    ("2) 프로파일 카드 (최애 요리·주문 수·총지출·식이 제한)",
     "사용자별 한 줄 요약을 자동 생성 — 한눈에 고객을 이해.",
     """MATCH (u:User)-[:PLACED]->(o:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
        WITH u, c, count(*) AS cnt, sum(o.total) AS spend
        ORDER BY cnt DESC
        WITH u, collect(c.name)[0] AS favCuisine, sum(cnt) AS totalOrders, sum(spend) AS totalSpend
        RETURN u.name AS user, u.diet AS diet, favCuisine, totalOrders, totalSpend
        ORDER BY totalSpend DESC"""),

    ("3) 식당 추천 (최애 요리·같은 지역·미주문)",
     "최애 요리·같은 지역·아직 안 가본 식당을 추천 — 개인화로 다음 주문 유도.",
     """MATCH (u:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
        WITH u, c, count(*) AS aff ORDER BY aff DESC
        WITH u, collect(c)[0] AS fav
        MATCH (u)-[:LIVES_IN]->(reg:Region)
        MATCH (rec:Restaurant)-[:SERVES]->(fav), (rec)-[:LOCATED_IN]->(reg)
        WHERE NOT (u)-[:PLACED]->(:Order)-[:AT]->(rec)
        RETURN u.name AS user, fav.name AS favCuisine, reg.name AS region,
               collect(rec.name) AS recommend
        ORDER BY user"""),

    ("4) 룩어라이크 사용자 (공동 주문으로 공유된 요리)",
     "요리가 겹치는 사용자 쌍을 찾음 — 타겟 확장·협업 추천의 기반.",
     """MATCH (a:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
        MATCH (b:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c)
        WHERE a.userId < b.userId
        RETURN a.name AS userA, b.name AS userB, count(DISTINCT c) AS sharedCuisines,
               collect(DISTINCT c.name) AS cuisines
        ORDER BY sharedCuisines DESC, userA LIMIT 8"""),

    ("5) 식이 제한 고려 메뉴 추천 (채식/비건: 최애 요리의 미경험 채식 메뉴)",
     "채식/비건 사용자에게 안전한(채식) 메뉴만 추천 — 안전·규정 준수.",
     """MATCH (u:User) WHERE u.diet IN ['vegetarian','vegan']
        MATCH (u)-[:PLACED]->(:Order)-[:CONTAINS]->(:Dish)-[:OF_CUISINE]->(c:Cuisine)
        WITH u, c, count(*) AS aff ORDER BY aff DESC
        WITH u, collect(c)[0] AS favC
        MATCH (d:Dish)-[:OF_CUISINE]->(favC)
        WHERE d.vegetarian = true AND NOT (u)-[:PLACED]->(:Order)-[:CONTAINS]->(d)
        RETURN u.name AS user, u.diet AS diet, favC.name AS favCuisine,
               collect(DISTINCT d.name) AS recommendVegDishes
        ORDER BY user"""),

    ("6) 말한 것 vs 실제 선호 (프로파일링 mismatch 신호)",
     "선언한 선호(LIKES_CUISINE)와 실제 주문을 비교해 불일치 탐지 — '말 vs 행동' 핵심 신호.",
     """MATCH (u:User)-[:LIKES_CUISINE]->(stated:Cuisine)
        OPTIONAL MATCH (u)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
        WITH u, stated, c, count(c) AS cnt ORDER BY cnt DESC
        WITH u, stated, collect(c.name)[0] AS revealed
        RETURN u.name AS user, stated.name AS stated, revealed AS revealed,
               CASE WHEN stated.name = revealed THEN 'aligned' ELSE 'MISMATCH' END AS signal
        ORDER BY signal DESC, user"""),
]

def print_table(rows):
    if not rows:
        print("   (no rows)"); return
    cols = list(rows[0].keys())
    def cell(v): return ", ".join(map(str, v)) if isinstance(v, list) else str(v)
    widths = {c: max(len(c), *(len(cell(r.get(c,""))) for r in rows)) for c in cols}
    print("   " + " | ".join(c.ljust(widths[c]) for c in cols))
    print("   " + "-+-".join("-"*widths[c] for c in cols))
    for r in rows:
        print("   " + " | ".join(cell(r.get(c,"")).ljust(widths[c]) for c in cols))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph_id")
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--reset", action="store_true", help="delete all data before loading")
    ap.add_argument("--skip-load", action="store_true")
    args = ap.parse_args()

    client = boto3.client("neptune-graph", region_name=args.region)
    gid = args.graph_id

    if args.reset:
        print("그래프 초기화 중 (DETACH DELETE all) …")
        q(client, gid, "MATCH (n) DETACH DELETE n")
    if not args.skip_load:
        load(client, gid)

    print("\n" + "="*78 + "\n사용자 프로파일링 쿼리\n" + "="*78)
    print("이 데모가 보여주는 것:")
    print("  1) 드러난 요리 선호도  2) 프로파일 카드   3) 식당 추천")
    print("  4) 룩어라이크 사용자   5) 식이 제한 고려 추천  6) 말한 것 vs 실제(mismatch)")
    for title, desc, cypher in QUERIES:
        print("\n### " + title)
        print("   ▸ 무엇을 하나: " + desc)
        print_table(q(client, gid, cypher))

if __name__ == "__main__":
    main()
