# Phase 5 Gesture Security Architecture Reference

**Quick Reference for Stream 5 Developers**  
**Date:** 2026-10-22

## Data Flow Architecture

### High-Level: Gesture → Approval → Execution

```
Client Browser                      WHINK Server                         Database
┌─────────────────────┐
│  Camera/MediaPipe   │
│  Hand Detection     │
└──────────┬──────────┘
           │ [hand landmarks, confidence]
           ▼
┌──────────────────────────────────────┐
│ gesture-detector.ts (frontend)       │ ← MediaPipe Hand WASM, 30 FPS max
│ - Extract 21 hand landmarks          │
│ - Confidence >85% for Tier 2+        │
│ - Stability check (3 consecutive)    │
└──────────┬───────────────────────────┘
           │ [gesture intent]
           ▼
┌──────────────────────────────────────┐
│ gesture-serializer.ts (frontend)     │ ← Canonical JSON, sorted keys
│ - Normalize coordinates              │
│ - Include timestamp, session ID      │
│ - Create canonical form              │
└──────────┬───────────────────────────┘
           │ [canonical JSON]
           ▼
┌──────────────────────────────────────┐
│ gesture-signer.ts (frontend)         │ ← HMAC-SHA256 with user key
│ - Sign canonical gesture             │
│ - Timestamp + sessionId included     │
└──────────┬───────────────────────────┘
           │ [gesture JSON + HMAC signature]
           │ (HTTPS/TLS 1.3)
           ├──────────────────────────────────► POST /api/gesture/execute
                                               │
                                               ▼
                                    ┌──────────────────────────────────┐
                                    │ gesture-verifier.ts              │ ← Verify HMAC
                                    │ - Check HMAC signature           │
                                    │ - Validate timestamp (±2s)       │
                                    │ - Session binding                │
                                    └──────────┬───────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────────────────┐
                                    │ gesture-validator.ts             │
                                    │ - Validate all coordinates       │
                                    │ - Check confidence threshold     │
                                    │ - Inject pattern scan            │
                                    │ - Type check gesture type        │
                                    └──────────┬───────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────────────────┐
                                    │ rate-limiter.ts                  │ ← 100/min per user
                                    │ - Token bucket algorithm         │
                                    │ - Per-user, per-tier limits      │
                                    └──────────┬───────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────────────────┐
                                    │ permission-engine.ts             │
                                    │ - Check gesture permission class │
                                    │ - Class A: allow                 │
                                    │ - Class B: check delegation      │
                                    │ - Class C: require approval      │
                                    └──────────┬───────────────────────┘
                                               │
                        ┌─────────────────────┼──────────────────────┐
                        │ (Class A/B)         │ (Class C)            │
                        ▼                     ▼                      ▼
                    ┌────────┐        ┌──────────────┐    ┌─────────────────┐
                    │ Execute│        │ Create EAR   │    │ Approval Gate   │
                    │ Gesture│        │ (Execution   │    │ (Show to User)  │
                    │        │        │  Auth Req)   │    │                 │
                    └────────┘        └──────────────┘    └────────┬────────┘
                        │                   │                     │
                        │              ┌────┴───┐                 │
                        │              │ ID     │                 │
                        │              │ 30s    │          ┌──────▼────────┐
                        │              │ expiry │          │ User Approval  │
                        │              │ hash   │          │ (Voice/Card)   │
                        │              └────┬───┘          └──────┬────────┘
                        │                   │                     │
                        │                   ▼                     ▼
                        │         ┌──────────────────────────────┐
                        │         │ Atomic Approval Execution    │
                        │         │ - Check hash lock            │
                        │         │ - Verify not expired         │
                        │         │ - DB transaction (atomic)    │
                        │         └──────────┬───────────────────┘
                        │                    │
                        └────────┬───────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │ Execute Tool/Action            │
                    │ - Via tool loop                │
                    │ - Model invocation possible    │
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │ Ledger Write                   │ ◄──── Postgres
                    │ - Gesture details              │
                    │ - Approval ID                  │
                    │ - Hash chain entry             │
                    │ - User + tenant scope          │
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │ Ledger Encryption              │
                    │ - AES-256-GCM at rest          │
                    │ - Coordinates encrypted        │
                    │ - Landmarks encrypted          │
                    └────────────────────────────────┘
```

---

## Core Classes and Interfaces

### Gesture Intent (Type-Safe)

```typescript
// frontend/lib/gesture-intent.ts
interface GestureIntent {
  gestureType: "pinch" | "thumbs_up" | "peace" | "stop" | "ok";
  handLandmarks: Float32Array[]; // [x, y, z, confidence] × 21 landmarks × 2 hands
  confidence: number; // 0.0 to 1.0
  timestamp: string; // ISO 8601 UTC
  sessionId: string; // HTTP-only cookie value
  userId: string; // From auth session
  tenantId: string; // Multi-tenant scope
}

// Canonical serialization
function canonicalize(intent: GestureIntent): string {
  const obj = {
    confidence: intent.confidence,
    gestureType: intent.gestureType,
    handLandmarks: intent.handLandmarks.map(l => [...l]),
    sessionId: intent.sessionId,
    tenantId: intent.tenantId,
    timestamp: intent.timestamp,
    userId: intent.userId,
  };
  return JSON.stringify(obj); // Sorted keys
}
```

### Permission Classes

```typescript
// lib/permission-engine.ts
enum PermissionClass {
  A = "A", // Observation, navigation, pause/play
  B = "B", // Delegatable (send message, create note)
  C = "C", // Requires approval (delete, social post, trade)
}

// Gestures mapped to classes (immutable, code-level)
const GESTURE_PERMISSION_MAP: Record<string, PermissionClass> = {
  pinch: PermissionClass.A,
  thumbs_up: PermissionClass.B,
  peace: PermissionClass.B,
  stop: PermissionClass.C,
  ok: PermissionClass.C,
};

// Autonomy levels
enum AutonomyLevel {
  Tier0 = 0, // Observation only (camera disabled)
  Tier1 = 1, // Class A only
  Tier2 = 2, // Class A + Class B (with delegation)
  Tier3 = 3, // Class A + Class B + Class C (with approval)
}
```

### Approval Request (Class C)

```typescript
// lib/approvals.ts
interface ApprovalRequest {
  id: string; // crypto.randomUUID() [128-bit entropy]
  userId: string;
  tenantId: string;
  gestureId: string; // "stop", "ok", etc.
  payload: any; // Canonical gesture data
  hash: string; // SHA-256(canonical payload)
  expiresAt: number; // Date.now() + 30000 (milliseconds)
  status: "AWAITING" | "APPROVED" | "DENIED" | "EXPIRED" | "EXECUTED";
  approvedBy?: string; // User ID if approved
  approvedAt?: number; // Timestamp if approved
  executedAt?: number; // Timestamp if executed
  ledgerEntryId?: string; // Link to execution ledger
}

// Atomic execution check
async function executeApproval(
  approvalId: string,
  payload: any
): Promise<{ success: boolean; reason?: string }> {
  return db.$transaction(async (tx) => {
    // 1. Load approval for update
    const approval = await tx.approvalRequest.findUnique({
      where: { id: approvalId }
    });

    // 2. Verify hash (detect tampering)
    const currentHash = sha256(JSON.stringify(payload));
    if (currentHash !== approval.hash) {
      return { success: false, reason: "Hash mismatch" };
    }

    // 3. Verify not expired
    if (Date.now() > approval.expiresAt) {
      await tx.approvalRequest.update({
        where: { id: approvalId },
        data: { status: "EXPIRED" }
      });
      return { success: false, reason: "Expired" };
    }

    // 4. Verify not already executed (atomic state change)
    const result = await tx.approvalRequest.updateMany({
      where: {
        id: approvalId,
        status: "APPROVED" // Only update if APPROVED
      },
      data: {
        status: "EXECUTED",
        executedAt: new Date()
      }
    });

    if (result.count === 0) {
      return { success: false, reason: "Not executable" };
    }

    return { success: true };
  });
}
```

### Ledger Entry (Immutable)

```typescript
// lib/ledger.ts
interface GestureLedgerEntry {
  id: string; // UUID
  userId: string; // Multi-tenant scope
  tenantId: string;
  gesture: {
    type: string;
    landmarks: Array<{ x: number; y: number; z: number }>;
    confidence: number;
  };
  timestamp: string; // Server time, ISO 8601
  approvalId?: string; // If Class C
  hash: string; // SHA-256(gesture data + timestamp)
  previousHash: string; // For hash chain
  signature: string; // Server's private key signature
  status: "CREATED" | "APPROVED" | "EXECUTED" | "DENIED" | "FAILED";
  error?: string; // If failed
  encryptionKey?: string; // KMS reference
  createdAt: Date;

  // Hash chain integrity
  chainHash: string; // SHA-256(hash + previousHash + timestamp)
}

// Single write path (no other code writes to ledger)
async function writeLedger(
  userId: string,
  tenantId: string,
  gestureData: any,
  status: string,
  approvalId?: string
): Promise<GestureLedgerEntry> {
  // All ledger writes go through this function only

  const currentHash = sha256(JSON.stringify(gestureData));
  const previousEntry = await getLastLedgerEntry(userId, tenantId);
  const previousHash = previousEntry?.chainHash || "0".repeat(64);

  const entry: GestureLedgerEntry = {
    id: randomUUID(),
    userId,
    tenantId,
    gesture: gestureData,
    timestamp: new Date().toISOString(),
    hash: currentHash,
    previousHash,
    chainHash: sha256(`${currentHash}${previousHash}${Date.now()}`),
    status,
    approvalId,
    signature: signWithServerKey(currentHash),
    createdAt: new Date(),
  };

  return db.gestureLedger.create({ data: entry });
}
```

---

## File Dependencies Graph

```
🔴 Critical (P0) Files
├── lib/gesture-verifier.ts
│   └── requires: WebCrypto (crypto.timingSafeEqual)
│       uses: HMAC-SHA256
│
├── lib/gesture-validator.ts
│   ├── validates: coordinate ranges, confidence, gesture types
│   └── returns: { valid: boolean, error?: string }
│
├── lib/gesture-signer.ts (frontend)
│   ├── requires: user encryption key
│   └── produces: HMAC-SHA256 signature
│
├── lib/rate-limiter.ts
│   ├── stores: token bucket per userId
│   └── enforces: 100 gestures/min
│
├── lib/permission-engine.ts
│   ├── uses: GESTURE_PERMISSION_MAP (immutable)
│   ├── checks: autonomy level, delegations
│   └── returns: { allowed: boolean, reason?: string }
│
├── lib/approvals.ts
│   ├── creates: approval requests with 30s expiry
│   ├── uses: crypto.randomUUID() for ID
│   └── executes: atomic DB transaction
│
├── lib/gesture-executor.ts
│   ├── calls: permission-engine, approvals, rate-limiter
│   ├── updates: approval status (atomic)
│   └── writes: ledger entry
│
├── lib/ledger.ts
│   ├── single write path
│   ├── requires: SHA-256 for hash chain
│   ├── stores: user + tenant + gesture + approval link
│   └── AES-256-GCM encryption at rest
│
├── frontend/lib/gesture-detector.ts
│   ├── uses: MediaPipe Hand WASM
│   ├── throttles: 30 FPS max
│   └── outputs: hand landmarks (21 per hand)
│
├── frontend/lib/gesture-serializer.ts
│   ├── inputs: hand landmarks from detector
│   └── outputs: canonical JSON string
│
└── frontend/lib/gesture-signer.ts
    ├── inputs: canonical JSON
    ├── uses: user encryption key
    └── outputs: HMAC signature

🟡 High-Priority (P1) Files
├── lib/gesture-encryption.ts
│   ├── uses: AES-256-GCM
│   └── key derivation: PBKDF2(password, userId salt)
│
├── lib/key-rotation.ts
│   ├── daily: new key from master + date
│   └── re-encrypt: on first read
│
├── lib/gesture-logger.ts
│   ├── redacts: coordinates, exact confidence
│   ├── logs: gesture type only
│   └── no PII in logs
│
├── lib/liveness-detection.ts
│   ├── uses: ADA V2 API
│   └── enforces: >95% confidence
│
├── lib/biometric-gate.ts
│   ├── calls: liveness-detection
│   ├── requires: face biometric unlock
│   └── gates: Tier 2+ access
│
└── lib/gesture-whitelist.ts
    ├── stores: allowed gestures per user/tenant
    ├── default: empty (opt-in)
    └── updates: Class C action

🟢 Medium-Priority (P2) Files
├── lib/gesture-obfuscation.ts (optional)
│   ├── adds: coordinate jitter (±1%)
│   └── adds: processing delay
│
├── lib/gesture-analytics.ts (optional)
│   ├── aggregates: no individual patterns
│   └── applies: differential privacy
│
└── lib/gesture-randomization.ts (optional)
    ├── daily: shuffle gesture vocabulary
    └── prevents: pattern recognition
```

---

## Critical Security Boundaries

### 1. Rate Limiting Boundary
```
Rate Limiter
├── Input: userId, gesture request
├── State: token bucket per userId
├── Decision: allow (return 200) or deny (return 429)
└── Enforcement: before validator, before permission check
```

### 2. Permission Boundary
```
Permission Engine
├── Input: gesture type, userId, autonomy level, delegations
├── Source: GESTURE_PERMISSION_MAP (immutable in code)
├── Decision: Class A (execute), Class B (check delegation), Class C (queue approval)
└── No Configuration: classes not data-driven
```

### 3. Approval Boundary
```
Approval Chain
├── Creation: 30-second expiry, random ID, hash of payload
├── Storage: database with AWAITING status
├── Execution: atomic transaction, hash lock check, status update
├── Fallback: if DB down, gesture queued (max 5 min retry)
└── No Silent Failures: all decisions logged
```

### 4. Ledger Boundary
```
Ledger (Immutable)
├── Single Write: lib/ledger.ts ONLY
├── Scope: userId + tenantId (no cross-tenant)
├── Encryption: AES-256-GCM for gesture coordinates
├── Chain: SHA-256 hash chain (tamper detection)
├── Retention: 1 year by default
└── Access: append-only (no deletes), audit queries
```

### 5. Multi-Tenant Boundary
```
Isolation
├── Database: WHERE userId = X AND tenantId = Y
├── RLS Policies: PostgreSQL enforce at storage layer
├── Cache Keys: gesture:{tenantId}:{type}
├── Error Messages: generic (no approval IDs)
└── Testing: integration tests verify isolation
```

---

## Implementation Checklist (Per Phase)

### Phase 1: Core Security (Week 1)
- [ ] HMAC signing/verification
- [ ] Input validation (coordinates, confidence, types)
- [ ] Rate limiter (token bucket)
- [ ] Permission engine (Class A/B/C)
- [ ] Approval creation (30s expiry, hash)
- [ ] Atomic approval execution
- [ ] Ledger writes (single path)
- [ ] Tests: T1, T2, T5, T6, T8, T17, T18

### Phase 2: Encryption & Privacy (Week 2)
- [ ] AES-256-GCM at rest
- [ ] Gesture detection (MediaPipe)
- [ ] Redacted logging
- [ ] Key rotation
- [ ] Biometric hashing
- [ ] Liveness detection (ADA V2)
- [ ] Tests: T3, T4, T11

### Phase 3: Authorization (Week 3)
- [ ] Permission matrix audit
- [ ] Gesture whitelist
- [ ] Delegation validation
- [ ] RLS policies
- [ ] Error sanitization
- [ ] Tests: T6, T18

### Phase 4: Biometrics & Approval (Week 4)
- [ ] Face unlock via ADA V2
- [ ] Challenge-response gestures
- [ ] Biometric retry limits
- [ ] Enrollment verification
- [ ] Approval audit trail
- [ ] Tests: T11, T14, T17

### Phase 5: Privacy & Analytics (Week 5)
- [ ] Coordinate obfuscation
- [ ] Gesture aggregation
- [ ] Analytics opt-out
- [ ] Memory zeroization
- [ ] Tests: T4, T12

### Phase 6: Advanced Hardening (Week 6)
- [ ] Camera permissions
- [ ] Service worker isolation
- [ ] Clock sync check
- [ ] Gesture randomization (optional)
- [ ] Tests: T9, T10, T13

### Phase 7: Integration & Testing (Week 7)
- [ ] End-to-end tests
- [ ] Load tests (100 gestures/min)
- [ ] Penetration testing
- [ ] Code review
- [ ] Performance benchmarks

---

## Performance Budgets

| Operation | Budget | Notes |
|-----------|--------|-------|
| Gesture Detection | <100ms | 30 FPS = 33ms per frame |
| Intent Serialization | <50ms | Canonical JSON |
| HMAC Verification | <10ms | Constant-time |
| Permission Check | <10ms | In-memory lookup |
| Rate Limit Check | <5ms | Token bucket |
| Approval Creation | <50ms | DB insert |
| Approval Execution | <500ms | DB transaction |
| Ledger Write | <1s | Batched (50/sec) |

---

## Deployment Checklist

- [ ] MediaPipe models pinned to version
- [ ] Encryption keys in AWS KMS (not git)
- [ ] PostgreSQL RLS enabled
- [ ] HSTS header set (HTTPS only)
- [ ] CORS configured
- [ ] Rate limiter tested under load
- [ ] Ledger hash chain verified
- [ ] Approval expiry tested (29.9s vs 30.1s)
- [ ] Multi-tenant isolation verified
- [ ] Camera permissions prompt tested
- [ ] Biometric liveness tested against photos/videos

---

**Document Version:** 1.0  
**For Questions:** Ask Stream 5 Lead or lead-architect
