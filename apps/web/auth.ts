import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { applyLifetime, parseRemember, SESSION_TTL_REMEMBER_SECONDS } from '@/lib/auth/session-lifetime';
import { redeemLoginTicket } from '@/lib/passkeys/challenges';
import { getSessionVersion } from '@/lib/auth/session-version';

/** Emails are case-insensitive: exact lowercase match first, then a unique case-insensitive match for legacy rows. */
async function findUserByEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  const loose = await prisma.user.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, take: 2 });
  return loose.length === 1 ? loose[0] : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  trustHost: true,
  // maxAge is the ceiling; the real (shorter) limit for non-remembered sessions is enforced in the jwt callback.
  session: { strategy: 'jwt', maxAge: SESSION_TTL_REMEMBER_SECONDS },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        remember: { label: 'Remember me', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await findUserByEmail(credentials.email as string);
        if (!user?.passwordHash) return null;
        const isValid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!isValid) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, remember: parseRemember(credentials.remember), sessionVersion: user.sessionVersion };
      },
    }),
    // Accepts only a valid, unused, unexpired signed ticket minted by /api/auth/passkey/login/verify.
    CredentialsProvider({
      id: 'passkey',
      name: 'passkey',
      credentials: { ticket: { label: 'Ticket', type: 'text' } },
      async authorize(credentials) {
        const t = await redeemLoginTicket(credentials?.ticket);
        if (!t) return null;
        const user = await prisma.user.findUnique({ where: { id: t.userId } });
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, remember: t.remember, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion ?? 0;
      } else {
        // Credential added/removed or password changed since sign-in: signed out. Fail closed on errors.
        try {
          const current = await getSessionVersion(token.id as string);
          if (current === null || current !== ((token.sv as number | undefined) ?? 0)) return null;
        } catch {
          return null;
        }
      }
      // Absolute lifetime: 12 h, or 30 days when remembered. null = signed out.
      return applyLifetime(token, user ? { remember: user.remember === true } : null);
    },
    async session({ session, token }: any) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.remember = token.remember === true;
      }
      return session;
    },
  },
});
