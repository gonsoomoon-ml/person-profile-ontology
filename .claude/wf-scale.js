export const meta = {
  name: 'wproject-scale-research',
  description: 'Production-scale methodology (30M users / 10M DAU): large-scale ontology build & storage, near-real-time + batch serving, ontology update & freshness — adversarially verified, returned as new sections 9-11 for design/wproject-research.md',
  phases: [
    { title: 'Research', detail: '3 angles: scale-storage / serving / freshness (web)' },
    { title: 'Verify', detail: 'adversarial fact-check of each angle' },
    { title: 'Synthesize', detail: 'architect: reference architecture + batch/NRT split + freshness strategy' },
    { title: 'Write', detail: 'sections 9, 10, 11 (Korean)' },
    { title: 'Critique', detail: 'completeness & accuracy critic' },
    { title: 'GapFill', detail: 'fill critical gaps' },
  ],
}

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    angle: { type: 'string' }, summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      claim: { type: 'string' }, detail: { type: 'string' }, relevance: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['high','medium','low'] },
    }, required: ['claim','detail','relevance','sources','confidence'] } },
    practical_patterns: { type: 'array', items: { type: 'string' } },
  }, required: ['angle','summary','findings','practical_patterns'],
}

const VERIFIED_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    angle: { type: 'string' },
    overall_reliability: { type: 'string', enum: ['high','medium','low'] },
    verified_findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      claim: { type: 'string' },
      verdict: { type: 'string', enum: ['supported','partially-supported','refuted','unverifiable'] },
      corrected_detail: { type: 'string' }, note: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['high','medium','low'] },
    }, required: ['claim','verdict','corrected_detail','note','confidence'] } },
    key_takeaways: { type: 'array', items: { type: 'string' } },
  }, required: ['angle','overall_reliability','verified_findings','key_takeaways'],
}

const ARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    reference_architecture: { type: 'array', items: { type: 'string' } },
    storage_tiering: { type: 'array', items: { type: 'string' } },
    serving_split: { type: 'array', items: { type: 'string' } },
    freshness_strategy: { type: 'array', items: { type: 'string' } },
    palantir_benchmark: { type: 'array', items: { type: 'string' } },
    notebook_demonstration: { type: 'array', items: { type: 'string' } },
    through_lines: { type: 'array', items: { type: 'string' } },
  }, required: ['reference_architecture','storage_tiering','serving_split','freshness_strategy','palantir_benchmark','notebook_demonstration','through_lines'],
}

const CRITIQUE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    overall_reliability: { type: 'string', enum: ['high','medium','low'] },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      topic: { type: 'string' }, why: { type: 'string' },
      severity: { type: 'string', enum: ['critical','moderate','minor'] },
    }, required: ['topic','why','severity'] } },
    contradictions: { type: 'array', items: { type: 'string' } },
    unsupported_claims: { type: 'array', items: { type: 'string' } },
  }, required: ['overall_reliability','strengths','gaps','contradictions','unsupported_claims'],
}

const EXISTING_CONTEXT = 'The W Project Phase-1 doc already LOCKED these decisions (stay consistent, do NOT contradict): (1) decision-centric ontology a la Palantir; (2) user profile = recalculable READ-ONLY derived properties over Order links, overrides as stored property + governed action; (3) every recommendation explained via a typed meta-path (reason string); (4) diet/allergen safety = hard-prune inferred from ingredient composition, not labels; (5) ranking via training-free Personalized PageRank/RWR, LightGCN optional; (6) consent + PII gate before any action (propose-then-apply via apply_action()); (7) standards as node attributes (schema.org RestrictedDiet, FoodOn IRIs) WITHOUT RDF reasoning; (8) hero insight = stated-vs-revealed cuisine preference mismatch; (9) Phase-2 implementation is a LOCAL notebook on synthetic data (networkx/kuzu, duckdb/pandas, rank_bm25 + sentence-transformers+FAISS + RRF k=60 + HF cross-encoder, Claude API optional, Presidio-style PII). Palantir Foundry/Ontology/AIP/Pipelines is the production BENCHMARK; the prior whchoi/AWS demos (GCC ~2.1M nodes, Neptune + OpenSearch + Bedrock/AgentCore + Guardrails, ECS Fargate) are the realization reference. NEW REQUIREMENT now driving this research: target scale 30M total users / 10M DAU + huge restaurant & order volume; must address build-at-scale, near-real-time vs batch serving, and ontology update/freshness.'

const ANGLES = [
  { key: 'scale', web: true, title: 'Large-scale ontology build & graph storage (30M users / 10M DAU)',
    brief: 'How to build and store an ontology / knowledge-graph at 30M total users, 10M DAU, and very high restaurant & order volume. Graph DB scaling & limits (Amazon Neptune & Neptune Analytics, TigerGraph, Nebula Graph, JanusGraph, Dgraph): capacity, partitioning/sharding, write throughput, and the SUPERNODE / hub problem (very popular restaurants, popular cuisines, dense Region nodes). The pragmatic 3-tier split: what TRULY belongs in the graph (relationships, multi-hop traversal, explainability paths) vs an online FEATURE STORE (hot per-user features served at low latency) vs COLUMNAR/OLAP (DuckDB/Spark/BigQuery for heavy aggregation & batch profile compute). Materialization vs on-demand traversal. Approximate cost drivers at scale. Use the whchoi GCC demo (~2.1M nodes, real ECS/boto3 infra) as a small-but-real grounding reference and explicitly state the gap to 30M-user scale. Cite primary sources (vendor docs, engineering blogs, papers).' },
  { key: 'serving', web: true, title: 'Serving patterns: near-real-time (online) vs batch (offline)',
    brief: 'Serving architecture for profiling at scale. Lambda vs Kappa architecture. Online vs offline FEATURE STORE (Feast, Tecton, Uber Michelangelo/Palette, DoorDash feature store/Fabricator, Airbnb Zipline/Chronon) and the train/serve skew problem. Two-tower retrieval: offline embedding precompute + ANN index (FAISS/ScaNN) for online retrieval + a lighter online ranking model, with realistic LATENCY budgets (retrieval in tens of ms). Streaming engines (Kafka, Apache Flink, Spark Structured Streaming) for real-time session signals. Crucially: WHICH profiling computations are BATCH (nightly Spark recompute of RFM, long-term cuisine affinity, segments, embeddings) vs NEAR-REAL-TIME (last-N session events, in-session context, geo/time/weather) and HOW they merge at request time. Precomputed-recommendations vs on-demand graph-traversal tradeoff. Cite engineering sources.' },
  { key: 'freshness', web: true, title: 'Ontology update & freshness (keeping it current at scale)',
    brief: 'Keeping the ontology/graph current at scale. Change Data Capture (Debezium, DynamoDB Streams, Kafka Connect) from OLTP -> graph + feature store. Incremental/streaming UPSERTS vs periodic FULL RELOAD, and when each is correct. Event-driven vs scheduled RECOMPUTATION of derived properties; how Palantir keeps Pipelines/derived properties in sync (incremental pipelines, Funnel/Build, the Action write-back path). Time-decay / TTL for recency. Bitemporal / as-of-time correctness for auditability & reproducible training. Schema EVOLUTION & versioning of an ontology in production (adding object/link/property types without downtime). Data-quality/validation gates at scale. Governed write-back at scale (Action queues). How SESSION-FRESH signals (this-session orders/clicks) are layered on top of the slower batch profile. Cite primary sources.' },
]

function researchPrompt(a) {
  return 'You are a research specialist for the W Project: ontology-grounded, PRACTICAL User Profiling for food delivery (DoorDash-style) at PRODUCTION SCALE (30M total users, 10M DAU, huge restaurant & order volume). This research extends an existing methodology doc with production-scale sections; the eventual Phase-2 implementation is still a LOCAL notebook on synthetic data, so each angle should also note how the pattern can be ILLUSTRATED at toy scale.\n\n'
    + 'EXISTING LOCKED CONTEXT (do not contradict):\n' + EXISTING_CONTEXT + '\n\n'
    + 'YOUR ANGLE: ' + a.title + '\n' + a.brief + '\n\n'
    + 'You have web access. FIRST call ToolSearch with query "select:WebSearch,WebFetch" to load the web tools, then run 4-8 targeted searches and FETCH 3-6 authoritative PRIMARY sources (vendor docs, engineering blogs, papers). Prefer primary over secondary. Record exact source URLs per claim.\n\n'
    + 'Be concrete and practical (an architect must act on this). For every non-obvious factual claim attach source URLs and a confidence. Distinguish well-established fact from vendor marketing or speculation. Give numbers (throughput, latency, node/edge counts, refresh cadence) where credible. Surface reusable PRACTICAL PATTERNS. Tie everything back to food-delivery user profiling at 30M/10M-DAU scale. Return structured findings per the schema: 8-16 findings, quality over quantity, no filler.'
}

function verifyPrompt(findings, a) {
  return 'You are an ADVERSARIAL fact-checker. Below are research findings for the angle "' + a.title + '" of a production-scale food-delivery user-profiling study (30M users / 10M DAU). Try to REFUTE each significant claim. Be skeptical; default to "partially-supported" or "unverifiable" when evidence is thin. Watch especially for: vendor benchmark numbers quoted out of context, latency/throughput figures that do not transfer, and "best practice" asserted without a source. You have web access — FIRST call ToolSearch "select:WebSearch,WebFetch", then verify the most load-bearing/checkable claims against primary sources.\n\n'
    + 'For each significant claim give: verdict (supported / partially-supported / refuted / unverifiable), corrected_detail (accurate version), note (what you checked), sources. Then overall_reliability and key_takeaways (claims safe to build on).\n\nFINDINGS:\n'
    + JSON.stringify(findings, null, 2)
}

const SECTION_SPECS = [
  { id: 'scale', title: '## 9. 대규모 온톨로지 — 구축 & 스토리지 아키텍처 (30M users / 10M DAU)',
    must: 'How to build & store the ontology at 30M users / 10M DAU / huge restaurant & order volume. Graph DB options & limits at scale (Neptune/Neptune Analytics/TigerGraph/Nebula/JanusGraph), the supernode/hub problem and mitigations, partitioning/sharding. The pragmatic 3-TIER split with a clear DECISION TABLE of what goes WHERE: graph (relationships/traversal/explainability) vs online feature store (hot low-latency features) vs columnar/OLAP (heavy aggregation & batch profile compute). Materialization vs on-demand. Cost drivers. Use the whchoi GCC ~2.1M-node real demo as grounding and state the gap to 30M scale. END with a short "노트북 시연 포인트" — how to illustrate the tiering at toy scale.' },
  { id: 'serving', title: '## 10. 서빙 — 근실시간(online) & 배치(offline)',
    must: 'Lambda/Kappa; online vs offline feature store + train/serve skew; two-tower offline-precompute + online-ANN + online-rank with realistic latency budgets; streaming for session signals. A concrete BATCH vs NEAR-REAL-TIME split TABLE for the profile dimensions (which dimension computed where, refresh cadence, latency target) and how the two layers merge at request time. Precomputed-rec vs on-demand-traversal tradeoff. END with "노트북 시연 포인트" — simulate the batch path vs the online path in two cells.' },
  { id: 'freshness', title: '## 11. 온톨로지 업데이트 & 프레시니스(freshness)',
    must: 'Keeping the ontology current: CDC from OLTP -> graph/feature store; incremental upsert vs full reload (when each); event-driven vs scheduled derived-property recompute; time-decay/TTL; bitemporal/as-of correctness; schema evolution/versioning without downtime; data-quality gates; governed write-back at scale; layering session-fresh signals over the batch profile. Benchmark against Palantir incremental Pipelines/Funnel + Action write-back and the derived-property read-only model. END with "노트북 시연 포인트" — simulate CDC as appended orders + incremental recompute, showing a stale-vs-fresh profile diff.' },
]

function sectionPrompt(s, archJson, verifiedJson) {
  return 'You are writing ONE new section of an existing practical methodology document. Write in KOREAN with English technical terms, matching the concise style of the existing design/*.md docs (tables and tight prose).\n\n'
    + 'EXISTING LOCKED CONTEXT (be consistent, do NOT contradict):\n' + EXISTING_CONTEXT + '\n\n'
    + 'SECTION TO WRITE:\n' + s.title + '\nMust cover: ' + s.must + '\n\n'
    + 'RULES:\n'
    + '- Return ONLY the markdown for this one section, starting EXACTLY with the heading "' + s.title + '". No preamble, no sign-off, no other sections, NO surrounding code fence. Do NOT begin with any sentence before the heading.\n'
    + '- Practical and concrete; an architect must be able to act. Use tables/lists liberally.\n'
    + '- Cite sources inline (URLs from the verified research) where you state facts. Give numbers where credible.\n'
    + '- Stay consistent with the ARCHITECT BRIEF below (reference architecture, storage tiering, serving split, freshness strategy, palantir benchmark).\n'
    + '- Use only claims supported by the VERIFIED RESEARCH; if uncertain or refuted, omit or mark clearly.\n'
    + '- Concise Korean prose: omit needless words.\n\n'
    + 'ARCHITECT BRIEF:\n' + archJson + '\n\nVERIFIED RESEARCH (ground truth — use only this):\n' + verifiedJson
}

// ---- Phase 1+2: research each angle, then adversarially verify (pipelined) ----
log('Researching 3 production-scale angles (scale / serving / freshness) + adversarial verification...')
const verified = await pipeline(
  ANGLES,
  (a) => agent(researchPrompt(a), { label: 'research:' + a.key, phase: 'Research', schema: FINDINGS_SCHEMA, effort: 'high' }),
  (findings, a) => findings == null ? null
    : agent(verifyPrompt(findings, a), { label: 'verify:' + a.key, phase: 'Verify', schema: VERIFIED_SCHEMA, effort: 'high' }),
)
const good = verified.filter(Boolean)
const verifiedJson = JSON.stringify(good, null, 2)
log('Verified ' + good.length + '/' + ANGLES.length + ' angles. Synthesizing architecture...')

// ---- Phase 3: architect designs the reference architecture ----
const architectPrompt = 'You are the lead architect designing the PRODUCTION-SCALE reference architecture for ontology-grounded food-delivery User Profiling at 30M users / 10M DAU. Palantir Foundry/Ontology/AIP/Pipelines is the BENCHMARK; the whchoi/AWS demos (GCC ~2.1M nodes, Neptune/OpenSearch/Bedrock/AgentCore/Guardrails) are the realization reference. The Phase-2 implementation remains a LOCAL synthetic notebook, so also give notebook_demonstration ideas (how to illustrate each production concept at toy scale).\n\n'
  + 'EXISTING LOCKED CONTEXT (be consistent):\n' + EXISTING_CONTEXT + '\n\n'
  + 'Using the VERIFIED research below, decide:\n'
  + '1. reference_architecture: end-to-end components & data-flow (OLTP -> CDC/stream -> graph + feature store + OLAP -> retrieval/rank -> serving), concrete and ordered.\n'
  + '2. storage_tiering: what lives in the GRAPH vs ONLINE FEATURE STORE vs COLUMNAR/OLAP, and why (decision rules).\n'
  + '3. serving_split: which profile computations are BATCH vs NEAR-REAL-TIME, refresh cadence, latency targets, and how they merge at request time.\n'
  + '4. freshness_strategy: CDC, incremental-vs-reload, recompute triggers, time-decay/TTL, bitemporal, schema versioning, governed write-back.\n'
  + '5. palantir_benchmark: for each major choice, what Palantir/Foundry does vs what we adopt/adapt/skip and why.\n'
  + '6. notebook_demonstration: how to illustrate scale/serving/freshness faithfully at toy scale in the local notebook.\n'
  + '7. through_lines: cross-cutting themes (provenance, explainability, governance, cost, train/serve consistency).\n\n'
  + 'Be decisive and practical.\n\nVERIFIED RESEARCH:\n' + verifiedJson
const arch = await agent(architectPrompt, { label: 'architect', phase: 'Synthesize', schema: ARCH_SCHEMA, effort: 'xhigh' })
const archJson = JSON.stringify(arch, null, 2)

// ---- Phase 4: write the 3 new sections in parallel ----
log('Writing sections 9, 10, 11...')
const sectionMd = await parallel(SECTION_SPECS.map((s) => () =>
  agent(sectionPrompt(s, archJson, verifiedJson), { label: 'write:' + s.id, phase: 'Write', effort: 'high' })))

const sections = SECTION_SPECS.map((s, i) => {
  const md = sectionMd[i]
  return (md && String(md).trim()) ? String(md).trim() : s.title + '\n\n> _(이 섹션 생성 실패 — 재생성 필요)_'
})
const new_sections_md = sections.join('\n\n---\n\n')

// ---- Phase 5: completeness & accuracy critic ----
log('Running completeness critic...')
const critique = await agent(
  'You are a completeness & accuracy critic for THREE new production-scale sections (large-scale ontology storage; near-real-time + batch serving; ontology update & freshness) appended to a food-delivery user-profiling methodology doc (target 30M users / 10M DAU). Review the draft sections. Identify gaps (missing practical content, with severity), contradictions (incl. with the locked context: decision-centric ontology, read-only derived properties, notebook-only Phase 2), unsupported claims, and genuine strengths. Be specific and actionable. Give overall_reliability.\n\nLOCKED CONTEXT:\n' + EXISTING_CONTEXT + '\n\nDRAFT SECTIONS:\n' + new_sections_md,
  { label: 'critic', phase: 'Critique', schema: CRITIQUE_SCHEMA, effort: 'high' })

// ---- Phase 6: fill the most important gaps ----
const toFill = (critique.gaps || []).filter((g) => g.severity === 'critical' || g.severity === 'moderate').slice(0, 2)
let addenda = []
if (toFill.length) {
  log('Filling ' + toFill.length + ' gap(s)...')
  addenda = (await parallel(toFill.map((g) => () =>
    agent('Research and write a SHORT markdown addendum (a tight paragraph or small list) filling this gap in the production-scale sections of a food-delivery user-profiling methodology doc (30M users / 10M DAU). You may use the web (load WebSearch/WebFetch via ToolSearch) and should cite sources. Be concrete. Return ONLY markdown starting EXACTLY with "### ' + g.topic + '" and nothing before it.\n\nGAP: ' + g.topic + ' — ' + g.why + '\n\n(Verified research context:)\n' + verifiedJson,
      { label: 'gapfill', phase: 'GapFill', effort: 'medium' })))).filter(Boolean)
}

// ---- Build the limits note for these new sections (folds into the doc's verification section) ----
const flagged = good.flatMap((v) => (v.verified_findings || [])
  .filter((f) => f.verdict === 'refuted' || f.verdict === 'unverifiable')
  .map((f) => ({ angle: v.angle, claim: f.claim, verdict: f.verdict, note: f.note })))

let limits_md = '### 9–11 (대규모/서빙/프레시니스) 검증 노트\n\n'
limits_md += 'production-scale 섹션도 적대적 검증 + 완성도 비평을 거쳤다. 종합 신뢰도(critic): **' + critique.overall_reliability + '**.\n\n'
limits_md += '**앵글별 신뢰도**\n\n| 앵글 | 신뢰도 |\n|---|---|\n' + good.map((v) => '| ' + v.angle + ' | ' + v.overall_reliability + ' |').join('\n') + '\n\n'
if ((critique.strengths || []).length) limits_md += '**강점**\n' + critique.strengths.map((x) => '- ' + x).join('\n') + '\n\n'
if ((critique.gaps || []).length) limits_md += '**남은 갭(critic)**\n\n| 주제 | 심각도 | 사유 |\n|---|---|---|\n' + critique.gaps.map((g) => '| ' + g.topic + ' | ' + g.severity + ' | ' + g.why + ' |').join('\n') + '\n\n'
if ((critique.contradictions || []).length) limits_md += '**모순/불일치**\n' + critique.contradictions.map((x) => '- ' + x).join('\n') + '\n\n'
if ((critique.unsupported_claims || []).length) limits_md += '**근거 부족 주장**\n' + critique.unsupported_claims.map((x) => '- ' + x).join('\n') + '\n\n'
if (flagged.length) limits_md += '**검증에서 반박/미확인된 주장 (build 시 주의)**\n' + flagged.map((f) => '- [' + f.angle + '] (' + f.verdict + ') ' + f.claim + (f.note ? ' — ' + f.note : '')).join('\n') + '\n\n'
if (addenda.length) limits_md += '#### 갭 보강(addenda)\n\n' + addenda.map((a) => String(a).trim()).join('\n\n') + '\n'

const toc_entries = [
  '9. 대규모 온톨로지 — 구축 & 스토리지 아키텍처 (30M users / 10M DAU)',
  '10. 서빙 — 근실시간(online) & 배치(offline)',
  '11. 온톨로지 업데이트 & 프레시니스(freshness)',
]

return { new_sections_md, limits_md, toc_entries, overall_reliability: critique.overall_reliability, angles_verified: good.length, gaps_filled: addenda.length }
