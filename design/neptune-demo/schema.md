# 음식 배달 사용자 프로파일링 그래프 — 스키마

DoorDash 스타일 **사용자 프로파일링(user profiling)** 데모용 작은 property graph입니다.
**Amazon Neptune Analytics**(openCypher)에서 동작하며, 합성(synthetic)·결정적(deterministic)
데이터를 씁니다. W Project(온톨로지 기반 사용자 프로파일링)와 맞닿아 있습니다.

## 노드 라벨

| 라벨 | 키 | 속성 |
|---|---|---|
| `User` | `userId` | `name`, `ageBand`, `diet` (`none`/`vegetarian`/`vegan`/`halal`) |
| `Restaurant` | `restId` | `name`, `priceTier`, `rating` |
| `Cuisine` | `cuisineId` | `name` |
| `Dish` | `dishId` | `name`, `vegetarian`(bool), `spicy`(bool) |
| `Region` | `regionId` | `name` |
| `Order` | `orderId` | `total` |

## 관계(Relationship)

| 엣지 | From → To | 의미 |
|---|---|---|
| `LIVES_IN` | User → Region | 사용자가 사는 곳 |
| `PLACED` | User → Order | 사용자의 주문 |
| `AT` | Order → Restaurant | 주문을 처리한 식당 |
| `CONTAINS` | Order → Dish | 주문 품목 |
| `SERVES` | Restaurant → Cuisine | 식당의 요리 종류 |
| `LOCATED_IN` | Restaurant → Region | 식당 위치 |
| `OF_CUISINE` | Dish → Cuisine | 메뉴의 요리 종류 |
| `LIKES_CUISINE` | User → Cuisine | **말한(stated)** 선호 (행동과 대비) |

## 그래프에서 도출하는 프로파일링 신호

- **드러난 요리 선호도(revealed)** — `User →PLACED→ Order →AT→ Restaurant →SERVES→ Cuisine` 경로를 세어 계산.
- **말한 것 vs 실제(stated vs revealed)** — `LIKES_CUISINE`(선언)와 실제 최다 주문 요리를 비교 → 불일치(mismatch) 포착(전형적 프로파일링 인사이트).
- **식당 추천** — 사용자의 최애 요리이면서, 같은 지역이고, 아직 주문하지 않은 식당.
- **룩어라이크 사용자(look-alike)** — 공유 요리로 연결된 사용자(협업 신호).
- **식이 고려 메뉴 추천** — 채식/비건 사용자에게 최애 요리의 미경험 채식 메뉴.

## 데이터 규모

User 8 · Restaurant 11 · Cuisine 6 · Dish 17 · Region 3 · Order 27 (+ CONTAINS/SERVES/LIKES 엣지).
inline으로 적재할 만큼 작으면서, 의미 있는 쿼리를 돌릴 만큼은 풍부합니다.
