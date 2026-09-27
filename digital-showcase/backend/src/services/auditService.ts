import { getDb } from "../database/db.js";
import type { AuditEntry } from "../types/models.js";

export type AuditAction =
  | "STORE_CONNECTED"
  | "PAYMENT_ACCEPTED"
  | "PAYMENT_CANCELLED"
  | "SUBSCRIPTION_CHANGED"
  | "PLAN_CHANGED"
  | "IMPERSONATION_STARTED"
  | "ACTION_AS_OWNER"
  | "OWNER_PASSWORD_SET"
  | "OWNER_DELETED"
  | "STORE_DELETED"
  | "BACKUP_STARTED";

export interface AuditTarget {
  type: "store" | "owner" | "payment";
  id: string;
  name?: string | null;
}

/** Records who did what. Never fails the request it describes. */
export async function logAction(actorId: string | null, action: AuditAction, target?: AuditTarget, details?: string) {
  try {
    const db = await getDb();
    const actor = actorId ? await db.get<{ name: string }>("SELECT name FROM users WHERE id = ?", actorId) : undefined;
    const ownerName = target?.type === "owner" && !target.name ? (await db.get<{ name: string }>("SELECT name FROM users WHERE id = ?", target.id))?.name : undefined;
    await db.run(
      "INSERT INTO audit_log (id, actorId, actorName, action, targetType, targetId, targetName, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      actorId,
      actor?.name ?? "Система",
      action,
      target?.type ?? null,
      target?.id ?? null,
      target?.name ?? ownerName ?? null,
      details ?? null,
      new Date().toISOString()
    );
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}

export async function listActions(limit = 200) {
  const db = await getDb();
  return db.all<AuditEntry>("SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT ?", limit);
}
