/**
 * Password policy. Signup has no server-side rule beyond "present" (the form sets minLength 6),
 * so this is the single server policy; password reset enforces it. bcrypt only reads the first
 * 72 bytes, so longer input is refused rather than silently truncated.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;

export function isStrongEnough(password: unknown): password is string {
  if (typeof password !== 'string') return false;
  if (password.length < PASSWORD_MIN) return false;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return false;
  return true;
}
