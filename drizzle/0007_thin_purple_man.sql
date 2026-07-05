CREATE TYPE "public"."check_in_result" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."check_in_validation_source" AS ENUM('online', 'offline_sync');--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"validation_source" "check_in_validation_source" NOT NULL,
	"check_in_result" "check_in_result" NOT NULL,
	"rejection_reason" varchar(80),
	"scanned_at" timestamp with time zone NOT NULL,
	"scan_minute" timestamp with time zone NOT NULL,
	"sync_batch_id" uuid,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_check_ins" PRIMARY KEY("id","scan_minute"),
	CONSTRAINT "chk_check_ins__scan_minute_truncated" CHECK ("check_ins"."scan_minute" = date_trunc('minute', "check_ins"."scanned_at")),
	CONSTRAINT "chk_check_ins__rejection_reason_consistency" CHECK (("check_ins"."check_in_result" = 'accepted' and "check_ins"."rejection_reason" is null) or ("check_ins"."check_in_result" = 'rejected' and "check_ins"."rejection_reason" is not null))
) PARTITION BY RANGE ("scan_minute");
--> statement-breakpoint
DO $$
DECLARE
  current_month timestamptz := date_trunc('month', now());
  next_month timestamptz := current_month + interval '1 month';
  following_month timestamptz := current_month + interval '2 months';
BEGIN
  EXECUTE format(
    'CREATE TABLE check_ins_%s PARTITION OF check_ins FOR VALUES FROM (%L) TO (%L)',
    to_char(current_month, 'YYYY_MM'), current_month, next_month
  );
  EXECUTE format(
    'CREATE TABLE check_ins_%s PARTITION OF check_ins FOR VALUES FROM (%L) TO (%L)',
    to_char(next_month, 'YYYY_MM'), next_month, following_month
  );
END $$;
--> statement-breakpoint
CREATE TABLE "check_ins_default" PARTITION OF "check_ins" DEFAULT;
--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "fk_check_ins__qr_code_id__qr_codes" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "fk_check_ins__staff_user_id__users" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "fk_check_ins__facility_id__facilities" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_check_ins__idempotency" ON "check_ins" USING btree ("device_id","qr_code_id","scan_minute");--> statement-breakpoint
CREATE INDEX "idx_check_ins__facility_id_scan_minute" ON "check_ins" USING btree ("facility_id","scan_minute");--> statement-breakpoint
CREATE INDEX "idx_check_ins__qr_code_id" ON "check_ins" USING btree ("qr_code_id");