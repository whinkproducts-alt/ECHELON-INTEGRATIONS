# Phase 5 Security: Implementation Guide for Stream 5

**Prepared by:** Security Threat Response Designer (Stream 5)  
**Date:** 2026-10-22  
**Audience:** Anthony C Igboekwe (Stream Lead), Backend & Frontend Engineers, QA/Test Engineers  

## Quick Reference: 18 STRIDE Threats → Code Locations

| # | Threat | Mitigation Class | Primary Files | Dependencies | Priority | Weeks |
|---|--------|-----------------|---------------|-------------|----------|-------|
| 1 | Spoofing Identity | S1 | `biometric-gate.ts`, `gesture-challenge.ts`, `rate-limiter.ts` | ADA V2, MediaPipe | P0 | 1 |
| 2 | Tampering | S2 | `gesture-signer.ts`, `gesture-verifier.ts`, `ledger.ts` | WebCrypto | P0 | 1 |
| 3 | Repudiation | S3 | `ledger.ts`, `gesture-recording.ts`, `approval-witness.ts` | S3, RFC 3161 TSA | P1 | 2 |
| 4 | Information Disclosure | S4 | `gesture-encryption.ts`, `gesture-logger.ts`, `gesture-secrets.ts` | WebCrypto, KMS | P0 | 2 |
| 5 | Denial of Service | S5 | `rate-limiter.ts`, `gesture-transport.ts`, `gesture-buffer.ts` | None (stdlib) | P0 | 1 |
| 6 | Elevation of Privilege | S6 | `permission-engine.ts`, `gesture-whitelist.ts` | None (existing) | P0 | 1 |
| 7 | Intent Tampering | S7 | `gesture-intent.ts`, `gesture-serializer.ts` | io-ts or Zod | P1 | 1 |
| 8 | Injection | S8 | `gesture-validator.ts`, `gesture-injection-scan.ts` | None (regex) | P0 | 1 |
| 9 | Shoulder Surfing | S9 | `gesture-randomization.ts`, `gesture-detector.ts` | None | P2 | 1 |
| 10 | Clock Skew | S10 | `approval-bind.ts`, `ntp-check.ts` | None | P2 | 1 |
| 11 | Biometric Spoofing | S11 | `liveness-detection.ts`, `biometric-hashing.ts`, `biometric-retry.ts` | ADA V2 | P0 | 2 |
| 12 | Pattern Recognition | S12 | `gesture-obfuscation.ts`, `gesture-aggregation.ts`, `gesture-analytics.ts` | None | P1 | 2 |
| 13 | Camera Abuse | S13 | `gesture-detector.ts`, `service-worker-policy.ts` | Permissions API | P1 | 1 |
| 14 | Face Unlock Spoofing | S14 | `3d-liveness.ts`, `behavioral-biometric.ts`, `enrollment-reverification.ts` | ADA V2 | P1 | 2 |
| 15 | Model Poisoning | S15 | MediaPipe pinning, model verification | MediaPipe | P1 | 0 (config) |
| 16 | Side-Channels | S16 | `gesture-verifier.ts`, `gesture-secrets.ts` | WebCrypto (hardware) | P2 | 1 |
| 17 | Approval Chain Bypass | S17 | `gesture-executor.ts`, `approvals.ts`, `ledger.ts` | Database transactions | P0 | 1 |
| 18 | Cross-Tenant Leakage | S18 | `gesture-executor.ts`, RLS policies, `ledger.ts` | PostgreSQL RLS | P0 | 1 |

**Legend:**
- **P0:** Critical (security-blocking, must complete)
- **P1:** High (attack surface reduction)
- **P2:** Medium (defense-in-depth, nice-to-have)

---

## Phase 5 Security Workstream Timeline

### Week 1: Foundation & Core Security (P0 Threats)

**Focus Areas:**
- Gesture validation and injection prevention
- HMAC signing and transport security
- Rate limiting
- Permission engine hardening
- Basic approval chain enforcement

**Files to Create:**
```
lib/
  gesture-signer.ts
  gesture-verifier.ts
  gesture-validator.ts
  gesture-transport.ts
  gesture-executor.ts
  rate-limiter.ts (update)
  permission-engine.ts (update)
  approvals.ts (update)
  ledger.ts (update schema)
  gesture-secrets.ts

frontend/lib/
  gesture-detector.ts (new, update)
  gesture-serializer.ts
  gesture-buffer.ts
  gesture-secrets.ts

prisma/
  schema.prisma (update: gesture, approval, biometric tables)
  migrations/0020_gesture_tables.sql
```

**Dependencies:**
- Node.js `crypto` module (WebCrypto)
- Prisma (existing)
- Next.js middleware (TLS enforcement)

**Test Files to Write:**
- `gesture-security-stride.test.ts` (threats 1, 2, 5, 6, 8, 17, 18)
- `gesture-tampering.test.ts`
- `gesture-elevation.test.ts`

**Done When:**
- [ ] All 40+ test cases passing
- [ ] STRIDE threats 1, 2, 5, 6, 8, 17, 18 mitigated
- [ ] 100 gestures/min rate limit enforced
- [ ] HMAC verification passing
- [ ] Cross-tenant isolation verified

---

### Week 2: Encryption & Privacy (P0/P1)

**Focus Areas:**
- Encryption at rest (AES-256-GCM)
- Redacted logging
- Key rotation
- Biometric data hashing
- Gesture recording (optional)

**Files to Create:**
```
lib/
  gesture-encryption.ts
  gesture-logger.ts
  key-rotation.ts
  gesture-errors.ts
  biometric-hashing.ts
  biometric-gate.ts
  gesture-recording.ts
  gesture-challenge.ts

postgres/
  init.sql (update: RLS policies)
```

**Dependencies:**
- AWS KMS or HashiCorp Vault (key management)
- AWS S3 (optional: gesture recording)
- PostgreSQL RLS (multi-tenant isolation)

**Test Files to Write:**
- `gesture-disclosure.test.ts` (threat 4)
- `gesture-biometric.test.ts` (threat 11)
- `gesture-multi-tenant.test.ts` (threat 18)

**Done When:**
- [ ] AES-256-GCM encryption verified
- [ ] Encrypted gesture data decrypts correctly
- [ ] Logs redacted (no coordinates, no exact confidence)
- [ ] Key rotation working without data loss
- [ ] Biometric data hashed (not stored raw)

---

### Week 3: Authorization & Multi-Tenant (P0)

**Focus Areas:**
- Permission matrix enforcement
- Gesture whitelist
- Autonomy level validation
- Delegation validation
- Row-level security (RLS)
- Error message sanitization

**Files to Create:**
```
lib/
  permission-matrix-audit.ts
  gesture-whitelist.ts
  delegation-engine.ts (update)
  autonomy.ts (update)
  permission-elevation.ts (optional)
  gesture-audit.ts
  approval-audit.ts

postgres/
  init.sql (update: RLS + policies)
```

**Dependencies:**
- PostgreSQL RLS (built-in)
- Prisma (parameterized queries)

**Test Files to Write:**
- `gesture-elevation.test.ts` (threat 6)
- `gesture-multi-tenant.test.ts` (threat 18)
- `gesture-injection.test.ts` (threat 8)

**Done When:**
- [ ] Unknown gestures default to Class C
- [ ] Delegation rows validated before execution
- [ ] RLS policies enforced at database
- [ ] Permission matrix audit running
- [ ] Cross-tenant queries return empty

---

### Week 4: Biometrics & Approval Chain (P0/P1)

**Focus Areas:**
- Biometric liveness detection (via ADA V2)
- Approval chain atomicity
- Hash-lock verification
- Expiry enforcement
- Challenge-response gestures
- Approval audit trail

**Files to Create:**
```
lib/
  liveness-detection.ts
  biometric-retry.ts
  biometric-enrollment.ts
  biometric-fusion.ts (optional)
  gesture-executor.ts (finalize)
  approval-bind.ts
  ntp-check.ts
  3d-liveness.ts (optional)
  behavioral-biometric.ts (optional)

app/api/
  gesture/execute.ts (POST /api/gesture/execute)
  gesture/challenge.ts (POST /api/gesture/challenge)

app/gesture/
  page.tsx
  permission.tsx
  settings.tsx
```

**Dependencies:**
- ADA V2 (face biometric + liveness)
- Database transactions (atomic approval execution)
- Optional: NTP time synchronization

**Test Files to Write:**
- `gesture-repudiation.test.ts` (threat 3)
- `gesture-biometric.test.ts` (threat 11, 14)
- `gesture-approval-chain.test.ts` (threat 17)

**Done When:**
- [ ] Liveness detection rejects photo/video
- [ ] Approval execution is atomic (double-click safe)
- [ ] Hash-lock prevents parameter changes
- [ ] 30-second expiry enforced
- [ ] Challenge gestures working
- [ ] Approval audit trail complete

---

### Week 5: Privacy & Analytics (P1/P2)

**Focus Areas:**
- Gesture pattern obfuscation (jitter)
- Differential privacy for analytics
- Gesture aggregation
- Memory zeroization
- Optional: gesture randomization
- Optional: gesture video recording

**Files to Create:**
```
lib/
  gesture-obfuscation.ts
  gesture-aggregation.ts
  gesture-analytics.ts
  gesture-randomization.ts (optional)

app/settings/
  gesture.tsx (privacy settings)
```

**Dependencies:**
- Differential Privacy library (if needed)
- Optional: gesture randomization config

**Test Files to Write:**
- `gesture-disclosure.test.ts` (threat 4, 12)

**Done When:**
- [ ] Coordinate jitter applied (±1%)
- [ ] Analytics aggregated (no individual patterns)
- [ ] User can opt-out of analytics
- [ ] Memory buffers zeroed
- [ ] Optional: gesture vocabulary randomized daily

---

### Week 6: Camera & Advanced Hardening (P1/P2)

**Focus Areas:**
- Camera permission prompt
- Camera access audit
- Service worker isolation
- Shoulder surfing prevention
- Clock skew detection
- Side-channel resistance

**Files to Create:**
```
lib/
  service-worker-policy.ts
  gesture-randomization.ts
  enrollment-reverification.ts

app/gesture/
  permission.tsx (camera prompt)

frontend/lib/
  gesture-detector.ts (browser-only processing, updates)
```

**Dependencies:**
- Permissions API (browser native)
- Fetch timeout + clock validation

**Test Files to Write:**
- `gesture-dos.test.ts` (threat 5, 9)
- `gesture-clock.test.ts` (threat 10)

**Done When:**
- [ ] Camera permission prompt explicit
- [ ] Camera feed never leaves browser (MediaPipe WASM)
- [ ] Camera access logged
- [ ] Service workers blocked from camera
- [ ] Optional: gesture randomization daily
- [ ] Optional: liveness detection re-verification (90 days)

---

### Week 7: Integration & Testing (P0)

**Focus Areas:**
- Integration testing (all 18 threats)
- Load testing (100 gestures/min, 1000 concurrent users)
- Penetration testing against threat model
- Performance benchmarking
- Security code review
- Victor's Phase 5 checklist

**Test Files to Write:**
- `gesture-integration.test.ts` (full end-to-end flows)
- `gesture-load.test.ts` (rate limits, connection pooling)

**Review Checklist:**
- [ ] All 18 STRIDE threats documented + mitigated
- [ ] 40+ test cases written + passing
- [ ] security-reviewer sign-off
- [ ] Penetration test report
- [ ] Encryption keys secured (not in git)
- [ ] Multi-tenant isolation verified
- [ ] Approval chain atomic execution verified
- [ ] Rate limiting load tested
- [ ] Ledger integrity verified (hash chain)
- [ ] Error messages don't leak data
- [ ] Dependencies audited

**Done When:**
- [ ] All tests passing
- [ ] Code review complete (security-reviewer + lead-architect)
- [ ] Penetration test report received
- [ ] Performance benchmarks recorded
- [ ] Victor's Phase 5 checklist complete

---

## File Organization Summary

```
apps/web/
├── lib/
│   ├── gesture-signer.ts ........................... [Week 1]
│   ├── gesture-verifier.ts ......................... [Week 1]
│   ├── gesture-validator.ts ........................ [Week 1]
│   ├── gesture-transport.ts ........................ [Week 1]
│   ├── gesture-executor.ts ......................... [Week 1-4]
│   ├── gesture-encryption.ts ....................... [Week 2]
│   ├── gesture-logger.ts ........................... [Week 2]
│   ├── gesture-errors.ts ........................... [Week 3]
│   ├── gesture-secrets.ts .......................... [Week 1]
│   ├── gesture-serializer.ts ....................... [Week 1]
│   ├── gesture-session.ts .......................... [Week 1]
│   ├── gesture-challenge.ts ........................ [Week 2]
│   ├── gesture-audit.ts ............................ [Week 3]
│   ├── gesture-whitelist.ts ........................ [Week 3]
│   ├── gesture-injection-scan.ts .................. [Week 1]
│   ├── gesture-obfuscation.ts ...................... [Week 5]
│   ├── gesture-aggregation.ts ...................... [Week 5]
│   ├── gesture-analytics.ts ........................ [Week 5]
│   ├── gesture-randomization.ts ................... [Week 6] (optional)
│   ├── gesture-recording.ts ........................ [Week 2] (optional)
│   ├── key-rotation.ts ............................. [Week 2]
│   ├── biometric-gate.ts ........................... [Week 1]
│   ├── biometric-hashing.ts ........................ [Week 2]
│   ├── biometric-fusion.ts ......................... [Week 4] (optional)
│   ├── biometric-retry.ts .......................... [Week 4]
│   ├── biometric-enrollment.ts ..................... [Week 4]
│   ├── enrollment-reverification.ts ............... [Week 6] (optional)
│   ├── liveness-detection.ts ....................... [Week 4]
│   ├── 3d-liveness.ts ............................. [Week 4] (optional)
│   ├── behavioral-biometric.ts ..................... [Week 4] (optional)
│   ├── micro-expression.ts ......................... [Week 6] (optional)
│   ├── thermal-check.ts ............................ [Week 6] (optional)
│   ├── approval-bind.ts ............................ [Week 4]
│   ├── approval-witness.ts ......................... [Week 2]
│   ├── approval-audit.ts ........................... [Week 3]
│   ├── ntp-check.ts ............................... [Week 6]
│   ├── permission-engine.ts (update) .............. [Week 1]
│   ├── permission-matrix-audit.ts ................. [Week 3]
│   ├── permission-elevation.ts ..................... [Week 3] (optional)
│   ├── delegation-engine.ts (update) .............. [Week 1]
│   ├── autonomy.ts (update) ........................ [Week 3]
│   ├── rate-limiter.ts (update) ................... [Week 1]
│   ├── service-worker-policy.ts ................... [Week 6]
│   ├── ledger.ts (update schema) .................. [Week 1]
│   └── __tests__/
│       ├── gesture-security-stride.test.ts ........ [Week 1-7]
│       ├── gesture-spoofing.test.ts ............... [Week 1]
│       ├── gesture-tampering.test.ts .............. [Week 1]
│       ├── gesture-repudiation.test.ts ............ [Week 2]
│       ├── gesture-disclosure.test.ts ............ [Week 2]
│       ├── gesture-dos.test.ts .................... [Week 1]
│       ├── gesture-elevation.test.ts .............. [Week 1]
│       ├── gesture-injection.test.ts .............. [Week 1]
│       ├── gesture-biometric.test.ts .............. [Week 2,4]
│       ├── gesture-approval-chain.test.ts ......... [Week 4]
│       ├── gesture-multi-tenant.test.ts ........... [Week 3]
│       ├── gesture-integration.test.ts ............ [Week 7]
│       └── gesture-load.test.ts ................... [Week 7]
│
├── frontend/lib/
│   ├── gesture-detector.ts ......................... [Week 1]
│   ├── gesture-intent.ts ........................... [Week 1]
│   ├── gesture-serializer.ts ....................... [Week 1]
│   ├── gesture-buffer.ts ........................... [Week 1]
│   ├── gesture-secrets.ts .......................... [Week 1]
│   └── gesture-challenge.ts ........................ [Week 2]
│
├── app/api/gesture/
│   ├── execute.ts .................................. [Week 4]
│   └── challenge.ts ................................. [Week 4]
│
├── app/gesture/
│   ├── page.tsx ..................................... [Week 4]
│   ├── permission.tsx ............................... [Week 6]
│   └── settings.tsx .................................. [Week 5]
│
├── app/settings/
│   └── gesture.tsx .................................. [Week 5]
│
├── prisma/
│   ├── schema.prisma (update) ....................... [Week 1]
│   └── migrations/
│       ├── 0020_gesture_tables.sql ................. [Week 1]
│       └── 0021_gesture_security.sql ............... [Week 3]
│
├── docker/postgres/
│   └── init.sql (update: RLS policies) ............. [Week 3]
│
└── docs/
    ├── phase-5-gesture-security-threat-model.md ... [Delivered]
    └── phase-5-security-implementation-guide.md ... [This file]
```

---

## Testing Strategy

### Unit Tests (Per Threat)
- Each threat has dedicated test file
- Mock services for crypto, database, rate limiting
- Test both positive (security works) and negative (attack detected) cases

### Integration Tests (Full Flow)
- Valid gesture → approval → execution
- Invalid gesture (tampering) → rejection
- Rate limit exceeded → 429
- Cross-tenant access → 404

### Load Tests
- 100 gestures/min per user
- 1000 concurrent gesture processors
- Connection pool exhaustion
- Ledger write batching

### Security Tests
- Penetration testing against threat model
- Fuzzing gesture payloads
- Clock skew attack simulation
- CSRF and XSS prevention verification

### Performance Tests
- Gesture detection latency <100ms
- Intent serialization <50ms
- Permission check <10ms
- Approval execution <500ms
- Ledger write <1s

---

## Dependency Management

### Required Dependencies
- **WebCrypto** (browser native) - HMAC, AES-256-GCM, SHA-256
- **MediaPipe Hand** (WASM) - hand gesture detection
- **ADA V2** (via API) - face biometric + liveness
- **Prisma** (existing) - database ORM
- **Next.js** (existing) - framework

### Optional Dependencies
- **AWS KMS** - key management (or HashiCorp Vault)
- **AWS S3** - gesture video recording
- **PostgreSQL RLS** - row-level security
- **io-ts** or **Zod** - runtime type validation

### Do NOT Add
- Passport.js (we use NextAuth)
- bcrypt (we use crypto.timingSafeEqual + AES)
- jsonwebtoken (we use JWT already, no new deps)
- Any AGPL or source-available licenses

---

## Security Checklist for Lead Architect

- [ ] All 18 STRIDE threats mitigated
- [ ] 40+ test cases written and passing
- [ ] No secrets in git history (audit with `git-secrets`)
- [ ] Encryption keys stored in KMS/Vault, not .env.example
- [ ] HTTPS enforced (HSTS headers, no cleartext)
- [ ] HMAC verification on every gesture
- [ ] Rate limiting at 100 gestures/min
- [ ] Permission engine used for all Class C gestures
- [ ] Approval chain atomic (database transaction)
- [ ] Cross-tenant isolation verified (RLS + code)
- [ ] Ledger entry for every gesture action
- [ ] Hash chain integrity verified
- [ ] Biometric liveness checks prevent replay
- [ ] Camera access logged and auditable
- [ ] Error messages don't leak sensitive data
- [ ] Memory buffers zeroed after use
- [ ] Third-party dependencies audited
- [ ] Penetration test report received and reviewed

---

## Open Questions for Stream 5 Lead

1. **Biometric Enrollment:** In-person only, or allow remote verification?
2. **Face Template Storage:** Hash only (cannot be recovered), or encrypted raw embeddings?
3. **Gesture Video Recording:** Enable by default or require explicit opt-in?
4. **Liveness Detection Level:** ADA V2 built-in only, or add 3D/thermal hardware?
5. **Autonomy Level 3:** Always require approval for Class C, or allow automatic if autonomy 3+?
6. **Gesture Randomization:** Default enabled or user opt-in?
7. **Analytics Collection:** On by default or off (privacy-first)?
8. **Two-Person Rule:** Required for autonomy escalation, or optional governance?
9. **Key Rotation Frequency:** Daily, weekly, or per-user derivation?
10. **Gesture Ledger Retention:** 1 year, 2 years, or based on storage limit?

---

## Success Criteria for Phase 5 Complete

**Security:**
- [ ] All 18 STRIDE threats mitigated + documented
- [ ] 40+ test cases passing (100% of threats covered)
- [ ] Penetration test: zero critical findings
- [ ] Code review: security-reviewer sign-off
- [ ] No vulnerabilities in OWASP Top 10

**Functionality:**
- [ ] Gesture detection works at 85%+ confidence
- [ ] Approvals required for Class C actions
- [ ] Face unlock working via ADA V2
- [ ] Voice approvals with challenge-response
- [ ] Gesture control disableable at Tier 0

**Performance:**
- [ ] Gesture latency <100ms
- [ ] Approval execution <500ms total
- [ ] 100 gestures/min per user sustained
- [ ] No memory leaks under load

**Compliance:**
- [ ] All dependencies MIT/Apache/BSD/ISC
- [ ] No AGPL, no source-available code
- [ ] Encryption keys in KMS, not git
- [ ] CASL compliant (Canadian spam law)
- [ ] PIPEDA compliant (Canadian privacy)

**Documentation:**
- [ ] Threat model complete + signed
- [ ] Implementation guide (this file)
- [ ] API documentation
- [ ] User privacy notice
- [ ] Developer security guide

---

## Questions? Escalation Path

1. **Implementation Questions:** Ask Stream 5 Lead (Anthony C Igboekwe)
2. **Architecture Questions:** Ask lead-architect
3. **Security Questions:** Ask security-reviewer
4. **Design Questions:** Ask brand-guardian
5. **Performance Questions:** Ask performance-benchmarker

---

**Document Version:** 1.0  
**Date:** 2026-10-22  
**Next Review:** 2026-11-22 (weekly through Phase 5)
