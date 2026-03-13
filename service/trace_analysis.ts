// Reasoning Trace Analysis Logic (LLM-Powered)
// Analyzes agent reasoning traces for logical fallacies using GPT-4o-mini

import { FALLACIES } from "./fallacies";

// Use OpenRouter for LLM access (cheaper, more models)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || Bun.env.OPENROUTER_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || "google/gemini-2.0-flash-001"; // Fast and cheap

interface FallacyResult {
  id: string;
  name: string;
  severity: number;
  evidence: string;
  explanation: string;
}

interface TraceAnalysisResult {
  logical_validity: number;
  status: "valid" | "caution" | "flawed";
  flaws_detected: FallacyResult[];
  cognitive_load_estimate: "low" | "medium" | "high";
  reasoning_efficiency: number;
  recommendations: string[];
  feedback_token: string;
  model_used: string;
}

// Build fallacy reference for the prompt
const FALLACY_REFERENCE = FALLACIES.map(f => 
  `- ${f.name} (${f.id}): ${f.description} Agent pattern: ${f.agent_pattern}`
).join("\n");

export async function reasoningTraceAnalysis(data: any): Promise<TraceAnalysisResult> {
  const { trace } = data;
  if (!trace) {
    throw new Error("Missing 'trace' field in request body.");
  }

  const wordCount = trace.split(/\s+/).length;
  const cognitiveLoad = wordCount > 500 ? "high" : wordCount > 150 ? "medium" : "low";

  // If no API key, fall back to pattern matching
  if (!OPENROUTER_API_KEY) {
    console.warn("[trace_analysis] No OPENROUTER_API_KEY found, using pattern fallback");
    return patternBasedAnalysis(trace, cognitiveLoad);
  }

  try {
    const systemPrompt = `You are a forensic logic auditor analyzing AI agent reasoning traces for logical fallacies.

Your task: Identify ANY logical fallacies present in the reasoning trace below.

FALLACY TAXONOMY (use these exact names and IDs):
${FALLACY_REFERENCE}

IMPORTANT RULES:
1. Use the EXACT fallacy names from the taxonomy above
2. Be precise - only flag fallacies you can clearly identify with evidence
3. Quote the specific text that demonstrates the fallacy
4. Rate severity 0.0-1.0 (0.1=minor, 0.5=moderate, 0.9=severe)

Respond in valid JSON only:
{
  "flaws": [
    {
      "id": "fallacy_id_from_taxonomy",
      "name": "Exact Fallacy Name",
      "severity": 0.0-1.0,
      "evidence": "quoted text from the trace",
      "explanation": "why this is a fallacy"
    }
  ],
  "overall_validity": 0.0-1.0,
  "summary": "brief assessment"
}

If NO fallacies found, return: {"flaws": [], "overall_validity": 1.0, "summary": "No logical fallacies detected."}`;

    const userPrompt = `Analyze this reasoning trace for logical fallacies:\n\n"""${trace}"""`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Mercury Cognitive Diagnostics",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[trace_analysis] OpenAI API error:", response.status, errorText);
      return patternBasedAnalysis(trace, cognitiveLoad);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("[trace_analysis] No content in OpenAI response");
      return patternBasedAnalysis(trace, cognitiveLoad);
    }

    const parsed = JSON.parse(content);
    const flaws = parsed.flaws || [];
    const validity = parsed.overall_validity ?? (1 - flaws.length * 0.15);

    const status = validity > 0.8 ? "valid" : validity > 0.5 ? "caution" : "flawed";

    return {
      logical_validity: parseFloat(validity.toFixed(2)),
      status,
      flaws_detected: flaws.map((f: any) => ({
        id: f.id || "unknown",
        name: f.name || "Unknown Fallacy",
        severity: f.severity || 0.3,
        evidence: f.evidence || "",
        explanation: f.explanation || ""
      })),
      cognitive_load_estimate: cognitiveLoad,
      reasoning_efficiency: parseFloat((1 - flaws.length * 0.1).toFixed(2)),
      recommendations: flaws.length > 0 
        ? flaws.map((f: any) => `Address ${f.name}: ${f.explanation}`)
        : ["Reasoning appears logically sound."],
      feedback_token: "rta_" + Math.random().toString(36).substr(2, 9),
      model_used: `${LLM_MODEL} (via OpenRouter)`
    };

  } catch (error: any) {
    console.error("[trace_analysis] Error calling OpenAI:", error.message);
    return patternBasedAnalysis(trace, cognitiveLoad);
  }
}

// Fallback pattern-based analysis (when no API key or on error)
function patternBasedAnalysis(trace: string, cognitiveLoad: string): TraceAnalysisResult {
  const traceLower = trace.toLowerCase();
  const detected_flaws: FallacyResult[] = [];

  // Pattern matching for common fallacies
  const patterns: Array<{ id: string; name: string; test: () => boolean; explanation: string }> = [
    {
      id: "strawman",
      name: "Strawman",
      test: () => traceLower.includes("ignore") && (traceLower.includes("constraint") || traceLower.includes("edge case")),
      explanation: "Appears to simplify or misrepresent a constraint"
    },
    {
      id: "false_cause",
      name: "False Cause",
      test: () => (traceLower.includes("because") || traceLower.includes("therefore")) && 
                  (traceLower.includes("must be") || traceLower.includes("so it")) &&
                  !traceLower.includes("evidence"),
      explanation: "Assumes causation without establishing evidence"
    },
    {
      id: "appeal_to_authority",
      name: "Appeal to Authority",
      test: () => traceLower.includes("best practice") || traceLower.includes("industry standard") || 
                  (traceLower.includes("popular") && traceLower.includes("therefore")),
      explanation: "Uses authority or popularity as sole justification"
    },
    {
      id: "slippery_slope",
      name: "Slippery Slope",
      test: () => traceLower.includes("lead to") && (traceLower.includes("risk") || traceLower.includes("dangerous") || traceLower.includes("worse")),
      explanation: "Assumes extreme consequences without intermediate steps"
    },
    {
      id: "circular_reasoning",
      name: "Begging the Question",
      test: () => {
        const words = traceLower.split(/\s+/);
        return words.length < 30 && (traceLower.includes("because it is") || traceLower.includes("since it's"));
      },
      explanation: "Conclusion restates the premise"
    },
    {
      id: "false_dichotomy",
      name: "Black-or-White",
      test: () => (traceLower.includes("either") && traceLower.includes("or")) || 
                  (traceLower.includes("only option") || traceLower.includes("no other choice")),
      explanation: "Presents false binary choice"
    },
    {
      id: "ad_populum",
      name: "Bandwagon",
      test: () => traceLower.includes("everyone") || traceLower.includes("most people") || 
                  (traceLower.includes("popular") && traceLower.includes("best")),
      explanation: "Appeals to popularity rather than merit"
    }
  ];

  for (const pattern of patterns) {
    if (pattern.test()) {
      detected_flaws.push({
        id: pattern.id,
        name: pattern.name,
        severity: 0.4,
        evidence: "(pattern-matched)",
        explanation: pattern.explanation
      });
    }
  }

  const validity = Math.max(0.1, 1 - detected_flaws.length * 0.2);
  const status = validity > 0.8 ? "valid" : validity > 0.5 ? "caution" : "flawed";

  return {
    logical_validity: parseFloat(validity.toFixed(2)),
    status,
    flaws_detected: detected_flaws,
    cognitive_load_estimate: cognitiveLoad as "low" | "medium" | "high",
    reasoning_efficiency: parseFloat((1 - detected_flaws.length * 0.1).toFixed(2)),
    recommendations: detected_flaws.length > 0
      ? detected_flaws.map(f => `Review for potential ${f.name}: ${f.explanation}`)
      : ["No obvious fallacies detected via pattern matching. Consider LLM analysis for deeper review."],
    feedback_token: "rta_" + Math.random().toString(36).substr(2, 9),
    model_used: "pattern-engine-v2 (fallback - no API key)"
  };
}
