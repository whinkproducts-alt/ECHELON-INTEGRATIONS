// Source of truth: docs/security.md ("Victor must switch on in GitHub" and "Enforced in code"),
// last updated 2026-10-25. Wording follows that file. None of these can be verified from code,
// so the screen never shows them as done.
export interface ChecklistItem { id: string; title: string; why: string }

export const GITHUB_ACTIONS: ChecklistItem[] = [
  { id: '2fa', title: 'Two-factor authentication', why: 'Turn it on for your GitHub account and every collaborator. A hardware key or passkey is best. Without it, one stolen password gives someone write access to the code.' },
  { id: 'branch', title: 'Branch protection on main, with required reviews', why: 'Require a pull request and at least one approving review, require the security checks to pass, block force pushes, and allow no admin bypass. This is what stops an unreviewed change reaching main.' },
  { id: 'codeowners', title: 'Enforce code owner review', why: 'Require review from Code Owners in branch protection. It makes the CODEOWNERS file in the repo bite. Until then the file is only a suggestion.' },
  { id: 'push', title: 'Secret scanning and push protection', why: 'Settings, Code security: enable both. They stop a leaked key before it lands in history.' },
  { id: 'dependabot', title: 'Dependabot alerts and security updates', why: 'Enable both so the repo’s Dependabot config is used and vulnerable packages are flagged.' },
  { id: 'codeql', title: 'Code scanning', why: 'The CodeQL job uploads results only when code scanning is enabled for the repository.' },
  { id: 'signed', title: 'Signed commits', why: 'Require signed commits in branch protection, and set up commit signing (SSH or GPG) on each machine, so a commit can be tied to you.' },
  { id: 'gitleaks', title: 'GITLEAKS_LICENSE secret, if the repo belongs to an organisation', why: 'The gitleaks action needs one for organisations. Personal accounts do not.' },
  { id: 'owner', title: 'Confirm the CODEOWNERS account', why: 'CODEOWNERS names one GitHub account. Confirm it is the right one and that it has write access.' },
];

export const ENFORCED_IN_CODE: string[] = [
  'Every query is scoped by account, so one customer cannot read another’s data.',
  'Class C actions wait for an approval tied to an id, expire after 30 seconds, and are hash locked.',
  'Every action lands in one ledger, whether it ran, waited or was denied.',
  'Injected user messages never reach the model. External content is wrapped as untrusted.',
  'Security headers and a nonce based CSP are set on every response by the proxy.',
  'Cross-site request checks run on every state-changing API call.',
  'Rate limits on sign-in, sign-up, approvals, messages and imports (in memory, per process).',
  'Tokens are encrypted at rest and never returned in responses or ledger rows.',
  'Plugin manifests are validated only, behind a licence gate. Third-party tools are always Class C.',
];
