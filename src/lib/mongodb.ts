/**
 * MongoDB client for audit logs and compliance documents.
 * Best practice: Connection pooling, graceful fallback when unavailable.
 */
import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.MONGODB_DB || "hwo_audit";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getMongoDb(): Promise<Db | null> {
  if (!MONGODB_URI) return null;
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      });
      await client.connect();
    }
    if (!db) db = client.db(DB_NAME);
    return db;
  } catch {
    return null;
  }
}

export async function closeMongoConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export const AUDIT_COLLECTION = "audit_logs";
export const COMPLIANCE_DOCS_COLLECTION = "compliance_documents";
