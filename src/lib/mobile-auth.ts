import * as jose from "jose";

export interface MobileSession {
  userId: string;
  email: string;
  name: string;
}

export async function getMobileSession(req: Request): Promise<MobileSession | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const secret = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "fallback-secret-change-me"
  );

  try {
    const { payload } = await jose.jwtVerify(token, secret);
    const sub = payload.sub;
    if (!sub || typeof sub !== "string") return null;
    return {
      userId: sub,
      email: (payload.email as string) || "",
      name: (payload.name as string) || "",
    };
  } catch {
    return null;
  }
}
