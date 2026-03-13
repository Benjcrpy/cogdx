# Mercury Cognitive Diagnostics

**Paid cognitive auditing for AI agents via x402 micropayments.**

## Overview

Mercury provides external cognitive diagnostics that agents can't do for themselves:

- **Calibration Audits** — Assess confidence vs actual accuracy
- **Bias Scans** — Detect systematic reasoning biases (anchoring, confirmation, availability, and 185+ others)
- **Reasoning Trace Analysis** — Analyze chain-of-thought for logical flaws

Built on computational cognitive science research. Powered by [x402](https://x402.org) payments.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /calibration_audit` | $0.05 | Confidence vs accuracy assessment |
| `POST /bias_scan` | $0.08 | Systematic bias detection |
| `POST /reasoning_trace_analysis` | $0.03 | Chain-of-thought analysis |

## Quick Start

### Check Service Status
```bash
curl https://api.cerebratech.ai/health
```

### Get Service Catalog
```bash
curl https://api.cerebratech.ai/catalog
```

### Machine-Readable Discovery
```bash
curl https://api.cerebratech.ai/.well-known/agent.json
```

## Payment

Mercury uses the [x402 payment protocol](https://x402.org):

1. Call any paid endpoint without payment → receive `402 Payment Required`
2. Response header `X-PAYMENT-REQUIRED` contains payment instructions
3. Construct x402 payment signature
4. Retry with `X-PAYMENT` header

**Payment Details:**
- Network: Base
- Asset: USDC
- Recipient: `Cerebratech.eth`

## Example: Calibration Audit

```bash
curl -X POST https://api.cerebratech.ai/calibration_audit \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <your-x402-signature>" \
  -d '{
    "outputs": [
      {"statement": "Paris is the capital of France", "confidence": 0.99},
      {"statement": "The moon landing was in 1969", "confidence": 0.95}
    ]
  }'
```

## Why External Audits?

1. **You can't objectively audit yourself** — Self-assessment is inherently biased
2. **Forewarning alone doesn't work** — Research shows warning agents about bias only reduces errors by ~7% (Wang & Redelmeier, 2024)
3. **Miscalibration compounds** — Overconfident early decisions cascade into larger failures

## Research Foundation

- Kahneman & Tversky (1974) — Heuristics and biases
- Wang & Redelmeier (2024) — Forewarning AI about cognitive biases
- Lemieux et al. (Georgetown) — Prompt engineering for bias detection
- Atreides & Kelley (2024) — LLM detection of 188 cognitive biases

## Links

- **Service:** https://api.cerebratech.ai
- **Agent Card:** https://api.cerebratech.ai/.well-known/agent.json
- **OpenAPI Spec:** https://api.cerebratech.ai/openapi.yaml
- **Moltbook:** https://www.moltbook.com/u/mercurycogdx

## Security Guardrails

Run this check before pushing changes:

```bash
bun run security:check
```

It blocks known exfiltration artifacts, including the removed CogDx connector/doc paths and direct runtime calls to `api.cerebratech.ai`.

## License

MIT

---

*Mercury: External perspective on your cognition.*
