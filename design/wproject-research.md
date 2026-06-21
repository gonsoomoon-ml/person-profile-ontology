# W Project — 푸드 딜리버리 User Profiling 실무 방법론 리서치

> Ontology-grounded · **Palantir(Foundry/Ontology/AIP) 벤치마크** · 합성데이터 노트북 구현 전제
> 작성일: 2026-06-20 · 멀티에이전트 리서치 + 적대적 검증(adversarial verify) 워크플로 산출

## 목차
- 0. Executive Summary — 실무 결론
- 1. 문제 정의 — 푸드 딜리버리 User Profiling
- 2. Palantir 레퍼런스 — Ontology / AIP / OSDK
- 3. 업계 실무 — 마켓플레이스 User Profiling
- 4. 온톨로지/지식그래프 프로파일링 방법론
- 5. LLM·Agentic 프로파일링 & 거버넌스
- 6. whchoi/AWS 블루프린트 이식 포인트
- 7. 권고 — 실무 방법론 (Palantir 벤치마크 대비)
- 8. 노트북 설계 — 합성 데이터 테스트 구현
- 9. 대규모 온톨로지 — 구축 & 스토리지 아키텍처 (30M users / 10M DAU)
- 10. 서빙 — 근실시간(online) & 배치(offline)
- 11. 온톨로지 업데이트 & 프레시니스(freshness)
- 12. 검증 & 한계 노트

---

## 0. Executive Summary — 실무 결론

**한 문단 결론.** food-delivery user profile을 "데이터 모델"이 아니라 **하나의 의사결정**("이 유저에게 어떤 식당/메뉴를, 왜 추천하는가")을 구동하는 **decision-centric ontology**로 설계한다. Palantir Foundry가 ontology를 "단순한 데이터가 아니라 기업의 복잡하게 얽힌 의사결정을 표현하도록 설계됐다"고 못박은 그 관점([architecture-center/ontology-system](https://www.palantir.com/docs/foundry/architecture-center/ontology-system))을 그대로 채택하되, Foundry/Neptune 같은 managed infra는 networkx+kuzu+duckdb 로컬 스택으로 치환한다. 핵심은 profile을 linked object 위의 **재계산 가능한 pure function**(Palantir derived property를 모사, 단 read-only)으로 두고, 모든 추천을 **typed meta-path = 사람이 읽는 reason string**으로 설명하며, **diet/allergen 안전성은 라벨을 믿지 말고 ingredient 구성에서 추론**하고, action 직전에 **consent + PII gate**를 강제하는 것이다. FoodOn / schema.org IRI를 node attribute로 들고 가 표준에 anchor하되 RDF reasoning 비용은 지불하지 않는다.

**권장 end-to-end methodology (요약).**

- **모델링**: recommendation 결정에서 역방향으로 최소 object type(User/Restaurant/Cuisine/Dish/Ingredient/Order/Region/Persona/DietConstraint/Term) + typed link을 설계. 모든 node에 `source: Literal['real','synthetic','external']` provenance를 부여(assembly 패턴 차용 — 단 retail은 screen-level만 태깅하므로 universal로 단정하지 않음).
- **프로파일 계산**: revealed cuisine affinity / RFM / price sensitivity / diet vector / novelty를 duckdb·pandas의 deterministic aggregation(count/avg/sum/collect)으로 산출. override 필드는 derived가 아니라 **stored property + action**으로 (derived property는 read-only, [derived-properties](https://www.palantir.com/docs/foundry/object-link-types/derived-properties)).
- **안전 + 추천**: `(User)-AVOIDS->Ingredient<-CONTAINS-(Dish)` / `HAS_DIET->RestrictedDiet`로 위반 메뉴를 **먼저 hard-prune**(retail AVOIDS_INGREDIENT lens가 가장 직접 이식 가능한 feature), 남은 후보를 **training-free Personalized PageRank / random-walk-with-restart**(Pixie, [arXiv 1711.07601](https://arxiv.org/abs/1711.07601))로 랭킹. LightGCN([arXiv 2002.02126](https://arxiv.org/abs/2002.02126))은 옵션 업그레이드.
- **cold-start**: 신규 유저는 multilevel geo prior(DoorDash: district 영향 최대, global 최소)로 warm-start한 Thompson-sampling cuisine bandit, 신규 아이템은 attribute 연결 content embedding + attribute-permutation synthetic query(Instacart). ontology↔embedding 상보성(Uber Eats: KG가 behavioral data 없는 cold market을 메움)이 narrative anchor.
- **LLM 계층**: constrained-decoding Structured Outputs로 ontology-conformant JSON 강제(JSON mode 아님). 설명은 **retrieved graph path만** 근거로 생성(free recall 금지). 모든 ontology 수정은 `apply_action()`을 통과 — "Logic function이 action에서 실행되지 않으면 Ontology는 수정되지 않는다"([logic/blocks](https://www.palantir.com/docs/foundry/logic/blocks)).
- **governance + eval**: emit 직전 consent matrix(`User-AGREED_TO-Term`) + PII typed-placeholder redaction([USER_1]) gate (GDPR Art. 5(1)(c) data minimization, [arXiv 2510.03662](https://arxiv.org/abs/2510.03662)). 평가는 **추천 품질(NDCG/Precision@K)과 설명 faithfulness(path-exists)를 별도 축**으로, schema-validity와 attribute-accuracy도 절대 한 숫자로 합치지 않음(value accuracy는 ~13.7pt 폭으로 벌어짐, [arXiv 2502.14905](https://arxiv.org/pdf/2502.14905)).

**Notebook headline + 한 줄 이유.**

> **Headline:** Ontology-grounded user profile → explainable, diet-safe 식당/메뉴 추천. **Hero insight는 "stated-vs-revealed preference mismatch"** (선언한 `LIKES_CUISINE` vs 주문 이력에서 드러난 top cuisine).

*왜:* 이 mismatch는 graph로만 구성 가능하고(declared link vs behavioral path), profile이 단순 라벨 집계가 아니라 **추론된 자산**임을 한 장면으로 증명하며 — 동시에 모든 추천이 typed path로 설명되어 설명가능성이 부가물이 아닌 1급 산출물임을 보여준다.

**"Palantir는 X, 우리는 Y" 프레이밍.**

| 측면 | Palantir says X | We do Y (Phase-2 local) |
|------|-----------------|--------------------------|
| Ontology 성격 | 의사결정을 표현(semantic nouns + kinetic verbs) | 동일 채택 — recommendation 결정에서 역설계한 networkx/kuzu node + pydantic class |
| Profile 계산 | derived property = runtime aggregation, **read-only** | pandas/duckdb pure function으로 모사, override는 stored+action |
| Write 경로 | "action에서 실행되지 않으면 ontology는 수정되지 않음" | `apply_action()` wrapper(eligibility/opt-in/frequency cap)로 propose-then-apply |
| Infra | Foundry·Neptune·OpenSearch·Bedrock Guardrails (managed) | networkx/kuzu·rank_bm25/FAISS·Presidio/rule guardrail — **품질 비동등**(MiniLM≠Cohere rerank-v3, Presidio≠managed topic policy), Claude tool-use loop은 여전히 external API → "pure local"은 과장 |

(주의: AWS→OSS 치환표 전체와 PII redaction 단계는 검증된 사실이 아니라 **설계 제안**이다. 어떤 whchoi 데모도 PII redaction을 실제 구현하지 않았다.)

---

## 1. 문제 정의 — 푸드 딜리버리 User Profiling

### 1.1 왜 User Profiling인가 — CX 레버

DoorDash 스타일 마켓플레이스에서 user profile은 단순 분석 자산이 아니라 **하나의 결정**을 구동하는 운영 레이어다 — *"이 유저에게 어떤 식당/메뉴를 추천하고, 왜인가."* (Palantir Ontology의 decision-centric 원칙: 온톨로지는 "단순히 데이터가 아니라 결정을 표현한다", https://www.palantir.com/docs/foundry/architecture-center/ontology-system). Profile이 직접 움직이는 구체적 CX 레버는 다음과 같다.

| CX 레버 | Profile이 공급하는 신호 | 근거 |
|---|---|---|
| 개인화 추천/검색 랭킹 | revealed cuisine affinity, RFM, price tier | Uber Eats 2-tower retrieve→rank; graph similarity가 "단연 가장 영향력 큰 feature", +12% AUC (SF A/B) (https://www.uber.com/us/en/blog/uber-eats-graph-learning/) |
| Cold-start 추천 | 지역 popularity prior + time-of-day | DoorDash Thompson-sampling cuisine bandit, multilevel geo prior (district 영향 최대, global 최소) (https://careersatdoordash.com/blog/personalized-cuisine-filter/) |
| 식이/알레르기 안전 필터 | HAS_DIET, AVOIDS → 위반 메뉴 hard-prune | retail AVOIDS_INGREDIENT safety lens (`/home/ubuntu/person-profile-ontology/design/retail-analysis.md`) |
| 설명 가능한 추천 ("왜 이걸?") | user→item typed meta-path = reason string | path-based KG recsys (https://dl.acm.org/doi/10.1145/3437963.3441762); KGLA NDCG@1 +33–95% (https://arxiv.org/abs/2410.19627) |
| 캠페인 타게팅/세그먼트 | persona KPI 벡터, RFM 클러스터 | gcc scenario D persona dot-product (`/home/ubuntu/person-profile-ontology/design/gcc-analysis.md`) |

**Hero insight: stated-vs-revealed 불일치.** 유저가 *선언한* 취향(LIKES_CUISINE)과 실제 주문이 *드러낸* 취향(top revealed cuisine)의 간극이 본 방법론의 중심 신호다. 이 간극은 profile이 라벨이 아니라 행동에서 추론되어야 하는 이유를 그대로 보여준다.

### 1.2 User Profile의 정의 — Profile Dimensions

여기서 profile은 **연결된 객체(Order link) 위에서 재계산 가능한 derived property들의 집합**이다. Palantir derived property를 미러링하되, derived property는 read-only이므로 override가 필요한 필드(예: priceSensitivityOverride)는 별도의 stored property로 두고 action을 통해서만 수정한다 (https://www.palantir.com/docs/foundry/object-link-types/derived-properties).

| Dimension | 계산 방식 (Order link 집계) | 성격 |
|---|---|---|
| Revealed cuisine affinity | `PLACED→AT→SERVES→Cuisine` count, time-decay 가중 | soft 신호 |
| **Stated vs revealed gap** | LIKES_CUISINE(선언) vs top revealed cuisine | **hero 신호** |
| Price sensitivity | avg order total + 식당 priceTier 분포 | soft |
| RFM | recency / frequency / monetary | 세그먼트 backbone |
| Dietary profile + hard constraints | HAS_DIET→schema.org RestrictedDiet, AVOIDS→FoodOn | **hard filter** |
| Novelty vs familiarity | repeat-rate vs new-restaurant-rate | soft (DoorDash 1사 framing) |
| Spice/veg tendency | 주문 이력 내 Dish flag(조성에서 추론) | soft |
| Recency-weighted bag-of-id 임베딩 | 주문 store/cuisine id의 시간감쇠 bag | cold-start friendly (Uber Eats ~20x compact, https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/) |
| Persona match 벡터 | profile 속성 · persona KPI 가중치 dot-product | presentation lens |
| Provenance/confidence | source tag + data-depth(실데이터 backing 정도) | 신뢰도 |

식이 제약은 soft 신호가 아니라 **hard filter**임에 유의: dietary flag는 라벨을 신뢰하지 않고 Dish의 ingredient 조성에서 추론한다 ("never trust labels"). schema.org RestrictedDiet는 정확히 11개 enum(DiabeticDiet, GlutenFreeDiet, HalalDiet, HinduDiet, KosherDiet, LowCalorieDiet, LowFatDiet, LowLactoseDiet, LowSaltDiet, VeganDiet, VegetarianDiet)을 가진다 (https://schema.org/RestrictedDiet).

### 1.3 입력 데이터 — Object Types & Signals

Profile은 두 종류의 신호 위에서 구성된다. 합성 데이터 생성기가 **이 둘의 간극을 의도적으로 구성 가능**하게 만든다.

- **Behavioral (revealed):** `User-PLACED→Order`, `Order-AT→Restaurant`, `Order-CONTAINS→Dish`, `Restaurant-SERVES→Cuisine`, `Dish-OF_CUISINE→Cuisine`, `User-LIVES_IN→Region`, `Restaurant-LOCATED_IN→Region`
- **Declared (stated):** `User-LIKES_CUISINE→Cuisine`, `User-HAS_DIET→DietConstraint`
- **Safety:** `(User|Persona)-AVOIDS→Ingredient`, `Dish-CONTAINS→Ingredient` (Ingredient는 FoodOn class로 reconcile)
- **Context signals:** Region(지역 popularity prior), time-of-day(day-part), priceTier
- **Governance:** `User-AGREED_TO→Term`(consent matrix), `User-HAS_PERSONA→Persona`, `Campaign-TARGETS→Persona`

모든 노드는 `source: Literal['real','synthetic','external']` provenance 속성을 schema 레벨에서 보유한다 — "합성을 실데이터로 바꾸면 production화된다"는 메시지가 schema 차원에서 성립하도록. (단, 이 per-node 패턴은 assembly 데모에서만 관측됐고 retail은 screen-level provenance만 쓴다; 보편 사실이 아니라 채택할 좋은 설계로 취급, `/home/ubuntu/person-profile-ontology/design/analysis.md`.)

원시 ingredient 문자열을 canonical FoodOn class로 매핑하는 **entity reconciliation은 선택이 아니라 필수 전처리 단계**다. FoodKG의 `foodon-links.trig`(~30K triples)가 바로 이 ingredient→FoodOn 정규화 레이어에 해당한다 (https://foodkg.github.io/foodkg.html).

### 1.4 "Good"의 정의 — 합격 기준

Profile과 그 산출물(추천/설명)은 **두 축으로 분리 평가**한다. 구조적 타당성과 내용 정확성을 하나의 숫자로 합치지 않는다 (constrained decoding은 형식을 고치지 “truth”를 고치지 않음; 벤치마크상 value accuracy는 ~13.7-pt 폭으로 분산, https://arxiv.org/pdf/2502.14905).

| 합격 기준 | 측정 |
|---|---|
| 추천 품질 | held-out 미래 주문에 대한 NDCG@K / Precision@K / hit-rate (time-split) |
| Profile dimension 정확도 | derived 값 == 합성 생성기의 ground-truth 집계 (deterministic check) |
| 설명 충실도(anti-confabulation) | 인용된 meta-path가 그래프에 **실제 존재**하는가 (path-exists 자동 검증) |
| **식이/알레르기 안전** | 최종 추천에 AVOIDS/diet 위반 **0건 (100% 필수, hard gate)** |
| Structured output 무결성 | schema-validity(~100% 기대) **와** attribute-accuracy(실 신호)를 **별도 보고** |
| Governance | consent matrix로 올바르게 차단된 비율; prompt에 raw PII 미도달 |
| 공정성 | counterfactual 안정성(ageBand/region/timing flip → 추천 drift 임계 이하) + proxy-feature 감사 |

마지막 항목은 **guidance**로 제시한다: 보호 속성을 제거해도 cuisine·neighborhood·timing이 income/ethnicity의 proxy로 남아 bias가 사라지지 않으므로 counterfactual 검사가 필요하다 (proxy discrimination, https://arxiv.org/pdf/2204.08085). 단, 푸드 딜리버리 *소비자 추천* 공정성 벤치마크는 존재하지 않는다 — FairEval(34.79% disparity)은 music/movie 도메인이고, Deliveroo 판례는 gig-worker rider-ranking이지 소비자 추천이 아니다 (https://arxiv.org/abs/2504.07801, https://pmc.ncbi.nlm.nih.gov/articles/PMC9643653/).

---

## 2. Palantir 레퍼런스 — Ontology / AIP / OSDK

> 이 절은 Foundry Ontology의 검증된 primitive를 정리하고, 각 개념을 음식배달 user-profiling으로 1:1 매핑한다. Palantir는 **벤치마크(설계 사상)** 로만 차용한다 — Foundry의 managed infra(Neptune-scale graph, OpenSearch, AgentCore, Bedrock Guardrails)는 Phase 2에서 networkx/kuzu·rank_bm25/FAISS·Claude tool-use loop·rule-guardrail로 대체하며, 이는 품질 동등이 아닌 **설계 제안**임을 전제한다.

### 2.1 핵심 사상 — Decision-centric, semantic/kinetic

Foundry Ontology의 출발점은 데이터가 아니라 **결정(decision)** 이다. 공식 문서는 *"The Ontology is designed to represent the complex, interconnected decisions of an enterprise, not simply the data"* 라 명시하고, ontology를 **data·logic·action·security의 four-fold integration** 으로 정의한다 ([architecture-center/ontology-system](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)). 구조는 두 축으로 나뉜다.

- **Semantic("nouns")** — datasource를 objects·properties·links로 매핑한 *의미* 계층.
- **Kinetic("verbs")** — action types·functions로 정의되는 *행위* 계층 ([ontology/overview](https://www.palantir.com/docs/foundry/ontology/overview)).

> ⚠️ 흔히 인용되는 "Semantic / Kinetic / **Dynamic**" 3층 triad는 **비공식(커뮤니티 합성)** 이다. 공식 세 번째 기둥은 'dynamic'이 아니라 **security** 다. 본 방법론은 semantic/kinetic + governance를 서사 축으로 쓰고, 'dynamic layer' 용어는 인용하지 않는다.

**채택 원칙:** 스키마를 데이터에서 위로 쌓지 말고, **하나의 결정 — "이 사용자에게 어떤 식당/메뉴를 왜 추천할 것인가" — 에서 거꾸로 설계** 한다(STEP 0). 그 결정을 구동하는 최소한의 noun(object type + typed link)과 verb(governed action)만 정의한다.

### 2.2 Primitive별 검증 사실과 채택 방식

| Palantir primitive | 검증된 정의 (공식 문서) | 본 노트북 채택 |
|---|---|---|
| **Object Type / Object** | Object type = *"the schema definition of a real-world entity or event"*; object는 backing datasource를 Ontology Manager에서 붙여야 실체화. 표준 예시는 **Employee/Flight** (Airport/JFK 아님 — JFK/LHR은 Flight label 안의 공항코드일 뿐) ([object-types-overview](https://www.palantir.com/docs/foundry/object-link-types/object-types-overview)) | object type = networkx/kuzu node label + pydantic class. "backing datasource" = synthetic generator + duckdb table. Ontology Manager UI는 생략 |
| **Link Type** | 단일 link는 `get()/getAsync()`, many-side link는 `all()/allAsync()`(없으면 빈 Array), `searchAroundToOtherObjectType()`로 ObjectSet traversal(인스턴스 메모리 적재 회피). cardinality 1:1 / 1:many / many:many ([api-objects-links](https://www.palantir.com/docs/foundry/functions/api-objects-links), [link-types-overview](https://www.palantir.com/docs/foundry/object-link-types/link-types-overview)) | typed edge로 모델. cardinality 태깅. load-bearing meta-path: `User→Order→Restaurant→Cuisine`(설명), `User→AVOIDS→Ingredient←CONTAINS←Dish`(안전) |
| **Property** | object type의 attribute. stored property는 action으로 편집 가능 | `userId·ageBand·source` 등 stored. **override 필드(예: priceSensitivityOverride)는 반드시 stored property + action 편집** — derived로 두면 쓸 수 없음(아래) |
| **Derived Property** | runtime에 linked object로부터 계산; 9종 aggregation(count·average·sum·min·max·approx/exact cardinality·collect list·collect set). **READ-ONLY — "cannot be edited through functions or actions"**, 관련 object의 security context 준수 ([derived-properties](https://www.palantir.com/docs/foundry/object-link-types/derived-properties)) | profile dimension = Order link 위 순수 재계산 pandas/duckdb 함수(count/avg/sum/collect). RFM·revealed affinity·diet vector가 여기 해당. **읽기 전용이므로 override는 절대 derived로 만들지 않음** |
| **Function** | operational context에서 실행되는 logic; object set·변환값·aggregation 반환. recommendation/scoring의 자연스러운 거처 | PPR/random-walk·LightGCN ranking·similarity를 graph 위 Python function으로 구현 |
| **Action Type** | *"a set of changes or edits to objects, property values, and links that a user can take at once"*; parameters·rules·**submission criteria(validation)**·function-backing·**side effects**(notification/webhook) 보유, action 실행 시 ontology에 commit ([action-types/overview](https://www.palantir.com/docs/foundry/action-types/overview)) | 모든 ontology 편집이 통과하는 `apply_action()` wrapper. submission criteria로 eligibility·opt-in·frequency cap을 action 경계에서 강제(STEP 9의 compliance gate 기반) |

> ⚠️ **인용 위생(연구에서 정정됨):** ① `findSimilarRestaurants`는 **TypeScript OSDK 문서**의 예시이지 `functions/api-objects-links`가 아니다. ② functions/overview에는 "arbitrary complexity / recommendations, scoring / rule-ML-LLM orchestration" 같은 문구가 **없다**(paraphrase). 능력 자체(function이 scoring의 자리)는 유효하나 그 문구를 verbatim 인용하지 말 것. ③ object type 예시는 Employee/Flight다.

### 2.3 Governance — propose-then-apply (가장 강력한 인용)

LLM 기반 write-back governance가 본 방법론의 척추다. AIP Logic 문서는 verbatim으로:

> *"Calling an AIP Logic function from an action is required for edits to be written back to the Ontology. The Ontology will not be edited unless the Logic function is executed from an action, even if the function contains an Apply action block."* ([logic/blocks](https://www.palantir.com/docs/foundry/logic/blocks))

즉 LLM은 profile 편집을 **제안(propose)** 만 할 수 있고, graph 변형은 오직 `apply_action()`을 통해서만 일어난다(STEP 7). 단, **"action이 유일한 write 경로"라는 절대 주장은 LLM/AIP-Logic 편집에 한해 참** 이다 — action-types overview는 모든 write에 대한 배타성을 선언하지 않으며 pipeline도 backing data를 쓴다. "only"는 LLM write-back으로 한정한다.

관련 빌딩블록:
- **AIP Logic blocks:** Use LLM / Apply action / Execute function / Create variable(+ Conditionals/Loops). "Use LLM" block 안의 *Apply actions* tool이 LLM에게 governed 편집 권한을 부여 ([logic/blocks](https://www.palantir.com/docs/foundry/logic/blocks)). → Claude tool-use loop의 작은 typed tool set(`graph_query`·`profile_compute`·`recommend`·`apply_action`)으로 적응.
- **AIP Chatbot Studio**(구 Agent Studio): 정확히 6개 ontology-grounded tool — Action / Object Query / Function / Update Application Variable / Command / Request Clarification. Action tool은 **auto vs confirmation 토글** 보유 ([agent-studio/tools](https://www.palantir.com/docs/foundry/agent-studio/tools)). → write에 confirm 토글을 다는 패턴으로 차용.

### 2.4 OSDK — token scoping을 PII 투영으로

OSDK는 ontology의 **부분집합(subset)** 에 대해서만 type-safe client를 생성하며, token이 *"scoped only to the ontological entities you want your application to access, **in addition to the user's own permissions**"* ([ontology-sdk/overview](https://www.palantir.com/docs/foundry/ontology-sdk/overview)). token scope **+** user permission의 이중 방어다.

채택: code generation은 생략하되 **원칙** 을 가져온다 — PII-heavy profile에서 consumer가 필요한 subset만 노출한다(예: raw PII 없이 recommendation reason만). pydantic view model / redacted projection으로 구현(STEP 9의 typed-placeholder redaction과 결합).

### 2.5 매핑 표 — Palantir 개념 → 음식배달 user-profiling

> 아래 매핑은 verified primitive와 **내부 정합** 하는 설계 청사진(Palantir 공식 매핑이 아님). 단 하나의 함정: derived property는 read-only이므로 override 가능한 필드는 stored property + action으로 둔다.

| Palantir 개념 | 음식배달 user-profiling 등가물 | 노트북 구현 |
|---|---|---|
| Object Type | `User · Restaurant · Cuisine · Dish · Ingredient · Order · Region · Persona · DietConstraint · Term(consent) · Campaign` | networkx node label + pydantic class |
| Object(instance) | 개별 사용자/식당/주문 노드 | synthetic generator가 생성, `source:Literal['real','synthetic','external']` 태깅 |
| Property(stored) | `userId·ageBand·priceSensitivityOverride` | duckdb 컬럼; override는 action으로만 편집 |
| Derived Property (count/avg/sum/collect, **read-only**) | `revealed_cuisine_affinity · rfm_scores · price_tier_pref · novelty_score · diet_vector` | Order link 위 순수 재계산 pandas/duckdb 함수 |
| Link Type (cardinality) | 행위: `User-PLACED→Order`, `Order-AT→Restaurant`, `Order-CONTAINS→Dish`, `Restaurant-SERVES→Cuisine`<br>선언: `User-LIKES_CUISINE→Cuisine`, `User-HAS_DIET→DietConstraint`<br>안전: `(User\|Persona)-AVOIDS→Ingredient`, `Dish-CONTAINS→Ingredient` | typed edge; meta-path가 곧 설명/안전 경로 |
| Function (scoring) | diet-safe candidate 생성 + 설명형 ranking | hard-prune 후 Personalized PageRank / random-walk-with-restart(training-free), 선택적 LightGCN |
| `findSimilarRestaurants` (OSDK 예시) | lookalike / 유사 식당 검색 | graph similarity 함수 |
| Action Type (submission criteria·side effects) | profile write-back · campaign 발송 | `apply_action(eligibility, opt-in, frequency_cap)` |
| AIP Logic "Use LLM"+Apply action | LLM이 profile 편집을 **제안**, action만이 commit | Claude tool-use loop + confirm 토글 |
| AIP Chatbot 6 tools | `graph_query·profile_compute·recommend·apply_action` (소형 typed set) | tool-use loop |
| OSDK token scoping (subset + user perm) | recommendation reason은 노출, raw PII는 차단 | pydantic redacted projection + consent matrix |
| Submission criteria + side effects | emit 직전 compliance gate | guardrail check + `User-AGREED_TO-Term` consent 통과 후에만 발송 |
| 생략 — Ontology Manager UI / Foundry managed graph / Guardrails | (Phase 2 비대상) | networkx·kuzu / rule-guardrail·Presidio (품질 비동등, "pure local"은 외부 LLM API 의존으로 과장) |

**핵심 take-away:** Foundry의 가치는 인프라가 아니라 **결정 중심 스키마 + read-only derived property + action-only write-back** 라는 세 가지 사상이다. 이 세 가지는 managed Foundry 없이도 pandas·pydantic·tool-use loop로 충실히 복제할 수 있으며, propose-then-apply governance 인용(*"will not be edited unless... executed from an action"*)이 그 정당화의 가장 강한 근거다.

---

## 3. 업계 실무 — 마켓플레이스 User Profiling

마켓플레이스(DoorDash·Uber Eats·Instacart·Amazon)는 user profile을 "선언된 취향"이 아니라 **행동 로그에서 추론한 representation**으로 다룬다. 핵심 패턴 다섯 가지 — signals, 검색/추천 아키텍처, feature store, cold-start, knowledge graph — 를 검증된 production 사례로 정리한다.

### 3.1 Signals와 RFM — segmentation의 backbone

profile의 1차 신호는 주문 로그다. RFM(Recency/Frequency/Monetary)이 grocery/delivery segmentation의 실무 기본기이며, 보통 K-means와 결합한다. 단, 공개된 RFM+K-means 분석은 **Instacart 공개 데이터셋에 대한 third-party 분석**이지 Instacart의 production segmentation 자체는 아니다([medium.com/customer-segmentation-instacart](https://medium.com/data-science/customer-segmentation-using-the-instacart-dataset-17e24be9c0fe)). RFM은 "classic → learned"로 가는 출발점으로 안전하지만, production 사실로 인용하면 안 된다. 그 위에 item2vec / customer2vec 같은 learned representation을 얹는 것이 일반적 진화 경로다([griddynamics customer2vec](https://www.griddynamics.com/blog/customer2vec-representation-learning-and-automl-for-customer-analytics-and-personalization)).

DoorDash는 추천 목표를 Familiarity/Affordability/Novelty triad로 framing하지만, 이는 **한 회사의 설계 선택**이지 업계 표준이 아니다 — 본 방법론의 novelty/price/affinity dimension 설계 근거로만 쓴다.

### 3.2 User encoding — raw user id 대신 ordered-id의 bag

검증된 production 패턴은 user를 raw user id로 임베딩하지 않는 것이다. Uber Eats는 eater를 "최근 수개월간 주문한 store_id를 time-decay로 정렬한 bag"으로 인코딩해 `eater_uuid`의 proxy로 쓴다. store 수는 수백만 수준이라 **모델 크기가 약 20배 작아지고 cold-start에 강하다**([uber.com/two-tower-embeddings](https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/)). → 본 방법론 STEP 3의 "recency-weighted bag of restaurant/cuisine ids" dimension의 직접 근거.

### 3.3 검색/추천 아키텍처 — two-tower retrieve-then-rank

| 단계 | 실무 구현 | 출처 |
|------|-----------|------|
| Retrieval | user/query tower + store/item tower를 joint 학습. item embedding은 **offline 사전계산**, request 시 query embedding만 계산해 ANN 조회 | Uber Eats, Instacart |
| Tower 구성 | Uber: query tower=검색어+user profile, item tower=store+item+geo. Instacart ITEMS=Sentence-Transformers bi-encoder, cart-add conversion + in-batch negative + hard-negative reweighting 학습 | (위 동일) |
| Serving | Instacart: query embedding >95% 캐시 hit, 미스도 8ms 이내, FAISS ANN 일일 갱신 | Instacart |
| Layer sharing | Uber: 두 tower가 동일 UUID embedding layer 공유 → 복잡도↓, eater-store 관계 학습↑ | Uber |

Instacart의 online A/B 결과: **MRR +1.2%(첫 전환 item 기준), cart-adds-per-search +4.1%**([company.instacart.com/embeddings-search-relevance](https://company.instacart.com/how-its-made/how-instacart-uses-embeddings-to-improve-search-relevance)).

본 방법론은 이 two-tower의 **scale이 아니라 shape**(offline item embedding + ANN retrieve → rerank)만 차용한다. FAISS+sentence-transformers로 conceptually mirror하되, 노트북에서는 PPR/meta-path 기반 explainable ranking을 default로 둔다.

### 3.4 Graph 기반 ranking — Uber Eats GraphSAGE

Uber Eats는 bipartite **user-dish / user-restaurant 그래프**(edge weight = 주문 횟수)에 modified GraphSAGE(이종 노드용 projection layer + weighted edge + hinge/ranking loss)를 돌린다. 결과: offline 지표(MRR/Precision@K/NDCG) **약 20% 개선**, San Francisco A/B에서 **AUC +12%**, 그리고 **graph similarity가 가장 영향력 큰 feature**였다([uber.com/uber-eats-graph-learning](https://www.uber.com/us/en/blog/uber-eats-graph-learning/)). 이는 그래프 신호가 단순 행동 로그를 넘어선다는 가장 강한 production 증거다.

training-free 대안으로 Pinterest **Pixie**(random-walk-with-restart로 PPR 근사)가 검증돼 있다: 30억 node/170억 edge, 서버당 1,200 req/s @ 60ms, training 불필요, Pinterest 전체 engagement의 80% 이상을 backing([arXiv 1711.07601](https://arxiv.org/abs/1711.07601)). 학습형 upgrade는 LightGCN(feature transform·비선형 제거, 선형 propagation만, layer embedding 가중합, NGCF 대비 평균 ~16% 개선; [arXiv 2002.02126](https://arxiv.org/abs/2002.02126)).

### 3.5 Feature store — freshness tiering과 저지연 serving

production profile은 feature store에서 **신선도 tier**로 나눠 serving한다.

- **DoorDash**: Redis 기반 gigascale feature store → Sibyl 예측 서비스 **<100ms**, 피크 약 900k ML eval/sec. daily-batch feature와 real-time feature(예: "지난 20분간 특정 store 평균 배달시간", Riviera/Flink)를 분리([zenml.io/doordash-sibyl](https://www.zenml.io/mlops-database/doordash-doordashs-ml-platform-sibyl-centralized-real-time-ml-inference-service-with-grpc-redis-feature-store-and-model)).
- **Instacart**: query embedding 8ms tier(위 3.3).

본 방법론은 이 **tiering 개념**(daily-batch / real-time / precomputed embedding)을 차용한다. derived property = recomputable pure function이 batch tier에 대응하고, 새 주문은 real-time tier로 Mem0-style 증분 갱신한다.

### 3.6 Cold-start — bandit + content embedding

| 대상 | 실무 레시피 | 출처 |
|------|------------|------|
| 신규 user | Thompson-sampling cuisine bandit. **multilevel 지리 popularity prior로 warm-start**(district가 가장 큰 영향, global이 가장 작음), time/location context 반영. 단, Beta는 Beta(해당 cuisine 주문수, 다른 cuisine 주문수)의 **상대 점유율 모델**임에 유의 | [DoorDash](https://careersatdoordash.com/blog/personalized-cuisine-filter/) |
| 신규/long-tail item | content-based embedding: 속성(brand/category/size/dietary) special-token concat + **속성 permutation 합성 query**(비율 낮게 유지) + multi-task head(brand·category 예측) + 2-stage cascade 학습(noisy warmup → clean fine-tune). engagement 신호에 의존하지 않음 | [Instacart](https://company.instacart.com/how-its-made/how-instacart-uses-embeddings-to-improve-search-relevance) |

이 둘이 STEP 6(cold-start bandit + content embedding)의 직접 근거다.

### 3.7 Identity resolution — 전이 주의

deterministic + probabilistic 매칭(real-time deterministic stitch + nightly batch re-score/merge-split)으로 household/identity를 해소하는 패턴은 **ad-tech/CDP 벤더(Braze, The Trade Desk) 기준**이며, **DoorDash/Uber Eats/Instacart가 이렇게 한다는 primary 출처는 없다**([braze identity-resolution](https://www.braze.com/resources/articles/identity-resolution)). household/persona mixing의 narrative color로만 쓰고, food-delivery production 사실로 인용하지 말 것.

### 3.8 Knowledge graph가 등장하는 지점

KG는 두 곳에서 명확히 production에 들어간다.

1. **Query understanding & cold market (Uber Eats)** — 계층적 food knowledge base(예: 'Asian' → Chinese/Japanese 추론), 다중 소스 정규화 후 classifier로 de-dup/cross-link. query2vec은 GloVe 변형(두 query가 같은 식당 주문으로 이어지면 context 공유, PMI matrix). 결정적으로 Uber Eats는 KG와 representation learning이 **"complementary"**라고 명시한다 — representation learning은 신규 도시에 없는 행동 데이터를 필요로 하므로, cold market을 KG가 메운다([uber.com/uber-eats-query-understanding](https://www.uber.com/us/en/blog/uber-eats-query-understanding/)). → 본 방법론의 **ontology↔embedding 상보성** narrative anchor.

2. **Commonsense KG (Amazon COSMO)** — 행동 co-occurrence(query-purchase, co-purchase)를 LLM에 먹여 commonsense triple 생성(usedFor/capableOf/isA → used_for_function/_event/_audience로 정제), heuristic 필터 + human annotation(plausibility/typicality) + ML classifier로 정제. 결과: frozen encoder **macro-F1 +60%**, fine-tuned **+28%/+22%**([amazon.science/cosmo](https://www.amazon.science/blog/building-commonsense-knowledge-graphs-to-aid-product-recommendation)). → LLM이 그래프를 **제안**하고 사람/ML이 **검증**하는 propose-then-validate 패턴의 production 선례.

요약: 마켓플레이스 실무의 표준은 two-tower retrieve-then-rank + feature-store tiering + RFM/embedding hybrid이며, KG는 이를 **대체**하는 것이 아니라 cold market·query understanding·commonsense 보강이라는 **상보적** 자리에서 등장한다. 본 방법론은 이 상보성을 explainability(meta-path = reason string)와 결합해, 행동 데이터가 얕은 구간을 ontology가 메우도록 설계한다.

---

## 4. 온톨로지/지식그래프 프로파일링 방법론

본 절은 합성 음식배달 데이터 위에서 **온톨로지로 정박된 사용자 프로파일 → 설명가능·식이안전 추천**을 만드는 실행 가능한 방법론을 다룬다. 핵심은 데이터가 아니라 **하나의 의사결정**("이 사용자에게 어떤 식당/메뉴를 왜 추천하는가")을 중심으로 스키마를 역설계하는 것이다([Palantir Ontology overview](https://www.palantir.com/docs/foundry/ontology/overview)).

### 4.1 의사결정 중심 프로파일링 온톨로지 설계

- **명사(객체·링크) vs 동사(액션)로 나눈다.** Palantir 온톨로지는 "데이터가 아니라 기업의 의사결정을 표현"하도록 설계되며, 의미(semantic) 명사 = 객체/속성/링크, 운동(kinetic) 동사 = 액션/함수다([architecture-center/ontology-system](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)). 추천 결정 1개를 구동하는 **최소 명사 집합**부터 시작한다.
- **표준 IRI를 노드 속성으로 들고 다닌다.** FoodOn 클래스와 schema.org `RestrictedDiet` enum을 property-graph 노드의 attribute로 부착하면, RDF 추론 비용 없이 표준에 정박된다. property graph(NetworkX/Kuzu)는 탐색·분석에 빠르고, RDF/SPARQL은 OWL 추론이 *하드 요구사항*일 때만 도입한다([RDF vs property graph](https://www.ontotext.com/knowledgehub/fundamentals/rdf-vs-property-graphs/)).
- **출처를 스키마에 새긴다.** 모든 노드에 `source: Literal['real','synthetic','external']`를 둔다(assembly 데모 패턴 — 단, retail은 화면 수준에서만 출처를 표기하므로 "전 데모 공통 규약"으로 일반화하지 말 것). 이로써 "합성을 실데이터로 교체하면 곧 운영"이라는 메시지가 스키마 수준에서 성립한다.

**핵심 스키마 (객체 타입 / 링크)**

| 종류 | 정의 |
|---|---|
| 객체 타입 | User, Restaurant, Cuisine, Dish, Ingredient, Order, Region, Persona, DietConstraint, Term(동의), Campaign |
| 행동 링크 | User-PLACED→Order, Order-AT→Restaurant, Order-CONTAINS→Dish, Restaurant-SERVES→Cuisine, Dish-OF_CUISINE→Cuisine |
| 선언 링크 | User-LIKES_CUISINE→Cuisine (말한 것), User-HAS_DIET→DietConstraint (→schema.org RestrictedDiet) |
| 안전 링크 | (User\|Persona)-AVOIDS→Ingredient ←CONTAINS- Dish (retail의 AVOIDS_INGREDIENT 렌즈 전치 — 가장 직접 이식 가능한 안전 기능) |
| 거버넌스 | User-HAS_PERSONA→Persona, Campaign-TARGETS→Persona, User-AGREED_TO→Term |

두 **load-bearing 메타패스**: ① `User→Order→Restaurant→Cuisine`(설명), ② `User→AVOIDS→Ingredient←CONTAINS→Dish`(안전).

### 4.2 프로파일 = 링크 위의 재계산 가능한 파생 속성

각 프로파일 차원은 Order 링크 위의 **결정론적 집계**(count/avg/sum/collect)로 계산되는 순수 함수다. Palantir의 derived property를 미러링하되, **derived property는 read-only**라는 제약을 지킨다 — `priceSensitivityOverride` 같은 덮어쓰기 필드는 derived가 아니라 **stored property**로 두고 액션으로만 수정한다([derived-properties](https://www.palantir.com/docs/foundry/object-link-types/derived-properties)).

| 차원 | 계산 |
|---|---|
| Revealed cuisine affinity | PLACED→AT→SERVES→Cuisine 카운트, 시간감쇠 가중 |
| **Stated vs revealed gap** | 선언한 LIKES_CUISINE vs 실제 top cuisine — **히어로 인사이트** |
| Price sensitivity | 평균 주문액 + 식당 priceTier 분포 |
| RFM | recency/frequency/monetary (배달·소매 세분화의 backbone) |
| Diet vector / hard constraint | HAS_DIET→RestrictedDiet, AVOIDS→FoodOn — soft 신호 아닌 **하드 필터** |
| Novelty appetite | 재주문율 vs 신규식당율 |
| Spice/veg tendency | 주문 이력의 Dish 플래그에서 추론 |

User는 raw user-id가 아니라 **시간가중 ordered-restaurant/cuisine-id의 bag**으로 인코딩한다 — Uber Eats는 이 방식으로 모델을 ~20배 축소하고 cold-start를 완화했다("only millions of stores"; [Uber two-tower](https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/)).

### 4.3 음식 분류체계와 식이/알레르겐 모델링

**표준 선택**

| 표준 | 역할 | 검증된 사실 |
|---|---|---|
| **FoodOn** | 재료 정규화 클래스 | farm-to-fork, BFO 정렬 OBO 온톨로지, 9,600+ 식품 카테고리, source-organism/해부/가공 facet, 치환용 `has food substance analog`. 단 `has defining ingredient` 관계명은 실제 OWL 릴리스에서 확인 후 사용([foodon.org](https://foodon.org/), [PMC6550238](https://pmc.ncbi.nlm.nih.gov/articles/PMC6550238/)) |
| **schema.org** | 메뉴·식이 표현 | `Restaurant→hasMenu→Menu→hasMenuSection→MenuItem`; MenuItem에 nutrition/offers/menuAddOn/suitableForDiet([schema.org/MenuItem](https://schema.org/MenuItem)) |
| **schema.org RestrictedDiet** | 식이 enum (정확히 11개) | DiabeticDiet, GlutenFreeDiet, HalalDiet, HinduDiet, KosherDiet, LowCalorieDiet, LowFatDiet, LowLactoseDiet, LowSaltDiet, VeganDiet, VegetarianDiet([schema.org/RestrictedDiet](https://schema.org/RestrictedDiet)) |
| **FoodKG / USDA** | 즉시 사용 KG·영양 | ~67M 트리플 (foodkg-core ~63M + usda-links ~4.1M + foodon-links ~30K); Recipe1M+FoodOn+USDA를 WTM 온톨로지로 통합, 알레르기/제약 인지 SPARQL + 재료 치환 지원([foodkg.github.io](https://foodkg.github.io/foodkg.html)) |
| **GS1** | 상품 식별 코드 | 카탈로그 식별자(retail은 GS1↔KFDA 매핑 검증). 음식배달 프로파일링 자체엔 보조적 |

**엔티티 정합(필수 전처리).** 카탈로그·레시피·영양을 합칠 때 자유텍스트 재료 문자열을 정규 FoodOn 클래스로 매핑하는 것은 *옵션이 아니라 필수* 단계다. FoodKG의 `foodon-links.trig`(재료→FoodOn, ~30K)가 바로 이 정규화 층의 실물이다([entity linking](https://www.ontotext.com/blog/connecting-the-dots-entity-linking/)).

**식이/알레르겐은 라벨이 아니라 구성에서 추론.** Dish의 vegetarian/spicy/알레르겐 플래그는 `Dish-CONTAINS→Ingredient` 구성에서 **추론**한다(라벨 불신). 안전 위반 검출은 메타패스 `(User|Persona)-AVOIDS/HAS_DIET→ constraint ←CONTAINS- Dish` 워크로 처리한다. FoodOn→Disease-Ontology 알레르겐 전파는 **건전한 설계 패턴**이지만 턴키 보장이 아니므로, 실제 OWL 릴리스에 대해 검증할 것(verified research에서 medium-confidence로 분류).

### 4.4 그래프 기반 설명가능 추천

**파이프라인: 제약-우선 필터 → 학습불필요 랭커 → 메타패스 = 이유 문자열**

1. **식이 위반 서브그래프를 먼저 하드 프루닝**(constraint-as-filter). AVOIDS/diet 위반 Dish를 그래프 워크로 제거하고, *무엇이 왜 걸러졌는지*를 표시한다. 최종 추천의 식이 위반은 0건이어야 한다(하드 게이트, 100% 필수).
2. **생존 후보를 학습불필요 그래프 추천기로 랭킹.** 기본값은 **Personalized PageRank / random-walk-with-restart**(Pixie 스타일, 학습 불필요). Pixie 논문은 30억 노드·170억 엣지에서 서버당 1,200 req/s @ ~60ms, Pinterest 인게이지먼트의 >80%를 백킹한다([arXiv 1711.07601](https://arxiv.org/abs/1711.07601)). *블로그의 "최대 50% 향상/1000억 엣지" 수치와 섞지 말고 출처를 분리해 인용할 것.*
3. **선택적 학습형 업그레이드: LightGCN.** feature transformation·비선형성을 제거하고 이웃 집계만 유지, 최종 임베딩은 레이어 임베딩의 가중합, NGCF 대비 평균 ~16% 개선([arXiv 2002.02126](https://arxiv.org/abs/2002.02126)).
4. **타입화된 메타패스가 곧 사람이 읽는 이유다.** path-based KG 추천기(TMER, KGDExR 등)는 user→item 메타패스를 해석가능 설명으로 쓴다([ACM 3441762](https://dl.acm.org/doi/10.1145/3437963.3441762)). KG 정박은 측정 가능한 효과가 있다 — KGLA는 세 벤치마크에서 NDCG@1을 33–95% 향상([arXiv 2410.19627](https://arxiv.org/abs/2410.19627)).

**참조 규모 프레이밍.** 검색-후-랭크는 개념상 two-tower(오프라인 item 임베딩 + ANN)를 미러링하되 그 규모는 불필요하다. Uber Eats의 bipartite user-dish/user-restaurant 그래프(엣지 가중 = 주문수) + GraphSAGE에서 **"graph similarity가 단연 가장 영향력 큰 피처"**, SF A/B에서 +12% AUC였다([Uber Eats graph learning](https://www.uber.com/us/en/blog/uber-eats-graph-learning/)).

**Cold-start(설계된 관심사).** 신규 사용자 = 다층 지리 인기도 prior로 warm-start한 **Thompson-sampling cuisine bandit**, time-of-day로 재파라미터화(DoorDash: district 영향 최대, global 최소; Beta(해당 cuisine 주문수, 타 cuisine 주문수)의 상대점유 모델, [DoorDash](https://careersatdoordash.com/blog/personalized-cuisine-filter/)). 신규/롱테일 아이템 = 속성(cuisine/diet/price) concat content 임베딩 + **속성 순열 합성 쿼리**(Instacart). 통합 근거는 Uber Eats의 명시적 진술 — KG와 표현학습은 **"complementary"**하며 표현학습은 신규 도시에 없는 행동데이터를 필요로 한다([Uber Eats query understanding](https://www.uber.com/us/en/blog/uber-eats-query-understanding/)).

### 4.5 GraphRAG — 그래프를 LLM 검색 근거로

설명·페르소나 카드는 LLM의 자유 회상이 아니라 **검색된 그래프 패스 + 프로파일 사실**만 입력으로 받아 생성한다(confabulation 방지, 모든 설명에 근거 로깅). 규모가 커지면 Microsoft GraphRAG를 적용한다.

- **인덱싱(4단계):** LLM 엔티티/관계 추출 → Leiden 커뮤니티 탐지 → 커뮤니티 요약 → 그래프 인지 검색([GraphRAG repo](https://github.com/microsoft/graphrag)).
- **쿼리 모드 비용 사다리 `local < DRIFT < global`:** *Local*은 KG 엔티티·관계·커뮤니티 리포트 + 원문 청크를 결합(엔티티 특정 질의). *Global*은 전 커뮤니티 리포트에 대한 map-reduce로 **resource-intensive**. *DRIFT*는 local에 커뮤니티 맥락 + 후속질문을 더해 중간에 위치([GraphRAG query overview](https://microsoft.github.io/graphrag/query/overview/)). 음식배달 프로파일링에서는 사용자 1명에 대한 질의가 대부분이므로 **Local이 기본값**이다.

### 4.6 소규모 팀을 위한 구현 스택

| 레이어 | 도구 | 비고 |
|---|---|---|
| 그래프 | networkx (PPR/메타패스/LightGCN-lite) + kuzu (임베디드 Cypher) | Neptune의 OSS 로컬 대체 — *설계 제안이지 추출된 사실 아님* |
| 저장/프로파일링 | duckdb + pandas | SQL 집계 = derived-property 미러 |
| 어휘 검색 | rank_bm25 | Nori(한국어 토크나이저) 제외 — 영어 합성데이터 |
| 의미 검색 | sentence-transformers + FAISS + 짧은 RRF 융합 | k는 튜너블(데모의 k=60 상수는 assembly/gcc 전용이므로 이식하지 말 것) |
| 리랭크 | HF cross-encoder ms-marco MiniLM | **Cohere rerank-v3와 품질 동등 아님** — caveat 명시. 0.78±0.12 신뢰도는 assembly 전용 수치, 이식 금지 |
| 표준 | FoodOn IRI + schema.org RestrictedDiet enum을 노드 속성으로 | RDF 추론기 불필요; rdflib는 OWL 알레르겐 추론이 하드 요구가 될 때만 |

> 정직한 caveat: 위 AWS→OSS 치환표 전체는 **설계 제안**이며 whchoi 소스 문서 어디에도 나오지 않는다. 품질은 동등하지 않고, 프로파일 카드/설명 생성용 LLM(Claude API)은 여전히 외부 API를 호출하므로 "순수 로컬"은 과장이다.

---

## 5. LLM·Agentic 프로파일링 & 거버넌스

LLM은 그래프 위에 얹는 **표현·합성 계층**이지 진실의 원천이 아니다. 핵심 원칙: LLM은 **검색된 그래프 경로와 프로파일 fact를 데이터로 받아** 카드·설명·페르소나 내러티브를 생성하고, 그래프에 대한 모든 쓰기는 거버넌스된 action을 통과해야 한다(Palantir: "The Ontology will not be edited unless the Logic function is executed from an action" — https://www.palantir.com/docs/foundry/logic/blocks). 자유 회상(free recall)으로 프로파일을 "기억"시키지 말 것.

### 5.1 행동 → 프로파일 합성 (constrained decoding)

프로파일 카드·페르소나·클러스터 라벨은 LLM에게 **온톨로지 스키마를 강제**한 JSON으로 받는다.

- **JSON mode가 아니라 Structured Outputs**(JSON-Schema-as-grammar)를 써라. JSON mode는 구문 유효성만 보장하지만 Structured Outputs는 스키마 준수를 보장한다(유효하지 않은 토큰을 확률 0으로 마스킹). `refusal` 필드와 `finish_reason='length'`를 반드시 점검 (https://developers.openai.com/api/docs/guides/structured-outputs). 함수 호출(function calling)도 동일 기계를 쓰며 pydantic/Zod 타입 시그니처에서 스키마를 자동 생성할 수 있다.
- **구조 유효성과 내용 정확도를 절대 한 숫자로 합치지 말 것.** constrained decoding은 포맷 오류·enum 오류를 없애지만 의미적 정확성은 고치지 못한다. 벤치마크상 구조 유효성은 0.95+로 몰리는 반면 value accuracy는 0.693~0.830으로 약 13.7pt 퍼진다 (https://arxiv.org/pdf/2502.14905, https://arxiv.org/abs/2501.10868). → schema-validity rate(약 100% 기대)와 attribute-accuracy rate(실제 신호)를 **별도 지표**로 보고.

| 지표 | 측정 대상 | 기대치 |
|---|---|---|
| schema-validity | JSON이 pydantic 스키마 통과 | ~100% (constrained decoding) |
| attribute-accuracy | 값이 ground-truth 집계와 일치 | 넓게 분산 — 진짜 신호 |

**Pitfall**: 스키마 통과율 100%를 보고 "정확하다"고 결론짓는 것. 포맷이 완벽해도 LLM이 `priceSensitivity="high"`를 잘못 채울 수 있다 — derived property(RFM·affinity 등)는 **결정론적 pandas/duckdb 함수**로 계산하고, LLM은 서술과 라벨링만 맡겨라.

### 5.2 설명 생성 — grounded path만 사용

타입화된 meta-path(`User→Order→Restaurant→Cuisine`, `User→AVOIDS→Ingredient←CONTAINS→Dish`)가 곧 사람이 읽는 reason string이다. KG 경로 기반 추천은 설명 가능성을 확보한 확립된 연구 방향이며(https://dl.acm.org/doi/10.1145/3437963.3441762), KG로 그라운딩한 language agent는 flat interaction 대비 NDCG@1을 33~95% 끌어올린다(KGLA, https://arxiv.org/abs/2410.19627).

- LLM에는 **검색된 경로 + fact만** 입력하고, 모든 설명에 evidence(경로)를 함께 로깅.
- **Faithfulness 자동 검증**: 인용된 모든 meta-path가 실제 그래프에 존재하는지 path-exists 체크. 이것이 핵심 anti-confabulation 지표다.

주의: "그래프 경로 그라운딩이 설명 충실도를 측정 가능하게 높인다"는 명제 자체는 vendor blog 수준 근거(https://neo4j.com/blog/genai/knowledge-graph-llm-multi-hop-reasoning/)일 뿐 통제된 실험 결과는 아니다 — sound한 설계 권고로 다룰 것.

### 5.3 대화형 personalization & agent/tool-use

Claude tool-use loop로 작은 타입화된 도구 집합을 노출한다(Palantir Chatbot Studio의 6개 ontology-grounded 도구 — Action/Object Query/Function/Update Variable/Command/Request Clarification — 를 축약; https://www.palantir.com/docs/foundry/agent-studio/tools):

| 도구 | 역할 | 쓰기 여부 |
|---|---|---|
| `graph_query` | 1–3 hop 탐색 | 읽기 |
| `profile_compute` | derived property 재계산 | 읽기 |
| `recommend` | diet-filter→PPR 랭킹 | 읽기 |
| `apply_action` | 거버넌스된 그래프 edit | **쓰기 (confirm 토글)** |

- **propose-then-apply**: LLM은 프로파일 edit를 *제안*만 하고, `apply_action()`만이 그래프를 변형한다. action은 submission criteria(eligibility/opt-in/frequency cap)·validation·side-effect를 강제한다(https://www.palantir.com/docs/foundry/action-types/overview). override 필드(예: priceSensitivityOverride)는 derived property가 아니라 **stored property**여야 한다 — derived property는 read-only다(https://www.palantir.com/docs/foundry/object-link-types/derived-properties).
- **프로파일 = 진화하는 메모리**: 새 주문마다 전체 재계산 대신 Mem0식 ADD/UPDATE/DELETE 통합. Mem0는 OpenAI 메모리 대비 LLM-judge 26% 향상, p95 지연 91% 감소, 토큰 비용 90%+ 절감을 보고하며 graph 변형은 추가 ~2%(https://arxiv.org/abs/2504.19413). graph DB는 한 옵션일 뿐 필수 아님 — vector/dict 영속도 무방.

**Agent 보안 (필수)**: tool-use 에이전트는 untrusted text를 통한 **indirect prompt injection**에 노출되며, 이는 OWASP LLM01(#1) 위험이다.

- **모든 tool call을 원래 사용자 의도에 대조 검증**(action screening) — 패턴 필터만으로는 불충분.
- **dual-LLM 패턴**: privileged LLM은 도구를 쥐되 untrusted 콘텐츠를 직접 읽지 않고, quarantined LLM은 untrusted를 읽되 행동할 수 없다. quarantined 출력은 명령이 아닌 **데이터로** 전달. 최소 권한·파라미터 검증·관측 필터링을 계층화 (https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

### 5.4 거버넌스 게이트 — 액션 직전 enforce

추천/캠페인을 emit하기 **직전에** 게이트를 통과시킨다(whchoi GCC 시나리오 I 패턴: Guardrails + AGREED_TO consent matrix 통과 후에만 발송).

1. **PII redaction (프롬프트 진입 전)**: 원시 PII를 타입화된 번호 placeholder(`[USER_1]`, `[ADDRESS_1]`)로 치환. 이것이 operative control인 data minimization(GDPR Art. 5(1)(c))이며, **사후 출력 필터링만으로는 불충분**하다 — 최소 공개 원칙을 프롬프트 입력 시점에 적용 (https://arxiv.org/abs/2510.03662). 로컬에선 Presidio/규칙 기반으로 대체(단 Bedrock Guardrails의 managed topic policy와 품질 동등하지 않음 — 명시할 것).
2. **Consent matrix**: `User-AGREED_TO-Term`을 **프롬프트·retrieval에 무엇이 들어가는지 게이팅하는 live control**로 모델링 — 일회성 체크박스가 아님. opt-out은 해당 데이터를 retrieval에서 제거해야 한다(가이드 수준 권고; https://www.protecto.ai/blog/why-user-consent-is-revolutionizing-llm-privacy-practices/).
3. **OSDK 토큰 스코핑 원리 차용**: 소비자에겐 필요한 subset만 노출(추천 이유는 주되 원시 PII는 제외). pydantic view model / redacted projection으로 구현.

**Pitfall**: redaction을 출력단에만 두는 것 — placeholder는 프롬프트 *입력 전*에 적용해야 memorization·breach 리스크가 줄어든다.

### 5.5 Bias & 평가 (2축 + fairness audit)

LLM-as-judge와 추천 품질을 분리해 평가한다.

- **2축 분리**: ① 추천 품질(held-out future order에 대한 NDCG@K / Precision@K / hit-rate, 시간 기준 train/test split) ② 설명 faithfulness(인용 경로 존재 여부). diet/AVOIDS 위반은 **0건이 hard gate(100% 필수)**.
- **Cross-provider LLM-judge 패널, self-judge 금지**: 자기 출력 선호(self-preference) 편향은 NeurIPS 2024에서 자기-인식과 자기-선호의 선형 상관으로 입증됨(Panickssery et al., https://proceedings.neurips.cc/paper_files/paper/2024/hash/7f1f0218e45f5414c79c0679633e47bc-Abstract-Conference.html). position·verbosity 편향도 문서화됨(https://arxiv.org/abs/2412.05579). judge가 자기 provider 출력을 채점하지 않게 하고 위치 순서를 랜덤화. (주의: "12종 편향", "frontier 모델 50%+ 실패", "3-judge ~97-98% F1" 같은 수치는 blog 출처이며 primary로 확인 불가 — 방향성만 채택.)
- **Proxy discrimination audit**: cuisine·neighborhood·order-timing은 보호 속성이 없어도 인종·소득을 인코딩한다 — **보호 속성 제거가 편향 제거가 아니다**(https://arxiv.org/pdf/2204.08085). counterfactual 체크(ageBand/region을 뒤집어도 추천이 임계 이하로만 drift하는지)로 검증.
- **벤치마크 정직성**: 소비자 food-delivery 추천 fairness 벤치마크는 **존재하지 않는다**. FairEval의 34.79% 격차는 음악·영화 도메인이고(https://arxiv.org/abs/2504.07801), Deliveroo counterfactual fairness 사례는 **gig-worker 랭킹 차별** 판례이지 소비자 추천이 아니다(https://pmc.ncbi.nlm.nih.gov/articles/PMC9643653/). 두 결과를 하나의 food-delivery 추천 연구처럼 제시하지 말 것 — fairness는 측정 지표가 아닌 **가이던스**로 제공.

---

## 6. whchoi/AWS 블루프린트 이식 포인트

이 절은 분석된 whchoi.net PoC 3종(gcc·retail·assembly)에서 **무엇이 옮겨오는가**를 정리한다. 각 패턴마다 (a) AWS 원본 구현과 (b) 로컬 노트북용 경량 OSS 대체를 짝지어 제시한다. 단, AWS 컬럼은 분석 문서에서 검증된 사실이고, **OSS 컬럼 전체는 설계 제안(design proposal)이지 demo에서 추출된 사실이 아니다** — 어디에도 NetworkX/FAISS/Presidio 등은 등장하지 않는다([summary.md](/home/ubuntu/person-profile-ontology/design/summary.md), [analysis.md](/home/ubuntu/person-profile-ontology/design/analysis.md)).

### 6.1 이식 포인트 매핑 테이블

| # | 이식 포인트 | AWS 원본 구현 (검증됨) | 로컬 OSS 대체 (설계 제안) | 등가성 주의 |
|---|---|---|---|---|
| 1 | **4-part 스켈레톤** (ontology graph / hybrid search / Agentic AI / governance) | gcc(GS Caltex)가 architecture-reference 원본, retail·assembly가 6-stack CDK·디렉터리·harness를 "100% 동일"하게 재사용, 도메인 클래스/페르소나/시나리오만 교체 (ADR-0001, [analysis.md §11](/home/ubuntu/person-profile-ontology/design/analysis.md)) | 노트북 12-section 구조로 동일 스켈레톤 재현, food-delivery 도메인 의미만 주입 | 구조는 그대로 이식 가능. 검증 강도 high |
| 2 | **source/provenance 태깅** | assembly: 모든 클래스에 `source: Literal['real','synthetic','external']` (`/api/ontology/classes`, [analysis.md L60]). gcc: `Customer.data_depth ∈ {deep-history, coupon-only, sales-only, lookalike-syn}` ([gcc L70]) | 노드 속성 `source: Literal['real','synthetic','external']` + data-depth/confidence 신호를 pydantic/networkx 노드에 부여 | **retail에는 per-node source 필드 없음** — 화면 레벨 라벨로만 provenance 표기. 보편적 패턴으로 가정하지 말고 "좋은 아이디어"로 채택 |
| 3 | **persona = presentation layer** (one graph, many lenses) | gcc: 5개 부서 페르소나를 KPI weight vector로 명시(marketing=conversion·roas), 시나리오 D가 customer 속성 · KPI 벡터 dot-product로 best_persona 산출([gcc L137/154]). assembly: 6 페르소나가 동일 metric 위에서 tone/sort/top_k/masking만 토글([analysis.md §2]) | profile 속성 벡터 vs persona KPI weight 벡터의 dot-product 스코어링. 페르소나는 별도 데이터셋이 아니라 단일 fact graph의 뷰 | KPI weight vector / dot-product 메커니즘은 **gcc에만 명시**. assembly는 affinity matrix(topic 0.40/KPI 0.35/tone 0.25), retail은 페르소나를 graph object로 모델링 |
| 4 | **hybrid search** | assembly·gcc: BM25(Nori) → Cohere embed-v4 KNN → RRF(k=60) → Cohere rerank-v3 → Neptune 1-hop([analysis.md L142], [gcc L134]) | rank_bm25 → sentence-transformers + FAISS KNN → ~10줄 RRF → HF cross-encoder(ms-marco MiniLM) → networkx 1-hop. Nori는 한국어 토크나이저이므로 영어 합성 데이터에서는 drop | **파이프라인 SHAPE만 복사**. `k=60`·`0.78±0.12 confidence`는 assembly-only 상수(retail은 "실질 동일"이라고만 명시). **MiniLM ≠ Cohere rerank-v3 품질**, k는 튜너블 |
| 5 | **1-3 hop graph traversal** | assembly `/mindmap`: depth=1 in-memory 즉시, depth≥2 Neptune Cypher multi-hop, 5 start types, double-click expand([analysis.md L84/300]). retail recommendation/safety/CRM 경로 = 명시적 graph walk([retail §3.2]) | networkx: depth=1 in-memory BFS, depth≥2도 in-memory 다중 hop. food-delivery 엣지로 재매핑: `User-PLACED-Order-CONTAINS-Dish-OF_CUISINE-Cuisine`, `User-AVOIDS-Ingredient<-CONTAINS-Dish` | 데모 규모(노드 수백~수만)에서는 networkx로 충분. food-delivery 엣지 스키마는 retail 경로의 faithful 전치이지 데모 원문은 아님 |
| 6 | **safety/dietary lens** (가장 직접 이식 가능) | retail 시나리오 E `/safety`: target profile(임산부/4세/글루텐프리/비건/당뇨 등) 선택 또는 NL → `AVOIDS_INGREDIENT` walk → 위반 제품 auto-highlight([retail L154/174]). 검증 INCI 82/82, FoodOn 219/219([retail L134]) | `(User\|Persona)-AVOIDS->Ingredient<-CONTAINS-Dish` graph walk로 위반 dish hard-prune. FoodOn IRI + schema.org RestrictedDiet(11 enum) 노드 속성으로 carry | retail safety 도메인은 화장품+식품 CPG로 더 넓음 — dietary subset만 전치. `AVOIDS_INGREDIENT`는 데모 규모(19 엣지) |
| 7 | **compliance gate** (action 직전) | gcc 시나리오 I `/compliance`: Bedrock Guardrails 4-topic INPUT 체크 + `Customer × Term` AGREED_TO consent matrix → eligible/blocked, "gate 통과 후에만 발송"([gcc L142/159/214]). assembly 시나리오 L: 민감/참사/미성년 광고 자동 거절([analysis.md L175]) | rule-based / Presidio-style PII 레닥션 + consent-matrix dict(`User-AGREED_TO-Term`) 검사. 프롬프트 진입 전 PII를 typed placeholder(`[USER_1]`,`[ADDRESS_1]`)로 치환 | **Presidio ≠ Bedrock Guardrails** managed topic policy. 데모 gate는 campaign 발송 직전(검색 결과 아님) — "모든 추천 직전" 적용은 합리적 확장이나 데모 원문보다 강함. **어떤 demo도 PII 레닥션을 실제 구현하지 않음** — 처방적 확장 |

### 6.2 추가 이식 포인트 (보조)

| 이식 포인트 | AWS 원본 (검증됨) | 로컬 OSS 대체 |
|---|---|---|
| **clustering 세그먼트** | gcc 시나리오 E: sklearn KMeans k=6 + Sonnet centroid 라벨 + 선택적 Neptune write-back([gcc L138/155]). assembly E: KMeans k=5, silhouette 0.42([analysis.md L154]) | scikit-learn KMeans(RFM) + silhouette + Claude 라벨. **retail에는 KMeans 시나리오 없음**(RFM/lift/Laplace 사용) — "retail이 KMeans clustering" 주장은 오류 |
| **lookalike 확장** | gcc 시나리오 F: 5-customer SEED → 사전구축된 50K cohort 중 top-N%(예 ~10K) KNN 반환([gcc L156]) | FAISS KNN으로 seed 임베딩 인접 검색. **"500 real → 50K via KNN" 아님** — 50K는 구성된 cohort 크기 |
| **validation report = first-class screen** | retail `/validation`: 4 coverage 체크(INCI 82/82, FoodOn 219/219, GS1↔KFDA 4/4)([retail L134]). gcc `/validation`: 5 count-range sanity 체크([gcc L113]) | section 1에서 node/edge 카운트 + 표준 매핑 coverage를 first-class 출력으로 print | — |
| **external-signal fusion** | gcc 시나리오 N `/weather`: KMA WeatherObservation × FuelTransaction region·date join([gcc L147]). 시나리오 J: 4개 외부 소스 → Sonnet 교차 narrative([gcc L143]) | external 노드(`source='external'`)를 region/date로 join. food-delivery 전치(비 → 배달 수요)는 분석자 예시 |
| **Agentic AI = tool-use loop** | gcc 시나리오 B: Sonnet 4.6 + AgentCore Memory + Guardrails + 10 named tools(SSE). retail: 4 tools(kb_lookup, memory_recall, neptune_subgraph, semantic_search)([retail L168]) | Claude tool-use loop + 소규모 typed tool set(`graph_query`, `profile_compute`, `recommend`, `apply_action`). Code Interpreter = 노트북 자체 | **AgentCore Memory의 managed short/long-term, Firecracker microVM 격리는 raw 노트북에 없음**. tool-use loop도 외부 LLM API 호출 — "pure local"은 과장 |

### 6.3 이식 시 핵심 경고

- **OSS 대체 표 전체는 검증된 사실이 아니라 설계 제안**이다. 품질 비등가(MiniLM≠Cohere rerank-v3, Presidio≠Bedrock Guardrails)이며 Claude tool-use loop는 외부 API에 의존하므로 "완전 로컬"은 과장 — 명시할 것([whchoi transfer 분석](/home/ubuntu/person-profile-ontology/design/summary.md)).
- **per-node `source` enum의 보편성**은 가장 큰 정정 포인트: assembly만 확인, gcc는 `data_depth`, retail은 화면 레벨. 채택은 권장하되 "관찰된 universal"로 가정 금지.
- **hybrid-search 상수**(k=60, 0.78±0.12)는 assembly-only 측정값 — cross-demo 상수로 옮기지 말고 SHAPE만 복사.
- compliance gate는 데모상 campaign **발송** 직전 게이트지 검색 결과 게이트가 아니다 — "추천 직전 게이트"로의 일반화는 합리적 확장임을 표기.

---

## 7. 권고 — 실무 방법론 (Palantir 벤치마크 대비)

### 7.1 핵심 명제

음식배달 프로파일링의 권고 방법론은 한 문장으로 요약된다: **온톨로지 기반 사용자 프로파일 → 설명 가능하고(explainable) 식이 안전한(diet-safe) 식당/메뉴 추천**, 그리고 그 hero insight는 **"선언된 선호 vs 드러난 선호의 불일치(stated-vs-revealed mismatch)"** 다.

설계 원칙은 Palantir Foundry Ontology의 핵심 통찰을 그대로 차용한다: **온톨로지는 데이터가 아니라 의사결정을 표현한다.** Foundry 공식 문서는 "The Ontology is designed to represent the complex, interconnected decisions of an enterprise, not simply the data"라고 명시하며, 데이터(객체/링크/속성)를 semantic "nouns", 액션/함수를 kinetic "verbs"로 규정한다 ([architecture-center/ontology-system](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)). 따라서 스키마를 **데이터에서가 아니라 단 하나의 의사결정 — "이 사용자에게 어떤 식당/메뉴를, 왜 추천하는가" — 에서 역산(backward design)** 한다.

### 7.2 Palantir 벤치마크: Adopt / Adapt / Skip

| Palantir 개념 | 결정 | 무엇을 / 왜 |
|---|---|---|
| **Decision-centric ontology** (nouns=객체/링크, verbs=액션) | **ADOPT (전면)** | 스키마를 추천 의사결정에서 역산. Foundry의 data/logic/action/**security** 4중 통합 의도를 consent gate + provenance tag로 복제하되, 관리형 인프라는 생략 ([overview](https://www.palantir.com/docs/foundry/ontology/overview)) |
| **Object Types / Objects / backing datasource** (Ontology Manager) | **ADAPT** | object type = networkx/kuzu 노드 라벨 + pydantic 클래스, backing datasource = 합성 생성기 + duckdb 테이블. Ontology Manager UI는 생략. (정정: 정식 예시는 Employee/Flight이지 Airport/JFK가 아님 — [object-types-overview](https://www.palantir.com/docs/foundry/object-link-types/object-types-overview)) |
| **Derived Properties** (런타임 집계 count/avg/sum/collect, **READ-ONLY**) | **ADOPT (주의)** | 각 프로파일 차원을 재계산 가능한 순수 pandas/duckdb 함수로 미러링. **결정적 주의: override 가능한 필드(예: priceSensitivityOverride)는 derived가 아니라 STORED property로 만들어 액션으로 수정해야 한다** — derived는 쓰기 불가 ([derived-properties](https://www.palantir.com/docs/foundry/object-link-types/derived-properties)) |
| **Functions on Objects** (추천/스코어링) | **ADOPT (패턴만)** | PPR/LightGCN 랭킹·유사도를 그래프 위 Python 함수로 구현. (정정: `findSimilarRestaurants`는 TypeScript OSDK 예시이며, "arbitrary complexity" 같은 문구는 verbatim 인용이 아님 — 역량만 차용 [functions/overview](https://www.palantir.com/docs/foundry/functions/overview)) |
| **Action Types** (parameters / submission-criteria / validation / side-effects) | **ADOPT** | `apply_action()` 래퍼로 eligibility/opt-in/frequency cap을 액션 경계에서 강제 ([action-types/overview](https://www.palantir.com/docs/foundry/action-types/overview)) |
| **Propose-then-apply** (AIP Logic는 액션에서 실행될 때만 쓰기) | **ADOPT (verbatim, 최강 패턴)** | "The Ontology will not be edited unless the Logic function is executed from an action, even if the function contains an Apply action block." LLM은 프로파일 수정을 **제안(propose)** 만 하고, `apply_action()`을 통해서만 그래프가 변경된다 — 가장 인용 가치 높은 거버넌스 근거 ([logic/blocks](https://www.palantir.com/docs/foundry/logic/blocks)) |
| **AIP Logic blocks + Chatbot Studio 6 tools** (auto/confirm 토글) | **ADAPT** | Claude tool-use 루프 + 소형 타입드 툴셋(`graph_query`, `profile_compute`, `recommend`, `apply_action`) + 쓰기 confirm 토글. 6개 정식 tool(Action/Object Query/Function/Update App Variable/Command/Request Clarification) 확인됨 ([agent-studio/tools](https://www.palantir.com/docs/foundry/agent-studio/tools)). 관리형 제품은 생략 |
| **OSDK token scoping** (온톨로지 부분집합 + 사용자 권한) | **ADOPT (원칙)** | PII 무거운 프로파일에 대해 소비자가 필요한 부분집합만 노출(추천 이유는 주되 raw PII는 제외). pydantic view model / redacted projection으로 구현, 코드 생성은 생략 ([ontology-sdk/overview](https://www.palantir.com/docs/foundry/ontology-sdk/overview)) |
| **Semantic/Kinetic + Security** (정식 3번째 축은 security) | **ADOPT (서사 축)** | semantic/kinetic + 거버넌스를 narrative spine으로. **'Dynamic layer' 삼분법은 비공식(커뮤니티 합성)이므로 SKIP** — 비-Palantir 용어 인용 회피 |
| **Foundry/Neptune-scale 인프라** (Neptune, OpenSearch, AgentCore, Bedrock Guardrails) | **SKIP (Phase 2)** | networkx/kuzu, rank_bm25/FAISS, Claude tool-use, Presidio/rule guardrail로 대체. **정직성 caveat: 품질 동등 아님** — MiniLM ≠ Cohere rerank-v3, Presidio ≠ 관리형 topic policy이며, Claude 루프는 여전히 외부 API 호출 |

### 7.3 권고 스택 (Pragmatic, AWS→OSS 대체)

> **정직성 framing**: 아래 AWS→OSS 대체표 전체는 whchoi 데모 문서에 존재하지 않는 **설계 제안**이며 추출된 사실이 아니다. 개별적으로 타당하나 품질은 동등하지 않고, "pure local"은 과장 — Claude tool-use 루프는 외부 API에 의존한다.

| 역할 | 권고 (OSS local) | AWS 원본 | 주의 |
|---|---|---|---|
| 그래프 (traversal/PPR/meta-path) | networkx (+ GraphSAGE/LightGCN-lite) | Neptune | — |
| 그래프 저장 (embedded Cypher) | kuzu | Neptune openCypher | 설계 제안 |
| 저장/프로파일링 (SQL 집계) | duckdb + pandas | — | derived-property 미러 |
| 어휘 검색 | rank_bm25 | OpenSearch BM25 | Nori 제거(한국어 토크나이저 → 영어 합성데이터) |
| 의미 검색 | sentence-transformers + FAISS | Cohere embed-v4 KNN | — |
| 융합 | ~10줄 RRF (k는 튜너블) | — | k=60은 assembly/gcc 전용 상수 — 보편 아님 |
| 재랭킹 | HF cross-encoder ms-marco MiniLM | Cohere rerank-v3 | **품질 비동등** — 0.78±0.12는 assembly-only, 이식 상수 아님 |
| LLM (선택, 외부 API) | Claude (Anthropic API) | Bedrock Sonnet | "pure local" 과장 — 외부 의존 |
| 구조화 출력 | pydantic + constrained decoding | — | JSON mode 아닌 **Structured Outputs** ([OpenAI docs](https://developers.openai.com/api/docs/guides/structured-outputs)) |
| 거버넌스 | rule/Presidio PII redaction + consent dict | Bedrock Guardrails | **비동등** — 관리형 topic policy 아님 |
| 표준 | schema.org RestrictedDiet enum + FoodOn IRI를 노드 속성으로 | — | RDF reasoner 불필요; OWL allergen 추론이 hard requirement일 때만 rdflib |
| 평가 | scikit-learn (KMeans/silhouette) + NDCG/Precision@K/hit-rate + cross-provider LLM-judge | — | self-judge 금지 (NeurIPS 2024 self-preference) |

**그래프 vs RDF 결정**: property graph(networkx/kuzu)를 기본 substrate로 쓰고 FoodOn·schema.org IRI는 노드 속성으로 운반한다. RDF/SPARQL은 형식 추론(OWL allergen propagation)이 hard requirement일 때만 도입 — property graph는 inline 속성으로 traversal/analytics에 빠르고, RDF는 추론 대가로 statement 폭증을 치른다 ([Ontotext](https://www.ontotext.com/knowledgehub/fundamentals/rdf-vs-property-graphs/)).

### 7.4 의견 있는 핵심(opinionated core) — 양보 불가 5원칙

1. **Provenance를 스키마에 굽는다.** 모든 노드가 `source: Literal['real','synthetic','external']`을 운반(assembly 패턴) + data-depth/confidence 신호. "합성을 실데이터로 갈아끼우면 production화된다"는 메시지가 스키마 수준에서 성립. **단, 보편 검증된 사실 아님** — retail은 screen-level로만 provenance 태깅하므로 "좋은 아이디어"로 채택하되 "cross-demo 보편"으로 주장하지 않는다.

2. **Explainability는 일급 출력이다.** user→item을 잇는 타입드 meta-path가 곧 reason string. 모든 LLM 설명은 검색된 그래프 경로에 grounding되고 evidence로 로깅 — free recall 금지. 이것이 headline의 차별점이자 가장 연구로 뒷받침되는 주장(KGLA: NDCG@1 +33~95% — [arXiv 2410.19627](https://arxiv.org/abs/2410.19627)).

3. **식이/알레르겐은 추론하지 라벨을 믿지 않는다.** Dish의 vegetarian/spicy 플래그는 ingredient 조합에서 추론. `(User|Persona)-AVOIDS->Ingredient<-CONTAINS->Dish` 경로로 위반 항목 hard-prune — retail의 AVOIDS_INGREDIENT lens가 **가장 직접 이식 가능한 feature**다. 최종 추천에서 식이 위반 0건은 hard gate(100% 필수). FoodOn→allergen 전파는 검증할 design pattern이지 turnkey 보장이 아니다.

4. **거버넌스는 액션 직전(just-before-action) gate다.** guardrail check + consent matrix(`User-AGREED_TO-Term`)를 통과한 뒤에만 emit (gcc 시나리오 I: "compliance gate 통과 후에만 발송"). 프롬프트 진입 전 PII를 타입드 numbered placeholder(`[USER_1]`,`[ADDRESS_1]`)로 redaction — data minimization, GDPR Art. 5(1)(c); post-hoc 출력 필터만으로는 불충분 ([arXiv 2510.03662](https://arxiv.org/abs/2510.03662)). **단, 어떤 whchoi 데모도 실제 PII redaction을 구현하지 않음 — 이는 처방적(prescriptive) 확장이다.**

5. **평가는 항상 두 축으로 분리한다.** schema-validity(constrained decoding으로 ~100% 기대)와 attribute-accuracy(진짜 신호 — 넓은 spread, 벤치마크 ~13.7pt value-accuracy 격차 — [arXiv 2502.14905](https://arxiv.org/pdf/2502.14905))를 절대 하나로 합치지 않는다. 추천 품질(NDCG/Precision@K/hit-rate)과 설명 충실도(인용된 경로가 실제 그래프에 존재하는가)도 별개 지표. judge는 cross-provider panel만 — self-judge 금지.

### 7.5 채택했지만 절제한 production 기법

- **User encoding**: raw user id 대신 recency-weighted bag of ordered restaurant/cuisine id (Uber Eats: ~20x 작음, cold-start 친화 — [Uber](https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/)).
- **Ranking**: training-free Personalized PageRank / random-walk-with-restart(Pixie-style)이 기본 — 3B 노드/17B 엣지, 1,200 req/s @ 60ms, Pinterest engagement >80% 지원 ([arXiv 1711.07601](https://arxiv.org/abs/1711.07601)). LightGCN(NGCF 대비 ~16% — [arXiv 2002.02126](https://arxiv.org/abs/2002.02126))은 선택적 learned 업그레이드.
- **Cold-start**: 신규 사용자는 multilevel geo prior(DoorDash: district 영향 최대, global 최소)로 warm-start한 Thompson-sampling cuisine bandit, time-of-day 재파라미터화 ([DoorDash](https://careersatdoordash.com/blog/personalized-cuisine-filter/)). 신규 item은 content embedding(cuisine/diet/price 연결) + attribute-permutation 합성 쿼리(Instacart — [Instacart](https://company.instacart.com/how-its-made/how-instacart-uses-embeddings-to-improve-search-relevance)). 서사 anchor는 ontology↔embedding 상보성(Uber Eats: KG가 cold market에서 behavioral data가 못 메우는 것을 커버).
- **Memory**: Mem0-style ADD/UPDATE/DELETE 통합으로 신규 주문 시 incremental 갱신(OpenAI memory 대비 LLM-judge +26%, p95 -91%, 토큰 >90% 절감; graph variant 선택적 +~2% — [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)). 로컬 영속(kuzu/duckdb/dict) — graph DB는 한 옵션이지 필수 아님.

### 7.6 두 가지 정직성 경고

- **two-tower retrieve-then-rank**는 개념적으로만 미러링(offline item embedding + ANN) — 그 규모는 불필요.
- **Fairness**: 음식배달 **소비자 추천** fairness 벤치마크는 존재하지 않는다. FairEval의 34.79% disparity는 music/movie 도메인이고([arXiv 2504.07801](https://arxiv.org/abs/2504.07801)), Deliveroo 판례는 gig-worker(소비자 아님) 사례다. 따라서 fairness는 처방적 guidance로 제시: proxy discrimination(cuisine/neighborhood/timing이 income/ethnicity를 encode — 보호속성 제거가 bias를 제거하지 않음) 감사와 counterfactual stability 체크(ageBand/region flip 시 추천 안정성)로 대응한다.

---

## 8. 노트북 설계 — 합성 데이터 테스트 구현

> Phase 2 구현을 곧바로 시작할 수 있도록 한 **로컬 실행 가능한 단일 노트북**의 설계도. 헤드라인은 **"온톨로지 기반 사용자 프로필 → 설명 가능·식단 안전한 식당/메뉴 추천"**, 영웅 인사이트는 **선언(stated) vs 행동(revealed) 선호 불일치**다. AWS→OSS 치환표는 *설계 제안*이며 품질 동등이 아니다(MiniLM ≠ Cohere rerank-v3, Presidio ≠ Bedrock Guardrails, Claude tool-use는 여전히 외부 API 호출 — "pure local"은 과장).

### 8.1 설계 원칙 — 의사결정 중심 온톨로지

데이터가 아니라 **하나의 의사결정**("이 사용자에게 어떤 식당/메뉴를, 왜 추천하는가")을 구동하는 최소 명사(object types + typed links)와 동사(governed actions)만 설계한다. Palantir의 "represent the complex, interconnected decisions of an enterprise, not simply the data" 프레이밍을 채택한다([architecture-center/ontology-system](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)). FoodOn / schema.org IRI를 처음부터 노드 속성으로 들고 다녀(carry-as-attribute) RDF 추론 비용 없이 표준에 정박한다 — property graph가 traversal·analytics에 적합하고, RDF/OWL는 식단 추론이 hard requirement가 될 때만 유보한다([Ontotext](https://www.ontotext.com/knowledgehub/fundamentals/rdf-vs-property-graphs/)).

### 8.2 기술 스택 (로컬 OSS)

| 레이어 | 도구 | 대체 대상(AWS) | 주의 |
|---|---|---|---|
| Graph traversal/PPR/meta-path | **networkx** (in-memory) | Neptune openCypher | — |
| Graph storage/Cypher | **kuzu** (embedded) | Neptune | 설계 제안, 데모 미검증 |
| Storage/profiling | **duckdb + pandas** | — | derived property = 재계산 가능 순수함수 mirror |
| Lexical search | **rank_bm25** | OpenSearch BM25 | Nori 제거(한국어 토크나이저 → 영문 합성데이터) |
| Semantic search | **sentence-transformers + FAISS** | Cohere embed-v4 KNN | RRF k는 튜닝 변수, 데모의 k=60 상수 아님(assembly/gcc 전용) |
| Rerank | **HF cross-encoder ms-marco MiniLM** | Cohere rerank-v3 | **품질 비동등** — 0.78±0.12는 assembly 전용, 이식 금지 |
| LLM (선택, 외부 API) | **Claude (Anthropic API)** | Bedrock + AgentCore | profile-card/persona/cluster label/explanation |
| Structured outputs | **pydantic + constrained decoding / function-calling** | — | JSON mode 아님 |
| Governance | **rule-based / Presidio-style PII redaction + consent dict** | Bedrock Guardrails | 관리형 topic policy와 비동등 |
| 표준 | **schema.org RestrictedDiet + FoodOn IRI (node attr)** | — | RDF reasoner 불필요 |
| Eval | **scikit-learn (KMeans, silhouette) + ranking metrics + cross-provider LLM-judge** | — | self-judge 금지 |

### 8.3 합성 데이터 계획

결정론적(deterministic, seed 고정) 생성기로 다음을 만든다. **모든 노드는 `source: Literal['real','synthetic','external']` provenance 속성**을 가진다(assembly 패턴 채택; 단 이는 cross-demo universal이 아님 — retail은 화면 단위로만 provenance 태깅하므로 *좋은 아이디어로 채택*하되 검증된 보편 사실로 인용하지 않는다). 이미 검증된 **8-user Neptune fixture를 로컬 baseline으로 포팅·확장**한다.

핵심: **declared 신호와 behavioral 신호를 동시에** 심어 영웅 불일치를 구성 가능하게 만든다.
- **Declared**: `User-LIKES_CUISINE->Cuisine`(선언), `User-HAS_DIET->DietConstraint`
- **Behavioral**: `User-PLACED->Order-AT->Restaurant-SERVES->Cuisine` (주문 이력)
- 생성기는 ground-truth aggregation을 함께 산출해 profile dimension 정확도를 결정론적으로 검증할 수 있게 한다(8.7).

생성 엔티티: `User, Restaurant, Cuisine, Dish, Ingredient, Order, Region`. 시간 기준 train/test split을 위해 Order에 timestamp를 부여한다.

### 8.4 온톨로지 스키마 (food delivery)

**Object types (classes)**: `User, Restaurant, Cuisine, Dish, Ingredient, Order, Region, Persona, DietConstraint, Term(consent), Campaign`.

**Links** (cardinality 태깅, Palantir link-types 모델 — 1:1 / 1:many / many:many):

| 범주 | 관계 |
|---|---|
| Behavioral | `User-PLACED->Order`, `Order-AT->Restaurant`, `Order-CONTAINS->Dish`, `Restaurant-SERVES->Cuisine`, `Dish-OF_CUISINE->Cuisine`, `User-LIVES_IN->Region`, `Restaurant-LOCATED_IN->Region` |
| Declared | `User-LIKES_CUISINE->Cuisine`, `User-HAS_DIET->DietConstraint` |
| Safety (영웅 lens) | `(User\|Persona)-AVOIDS->Ingredient`, `Dish-CONTAINS->Ingredient` |
| Persona/governance | `User-HAS_PERSONA->Persona`, `Campaign-TARGETS->Persona`, `User-AGREED_TO->Term` |

**load-bearing meta-path 2개**:
1. 설명용 — `User->Order->Restaurant->Cuisine` (추천 reason string)
2. 안전용 — `User-AVOIDS->Ingredient<-CONTAINS-Dish` (retail의 `AVOIDS_INGREDIENT` lens 전치 — 가장 직접 이식 가능한 feature, retail scenario E에서 검증됨)

**표준 매핑**:
- `DietConstraint` → schema.org **RestrictedDiet 11개 enum**: `DiabeticDiet, GlutenFreeDiet, HalalDiet, HinduDiet, KosherDiet, LowCalorieDiet, LowFatDiet, LowLactoseDiet, LowSaltDiet, VeganDiet, VegetarianDiet`(라이브 페이지 11개 정확 검증, [schema.org/RestrictedDiet](https://schema.org/RestrictedDiet)).
- `Ingredient` free-text → 정규 **FoodOn class IRI** (FoodKG의 `foodon-links.trig` ~30K triple이 이 ingredient canonicalization 레이어; [foodkg.github.io](https://foodkg.github.io/foodkg.html)). **Entity reconciliation은 선택이 아니라 필수 전처리**다.
- `Dish`의 vegetarian/spicy 등 플래그는 **라벨을 믿지 않고 ingredient 구성에서 추론**한다(inference-from-composition). FoodOn→allergen propagation은 *건전한 설계 패턴*으로 다루되 turnkey 보장으로 인용하지 않고 실제 OWL release에 검증한다.

**Properties / Derived properties** (Palantir 구분 엄수):
- **STORED**: `userId, name, ageBand, source`, 그리고 action으로만 편집되는 override 필드(예: `priceSensitivityOverride`). **derived property는 read-only이므로 override는 절대 derived로 모델링하지 않는다**([derived-properties](https://www.palantir.com/docs/foundry/object-link-types/derived-properties), read-only verbatim 확인).
- **DERIVED (read-only, 재계산)**: `revealed_cuisine_affinity, rfm_scores, price_tier_pref, novelty_score, diet_vector` — 각각 Order link 위의 count/avg/sum/collect aggregation을 mirror하는 순수 pandas/duckdb 함수.

### 8.5 프로필 모델 — 차원(dimensions)

각 차원 = linked object 위의 결정론적 aggregation(재계산 가능 pure function).

| 차원 | 정의 | 근거 |
|---|---|---|
| Revealed cuisine affinity | `PLACED->AT->SERVES->Cuisine` count, time-decay 가중 | — |
| **Stated vs revealed gap** | `LIKES_CUISINE`(선언) vs top revealed cuisine — **영웅 불일치 신호** | headline |
| Price sensitivity | avg order total + restaurant priceTier 분포 | — |
| RFM | recency / frequency / monetary | DoorDash·retail 세분화 backbone (RFM은 공개 데이터 practitioner 관행 — 생산 시스템 사실 아님) |
| Dietary profile + hard constraints | `HAS_DIET`→RestrictedDiet, `AVOIDS`→FoodOn — **soft 신호 아닌 hard filter** | retail safety lens |
| Novelty appetite | repeat-rate vs new-restaurant-rate | DoorDash Familiarity/Affordability/Novelty triad — *한 회사 프레이밍, 업계 표준 아님* |
| Spice/veg tendency | order 이력 Dish 플래그에서 추론 | — |
| Recency-weighted bag-of-restaurant/cuisine-id 임베딩 | raw userId 대신 주문 store/cuisine id 가방 | Uber Eats verbatim: 모델 ~20x 축소, cold-start 친화 ([Uber](https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/)) |
| Persona match vector | profile 속성 · persona KPI weight dot-product | gcc scenario D (KPI 가중 벡터는 gcc에서 literal) |
| Provenance/confidence | source tag + data-depth(각 차원을 뒷받침하는 실 이력 양) | gcc `data_depth` 패턴 |

### 8.6 노트북 섹션/셀 순서

헤드라인 산출을 향한 ordered sections. **각 섹션은 입력→연산→출력(검증 리포트)을 명시**한다(validation-report-as-first-class-screen 패턴).

| # | 섹션 | 핵심 셀 / 산출 |
|---|---|---|
| 1 | **Setup & 합성 데이터** | seed 고정 생성기(8-user fixture 확장); 모든 노드 `source` 태깅; node/edge count 출력 |
| 2 | **그래프 빌드 + ingredient reconciliation** | networkx + kuzu 적재; ingredient→FoodOn IRI; diet→RestrictedDiet enum; Dish 플래그를 구성에서 추론 |
| 3 | **프로필 계산 (derived properties)** | RFM·affinity·price·novelty·diet vector를 pure pandas/duckdb 함수로; profile card 렌더; **STATED-VS-REVEALED 불일치 노출(영웅)** |
| 4 | **하이브리드 검색 baseline** | BM25 + FAISS-KNN → RRF → cross-encoder rerank → top 노드 + 1-hop 이웃 (파이프라인 *shape* 복사, 상수 복사 금지) |
| 5 | **식단 안전 candidate 생성** | `AVOIDS`/diet 위반 Dish를 graph walk로 **먼저 hard-prune**; 무엇이·왜 필터됐는지 표시 (constraint-as-filter) |
| 6 | **설명 가능 랭킹** | survivor에 Personalized PageRank / random-walk-with-restart (training-free, Pixie-style); typed meta-path = reason string; optional LightGCN 업그레이드 셀 |
| 7 | **Cold-start** | 신규 user: Thompson-sampling cuisine bandit + multilevel geo prior(district 최대·global 최소) + time-of-day; 신규 dish: 속성 concat content 임베딩 + attribute-permutation synthetic query (Instacart) |
| 8 | **LLM 프로필/페르소나 (선택, API)** | constrained-decoding Structured Outputs → profile card JSON + persona narrative + cluster label; 설명은 retrieved path에만 grounding; **schema-validity와 attribute-accuracy 별도 보고** |
| 9 | **메모리 & write-back (governed action)** | Mem0-style ADD/UPDATE/DELETE 통합; 모든 ontology edit은 `apply_action()` wrapper(eligibility/opt-in/frequency cap)를 통과 |
| 10 | **거버넌스 게이트** | prompt 진입 전 PII typed-placeholder redaction + consent matrix(`AGREED_TO`) 체크를 **emit 직전**에; pass vs block 시연 |
| 11 | **페르소나 lens & 세분화 (subsumed)** | persona KPI 벡터 dot-product + KMeans(RFM)+silhouette+LLM label — *one graph, many lenses* |
| 12 | **평가 & 공정성 감사** | 8.7 참조 |

**랭킹 디폴트 근거**: PPR/RWR는 학습 불필요한 검증된 그래프 추천기다 — Pixie(arXiv [1711.07601](https://arxiv.org/abs/1711.07601)): 3B nodes/17B edges, 1,200 req/s @ 60ms, Pinterest engagement >80% 백킹(블로그의 "50% lift / 100B edges"는 별도 출처이므로 섞지 않음). LightGCN(arXiv [2002.02126](https://arxiv.org/abs/2002.02126))은 feature transform·비선형 제거·선형 전파만으로 NGCF 대비 ~16% 개선 — 선택적 학습 업그레이드.

**LLM 게이트 근거**: Structured Outputs(JSON-Schema-as-grammar)는 schema 적합을 보장하나 **content 정확도는 보장하지 않는다** — 구조 validity ~100%가 value accuracy를 움직이지 않으며 벤치마크는 ~13.7-pt value-accuracy spread를 보인다([Think Inside the JSON 2502.14905](https://arxiv.org/pdf/2502.14905), [JSONSchemaBench 2501.10868](https://arxiv.org/abs/2501.10868)). 따라서 두 지표를 절대 한 숫자로 합치지 않는다. write-back은 propose-then-apply: LLM은 edit을 *제안*만 하고 `apply_action()`을 통해서만 그래프가 변한다 — "The Ontology will not be edited unless the Logic function is executed from an action"([logic/blocks](https://www.palantir.com/docs/foundry/logic/blocks), verbatim, 가장 인용 가치 높은 거버넌스 근거).

**메모리 근거**: Mem0(arXiv [2504.19413](https://arxiv.org/abs/2504.19413)) — OpenAI memory 대비 LLM-judge +26%, p95 latency -91%, token cost >90% 절감, graph variant ~2% (graph는 선택 add-on이지 필수 아님). 신규 주문이 들어오면 full recompute 대신 증분 갱신한다.

### 8.7 평가

**두 축으로 평가하고 공정성을 감사**한다. 구조 validity와 content accuracy, 추천 품질과 설명 충실도는 항상 분리 보고한다.

| 평가 항목 | 지표 / 방법 | 기준 |
|---|---|---|
| 추천 품질 | NDCG@K · Precision@K · hit-rate/MRR (시간 기준 held-out future order) | — |
| Cold-start 품질 | 동일 지표를 synthetic 신규-user/신규-dish slice에 | bandit + content-embedding path |
| Profile 차원 정확도 | derived 값 vs 생성기 ground-truth aggregation (결정론적 대조) | exact match |
| **설명 충실도(anti-confabulation)** | 인용된 모든 meta-path가 그래프에 실제 존재하는지 자동 path-validation | 핵심 지표 |
| Structured-output 무결성 (2축) | schema-validity rate (~100% 예상) **AND** attribute-accuracy rate (실제 신호, wide spread 예상) | 절대 합산 금지 |
| 안전/식단 정확성 | 최종 추천에서 `AVOIDS`/diet 위반 0건 | **100% 필수 (hard gate)** |
| 거버넌스 | consent matrix가 올바르게 block한 비율 + PII-leakage 체크(raw PII가 prompt 도달 0) | data minimization, GDPR Art. 5(1)(c) ([2510.03662](https://arxiv.org/abs/2510.03662)) |
| 세분화 품질 | KMeans silhouette + LLM cluster label의 정성 일관성 | — |
| LLM-judge 프로토콜 | cross-provider 패널, 위치 무작위화, 자기 출력 채점 금지 | self-preference 완화 (NeurIPS 2024 Panickssery et al.) |
| 공정성 | counterfactual stability (ageBand/region/timing flip → 추천 drift < threshold) + proxy-feature 감사 | guidance로 제시 |

**공정성 주의**: 보호 속성 제거가 편향을 제거하지 않는다 — cuisine/neighborhood/timing이 income/ethnicity를 인코딩한다(proxy discrimination). counterfactual 체크(ageBand/region flip → 추천 안정 기대)를 쓴다. **단, food-delivery 소비자-추천 공정성 벤치마크는 존재하지 않는다**: FairEval(34.79% disparity, [2504.07801](https://arxiv.org/abs/2504.07801))은 음악/영화 도메인이고, Deliveroo 사례([PMC9643653](https://pmc.ncbi.nlm.nih.gov/articles/PMC9643653/))는 gig-worker rider-ranking이지 소비자 추천이 아니다 — 둘을 한 연구로 제시하지 않는다.

---

본 설계는 위 4-part 골격(온톨로지 그래프 · 하이브리드 검색 · Agentic AI · 거버넌스/검증)을 로컬 OSS로 이식한 Phase 2 구현 명세다. 핵심 through-line: ① schema 단위 provenance 태깅(synthetic↔real swap으로 productionize) ② first-class 산출물로서의 설명 가능성(typed meta-path = reason, 모든 LLM 설명은 retrieved path에 grounding) ③ action 직전 거버넌스 게이트(consent matrix + PII redaction + propose-then-apply) ④ 설계 단계부터 다룬 cold-start ⑤ 2축 평가 규율.

---

## 9. 대규모 온톨로지 — 구축 & 스토리지 아키텍처 (30M users / 10M DAU)

### 9.0 핵심 결론 한 줄
주문/이벤트 firehose를 **graph에 동기 write하지 않는다.** OLTP를 source of truth로 두고 log-based CDC를 freshness spine으로 삼아, graph(관계·traversal·설명) / online feature store(hot 저지연) / OLAP(대량 집계·batch profile)의 **3-tier로 fan-out** 한다. Uber Michelangelo의 "two pipelines, one online store"와 Pinterest Pixie의 "offline에서 prune+materialize, snapshot에서 serve"가 검증된 anchor다 ([Michelangelo](https://www.uber.com/blog/michelangelo-machine-learning-platform/), [Pixie WWW'18](https://cs.stanford.edu/people/jure/pubs/pixie-www18.pdf)).

### 9.1 30M / 10M DAU에서 진짜 병목 — 저장 용량이 아니다
검증된 사실로 먼저 오해를 제거한다.

| 통념 | 검증된 사실 | 시사점 |
|---|---|---|
| "노드/엣지가 너무 많아 graph DB가 못 버틴다" | Neptune은 vertex/edge/RDF quad **개수 제한 없음** (개별 property/label 값만 55MB 상한). 단일 cluster volume이 10GB 단위로 **128 TiB**(中/GovCloud 64 TiB)까지 autoscale, 6 copies/3 AZ를 high-water mark의 **1 copy로 과금** ([limits](https://docs.aws.amazon.com/neptune/latest/userguide/limits.html), [storage](https://docs.aws.amazon.com/neptune/latest/userguide/feature-overview-storage.html)) | raw storage는 binding constraint가 아니다 |
| "read QPS가 한계" | Neptune Database는 'Customer 360' 기준 **100,000 QPS**로 framing ([Neptune Analytics vs DB](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/neptune-analytics-vs-neptune-database.html)) | read는 replica로 확장 |
| (실제 한계) | Neptune Database는 **single-writer**. write throughput가 천장. 또한 in-place delete는 공간을 **절대 회수하지 않음**(export+reload만 가능); 대량 delete 트랜잭션은 internal log high-water mark를 **영구 팽창** ([storage](https://docs.aws.amazon.com/neptune/latest/userguide/feature-overview-storage.html)) | 10M DAU 주문 firehose를 동기 write하면 안 됨 → CDC→feature store로 우회 |
| (실제 한계) | **supernode**: 인기 식당/요리 1개 노드에 엣지 폭증. NebulaGraph는 vertex당 **>10,000 edges**를 super-vertex로 flag ([NebulaGraph](https://docs.nebula-graph.io/3.6.0/8.service-tuning/super-node/)) | pruning이 필수 |

**병목 3종 = write throughput + freshness + supernode** (storage 아님). 비용·아키텍처 결정은 모두 이 셋을 향한다.

### 9.2 Graph DB 옵션 & scale 한계

| 옵션 | 역할 | scale 특성 / 한계 |
|---|---|---|
| **Neptune Database** | live typed-relationship serving (관계·diet hard-prune·reason-path) | single-writer(write 천장), 100k QPS read, 무제한 노드수, blue/green 재구축 권장. **realization reference** |
| **Neptune Analytics** | scheduled batch PPR/RWR (in-memory engine) | "tens of billions of relationships, thousands of analytic queries/sec" 처리, m-NCU-hour 과금(256 m-NCU = **$7.68/hr**) ([doc](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/neptune-analytics-vs-neptune-database.html), [pricing](https://aws.amazon.com/neptune/pricing/)). batch RWR window에 한정 |
| TigerGraph / Nebula / JanusGraph | 대안 property graph | 본 PoC의 검증 anchor는 Neptune. NebulaGraph는 super-vertex 임계(>10k)·완화법(truncation/edge merge/edge-type partition/vertex split)의 **검증된 출처**로만 인용 ([NebulaGraph](https://docs.nebula-graph.io/3.6.0/8.service-tuning/super-node/)) |

> **벤치마크 vs 실현**: Palantir Foundry는 decision-centric 온톨로지의 **설계 north star**(이미 Phase-1 lock)지만, Foundry의 구체 pipeline/incremental API는 1차 출처로 검증 불가(JS-rendered, 웹 무근거)이므로 **API 식별자를 사실로 인용하지 않는다.** 모든 구체 scale/serving 수치는 Neptune·Uber·Pixie·Feast·Confluent·DynamoDB 등 독립 검증 출처에만 anchor한다.

### 9.3 Supernode 문제 & 완화 — pruning은 성능이자 품질
인기 식당/dish가 supernode가 되어 traversal·RWR을 폭파시킨다. 완화 kit:

| 완화 | 내용 | 근거 |
|---|---|---|
| **Edge pruning (1순위)** | low-weight 엣지 제거. Pixie는 3B-node/17B-edge 그래프를 **엣지 20%만** 남기고도 F1을 **+58%** 개선(δ=0.91) ([Pixie](https://cs.stanford.edu/people/jure/pubs/pixie-www18.pdf)) | prune은 줄이고 **동시에 sharpen**. (단, 58%는 tuned PEAK relative-to-baseline이지 보편 법칙 아님) |
| Truncation / range·limit | label/property 제약 + 조기 `range()`/`limit()` traversal | NebulaGraph / Neptune Gremlin best-practice |
| Edge merge | 일별 엣지를 월별로 병합 | NebulaGraph |
| Edge-type partition | `DEPART` → `DEPART_CEAIR`/`DEPART_CSAIR` 식 분할 | NebulaGraph |
| Vertex split / 관계의 vertex화 | 관계를 중간 vertex로 모델링, 핫 vertex 분할 | NebulaGraph |

Pixie의 또 다른 검증 사실: prune된 그래프는 단일 머신 **~120GB RAM**(244GB HugePages)에 적재, 서버당 **1,200 req/s @ 60ms p99**, **walk 비용은 그래프 크기와 무관** ([Pixie](https://cs.stanford.edu/people/jure/pubs/pixie-www18.pdf)). → "in-memory pruned snapshot이 live transactional traversal을 이긴다"는 **패턴**을 채택(수치는 Pinterest C++ 맥락, 그대로 SLO化 금지).

### 9.4 Partitioning / sharding
- **Graph**: write throughput가 천장이므로 firehose를 직접 sharding하기보다 **firehose를 graph 밖으로** 빼는 것이 1차 전략. supernode는 edge-type partition으로 분산.
- **Online feature store**: entity key(userId / restaurantId)로 자연 sharding (DynamoDB/Redis cluster).
- **ANN index**: geo/market 단위 partition + **incremental update**(full rebuild는 시간 단위 소요 → 사이사이 증분) ([two-tower](https://cloud.google.com/blog/products/ai-machine-learning/scaling-deep-retrieval-tensorflow-two-towers-architecture)).
- **OLAP**: S3/Iceberg를 시간·시장 파티션으로.

### 9.5 3-TIER 배치 결정표 (무엇을 어디에)
**결정 규칙 한 문장**: 요청이 typed relationship을 **traverse**하거나 meta-path로 **explain**해야 하면 GRAPH, hot path가 entity key로 sub-ms로 읽어야 하면 ONLINE FEATURE STORE, 다행(多行) heavy 집계·학습/분석 산출물이면 OLAP. *Graph는 관계용, feature store는 latency용, OLAP는 volume용.*

| 데이터 | 위치 | 이유 / 검증 anchor |
|---|---|---|
| typed 노드(User/Restaurant/Cuisine/Dish/Ingredient/Order/Region/Persona/DietConstraint/Term) + typed 링크(PLACED/AT/SERVES/CONTAINS/OF_CUISINE/LIKES_CUISINE/HAS_DIET/AVOIDS/AGREED_TO) | **GRAPH** | diet/allergen hard-prune(User-AVOIDS→Ingredient←CONTAINS-Dish), typed meta-path reason string(User→Order→Restaurant→Cuisine), 다홉 look-alike (locked 3·4) |
| FoodOn/schema.org RestrictedDiet IRI | **GRAPH node attribute** (+ OLAP 컬럼) | 표준은 속성으로만, **RDF reasoner 없음** (locked 7) |
| 최신값/유저(또는/식당): revealed_cuisine_affinity, RFM, price_tier_pref, novelty_score, diet_vector | **ONLINE FEATURE STORE** | profile = recalculable READ-ONLY derived (locked 1). Feast: "precomputing features is the recommended optimal path to ensure low latency" ([Feast](https://docs.feast.dev/getting-started/architecture/overview.md)) |
| `priceSensitivityOverride` 등 stored override | **ONLINE FEATURE STORE** (derived 값 옆에 나란히) | override는 derived 아닌 **stored property + governed action** (locked 2). 한 번의 keyed lookup으로 derived+override 동시 read |
| 전체 order history(월/년), time-decayed cuisine affinity, batch RFM, persona-KPI dot-product, **stated-vs-revealed mismatch(HERO)**, point-in-time 학습 테이블 | **OLAP / COLUMNAR** | stated-vs-revealed는 한 유저의 전 주문을 declared label과 비교하는 **wide batch 집계**지 live traversal 아님 (locked 8). 올바른 배치 위치 |
| order firehose 동기 write | **어디에도 graph 동기 write 금지** | single-writer 천장. CDC→feature store(hot edge는 micro-batch upsert)로 우회 |
| hot per-request derived scalar | graph에 두지 말 것 → **feature store에서 read** | latency tier 분리 |

**Materialization vs on-demand**: hot read path는 **materialize**(precompute→online store), live graph traversal은 **설명용 reason-path와 드문 ad-hoc 다홉**에만 예약. 근거 수렴: Feast의 "precomputing… optimal path", Michelangelo의 Cassandra precompute, Pixie의 offline prune+snapshot serve ([Feast](https://docs.feast.dev/getting-started/architecture/overview.md), [Michelangelo](https://www.uber.com/blog/michelangelo-machine-learning-platform/), [Pixie](https://cs.stanford.edu/people/jure/pubs/pixie-www18.pdf)).

> **latency는 design target이지 상속된 SLO가 아니다.** Michelangelo의 P95 <5ms(no KV)/<10ms(Cassandra), ~10,000 features, 250k pred/sec는 모두 verbatim 검증되나 **Uber-rides 2017 feature LOOKUP** 수치다 — graph traversal/PPR이 아니다. 존재 증명으로만 쓰고 W 워크로드로 재벤치마크.

### 9.6 구축 & freshness (요약)
데이터 흐름 한 줄: **OLTP → log-based CDC → Kafka/Kinesis(schema-registry governed) → fan-out {graph(bulk-load blue/green + hot edge micro-batch), feature store(materialize), OLAP(full history + batch recompute), ANN(incremental)} → retrieval(hard-prune + two-tower ANN) → rank(PPR/RWR + reason path) → request-time merge → consent/PII gate → apply_action().**

- **CDC가 spine**: DynamoDB Streams(24h trim, exactly-once-IN-stream, per-item ordering, NEW_AND_OLD_IMAGES, table 성능 영향 없음, shard당 reader ≤2, parent-before-child — 모두 verbatim 검증 ([Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html))) 또는 Debezium→Kafka Connect distributed mode ([Kafka Connect](https://docs.confluent.io/platform/current/connect/index.html)).
- **incremental UPSERT vs FULL RELOAD 규칙**: 좁은 per-user 변경(새 Order edge, override)은 incremental; (a) transform 로직 변경, (b) ontology 스키마 변경, (c) backfill, (d) **CDC가 retention(24h)을 넘겨 gap** → blue/green bulk-load **full reload**. 새 모델은 항상 **새 cluster**에 적재 후 cut over("load data that uses a new model onto a new DB cluster" — verbatim ([storage](https://docs.aws.amazon.com/neptune/latest/userguide/feature-overview-storage.html))). bulk-load 제약: queued ≤64, 최근 1,024 추적 ([limits](https://docs.aws.amazon.com/neptune/latest/userguide/limits.html)).
- **schema versioning**: 추가형 backward(기본)/forward 호환 — optional 필드+default(add-field-needs-default, verbatim ([Schema Registry](https://docs.confluent.io/platform/current/schema-registry/fundamentals/avro.html))).
- **train/serve consistency**: feature를 한 번 정의해 offline·online 양쪽에서 실행 + backfill 일치 검사(Chronon: "compares the backfilled values to actual fetched values"). skew가 최대 위험("definitions must exactly match", divergence "catastrophic and hard-to-debug" — verbatim ([Databricks](https://www.databricks.com/glossary/what-is-a-feature-store))).

### 9.7 비용 driver (mid-2026, US East)
binding constraint는 **write throughput + freshness + supernode**이지 storage가 아니므로, spend도 그쪽을 통제한다.

| driver | 통제법 | 수치 anchor |
|---|---|---|
| Neptune instance-hour | read-heavy 예측가능성 위해 **I/O-Optimized** | db.r5.large $0.348(std)/$0.4698(I/O-Opt), db.r5d.2xlarge $1.92/hr ([pricing](https://aws.amazon.com/neptune/pricing/)) |
| storage GB-mo | prune + blue/green 재구축(in-place delete 금지 — 공간 회수 안 됨) | $0.10(std)/$0.225(I/O-Opt) GB-mo; 6 copies가 1로 과금 |
| I/O | I/O-Optimized로 예측화 | $0.20–0.22 / 1M requests |
| Neptune Analytics RWR | **scheduled batch window에만** 한정 | 256 m-NCU = $7.68/hr (1 NCU ≈ 2GB) |
| feature store RAM | **hot 최신값 slice만** RAM 지불, cold/heavy는 S3/columnar | — |

(수치는 시점·리전 의존; mid-2026 US East 기준 verbatim 검증.)

### 9.8 GCC ~2.1M-node 실데모 → 30M scale gap
whchoi GCC 데모는 본 스택의 **충실한 소규모 실현**이자 grounding이다 ([gcc-analysis.md](/home/ubuntu/person-profile-ontology/design/gcc-analysis.md)):

| 항목 | GCC 데모 | 30M 타깃 | gap |
|---|---|---|---|
| 규모 | ~2.1M nodes (FuelPrice 1.27M + FuelTransaction 556K dominant), Customer 50,517 | 30M users / 10M DAU, ~10^9 edges 급 | node 수 기준 **~1,000×** |
| 스택 | Neptune + OpenSearch Serverless + ECS Fargate + boto3 | 동일 realization 패턴 + CDC spine + feature store | 동일 |
| 핵심 차이 | — | — | gap은 **write throughput·freshness·supernode**에 집중, **storage 아님** |

즉 데모는 위상(topology)은 맞고, 30M로 가며 추가되는 것은 용량이 아니라 **firehose 우회(CDC→feature store), pruning, blue/green 재구축, train/serve 일관성**이다.

### 9.9 노트북 시연 포인트
toy(networkx/kuzu + duckdb + dict/Redis-lite) 규모에서 production 아키텍처를 그대로 축소 시연한다.

1. **3-tier 분리 in-process**: graph=networkx/kuzu(traversal + diet hard-prune + reason string), feature store=userId-keyed dict(latest derived + `priceSensitivityOverride`), OLAP=duckdb(full order history). **동일 stated-vs-revealed 쿼리를 두 방식**(live traversal vs precomputed lookup)으로 돌려 시간 비교 → "hot path는 materialize가 이긴다" (Feast "precomputing… optimal path").
2. **supernode 가시화 + pruning**: 결정적 생성기 knob N(8 / 10k / 100k)으로 build time·node/edge·memory를 N에 대해 plot. 인기 식당이 toy super-vertex 임계(NebulaGraph >10k의 축소판) 넘는 지점 표시. 그 뒤 Pixie식 low-weight edge pruning(~20% 유지)으로 held-out future order의 **NDCG@K가 붕괴하지 않고 (이상적으로) 개선**되면서 RWR latency가 떨어짐을 시연 → "prune은 줄이고 sharpen" (Pixie +58%@20% edges, tuned-peak caveat 명기).
3. **batch vs near-real-time merge**: batch feature(time-decayed affinity·RFM·stated-vs-revealed)를 store에 적재 → 새 합성 주문 1건 append → 같은 key를 **streaming 증분으로 overwrite(latest-write-wins)** 하여 추천이 nightly job 없이 바뀜을 시연. on-demand는 저장 안 되는 day-part/geo 신호 주입으로 표현.
4. **CDC + incremental vs reload**: 작은 CDC 로그(seq# 붙은 insert/update/delete append-only list). (a) 새 Order edge incremental UPSERT, (b) **schema 변경**(Dish property 추가)이 fresh kuzu graph **full blue/green REBUILD + atomic pointer swap** 트리거(Neptune blue/green bulk-load의 toy analog), (c) "stream gapped past retention → forced re-snapshot" 분기.
5. **time-decay + TTL 두 메커니즘**: `exp(-λ·age)` half-life 슬라이더로 raw count 동일·recency 상이 두 유저가 다른 affinity를 내는 것 시연. historical-lookback TTL과 별개의 **session-signal TTL**을 분리해 "둘은 다른 메커니즘"임을 정직히 표시.
6. **governed write-back**: 모든 override를 `apply_action(user, action_id)` idempotent wrapper(작은 ordered queue) 경유. **같은 action_id 2회 replay → 1회만 적용**(user+action-id keyed idempotency), LLM은 PROPOSE만·queue가 유일 mutator (locked 6).
7. **train/serve consistency + point-in-time**: 각 feature를 **단일 순수 함수**로 정의해 duckdb 학습 테이블과 online lookup 양쪽에 사용; 시각 T에서 served == backfilled 일치 검사(toy Chronon) + future order 누설 없는 time-split.
8. **fail-closed safety**: ingredient composition이 **누락된** Dish를 넣어 diet/allergen prune이 default-safe가 아니라 **UNSAFE로 withhold**함을 시연 (locked 4, composition으로 추론·label 불신).

---

## 10. 서빙 — 근실시간(online) & 배치(offline)

### 10.1 결정 — Lambda형 2-pipeline, 1-online-store

핵심 결정: **주문 firehose를 graph에 동기 기록하지 않는다.** Order는 최고-volume write이고 10M DAU에서 곧 firehose다. 대신 batch가 넓고-비싼-부분을 스케줄로 precompute하고, streaming이 작고-신선한-부분을 계산하며, 두 결과를 같은 online store key에 **latest-write-wins**로 병합한다. 이는 Uber Michelangelo의 "두 파이프라인 + 하나의 online store"를 그대로 따른다 — batch는 `Bulk precomputing and loading historical features from HDFS into Cassandra on a regular basis ... updated every few hours or once a day`, streaming은 `Kafka and then ... Samza-based streaming compute jobs to generate aggregate features at low latency` ([uber.com](https://www.uber.com/blog/michelangelo-machine-learning-platform/)). Lambda merge의 원형은 Nathan Marz: `query the batch view and the realtime view and merge the results together` ([nathanmarz.com](https://nathanmarz.com/blog/how-to-beat-the-cap-theorem.html)).

> 정직성: "Lambda/Kappa" 라벨, "de-facto" 프레이밍은 1차 출처에 없는 해석이다. 검증된 사실은 *두 파이프라인 + backfill 재조정*이다. Kappa(단일-경로 단순화)는 정당한 대안이며 채택은 워크로드 검증 후 결정한다.

### 10.2 online vs offline feature store & train/serve skew

| | offline store | online store |
|---|---|---|
| 내용 | full order history (months/years) | 엔티티 key당 **latest 값 1개** |
| 백엔드 | S3/Iceberg + warehouse(Snowflake/BQ/Redshift) | DynamoDB/Redis (Feast-style) |
| 쓰임 | 학습 데이터(PIT-correct), batch 집계 | sub-ms 요청-시점 read |
| 일관성 | — | eventual consistency ([databricks.com](https://www.databricks.com/glossary/what-is-a-feature-store)) |

여기에 locked decision 1·2가 같이 산다: derived 값(`revealed_cuisine_affinity`, `rfm_scores`, `price_tier_pref`, `novelty_score`, `diet_vector`)과 **stored override**(`priceSensitivityOverride`)가 한 번의 keyed lookup으로 같이 읽힌다. Feast: `precomputing features is the recommended optimal path to ensure low latency` ([feast.dev](https://docs.feast.dev/getting-started/architecture/overview)).

**Train/serve skew가 이 설계 전체의 최고-위험 실패 모드다.** offline 학습 정의와 online 서빙 정의가 `must exactly match`, 어긋나면 `catastrophic and hard-to-debug` ([databricks.com](https://www.databricks.com/glossary/what-is-a-feature-store)). 방어: feature를 **순수 함수로 한 번만 정의**해 학습·서빙 양쪽에서 실행하고(Chronon `online/offline consistency`, `compares the backfilled values to actual fetched values`), 학습은 **point-in-time correct** time-split으로 label leakage를 막는다 ([github.com/airbnb/chronon](https://github.com/airbnb/chronon)).

### 10.3 two-tower: offline-precompute + online-ANN + online-rank

2-stage funnel. **Retrieval**: 후보 millions → ~hundreds. 먼저 diet/allergen **HARD-PRUNE**(graph composition, `User-AVOIDS->Ingredient<-CONTAINS-Dish`, locked decision 4), 이어 offline-precompute한 후보 embedding 위에서 ANN. online에서는 **경량 query tower만** 실행한다. ANN index는 incremental update를 지원하고(full rebuild는 시간 단위 — `complete index rebuilds can take hours`) geo/market 파티션한다 ([cloud.google.com](https://cloud.google.com/blog/products/ai-machine-learning/scaling-deep-retrieval-tensorflow-two-towers-architecture)). **Rank**: pruned in-memory graph snapshot 위 PPR/RWR(Neptune Analytics 또는 networkx 등가, locked decision 5). 생존 후보마다 typed meta-path reason string을 단다(locked decision 3).

**Latency 예산 (설계 목표 — 상속된 SLO 아님, W 워크로드로 재-benchmark):**

| 단계 | 설계 목표 | 근거(존재증명, 전이 불가) |
|---|---|---|
| feature-store keyed read | P95 single-digit ms | Uber feature lookup P95 `<5ms`(KV 無)/`<10ms`(Cassandra), 250k pred/s ([uber](https://www.uber.com/blog/michelangelo-machine-learning-platform/)) |
| retrieval(prune+two-tower ANN) | tens of ms | Pixie in-memory pruned walk 1,200 req/s/서버 @ 60ms p99, walk cost graph-size 독립 ([pixie](https://cs.stanford.edu/people/jure/pubs/pixie-www18.pdf)) |
| RWR rank(pruned snapshot) | tens of ms | 同 Pixie |
| end-to-end | ~100ms | — |

> ⚠ two-tower의 ~5ms query / 5-10ms ANN / ~10-20ms 합계와 95-99% recall 숫자는 **인용한 Google 글에 없다**(misattributed). architecture만 sourced; 밀리초 예산은 commit 전 재-source 필수.

### 10.4 streaming for session signals

CDC stream 위에서 seconds-to-low-minutes 신선도로 계산해 같은 online store key를 덮어쓴다: 현재-세션 craving / day-part, 방금-넣은-주문이 recency-weighted bag-of-id embedding에 주는 increment, governed action으로 방금 설정된 diet/allergen override, precompute된 RWR/affinity에 대한 작은 per-user delta. 이유: hero stated-vs-revealed mismatch는 batch지만(10.5), 가장 신선한 단일 주문은 nightly job을 기다리지 않고 프로필을 nudge해야 한다.

> 정직성: streaming "seconds-to-low-minutes" 밴드는 latest-per-entity KV 의미에서의 추론이지 verbatim 수치가 아니다.

### 10.5 BATCH vs NEAR-REAL-TIME split (프로필 차원별)

3-transform-class taxonomy(batch / streaming / on-demand — [databricks](https://www.databricks.com/glossary/what-is-a-feature-store))를 locked 프로필 차원에 매핑한다.

| 프로필 차원 | 계산 위치 | refresh cadence | latency 목표 |
|---|---|---|---|
| time-decayed cuisine affinity | **BATCH**(OLAP→online store) | 시간~일 | read sub-ms (precomputed) |
| RFM scores | **BATCH** | 시간~일 | read sub-ms |
| price_tier_pref | **BATCH** | 일 | read sub-ms |
| novelty appetite | **BATCH** | 일 | read sub-ms |
| persona-KPI vectors | **BATCH** | 일 | read sub-ms |
| **stated-vs-revealed mismatch (HERO)** | **BATCH**(전 주문 wide-aggregation) | 시간~일 | read sub-ms |
| candidate two-tower embeddings | **BATCH** + incremental ANN | nightly 재구축, 사이 incremental | — |
| PPR/RWR graph scores, LightGCN(opt) | **BATCH**(cross-user 결합) | nightly 또는 schema bump 시 | — |
| diet_vector | BATCH 기준 + streaming override | 일 + 즉시 | read sub-ms |
| priceSensitivityOverride (stored) | **STREAMING**(governed action) | 초~분 | read sub-ms |
| 방금-주문 recency delta | **STREAMING** | 초~분 | read sub-ms |
| 현재-세션 craving / day-part | **STREAMING** | 초~분 | (별도 session TTL) |
| geo / time / weather / ETA | **ON-DEMAND**(저장 안 함) | 요청마다 | live |
| two-tower **query** tower embedding | **ON-DEMAND** | 요청마다 | live(~ms) |
| 최종 RWR walk (pruned snapshot) | **ON-DEMAND** | 요청마다 | tens of ms |

**왜 PPR/RWR는 batch인가:** 단일 새 edge가 많은 노드 점수를 교란하므로 global recompute는 자연히 스케줄된다. 단 이는 **방어적 엔지니어링 추론**이다 — live RWR가 예산 초과라고 증명한 출처는 없으며(incremental/approximate PPR·dynamic-GNN은 실재), commit 전 실제 W 워크로드를 benchmark한다.

**요청-시점 merge:** ① online store에서 batch feature를 key로 read → ② 같은 key의 더 신선한 streaming 값으로 overlay(latest-write-wins, eventual consistency) → ③ on-demand transform 계산 → ④ retrieval → rank → reason-path → **consent + PII gate** → propose-then-apply `apply_action()`(locked decision 6).

### 10.6 precomputed-rec vs on-demand-traversal tradeoff

| | precompute → online store | on-demand graph traversal |
|---|---|---|
| 적합 | hot read path의 derived scalar·점수 | reason-path 설명, 드문 ad-hoc multi-hop |
| 근거 | Feast `precomputing ... optimal path`; Michelangelo Cassandra precompute; Pixie offline prune+materialize | graph만이 검증 가능한 typed meta-path를 생성 |
| 비용/지연 | sub-ms lookup, RAM은 latest-slice만 과금 | traversal 비용·single-writer 압박 |

규칙: **materialize, don't traverse — hot path에선.** graph tier가 single-writer 천장에도 scale에서 살아남는 이유는 점수가 아니라 **설명**이다 — feature store가 점수를 sub-ms에 주지만, 검증 가능한 reason string(`User->Order->Restaurant->Cuisine`)은 graph만 만든다(locked decision 3, anti-confabulation: LLM 설명은 *존재가 검증된* retrieved path 위에 grounding).

### 10.7 노트북 시연 포인트

두 셀로 **batch 경로 vs online 경로**를 한 프로세스 안에서 시뮬레이션한다(networkx/kuzu graph + dict/Redis-lite online store + duckdb OLAP, locked Phase-2 스택).

- **셀 A — BATCH 경로:** duckdb의 full 주문 history에서 time-decayed affinity·RFM·**stated-vs-revealed mismatch**를 batch로 계산해 `userId` key의 online store(dict)에 materialize한다. 같은 stated-vs-revealed 질의를 **(i) live graph traversal vs (ii) precomputed-feature lookup** 두 방식으로 돌리고 둘 다 timing해, 왜 materialization이 hot path를 이기는지 보인다(Feast `precomputing ... optimal path`). feature를 **순수 함수로 한 번** 정의해 duckdb 학습 테이블과 online lookup이 공유하게 하고, `served(T) == backfilled(T)` 결정적 체크(toy Chronon consistency)와 PIT-correct time-split을 붙인다.

- **셀 B — ONLINE 경로:** 합성 주문 1건을 append하고 **streaming-style incremental update**가 같은 key를 덮어쓰는 것(latest-write-wins)을 보여, nightly job 재실행 없이 추천이 이동함을 시연한다. 그 다음 **저장되지 않는** 요청-시점 day-part/geo 신호를 주입해 on-demand 층을 보이고, query-tower+ANN+RWR 후 reason-path → consent/PII gate → idempotent `apply_action(user, action_id)`(같은 action_id 재생 시 1회만 적용)로 마무리한다. 캡션: skew 위험(`definitions must exactly match`, `catastrophic and hard-to-debug`)과, 모든 vendor 수치(Uber P95/250k, Pixie 1,200 req/s)는 **존재증명이지 SLO가 아님**.

---

## 11. 온톨로지 업데이트 & 프레시니스(freshness)

> 30M 사용자 / 10M DAU에서 결정적 제약은 **저장 용량이 아니라 write throughput · freshness · supernode**다. 따라서 핵심 정책은 한 문장: **order firehose를 그래프에 동기 write하지 않는다.** 대신 OLTP transaction log에서 CDC로 한 번만 잡아 graph / online feature store / OLAP / ANN 네 tier로 fan-out하고, hot read path는 precompute된 값만 읽는다. 이는 Uber Michelangelo "two pipelines, one online store"와 Pixie "prune+materialize offline, serve from snapshot" 패턴의 직접 적용이며, Palantir의 incremental Pipelines + Action write-back + read-only derived-property 모델을 AWS/OSS로 실현한 것이다.

### 11.1 CDC를 freshness spine으로 — OLTP → graph/feature store

Aurora/DynamoDB(system of record)에서 log-based CDC가 모든 row-level insert/update/delete를 거의 실시간으로 포착해 Kafka/Kinesis 한 토픽에 싣고, Schema Registry(BACKWARD compat 기본)가 그 스키마를 통제한다. 이 한 로그가 네 tier 모두의 단일 소스다.

| CDC 방식 | 검증된 보장/제약 | 설계 시사점 |
|---|---|---|
| **DynamoDB Streams** | 24h trim(하드 데드라인), exactly-once-**IN-stream**, per-item ordering, NEW_AND_OLD_IMAGES, 테이블 성능 영향 없음, 샤드당 최대 2 reader, parent-before-child ([Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)) | 24h 초과 lag은 incremental 복구 불가 → **강제 re-snapshot**. exactly-once는 stream 진입까지만 → consumer는 반드시 idempotent |
| **Debezium → Kafka Connect (distributed)** | source connector가 테이블 변경을 토픽으로 스트림, 장애 시 rebalance, 상태는 config/status/offset 토픽에 영속 ([Kafka Connect](https://docs.confluent.io/platform/current/connect/index.html)) | fault-tolerant transport; Aurora/RDS 경로에 적합 |
| **log-based CDC 일반** | row-level insert/update/delete를 "every change" 포착, polling CPU 오버헤드 회피, Kafka와 결합 시 near-real-time 전달 ([Red Hat](https://www.redhat.com/en/topics/integration/what-is-change-data-capture)) | timestamp-컬럼 폴링/trigger 방식보다 source 부하 낮음 |

> 정직성: "exactly-once"는 Kafka/stream **내부** 보장이다. override store를 실제로 변경하는 외부 consumer는 user+action-id 키로 자체 idempotency를 가져야 한다.

### 11.2 Incremental upsert vs full reload — 언제 무엇을

correctness 결정이다. DynamoDB retention 절반은 verbatim 검증, Foundry `@incremental`/snapshot 절반은 **검증 불가**(JS-rendered 문서, 웹 corroboration 0건) — 따라서 **개념만 차용하고 Palantir API 식별자는 사실로 인용하지 않는다.**

| 상황 | 결정 | 근거 |
|---|---|---|
| 새 Order edge, 새 override 등 **좁은 per-user 변경** | **incremental UPSERT** (CDC 이벤트 off, micro-batch) | hot edge만 갱신; 그래프 single-writer 보호 |
| transform **로직** 변경 | **FULL RELOAD** (blue/green bulk-load) | 모든 derived 값 의미가 바뀜 |
| 온톨로지 **스키마** 변경(object/link/property type 추가) | **FULL RELOAD → 새 클러스터** | Neptune verbatim: "load data that uses a new model onto a new DB cluster" ([storage](https://docs.aws.amazon.com/neptune/latest/userguide/feature-overview-storage.html)) |
| **backfill / 재조정** 필요 | **FULL RELOAD** | point-in-time correct 재생산 |
| CDC stream이 **retention 초과 gap** | **강제 re-snapshot** | DynamoDB 24h trim(verbatim) — incremental 복구 불가 |

bulk-load 제약(검증): 동시 큐 최대 64 job, 최근 1,024 job만 추적 ([limits](https://docs.aws.amazon.com/neptune/latest/userguide/limits.html)). 대량 delete 트랜잭션은 로그 high-water mark를 영구 팽창시키므로(verbatim) **in-place 삭제 대신 export+reload로 슬림화** — Neptune은 6 copy를 1로 과금/128 TiB autoscale이라 raw 저장은 병목이 아니지만, 삭제로는 공간이 회수되지 않는다.

### 11.3 Recompute 트리거 — event-driven vs scheduled

coupling으로 가른다(권장 heuristic이지 vendor 문서화 규칙 아님 — incremental/approximate PPR, dynamic-GNN도 존재).

| 클래스 | 트리거 | 대상 | 이유 |
|---|---|---|---|
| **event-driven (NRT)** | CDC 이벤트, 초~저분 | per-user 카운트, recency-weighted bag-of-id 임베딩 증분, 방금 set된 diet override, PPR/affinity 소량 delta | 한 사용자에 국소적 |
| **scheduled (batch)** | hourly~daily / nightly / 스키마 version bump | time-decayed cuisine affinity, RFM, stated-vs-revealed(hero), two-tower candidate embedding, **PPR/RWR·LightGCN 전역 스코어** | 새 edge 하나가 PageRank/임베딩의 다수 노드를 교란 → 전역 recompute는 자연히 스케줄 |

cadence 가이드: cuisine affinity·RFM·stated-vs-revealed는 hourly~daily; 전체 graph PPR + 임베딩 재빌드는 nightly 또는 스키마 bump 시; candidate 임베딩은 nightly 재빌드 + 사이는 **ANN incremental update**(전체 index 재빌드는 수 시간 소요 — verbatim, Google Matching Engine).

> 정직성: "live RWR가 hot path에 너무 비싸다"를 입증한 1차 출처는 없다. coupling-split은 방어 가능한 engineering inference이므로 **W workload를 실측한 뒤 commit**하라.

### 11.4 Time-decay / TTL — 두 개의 별개 메커니즘

| 메커니즘 | 정의 | 범위 |
|---|---|---|
| **time-decay** | Order별 가중 `exp(-λ·age)`, `λ = ln2/half_life` (지수감쇠 math verbatim — [Wikipedia](https://en.wikipedia.org/wiki/Exponential_decay)) | affinity 계산. **modeling choice** — windowed/power-law/learned decay도 정당하므로 half-life를 tunable로 |
| **historical TTL** | "Feast가 historical dataset 생성 시 얼마나 과거까지 보는지를 제한" (verbatim — [Feast feature-view](https://docs.feast.dev/getting-started/concepts/feature-view)) | training lookback 경계 |
| **session TTL** (별도) | 30–60분 craving 등 online 세션 신호 auto-expiry | **streaming-feature expiry로 별도 구현** — historical TTL과 conflate 금지 |

### 11.5 Bitemporal / as-of correctness

ETL cycle마다 dimension을 snapshot한다(Beauchemin SCD-snapshot: "storing a full copy of the dimension for each ETL schedule cycle" — verbatim, [Beauchemin](https://medium.com/@maximebeauchemin/the-rise-of-the-data-engineer-91be18f1e603)). 이는 **system-time / as-of 재현성**(과거 상태 재학습 + audit replay)을 준다 — 검증된 범위는 여기까지.

> 정직성 scoping: **진정한 bitemporality**(valid-time + system-time 독립 질의로 late-arriving 보정 처리)는 더 강한, 아직 미출처 속성이다. 늦게 도착하는 주문 정정이 실제로 독립 valid-time 질의를 요구할 때만 구축하라. 모든 served 값/reason-path는 provenance(`source`)와 per-cycle snapshot 위에 올라가 timestamp as-of로 원천 row까지 추적된다.

### 11.6 Schema evolution / versioning — 무중단

온톨로지 진화 = **additive backward/forward-compatible** 변경(전부 Confluent Schema Registry verbatim — [avro](https://docs.confluent.io/platform/current/schema-registry/fundamentals/avro.html)):

- **BACKWARD**(기본): 새 reader가 옛 데이터 읽음 — optional 필드 추가 / 필드 제거
- **FORWARD**: 옛 reader가 새 데이터 읽음 — 필드 추가 / optional 필드 제거
- **필드 추가 시 default 값 필수**

스키마/모델 변경은 절대 기존 클러스터에 적재하지 않고 **새 클러스터에 적재 후 blue/green cutover**(Neptune verbatim). 대량 delete는 로그를 영구 팽창시키므로 mass-delete 대신 rebuild — 이 또한 blue/green을 선호하는 이유다. 호환성 게이트는 ingestion 시점 Schema Registry가 강제한다.

### 11.7 Governed write-back at scale

모든 온톨로지 편집(override, applied recommendation)은 **순서 있는 idempotent Kafka Action 큐**를 통과한다. idempotent producer는 producer ID + sequence number로 중복 제거(verbatim — [delivery-semantics](https://docs.confluent.io/kafka/design/delivery-semantics.html)). 이것이 locked decision 6(propose-then-apply via `apply_action()`)의 scale 실현이다 — **LLM/recommender는 제안만, Action 큐만이 유일한 mutator.** Palantir 벤치마크와 정확히 일치: "The Ontology will not be edited unless the Logic function is executed from an action."

> caveat: Kafka exactly-once는 Kafka 내부까지만. override store를 변경하는 외부 consumer는 user+action-id 키 idempotency를 별도로 가져야 한다.

### 11.8 Data-quality 게이트 — fail-closed

| 위치 | 게이트 | 출처 상태 |
|---|---|---|
| **ingestion** | schema-compat 검사 | Schema Registry로 검증 |
| **materialization** | record-level expectation, bad record는 dead-letter (Kafka Connect DLQ `errors.tolerance=all`) | DLQ 메커니즘 검증; 구체 expectation은 처방 |
| **allergen/composition** | ingredient 조합 누락 이벤트는 **FAIL CLOSED**(unsafe로 간주, default-safe 금지) | locked decision 4 실현; 의도적 engineering 결정(vendor 문서화 mandate 아님) |

### 11.9 session-fresh를 batch 프로필 위에 layering

request 시점에 (1) entity 키로 latest batch feature 읽고, (2) 같은 키의 더 신선한 streaming 값을 overlay(**latest-write-wins, eventual consistency** — Databricks verbatim), (3) on-demand transform(geo/time/weather/ETA — request-only) 계산 후 retrieval→rank→reason-path→consent/PII gate를 실행한다. Marz Lambda merge(verbatim): "query the batch view and the realtime view and merge the results together." train/serve skew가 feature-store의 최대 실패 모드("definitions must exactly match", divergence는 "catastrophic and hard-to-debug" — Databricks verbatim)이므로 feature를 **한 번만 정의**해 offline/online 양쪽에 쓰고 Chronon식 backfill 일치 검사로 강제한다.

> 정직성: streaming 신선도 "초~저분" band와 latest-write-wins merge는 latest-per-entity KV 의미에서의 inference이지 verbatim 수치가 아니다.

### 11.10 노트북 시연 포인트

- **CDC 로그 = append-only 리스트**: insert/update/delete 이벤트를 sequence number 붙여 모델링. (a) 새 Order edge **incremental UPSERT**, (b) Dish property 추가라는 **스키마 변경** 시 fresh kuzu 그래프 **full blue/green REBUILD + atomic 포인터 swap**(Neptune blue/green bulk-load의 toy 아날로그), (c) "stream gapped past retention → forced re-snapshot" 분기 — 세 경로를 모두 보인다.
- **stale vs fresh 프로필 diff**: batch feature(time-decayed affinity·RFM·stated-vs-revealed)를 feature store(userId 키 dict)에 materialize → 합성 주문 1건 **append** → 같은 키를 덮어쓰는 streaming-style 증분 갱신(latest-write-wins) → nightly job 재실행 없이 **추천이 이동**하는 것을 보인다. 동일 사용자의 `{stale_profile, fresh_profile, delta, shifted_recommendation}`를 나란히 출력해 freshness 효과를 가시화한다.
- **time-decay 슬라이더**: half-life tunable로 raw count는 같지만 recency가 다른 두 사용자가 다른 affinity를 내는 것을 보이고, historical TTL과 별개인 **session TTL**을 추가해 두 메커니즘임을 정직하게 분리한다.
- **governed write-back**: `apply_action(user, action_id)` idempotent wrapper(소형 ordered 큐) — 같은 action_id를 두 번 replay해도 1회만 적용(user+action-id 키 idempotency)되어 LLM은 제안만, 큐만 mutator임을 보인다.
- **train/serve 일치 + point-in-time**: 각 feature를 duckdb training 테이블과 online lookup 양쪽에서 쓰는 **하나의 순수 함수**로 정의, 시점 T에서 served 값 = backfilled 값임을 결정적으로 검사하고 미래 주문 누출 없는 time-split을 둔다.
- **fail-closed safety**: ingredient composition이 누락된 Dish를 주입해 diet/allergen prune이 default-safe가 아니라 **withhold(unsafe 간주)** 하는 것을 보인다.

---

## 12. 검증 & 한계 노트

본 문서는 멀티에이전트 리서치 후 **적대적 검증**과 **완성도 비평** 단계를 거쳤다. 종합 신뢰도(critic): **medium**.

**앵글별 신뢰도**

| 앵글 | 신뢰도 |
|---|---|
| Palantir Foundry Ontology / AIP / OSDK | high |
| Marketplace / food-delivery user profiling in production (DoorDash, Uber Eats, Instacart, Amazon) | high |
| Ontology / knowledge-graph profiling methodology for food-delivery user profiling | high |
| LLM / agentic profiling and governance for food-delivery user profiling (Phase-2 local notebook on synthetic data) | high |
| whchoi / AWS blueprint transfer points → food-delivery user-profile ontology (local notebook, no AWS infra) | medium |

**강점**
- Exceptional citation hygiene and adversarial self-correction: the draft explicitly flags paraphrases-vs-verbatim (functions/overview), corrects the Employee/Flight (not Airport/JFK) object-type example, debunks the unofficial 'Semantic/Kinetic/Dynamic' triad (official third pillar is security), and separates the Pixie paper figures from blog figures. This is unusually rigorous and matches the MEMORY 5-critic convention.
- The whchoi/AWS transfer table (Sec 6) is well-grounded: I verified per-claim against design/analysis.md, retail-analysis.md, gcc-analysis.md and summary.md and the AWS-column facts are accurate (per-node source enum is assembly-only; gcc uses data_depth; retail uses screen-level provenance; AVOIDS_INGREDIENT lens with 19 edges and 82/82 INCI + 219/219 FoodOn validation; compliance gate fires before campaign send; k=60 and 0.78+/-0.12 are assembly-only constants). The draft correctly labels the entire OSS column as design proposal, not extracted fact.
- The derived-property read-only constraint is consistently and correctly applied across every section (override fields must be stored property + action), which is the single most load-bearing Palantir-fidelity detail and a common mistake the draft avoids.
- Two-axis evaluation discipline (schema-validity vs attribute-accuracy never merged; recommendation quality vs explanation faithfulness separated; diet violations as a 100% hard gate) is a genuinely strong, actionable evaluation stance backed by the value-accuracy-spread citation.
- Honest scoping caveats are pervasive and accurate: 'pure local is an exaggeration because Claude tool-use still calls an external API,' quality non-equivalence of MiniLM vs Cohere rerank-v3 and Presidio vs Bedrock Guardrails, and 'no food-delivery consumer-recommendation fairness benchmark exists' (correctly distinguishing FairEval music/movie and Deliveroo gig-worker cases).
- The hero insight (stated LIKES_CUISINE vs revealed top cuisine) is concrete, graph-native, and — importantly — actually demonstrable on the existing fixture (Query 6 in load_and_query.py already computes exactly this mismatch, with u4 seeded as stated-italian/behaves-mexican), so at least the headline is grounded in runnable code.

**남은 갭(critic)**

| 주제 | 심각도 | 사유 |
|---|---|---|
| Baseline-fixture gap is understated — the single biggest practical blocker | critical | Sec 8.3 says port/extend the 'already-verified 8-user Neptune fixture,' but the verified fixture (design/neptune-demo/) lacks Ingredient nodes, AVOIDS/CONTAINS-Ingredient edges, FoodOn IRIs, Order timestamps, Persona/DietConstraint/Term/Campaign object types, and a source/provenance attribute — i.e., it is missing nearly every primitive the hero safety lens, governance gate, cold-start time logic, and provenance story depend on. The reader is told this is a small port; in reality the safety/governance/cold-start portions require building the data model from scratch. No synthetic-generator spec (distributions, how the stated-vs-revealed gap is parametrically injected, how ingredient-composition flags are seeded) is given despite being the literal deliverable. |
| No runnable code, function signatures, or concrete algorithm parameters anywhere | critical | The doc is the lead-in to 'a synthetic-data notebook' yet provides zero code: no PPR/RWR parameters (restart prob, walk length, top-k), no time-decay half-life, no RFM bucketing thresholds, no LightGCN layer count, no Thompson-sampling Beta update formula beyond a one-line description, no RRF k default to actually use (it only says 'k=60 is assembly-only, don't port' but never gives a replacement). A practitioner cannot implement the notebook from this spec without inventing every numeric choice. The existing load_and_query.py already has 6 working Cypher profiling queries that are never referenced or built upon. |
| FoodOn ingredient->class reconciliation declared 'mandatory' but no method given | moderate | Sec 1.3/4.3/8.4 call entity reconciliation a required preprocessing step and point at FoodKG's foodon-links.trig (~30K triples), but give no matching method (exact/fuzzy/embedding), no handling of unmatched ingredients, no licensing/size/loading notes for a ~67M-triple FoodKG, and no fallback when an ingredient has no FoodOn class. For a notebook on synthetic data, it is also unclear whether real FoodOn lookup is even invoked or whether IRIs are just hand-assigned to synthetic ingredients — a load-bearing ambiguity. |
| Evaluation needs ground truth the generator must emit, but the contract is unspecified | moderate | Sec 8.7 requires 'derived value == generator ground-truth aggregation (exact match)' and 'recommendation NDCG vs held-out future orders,' but never specifies what ground-truth objects the generator outputs, how held-out future orders are produced (the fixture has no time axis), or what the 'correct' recommendation set is for NDCG. Without a defined ground-truth schema the entire deterministic-accuracy and ranking-quality evaluation is aspirational. |
| Cold-start and LightGCN are 'optional upgrades' with no data to support them on a tiny synthetic graph | moderate | Thompson-sampling bandits, multilevel geo priors, two-tower/LightGCN, and attribute-permutation synthetic queries are all cited from billion-edge production systems, then proposed for an 8-user (extended) synthetic graph. The doc never addresses whether these are even meaningful/measurable at notebook scale, nor gives a minimum data size to make cold-start metrics non-degenerate. Reader gets production-scale techniques with no scale-down guidance. |
| PII redaction and consent gate are admitted to be unimplemented in any reference demo, yet presented as core methodology pillars | minor | The draft is commendably honest that 'no whchoi demo actually implements PII redaction' and that the consent gate fires before campaign send (not before every recommendation). But for a notebook on SYNTHETIC data with placeholder PII, the practical value and testability of '[USER_1] placeholder redaction' and a consent matrix is left vague — what is actually demonstrated vs. asserted? The GDPR Art. 5(1)(c) framing is heavy for a feature that may be a few lines of dict-lookup on fake data. |
| kuzu + networkx + duckdb three-store split has no data-flow or sync story | minor | Sec 4.6/7.3/8.2 propose networkx (traversal/PPR), kuzu (embedded Cypher), and duckdb (aggregation) simultaneously, but never explain which store is source of truth, how nodes/edges stay consistent across three engines, or why all three are needed for a small graph (networkx alone covers it). This is a real implementation pitfall that will bite the notebook author. |
| Fairness/proxy-discrimination audit requires protected attributes the fixture mostly lacks | minor | Sec 5.5/8.7 prescribe counterfactual flips on ageBand/region/timing. The fixture has ageBand and region but no income/ethnicity and no timing; the draft itself notes no food-delivery consumer fairness benchmark exists. The audit is therefore guidance-only with no concrete pass threshold ('drift < threshold' — threshold unspecified), making it non-actionable as written. |

**모순/불일치**
- INTERNAL: 'Never trust labels — infer diet/allergen from ingredient composition' (Sec 0, 1.2, 4.3, 7.4 #3, 8.4) directly contradicts the verified baseline fixture that Sec 8.3 says to 'port and extend.' The fixture (design/neptune-demo/load_and_query.py, schema.md) stores diet AS A LABEL on User (none/vegetarian/vegan/halal) and vegetarian/spicy as boolean flags ON the Dish, with NO Ingredient nodes, NO Dish-CONTAINS-Ingredient edges, and NO AVOIDS edges. The draft's flagship safety meta-path (User-AVOIDS->Ingredient<-CONTAINS-Dish) and 'inference-from-composition' principle cannot run on the fixture it claims to build on without a from-scratch re-modeling that the draft never scopes.
- INTERNAL: Multiple sections mandate a TIME-based train/test split and time-decay weighting (Sec 1.4 'time-split', 4.2 'time-decay', 8.3 'Order에 timestamp를 부여', 8.7 NDCG on 'held-out future order'), but the verified fixture's Order nodes have only an 'id, user, restaurant, total, [dishes]' shape with NO timestamp (confirmed: zero timestamp/date fields in load_and_query.py). Sec 8.3 buries this as 'extend' but every time-dependent metric and the time-decay dimension is unrunnable on the cited baseline as-is.
- INTERNAL/RFM framing: Sec 1.1, 1.2, and 4.2 present RFM as the 'segmentation backbone' as if a settled production practice, while Sec 3.1 and the 8.5 footnote correctly state RFM+K-means is only a third-party analysis of a public Instacart dataset, 'not a production fact.' The earlier sections assert it without the caveat the later sections insist on — an internal stance mismatch a reader will notice.
- INTERNAL: diet enum mismatch never reconciled. The fixture uses a 4-value diet set (none/vegetarian/vegan/halal); the draft mandates schema.org RestrictedDiet's exactly-11 enum (Sec 1.2, 4.3, 8.4). The draft never states how the fixture's 4 values map onto/extend to the 11 (e.g., 'none' is not a RestrictedDiet member; halal maps to HalalDiet but the other 9 have no fixture data), leaving the 'hard-gate, 0 violations' evaluation untestable on real fixture data.

**근거 부족 주장**
- '8-user Neptune fixture를 로컬 baseline으로 포팅·확장' is presented as a small extension, but the gap analysis above shows it requires building most of the proposed schema from scratch; the claim that the baseline is 'already verified' is true only for the narrow 6-query revealed/stated-vs-revealed/look-alike subset, NOT for safety, governance, cold-start, or provenance — the doc implies broader readiness than the fixture supports.
- The 'pure local' stack quality-equivalence is repeatedly (and correctly) caveated, but the positive claim that pandas/pydantic/tool-use 'can faithfully replicate' Foundry's three ideas (Sec 2.5 take-away) is asserted, not demonstrated — no working apply_action() wrapper or derived-vs-stored enforcement is shown, only described.
- Numeric production results (Uber +12% AUC, KGLA NDCG@1 +33-95%, Pixie 1,200 req/s, Mem0 +26%/-91%, ~13.7pt value-accuracy spread) are cited accurately as evidence for DESIGN choices, but are silently used to motivate techniques on a tiny synthetic graph where none of those numbers will reproduce; the doc never states that these figures do not transfer to the notebook's scale — a reader could over-trust them as expected notebook outcomes.
- schema.org RestrictedDiet 'exactly 11 enum' is stated as live-verified; this is plausible and consistent across the draft, but it was not independently confirmable from the local design files (no external verification was performed here) — treat as an external claim resting on the cited page.

**검증에서 반박/미확인된 주장 (build 시 주의)**
- [Palantir Foundry Ontology / AIP / OSDK] (unverifiable) Concrete concept-to-food-delivery mapping (Customer/Restaurant/Order/MenuItem object types; link/property/function/action lists for user-profiling recommendations). — No external source can confirm a bespoke design; assessed for internal consistency against the verified primitives. The read-only derived-property constraint is the one place the blueprint could trip an implementer.
- [whchoi / AWS blueprint transfer points → food-delivery user-profile ontology (local notebook, no AWS infra)] (unverifiable) Every AWS service has a local-notebook OSS substitute (NetworkX/kuzu, rank_bm25/Whoosh, sentence-transformers+FAISS, ~10-line RRF, HF cross-encoder, Claude tool-use loop, Presidio/rule guardrail), so Phase 2 needs no AWS infra. — Per task instructions, flagging this as a design assumption stated as fact. The AWS-side facts (Neptune/OpenSearch/Cohere/AgentCore/Guardrails/Bedrock Sonnet 4.6) ARE sourced; the OSS column is not.

---

### 갭 보강(addenda)

### Baseline-fixture gap is understated — the single biggest practical blocker

Sec 8.3's framing of "port/extend the already-verified 8-user Neptune fixture" hides the fact that the verified fixture (`design/neptune-demo/`) contains **none of the primitives the hero lenses depend on**: no `Ingredient` nodes or `AVOIDS`/`CONTAINS_INGREDIENT` edges (the safety lens), no FoodOn IRIs (provenance/standards mapping), no `Order` timestamps (cold-start time logic), no `Persona`/`DietConstraint`/`Term`/`Campaign` object types (governance gate, consent matrix), and no per-node `source`/provenance attribute. Practically, the safety, governance, and cold-start sections require **building the data model and its synthetic generator from scratch** — that build is the literal deliverable and must be specified, not assumed. Treat the following as the missing generator spec:

- **Schema before data.** First add the missing object types and edges, carrying FoodOn class IRIs (e.g. `foodon-links`-style ingredient→class mapping) and schema.org `RestrictedDiet` enums as node attributes, plus a `source: Literal['real','synthetic','external']` field on every node (the assembly-demo pattern; *not* universal across the source demos, so adopt it deliberately as the provenance backbone). RDF is unnecessary — keep property-graph attributes and reserve OWL reasoning for allergen inference only ([Ontotext](https://www.ontotext.com/knowledgehub/fundamentals/rdf-vs-property-graphs/)).
- **Parameterize, don't hand-author.** Use a multi-stage behavioral simulator (RetailSynth is the closest published template: customer- and product-specific latent factors for **price sensitivity** `βuw·βiw`, a category-value logistic for **cuisine preference**, and a state-dependence term `θu` for **revisit/order-frequency**, all drawn from per-customer Bayesian priors `(μ, σ)`) so the fixture has calibrated heterogeneity rather than 8 bespoke profiles ([RetailSynth, arXiv 2312.14095](https://arxiv.org/html/2312.14095v1)). Seed `Order` timestamps from a per-user inter-arrival process so cold-start (few/no orders) and warm users coexist by construction.
- **Inject the stated-vs-revealed gap explicitly.** Generate two preference vectors per user: a *stated* profile (what `DietConstraint`/persona surveys claim) and a *revealed* profile (what the simulated `Order` stream implies), with a tunable divergence parameter and a self-presentation bias (users overstate "healthy"/aspirational choices). This say-do gap is well documented in food choice and is precisely what a profiling methodology must stress-test — a fixture where stated == revealed silently passes broken logic ([Wiley/Health Economics](https://onlinelibrary.wiley.com/doi/full/10.1002/hec.4246), [CloudArmy say/do gap](https://cloud.army/why-stated-preferences-fail-the-saydo-gap-in-market/)).
- **Seed composition flags as ground truth, then infer.** Plant known allergen/ingredient-composition facts on `Dish`→`Ingredient` edges so dietary/allergen tags can be **inferred over the graph and checked against the seeded truth** (label-trust is the anti-pattern). This makes the safety lens testable and gives the validation report real coverage numbers (FoodOn N/N, constraint-violation precision/recall) instead of a screen-level "synthetic" footer.
- **State a distribution-fidelity acceptance gate.** Define the generator's success as matching target marginals/joints (per-category CDF distance for numeric fields, distributional distance for categoricals) plus the intended stated-vs-revealed divergence — i.e. the generator has an explicit spec and pass criteria, not "looks plausible" ([RetailSynth calibration](https://arxiv.org/html/2312.14095v1), [synthetic-data fidelity metrics](https://aimultiple.com/synthetic-data-generation)).

Bottom line: re-scope Sec 8.3 from "small port" to "design and validate a parameterized synthetic graph generator," and make that generator spec (entities, distributions, divergence injection, composition-flag seeding, fidelity gate) a first-class section — it is the foundation every downstream lens silently assumes.

Sources: [RetailSynth (arXiv 2312.14095)](https://arxiv.org/html/2312.14095v1) · [de Corte et al., Health Economics 2021](https://onlinelibrary.wiley.com/doi/full/10.1002/hec.4246) · [CloudArmy: Why Stated Preferences Fail](https://cloud.army/why-stated-preferences-fail-the-saydo-gap-in-market/) · [Ontotext: RDF vs property graphs](https://www.ontotext.com/knowledgehub/fundamentals/rdf-vs-property-graphs/) · [AIMultiple: synthetic-data fidelity metrics](https://aimultiple.com/synthetic-data-generation)

### No runnable code, function signatures, or concrete algorithm parameters anywhere

The notebook should build directly on the **6 working Cypher queries already in `design/neptune-demo/load_and_query.py`** (load the same synthetic graph into NetworkX/Kùzu via `q(...)` results), then add the scoring layer below. Every number is a starting default — print it as a tunable constant at the top of the notebook, not a magic literal.

**1. Recency-weighted affinity (replaces the raw `count(*)` in queries 1–2).** Weight each order by an exponential half-life decay: `w = 2 ** (-age_days / HALF_LIFE_DAYS)` with `HALF_LIFE_DAYS = 30` (a ~30-day half-life suits delivery cadence; the canonical attribution default is 7 days for short-horizon signals — use 7 for "what do they want *this week*", 30–60 for stable taste). This is the same idea Uber Eats uses when it "time-decay-sorts" prior `store_id`s as an eater proxy. Cuisine affinity becomes `sum(w)` per `(user, cuisine)` instead of `count(*)`.

**2. RFM bucketing (new profile fields on top of query 2's `totalOrders`/`totalSpend`).** Score R, F, M into integers 1–5 by **quintiles** (`pandas.qcut(series, 5, labels=[1..5])`), with R reversed (most-recent = 5). On the 8-user toy graph use `qcut(..., 3)` (1–3 scale) since quintiles need ≥~200 customers to be meaningful; document the 1–5 vs 1–3 switch as a `n_customers` threshold. Concatenate to an `RFM` code (e.g. `"545"`) and map to named segments.

**3. Personalized PageRank / RWR (generalizes the "look-alike" query 4 and "recommendation" query 3).** Use `networkx.pagerank(G, alpha=0.85, personalization={seed_user: 1.0})` — i.e. **restart probability 0.15** (the standard PPR/RWR default; this is exactly the training-free Pixie mechanism, [Eksombatchai et al. 2018](https://arxiv.org/abs/1711.07601)). Take the **top-k = 10** Restaurant/Dish nodes by PPR score, filtered to nodes the user hasn't ordered (reuse the `NOT (u)-[:PLACED]->...` predicate from query 3). For an explicit Monte-Carlo RWR instead, use **walk length ≈ 100 steps × 1000 walks** per seed. The typed path from seed to recommended node is the explanation string.

**4. LightGCN (the learned upgrade path).** Use the original-paper defaults ([He et al. 2020, arXiv 2002.02126](https://arxiv.org/abs/2002.02126)): **embedding dim 64, n_layers 3, learning rate 1e-3, BPR loss, L2 reg 1e-4, batch 1024**; final embedding = unweighted mean of the per-layer embeddings (no feature transform, no nonlinearity). On a graph this small, shrink to `dim=16, layers=2` to avoid overfitting and treat it purely as a "what changes vs. PPR" demo.

**5. Thompson-sampling cuisine bandit (cold-start, the stated-vs-revealed signal of query 6).** Per cuisine keep `Beta(α, β)`; following DoorDash's **relative-share** parameterization, `α = orders_of_this_cuisine + α0`, `β = orders_of_all_other_cuisines + β0`. Warm-start the prior from the user's region (Gangnam/Mapo/Songpa popularity) with `α0, β0 = 1, 1` (uniform) scaled by a `PRIOR_STRENGTH = 5` pseudo-count. Each round: `theta_c = numpy.random.beta(α_c, β_c)` for every cuisine, recommend `argmax(theta)`, then on the realized order do `α_c += 1` (chosen) / `β_c += 1` (others).

**6. RRF k for hybrid fusion (the replacement the spec never gave).** When fusing the BM25 lexical rank and the embedding/PPR rank into one list, use Reciprocal Rank Fusion `score = Σ 1/(k + rank_i)` with **`k = 60`**. The whchoi note "k=60 is assembly-only, don't port" refers to copying their *measured pipeline constants*, not the RRF formula itself — **60 is the standard RRF default** ([Cormack et al. 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)) and is the correct starting value here; tune down (10–20) only if one ranker is far stronger.

**7. Profile as evolving memory.** Recompute these scores incrementally on each new order with ADD/UPDATE/DELETE consolidation rather than full recompute (Mem0, [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)); report **schema-validity and attribute-accuracy as separate metrics** when an LLM emits the structured profile.

Sources: [PPR/RWR α=0.15 default](https://www.emergentmind.com/topics/personalized-pagerank-algorithm), [Pixie RWR](https://arxiv.org/abs/1711.07601), [LightGCN](https://arxiv.org/abs/2002.02126), [RFM quintile scoring](https://www.omniconvert.com/blog/rfm-analysis/), [half-life decay 2^(-t/h)](https://ceur-ws.org/Vol-2038/paper1.pdf), [Mem0](https://arxiv.org/abs/2504.19413), [RRF k=60](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf).

### FoodOn ingredient→class reconciliation declared 'mandatory' but no method given

The doc treats reconciliation as required but never specifies *how*. Concretely, here is the missing method and the honest disclosure the doc owes its reader.

- **What FoodKG actually does (and why you cannot just inherit it).** FoodKG does *not* embedding-match raw ingredient strings to FoodOn at scale. Its construction script parses Recipe1M's `layer1.json` + `det_ingrs.json`, extracts only the `food product by organism` subtree of FoodOn via the Ontofox term-extractor, and links ingredients to that subset through a **Semantic Data Dictionary (SDD) with hand-curated dictionary-mapping files** in the repo; the output is the small `foodon-links.trig` (~30K triples) — orders of magnitude smaller than the ~63M-triple recipe core, which tells you coverage is partial and curation-bounded, not a complete automatic mapping ([FoodKG construction](https://foodkg.github.io/foodkg.html), [ISWC'19 paper](http://www.cs.rpi.edu/~zaki/PaperDir/ISWC19.pdf)).
- **A recommended matching cascade (cheap → expensive), since none is given:** (1) normalize the string (lowercase, strip quantities/units/prep words like "chopped, 2 cups"); (2) **exact/alias match** against FoodOn `rdfs:label` + `oboInOwl:hasExactSynonym`/`hasRelatedSynonym`; (3) **fuzzy match** (token-set / Levenshtein or Jaro-Winkler, e.g. RapidFuzz) with a tuned acceptance threshold; (4) **embedding / dense-retrieval fallback** (sentence-transformer over labels+synonyms, ANN top-k) for the residue; (5) optional **LLM scorer** to confirm "true match vs. best-of-candidates." This exact cheap-to-expensive ladder, replacing Levenshtein with embedding similarity and adding an LLM adjudicator, is what the current food-NEL literature uses — FoodNER (BERT NER+NEL, macro-F1 ~93–94% food/nonfood, ~73–79% entity), FoodSEM, and the hybrid lexical+semantic retriever + LLM-scorer of FoodOntoRAG ([FoodSEM](https://arxiv.org/html/2509.22125v1), [FoodOntoRAG](https://arxiv.org/html/2603.09758)).
- **Handle the unmatched explicitly (the doc's biggest omission).** Reconciliation is never 100%. Define a fallback policy: keep the ingredient as a first-class node with its **raw label + a `noFoodOnMatch` / low-confidence flag and the match score/method as provenance**, attach it to the nearest accepted ancestor or a local `UnmappedIngredient` placeholder class, and exclude unmatched nodes from any allergen/dietary *inference* (treat "no class" as "cannot certify safe," not "safe"). Record match method (exact/fuzzy/embedding/manual) per edge so downstream code can gate on confidence.
- **Licensing / size / loading notes the doc must state.** FoodOn is **CC-BY-4.0** (attribution required), distributed as `foodon.owl` via `purl.obolibrary.org/obo/foodon.owl` ([OBO Foundry](https://github.com/OBOFoundry/OBOFoundry.github.io/blob/master/ontology/foodon.md)). You do **not** load the full ~67M-triple FoodKG for a profiling notebook: load only `foodon-links.trig` (~30K) plus the Ontofox-extracted FoodOn subset, or just carry FoodOn IRIs as node attributes (no triplestore needed); the full graph (`foodkg-core.trig` ~63M, `usda-links.trig` ~4.1M) is recipe/nutrition data irrelevant to user profiling and is impractical to hold in NetworkX.
- **Resolve the synthetic-data ambiguity in one sentence.** State plainly whether the notebook performs a *real* FoodOn lookup (any of the cascade above against the OWL/links file) or **hand-assigns IRIs to synthetic ingredients**. For synthetic data, hand-assigning curated FoodOn IRIs is legitimate and reproducible — but it must be labeled as such (the IRIs are author-asserted, not algorithmically reconciled), and a single small "real-lookup" demo on a handful of ingredients should be included so the reconciliation step is *exercised*, not merely asserted.

Sources: [FoodKG construction](https://foodkg.github.io/foodkg.html), [FoodKG ISWC'19](http://www.cs.rpi.edu/~zaki/PaperDir/ISWC19.pdf), [FoodSEM (food NEL)](https://arxiv.org/html/2509.22125v1), [FoodOntoRAG (hybrid retriever + LLM scorer, ontology drift)](https://arxiv.org/html/2603.09758), [FoodOn / OBO Foundry license](https://github.com/OBOFoundry/OBOFoundry.github.io/blob/master/ontology/foodon.md), [FoodOn](https://foodon.org/).

### 9–11 (대규모/서빙/프레시니스) 검증 노트

production-scale 섹션도 적대적 검증 + 완성도 비평을 거쳤다. 종합 신뢰도(critic): **medium**.

**앵글별 신뢰도**

| 앵글 | 신뢰도 |
|---|---|
| Large-scale ontology build & graph storage (30M users / 10M DAU): graph DB scaling/limits, supernode problem, 3-tier graph/feature-store/OLAP split, materialization vs on-demand traversal, cost drivers — grounded against the whchoi GCC ~2.1M-node demo. | high |
| Serving patterns: near-real-time (online) vs batch (offline) | medium |
| Ontology update & freshness (keeping it current at scale) | high |

**강점**
- Citation hygiene is exceptional and consistent with the project's 5-critic convention: the draft repeatedly separates verbatim vendor facts from inference (the 'honesty'/'정직성' callouts), explicitly labels latency numbers as 'design targets, not inherited SLOs', flags that Uber Michelangelo P95<5ms/250k-pred/s are 2017 Uber-rides FEATURE-LOOKUP numbers (not graph traversal/PPR), and warns that Pixie 1,200 req/s @ 60ms is a Pinterest C++ existence-proof, not a transferable SLO. This anti-confabulation discipline is the single best feature.
- Locked-context fidelity is strong across all three sections. Read-only derived properties (lock 1) live in the online feature store; the priceSensitivityOverride is consistently modeled as a STORED property + governed action sitting NEXT TO derived values (lock 2), not as a derived value; standards (FoodOn/schema.org RestrictedDiet) are placed as node attributes with explicit 'no RDF reasoner' (lock 7); diet/allergen is hard-prune from ingredient composition with a fail-closed (withhold-when-composition-missing) demo (lock 4); reason-path/meta-path explanation is preserved as the reason graph survives (lock 3); ranking stays training-free PPR/RWR with LightGCN optional (lock 5); consent/PII gate + propose-then-apply apply_action() with idempotency is carried into the scale design (lock 6); Phase-2 stays a local notebook on networkx/kuzu/duckdb/dict (lock 9). I found no contradiction with the nine locked decisions.
- Palantir-vs-realization framing is correctly maintained: Foundry is treated as the design north star/benchmark, every concrete scale/serving number is anchored to independently verifiable sources (Neptune, Uber, Pixie, Feast, Confluent, DynamoDB), and the draft explicitly refuses to cite Palantir API identifiers (@incremental, Pipelines) as fact because they are JS-rendered and uncorroborated. This is exactly the right stance given the locked benchmark/realization split.
- The central architectural thesis (do NOT synchronously write the order firehose to the graph; use log-based CDC as the freshness spine, fan out to graph/feature-store/OLAP/ANN, materialize the hot path, reserve live traversal for explanation) is coherent, repeated consistently across sections 9-11, and correctly grounded in the genuine Neptune single-writer + non-reclaiming-delete constraints. The '3-tier placement decision table' (graph=relationships, feature-store=latency, OLAP=volume) is genuinely actionable.
- The GCC-demo grounding (section 9.8) accurately reflects design/gcc-analysis.md: FuelPrice 1,268,746 + FuelTransaction 556,208 dominant, Customer 50,517, ~2.1M total nodes, Neptune+OpenSearch+ECS Fargate stack are all faithfully reproduced from the verified analysis file, and the conclusion that the gap is write-throughput/freshness/supernode rather than storage is well-reasoned.
- Notebook demo points (9.9/10.7/11.10) are concrete and faithfully scale-down the production architecture into the locked Phase-2 stack: in-process 3-tier split, supernode-knob plot, live-traversal-vs-precomputed-lookup timing, CDC-log-as-append-list with three branches (incremental/schema-rebuild/retention-gap), idempotent apply_action replay test, single-pure-function train/serve consistency check, and fail-closed safety demo. These give a notebook author runnable structure.

**남은 갭(critic)**

| 주제 | 심각도 | 사유 |
|---|---|---|
| Zero concrete parameters for the new scale/serving/freshness mechanisms | moderate | Consistent with the prior critic finding on the base doc (wproject-research.md L680), these three sections give no actionable numbers a notebook author needs: no CDC micro-batch window size, no time-decay half-life value (only the exp(-λ·age) formula and a 'slider'), no session-TTL value (30-60min is mentioned only in 11.4), no incremental-vs-reload batch-size threshold, no RWR restart-prob/walk-length for the rank tier, no recompute cadence in concrete hours, no online-store TTL. The base doc's appendix already supplies α=0.15, top-k=10, RRF k=60, half-life decay 2^(-t/h) — these new sections do not reference or reuse them, so the practitioner must re-invent every numeric choice. |
| Backpressure / consumer-lag / failure-recovery operational detail is thin | moderate | The design hinges on CDC as the single spine, but there is no treatment of what happens when the feature-store materializer or graph micro-batch consumer falls behind under 10M-DAU load short of the binary 'retention gap -> forced re-snapshot' branch. No discussion of consumer-group lag monitoring, partial-failure of one fan-out tier while others advance (causing cross-tier inconsistency at request-time merge), dead-letter replay ordering, or how latest-write-wins behaves when batch and streaming writers race on the same key out of order. These are the real production failure modes at scale. |
| Cost section (9.7) is a price list, not a cost model | moderate | It enumerates per-unit prices (db.r5.large $0.348/$0.4698, 256 m-NCU $7.68/hr, storage $0.10/$0.225 GB-mo) but never multiplies them by the 30M/10M-DAU workload to produce even an order-of-magnitude monthly estimate or a comparison between the recommended CDC-fan-out architecture and the rejected synchronous-graph-write approach. For a sizing/architecture decision doc the binding question is total cost at target scale, which is left unanswered. |
| No independent corroboration possible for any of the new infra claims within this repo | moderate | None of section 9-11's load-bearing facts (Neptune 100k QPS/128 TiB/single-writer/non-reclaiming-delete, DynamoDB Streams 24h trim/exactly-once-in-stream/2-readers-per-shard, Feast 'precomputing is optimal', Databricks train/serve-skew 'catastrophic', Chronon backfill compare, Confluent Schema Registry compat rules, Marz Lambda merge) appear anywhere in the existing verified wproject-research.md — confirmed by grep. They are newly introduced with inline URLs and 'verbatim' tags but were not run through the project's 5-critic per-claim verification convention recorded in MEMORY. The verbatim quotes are plausible and self-consistent, but a reviewer in this environment cannot confirm them; they should be source-verified before commit. |
| Bitemporal/as-of correctness is gestured at but not designed (11.5) | minor | 11.5 honestly scopes true bitemporality out, but late-arriving order corrections are a real food-delivery occurrence (refunds, retroactive cancellations, delayed POS sync) that directly corrupt time-decayed affinity and the hero stated-vs-revealed metric if only system-time snapshots exist. The doc says 'build it only when needed' without giving the detection criterion or the interim mitigation, leaving a known correctness hole under-specified. |
| Restaurant/order-volume scaling is asserted but never sized separately from users | minor | The requirement names 'huge restaurant & order volume' as a first-class scaling axis, but the sections almost exclusively reason about the user/order firehose and supernode restaurants. There is no estimate of order-edge growth rate (orders/day at 10M DAU), restaurant/dish/ingredient node cardinality, or how the bag-of-id embedding and ANN index sizes scale with item catalog — the very inputs needed to validate the 'storage is not the constraint' claim. |

**모순/불일치**
- Internal tension on the 'storage is not the binding constraint' thesis vs the GCC scale-gap math: section 9.8 labels the gap '노드 수 기준 ~1,000×' (about 1,000x by NODE count) from ~2.1M GCC nodes, but the stated target is 30M users (~14x the total GCC node count) plus ~10^9 edges. 1,000x on nodes would imply ~2.1B nodes, which is not the stated target; the ~1,000x multiplier conflates nodes and edges and overstates the node-count gap. Not a contradiction with locked context, but an internal numerical inconsistency.
- Mild framing tension between 'Lambda-form 2-pipeline' (10.1) and the honesty note that 'Lambda/Kappa labels are not in the primary sources.' The section adopts the Lambda label in its heading and decision sentence, then disclaims the label as an interpretation — the heading commits to a framing the body partially retracts. Cosmetic, but a careful reader will notice the doc both uses and disowns the 'Lambda' term.

**근거 부족 주장**
- Section 9.3 claims Pixie improves 'F1 +58% with only 20% of edges retained (δ=0.91)' and cites the Pixie paper. This +58% F1 / δ=0.91 / 20%-edges figure does NOT appear anywhere in the project's verified wproject-research.md, which instead cites Pixie as '3B nodes/17B edges, 1,200 req/s @ 60ms, Pinterest engagement >80%' and explicitly warns that the blog's '50% lift / 100B edges' numbers are a SEPARATE source not to be mixed in. The +58%/20%-edge claim is the load-bearing justification for 'prune sharpens quality' and must be source-verified against the actual Pixie paper before use; the draft's own caveat ('tuned PEAK, not a universal law') does not establish the number's provenance.
- Section 9.3 cites Pixie loading a pruned graph in '~120GB RAM (244GB HugePages)' and 'walk cost independent of graph size.' The 120GB/244GB RAM figures are not present in the verified research doc (which only carries the 1,200 req/s @ 60ms and the bipartite-graph framing). These specific memory numbers need source confirmation; the latency/throughput numbers are corroborated by the existing doc, the RAM numbers are not.
- Neptune 'Customer 360 = 100,000 QPS' read framing (9.1/9.2): presented as a verified fact with a Neptune Analytics-vs-Database doc URL, but it is not corroborated in the existing research and reads like a marketing-framing figure rather than a measured ceiling; should be labeled as vendor framing (the draft does say 'framing' once but then reuses it as a hard number in 9.2's table).
- The two-tower millisecond budget (10.3): the draft itself flags that the '~5ms query / 5-10ms ANN / 95-99% recall' numbers are misattributed to the cited Google article and 'must be re-sourced before commit.' This is correctly disclosed, but as written the latency-budget table still presents 'tens of ms' targets leaning on that retracted source, so the numbers remain unsupported until re-sourced — listing here per the task's unsupported-claims requirement even though the draft is honest about it.
- 'streaming seconds-to-low-minutes freshness' band (10.4/11.9): explicitly acknowledged as an inference from latest-per-entity KV semantics, not a verbatim figure. Honest, but unsupported as a quantitative claim and should not be turned into an SLO.

**검증에서 반박/미확인된 주장 (build 시 주의)**
- [Ontology update & freshness (keeping it current at scale)] (unverifiable) Palantir Foundry incremental transforms (@incremental, read 'added'/'current', write 'modify'/'replace', semantic_version forcing full SNAPSHOT on logic/schema change) are the production benchmark for keeping derived properties in sync. — Fetched both incremental-overview and incremental-usage URLs (JS-rendered, no body text); ran two targeted web searches for the API terms — zero results. Only the topic/section names in the sidebar were confirmed to exist.

#### 갭 보강(addenda)

### Zero concrete parameters for the new scale/serving/freshness mechanisms

Reuse the base-doc appendix as the default and only deviate where the new scale demands it — do not re-invent these. **Concrete starting values for a notebook author:**

- **RWR / Personalized PageRank rank tier** — restart probability **α = 0.15** (reuse the base doc's appendix value; equivalently a ~6–7-step mean walk length since E[steps] ≈ 1/α), and use Pixie's early-stopping convergence parameters **n_p = 2,000** (min number of pins/items that must reach the visit threshold) and **n_v = 4** (visit-count threshold) rather than a fixed walk budget — these are the exact values Pinterest tuned and shipped ([Pixie, WWW'18](https://cs.stanford.edu/people/jure/pubs/pixie-www18.pdf), Algorithm 2 / Fig. 3). Emit **top-k = 10** per the appendix; fuse rankers with **RRF k = 60**.
- **Batch recompute cadence (rank tier)** — recompute global, cross-user-coupled scores (PPR/RWR, embeddings) on a **24-hour** schedule and hot-swap the in-memory snapshot once per day; this is exactly Pixie's production cadence ("the server restarts once a day and loads the latest available graph in memory") and matches Uber Michelangelo's batch features being "updated every few hours or once a day" ([Michelangelo](https://www.uber.com/blog/michelangelo-machine-learning-platform/)). Per-user narrowly-scoped counters update via the stream path instead (below).
- **CDC micro-batch window** — for the DynamoDB Streams → online-store path, set the Lambda event-source-mapping **batch size = 100–1,000 records** with **MaximumBatchingWindowInSeconds = 1–5 s** (window max is 300 s) to trade latency vs. invocation cost; this yields seconds-fresh per-user signals well inside the **24-hour stream retention** hard deadline, past which a re-snapshot is mandatory ([DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)). For a Spark/streaming equivalent, a **30–60 s processing-time trigger** gives the same freshness band without per-record overhead.
- **Time-decay half-life** — replace the bare `exp(-λ·age)` slider with a concrete default consistent with the appendix's `2^(-t/h)`: **half-life h = 30 days** for cuisine/restaurant affinity (λ = ln2/30 ≈ 0.023 /day), with a shorter **h = 7 days** for volatile "current craving" session intent. (Exponential decay with `t½ = ln2/λ` is the standard model; the half-life is a modeling choice, so expose h, not λ — [exponential decay](https://en.wikipedia.org/wiki/Exponential_decay).)
- **Session TTL / online-store TTL** — **session-context TTL = 30 min** (extend to 60 min for longer browse sessions; this is the value already cited in §11.4); streamed per-user feature TTL in the online store **= 24–72 h** so the latest-write-wins value survives between daily batch refreshes. Note Feast's feature-view TTL bounds *historical/training* lookback, so use it to set the **decay half-life's training window (≈ 90 days)**, and enforce online session expiry with a separate KV TTL ([Feast feature view](https://docs.feast.dev/getting-started/concepts/feature-view)).
- **Incremental-vs-reload threshold** — default to **incremental UPSERT** via CDC; trigger a **full blue/green bulk reload** whenever (a) the schema or scoring logic version changes, (b) a backfill is needed, or (c) consumer lag exceeds the **24-h stream retention** (the one non-negotiable, source-verified reload trigger). As a volume heuristic, prefer a full reload once a single batch's changed-edge set exceeds **~10–20%** of the graph, since below that incremental write stays cheaper than a parallel bulk-load on Neptune's single writer.

### Backpressure / consumer-lag / failure-recovery operational detail is thin

The "retention gap → forced re-snapshot" branch is the *terminal* failure mode; the design needs the graduated responses that precede it. Concretely:

- **Lag SLO, not just a retention deadline.** Alert on consumer-group lag well before the trim horizon — for DynamoDB Streams that horizon is hard: *"All data in DynamoDB Streams is subject to a 24-hour lifetime… data that is older than 24 hours is susceptible to trimming (removal) at any moment"* ([AWS DynamoDB Streams docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)). Page on lag-seconds (records-behind ÷ throughput projected against the 24h trim), not on raw offset count, since a re-snapshot becomes the *only* repair once the CDC tail is trimmed. Note also the per-shard read cap — *"No more than two processes at most should be reading from the same stream's shard"* — so you scale lag-recovery by shard parallelism (split/child shards), not by adding readers to a hot shard.

- **Per-tier lag isolation and request-time merge fencing.** The feature-store materializer and the graph micro-batch consumer must be *independent consumer groups* with independent offsets, so one can fall behind without blocking the other — but that independence is exactly what produces cross-tier inconsistency at the request-time merge (a profile feature reflects order N while the graph reason-path still reflects order N−1). Publish each tier's **materialization watermark** (max source-commit timestamp applied) into the online store and have the merge layer either degrade to a consistent older watermark or flag staleness, rather than silently blending tiers at different positions.

- **Ordering must survive DLQ replay.** Kafka/DynamoDB only guarantee *per-key/per-partition* order — DynamoDB: *"the stream records appear in the same sequence as the actual modifications to the item"* and *"an application must always process a parent shard before it processes a child shard."* A naive dead-letter-then-replay (`errors.tolerance=all`, `errors.deadletterqueue.topic.name`, [Kafka Connect docs](https://docs.confluent.io/platform/current/connect/index.html)) breaks this: a poison record parked in the DLQ while later records for the *same key* advance will, on replay, apply out of order. Either DLQ at **key granularity and pause that key** until drained, or make every writer carry the source commit-timestamp/version so replayed-stale writes are rejected.

- **Latest-write-wins must be version-fenced, not arrival-order-fenced.** When the batch recompute and the streaming materializer race on the same entity key, plain LWW (last arrival wins) corrupts state if the batch job (computed over an *older* snapshot) lands after a fresher streaming update. Store a monotonic source version/event-time per key and apply **conditional writes (write-if-newer)** so a late-arriving stale batch value is discarded. This complements Kafka's *in-stream* dedup — *"the broker assigns each producer an ID and deduplicates messages using a sequence number"* ([Kafka delivery semantics](https://docs.confluent.io/kafka/design/delivery-semantics.html)) — which prevents producer-resend duplicates but does **not** order two independent writers racing on one key; the external store still needs idempotent, version-fenced upserts.
