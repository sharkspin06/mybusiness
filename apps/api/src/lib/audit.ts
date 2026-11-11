import type pg from 'pg';

export async function writeAudit(
  client: pg.PoolClient,
  e: { tenantId: string; userId: string | null; action: string; entityType: string; entityId: string; data?: unknown },
) {
  await client.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [e.tenantId, e.userId, e.action, e.entityType, e.entityId, JSON.stringify(e.data ?? {})],
  );
}
