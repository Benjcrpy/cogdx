/**
 * Consensus Verification Oracle - Real Sources
 * Independent verification through multiple sources
 */

interface VerifyRequest {
  agent_id: string;
  claim: string;
  context?: string;
  verification_depth?: "quick" | "standard" | "deep";
  min_sources?: number;
}

interface SourceResult {
  source_id: string;
  source_type: "search" | "model" | "database";
  independence_score: number;
  agrees: boolean | null;
  evidence: string;
  retrieval_timestamp: string;
}

interface Disagreement {
  source_a: string;
  source_b: string;
  nature: "factual" | "interpretive" | "scope";
  details: string;
}

interface VerifyResponse {
  claim: string;
  consensus_level: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  verdict: "verified" | "contested" | "refuted" | "unverifiable";
  sources: SourceResult[];
  disagreements: Disagreement[];
  epistemic_status: {
    label: "verified" | "likely_true" | "uncertain" | "likely_false" | "false" | "unverifiable";
    reasoning: string;
  };
  methodology: string;
  source_count: number;
}

// Verification prompts designed for independence
const VERIFICATION_PROMPTS = {
  factual: (claim: string, context: string) => `
You are a fact-checker. Evaluate this claim strictly based on factual accuracy.
Claim: "${claim}"
${context ? `Context: ${context}` : ""}

Respond in JSON format:
{
  "agrees": true/false/null (null if cannot determine),
  "confidence": 0.0-1.0,
  "evidence": "brief explanation with specific facts",
  "issues": ["any concerns or caveats"]
}`,

  skeptical: (claim: string, context: string) => `
You are a skeptical analyst. Look for reasons this claim might be FALSE or misleading.
Claim: "${claim}"
${context ? `Context: ${context}` : ""}

Respond in JSON format:
{
  "agrees": true/false/null,
  "confidence": 0.0-1.0,
  "evidence": "explanation focusing on potential problems",
  "issues": ["specific concerns"]
}`,

  charitable: (claim: string, context: string) => `
You are an analyst who steelmans claims. Look for interpretations that make this claim TRUE.
Claim: "${claim}"
${context ? `Context: ${context}` : ""}

Respond in JSON format:
{
  "agrees": true/false/null,
  "confidence": 0.0-1.0,
  "evidence": "explanation with strongest supporting interpretation",
  "issues": ["any remaining concerns"]
}`,

  temporal: (claim: string, context: string) => `
You are a temporal analyst. Consider whether this claim's truth depends on TIME.
Claim: "${claim}"
${context ? `Context: ${context}` : ""}

Respond in JSON format:
{
  "agrees": true/false/null,
  "confidence": 0.0-1.0,
  "evidence": "explanation noting any time-dependencies",
  "issues": ["temporal concerns - was this true before? might it change?"]
}`,
};

type VerifierType = keyof typeof VERIFICATION_PROMPTS;

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || "anthropic/claude-3.5-sonnet,openai/gpt-4o-mini,google/gemini-2.0-flash").split(",").map(s => s.trim()).filter(Boolean);
const MAX_TOKENS = Number(process.env.VERIFY_CONSENSUS_MAX_TOKENS || 256);
const MAX_COST_USD = Number(process.env.VERIFY_CONSENSUS_MAX_COST_USD || 0.10);

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callOpenRouter(model: string, prompt: string): Promise<any> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Cerebratech Verify Consensus",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a verification agent. Output ONLY valid JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  return parsed || { agrees: null, confidence: 0.0, evidence: "Unparseable response", issues: ["invalid_json"] };
}

// Real model verification via OpenRouter
async function runVerifier(
  verifierType: VerifierType,
  claim: string,
  context: string,
  model: string,
  independenceScore: number
): Promise<SourceResult> {
  const prompt = VERIFICATION_PROMPTS[verifierType](claim, context);
  const result = await callOpenRouter(model, prompt);
  const agrees = typeof result.agrees === "boolean" ? result.agrees : null;
  const evidence = result.evidence || "";

  return {
    source_id: `model:${model}:${verifierType}`,
    source_type: "model",
    independence_score: independenceScore,
    agrees,
    evidence,
    retrieval_timestamp: new Date().toISOString(),
  };
}

// Web search verification via Brave
async function searchVerify(claim: string): Promise<SourceResult> {
  if (!BRAVE_API_KEY) {
    return {
      source_id: "web_search_brave",
      source_type: "search",
      independence_score: 0.9,
      agrees: null,
      evidence: "BRAVE_API_KEY missing; search grounding unavailable.",
      retrieval_timestamp: new Date().toISOString(),
    };
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(claim)}&count=3`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": BRAVE_API_KEY,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      source_id: "web_search_brave",
      source_type: "search",
      independence_score: 0.9,
      agrees: null,
      evidence: `Brave search error: ${res.status} ${errText}`,
      retrieval_timestamp: new Date().toISOString(),
    };
  }

  const data = await res.json();
  const results = data?.web?.results || [];
  const snippets = results.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.title} — ${r.description} (${r.url})`);
  const evidence = snippets.length ? snippets.join("\n") : "No search results returned.";

  return {
    source_id: "web_search_brave",
    source_type: "search",
    independence_score: 0.9,
    agrees: null,
    evidence,
    retrieval_timestamp: new Date().toISOString(),
  };
}

function calculateConsensus(sources: SourceResult[]): {
  consensus_level: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  verdict: "verified" | "contested" | "refuted" | "unverifiable";
} {
  const validSources = sources.filter(s => s.agrees !== null);
  
  if (validSources.length < 2) {
    return {
      consensus_level: 0,
      confidence: "insufficient",
      verdict: "unverifiable",
    };
  }
  
  // Weighted agreement calculation
  let totalWeight = 0;
  let weightedAgreement = 0;
  
  for (const source of validSources) {
    const weight = source.independence_score;
    totalWeight += weight;
    weightedAgreement += weight * (source.agrees ? 1 : 0);
  }
  
  const consensus = totalWeight > 0 ? weightedAgreement / totalWeight : 0;
  
  // Determine confidence based on source count and consensus strength
  let confidence: "high" | "medium" | "low" | "insufficient";
  if (validSources.length >= 5 && (consensus >= 0.85 || consensus <= 0.15)) {
    confidence = "high";
  } else if (validSources.length >= 3 && (consensus >= 0.70 || consensus <= 0.30)) {
    confidence = "medium";
  } else {
    confidence = "low";
  }
  
  // Determine verdict
  let verdict: "verified" | "contested" | "refuted" | "unverifiable";
  if (consensus >= 0.75) {
    verdict = "verified";
  } else if (consensus <= 0.25) {
    verdict = "refuted";
  } else {
    verdict = "contested";
  }
  
  return { consensus_level: Math.round(consensus * 1000) / 1000, confidence, verdict };
}

function findDisagreements(sources: SourceResult[]): Disagreement[] {
  const disagreements: Disagreement[] = [];
  
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      
      if (a.agrees !== null && b.agrees !== null && a.agrees !== b.agrees) {
        disagreements.push({
          source_a: a.source_id,
          source_b: b.source_id,
          nature: "factual",
          details: `${a.source_id} says ${a.agrees ? "true" : "false"}, ${b.source_id} says ${b.agrees ? "true" : "false"}`,
        });
      }
    }
  }
  
  return disagreements;
}

function determineEpistemicStatus(
  consensus: number,
  confidence: string,
  verdict: string,
  sources: SourceResult[]
): { label: string; reasoning: string } {
  const nullCount = sources.filter(s => s.agrees === null).length;
  
  if (nullCount === sources.length) {
    return {
      label: "unverifiable",
      reasoning: "No sources could determine truth value. Claim may be opinion, future prediction, or require specialized knowledge.",
    };
  }
  
  if (verdict === "verified" && confidence === "high") {
    return { label: "verified", reasoning: "High consensus across independent sources." };
  }
  if (verdict === "verified") {
    return { label: "likely_true", reasoning: "Majority of sources agree, but confidence is not high." };
  }
  if (verdict === "refuted" && confidence === "high") {
    return { label: "false", reasoning: "High consensus that claim is false." };
  }
  if (verdict === "refuted") {
    return { label: "likely_false", reasoning: "Majority of sources disagree with claim." };
  }
  
  return { label: "uncertain", reasoning: "Sources disagree or insufficient data for confident verdict." };
}

export async function verifyConsensus(request: VerifyRequest): Promise<VerifyResponse> {
  const {
    agent_id,
    claim,
    context = "",
    verification_depth = "standard",
    min_sources = 3,
  } = request;
  
  if (!agent_id || !claim) {
    throw new Error("agent_id and claim are required");
  }
  
  // Pricing guardrails by depth
  const depthCosts: Record<string, number> = { quick: 0.10, standard: 0.25, deep: 0.50 };
  const requiredCost = depthCosts[verification_depth] ?? depthCosts.standard;
  if (requiredCost > MAX_COST_USD) {
    throw new Error(`Requested depth '${verification_depth}' exceeds max budget $${MAX_COST_USD.toFixed(2)}. Use a lower depth or increase VERIFY_CONSENSUS_MAX_COST_USD.`);
  }

  // Select verifiers based on depth
  const verifierSets: Record<string, VerifierType[]> = {
    quick: ["factual"],
    standard: ["factual", "skeptical"],
    deep: ["factual", "skeptical", "charitable"],
  };
  const verifiers = verifierSets[verification_depth] || verifierSets.standard;

  // Search grounding first
  const searchResult = await searchVerify(claim);
  const searchContext = searchResult?.evidence ? `\n\nSearch evidence:\n${searchResult.evidence}` : "";
  const combinedContext = `${context}${searchContext}`.trim();

  // Assign models per verifier for independence
  if (OPENROUTER_MODELS.length < 2) {
    throw new Error("OPENROUTER_MODELS must include at least 2 models for independent verification.");
  }
  const assignedModels = verifiers.map((_, i) => OPENROUTER_MODELS[i % OPENROUTER_MODELS.length]);
  const uniqueModels = new Set(assignedModels);

  // Run all verifiers in parallel
  const verifierPromises = verifiers.map((v, i) => {
    const model = assignedModels[i];
    const independenceScore = uniqueModels.size > 1 ? 0.7 : 0.5;
    return runVerifier(v, claim, combinedContext, model, independenceScore);
  });

  const verifierResults = await Promise.all(verifierPromises);
  const sources = [searchResult, ...verifierResults];

  // Calculate consensus
  const { consensus_level, confidence, verdict } = calculateConsensus(sources);

  // Find disagreements
  const disagreements = findDisagreements(sources);

  // Determine epistemic status
  const epistemic_status = determineEpistemicStatus(
    consensus_level,
    confidence,
    verdict,
    sources
  ) as VerifyResponse["epistemic_status"];

  return {
    claim,
    consensus_level,
    confidence,
    verdict,
    sources,
    disagreements,
    epistemic_status,
    methodology: `Consensus verification using ${sources.length} sources (${verification_depth} depth) with Brave search grounding + OpenRouter multi-model verifiers. Independence-weighted consensus calculation.`,
    source_count: sources.length,
  };
}
