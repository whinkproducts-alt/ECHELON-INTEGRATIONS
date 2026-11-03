// Shape served by GET /api/finance/summary (lib/finance/summary.ts). Read-only. Amounts are decimal strings.
export interface ContractValueRow { subsidiary: string | null; status: string; currency: string; total: string; contracts: number; contractsWithValue: number }
export interface CurrencyTotal { currency: string; total: string; contracts: number }
export interface UpcomingItem {
  kind: 'end' | 'renewal'; date: string; contractId: string; title: string; counterparty: string; subsidiary: string | null;
  status: string; valueAmount: string | null; currency: string;
}
export interface ModelSpend {
  month: string; calls: number; tokensIn: number; tokensOut: number; costMicros: number; unknownCostCalls: number;
  monthlyTokenBudget: number | null; budgetState: 'ok' | 'soft' | 'hard'; resetsAt: string;
}
export interface FinanceSummary {
  asOf: string;
  contracts: { byGroup: ContractValueRow[]; byCurrency: CurrencyTotal[]; total: number };
  upcoming: { windowDays: number; items: UpcomingItem[] };
  modelSpend: ModelSpend;
  omitted: Array<{ field: string; reason: string }>;
}
