// Presentation metadata for the connector marketplace. Display only: it never decides status
// or permission. Category is not part of the API payload yet, so it is mapped here by id;
// an unknown id lands in "Other" rather than being guessed.
export type CategoryId = 'messaging' | 'productivity' | 'social' | 'dev' | 'ai_local' | 'infrastructure' | 'other';

export const CATEGORIES: { id: CategoryId; label: string; blurb: string }[] = [
  { id: 'messaging', label: 'Messaging', blurb: 'Email, chat and phone channels' },
  { id: 'productivity', label: 'Productivity', blurb: 'Calendars, files and planning' },
  { id: 'social', label: 'Social', blurb: 'Public platforms. Every write waits for you' },
  { id: 'dev', label: 'Dev', blurb: 'Code and design tooling' },
  { id: 'ai_local', label: 'AI and local', blurb: 'Models and recall that run on your own machine' },
  { id: 'infrastructure', label: 'Infrastructure', blurb: 'Gateways and payments' },
  { id: 'other', label: 'Other', blurb: 'Not yet categorised' },
];

const BY_ID: Record<string, CategoryId> = {
  gmail: 'messaging', slack: 'messaging', twilio: 'messaging', telegram: 'messaging', whatsapp: 'messaging',
  google_calendar: 'productivity', google_drive: 'productivity', notion: 'productivity', linear: 'productivity',
  x: 'social', instagram: 'social', tiktok: 'social',
  github: 'dev', figma: 'dev',
  ollama: 'ai_local', anythingllm: 'ai_local',
  openclaw: 'infrastructure', stripe_readonly: 'infrastructure',
};

export function categoryOf(id: string): CategoryId {
  return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : 'other';
}

export function humanise(token: string): string {
  return token.replace(/_/g, ' ');
}
