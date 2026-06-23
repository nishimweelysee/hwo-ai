/**
 * Audit service: dual-write to MongoDB (primary) and Prisma (fallback).
 * Best practice: Structured audit events, retention support, document storage.
 */
import { getMongoDb, AUDIT_COLLECTION } from "./mongodb";
import { prisma } from "./prisma";

export interface AuditEvent {
  userId?: string;
  userEmail?: string;
  action: string;
  type: "read" | "write" | "export" | "approve" | "import" | "login" | "config";
  resource?: string;
  details?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(event: AuditEvent): Promise<void> {
  const data = {
    userId: event.userId,
    userEmail: event.userEmail,
    action: event.action,
    type: event.type,
    resource: event.resource,
    details: event.details,
    ipAddress: event.ipAddress,
    metadata: event.metadata,
    createdAt: new Date(),
  };

  // Primary: MongoDB (when available)
  const mongo = await getMongoDb();
  if (mongo) {
    try {
      await mongo.collection(AUDIT_COLLECTION).insertOne(data);
    } catch {
      // Fall through to Prisma on MongoDB failure
    }
  }

  // Fallback: Prisma (SQLite/PostgreSQL)
  try {
    await prisma.auditLog.create({
      data: {
        userId: event.userId ?? null,
        action: event.action,
        type: event.type,
        resource: event.resource ?? null,
        details: event.details ?? null,
        ipAddress: event.ipAddress ?? null,
      },
    });
  } catch {
    // Log to console in dev if both fail
    if (process.env.NODE_ENV === "development") {
      console.warn("[Audit] Failed to persist:", event);
    }
  }
}

export async function getAuditLogsFromMongo(options: {
  type?: string;
  userId?: string;
  limit?: number;
  since?: Date;
}): Promise<Array<Record<string, unknown>>> {
  const mongo = await getMongoDb();
  if (!mongo) return [];

  const filter: Record<string, unknown> = {};
  if (options.type) filter.type = options.type;
  if (options.userId) filter.userId = options.userId;
  if (options.since) filter.createdAt = { $gte: options.since };

  const cursor = mongo
    .collection(AUDIT_COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit ?? 50);

  return cursor.toArray();
}
