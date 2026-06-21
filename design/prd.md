## Goal
아래의 Reference 를 심도 있게 분석하여, 어떠한 기능을 제공하는지 분석해줘.


## Authors Summary
* 데이터 저널리즘 가속 - 인물 관계, 표결 이상치(당론 이탈/박빙/정파 초월 협력), 공약 이행 추적을 자동 리서치
* 하나의 그래프, 6개 페르소나 — 편집국,데이터,광고,세일즈(내부) + 일반/유료 독자,기업 B2B 정책 인텔리전스(대고객)가 같은 데이터를 각자 KPI로 소비
* 신뢰가 내장된 AI — 정치 중립성 가드레일, 비극/비위/미성년 피해자 콘텐츠에서 광고를 자동 생략. 미디어 브랜드 신뢰도와 직결되는 AI 거버넌스를 데모로 증명
* 3단계 진화 비교 - Chatbot(RAG) → Agent(Tool Use) → Agentic AI(4-agent)를 한 화면에서...
* AI 거버넌스 광고 매칭 - keyword/embedding/Agent 3-way, Agent의 "광고 생략" reasoning trace 라이브 
* B2C,B2B 동시 시연 — 같은 데이터를 6 페르소나 관점으로
* AI 추론: Bedrock Sonnet 4.6 + Cohere embed-v4 / rerank-v3 + AgentCore(Memory ,Code Interpreter) + Bedrock Guardrails
* 지식 레이어: Neptune(openCypher 그래프) + OpenSearch Serverless 하이브리드(BM25 Nori + KNN + RRF)
* 데이터: 실데이터(국회 OpenAPI) + 합성(독자,광고,기사) + 외부(네이버 뉴스,SNS,여론조사), 노드별 source 출처 태깅

## Reference
### ontology assembly: 
- https://assembly.whchoi.net/

### https://retail-ontology.whchoi.net/
- https://retail-ontology.whchoi.net/

### GS Caltex 온톨로지 + Agentic AI Demo 공유
GS Caltex M&M본부에서 온톨로지 도입을 검토 중이던 상황에서, AWS Full Stack 기반으로 고객의 실제 데이터를 로딩한 Demo를 구현해 시연했고 고객으로부터 긍정적인 피드백을 받았습니다. 단순 컨셉이 아니라 실데이터를 태운 동작 시연이 좋았던것 같습니다. 실제 데모사이트 구축해 뒀습니다. 참고하세요.
:one: 고객 컨텍스트
• GS Caltex M&M본부 (마케팅 & 멤버십)의 실제 데이터들을 마케팅,세일즈전략 등에 활용
• 온톨로지 기반 고객,주유소,카드 거래내역, 마케팅 데이터, 약관 지식 그래프 활용 및 AI 검토 중
• 고객의 아이디어를 5개 부서 페르소나 / 14개 시나리오 / 25개 클래스로 구현
:two: 구현 스택 (AWS Full Stack)
• AI: Bedrock Sonnet 4.6 + Cohere embed-v4 / rerank-v3, AgentCore (Memory + Code Interpreter)
• Data: Amazon Neptune (openCypher, ~250K edges) + OpenSearch Serverless (Nori BM25 + KNN + RRF)
• App: FastAPI (Python 3.12) + Next.js 14, ECS Fargate ARM64
• Edge/Auth: CloudFront + Lambda@Edge + Cognito (RS256 JWT)
:three: 데이터
• PII 마스킹 실데이터 N=500 + 합성 데이터 49.5K (cohort tagging으로 분리)
• 100K 고객데이터 / 8.5K 주유소 / 680K 거래데이터/ 1.3M 운영 및 상품 + 기상청(KMA) 외부 데이터 연동Demo Site - https://gcc.whchoi.net/

### OpenCypher 기반 Ontology Workshop
- https://studio.us-east-1.prod.workshops.aws/workshops/public/d26ccc21-8fce-422e-b93a-9ded7d118ea3


### Source Code
https://github.com/whchoi98/ontology-for-assembly


## W Project
### Goal:
DoorDash 와 같은 음식 배달하는 기업은 개인들이 음식을 배달 시키고, 추천하는 것에 대한 
관심이 많습니다. 그래서 User Profiling 에 대한 관심이 많습니다.
User Profiling 을 통해서 실제 서비스에 제공하여 고객 경험등을 올리고 싶습니다.
효과적으로 하는 방법론을 먼저 리서치를 하고, 테스트로서 간단한 구현을 하고 싶습니다.

### Considertion:
유저의 수가 30,000,000 만이 되고, 일일 액티브 유저도 10,000,000 만인 됨.
이러한 유저의 규모와 엄창난 양의 레스토랑, 주문건수가 많다.
이러한 대규모의 데이타를 온톨로지로 만드는 것도 고려해야하고,
어떤 식으로 서비스 (근 실시간 서비스, 배치성 서비스) 등도 고려해한다.
또한 만들어진 온톨로지를 어떤식으로 업데이트하여, 최신 정보가 유지되어야 하는 것도 고려해야 한다.
