# Neptune Analytics — 음식 배달 사용자 프로파일링 데모

합성 음식 배달 **사용자 프로파일링** 그래프로 **Amazon Neptune Analytics**(openCypher)를 테스트하는
재현 가능한 저비용 예제입니다. AWS 자격증명이 있는 셸에서 전부 실행됩니다 — Neptune Analytics는
**HTTPS + SigV4** 데이터 API를 제공하므로 VPC/배스천이 필요 없습니다(VPC 전용인 Neptune *Database*와 대조).

> 처음이라면 → [`BEGINNER-GUIDE.md`](./BEGINNER-GUIDE.md)부터 읽으세요.

파일: [`schema.md`](./schema.md)(데이터 모델) · [`load_and_query.py`](./load_and_query.py)(적재 + 6개
프로파일링 쿼리) · [`advanced_queries.py`](./advanced_queries.py)(고급 6개) · [`BEGINNER-GUIDE.md`](./BEGINNER-GUIDE.md)(초보자 가이드) · [`IDEAS.md`](./IDEAS.md)(확장 아이디어 — 추천·프로파일).

## 할 수 있는 일 (무엇을 하나 → 결과)

실행하지 않고도 이 시스템의 **12가지 기능**을 한눈에 이해할 수 있도록 정리했습니다. 각 셀은
**기능**(무엇인지) · **무엇을 하나**(🔧 어떻게 동작 / 💡 비즈니스 활용) · **대표 결과**(📊 예시 / → 해석)
입니다. 결과는 동봉된 합성 데이터(User 8 · Order 27) 기준 실제 출력값입니다.

### 기본 프로파일링 — `load_and_query.py`

| 기능 | 무엇을 하나 | 대표 결과 → 해석 |
|---|---|---|
| **1) 드러난 요리 선호도**<br>(revealed affinity) | 🔧 `User→PLACED→Order→AT→Restaurant→SERVES→Cuisine` 경로를 따라 사용자×요리 주문 수를 집계<br>💡 *말이 아닌 행동*으로 취향을 파악 — 모든 프로파일의 1차 신호 | 📊 Jiwon=일식3·한식1, Minho=한식3·아메리칸1<br>→ 각 사용자의 최다 주문 요리가 '진짜 취향' |
| **2) 프로파일 카드** | 🔧 사용자별 주문을 집계해 최애 요리·총주문·총지출·식이 제한을 한 행으로 롤업<br>💡 한눈에 고객 이해 (대시보드·세일즈 카드), 지출순 정렬로 고가치 고객 식별 | 📊 Jiwon · 식이 제한 none · 일식 · 4건 · ₩99<br>→ 상위 지출 = 우선 관리 대상 |
| **3) 식당 추천** | 🔧 최애 요리 + 같은 `Region` + 아직 주문 안 한(`NOT PLACED`) 식당만 필터<br>💡 개인화 추천으로 재주문 유도 (취향+동네 동시 충족) | 📊 Jiwon→EdoSushi(일식·강남), Minho→SeoulGalbi<br>→ 이미 가본 곳은 자동 제외 |
| **4) 룩어라이크 사용자**<br>(look-alike) | 🔧 두 사용자가 같은 `Cuisine`에 도달하면 '공유'로 보고, **공유 요리 수로 유사도 점수화** (`a.userId < b.userId`로 중복 쌍 제거)<br>💡 유사 타겟 확장(lookalike audience)·협업 추천 seed·콜드스타트 — 자세히는 아래 **심화** 참고 | 📊 Jiwon↔Junseo · Soyeon↔Haeun **각 2** (최다)<br>→ shared 클수록 닮은꼴 → 캠페인 확장 |
| **5) 식이 제한 고려 추천** | 🔧 채식/비건 사용자에 한해 `Dish.vegetarian=true` & 미주문인 최애 요리 메뉴만 추천<br>💡 안전·규정 준수 — 잘못된(식이 제한 위반) 추천 방지 | 📊 Haeun(비건)→Bibimbap, Soyeon(채식)→VeggiePizza<br>→ 식이 제한 위반 0건 |
| **6) 말한 것 vs 실제**<br>(mismatch) | 🔧 선언 선호 `LIKES_CUISINE`와 실제 최다 주문 요리를 비교해 불일치 플래그<br>💡 '말 vs 행동' 격차 탐지 — **프로파일링의 핵심 가치** | 📊 7명 일치, **Daniel=MISMATCH** (선언 이탈리안 / 실제 멕시칸)<br>→ 선언보다 행동을 신뢰 |

### 고급 + 그래프 알고리즘 — `advanced_queries.py`

| 기능 | 무엇을 하나 | 대표 결과 → 해석 |
|---|---|---|
| **1) 협업 필터링(CF)** | 🔧 나와 식당을 공유하는 이웃(peer)을 찾고, 그 이웃이 가는 *내가 안 가본* 식당을 peer 수로 랭킹 (순수 openCypher)<br>💡 행동 기반 추천 — "비슷한 사람이 가는 곳" | 📊 Jiwon→BurgerWorks (peers=1)<br>→ SeoulBBQ를 공유한 Minho를 경유해 발견 |
| **2) 요리 동시출현** | 🔧 같은 사용자의 요리쌍을 self-join해 동시 주문 사용자 수 집계 (장바구니 분석)<br>💡 크로스셀('A를 좋아하면 B도'), 번들·메뉴 구성 | 📊 Italian+Korean(2), Japanese+Korean(2)<br>→ **한식이 연결 허브** (대부분 요리와 함께 등장) |
| **3) 최단 경로** | 🔧 두 사용자 사이를 가변 길이 `[*1..6]`로 탐색해 최단 연결 경로 반환<br>💡 설명가능성('왜 추천?'), 관계 발견, 콜드스타트 브리징 | 📊 Jiwon↔Tae=6 hops (Gangnam→BurgerWorks→Daniel→Mapo)<br>→ 직접 공통점 없음 = 비유사 |
| **4) Jaccard 유사도** | 🔧 두 사용자 요리집합의 `교집합 크기 ÷ 합집합 크기`를 0~1로 계산해 이웃 랭킹<br>💡 룩어라이크 오디언스, 협업 추천의 유사도 점수 | 📊 Jiwon↔Junseo=1.00 (취향 동일), Daniel=0.00<br>→ 1에 가까울수록 닮은꼴 |
| **5) PageRank 허브** | 🔧 Neptune Analytics 내장 PageRank(damping 0.85)로 전체 그래프 중심성 계산 → `pr` 속성 기록<br>💡 핵심 카테고리·영향력 식별 (허브 노드) | 📊 Korean(0.073) > Japanese > Italian<br>→ 모든 식당·메뉴가 요리로 수렴 → Cuisine이 허브 |
| **6) Louvain 세그먼트** | 🔧 Neptune Analytics 내장 Louvain으로 라벨·k 없이 사용자를 자동 군집 → `community` 기록<br>💡 자동 세그먼테이션·페르소나 발견 | 📊 {Jiwon,Junseo}=일식, {Tae,Soyeon}=이탈리안<br>→ 요리를 알려주지 않았는데 요리 기반 세그먼트 복원 |

> 🔧 = 어떻게 동작하나(기법) · 💡 = 비즈니스 활용 · 📊 = 예시 결과 · → = 해석.
> 스크립트를 실행하면 각 기능마다 `▸ 무엇을 하나:` 설명과 위 결과 테이블이 함께 출력됩니다.

### 🔍 심화: 4) 룩어라이크 사용자 (Look-alike Users) — 자세히

**정의 (What).** 룩어라이크(look-alike)는 기준 사용자와 *취향이 닮은* 다른 사용자입니다. 여기서는
"같은 요리(`Cuisine`)를 주문한 적이 있는 사용자 쌍"을 닮은 정도로 봅니다 — 광고의 *유사 타겟
(lookalike audience)* 과 같은 개념. (영어로는 **"users with similar taste"**.)

**🔧 동작 방식 (How it works).**
1. 두 사용자 `a`, `b`가 각각 `User→PLACED→Order→AT→Restaurant→SERVES→Cuisine` 경로로 **같은 요리 `c`** 에 도달하면 "그 요리를 공유"로 판정 (식당은 달라도 됨).
2. `a.userId < b.userId` 로 (A,B)=(B,A) 중복 쌍과 자기 자신 쌍을 제거.
3. `count(DISTINCT c)` = 공유 요리 수(= 유사도 점수), `collect(c.name)` = 어떤 요리인지.

```cypher
MATCH (a:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
MATCH (b:User)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c)
WHERE a.userId < b.userId
RETURN a.name AS userA, b.name AS userB,
       count(DISTINCT c) AS sharedCuisines, collect(DISTINCT c.name) AS cuisines
ORDER BY sharedCuisines DESC, userA LIMIT 8
```

**💡 비즈니스 활용 (Why it matters).**
- **유사 타겟 확장** (lookalike audience): seed 1명에게 통한 캠페인을 닮은꼴 N명으로 확장.
- **협업 추천 seed**: "닮은 사용자가 좋아한 것"을 추천 — 고급 #1 협업 필터링으로 연결.
- **콜드스타트**: 주문 이력이 적은 신규 사용자도 닮은꼴을 통해 초기 추천 가능.

**📊 결과 & 해석 (Result, 실제 출력).**

| userA | userB | sharedCuisines | cuisines |
|---|---|---|---|
| Jiwon | Junseo | **2** | Korean, Japanese |
| Soyeon | Haeun | **2** | Korean, Italian |
| Daniel | Yuna | 1 | Mexican |
| … | … | 1 | … |

→ `sharedCuisines`가 클수록 더 닮은꼴. **Jiwon·Junseo**(일식+한식), **Soyeon·Haeun**(한식+이탈리안)이
가장 닮은 쌍 → 한쪽에 통한 프로모션을 다른 쪽에 확장하기 좋은 후보.

**⚖️ 한계 & 발전 (Limitations → next step).**
- 단순 공유 *개수*라 **강도(주문 빈도)와 집합 크기를 무시** — 5번 주문한 요리와 1번 주문한 요리가 동급.
- 정규화하려면 → **Jaccard 유사도(고급 #4)**: `교집합÷합집합`으로 0~1 점수화. 더 정밀하게는
  **임베딩 KNN**(빈도 + 의미적 근접까지 반영) — whchoi 데모의 `Cohere embed-v4 KNN` 단계와 동일.

**🔗 연계 (Related).** 기본 #3 식당 추천 · 고급 #1 협업 필터링 · 고급 #4 Jaccard 와 묶으면
"닮은꼴 발견 → 추천"의 완결 파이프라인이 됩니다.

### 🔍 심화: 6) 말한 것 vs 실제 (Stated vs Revealed) — 자세히

**한 줄로:** 사용자가 *"나 이거 좋아해"* 라고 **말한 것**과, 주문 기록에서 드러나는 **실제로 하는 것**이
다른지 잡아내는 기능. (영어로 **stated vs revealed preference**.)

**비유 (analogy).** 헬스장 등록만 해놓고 안 가는 것처럼, 말과 행동은 자주 어긋납니다. 누군가
*"난 이탈리안 좋아해"* 라고 했지만 실제로는 매번 멕시칸을 시킨다면 — 그 사람의 진짜 취향은 멕시칸입니다.

**🔧 동작 방식 (How it works) — 3단계.**
1. **말한 선호 (stated)** 가져오기: `User -[:LIKES_CUISINE]-> Cuisine` (가입·설문에서 선택한 값).
2. **실제 선호 (revealed)** 계산: 주문을 요리별로 세어 *가장 많이 주문한 요리*를 고름.
3. **비교**: 둘이 같으면 `aligned`(일치), 다르면 `MISMATCH`(불일치).

```cypher
MATCH (u:User)-[:LIKES_CUISINE]->(s:Cuisine)                 -- ① 말한 선호 s
OPTIONAL MATCH (u)-[:PLACED]->(:Order)-[:AT]->(:Restaurant)-[:SERVES]->(c:Cuisine)
WITH u, s, c, count(c) AS n ORDER BY n DESC                  -- ② 요리별 주문 수
WITH u, s, collect(c.name)[0] AS revealed                    --   최다 = 실제 선호
RETURN u.name, s.name AS stated, revealed,                   -- ③ 비교
       CASE WHEN s.name = revealed THEN 'aligned' ELSE 'MISMATCH' END AS signal
```

**📊 결과 (Result, 실제 출력).** 8명 중 7명 일치, **Daniel 1명만 불일치**:

| user | 말함 (stated) | 실제 (revealed) | signal |
|---|---|---|---|
| **Daniel** | Italian | **Mexican** | ⚠ **MISMATCH** |
| Jiwon · Junseo · Minho · Haeun · Soyeon · Tae · Yuna | (각자) | (말한 것과 같음) | aligned |

**Daniel 한 명만 따라가 보기 (walk-through).**
- 말한 것: `Daniel -[:LIKES_CUISINE]-> Italian` → *"난 이탈리안 좋아해"*
- 실제 한 것: 주문 3건 = TacoMaria(멕시칸)×2 + BurgerWorks(아메리칸)×1 → **최다 = 멕시칸**
- 비교: 말함 `Italian` ≠ 실제 `Mexican` → **MISMATCH** ⚠

```
Daniel ──LIKES_CUISINE (말함)──▶ Italian    ← 실제 주문 0건 ❗ (선언만 있고 행동 없음)
Daniel ──주문 행동 (실제)──────▶ Mexican ×2  ← 진짜 취향 ✅
```

**💡 왜 중요한가 (Why it matters).**
- 말(가입·설문 선택)은 **오래됐거나 희망사항**일 수 있습니다. **행동이 진실**에 가깝습니다.
- `MISMATCH` = "이 프로파일은 갱신이 필요하다"는 신호. Daniel에겐 이탈리안 쿠폰이 아니라 **멕시칸 추천**을 보내야 함.
- 바로 이 **"말 vs 행동 격차"를 잡는 것**이 사용자 프로파일링이 존재하는 핵심 이유입니다.

**⚖️ 주의 (Notes).** 주문이 충분해야 '실제'가 신뢰됩니다(주문 1건이면 단정 금물). 동률이면 임의 1위가
뽑힙니다. 본 데모는 합성 데이터로, Daniel만 일부러 불일치로 심어 두었습니다(나머지 7명은 일치).

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
식이 제한 고려 추천 · **말한 것 vs 실제(mismatch)**.

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
