// All landing copy that is not a product name lives here so it can be edited without touching markup.
// Product, company and studio names are never written here; they come from tenant config at render time.

export interface Capability {
  id: string;
  title: string;
  body: string;
  /** Short label shown in mono beside the title. */
  tag: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'moving',
    tag: 'Projects and contracts',
    title: 'Keeps the work moving.',
    body: 'It tracks your projects, contracts and deadlines, notices what has stalled, and tells you what needs a decision today.',
  },
  {
    id: 'memory',
    tag: 'Memory',
    title: 'Remembers what you decided.',
    body: 'Decisions, preferences and facts you have told it are kept and recalled in later conversations. You can see each memory, correct it, or delete it.',
  },
  {
    id: 'approval',
    tag: 'Approvals',
    title: 'Asks before it acts.',
    body: 'Spending money, sending anything out, or sharing private information always waits for your approval. Each request names exactly what will happen, and it expires if you do not answer.',
  },
  {
    id: 'board',
    tag: 'Board and team',
    title: 'Runs a board and a named team.',
    body: 'Ask a question and get a view from advisers with defined roles. Each specialist has a name and a work address, so you know who said what.',
  },
  {
    id: 'tools',
    tag: 'Your tools',
    title: 'Works through your own tools.',
    body: 'It connects to the accounts and services you choose, with your permission, and uses them under the same approval rules as everything else.',
  },
];

export interface Contrast {
  id: string;
  heading: string;
  general: string;
  here: string;
}

export const CONTRASTS: Contrast[] = [
  {
    id: 'remembers',
    heading: 'It remembers across everything.',
    general: 'A general assistant starts each chat from zero.',
    here: 'This one carries your decisions, people and documents from one conversation to the next.',
  },
  {
    id: 'asks',
    heading: 'It asks before it acts.',
    general: 'A general assistant tends to either refuse or just do it.',
    here: 'This one shows you the exact action and waits for your yes on anything involving money, sending, or sharing.',
  },
  {
    id: 'record',
    heading: 'It keeps a record of every action.',
    general: 'A general assistant leaves you guessing what it did.',
    here: 'This one writes every action, whether it ran, waited or was denied, to a ledger you can read.',
  },
];

export interface TourItem { id: string; src: string; width: number; height: number; alt: string; caption: string }

/** Captures of real screens running on fixture data. Files live in public/landing. */
export const TOUR: TourItem[] = [
  { id: 'today', src: '/landing/tour-today.webp', width: 1376, height: 760, alt: 'The Today screen: counts for approvals waiting, security events and token budget, an approval card with a countdown, and a list of recommendations.', caption: 'Today. What needs you, what is waiting for approval, and where you are against your limits.' },
  { id: 'approvals', src: '/landing/tour-approvals.webp', width: 1100, height: 608, alt: 'The Approvals screen with one request awaiting approval, its exact content shown, and a countdown bar in amber.', caption: 'Approvals. Each request shows its exact content and expires after 30 seconds.' },
  { id: 'ledger', src: '/landing/tour-ledger.webp', width: 1100, height: 608, alt: 'The Ledger screen: a filterable table of actions with status labels such as ran, denied and awaiting approval.', caption: 'Ledger. Every action that ran, waited or was denied, with who started it.' },
  { id: 'contracts', src: '/landing/tour-contracts.webp', width: 1100, height: 608, alt: 'The Contracts screen listing agreements by subsidiary with value, dates and renewal countdown.', caption: 'Contracts. Agreements by subsidiary with dates and renewals.' },
];

/** Static sample shown in the demo console. Clearly fake; no live data. */
export const DEMO = {
  you: 'Pay the Calgary supplier invoice and tell the team.',
  reply: 'Paying an invoice moves money, so I will not do that on my own. I have prepared the payment and the message to the team. Both are waiting for you.',
  approvalAction: 'Pay invoice 2041',
  approvalDetail: 'CAD 4,800.00 to Prairie Supply Ltd.',
  time: '10:42:07',
  ledgerLine: 'payment_requested, awaiting approval, nothing has run',
  windowSeconds: 30,
};
