# person-profile-ontology

> 온톨로지(지식그래프) 기반 **사용자 프로파일링(User Profiling)** 리서치 & PoC.
> whchoi.net 온톨로지 데모 분석에서 출발해 **음식배달(DoorDash 스타일) User Profiling**(W Project)으로 확장.

---

## 무엇이 들어있나

두 갈래의 작업을 담는다:

1. **기반 리서치** — whchoi.net "온톨로지 + Agentic AI" 데모 3종(Assembly · Retail · GCC) 심층 분석. 공통 청사진(**표준 기반 온톨로지 그래프 + 하이브리드 검색 + Agentic AI + 거버넌스**)을 추출.
2. **W Project** — 그 청사진을 **음식배달 User Profiling**에 적용. 실무 방법론 + 대규모(30M user / 10M DAU) 아키텍처 + 작동하는 Neptune 데모 + (예정) 합성 데이터 노트북.

---

## W Project — 목표

DoorDash 같은 음식배달 기업이 **User Profiling**으로 고객 경험·추천을 개선하려 한다. 핵심 질문: *"이 사용자에게 어떤 식당/메뉴를, 왜 추천하는가."* 이를 **decision-centric 온톨로지**(Palantir Foundry 벤치마크) 위에서 설계하고, 먼저 작게 검증한 뒤 대규모로 확장한다.

**Hero 인사이트:** *"말한 것(stated) vs 실제 행동(revealed)"* 의 차이 — 선언한 취향과 주문이 드러낸 취향의 간극. (예: "이탈리안 좋아해"라 했지만 실제론 매번 멕시칸 → 진짜 취향은 멕시칸.)

---

## 저장소 구조

```
design/
├─ 기반 리서치 (whchoi.net 데모 분석)
│  ├─ summary.md            ← 3종 통합 요약 (여기부터 읽기)
│  ├─ analysis.md           ← ① Assembly Insight Hub
│  ├─ retail-analysis.md    ← ② Ontology Retail
│  ├─ gcc-analysis.md       ← ③ GS Caltex (최성숙형)
│  └─ prd.md                ← 원본 목표/레퍼런스
│
├─ W Project
│  ├─ wproject-research.md        ← 실무 방법론 (Palantir 벤치마크 + 대규모 §9–§11 + 검증)
│  └─ wproject-beginner-guide.md  ← 초보자용 한국어 정리 (graph·3-tier·실시간/배치·비용)
│
└─ neptune-demo/            ← 작동하는 Neptune Analytics 그래프 데모
   ├─ README.md             ← 데모 가이드 (12개 쿼리/기능)
   ├─ BEGINNER-GUIDE.md     ← 데모 초보자 가이드
   ├─ schema.md             ← 그래프 스키마 (노드/엣지)
   ├─ load_and_query.py     ← 적재 + 6개 프로파일링 쿼리
   ├─ advanced_queries.py   ← 6개 그래프 알고리즘 (CF·PageRank·Louvain 등)
   └─ IDEAS.md              ← 확장 아이디어
```

---

## 핵심 개념 — 3-tier (graph / feature store / OLAP)

대규모에선 **모든 데이터를 그래프에 넣지 않는다.** 역할을 셋으로 나눈다:

| 층 | 역할 | 비유 |
|---|---|---|
| **Graph** | 관계·설명·안전 (traversal · reason-path · diet hard-prune) | 관계 지도 |
| **Feature Store** | hot per-user 값 빠른 read (RFM · affinity) | 즉석 메모 카드함 |
| **OLAP** | 전체 이력 · 대량 집계 · batch | 대형 창고 + 계산실 |

> **규칙: 관계는 graph, latency는 feature store, volume은 OLAP.**
> 그래프는 *언제 쓰고 언제 안 쓰는지*, 대규모에서 *정말 되는지*, *무엇부터(비용)* 는 → [`wproject-research.md`](design/wproject-research.md) (Decision Box · Feasibility · §7.7 우선순위) · 쉬운 설명은 [`wproject-beginner-guide.md`](design/wproject-beginner-guide.md).

---

## Neptune 데모 빠른 시작

합성 음식배달 그래프(**User 8 · Order 27**)로 6개 프로파일링 쿼리 + 6개 그래프 알고리즘을 시연. AWS 자격증명만 있으면 **VPC 없이** 동작(Neptune Analytics, HTTPS + SigV4).

```bash
# 1) 그래프 생성 (~3-5분)
aws neptune-graph create-graph --graph-name fooddelivery-profiling-demo \
  --provisioned-memory 16 --replica-count 0 --public-connectivity \
  --no-deletion-protection --region us-east-1
#   → 반환된 id 기록: g-xxxxxxxxxx

# 2) 적재 + 프로파일링 쿼리
cd design/neptune-demo
python3 load_and_query.py g-xxxxxxxxxx --region us-east-1 --reset
python3 advanced_queries.py g-xxxxxxxxxx --region us-east-1 --a Jiwon --b Tae

# 3) 정리 (과금 중단)
aws neptune-graph delete-graph --graph-identifier g-xxxxxxxxxx --skip-snapshot --region us-east-1
```

> ⚠️ **Neptune Analytics는 그래프가 존재하는 동안 초 단위로 과금**된다. 끝나면 반드시 삭제. 데모는 위 스크립트로 몇 분 만에 재생성된다. 자세히 → [`design/neptune-demo/README.md`](design/neptune-demo/README.md).

---

## 참조 청사진 (기술 스택)

| 구성요소 | 참조(AWS) | 로컬 PoC 대체(OSS) |
|---|---|---|
| 지식 그래프 | Amazon Neptune (openCypher) | networkx / kuzu |
| 하이브리드 검색 | OpenSearch (BM25 Nori + KNN + RRF) + Cohere rerank | rank_bm25 + sentence-transformers/FAISS + RRF |
| Agentic AI | Bedrock (Claude Sonnet 4.6) + AgentCore | Claude API (선택) |
| 거버넌스 | Bedrock Guardrails + 검증 리포트 | Presidio-style PII + consent gate |
| 집계/저장 | OLAP (Spark/warehouse) | duckdb / pandas |

---

## 상태 & 다음 단계

- ✅ 기반 리서치 — whchoi 데모 3종 분석 (`summary.md`)
- ✅ W Project 방법론 + 대규모 아키텍처 (`wproject-research.md`)
- ✅ Neptune 데모 — **live 검증 완료** (12개 쿼리 전부 PASS: stated-vs-revealed, look-alike, PageRank 허브, Louvain 세그먼트)
- ⏭️ **Phase 2** — 합성 데이터 **노트북** (프로필 → 설명가능 · diet-safe 추천), AWS 없이 로컬 실행
