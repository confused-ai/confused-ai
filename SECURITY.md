# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.6.x   | ✅ Current |
| 0.5.x   | ⚠️ Critical fixes only |
| < 0.5   | ❌ No support |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email: **security@confused-ai.dev** (or substitute your actual security contact).

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Any proof-of-concept code (privately)

We target a **72-hour acknowledgement** and **14-day patch cycle** for critical issues.

## Security Considerations

### JWT / Authentication

- **HS256 secret strength**: Secrets must be at least 32 characters long. Shorter secrets are vulnerable to brute-force. Use `crypto.randomBytes(32).toString('hex')` to generate.
- **RS256 / ES256**: Use asymmetric keys for multi-service deployments. Pass a PEM-encoded public key to `jwtAuth({ publicKey })`. Never expose private keys in environment variables visible to the agent process.
- **Token expiry**: Always set `exp` in issued JWTs. The `verifyJwtHs256` and `verifyJwtAsymmetric` functions enforce expiry and will throw `expired` errors.
- **Timing-safe comparison**: HS256 signature verification uses `crypto.timingSafeEqual` to prevent timing attacks.
- **Public paths**: `/health` and `/v1/health` are public by default. Do not put sensitive data in health check responses.

### API Key Management

- Store LLM provider keys (OpenAI, Anthropic, etc.) in environment variables — never hardcode in source.
- Use `.env.example` (committed) and `.env` (gitignored) pattern.
- The `confused-ai doctor` command validates that required keys are present without logging their values.

### Rate Limiting

- Wire `rateLimit` into `createHttpService` to prevent abuse:
  ```ts
  createHttpService({
    rateLimit: new RateLimiter({ name: 'http', maxRequests: 100, intervalMs: 60_000 }),
  });
  ```
- Rate limiting is keyed on authenticated identity when available, falling back to `X-Forwarded-For` and remote address.

### Guardrails

- **PII detection**: Use `createPiiDetectionRule` to prevent sensitive data leakage in agent outputs.
- **Prompt injection**: Use `createPromptInjectionRule` to detect user attempts to override agent instructions.
- **Output validation**: Use `GuardrailValidator` with schema rules to constrain agent outputs.
- The LLM injection classifier (`createLlmInjectionClassifier`) provides highest accuracy but has cost/latency implications — use for sensitive operations.

### Dependency Security

- Run `npm audit` / `bun audit` regularly.
- The circuit breaker (`CircuitBreaker`) prevents runaway calls to degraded LLM providers, reducing blast radius from provider incidents.
- `BudgetEnforcer` enforces hard USD caps to prevent runaway costs from prompt injection or bugs.

### Input Validation

- All HTTP endpoints parse JSON with a try/catch — malformed JSON returns 400.
- Session IDs and agent names are validated before routing.
- Tool arguments are validated against Zod schemas before execution.

### Production Hardening Checklist

- [ ] Set `JWT_SECRET` or asymmetric key pair in environment
- [ ] Enable rate limiting on the HTTP service
- [ ] Add PII detection guardrail for any user-facing agents
- [ ] Set budget caps (`maxUsdPerRun`, `maxUsdPerUser`) to prevent runaway costs
- [ ] Use HTTPS termination at the load balancer / reverse proxy
- [ ] Rotate secrets on a regular schedule
- [ ] Monitor the `/v1/admin/health` endpoint for circuit breaker state
