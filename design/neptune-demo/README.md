# Neptune Analytics — 음식 배달 사용자 프로파일링 데모

합성 음식 배달 **사용자 프로파일링** 그래프로 **Amazon Neptune Analytics**(openCypher)를 테스트하는
재현 가능한 저비용 예제입니다. AWS 자격증명이 있는 셸에서 전부 실행됩니다 — Neptune Analytics는
**HTTPS + SigV4** 데이터 API를 제공하므로 VPC/배스천이 필요 없습니다(VPC 전용인 Neptune *Database*와 대조).

> 처음이라면 → [`BEGINNER-GUIDE.md`](./BEGINNER-GUIDE.md)부터 읽으세요.

파일: [`schema.md`](./schema.md)(데이터 모델) · [`load_and_query.py`](./load_and_query.py)(적재 + 6개
프로파일링 쿼리) · [`advanced_queries.py`](./advanced_queries.py)(고급 6개) · [`BEGINNER-GUIDE.md`](./BEGINNER-GUIDE.md)(초보자 가이드).

## 1. 그래프 생성 (AVAILABLE까지 약 3~5분)

```bash
aws neptune-graph create-graph \
  --graph-name fooddelivery-profiling-demo \
  --provisioned-memory 16 --replica-count 0 \
  --public-connectivity --no-deletion-protection \
  --region us-east-1
# 반환된 "id" 기록: g-xxxxxxxxxx
aws neptune-graph get-graph --graph-identifier g-xxxxxxxxxx \
  --region us-east-1 --query status   # "AVAILABLE" 될 때까지 대기
```

## 2. 데이터 적재 + 프로파일링 쿼리 실행

```bash
pip install boto3   # 필요 시
python3 load_and_query.py g-xxxxxxxxxx --region us-east-1 --reset
```

노드 카운트 출력 후 6개 쿼리 실행: 드러난 요리 선호도 · 프로파일 카드 · 식당 추천 · 룩어라이크 ·
식이 고려 추천 · **말한 것 vs 실제(mismatch)**.

## 3. 단발성 쿼리 (데이터 API로 openCypher)

```bash
aws neptune-graph execute-query \
  --graph-identifier g-xxxxxxxxxx --language open_cypher \
  --query-string "MATCH (u:User)-[:LIVES_IN]->(r:Region) RETURN u.name, r.name" \
  --region us-east-1 /dev/stdout
```

> 팁: 터미널에서는 Cypher의 `->`·`*` 때문에 **반드시 따옴표 안에** 넣어 `--query-string`으로 전달하세요.
> 셸 단축키:
> ```bash
> ncq() { local o; o=$(mktemp); aws neptune-graph execute-query --region us-east-1 \
>   --graph-identifier g-xxxxxxxxxx --language open_cypher --query-string "$1" "$o" >/dev/null \
>   && python3 -m json.tool "$o"; rm -f "$o"; }
> ```

## 고급 쿼리 & 그래프 알고리즘

고급 예제 6개 실행(데이터가 이미 적재되어 있어야 함):

```bash
python3 advanced_queries.py g-xxxxxxxxxx --region us-east-1 --a Jiwon --b Tae
```

| # | 예제 | 기법 |
|---|---|---|
| 1 | 협업 필터링 식당 추천 | 이웃(peer) 중첩 → 미경험 식당 (순수 openCypher) |
| 2 | 요리 동시출현 | 장바구니 분석 "X면 Y도" |
| 3 | 두 사용자 간 최단 경로 | 가변 길이 경로 `[*1..6]` |
| 4 | Jaccard 요리집합 유사도 | 리스트 컴프리헨션 + `size()` 집합 연산 |
| 5 | **PageRank** 중심성(허브) | `CALL neptune.algo.pageRank.mutate(...)` |
| 6 | **Louvain** 커뮤니티 탐지(자동 세그먼트) | `CALL neptune.algo.louvain.mutate(...)` |

> #5·#6은 **Neptune Analytics 내장 알고리즘**으로 노드 속성(`pr`, `community`)을 **기록**합니다 —
> 평범한 그래프 DB와 구별되는 분석 엔진의 차별점입니다. 데모 그래프를 변경하며(재실행 시 덮어씀),
> `ncq "…"` / Workbench에 붙여넣을 raw Cypher:

```cypher
-- 5. PageRank: 계산 후 상위 허브 조회
CALL neptune.algo.pageRank.mutate({writeProperty:'pr', numOfIterations:20, dampingFactor:0.85}) YIELD success RETURN success;
MATCH (n) WHERE n.pr IS NOT NULL
RETURN labels(n)[0] AS type, coalesce(n.name,'?') AS name, n.pr ORDER BY n.pr DESC LIMIT 8

-- 6. Louvain: 커뮤니티 탐지 후 사용자 세그먼트 조회
CALL neptune.algo.louvain.mutate({writeProperty:'community', maxLevels:3}) YIELD success RETURN success;
MATCH (u:User) RETURN u.community AS community, collect(u.name) AS members ORDER BY community
```

## 4. 정리 (과금 중단)

```bash
aws neptune-graph delete-graph --graph-identifier g-xxxxxxxxxx \
  --skip-snapshot --region us-east-1
```

> Neptune Analytics는 그래프가 존재하는 동안 provisioned memory에 대해 **초 단위로 과금**됩니다.
> 끝나면 삭제하세요. 이 폴더의 스크립트가 몇 분 만에 처음부터 다시 만들어 줍니다.
