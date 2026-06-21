export const meta = {
  name: 'wproject-profiling-research',
  description: 'Practical ontology-grounded food-delivery user-profiling methodology research (Palantir-benchmarked), adversarially verified, synthesized into design/wproject-research.md',
  phases: [
    { title: 'Research', detail: '5 parallel angles incl. Palantir (web + local docs)' },
    { title: 'Verify', detail: 'adversarial fact-check of each angle' },
    { title: 'Synthesize', detail: 'architect: methodology + notebook design decisions' },
    { title: 'Write', detail: 'one agent per doc section (Korean)' },
    { title: 'Critique', detail: 'completeness & accuracy critic' },
    { title: 'GapFill', detail: 'fill critical/moderate gaps' },
  ],
}

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    angle: { type: 'string' },
    summary: { type: 'string' },
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

const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    recommended_methodology: { type: 'array', items: { type: 'string' } },
    recommended_headline: { type: 'string' },
    headline_rationale: { type: 'string' },
    notebook_design: { type: 'object', additionalProperties: false, properties: {
      stack: { type: 'array', items: { type: 'string' } },
      ontology_schema: { type: 'array', items: { type: 'string' } },
      profile_dimensions: { type: 'array', items: { type: 'string' } },
      steps: { type: 'array', items: { type: 'string' } },
      evaluation: { type: 'array', items: { type: 'string' } },
    }, required: ['stack','ontology_schema','profile_dimensions','steps','evaluation'] },
    through_lines: { type: 'array', items: { type: 'string' } },
    palantir_benchmark: { type: 'array', items: { type: 'string' } },
  }, required: ['recommended_methodology','recommended_headline','headline_rationale','notebook_design','through_lines','palantir_benchmark'],
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

const ANGLES = [
  { key: 'palantir', web: true, title: 'Palantir Foundry Ontology / AIP / OSDK',
    brief: 'Cover Foundry Ontology primitives (Object Types, Link Types, Properties, Action Types, Functions), the AIP layer (LLM agents + Ontology, AIP Logic, AIP Agent Studio, write-back actions), the Ontology SDK (OSDK), and the layering Palantir markets (semantic / kinetic / dynamic). Explain the decision-centric ontology idea and how Actions/write-back close the operational loop. Then explicitly MAP each concept to food-delivery user profiling: what would be Object Types, Link Types, Properties, Action Types and Functions for a "user profile -> personalized recommendation" use case at a DoorDash-style company.' },
  { key: 'industry', web: true, title: 'Marketplace / food-delivery user profiling in production',
    brief: 'How DoorDash, Uber Eats, Instacart, Amazon and similar actually build user profiles and personalization in production: behavioral signal collection, RFM (recency/frequency/monetary), embedding & two-tower retrieval, learned ranking, feature stores & real-time features, contextual signals (time-of-day, weather, location, occasion), cold-start strategies, identity resolution / household, and privacy. Note explicitly WHERE knowledge graphs or ontologies appear (e.g. Uber/DoorDash food knowledge graphs, Amazon Product Graph). Cite engineering blogs/papers.' },
  { key: 'kg_method', web: true, title: 'Ontology / knowledge-graph profiling methodology',
    brief: 'Methodology for designing a user-profiling ontology/KG: entity & relationship modeling, food taxonomies & standards (FoodOn, schema.org/Recipe, GS1, USDA FoodData), dietary / allergen / nutrition modeling, graph-based recommendation (meta-path, personalized PageRank, light GNN), and EXPLAINABLE recommendation via graph paths. Cover GraphRAG (graph + LLM retrieval) in practical terms. Focus on what a small team can actually implement.' },
  { key: 'llm_agentic', web: true, title: 'LLM / agentic profiling & governance',
    brief: 'Using LLMs to synthesize structured user profiles from raw behavior, generate human-readable explanations, power conversational personalization, and act as agents over a graph (tool-use / function calling). Governance: PII handling, consent, guardrails, bias/fairness, and evaluation of LLM-generated profiles. Give practical patterns and concrete pitfalls.' },
  { key: 'blueprint', web: false, title: 'whchoi / AWS blueprint transfer points',
    brief: 'Using ONLY the local analysis docs, extract exactly what transfers to a food-delivery user-profile ontology: the 4-part skeleton (ontology graph / hybrid search / Agentic AI / governance), source tagging (source / data_depth), persona-as-presentation layer, hybrid search (BM25 Nori + Cohere KNN + RRF + rerank), 1-3 hop traversal, and the compliance gate. For EACH element, note the AWS realization AND a lightweight open-source equivalent suitable for a local notebook (no AWS infra).' },
]

function researchPrompt(a) {
  const webInstr = a.web
    ? 'You have web access. FIRST call ToolSearch with query "select:WebSearch,WebFetch" to load the web tools, then run 4-8 targeted searches and FETCH 3-6 authoritative PRIMARY sources (official docs, engineering blogs, papers). Prefer primary over secondary. Record exact source URLs for each claim.'
    : 'Do NOT use the web. Read these local files with the Read tool: /home/ubuntu/person-profile-ontology/design/summary.md, /home/ubuntu/person-profile-ontology/design/analysis.md, /home/ubuntu/person-profile-ontology/design/retail-analysis.md, /home/ubuntu/person-profile-ontology/design/gcc-analysis.md, /home/ubuntu/person-profile-ontology/design/prd.md. Base every finding on them; use the file path as the source.'
  return 'You are a research specialist for the W Project: ontology-grounded, PRACTICAL User Profiling for food delivery (DoorDash-style), to improve customer experience. Phase 2 will be a Jupyter NOTEBOOK on synthetic data (no AWS infra), so favor findings an engineer can act on locally.\n\n'
    + 'YOUR ANGLE: ' + a.title + '\n' + a.brief + '\n\n'
    + webInstr + '\n\n'
    + 'Be concrete and practical. For every non-obvious factual claim attach source URLs and a confidence. Distinguish well-established fact from vendor marketing or speculation. Surface reusable PRACTICAL PATTERNS (how-to). Tie every finding back to food-delivery user profiling. Return structured findings per the schema: 8-16 findings, quality over quantity, no filler.'
}

function verifyPrompt(findings, a) {
  return 'You are an ADVERSARIAL fact-checker. Below are research findings for the angle "' + a.title + '" of a practical food-delivery user-profiling study. Your job: try to REFUTE each significant claim. Be skeptical; default to "partially-supported" or "unverifiable" when evidence is thin.\n\n'
    + (a.web
      ? 'You have web access — FIRST call ToolSearch "select:WebSearch,WebFetch" to load web tools, then verify the most load-bearing/checkable claims against primary sources.'
      : 'These findings come from internal repo docs; verify internal consistency and flag anything stated as fact that is really a design assumption.')
    + '\n\nFor each significant claim give: verdict (supported / partially-supported / refuted / unverifiable), corrected_detail (the accurate version), note (what you checked), sources. Then overall_reliability and key_takeaways (claims safe to build on).\n\nFINDINGS:\n'
    + JSON.stringify(findings, null, 2)
}

const SECTION_SPECS = [
  { id: 'exec', title: '0. Executive Summary — 실무 결론',
    must: 'A tight executive summary: one-paragraph practical takeaway; the recommended end-to-end methodology in 4-6 bullets; the recommended notebook headline outcome and one-line why; a one-line "Palantir says X, we do Y" framing.' },
  { id: 'problem', title: '1. 문제 정의 — 푸드 딜리버리 User Profiling',
    must: 'Why user profiling matters for DoorDash-style CX (concrete CX levers). Define what a "user profile" IS here (the profile dimensions). What input data exists (orders, items, restaurants, context signals). What "good" looks like.' },
  { id: 'palantir', title: '2. Palantir 레퍼런스 — Ontology / AIP / OSDK',
    must: 'Precise, verified explanation of Foundry Ontology primitives (Object/Link/Property/Action Types, Functions), AIP (ontology+LLM agents, write-back), OSDK, and the semantic/kinetic/dynamic layering and decision-centric idea. Then a concrete mapping table: Palantir concept -> food-delivery user-profiling equivalent. Cite sources inline.' },
  { id: 'industry', title: '3. 업계 실무 — 마켓플레이스 User Profiling',
    must: 'How DoorDash/Uber Eats/Instacart/Amazon actually profile users: signals, RFM, embeddings/two-tower, ranking, feature stores, real-time context, cold-start, identity resolution; and where knowledge graphs appear. Practical and cited.' },
  { id: 'kg_method', title: '4. 온톨로지/지식그래프 프로파일링 방법론',
    must: 'How to design a profiling ontology; food taxonomies (FoodOn/schema.org/GS1/USDA); dietary & allergen modeling; graph-based + EXPLAINABLE recommendation (meta-path / personalized PageRank / light GNN); GraphRAG. Implementable by a small team.' },
  { id: 'llm_agentic', title: '5. LLM·Agentic 프로파일링 & 거버넌스',
    must: 'LLM profile synthesis from behavior, explanation generation, conversational personalization, agent/tool-use over the graph; governance: PII/consent/guardrails/bias/eval. Practical patterns + pitfalls.' },
  { id: 'blueprint', title: '6. whchoi/AWS 블루프린트 이식 포인트',
    must: 'What transfers from the analyzed AWS/whchoi demos (4-part skeleton, source tagging, persona layer, hybrid search, 1-3 hop, compliance gate). For each, give the AWS realization AND a lightweight OSS equivalent for a local notebook. Use a table.' },
  { id: 'recommend', title: '7. 권고 — 실무 방법론 (Palantir 벤치마크 대비)',
    must: 'The synthesized recommended PRACTICAL methodology for food-delivery profiling, EXPLICITLY benchmarked against Palantir (adopt / adapt / skip, with why). Pragmatic stack choices. This is the opinionated core — be decisive. Use the architect brief.' },
  { id: 'notebook', title: '8. 노트북 설계 — 합성 데이터 테스트 구현',
    must: 'Concrete, runnable-locally notebook design from the architect brief: stack, synthetic-data plan, ontology schema (classes + key relations for food delivery), profile model/dimensions, ordered notebook sections/cells for the headline outcome, and evaluation. This must directly set up Phase 2 implementation.' },
]

function sectionPrompt(s, briefJson, verifiedJson) {
  return 'You are writing ONE section of a practical methodology document. Write in KOREAN with English technical terms, matching the concise style of the repo design/*.md docs.\n\n'
    + 'SECTION TO WRITE:\n## ' + s.title + '\nMust cover: ' + s.must + '\n\n'
    + 'RULES:\n'
    + '- Return ONLY the markdown for this one section, starting with the heading "## ' + s.title + '". No preamble, no other sections, NO code-fence wrapper around the whole thing.\n'
    + '- Practical and concrete; an engineer must be able to act on it. Use tables/lists where they help.\n'
    + '- Cite sources inline (URLs from the verified research) where you state facts.\n'
    + '- Stay consistent with the ARCHITECT BRIEF (recommended methodology, notebook design, through-lines); do not contradict it.\n'
    + '- Use only claims supported by the VERIFIED RESEARCH; if something is uncertain or was refuted, either omit it or mark it clearly.\n'
    + '- Concise Korean prose: omit needless words.\n\n'
    + 'ARCHITECT BRIEF:\n' + briefJson + '\n\nVERIFIED RESEARCH (ground truth — use only this):\n' + verifiedJson
}

// ---- Phase 1+2: research each angle, then adversarially verify it (pipelined) ----
log('Researching 5 angles (Palantir-first) + adversarial verification...')
const verified = await pipeline(
  ANGLES,
  (a) => agent(researchPrompt(a), { label: 'research:' + a.key, phase: 'Research', schema: FINDINGS_SCHEMA, effort: 'high' }),
  (findings, a) => findings == null ? null
    : agent(verifyPrompt(findings, a), { label: 'verify:' + a.key, phase: 'Verify', schema: VERIFIED_SCHEMA, effort: 'high' }),
)
const good = verified.filter(Boolean)
const verifiedJson = JSON.stringify(good, null, 2)
log('Verified ' + good.length + '/' + ANGLES.length + ' angles. Synthesizing...')

// ---- Phase 3: architect decides methodology + notebook design ----
const architectPrompt = 'You are the lead architect synthesizing a PRACTICAL methodology for ontology-grounded food-delivery User Profiling (DoorDash-style). Palantir Foundry/Ontology/AIP is the BENCHMARK reference. Phase 2 is a NOTEBOOK on synthetic data (NO AWS infra), so notebook_design MUST be lightweight and locally runnable (Python; graph via networkx/rdflib/kuzu; storage via duckdb/pandas; LLM optional via API).\n\n'
  + 'Using the VERIFIED research below, decide:\n'
  + '1. recommended_methodology: the practical end-to-end methodology (ordered, concrete).\n'
  + '2. recommended_headline + headline_rationale: the single best notebook headline outcome (profile->explainable recommendation, profile-card/persona, or segmentation).\n'
  + '3. notebook_design: stack, ontology_schema (classes + key relations for food delivery), profile_dimensions, steps (ordered notebook sections), evaluation.\n'
  + '4. through_lines: cross-cutting themes the doc must carry (source tagging, explainability, governance/PII, persona layer, cold-start...).\n'
  + '5. palantir_benchmark: for each pragmatic choice, what Palantir does vs what we adopt/adapt/skip and why.\n\n'
  + 'Be decisive and practical.\n\nVERIFIED RESEARCH:\n' + verifiedJson
const brief = await agent(architectPrompt, { label: 'architect', phase: 'Synthesize', schema: BRIEF_SCHEMA, effort: 'xhigh' })
const briefJson = JSON.stringify(brief, null, 2)

// ---- Phase 4: write each section in parallel ----
log('Writing ' + SECTION_SPECS.length + ' sections...')
const sectionMd = await parallel(SECTION_SPECS.map((s) => () =>
  agent(sectionPrompt(s, briefJson, verifiedJson), { label: 'write:' + s.id, phase: 'Write', effort: 'high' })))

const header = '# W Project — 푸드 딜리버리 User Profiling 실무 방법론 리서치\n\n'
  + '> Ontology-grounded · **Palantir(Foundry/Ontology/AIP) 벤치마크** · 합성데이터 노트북 구현 전제\n'
  + '> 작성일: 2026-06-20 · 멀티에이전트 리서치 + 적대적 검증(adversarial verify) 워크플로 산출\n\n'
  + '## 목차\n' + SECTION_SPECS.map((s) => '- ' + s.title).join('\n') + '\n- 9. 검증 & 한계 노트\n\n---\n\n'

const body = SECTION_SPECS.map((s, i) => {
  const md = sectionMd[i]
  return (md && String(md).trim()) ? String(md).trim() : '## ' + s.title + '\n\n> _(이 섹션 생성 실패 — 재생성 필요)_'
}).join('\n\n---\n\n')

// ---- Phase 5: completeness & accuracy critic ----
log('Running completeness critic...')
const draft = header + body
const critique = await agent(
  'You are a completeness & accuracy critic for a practical food-delivery user-profiling methodology doc (ontology-grounded, Palantir-benchmarked, leading to a synthetic-data notebook). Review the assembled draft. Identify: gaps (missing practical content a reader needs, with severity), contradictions, claims stated without support, and genuine strengths. Be specific and actionable. Give overall_reliability.\n\nDRAFT:\n' + draft,
  { label: 'critic', phase: 'Critique', schema: CRITIQUE_SCHEMA, effort: 'high' })

// ---- Phase 6: fill the most important gaps ----
const toFill = (critique.gaps || []).filter((g) => g.severity === 'critical' || g.severity === 'moderate').slice(0, 3)
let addenda = []
if (toFill.length) {
  log('Filling ' + toFill.length + ' gap(s)...')
  addenda = (await parallel(toFill.map((g) => () =>
    agent('Research and write a SHORT markdown addendum (a tight paragraph or small list) filling this gap in a practical food-delivery user-profiling methodology doc. You may use the web (load WebSearch/WebFetch via ToolSearch) and should cite sources. Be concrete. Return ONLY markdown starting with "### ' + g.topic + '".\n\nGAP: ' + g.topic + ' — ' + g.why + '\n\n(Verified research context:)\n' + verifiedJson,
      { label: 'gapfill', phase: 'GapFill', effort: 'medium' })))).filter(Boolean)
}

// ---- Build section 9 (verification & limits) from verdicts + critique ----
const flagged = good.flatMap((v) => (v.verified_findings || [])
  .filter((f) => f.verdict === 'refuted' || f.verdict === 'unverifiable')
  .map((f) => ({ angle: v.angle, claim: f.claim, verdict: f.verdict, note: f.note })))

let s9 = '## 9. 검증 & 한계 노트\n\n'
s9 += '본 문서는 멀티에이전트 리서치 후 **적대적 검증**과 **완성도 비평** 단계를 거쳤다. 종합 신뢰도(critic): **' + critique.overall_reliability + '**.\n\n'
s9 += '**앵글별 신뢰도**\n\n| 앵글 | 신뢰도 |\n|---|---|\n' + good.map((v) => '| ' + v.angle + ' | ' + v.overall_reliability + ' |').join('\n') + '\n\n'
if ((critique.strengths || []).length) s9 += '**강점**\n' + critique.strengths.map((x) => '- ' + x).join('\n') + '\n\n'
if ((critique.gaps || []).length) s9 += '**남은 갭(critic)**\n\n| 주제 | 심각도 | 사유 |\n|---|---|---|\n' + critique.gaps.map((g) => '| ' + g.topic + ' | ' + g.severity + ' | ' + g.why + ' |').join('\n') + '\n\n'
if ((critique.contradictions || []).length) s9 += '**모순/불일치**\n' + critique.contradictions.map((x) => '- ' + x).join('\n') + '\n\n'
if ((critique.unsupported_claims || []).length) s9 += '**근거 부족 주장**\n' + critique.unsupported_claims.map((x) => '- ' + x).join('\n') + '\n\n'
if (flagged.length) s9 += '**검증에서 반박/미확인된 주장 (build 시 주의)**\n' + flagged.map((f) => '- [' + f.angle + '] (' + f.verdict + ') ' + f.claim + (f.note ? ' — ' + f.note : '')).join('\n') + '\n\n'
if (addenda.length) s9 += '---\n\n### 갭 보강(addenda)\n\n' + addenda.map((a) => String(a).trim()).join('\n\n') + '\n'

const markdown = draft + '\n\n---\n\n' + s9

return { markdown, recommended_headline: brief.recommended_headline, overall_reliability: critique.overall_reliability, angles_verified: good.length, gaps_filled: addenda.length }
