import { Pool } from 'pg';

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error('DB_RUNTIME_ROLE must be a normalized PostgreSQL role name.');
  }
  return `"${value}"`;
}

async function main(): Promise<void> {
  const connectionString = process.env.DB_PRIMARY_URL;
  const runtimeRole = process.env.DB_RUNTIME_ROLE;
  if (!connectionString || !runtimeRole) {
    throw new Error('DB_PRIMARY_URL and DB_RUNTIME_ROLE are required.');
  }
  const quotedRole = quoteIdentifier(runtimeRole);
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const ownerResult = await pool.query<{ owner_name: string }>(
      `SELECT pg_get_userbyid(relowner) AS owner_name
         FROM pg_class WHERE oid = 'audit_logs'::regclass`,
    );
    if (ownerResult.rows[0]?.owner_name === runtimeRole) {
      throw new Error(
        'DB_RUNTIME_ROLE cannot own audit_logs; use a separate migration owner.',
      );
    }
    await pool.query('BEGIN');
    try {
      await pool.query(`REVOKE ALL ON TABLE audit_logs FROM ${quotedRole}`);
      await pool.query(`GRANT SELECT, INSERT ON TABLE audit_logs TO ${quotedRole}`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Grant application failed.');
  process.exitCode = 1;
});
