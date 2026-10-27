// Shapes of GET /api/ledger/search and /api/ledger/search/facets (see lib/ledger-search.ts toLedgerItem, ledgerFacets).
export interface LedgerItem {
  id: string;
  createdAt: string;
  action: string;
  tool: string | null;
  status: string;
  persona: string | null;
  mambaMode: string | null;
  initiator: string;
  permissionClass: string;
  confirmationMethod: string | null;
  /** Redacted by the server. Untrusted: render as text only. */
  inputSummary: string | null;
  outputSummary: string | null;
  correlationId: string | null;
  latencyMs: number | null;
  protected: boolean;
  category: 'money' | 'proprietary' | null;
  approvalId: string | null;
}

export interface FacetValue { value: string | null; count: number }
export interface Facets {
  windowDays: number;
  actions: FacetValue[];
  statuses: FacetValue[];
  personas: FacetValue[];
  initiators: FacetValue[];
  categories: FacetValue[];
}
