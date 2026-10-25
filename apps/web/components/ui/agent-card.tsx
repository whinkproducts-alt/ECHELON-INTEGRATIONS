'use client';

import React from 'react';
import { PersonaAvatar } from './persona-avatar';

export type AgentStatus = 'online' | 'away' | 'offline';

export interface AgentCardProps {
  name: string;
  role: string;
  email: string;
  imageUrl?: string;
  status?: AgentStatus;
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  online: '#22C55E',
  away: 'hsl(var(--pending-amber))',
  offline: 'rgba(143,163,184,0.5)',
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
};

const glassCard: React.CSSProperties = {
  background: 'rgba(14,21,32,0.78)',
  border: '1px solid rgba(56,182,255,0.16)',
  borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
  backdropFilter: 'blur(12px)',
  padding: '20px 16px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  minWidth: 160,
  position: 'relative',
};

export function AgentCard({ name, role, email, imageUrl, status = 'offline' }: AgentCardProps) {
  return (
    <div style={glassCard}>
      {/* Avatar with status dot */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <PersonaAvatar name={name} imageUrl={imageUrl} size="lg" role={role} />
        {/* Status dot — bottom-right of avatar */}
        <span
          aria-label={STATUS_LABEL[status]}
          title={STATUS_LABEL[status]}
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: STATUS_COLOR[status],
            border: '2px solid #0E1520',
            display: 'block',
          }}
        />
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '14px',
            color: 'hsl(var(--foreground))',
            lineHeight: 1.25,
          }}
        >
          {name}
        </p>

        {/* Role */}
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'hsl(var(--muted-foreground))',
            marginTop: 2,
          }}
        >
          {role}
        </p>

        {/* Email — mono */}
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'rgba(143,163,184,0.7)',
            marginTop: 4,
            wordBreak: 'break-all',
          }}
        >
          {email}
        </p>
      </div>
    </div>
  );
}
