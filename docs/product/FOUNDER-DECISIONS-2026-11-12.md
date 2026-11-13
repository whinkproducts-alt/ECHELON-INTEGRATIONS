# Founder decisions — 12 November 2026 (America/Edmonton)

These decisions govern the next Integrations build. They supersede conflicting proposals in older plans. A decision is a requirement, not evidence that the feature has shipped or passed a Mac test.

| ID | Decision | Build consequence | Current state |
|---|---|---|---|
| D1 | First spoken initiative goes to WHINK. | Create one durable project and start a safe internal task from the accepted instruction. Keep the transcript, target, progress, cancellation and receipts together. | Planned; end-to-end Mac speech test outstanding. |
| D2 | Run safe internal steps automatically. | Protected actions still pause for the Founder's exact approval; an agent persona never grants permission. | Policy requirement. |
| D3 | Defer choosing the off-device always-on host. | Keep the requirement and portable design; do not claim Mac-off availability until a host is selected and tested. | Open. |
| D4 | Route inference to local first, eligible free cloud second, paid third. | Paid requests require explicit approval with a cost and cap. Verify current free entitlement before classifying a cloud route as free. Preserve privacy labels and log fallback reasons. | Routing acceptance requirement. |
| D5 | Prefer Canada for central memory; allow another reviewed region if necessary. | Document the actual storage, backup and processing regions, encryption, data access and residency implications before deployment. | Provider and exact region open. |
| D6 | The intended Echelon organization has 16 directorates. | Preserve all current director names. Add **AI Organization and Autonomous Operations** to canonical leadership; keep 326 agents and 163 teams intact. | Implemented on Integrations branch `org/add-ai-autonomous-operations-directorate`, not merged. The separate Innovation & Opportunity staff group is distinct. The new directorate has no assigned departments, teams or agents pending a staffing decision. |
| D7 | Prioritize a workable free local video engine. | Evaluate actual model weights, license, Mac M3 16 GiB memory, disk, speed and quality. Test a short clip locally before promising no API fees. OpenHiggsfield's existing hosted catalog is separate. | Evaluation outstanding. |
| D8 | Send the daily briefing to the Founder's own phone automatically, without per-message approval. | Implement a narrow standing instruction for a verified owner number and opted-in daily schedule. Send at most once per local day, bound length/content and cost, keep delivery receipts, and fail closed when identity, phone verification, provider or budget is unknown. Do not exempt arbitrary messages or recipients from protected-action approval. | Current worker only creates an approval reminder; automatic delivery is not implemented. |

## Acceptance gates

1. Spoken WHINK instruction creates one project and starts one permitted task, including after reconnect; protected actions wait for exact approval.
2. Route tests prove local → verified free cloud → approved paid order, including privacy and cost failures.
3. Central memory deployment records its real region and restore test; off-device uptime remains a separate decision.
4. Check that the supplied sixteenth directorate appears in leadership and the workforce UI without replacing existing names. Define its departments and whether existing agents/teams transfer before claiming all 326 agents and 163 teams are distributed across all 16.
5. A local video benchmark reports quality and measured time on the Founder's Mac before it becomes the default.
6. Daily SMS tests cover verified owner number, unknown number, once-per-day idempotency, provider errors and general protected-message boundaries. Sending remains disabled until those checks and live configuration are complete.
