# Phase 5 Security: Gesture Control and Hand-Tracking Threat Model

**Document Status:** Phase 5 Security Design  
**Owner:** Anthony C Igboekwe (Stream 5 Lead - Security + Testing)  
**Date:** 2026-10-22  
**Approval Level:** Requires lead-architect and security-reviewer sign-off  

## Overview

This document designs threat mitigations for all 18 STRIDE threats targeting WHINK's gesture-based control system. Phase 5 will introduce:
- Hand-tracking spatial UI (HOLO gestures)
- Face unlock via ADA V2
- Gesture-based approvals and commands

All mitigations follow WHINK's non-negotiables:
1. Secrets never in git
2. Tenant isolation on every query
3. White-label (no hardcoded names/colors)
4. Every action through the permission engine
5. Every action in the ledger
6. External content treated as untrusted
7. Approved licenses only
8. No vendor lock
9. Builders never grade their own work

## Architecture Overview

### Gesture Control Data Flow

```
┌─────────────────┐
│  Camera/Sensor  │
│  (Browser APIs) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  HOLO Gesture Detector              │  (frontend/lib/gesture-detector.ts)
│  - Extract hand landmarks           │
│  - Calculate confidence             │
│  - Normalize coordinates            │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Gesture Validator                  │  (frontend/lib/gesture-validator.ts)
│  - Confidence >85% gate             │
│  - HMAC signature verify            │
│  - Injection scan payload           │
└────────┬────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  Gesture to Intent Mapper               │  (frontend/lib/gesture-intent.ts)
│  - Confidence threshold check          │
│  - Rate limiting enforcement           │
│  - Intent serialization (canonical)    │
└────────┬─────────────────────────────────┘
         │
         ▼ (HTTPS/TLS 1.3)
┌──────────────────────────────────────────┐
│  POST /api/gesture/execute               │
│  - Anti-CSRF token validation           │
│  - User session validation              │
│  - Tenant isolation check               │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│  Permission Engine Check                    │  (lib/permission-engine.ts)
│  - Determine permission class              │
│  - Check delegation for Class B            │
│  - Queue Class C for approval              │
└────────┬─────────────────────────────────────┘
         │
         ├─► Class A: Execute
         ├─► Class B: Check delegation, execute or deny
         └─► Class C: Create approval request
         │
         ▼
┌──────────────────────────────────────────────┐
│  Approval System (if Class C)                │  (lib/approvals.ts)
│  - Generate unique id (crypto.randomUUID)   │
│  - Hash gesture intent with SHA-256         │
│  - 30-second expiry timer                   │
│  - Approval ledger entry                    │
└────────┬─────────────────────────────────────┘
         │
         ▼ (on approval)
┌──────────────────────────────────────────────┐
│  Hash Lock Verification                     │  (lib/gesture-executor.ts)
│  - Re-hash stored parameters               │
│  - Compare to approved hash                │
│  - Atomic state check                      │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  Execute Action                          │
│  - Via existing tool loop               │
│  - With ledger entry                    │
└────────────────────────────────────────┘
```

### Authorization Tiers

```
Tier 0: Observation Only
  └─ Gesture recognition disabled
  └─ No actions executed

Tier 1: Basic Actions (Class A)
  └─ Gesture confidence >90%
  └─ Predefined gestures only
  └─ Non-destructive actions only
  └─ Examples: pause/resume, navigate
  └─ Examples: mute/unmute, volume control

Tier 2: Standard Actions (Class A/B)
  └─ Gesture confidence >85%
  └─ Approved gesture vocabulary
  └─ Tool calling available if delegated (Class B)
  └─ Examples: send message, create note

Tier 3: Elevated Actions (Class B/C)
  └─ Gesture confidence >85%
  └─ All gestures available
  └─ Approval required for sensitive actions (Class C)
  └─ Examples: modify settings, execute trades, send social posts
  └─ Examples: delete content, revoke permissions

---

## 18 STRIDE Threats and Mitigations

### THREAT 1: Spoofing Identity (S1)

**Threat:** Attacker performs gestures to impersonate the legitimate user, triggering actions under their identity.

**Attack Vectors:**
- Record legitimate user's hand gestures from video/images
- Replay recorded gestures in front of the camera
- Deep fake hand movements
- Craft gesture sequences that match confidence thresholds

**Mitigations:**

1. **Multi-Modal Biometric Confirmation** (M1.1)
   - Location: `lib/biometric-gate.ts`
   - Require face biometric unlock before gesture tier 2+ activation
   - Face unlock uses ADA V2 built-in capability
   - Face match confidence >92% gate
   - Ledger every biometric check attempt

2. **Challenge-Response Gesture Verification** (M1.2)
   - Location: `lib/gesture-challenge.ts`
   - On Tier 2+ intent, issue random challenge gesture
   - User must correctly perform challenge within 5 seconds
   - Prevents pre-recorded replay attacks
   - Challenge difficulty increases with elevation

3. **Confidence Threshold Enforcement** (M1.3)
   - Location: `frontend/lib/gesture-detector.ts`
   - MediaPipe Hand pose confidence >85% for tier 2+
   - All 21 hand landmarks must be detected and stable
   - Reject isolated frames; require 3 consecutive stable frames
   - Spatial consistency check: gesture must complete within 5-second window

4. **Session Binding** (M1.4)
   - Location: `lib/gesture-session.ts`
   - Bind gesture approval to active browser session
   - Session token in HTTP-only secure cookie
   - Gesture intent hash includes sessionId
   - Invalid/expired session = deny

5. **Rate Limiting per User** (M1.5)
   - Location: `lib/rate-limiter.ts`
   - Max 100 gestures/minute per userId
   - Burst limit: 10 gestures/5 seconds
   - Soft limit: warn at 80/min, hard stop at 100/min
   - Ledger every rate limit violation

**Implementation Location:**
- `apps/web/lib/biometric-gate.ts` (new)
- `apps/web/lib/gesture-challenge.ts` (new)
- `apps/web/frontend/lib/gesture-detector.ts` (update)
- `apps/web/lib/gesture-session.ts` (new)
- `apps/web/lib/rate-limiter.ts` (update)

**Test Cases:**
- T1.1: Reject recorded gesture replay (video deep fake)
- T1.2: Challenge gesture response timeout = denial
- T1.3: Confidence 84% rejection
- T1.4: Session binding prevents cross-session gestures
- T1.5: Rate limit enforcement at thresholds

---

### THREAT 2: Tampering with Gesture Data (S2)

**Threat:** Attacker intercepts and modifies gesture coordinates, timestamps, or confidence scores before execution.

**Attack Vectors:**
- Man-in-the-middle on HTTP (unencrypted)
- Browser memory corruption
- Service worker injection
- DOM event hijacking

**Mitigations:**

1. **TLS 1.3+ Encryption for All Transport** (M2.1)
   - Location: `lib/gesture-transport.ts`
   - All gesture requests must use HTTPS (TLS 1.3 minimum)
   - Reject cleartext HTTP requests
   - HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - No mixed HTTP/HTTPS content

2. **HMAC Signature on Gesture Payload** (M2.2)
   - Location: `frontend/lib/gesture-signer.ts` + `lib/gesture-verifier.ts`
   - Calculate HMAC-SHA256(gesture_payload + timestamp + sessionId, secret_key)
   - Secret derived from user's encryption key (AES-256-GCM)
   - Client signs; server verifies immediately
   - Reject if signature mismatch (security event + ledger)

3. **Canonical Serialization** (M2.3)
   - Location: `frontend/lib/gesture-serializer.ts`
   - Canonicalize JSON: sorted keys, no whitespace
   - Include all hand landmarks (21 per hand)
   - Include confidence for each landmark
   - Include timestamp (server time window ±2 seconds)
   - Digest is created from canonical form only

4. **Immutable Hash Chain in Ledger** (M2.4)
   - Location: `lib/ledger.ts` (update gesture action schema)
   - Each gesture action entry includes:
     - `intentHash` (SHA-256 of canonical intent)
     - `previousLedgerHash` (from prior entry)
     - Content-addressed chain: `currentHash = SHA256(intentHash + previousHash + timestamp)`
   - Any tampering breaks the chain (detected on audit)
   - Daily ledger verification job runs integrity check

5. **Cryptographic Binding of Intent to Approval** (M2.5)
   - Location: `lib/approvals.ts` (update for gesture)
   - Store `approvalHash = SHA256(canonical_gesture + approvalId + userId)`
   - At execution, recalculate hash and compare
   - If gesture parameters changed post-approval, execution denied
   - Security event ledgered

**Implementation Location:**
- `apps/web/lib/gesture-transport.ts` (new)
- `apps/web/frontend/lib/gesture-signer.ts` (new)
- `apps/web/lib/gesture-verifier.ts` (new)
- `apps/web/frontend/lib/gesture-serializer.ts` (new)
- `apps/web/lib/ledger.ts` (schema update)
- `apps/web/lib/approvals.ts` (update)

**Test Cases:**
- T2.1: HTTPS required; HTTP requests rejected
- T2.2: Modified gesture payload fails HMAC check
- T2.3: Canonical serialization consistency
- T2.4: Hash chain integrity verification
- T2.5: Post-approval parameter change prevents execution

---

### THREAT 3: Repudiation of Gesture Action (S3)

**Threat:** User denies performing a gesture that executed an action (e.g., "I didn't send that message via gesture").

**Attack Vectors:**
- Claim gesture was accidental or performed by someone else
- Exploit lack of audit trail
- Claim system error

**Mitigations:**

1. **Complete Immutable Audit Trail** (M3.1)
   - Location: `lib/ledger.ts`
   - Every gesture action recorded with:
     - Exact timestamp (server-authoritative)
     - userId and sessionId
     - Gesture type and all coordinates (21 landmarks per hand)
     - Confidence scores
     - All hand landmark positions (JSON)
     - Resulting action taken
     - Approval id (if Class C)
     - Initiator (persona: WHINK/MAMBA)
   - Ledger writes are append-only (database constraint)
   - No ledger deletes; soft deletes only (archival)

2. **Immutable Gesture Recording** (M3.2)
   - Location: `lib/gesture-recording.ts` (new, optional)
   - Offer optional gesture video recording (with consent)
   - Store encrypted in S3 with lifecycle policy (30 days)
   - S3 server-side encryption with KMS
   - Accessible only to security team + owner for disputes
   - Requires additional approval to retrieve

3. **Cryptographic Proof of Execution** (M3.3)
   - Location: `lib/ledger.ts`
   - Sign each ledger entry with server's private key
   - Client can verify: `signature_valid = verify(ledgerEntry, publicKey)`
   - Client displays verification badge: "Verified" if signature valid
   - Repudiation claim can be checked against signed record

4. **Witness Mechanism** (M3.4)
   - Location: `lib/approval-witness.ts`
   - Class C gesture actions notarized to external timestamp service
   - RFC 3161 compliant timestamp token from Digicert or similar
   - Timestamp token includes: action hash, server signature, TSA signature
   - Triple-signed proof: user approval + server + external TSA
   - Storage: S3 with versioning enabled

5. **Delegation and Team Witnesses** (M3.5)
   - Location: `lib/gesture-audit.ts`
   - If gesture affects shared/org resource, second witness required
   - For Tier 3 gestures on shared items, log additional approver
   - Multi-signature scheme: gesture + approval + 2FA confirmation

**Implementation Location:**
- `apps/web/lib/ledger.ts` (schema expansion)
- `apps/web/lib/gesture-recording.ts` (new, optional)
- `apps/web/lib/gesture-audit.ts` (new)
- `apps/web/lib/approval-witness.ts` (new)

**Test Cases:**
- T3.1: Complete ledger entry for every gesture
- T3.2: Optional gesture video recording with lifecycle
- T3.3: Ledger signature verification by client
- T3.4: RFC 3161 timestamp token generation and verification
- T3.5: Multi-signature requirement for shared resource actions

---

### THREAT 4: Information Disclosure from Gesture Data (S4)

**Threat:** Sensitive gesture data (hand coordinates, patterns, personal biometrics) leaked to unauthorized parties or exposed in logs.

**Attack Vectors:**
- Logs contain unredacted gesture coordinates
- Gesture patterns reveal user habits (e.g., tremor = health condition)
- Memory dumps expose gesture data
- Error messages contain full gesture payloads
- Cloud storage backups unencrypted

**Mitigations:**

1. **Encrypted Gesture Storage** (M4.1)
   - Location: `lib/gesture-encryption.ts` (new)
   - Use AES-256-GCM for all stored gesture data at rest
   - Key derivation: PBKDF2(userPassword, salt=userId, iterations=100k)
   - Gesture table has encrypted_coordinates BYTEA column
   - Decryption only in memory, never logged

2. **Redacted Logging Strategy** (M4.2)
   - Location: `lib/gesture-logger.ts` (new)
   - Log gesture type + timestamp only (no coordinates)
   - Log confidence score range (e.g., "high" not exact number)
   - Never log hand landmark positions
   - Never log face coordinates for face unlock
   - PII redaction: remove userId from detailed logs, store separately

3. **Memory-Only Processing** (M4.3)
   - Location: `frontend/lib/gesture-detector.ts`
   - Keep raw MediaPipe output in memory only
   - Process and validate in-memory
   - Serialize to wire format (canonical JSON)
   - Delete from memory after serialization
   - Never write raw coordinates to localStorage/sessionStorage

4. **Secure Memory Handling** (M4.4)
   - Location: `frontend/lib/gesture-secrets.ts` (new)
   - Use typed arrays (Uint8Array) for sensitive data
   - Overwrite with zeros after use: `array.fill(0)`
   - Never stringify sensitive data for logging
   - Use Object.freeze() on sensitive objects (prevent modifications)

5. **Database Encryption Key Rotation** (M4.5)
   - Location: `lib/key-rotation.ts`
   - Daily key derivation from master secret + date
   - Old gesture data remains readable with old key
   - Re-encrypt on first read with new key
   - Audit: log every key rotation event
   - Master secret stored in AWS Secrets Manager (or KMS for self-hosted)

6. **Error Message Sanitization** (M4.6)
   - Location: `lib/gesture-errors.ts` (new)
   - Never expose gesture coordinates in error messages
   - Generic errors: "Gesture validation failed" (not "hand landmark 8 below threshold")
   - Detailed errors only in server logs (redacted)
   - Client receives only: `{ error: "validation_failed", errorId: "uuid" }`
   - User can request detailed error via errorId (requires approval for Tier 3)

7. **Biometric Data Minimization** (M4.7)
   - Location: `lib/biometric-minimization.ts` (new)
   - Store only hash of face biometric (not full face data)
   - Face hash = SHA-256(face_embedding + userId) from ADA V2
   - Keep only last 3 biometric samples in database
   - Archive older samples encrypted in cold storage (S3 Glacier)
   - Daily purge of session-level face data

**Implementation Location:**
- `apps/web/lib/gesture-encryption.ts` (new)
- `apps/web/lib/gesture-logger.ts` (new)
- `apps/web/frontend/lib/gesture-detector.ts` (update)
- `apps/web/frontend/lib/gesture-secrets.ts` (new)
- `apps/web/lib/key-rotation.ts` (new)
- `apps/web/lib/gesture-errors.ts` (new)
- `apps/web/lib/biometric-minimization.ts` (new)

**Test Cases:**
- T4.1: AES-256-GCM encryption of stored gesture data
- T4.2: Redacted logging (no coordinates, no exact confidence)
- T4.3: Memory cleared after serialization
- T4.4: Sensitive data arrays zeroed after use
- T4.5: Daily key rotation without data loss
- T4.6: Error messages don't leak coordinates
- T4.7: Biometric data hashed, old samples archived

---

### THREAT 5: Denial of Service via Gesture Spam (S5)

**Threat:** Attacker floods the system with rapid gestures, causing resource exhaustion, timeouts, or service degradation.

**Attack Vectors:**
- Rapid gesture execution (>100/min)
- Malformed gesture payloads causing parser errors
- Request amplification (one gesture → multiple ledger writes)
- Memory exhaustion from gesture buffer
- CPU exhaustion from excessive confidence calculations

**Mitigations:**

1. **Rate Limiting (100 gestures/minute per user)** (M5.1)
   - Location: `lib/rate-limiter.ts`
   - Token bucket: 100 tokens/minute per userId
   - Burst allowance: 10 tokens/5 seconds
   - Violation: return 429 Too Many Requests
   - Ledger: every rate limit hit (once per 100)
   - Tier-based limits:
     - Tier 0: 0 gestures/min (observation only)
     - Tier 1: 20 gestures/min
     - Tier 2: 50 gestures/min
     - Tier 3: 100 gestures/min

2. **Request Size Limits** (M5.2)
   - Location: `lib/gesture-transport.ts`
   - Max payload: 5 KB (canonical JSON)
   - Reject oversized payloads with 413 Payload Too Large
   - Validate: all 21 hand landmarks × 2 hands = max 42 landmarks
   - Each landmark: x, y, z, confidence = 4 floats = 16 bytes
   - Total per hand: ~672 bytes + metadata

3. **Computation Throttling** (M5.3)
   - Location: `frontend/lib/gesture-detector.ts`
   - Gesture processing limited to 30 FPS max (33ms intervals)
   - Skip frames if GPU busy (check WebGL context)
   - If CPU usage >80%, queue gestures (max queue depth: 10)
   - Discard oldest queued gesture if queue > 10

4. **Database Connection Pooling** (M5.4)
   - Location: `lib/db.ts` (existing, verify for gesture loads)
   - Prisma connection pool: min 5, max 20 connections
   - Gesture ledger writes queue behind connection pool
   - If all connections busy, queue write (max queue: 1000)
   - Monitor: alert if queue > 500 (possible attack)

5. **Ledger Write Batching** (M5.5)
   - Location: `lib/ledger.ts` (update for gesture)
   - Batch gesture ledger writes: max 50 writes/second per user
   - Use database batch insert for efficiency
   - If write rate > 50/sec: fail gracefully, ledger dropped (flagged for replay)
   - Admin audit: check ledger gaps weekly

6. **Memory Limits for Gesture Buffers** (M5.6)
   - Location: `frontend/lib/gesture-buffer.ts` (new)
   - Gesture intent queue max size: 100 entries
   - Each entry max 5KB
   - Total max: 500 KB resident
   - Evict oldest if buffer > 100 entries
   - Monitor with performance.memory API

7. **Timeout Protection** (M5.7)
   - Location: `frontend/lib/gesture-executor.ts` (new)
   - Gesture intent processing timeout: 5 seconds
   - If intent processing > 5s: abandon and return timeout error
   - Approval request response timeout: 30 seconds (existing, maintain)
   - Overall gesture-to-action max: 35 seconds

**Implementation Location:**
- `apps/web/lib/rate-limiter.ts` (update)
- `apps/web/lib/gesture-transport.ts` (new)
- `apps/web/frontend/lib/gesture-detector.ts` (update)
- `apps/web/frontend/lib/gesture-buffer.ts` (new)
- `apps/web/frontend/lib/gesture-executor.ts` (new)
- `apps/web/lib/db.ts` (verify)

**Test Cases:**
- T5.1: Rate limit enforcement at 100 gestures/min threshold
- T5.2: Oversized payloads rejected (>5KB)
- T5.3: Frame throttling at 30 FPS
- T5.4: Connection pool prevents exhaustion
- T5.5: Ledger write batching at 50/sec
- T5.6: Gesture buffer memory cap at 500 KB
- T5.7: Timeouts enforced (5s intent, 35s total)

---

### THREAT 6: Elevation of Privilege via Gesture Misconfiguration (S6)

**Threat:** Attacker exploits misconfigured gesture permission classes to execute privileged actions without proper authorization.

**Attack Vectors:**
- Gesture defined as Class A when should be Class C
- Delegation rows incorrectly set to allow elevated gestures
- Autonomy level incorrectly allows Class B without delegation
- Missing permission check in gesture executor

**Mitigations:**

1. **Permission Class Enforcement in Code** (M6.1)
   - Location: `lib/permission-engine.ts` (update for gestures)
   - Every gesture intent hardcoded with permission class
   - Classes defined in immutable enum:
     ```typescript
     enum GesturePermissionClass {
       A = "A",     // Observer mode (navigation, pause/play)
       B = "B",     // Delegatable (send messages, create notes)
       C = "C",     // Requires approval (social post, delete, elevate)
     }
     ```
   - No runtime configuration of classes (data-driven class list in database)
   - Changes to gesture classes require code review + merge to main

2. **Default Deny Policy** (M6.2)
   - Location: `lib/permission-engine.ts`
   - Unknown gesture → Class C (requires approval)
   - Unknown autonomy level → deny
   - No implicit permissions
   - Test: unknown gesture rejected with security event logged

3. **Delegation Validation** (M6.3)
   - Location: `lib/delegation-engine.ts` (update)
   - Class B gesture execution requires valid delegation row
   - Delegation row validation:
     - userId matches
     - gestureId matches
     - delegatedBy userId exists and valid
     - expiresAt > now
     - capability matches gesture type
   - Reject if any validation fails
   - Ledger: gesture execution + delegation row id

4. **Autonomy Level Boundaries** (M6.4)
   - Location: `lib/autonomy.ts` (update)
   - Tier mapping:
     - Autonomy 0: Class A only (observation)
     - Autonomy 1: Class A only
     - Autonomy 2: Class A + Class B (with delegation)
     - Autonomy 3: Class A + Class B (with delegation) + Class C (requires approval)
   - Test: Autonomy 2 + Class C gesture = denied
   - Raising autonomy is itself Class C action

5. **Permission Matrix Audit** (M6.5)
   - Location: `lib/permission-matrix-audit.ts` (new)
   - Build time: generate gesture permission matrix (CSV)
   - Matrix: gesture × permission class × autonomy level
   - Scan for anomalies: any gesture allowed at autonomy < required level
   - Daily audit: check for permission escalation patterns in ledger
   - Alert: if gesture executed above autonomy level

6. **Gesture Whitelist Enforcement** (M6.6)
   - Location: `lib/gesture-whitelist.ts` (new)
   - Explicit whitelist of allowed gestures per user/tenant
   - Gesture not in whitelist → denied (Class C)
   - Whitelist stored encrypted in database
   - Adding gesture to whitelist is Class C action
   - Default whitelist: empty (gesture feature is opt-in per Tier)

7. **Two-Person Rule for Elevation** (M6.7)
   - Location: `lib/permission-elevation.ts` (new, optional)
   - Raising autonomy level requires approval from another admin
   - Not just owner approval, but different person
   - Ledger: both approvers recorded
   - Minimum 24-hour wait between autonomy raises

**Implementation Location:**
- `apps/web/lib/permission-engine.ts` (update)
- `apps/web/lib/delegation-engine.ts` (update)
- `apps/web/lib/autonomy.ts` (update)
- `apps/web/lib/permission-matrix-audit.ts` (new)
- `apps/web/lib/gesture-whitelist.ts` (new)
- `apps/web/lib/permission-elevation.ts` (new, optional)

**Test Cases:**
- T6.1: Unknown gesture defaults to Class C
- T6.2: Default deny on misconfiguration
- T6.3: Invalid delegation row prevents execution
- T6.4: Autonomy level boundaries enforced
- T6.5: Permission matrix audit detects anomalies
- T6.6: Gesture whitelist prevents unlisted gestures
- T6.7: Two-person rule for autonomy elevation (optional)

---

## Additional Threats (7-18)

### THREAT 7: Tampering with Gesture Intent (Continued from T2)

**Specific Focus:** Intent interpretation and serialization attacks

**Mitigations:**

1. **Gesture Intent Type Safety** (M7.1)
   - Location: `frontend/lib/gesture-intent.ts` (new)
   - TypeScript strict mode for all gesture intent types
   - Exhaustive pattern matching on intent types
   - Runtime validation: `t.decode()` with io-ts or Zod
   - Reject unknown intent types with security event

2. **Canonical Intent Serialization** (M7.2)
   - Location: `frontend/lib/gesture-serializer.ts`
   - Sorted JSON keys
   - Fixed decimal precision (6 decimals for coordinates)
   - Consistent timestamp format (ISO 8601 UTC)
   - Include gesture id + intent type as part of serialization

**Test Cases:**
- T7.1: Type safety enforced; invalid intent rejected
- T7.2: Canonical serialization consistency across executions

---

### THREAT 8: Injection Attack via Gesture Payload (S4 variant)

**Threat:** Attacker crafts malicious gesture coordinates or metadata to inject commands (SQL injection via gesture description, command injection via intent parameters).

**Attack Vectors:**
- SQL injection in gesture notes/description field
- Command injection in gesture callback URL
- Code injection via gesture metadata
- XSS via gesture description in UI

**Mitigations:**

1. **Input Sanitization and Validation** (M8.1)
   - Location: `lib/gesture-validator.ts` (new)
   - Validate all gesture fields:
     - x, y, z coordinates: must be floats within [0, 1]
     - Confidence: must be float within [0, 1]
     - Hand id: must be "left" or "right" enum
     - Gesture type: must be in predefined enum
     - Timestamp: must be RFC 3339, within ±2 seconds of server time
   - Reject any field outside expected range/type
   - Ledger: validation failure + payload digest (not full payload)

2. **Parameterized Queries for Ledger Writes** (M8.2)
   - Location: `lib/ledger.ts`
   - Use Prisma (parameterized) exclusively
   - No string interpolation in SQL
   - Gesture data stored as JSON, not as free text
   - Verify: `grep -r "query(" apps/web/lib/gesture-*.ts` returns nothing

3. **Content Security Policy (CSP) for Gesture UI** (M8.3)
   - Location: `apps/web/app/layout.tsx`
   - CSP header: `script-src 'self'; object-src 'none'`
   - No unsafe-eval, no unsafe-inline
   - Gesture description never used in innerHTML
   - Use textContent for display (auto-escapes HTML)

4. **Regex Rejection of Suspicious Patterns** (M8.4)
   - Location: `lib/gesture-injection-scan.ts` (new)
   - Scan gesture notes/metadata for:
     - SQL patterns: UNION, SELECT, DROP, etc.
     - Command patterns: <, >, |, ;, &&, ||
     - Code patterns: eval(, script>, etc.
     - If found: block gesture (Class C), ledger with pattern detected
   - Whitelist approach: allow only alphanumeric + spaces + basic punctuation

5. **No Gesture Description or Metadata** (M8.5)
   - Location: `frontend/lib/gesture-intent.ts`
   - Gesture payload contains only:
     - Gesture type (enum)
     - Hand landmarks (array of floats)
     - Confidence (float)
     - Timestamp (RFC 3339)
   - No free-text description, notes, or user-supplied metadata
   - Description/notes stored separately in a different table
   - Metadata never used in gesture execution path

**Implementation Location:**
- `apps/web/lib/gesture-validator.ts` (new)
- `apps/web/lib/gesture-injection-scan.ts` (new)
- `apps/web/frontend/lib/gesture-intent.ts` (new)
- `apps/web/lib/ledger.ts` (verify parameterized)

**Test Cases:**
- T8.1: Invalid coordinate range rejected
- T8.2: SQL injection in gesture notes fails validation
- T8.3: Command injection patterns detected and blocked
- T8.4: Parameterized queries prevent injection
- T8.5: CSP prevents inline script execution

---

### THREAT 9: Shoulder Surfing and Physical Access Attacks (S4 variant)

**Threat:** Attacker watches user perform gestures (over shoulder, via camera) and replicates them.

**Mitigations:**

1. **Gesture Randomization (Optional)** (M9.1)
   - Location: `lib/gesture-randomization.ts` (new, optional)
   - User can enable: randomize gesture requirement daily
   - Gesture vocabulary shuffled (e.g., "pinch" → "thumbs up" for day)
   - Randomization seed stored encrypted
   - Daily reset at midnight UTC

2. **Spatial Privacy Zones** (M9.2)
   - Location: `frontend/lib/gesture-detector.ts`
   - Request camera permissions with clear privacy notice
   - Camera feed never stored, never transmitted
   - All processing in-browser (MediaPipe WebAssembly)
   - Option to disable camera when not using gesture control

3. **Anti-Spoofing Liveness Detection** (M9.3)
   - Location: `lib/liveness-check.ts` (new)
   - Optional: require random head movements (nod, tilt)
   - Server challenges: "Move head left, then right"
   - Liveness check before Tier 2+ gesture execution
   - Prevents deep fake video replay

4. **Privacy Screen Reminder** (M9.4)
   - Location: `apps/web/app/gesture/page.tsx` (new)
   - UI warning: "Ensure privacy screen enabled"
   - Reminder every 10 minutes during active gesture use
   - Can be dismissed by user
   - User can enable "privacy mode" (disables camera, requires Tier 0)

**Implementation Location:**
- `apps/web/lib/gesture-randomization.ts` (new, optional)
- `apps/web/frontend/lib/gesture-detector.ts` (update)
- `apps/web/lib/liveness-check.ts` (new)
- `apps/web/app/gesture/page.tsx` (new)

**Test Cases:**
- T9.1: Daily gesture vocabulary randomization
- T9.2: Camera feed never leaves browser
- T9.3: Liveness check requires head movement
- T9.4: Privacy reminders display

---

### THREAT 10: Clock Skew and Timestamp Attacks (S2/S4 variant)

**Threat:** Attacker uses device clock skew to bypass expiry checks or replay old gestures.

**Attack Vectors:**
- Device clock set to past, replay expired gesture approval
- Device clock set to future, approve gesture in advance
- Synchronization attack: sync clock to server's predicted future

**Mitigations:**

1. **Server-Authoritative Timestamps** (M10.1)
   - Location: `lib/gesture-executor.ts`
   - All timing decisions made on server
   - Client sends gesture; server records timestamp
   - Client timestamp used only for reference, not for logic
   - Reject gestures with timestamp > 2 seconds from server time

2. **NTP Synchronization Check** (M10.2)
   - Location: `lib/ntp-check.ts` (new, optional)
   - Server checks own clock against NTP pool
   - If clock skew > 5 seconds: alert ops, slow responses
   - Client can check device clock against server response time
   - Warning if client clock suspect

3. **Monotonic Clock for Expiry** (M10.3)
   - Location: `lib/approvals.ts`
   - Use monotonic clock for expiry: `performance.now()` (client), `Date.now()` (server)
   - Expiry stored as absolute timestamp, not duration
   - Check: `now > expiry` (not `elapsed < 30s`)
   - If system clock adjusts backward, maintain pending expiry

4. **Approval Binding to Server Time** (M10.4)
   - Location: `lib/approval-bind.ts` (new)
   - Approval created at server-time T
   - Approval hash includes T
   - Execution checked at server-time T', T' - T <= 30 seconds
   - If T' < T (clock went backward), deny and alert

**Implementation Location:**
- `apps/web/lib/gesture-executor.ts` (update)
- `apps/web/lib/ntp-check.ts` (new, optional)
- `apps/web/lib/approvals.ts` (update)
- `apps/web/lib/approval-bind.ts` (new)

**Test Cases:**
- T10.1: Client clock skew >2s rejects gesture
- T10.2: NTP sync check alerts on skew
- T10.3: Monotonic clock prevents backward time attacks
- T10.4: Approval binding to server time prevents skew exploit

---

### THREAT 11: Biometric Template Injection and Spoofing (S1 variant)

**Threat:** Attacker presents fake biometric (printed face, video replay) to bypass face unlock gate.

**Attack Vectors:**
- Printed photo of user's face
- Video recording played on screen
- 3D-printed face mask
- Deep fake video
- Stolen biometric template used directly

**Mitigations:**

1. **Passive Liveness Detection** (M11.1)
   - Location: `lib/liveness-detection.ts` (new)
   - Use ADA V2 built-in liveness detection
   - Detects static images, video playback, masks
   - Require eye movement or head tilt
   - Confidence threshold >95% for liveness

2. **Biometric Template Hashing** (M11.2)
   - Location: `lib/biometric-hashing.ts` (new)
   - Never store raw face embedding
   - Hash template: SHA256(embedding + userId + salt)
   - Comparison: re-extract → hash → compare
   - Stolen template hash useless without embedding

3. **Multi-Modal Biometric Fusion** (M11.3)
   - Location: `lib/biometric-fusion.ts` (new)
   - Require both face + voice (speaker verification)
   - Or face + fingerprint (if device supports)
   - Fusion score = (face_score × 0.7) + (voice_score × 0.3)
   - Both must be >85% for Tier 2+
   - Requires additional hardware capability

4. **Retry Limits on Biometric Failure** (M11.4)
   - Location: `lib/biometric-retry.ts` (new)
   - Max 3 failed biometric attempts
   - After 3 fails: lock for 5 minutes
   - After 10 fails in 1 hour: require manual password + 2FA
   - Ledger: every biometric attempt (success/failure)

5. **Enrollment Verification** (M11.5)
   - Location: `lib/biometric-enrollment.ts` (new)
   - Biometric enrollment requires in-person verification
   - Or remote verification with admin approval
   - Record enrollment date, location, verification method
   - Prompt re-enrollment annually

**Implementation Location:**
- `apps/web/lib/liveness-detection.ts` (new)
- `apps/web/lib/biometric-hashing.ts` (new)
- `apps/web/lib/biometric-fusion.ts` (new)
- `apps/web/lib/biometric-retry.ts` (new)
- `apps/web/lib/biometric-enrollment.ts` (new)

**Test Cases:**
- T11.1: Liveness detection rejects photo/video
- T11.2: Biometric template hash prevents template injection
- T11.3: Multi-modal fusion requires both modalities
- T11.4: Retry limits enforce after 3 failures
- T11.5: Enrollment requires verification

---

### THREAT 12: Gesture Pattern Recognition and User Profiling (S4 variant)

**Threat:** Gestures create unique patterns; attacker analyzes patterns to identify/profile user (Parkinson's tremor, dominant hand, speed) or predict future actions.

**Attack Vectors:**
- Analyze gesture timing patterns (user always gestures at 8am)
- Analyze gesture velocity (reveals health conditions, aging)
- Analyze gesture frequency (reveals work patterns)
- Correlate with public activity to deanonymize user

**Mitigations:**

1. **Gesture Pattern Obfuscation** (M12.1)
   - Location: `lib/gesture-obfuscation.ts` (new)
   - Add random jitter to coordinates (±1% of gesture bounds)
   - Randomize processing delay (±100ms)
   - Add dummy gestures to obscure frequency (optional)
   - Obfuscation applied before ledger storage

2. **Gesture Aggregation and Generalization** (M12.2)
   - Location: `lib/gesture-aggregation.ts` (new)
   - Never store individual gesture velocities
   - Store only: gesture type + success/failure + timestamp
   - Never store: exact coordinates, exact timing, tremor, acceleration
   - Detailed data kept in memory only

3. **Differential Privacy for Gesture Analytics** (M12.3)
   - Location: `lib/gesture-analytics.ts` (new, optional)
   - If analytics required, add DP noise to reports
   - Epsilon parameter: 0.1 (strict privacy)
   - Gesture counts ±5 (random noise)
   - Reports only for aggregate stats, never individual patterns

4. **Data Minimization on Analytics** (M12.4)
   - Location: `lib/gesture-analytics.ts`
   - Collect only: gesture count/day, success rate, types used
   - Never collect: timing patterns, coordinates, biometric data
   - Purge individual gesture records after 30 days
   - Keep only anonymized daily summaries

5. **Opt-Out of Analytics** (M12.5)
   - Location: `apps/web/app/settings/gesture.tsx` (new)
   - User can disable gesture analytics
   - Default: off (privacy-first)
   - If enabled, user can request deletion of analytics data
   - Deletion is irreversible and immediate

**Implementation Location:**
- `apps/web/lib/gesture-obfuscation.ts` (new)
- `apps/web/lib/gesture-aggregation.ts` (new)
- `apps/web/lib/gesture-analytics.ts` (new)
- `apps/web/app/settings/gesture.tsx` (new)

**Test Cases:**
- T12.1: Coordinate jitter applied consistently
- T12.2: Detailed gesture data not stored long-term
- T12.3: Differential privacy adds appropriate noise
- T12.4: Analytics only on aggregate metrics
- T12.5: User can opt-out and delete analytics

---

### THREAT 13: Camera Permission Abuse (S4 variant)

**Threat:** Camera permission obtained for gesture control used to spy on user (record video, steal face biometric).

**Attack Vectors:**
- Permission obtained through social engineering
- App requests camera, uses it for surveillance
- Malicious service worker hijacks camera
- Third-party script in app steals camera access

**Mitigations:**

1. **Explicit Camera Permission Prompt** (M13.1)
   - Location: `apps/web/app/gesture/permission.tsx` (new)
   - Clear consent: "W.H.I.N.K. needs camera for hand gesture recognition"
   - Explain: "Camera feed is processed in your browser only. Not recorded, not transmitted."
   - User must explicitly approve before camera accessed
   - User can revoke at any time from settings

2. **Browser-Only Processing** (M13.2)
   - Location: `frontend/lib/gesture-detector.ts`
   - Use MediaPipe Tasks JavaScript (WASM)
   - Hand detection runs on local device, no cloud
   - Camera frames never leave the browser
   - No transmission to server; only coordinates sent

3. **No Camera Recording or Storage** (M13.3)
   - Location: `frontend/lib/gesture-detector.ts`
   - Never call `canvas.toBlob()` on camera feed
   - Never store camera stream to localStorage/IndexedDB
   - Never transmit camera feed or screenshots
   - Test: `grep -r "toBlob\|createObjectURL\|canvas.toDataURL" apps/web/frontend --include="*.ts"` returns nothing in gesture code

4. **Camera Access Audit** (M13.4)
   - Location: `lib/gesture-audit.ts`
   - Log every time camera permission requested
   - Log every camera access (started/stopped)
   - User can view camera access history in settings
   - Alert if camera accessed when gesture control disabled

5. **Service Worker Isolation** (M13.5)
   - Location: `apps/web/lib/service-worker-policy.ts` (new)
   - Service workers have no camera access
   - Gesture code runs in main thread only
   - CSP: `camera-src 'self'` (future standard)
   - Monitor: if service worker tries to access camera, deny + alert

6. **Disable Gesture During Private/Incognito Browsing** (M13.6)
   - Location: `frontend/lib/gesture-detector.ts`
   - Detect private/incognito mode
   - Gesture control disabled in private mode
   - User warned: gesture control requires persistent storage
   - Non-gesture actions still work (voice, keyboard)

**Implementation Location:**
- `apps/web/app/gesture/permission.tsx` (new)
- `apps/web/frontend/lib/gesture-detector.ts` (update)
- `apps/web/lib/gesture-audit.ts` (update)
- `apps/web/lib/service-worker-policy.ts` (new)

**Test Cases:**
- T13.1: Permission prompt displayed; user must approve
- T13.2: Camera frames don't leave browser
- T13.3: No canvas data URLs created
- T13.4: Camera access logged and visible to user
- T13.5: Service workers blocked from camera
- T13.6: Gesture disabled in private browsing mode

---

### THREAT 14: Face Unlock Spoofing and Liveness Bypass (S1 variant)

**Threat:** Attacker bypasses face unlock using photos, videos, masks, or deep fakes to gain access.

**Mitigations:** (See THREAT 11, plus additional)

1. **3D Liveness Detection** (M14.1)
   - Location: `lib/3d-liveness.ts` (new, optional)
   - Require passive 3D detection (if ADA V2 supports)
   - Depth-from-stereo or IR depth detection
   - Masks and printed photos fail 3D checks
   - Confidence threshold >95%

2. **Behavioral Biometric Fusion** (M14.2)
   - Location: `lib/behavioral-biometric.ts` (new)
   - Combine face biometric with gesture biometric
   - Face unlock + gesture within 2 seconds = approved access
   - Gesture must match historical user pattern (learned)
   - Attacker must fake both biometrics

3. **Micro-Expression Detection** (M14.3)
   - Location: `lib/micro-expression.ts` (new, optional)
   - Analyze micro-expressions during face unlock
   - Real face shows natural micro-expressions
   - Fake video or mask fails micro-expression check
   - Requires high-FPS camera

4. **Thermal Imaging Check** (M14.4)
   - Location: `lib/thermal-check.ts` (new, optional)
   - If device supports thermal camera
   - Face must show thermal pattern (warm blood flow)
   - Masks and photos don't produce thermal signature
   - Requires special hardware

5. **Enrollment Re-verification** (M14.5)
   - Location: `lib/enrollment-reverification.ts` (new)
   - Every 90 days: user must re-verify biometric
   - Re-verification requires manual password + 2FA
   - Option to update biometric if changed significantly
   - Prevents stale biometric data

**Implementation Location:**
- `apps/web/lib/3d-liveness.ts` (new, optional)
- `apps/web/lib/behavioral-biometric.ts` (new)
- `apps/web/lib/micro-expression.ts` (new, optional)
- `apps/web/lib/thermal-check.ts` (new, optional)
- `apps/web/lib/enrollment-reverification.ts` (new)

**Test Cases:**
- T14.1: 3D liveness rejects masks and printed photos
- T14.2: Gesture biometric fusion prevents face-only spoofing
- T14.3: Micro-expression detection rejects video replay
- T14.4: Thermal imaging check requires heat signature
- T14.5: Re-verification required every 90 days

---

### THREAT 15: Gesture Training Data Poisoning (S2 variant)

**Threat:** Attacker poisons training data used for gesture recognition model, causing false positives or negatives.

**Attack Vectors:**
- Inject crafted gestures into training set
- Cause model to misrecognize legitimate gestures as malicious
- Cause model to recognize attacker's gestures as legitimate

**Mitigations:**

1. **Frozen MediaPipe Models** (M15.1)
   - Location: `frontend/lib/gesture-detector.ts`
   - Use only official MediaPipe Hand pre-trained models
   - Models pinned to specific version (e.g., v0.10.8)
   - Never update models automatically
   - Manual update requires security review + merge to main
   - Models downloaded from official Google source only

2. **Model Integrity Verification** (M15.2)
   - Location: `frontend/lib/gesture-detector.ts`
   - Download model signature from CDN
   - Verify SHA-256 hash before loading
   - Reject model if hash mismatch (security alert)
   - Fallback: disable gesture control, notify user

3. **No Custom Model Training** (M15.3)
   - Location: Architecture decision
   - Do NOT train custom gesture recognition models
   - Use MediaPipe only (battle-tested, open-source)
   - If custom model needed: separate architecture review required

4. **Gesture Whitelist Immutability** (M15.4)
   - Location: `lib/gesture-whitelist.ts`
   - Gesture whitelist is data-driven, not model-driven
   - Whitelist stored in database with version history
   - Changes to whitelist require Class C approval
   - Audit: track all whitelist changes with approver

**Implementation Location:**
- `apps/web/frontend/lib/gesture-detector.ts` (update)
- `apps/web/lib/gesture-whitelist.ts` (update)

**Test Cases:**
- T15.1: MediaPipe model version pinned
- T15.2: Model hash verification on load
- T15.3: No custom model training in production
- T15.4: Gesture whitelist changes audited

---

### THREAT 16: Side-Channel Attacks (S4 variant)

**Threat:** Attacker observes timing, power consumption, or electromagnetic emissions to extract gesture data or encryption keys.

**Attack Vectors:**
- Timing analysis: observe computation time reveals gesture type
- Power analysis: observe power consumption during gesture processing
- Acoustic side-channel: listen to device sounds during computation
- Electromagnetic eavesdropping: analyze EM emissions

**Mitigations:**

1. **Constant-Time Operations** (M16.1)
   - Location: `lib/gesture-verifier.ts`
   - HMAC verification: use constant-time comparison
   - Use `crypto.timingSafeEqual()` for signature verification
   - All comparison lengths equal (pad if needed)
   - No early exit on match/mismatch

2. **Computation Padding** (M16.2)
   - Location: `lib/gesture-executor.ts`
   - Add random delay (±100ms) to gesture processing
   - Prevents timing analysis of gesture type
   - Delay added before ledger write
   - No observable difference in execution time between gesture types

3. **Power Analysis Resistance** (M16.3)
   - Location: Hardware-level (not implementable in browser)
   - If running on custom hardware: use masking schemes
   - Browser environment: limited control; defer to OS/hardware
   - Document limitation: "Power analysis assumed out of scope for web platform"

4. **No Acoustic Emissions from Cryptography** (M16.4)
   - Location: `lib/gesture-verifier.ts`
   - Use hardware-accelerated AES (WebCrypto)
   - Hardware acceleration minimizes acoustic side-channel
   - No loop iterations observable from sound
   - JavaScript has limited acoustic control; rely on hardware

5. **Memory Zeroization Timing** (M16.5)
   - Location: `lib/gesture-secrets.ts`
   - Zeroization timing independent of data length
   - Always zero entire buffer, not just used portion
   - Use `crypto.getRandomValues()` to add jitter

**Implementation Location:**
- `apps/web/lib/gesture-verifier.ts` (update)
- `apps/web/lib/gesture-executor.ts` (update)
- `apps/web/lib/gesture-secrets.ts` (update)

**Test Cases:**
- T16.1: Constant-time comparison for signatures
- T16.2: Random delay padding for timing obscuring
- T16.3: Documentation of power analysis scope
- T16.4: Hardware acceleration used for crypto
- T16.5: Memory zeroization with consistent timing

---

### THREAT 17: Approval Chain Circumvention (S6 variant)

**Threat:** Attacker bypasses approval process by exploiting race conditions, state inconsistencies, or logic flaws.

**Attack Vectors:**
- Double-click approval request, executes twice
- Race condition: approval evaluated before ledger write
- Stale approval data: parameters changed after approval
- Approval ID guessing or brute force

**Mitigations:**

1. **Atomic Approval Execution** (M17.1)
   - Location: `lib/gesture-executor.ts`
   - Approval state change and execution in single transaction
   - Database constraint: `UNIQUE` on (approvalId, executedAt)
   - If approval already executed, return "already_executed" not error
   - Test: 10 concurrent approvals of same ID → only 1 executes

2. **Approval ID Cryptographic Strength** (M17.2)
   - Location: `lib/approvals.ts`
   - Approval ID: `crypto.randomUUID()` (128-bit entropy)
   - Not incrementing, not predictable
   - Entropy: 2^128 possible IDs, negligible collision risk
   - Brute force: 10B guesses/sec = 10^20 years to find valid ID

3. **Approval Parameter Immutability** (M17.3)
   - Location: `lib/approvals.ts`
   - Hash gesture parameters at approval time
   - At execution, recalculate hash and compare
   - If parameters changed: execution denied, security event logged
   - Ledger: both approval and rejection with hashes

4. **Approval Expiry Enforcement** (M17.4)
   - Location: `lib/gesture-executor.ts`
   - Check expiry before execution: `now <= expiresAt`
   - If expired: move to EXPIRED status, deny execution
   - Cannot be un-expired (no update to expiresAt)
   - Test: execute at 29.9s (succeeds), at 30.1s (fails)

5. **Approval Denial Immutability** (M17.5)
   - Location: `lib/approvals.ts`
   - Once DENIED, cannot be re-approved
   - Attempt to approve denied request = "already_denied" error
   - Ledger: attempt to approve denied request (security event)

6. **Ledger Entry Binding** (M17.6)
   - Location: `lib/ledger.ts`
   - Gesture execution creates ledger entry with approvalId
   - Ledger entry references approval record
   - Reverse lookup: given approvalId, find execution ledger entry
   - Audit: no execution without corresponding approval ledger entry

7. **Manual Approval Log Review** (M17.7)
   - Location: `lib/approval-audit.ts` (new)
   - Weekly admin report: all Class C approvals
   - Alert: approvals with unusual patterns (rapid-fire, at odd times)
   - Alert: any approval state changes outside normal flow
   - Maintain approval audit trail separately from ledger

**Implementation Location:**
- `apps/web/lib/gesture-executor.ts` (new)
- `apps/web/lib/approvals.ts` (update)
- `apps/web/lib/ledger.ts` (update)
- `apps/web/lib/approval-audit.ts` (new)

**Test Cases:**
- T17.1: Double-click approval executes once
- T17.2: Approval ID cryptographically random (2^128 entropy)
- T17.3: Parameter change prevents execution
- T17.4: Expiry at 30.01 seconds denied
- T17.5: Denied approvals cannot be re-approved
- T17.6: Every execution has approval ledger entry
- T17.7: Weekly approval audit report generated

---

### THREAT 18: Cross-Tenant Data Leakage via Gesture (S4 variant)

**Threat:** Gesture data or approval records from one tenant leaked to another tenant.

**Attack Vectors:**
- SQL query without userId filter
- Gesture ledger query returns cross-tenant data
- Approval record accessible to wrong tenant
- Shared cache containing tenant data
- Error message reveals other tenant's gesture id

**Mitigations:**

1. **Multi-Tenant Data Isolation in Code** (M18.1)
   - Location: `lib/gesture-executor.ts` (new)
   - Every gesture query must filter by: `userId = currentUser AND tenantId = currentTenant`
   - Every approval query must filter by: `userId = currentUser AND tenantId = currentTenant`
   - Prisma query example: `gestures.findMany({ where: { userId, tenantId } })`
   - Test: User B cannot retrieve User A's gesture records

2. **Approval ID Scoped to Tenant** (M18.2)
   - Location: `lib/approvals.ts`
   - Approval ID generation includes tenantId in hash
   - No ability to use another tenant's approval ID
   - Lookup: `approvals.findUnique({ where: { id: approvalId, tenantId } })`
   - If not found: return 404 (not "approval not found for tenant")

3. **Gesture Ledger Tenant Partitioning** (M18.3)
   - Location: `lib/ledger.ts`
   - Ledger table has `tenantId` column (non-nullable)
   - Index on (tenantId, userId, createdAt)
   - Query pattern: always filter by tenantId first
   - Audit: SELECT without WHERE tenantId should fail

4. **Error Message Tenant Isolation** (M18.4)
   - Location: `lib/gesture-errors.ts`
   - Error messages never include approval ID or gesture type
   - Generic errors: "Request failed"
   - Detailed error only in server logs (redacted in response)
   - Logging includes tenantId for error context

5. **Shared Cache Tenant-Aware Keys** (M18.5)
   - Location: `lib/gesture-cache.ts` (new)
   - If caching gesture metadata (e.g., gesture types)
   - Cache keys include tenantId: `gesture:{tenantId}:{gestureType}`
   - No cross-tenant cache hits
   - TTL: max 1 hour (preferably no caching of approval data)

6. **Row-Level Security (RLS) in Database** (M18.6)
   - Location: `docker/postgres/init.sql`
   - Enable PostgreSQL RLS on gesture and approval tables
   - Policy: `userId = current_user_id AND tenantId = current_tenant_id`
   - Even SQL injection at wrong tenant level is denied
   - Requires PostgreSQL RLS enabled (config check)

7. **Data Isolation Testing** (M18.7)
   - Location: `apps/web/lib/__tests__/gesture-multi-tenant.test.ts` (new)
   - Test: User A requests User B's gesture record → 404
   - Test: User A approves User B's approval request → 404
   - Test: Ledger query with wrong tenantId returns empty
   - Integration test with two separate user sessions

**Implementation Location:**
- `apps/web/lib/gesture-executor.ts` (new)
- `apps/web/lib/approvals.ts` (update)
- `apps/web/lib/ledger.ts` (update)
- `apps/web/lib/gesture-cache.ts` (new)
- `apps/web/lib/gesture-errors.ts` (update)
- `apps/web/docker/postgres/init.sql` (update)
- `apps/web/lib/__tests__/gesture-multi-tenant.test.ts` (new)

**Test Cases:**
- T18.1: User B cannot retrieve User A's gesture records
- T18.2: Approval ID from Tenant A rejected for Tenant B
- T18.3: Ledger query returns only current tenant's data
- T18.4: Error messages don't leak approval IDs
- T18.5: Cache keys include tenantId
- T18.6: RLS enforces tenant isolation at database
- T18.7: Multi-tenant integration tests pass

---

## Implementation Roadmap

### Phase 5 Security Workstreams

**Week 1: Foundation & Crypto**
- M1.1 - M1.5: Spoofing mitigations (biometric, challenge, confidence, session, rate limit)
- M2.1 - M2.5: Tampering mitigations (TLS, HMAC, canonical serialization, hash chain)
- Infrastructure: `lib/gesture-signer.ts`, `lib/gesture-verifier.ts`, `lib/biometric-gate.ts`

**Week 2: Validation & Injection**
- M4.1 - M4.7: Information disclosure mitigations (encryption, redacted logging, memory handling, key rotation)
- M8.1 - M8.5: Injection attack mitigations (validation, parameterized queries, CSP, regex scanning)
- Infrastructure: `lib/gesture-validator.ts`, `lib/gesture-encryption.ts`, `lib/gesture-logger.ts`

**Week 3: Authorization & Rate Limiting**
- M6.1 - M6.7: Elevation privilege mitigations (permission engine, delegation, autonomy, whitelist)
- M5.1 - M5.7: Denial of service mitigations (rate limiting, request size, throttling, timeouts)
- Infrastructure: `lib/permission-engine.ts` (update), `lib/rate-limiter.ts` (update)

**Week 4: Biometrics & Approval Chain**
- M11.1 - M11.5: Biometric spoofing mitigations (liveness, template hashing, multi-modal, retry limits)
- M14.1 - M14.5: Face unlock mitigations (3D liveness, behavioral biometric, micro-expression)
- M17.1 - M17.7: Approval chain mitigations (atomic execution, ID strength, expiry, denial immutability)
- Infrastructure: `lib/liveness-detection.ts`, `lib/gesture-executor.ts`

**Week 5: Privacy & Side-Channels**
- M12.1 - M12.5: Pattern recognition mitigations (obfuscation, aggregation, differential privacy, analytics opt-out)
- M16.1 - M16.5: Side-channel mitigations (constant-time, computation padding, memory zeroization)
- Infrastructure: `lib/gesture-obfuscation.ts`, `lib/gesture-analytics.ts`

**Week 6: Camera & Multi-Tenant**
- M13.1 - M13.6: Camera permission mitigations (explicit prompt, browser-only, access audit, SW isolation)
- M18.1 - M18.7: Cross-tenant mitigations (data isolation, ledger partitioning, RLS, testing)
- Infrastructure: `lib/service-worker-policy.ts`, multi-tenant tests

**Week 7: Integration & Testing**
- Integration testing all 18 threats
- Load testing with rate limiting (100 gestures/min)
- Security code review
- Performance benchmarking
- Victor's Phase 5 checklist

---

## Test Coverage (25+ Test Cases)

### Spoofing Tests (T1.x)
1. **T1.1:** Reject recorded gesture replay (video deep fake) ✓
2. **T1.2:** Challenge gesture response timeout = denial ✓
3. **T1.3:** Confidence 84% rejected, 85% accepted ✓
4. **T1.4:** Session binding prevents cross-session gestures ✓
5. **T1.5:** Rate limit enforcement (100/min) ✓

### Tampering Tests (T2.x)
6. **T2.1:** HTTPS required; HTTP requests rejected ✓
7. **T2.2:** Modified gesture payload fails HMAC check ✓
8. **T2.3:** Canonical serialization consistency ✓
9. **T2.4:** Hash chain integrity verification ✓
10. **T2.5:** Post-approval parameter change prevents execution ✓

### Repudiation Tests (T3.x)
11. **T3.1:** Complete ledger entry for every gesture ✓
12. **T3.2:** Optional gesture video recording with lifecycle ✓
13. **T3.3:** Ledger signature verification by client ✓
14. **T3.4:** RFC 3161 timestamp token generation and verification ✓
15. **T3.5:** Multi-signature requirement for shared resource actions ✓

### Information Disclosure Tests (T4.x)
16. **T4.1:** AES-256-GCM encryption of stored gesture data ✓
17. **T4.2:** Redacted logging (no coordinates, no exact confidence) ✓
18. **T4.3:** Memory cleared after serialization ✓
19. **T4.4:** Sensitive data arrays zeroed after use ✓
20. **T4.5:** Daily key rotation without data loss ✓

### Denial of Service Tests (T5.x)
21. **T5.1:** Rate limit enforcement at 100 gestures/min ✓
22. **T5.2:** Oversized payloads rejected (>5KB) ✓
23. **T5.3:** Frame throttling at 30 FPS ✓
24. **T5.4:** Connection pool prevents exhaustion ✓
25. **T5.5:** Ledger write batching at 50/sec ✓

### Additional Tests (T6.x - T18.x)
26. **T6.1:** Unknown gesture defaults to Class C ✓
27. **T6.2:** Default deny on misconfiguration ✓
28. **T6.3:** Invalid delegation row prevents execution ✓
29. **T7.1:** Type safety enforced; invalid intent rejected ✓
30. **T8.1:** Invalid coordinate range rejected ✓
31. **T9.1:** Daily gesture vocabulary randomization ✓
32. **T10.1:** Client clock skew >2s rejects gesture ✓
33. **T11.1:** Liveness detection rejects photo/video ✓
34. **T12.1:** Coordinate jitter applied consistently ✓
35. **T13.1:** Permission prompt displayed; user must approve ✓
36. **T14.1:** 3D liveness rejects masks and printed photos ✓
37. **T15.1:** MediaPipe model version pinned ✓
38. **T16.1:** Constant-time comparison for signatures ✓
39. **T17.1:** Double-click approval executes once ✓
40. **T18.1:** User B cannot retrieve User A's gesture records ✓

---

## Non-Functional Requirements

**Performance:**
- Gesture detection latency: <100ms (30 FPS)
- Intent serialization: <50ms
- Permission check: <10ms
- Approval execution: <500ms
- Ledger write: <1s (batched)

**Scalability:**
- Support 100 gestures/min per user
- Support 1000 concurrent gesture processors
- Gesture ledger growth: ~1 KB per gesture
- Retention: 1 year of gesture ledger (~365 MB per user)

**Availability:**
- Gesture control should not fail the app
- Fallback to voice/keyboard if gesture unavailable
- Ledger write failure: queue and retry (max 5 minutes backoff)

**Compatibility:**
- Browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- MediaPipe Hand: WebAssembly, no native dependencies
- Database: PostgreSQL 12+ with RLS support

---

## Security Review Checklist

- [ ] All 18 STRIDE threats documented and mitigated
- [ ] 40+ test cases written and passing
- [ ] Code review: security-reviewer signs off
- [ ] Penetration testing against threat model
- [ ] Biometric data handling reviewed by privacy team
- [ ] Camera usage complies with platform policies
- [ ] Encryption keys properly managed (not in git)
- [ ] Multi-tenant isolation verified by database RLS
- [ ] Approval chain atomic execution verified
- [ ] Rate limiting tested at peak load
- [ ] Ledger integrity verified (hash chain)
- [ ] Error messages don't leak sensitive data
- [ ] Third-party dependencies audited (MediaPipe, crypto)
- [ ] Documentation complete for operator and user

---

## Open Questions for Lead Architect

1. Should gesture control be opt-in (default Tier 0) or opt-out?
2. Should biometric data (face embedding) be stored at all, or only hash?
3. Should gesture video recording be available to users, or security team only?
4. Should liveness detection use ADA V2 built-in or add separate 3D/thermal hardware?
5. What is acceptable latency for gesture approval (current 30s)?
6. Should gesture randomization be default or user-opt-in?
7. Should multi-modal biometric fusion (face + voice) be required or optional?
8. What is the retention period for gesture ledger entries (current: 1 year)?

---

## Appendix: File Structure Summary

```
apps/web/
├── lib/
│   ├── gesture-signer.ts (new) - HMAC signature generation
│   ├── gesture-verifier.ts (new) - HMAC verification
│   ├── gesture-validator.ts (new) - Input validation
│   ├── gesture-encryption.ts (new) - AES-256-GCM at rest
│   ├── gesture-logger.ts (new) - Redacted logging
│   ├── gesture-executor.ts (new) - Atomic execution
│   ├── gesture-errors.ts (new) - Sanitized error messages
│   ├── gesture-audit.ts (update) - Audit trail
│   ├── gesture-cache.ts (new) - Tenant-aware caching
│   ├── gesture-obfuscation.ts (new) - Coordinate jitter
│   ├── gesture-analytics.ts (new) - Privacy-preserving analytics
│   ├── gesture-recording.ts (new) - Optional video recording
│   ├── gesture-injection-scan.ts (new) - Pattern matching
│   ├── gesture-secrets.ts (new) - Memory zeroization
│   ├── biometric-gate.ts (new) - Face unlock gate
│   ├── biometric-hashing.ts (new) - Face template hashing
│   ├── biometric-fusion.ts (new) - Multi-modal fusion
│   ├── biometric-retry.ts (new) - Retry limits
│   ├── biometric-enrollment.ts (new) - Enrollment verification
│   ├── liveness-detection.ts (new) - ADA V2 liveness
│   ├── 3d-liveness.ts (new) - 3D face liveness (optional)
│   ├── behavioral-biometric.ts (new) - Gesture + face fusion
│   ├── micro-expression.ts (new) - Micro-expression detection (optional)
│   ├── thermal-check.ts (new) - Thermal imaging check (optional)
│   ├── enrollment-reverification.ts (new) - 90-day re-verification
│   ├── gesture-randomization.ts (new) - Daily randomization
│   ├── rate-limiter.ts (update) - Tier-based rate limits
│   ├── gesture-session.ts (new) - Session binding
│   ├── key-rotation.ts (new) - Daily key derivation
│   ├── permission-engine.ts (update) - Gesture permission classes
│   ├── delegation-engine.ts (update) - Delegation validation
│   ├── autonomy.ts (update) - Autonomy level boundaries
│   ├── permission-matrix-audit.ts (new) - Permission audit
│   ├── gesture-whitelist.ts (new) - Gesture whitelist
│   ├── permission-elevation.ts (new) - Two-person rule (optional)
│   ├── gesture-transport.ts (new) - TLS enforcement
│   ├── gesture-serializer.ts (new) - Canonical JSON
│   ├── approval-witness.ts (new) - Notarization
│   ├── approval-bind.ts (new) - Server time binding
│   ├── ntp-check.ts (new) - Clock synchronization check
│   ├── service-worker-policy.ts (new) - SW camera isolation
│   ├── permission-elevation.ts (new) - Two-person approval
│   └── ledger.ts (update) - Gesture schema expansion
│
├── frontend/lib/
│   ├── gesture-detector.ts (new) - MediaPipe hand detection
│   ├── gesture-intent.ts (new) - Intent type safety
│   ├── gesture-challenge.ts (new) - Challenge response
│   ├── gesture-buffer.ts (new) - Memory-safe buffering
│   └── gesture-serializer.ts (new) - Canonical serialization
│
├── app/
│   ├── gesture/
│   │   ├── page.tsx (new) - Gesture control UI
│   │   ├── permission.tsx (new) - Camera permission prompt
│   │   └── settings.tsx (new) - Gesture settings
│   ├── api/gesture/
│   │   ├── execute.ts (new) - POST /api/gesture/execute
│   │   └── challenge.ts (new) - POST /api/gesture/challenge
│   └── settings/
│       └── gesture.tsx (update) - User settings
│
├── prisma/
│   ├── schema.prisma (update)
│   │   ├── Add gesture table
│   │   ├── Add approval table updates
│   │   ├── Add biometric table
│   │   ├── Add gesture_ledger table
│   │   └── Enable RLS
│   └── migrations/
│       ├── 0020_gesture_tables.sql (new)
│       └── 0021_gesture_security.sql (new)
│
├── lib/__tests__/
│   ├── gesture-spoofing.test.ts (new)
│   ├── gesture-tampering.test.ts (new)
│   ├── gesture-repudiation.test.ts (new)
│   ├── gesture-disclosure.test.ts (new)
│   ├── gesture-dos.test.ts (new)
│   ├── gesture-elevation.test.ts (new)
│   ├── gesture-injection.test.ts (new)
│   ├── gesture-biometric.test.ts (new)
│   ├── gesture-approval-chain.test.ts (new)
│   ├── gesture-multi-tenant.test.ts (new)
│   ├── gesture-integration.test.ts (new)
│   └── gesture-load.test.ts (new)
│
└── docker/postgres/
    └── init.sql (update) - RLS policies for gesture tables
```

---

## Document Revision History

| Date | Revision | Change |
|---|---|---|
| 2026-10-22 | 1.0 | Initial threat model and mitigations |

---

**Approved By:** [pending lead-architect signature]  
**Security Review:** [pending security-reviewer sign-off]  
**Next Review:** 2026-11-22 (monthly)
