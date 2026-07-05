import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  paymentAttempts,
  payments,
  processedProviderEvents,
  webhookEvents,
} from './drizzle.schema';

describe('payments schema', () => {
  const tableConfig = getTableConfig(payments);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, index, and constraint names', () => {
    expect(tableConfig.name).toBe('payments');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual(['pk_payments']);
    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual([
      'uidx_payments__payable_type_payable_id',
    ]);
    expect(tableConfig.foreignKeys.map((fk) => fk.getName())).toEqual([
      'fk_payments__payer_user_id__users',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_payments__amount_nonnegative',
      'chk_payments__refunded_amount_bounds',
    ]);
  });

  it('references the payable polymorphically, without a foreign key', () => {
    expect(columnNames).toEqual([
      'id',
      'payable_type',
      'payable_id',
      'payer_user_id',
      'amount',
      'refunded_amount',
      'payment_status',
      'expires_at',
      'verified_at',
      'created_at',
      'updated_at',
    ]);
    // Only the payer FK exists; payable_type/payable_id are not foreign keys.
    expect(tableConfig.foreignKeys).toHaveLength(1);
  });
});

describe('payment_attempts schema', () => {
  const tableConfig = getTableConfig(paymentAttempts);

  it('uses the canonical names and unique provider references', () => {
    expect(tableConfig.name).toBe('payment_attempts');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_payment_attempts',
    ]);
    expect(tableConfig.indexes.map((index) => index.config.name).sort()).toEqual([
      'uidx_payment_attempts__merchant_reference',
      'uidx_payment_attempts__payment_id_attempt_number',
      'uidx_payment_attempts__provider_transaction_id',
    ]);
    expect(tableConfig.foreignKeys.map((fk) => fk.getName())).toEqual([
      'fk_payment_attempts__payment_id__payments',
    ]);
  });

  it('keeps provider_transaction_id unique only when present', () => {
    const providerTxIndex = tableConfig.indexes.find(
      (index) =>
        index.config.name === 'uidx_payment_attempts__provider_transaction_id',
    );
    expect(providerTxIndex?.config.unique).toBe(true);
    expect(providerTxIndex?.config.where).toBeDefined();
  });
});

describe('webhook_events schema', () => {
  const tableConfig = getTableConfig(webhookEvents);

  it('uses the canonical names and a partition-key-inclusive primary key', () => {
    expect(tableConfig.name).toBe('webhook_events');
    const primaryKey = tableConfig.primaryKeys[0];
    expect(primaryKey?.getName()).toBe('pk_webhook_events');
    expect(primaryKey?.columns.map((column) => column.name)).toEqual([
      'id',
      'received_at',
    ]);
    // No unique on the partitioned table; dedup lives in processed_provider_events.
    const uniqueIndexes = tableConfig.indexes.filter((index) => index.config.unique);
    expect(uniqueIndexes).toHaveLength(0);
  });
});

describe('processed_provider_events schema', () => {
  const tableConfig = getTableConfig(processedProviderEvents);

  it('is the provider-agnostic dedup ledger with a global unique key', () => {
    expect(tableConfig.name).toBe('processed_provider_events');
    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual([
      'uidx_processed_provider_events__provider_key_provider_event_id',
    ]);
    const dedupIndex = tableConfig.indexes[0];
    expect(dedupIndex?.config.unique).toBe(true);
    expect(dedupIndex?.config.columns.map((column) =>
      'name' in column ? column.name : undefined,
    )).toEqual(['provider_key', 'provider_event_id']);
  });
});
