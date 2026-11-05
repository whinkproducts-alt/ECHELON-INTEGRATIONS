/**
 * ECHELON Persona Definitions
 * Single source of truth for all persona metadata
 */

export type PersonaType = 'WHINK' | 'MAMBA' | 'AMARA' | 'MATEO' | 'PRIYA' | 'SOREN' | 'MEI_LING' | 'MAYA';

export interface PersonaConfig {
  id: PersonaType;
  name: string;
  title: string;
  shortTitle: string;
  gradient: string;
  accent: string;
  avatarColor: string;
  description: string;
  capabilities: string[];
  voiceId?: string;
  isBoardMember: boolean;
  reportsTo: PersonaType | 'FOUNDER';
}

export const PERSONAS: Record<PersonaType, PersonaConfig> = {
  WHINK: {
    id: 'WHINK',
    name: 'WHINK',
    title: 'Chief Intelligence Officer',
    shortTitle: 'CIO',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
    accent: '#10B981',
    avatarColor: '#10B981',
    description: 'Primary intelligence interface. Synthesizes all board input, routes decisions, maintains strategic memory.',
    capabilities: ['Strategic Synthesis', 'Decision Routing', 'Memory Management', 'Cross-Board Coordination'],
    voiceId: 'whink-voice-v1',
    isBoardMember: true,
    reportsTo: 'FOUNDER',
  },
  MAMBA: {
    id: 'MAMBA',
    name: 'MAMBA',
    title: 'Chief Strategy Officer',
    shortTitle: 'CSO',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    accent: '#EF4444',
    avatarColor: '#EF4444',
    description: 'Adversarial strategist. Stress-tests every assumption, models failure modes, ensures robustness.',
    capabilities: ['Red Teaming', 'Risk Modeling', 'Scenario Planning', 'Counter-Strategy'],
    voiceId: 'mamba-voice-v1',
    isBoardMember: true,
    reportsTo: 'FOUNDER',
  },
  AMARA: {
    id: 'AMARA',
    name: 'AMARA',
    title: 'Chief Innovation & Opportunity Officer',
    shortTitle: 'CIOO',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)',
    accent: '#F59E0B',
    avatarColor: '#F59E0B',
    description: 'Leads Innovation Committee. Weekly intelligence briefs. Identifies transformative opportunities.',
    capabilities: ['Innovation Scanning', 'Weekly Briefs', 'Opportunity Synthesis', 'Committee Leadership'],
    voiceId: 'amara-voice-v1',
    isBoardMember: true,
    reportsTo: 'WHINK',
  },
  MATEO: {
    id: 'MATEO',
    name: 'MATEO',
    title: 'Senior Opportunity Scout',
    shortTitle: 'Scout',
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
    accent: '#3B82F6',
    avatarColor: '#3B82F6',
    description: 'Hourly market scans. Fresh signal detection. First-mover advantage identification.',
    capabilities: ['Hourly Scanning', 'Signal Detection', 'Trend Spotting', 'Alert Generation'],
    voiceId: 'mateo-voice-v1',
    isBoardMember: false,
    reportsTo: 'AMARA',
  },
  PRIYA: {
    id: 'PRIYA',
    name: 'PRIYA',
    title: 'Strategic Market Analyst',
    shortTitle: 'Analyst',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)',
    accent: '#8B5CF6',
    avatarColor: '#8B5CF6',
    description: '6-hour sector deep-dives. Competitive intelligence. Market structure analysis.',
    capabilities: ['Sector Analysis', 'Competitive Intel', 'Market Modeling', 'Thesis Generation'],
    voiceId: 'priya-voice-v1',
    isBoardMember: false,
    reportsTo: 'AMARA',
  },
  SOREN: {
    id: 'SOREN',
    name: 'SOREN',
    title: 'Growth Strategist',
    shortTitle: 'Growth',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 50%, #BE185D 100%)',
    accent: '#EC4899',
    avatarColor: '#EC4899',
    description: '6-hour scale lever analysis. Existing business optimization. Retention mechanics.',
    capabilities: ['Growth Modeling', 'Retention Analysis', 'Funnel Optimization', 'Lever Identification'],
    voiceId: 'soren-voice-v1',
    isBoardMember: false,
    reportsTo: 'AMARA',
  },
  MEI_LING: {
    id: 'MEI_LING',
    name: 'MEI-LING',
    title: 'Venture Scout',
    shortTitle: 'Venture',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)',
    accent: '#06B6D4',
    avatarColor: '#06B6D4',
    description: '12-hour early-stage scans. Acquisition & partnership angles. Pre-seed signal.',
    capabilities: ['Early-Stage Scouting', 'Acquisition Analysis', 'Partnership Modeling', 'Due Diligence Prep'],
    voiceId: 'meiling-voice-v1',
    isBoardMember: false,
    reportsTo: 'AMARA',
  },
  MAYA: {
    id: 'MAYA',
    name: 'MAYA',
    title: 'Self-Improvement Analyst',
    shortTitle: 'Improvement',
    gradient: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 50%, #0F766E 100%)',
    accent: '#14B8A6',
    avatarColor: '#14B8A6',
    description: 'Continuous learning engine. Pattern extraction. Procedural memory updates. 6-hour cycles.',
    capabilities: ['Pattern Mining', 'Proposal Generation', 'Memory Curation', 'Metrics Tracking'],
    voiceId: 'maya-voice-v1',
    isBoardMember: false,
    reportsTo: 'WHINK',
  },
};

export const BOARD_MEMBERS: PersonaType[] = ['WHINK', 'MAMBA', 'AMARA'];
export const INNOVATION_COMMITTEE: PersonaType[] = ['AMARA', 'MATEO', 'PRIYA', 'SOREN', 'MEI_LING'];
export const ALL_PERSONAS: PersonaType[] = ['WHINK', 'MAMBA', 'AMARA', 'MATEO', 'PRIYA', 'SOREN', 'MEI_LING', 'MAYA'];

export function getPersona(id: PersonaType): PersonaConfig {
  return PERSONAS[id];
}

export function getPersonaByName(name: string): PersonaConfig | undefined {
  return Object.values(PERSONAS).find(p => p.name.toLowerCase() === name.toLowerCase());
}