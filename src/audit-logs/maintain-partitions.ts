import { Pool } from 'pg';

async function main(): Promise<void> {
  const connectionString = process.env.DB_PRIMARY_URL;
  if (!connectionString) throw new Error('DB_PRIMARY_URL is required.');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query(`
      DO $$
      DECLARE
        offset_month integer;
        month_start timestamptz;
        month_end timestamptz;
        partition_name text;
      BEGIN
        FOR offset_month IN 0..3 LOOP
          month_start := date_trunc('month', now()) + make_interval(months => offset_month);
          month_end := month_start + interval '1 month';
          partition_name := 'audit_logs_' || to_char(month_start, 'YYYY_MM');
          EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
            partition_name, month_start, month_end
          );
        END LOOP;
      END $$;
    `);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Partition maintenance failed.');
  process.exitCode = 1;
});
