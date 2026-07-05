CREATE TYPE "public"."payment_attempt_status" AS ENUM('initiated', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_payable_type" AS ENUM('slot_reservation', 'entrance_ticket', 'shared_participant_payment');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'initiated', 'provider_confirmed', 'verified', 'failed', 'expired', 'refunded', 'partially_refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."webhook_processing_status" AS ENUM('received', 'processed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."webhook_verification_result" AS ENUM('verified', 'signature_invalid', 'unrecognized', 'duplicate');--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider_key" varchar(80) NOT NULL,
	"merchant_reference" varchar(160) NOT NULL,
	"provider_transaction_id" varchar(160),
	"prepay_id" varchar(160),
	"amount" bigint NOT NULL,
	"attempt_status" "payment_attempt_status" DEFAULT 'initiated' NOT NULL,
	"failure_reason" varchar(120),
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_attempts" PRIMARY KEY("id"),
	CONSTRAINT "chk_payment_attempts__attempt_number_positive" CHECK ("payment_attempts"."attempt_number" >= 1),
	CONSTRAINT "chk_payment_attempts__amount_nonnegative" CHECK ("payment_attempts"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"payable_type" "payment_payable_type" NOT NULL,
	"payable_id" uuid NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"refunded_amount" bigint DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payments" PRIMARY KEY("id"),
	CONSTRAINT "chk_payments__amount_nonnegative" CHECK ("payments"."amount" >= 0),
	CONSTRAINT "chk_payments__refunded_amount_bounds" CHECK ("payments"."refunded_amount" >= 0 and "payments"."refunded_amount" <= "payments"."amount")
);
--> statement-breakpoint
CREATE TABLE "processed_provider_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" varchar(80) NOT NULL,
	"provider_event_id" varchar(160) NOT NULL,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_processed_provider_events" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" varchar(80) NOT NULL,
	"provider_event_id" varchar(160) NOT NULL,
	"normalized_idempotency_key" varchar(200) NOT NULL,
	"payment_attempt_id" uuid,
	"verification_result" "webhook_verification_result" NOT NULL,
	"processing_status" "webhook_processing_status" DEFAULT 'received' NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"correlation_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_webhook_events" PRIMARY KEY("id","received_at")
) PARTITION BY RANGE ("received_at");
--> statement-breakpoint
DO $$
DECLARE
  current_month timestamptz := date_trunc('month', now());
  next_month timestamptz := current_month + interval '1 month';
  following_month timestamptz := current_month + interval '2 months';
BEGIN
  EXECUTE format(
    'CREATE TABLE webhook_events_%s PARTITION OF webhook_events FOR VALUES FROM (%L) TO (%L)',
    to_char(current_month, 'YYYY_MM'), current_month, next_month
  );
  EXECUTE format(
    'CREATE TABLE webhook_events_%s PARTITION OF webhook_events FOR VALUES FROM (%L) TO (%L)',
    to_char(next_month, 'YYYY_MM'), next_month, following_month
  );
END $$;
--> statement-breakpoint
CREATE TABLE "webhook_events_default" PARTITION OF "webhook_events" DEFAULT;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "fk_payment_attempts__payment_id__payments" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments__payer_user_id__users" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "fk_webhook_events__payment_attempt_id__payment_attempts" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payment_attempts__merchant_reference" ON "payment_attempts" USING btree ("merchant_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payment_attempts__payment_id_attempt_number" ON "payment_attempts" USING btree ("payment_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payment_attempts__provider_transaction_id" ON "payment_attempts" USING btree ("provider_transaction_id") WHERE "payment_attempts"."provider_transaction_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payments__payable_type_payable_id" ON "payments" USING btree ("payable_type","payable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_processed_provider_events__provider_key_provider_event_id" ON "processed_provider_events" USING btree ("provider_key","provider_event_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_events__provider_event_id" ON "webhook_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_events__payment_attempt_id" ON "webhook_events" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE FUNCTION "reject_payment_core_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payable_type IS DISTINCT FROM OLD.payable_type
     OR NEW.payable_id IS DISTINCT FROM OLD.payable_id
     OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id THEN
    RAISE EXCEPTION 'payments core fields (amount, payable_type, payable_id, payer_user_id) are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "trg_payments__reject_core_mutation"
BEFORE UPDATE ON "payments"
FOR EACH ROW EXECUTE FUNCTION "reject_payment_core_mutation"();
--> statement-breakpoint
CREATE FUNCTION "reject_processed_provider_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'processed_provider_events are immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "trg_processed_provider_events__reject_mutation"
BEFORE UPDATE OR DELETE ON "processed_provider_events"
FOR EACH ROW EXECUTE FUNCTION "reject_processed_provider_event_mutation"();
--> statement-breakpoint
CREATE TRIGGER "trg_processed_provider_events__reject_truncate"
BEFORE TRUNCATE ON "processed_provider_events"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_processed_provider_event_mutation"();