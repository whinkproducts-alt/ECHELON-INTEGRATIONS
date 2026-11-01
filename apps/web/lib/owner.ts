/**
 * Operator ("owner") accounts. Operator-wide facts (the board roster, which operator
 * credentials such as SMTP or Twilio are configured) are visible only to these accounts.
 *
 * WHINK_OWNER_EMAILS is a comma-separated list, matched case-insensitively and exactly
 * (no domain wildcards). If it is unset, nobody is an owner: there is no "first user wins"
 * rule in this codebase and the User.role column is not trusted for this, so the safe default is deny.
 */
export function ownerEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.WHINK_OWNER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOwnerEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  return ownerEmails(env).has(email.trim().toLowerCase());
}
