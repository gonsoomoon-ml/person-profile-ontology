# 초보자 가이드 — 우리가 AWS Neptune으로 한 일

**Amazon Neptune**을 작은 음식 배달 **사용자 프로파일링(user profiling)** 예제로 테스트해 본 과정을
쉬운 말로 정리했습니다. 그래프 데이터베이스 경험이 전혀 없어도 읽을 수 있게 썼습니다.

---

## 1. 목표 (한 문장)

음식 배달 활동 데이터("누가·무엇을·어디서 주문했는가")를 **그래프 데이터베이스**에 넣으면, 그것을
쓸모 있는 **고객 프로파일**("이 사람은 사실 강남에 사는 일식 애호가")로 바꿀 수 있는지 확인하고
싶었습니다. 그리고 종이 위 이론이 아니라 **실제 AWS에서** 돌려 보고 싶었습니다.

---

## 2. 먼저 알아야 할 5가지 개념

**그래프 데이터베이스란?**
보통의 (SQL) 데이터베이스는 데이터를 표(행·열)로 저장합니다. **그래프** 데이터베이스는 데이터를
**점과 점을 잇는 선**으로 저장합니다:
- **노드(Node)** = 사물 하나 (User, Restaurant, Dish). "라벨이 붙은 점"이라고 생각하세요.
- **엣지(Edge)** = 두 사물 사이의 관계 (User `PLACED` Order, Order `AT` Restaurant). "라벨이 붙은 화살표".
- **속성(Property)** = 노드나 엣지에 붙은 정보 (User의 `name`, Restaurant의 `rating`).

**왜 프로파일링에 그래프가 좋은가?**
프로파일링은 결국 *연결*에 관한 것입니다 — "이 사람은 어떤 식당을 통해, 어느 동네에서, 어떤 요리를
실제로 주문하는가?" 그래프에서는 복잡한 다중 테이블 JOIN 대신 **화살표를 따라가기만** 하면 답이 나옵니다.

**openCypher** = 그래프에 질문할 때 쓰는 쿼리 언어. 생김새가 ASCII 그림 같습니다:
`(a)-[:LIKES]->(b)`는 "노드 a에서 LIKES 화살표로 노드 b로"라는 뜻입니다. 찾고 싶은 *모양*을
묘사하면 DB가 일치하는 것을 모두 찾아 줍니다.

**Neptune Database vs Neptune Analytics** (AWS에는 두 종류가 있습니다):
- *Neptune Database* — 사설 네트워크(VPC) 안에 있어, 추가 설정 없이는 내 노트북에서 접근 불가.
- *Neptune Analytics* — 일반 인터넷(HTTPS) 주소가 있어 AWS 로그인만으로 호출 가능하고, **PageRank
  같은 그래프 *알고리즘*이 내장**되어 있습니다. **우리는 이것을 선택**했습니다 — 빠른 테스트에 더 간단하고 강력하니까요.

**합성 데이터(Synthetic data)** = 실제 같지만 우리가 지어낸 가짜 데이터(실제 고객 아님). 데모에 안전합니다.

---

## 3. 우리가 만든 것 — 음식 배달 그래프

노드 6종, 관계 8종:

```
 ┌────────┐  PLACED   ┌────────┐    AT    ┌────────────┐  SERVES  ┌──────────┐
 │  User  │ ────────▶ │ Order  │ ───────▶ │ Restaurant │ ───────▶ │ Cuisine  │
 │  (8)   │           │ (27)   │          │   (11)     │          │  (6)     │
 └────────┘           └───┬────┘          └────────────┘          └──────────┘
                          │ CONTAINS     ┌────────┐   OF_CUISINE        ▲
                          └────────────▶ │  Dish  │ ────────────────────┘
                                         │  (17)  │
                                         └────────┘
   User ──LIVES_IN──▶ Region (3) ◀──LOCATED_IN── Restaurant
   User ┄┄LIKES_CUISINE┄┄▶ Cuisine     (사용자가 "좋아한다고 말한" 선호 — stated)
```

쉬운 말로: **User가 Order를 PLACE(주문)** 하고, 각 **Order는 Restaurant에 AT(에서)** 이며
**Dish를 CONTAINS(포함)** 합니다. 각 식당은 **Cuisine을 SERVES(제공)** 하고 **Region에
LOCATED_IN(위치)** 합니다. 별도로, 사용자는 자신이 좋아한다고 **말한** 요리를 `LIKES_CUISINE`로
표시할 수 있습니다. 전체 데이터는 [`load_and_query.py`](./load_and_query.py)에, 모델은
[`schema.md`](./schema.md)에 있습니다.

---

## 4. 우리가 실행한 3단계

**1단계 — 그래프 생성** (AWS에 빈 DB를 만듦, 시작까지 약 3~5분):
```bash
aws neptune-graph create-graph \
  --graph-name fooddelivery-profiling-demo \
  --provisioned-memory 16 --replica-count 0 \
  --public-connectivity --no-deletion-protection --region us-east-1
```
AWS가 id를 부여했습니다: **`g-ot7ri78aa2`**. 이 id로 그래프와 통신합니다.

**2단계 — 예제 데이터 적재** (Python 스크립트가 빈 그래프를 점·화살표로 채움):
```bash
python3 load_and_query.py g-ot7ri78aa2 --region us-east-1 --reset
```

**3단계 — 질문하기** (openCypher 쿼리 실행). 우리가 쓴 3가지 방법:
1. 스크립트 내장 쿼리(가장 쉬움): `python3 load_and_query.py g-ot7ri78aa2 --skip-load`
2. 터미널에서 한 번씩:
   ```bash
   aws neptune-graph execute-query --region us-east-1 \
     --graph-identifier g-ot7ri78aa2 --language open_cypher \
     --query-string "MATCH (u:User) RETURN u.name" /tmp/out.json && python3 -m json.tool /tmp/out.json
   ```
3. 우리가 만든 짧은 셸 단축키 `ncq "…"` — 쿼리만 입력하면 됨.

---

## 5. 우리가 던진 질문들 (각각 무슨 의미인지)

**기본 프로파일링 (6개):**
| 쿼리 | 쉬운 말로, 무엇을 묻는가 |
|---|---|
| 드러난 요리 선호도 | "각 사람이 실제로 어떤 요리를, 얼마나 자주 주문하나?" |
| 프로파일 카드 | "사용자별 한 줄 요약: 최애 요리·주문 수·지출·식이 제한." |
| 식당 추천 | "최애 요리이면서, 같은 동네이고, 아직 안 가 본 식당 추천." |
| 룩어라이크 사용자 | "취향이 비슷한 사용자는 누구?" |
| 식이 제한 고려 추천 | "채식/비건에게 최애 요리의 채식 메뉴 추천." |
| **말한 것 vs 실제** | "좋아한다고 *말한* 것이 *실제* 주문과 일치하나?" |

**고급 (6개):**
| 쿼리 | 쉬운 말로, 무엇을 묻는가 |
|---|---|
| 협업 필터링(CF) | "당신이 가는 식당에 가는 사람들이 또 좋아하는 곳은?" |
| 요리 동시출현 | "같은 사람이 함께 주문하는 요리 조합은?" |
| 최단 경로 | "두 사용자가 데이터상 어떻게 연결되나?" |
| Jaccard 유사도 | "두 사용자 취향이 얼마나 비슷한지 0~1 점수." |
| **PageRank** | "가장 중심이 되는 *허브* 노드는?" (내장 알고리즘) |
| **Louvain** | "사용자를 취향 기반 세그먼트로 자동 분할." (내장 알고리즘) |

**💼 비즈니스로 묶으면 — 이 쿼리들이 주는 것:**
- 🎯 개인화 추천(취향+동네) · 🆕 신규 고객 콜드스타트(룩어라이크·최단 경로)
- 🛡️ 식이 제한 안전 추천 · 💬 "왜 추천?" 설명(경로)
- 👤 프로파일 카드·고가치 고객 · 📣 자동 세그먼트(Louvain)·룩어라이크 확장 · 🧺 크로스셀(요리 동시출현·CF)

---

## 6. 두 가지 "아하" 발견

1. **말한 것 ≠ 실제.** *Daniel*은 이탈리안을 좋아한다고 **말했지만**(`LIKES_CUISINE→Italian`)
   주문은 전부 **멕시칸/아메리칸**이었습니다. 그래프가 이 불일치를 자동으로 잡아냈습니다. 행동
   기반 프로파일링의 힘을 보여주는 장면입니다 — 말이 아니라 *행동*을 믿어라. (단, 이는 여러 신호 중 하나이고, 시스템의 핵심은 graph/feature-store/OLAP 3층 구조다.)
2. **Cuisine이 허브.** PageRank 결과 `Cuisine` 노드(Korean 1위)가 가장 중심이었습니다. 모든 식당과
   메뉴가 요리를 가리키기 때문입니다. 그리고 Louvain은 요리의 존재를 **알려주지 않았는데도**
   사용자를 요리 기반 세그먼트로 다시 묶어 냈습니다 — 구조를 스스로 찾아낸 것이죠.

---

## 7. 초보자가 겪은 함정 (당신은 피하도록)

- **`$` 프롬프트에 raw Cypher를 그대로 붙여넣으면 안 됩니다.** 터미널은 *셸*이라 `(`, `->`, `*`를
  자기 특수문자로 해석합니다. Cypher는 반드시 **따옴표 안에** 넣어 `aws … --query-string "…"`(또는
  `ncq` 헬퍼, Python 스크립트)의 인자로 전달해야 합니다.
- **Neptune Database는 사설 네트워크에 숨어 있습니다.** 터미널에서 HTTPS로 바로 접근하려고
  일부러 **Neptune Analytics**를 선택했습니다.
- **작은 Python 함정:** 쿼리에 데이터를 넘길 때 AWS 라이브러리는 Python *tuple*이 아니라 JSON
  스타일 *list*를 원합니다 — `json.loads(json.dumps(...))`로 변환했습니다.

---

## 8. 비용과 정리 (중요!)

Neptune Analytics는 그래프가 존재하는 동안 **초 단위로 과금**됩니다(사용 여부 무관). 다 끝났으면 삭제하세요:
```bash
aws neptune-graph delete-graph --graph-identifier g-ot7ri78aa2 --skip-snapshot --region us-east-1
```
모든 것이 재현 가능합니다 — 스크립트가 몇 분 만에 전체를 다시 만들어 주므로, 삭제했다가 나중에 다시
만들어도 안전합니다.

---

## 9. 이 폴더의 파일들

| 파일 | 무엇인가 |
|---|---|
| [`schema.md`](./schema.md) | 데이터 모델 (노드·엣지·속성) |
| [`load_and_query.py`](./load_and_query.py) | 예제 데이터 적재 + 기본 프로파일링 6개 쿼리 실행 |
| [`advanced_queries.py`](./advanced_queries.py) | 고급 6개 쿼리 (CF·유사도·PageRank·Louvain 등) |
| [`README.md`](./README.md) | 명령어 빠른 참조 (생성 / 실행 / 조회 / 정리) |
| `BEGINNER-GUIDE.md` | 이 문서 |

**한 줄 요약:** 그래프 데이터베이스는 *관계를 따라가며* 원시 주문 데이터를 프로파일로 바꿔 줍니다 —
그리고 가장 돋보이는 신호는 고객이 **말하는 것**과 **실제로 하는 것** 사이의 간극입니다.
