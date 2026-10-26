// Terms and Privacy text. One data file so it can be edited without touching markup.
// Tokens in curly braces are replaced from tenant config at render: {product}, {company}, {studio}.
// Internal draft. Not legal advice. To be reviewed before external release.

export const LEGAL_DRAFT_NOTICE = 'Internal draft. Not legal advice. To be reviewed before external release.';
export const LEGAL_LAST_UPDATED = '2026-10-26';
/** Staff email standard: firstname.lastname at the group domain. Confirm before release. */
export const LEGAL_CONTACT_EMAIL = 'victor.igboekwe@whinkgroup.com';

export interface LegalSection { heading: string; paragraphs?: string[]; bullets?: string[] }
export interface LegalDoc { title: string; intro: string; sections: LegalSection[] }

export const TERMS: LegalDoc = {
  title: 'Terms of use',
  intro: '{product} is an AI chief of staff built by {studio}, part of {company}. By creating an account you agree to these terms.',
  sections: [
    {
      heading: 'What the service is',
      paragraphs: [
        '{product} helps you manage projects, contracts, decisions and communications. It uses AI models to read what you give it and to suggest or prepare actions. It can make mistakes. You are responsible for checking what it prepares before you approve it.',
      ],
    },
    {
      heading: 'Your account',
      bullets: [
        'Keep your password and any passkey private. You are responsible for activity under your account.',
        'Tell us at once if you think someone else has access.',
        'Each account sees only its own data.',
      ],
    },
    {
      heading: 'Approvals and protected actions',
      paragraphs: [
        'Some actions always wait for your approval, whatever settings you choose. These are anything that moves or commits money, and anything that sends, shares or publishes private or proprietary information outside your account.',
      ],
      bullets: [
        'An approval names a specific request and expires after 30 seconds.',
        'A general "yes" does not approve anything. You approve one request at a time.',
        'The assistant will not tell you a protected action is done before you have approved it and it has run.',
      ],
    },
    {
      heading: 'Acceptable use',
      bullets: [
        'Do not use the service to break the law or to harm others.',
        'Do not try to bypass the approval rules or access another account.',
        'Do not put in material you have no right to use.',
      ],
    },
    {
      heading: 'Third-party services',
      paragraphs: [
        'The service sends your messages to the AI model providers it is configured to use, and to tools you choose to connect. Their own terms apply to what they do with it.',
      ],
    },
    {
      heading: 'Changes and ending',
      paragraphs: [
        'We may change these terms. We will say so in the app when we do. You can delete your account data at any time (see the Privacy page). We may suspend an account that breaks these terms.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: ['Questions about these terms: {contact}.'],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy policy',
  intro: 'This page explains what {product} collects, why, and what control you have. {product} is built by {studio}, part of {company}, in Calgary, Canada.',
  sections: [
    {
      heading: 'What is collected',
      bullets: [
        'Account details: your name, email address and a hashed password or passkey.',
        'Your conversations with the assistant.',
        'Memories the assistant keeps from those conversations, such as decisions, preferences and facts, with where each came from.',
        'Documents you upload and the records you ask it to manage, such as projects and contracts.',
        'A ledger of every action the assistant ran, waited on or was denied, with time and result.',
      ],
    },
    {
      heading: 'How it is used',
      bullets: [
        'To answer you, recall earlier decisions and prepare actions.',
        'To enforce approvals and keep an accurate record.',
        'To keep the service secure and working.',
      ],
      paragraphs: ['We do not sell your data.'],
    },
    {
      heading: 'Model providers and connected tools',
      paragraphs: [
        'To answer you, the text of your conversation and the context needed for the answer is sent to the AI model provider configured for your account. If you connect an outside tool, the data needed for that action goes to that tool. Anything else leaving your account counts as sharing and needs your approval first.',
      ],
    },
    {
      heading: 'Approvals and protected actions',
      paragraphs: [
        'Moving money, and sharing private or proprietary information outside your account, always waits for your approval. Each approval is tied to one request, lasts 30 seconds and is recorded in the ledger.',
      ],
    },
    {
      heading: 'Seeing and correcting what is kept',
      paragraphs: [
        'You can read your memories, see which conversation created each one, confirm or correct it, and read the ledger. You can ask us for a copy of your data.',
      ],
    },
    {
      heading: 'Retention',
      bullets: [
        'Conversations and memories are kept until you delete them or close your account.',
        'The ledger is kept as a record of actions. It holds action details, not the contents of your documents.',
        'Password reset links expire.',
      ],
    },
    {
      heading: 'Deletion',
      paragraphs: [
        'You can delete individual memories in the app. To delete your account and the data in it, write to {contact}. We will confirm when it is done.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: ['Privacy questions and requests: {contact}.'],
    },
  ],
};
