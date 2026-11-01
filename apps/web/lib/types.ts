export type Expense = {
  id: string
  amount: number
  category: string
  description: string
  date: Date
}

export type ExpenseFormData = Omit<Expense, 'id' | 'date'> & {
  date: string
}

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transportation',
  'Housing',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Education',
  'Other'
] as const

export type DateRange = {
  from: Date | undefined
  to: Date | undefined
}
/**
 * MAMBA is Obsidian only. Any legacy or client-supplied mode (WHITE, GREY, anything)
 * collapses to OBSIDIAN when the persona is MAMBA, and to null for WHINK.
 * Pass persona when known; without it, any non-empty value becomes OBSIDIAN.
 */
export function normaliseMambaMode(v: unknown, persona?: string | null): 'OBSIDIAN' | null {
  if (persona !== undefined && persona !== null) {
    return persona === 'MAMBA' ? 'OBSIDIAN' : null;
  }
  return typeof v === 'string' && v.length > 0 ? 'OBSIDIAN' : null;
}
