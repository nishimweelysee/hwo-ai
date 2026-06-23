import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 hours
  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/register",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        organization: { label: "Organization", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.password) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        const org = credentials.organization || user.organization;
        if (org && org !== user.organization) {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date(), organization: org },
          });
        } else {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          organization: (org || user.organization) ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.organization = (user as { organization?: string }).organization;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { organization?: string }).organization = token.organization as string;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      try {
        if (user?.id) {
          const { createAuditLog } = await import("./audit-service");
          await createAuditLog({
            userId: user.id,
            userEmail: user.email ?? undefined,
            action: "Signed in",
            type: "login",
            resource: "auth",
          });
        }
      } catch {
        // Don't block sign-in if audit fails
      }
    },
  },
};
