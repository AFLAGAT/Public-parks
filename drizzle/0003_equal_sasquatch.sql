CREATE TYPE "public"."audit_actor_type" AS ENUM('resident', 'staff', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."authentication_client_type" AS ENUM('resident_mobile', 'super_admin_web', 'city_admin_web', 'gate_worker_mobile');--> statement-breakpoint
CREATE TYPE "public"."authentication_session_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."otp_challenge_status" AS ENUM('pending', 'consumed', 'invalidated', 'delivery_failed');--> statement-breakpoint
CREATE TYPE "public"."refresh_token_status" AS ENUM('active', 'rotated', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."sms_delivery_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sms_provider_scope_type" AS ENUM('platform', 'city');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" uuid,
	"action" varchar(120) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" uuid,
	"correlation_id" uuid,
	"request_ip_hash" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_audit_logs" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
DO $$
DECLARE
  current_month timestamptz := date_trunc('month', now());
  next_month timestamptz := current_month + interval '1 month';
  following_month timestamptz := current_month + interval '2 months';
BEGIN
  EXECUTE format(
    'CREATE TABLE audit_logs_%s PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    to_char(current_month, 'YYYY_MM'), current_month, next_month
  );
  EXECUTE format(
    'CREATE TABLE audit_logs_%s PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    to_char(next_month, 'YYYY_MM'), next_month, following_month
  );
END $$;
--> statement-breakpoint
CREATE TABLE "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;
--> statement-breakpoint
CREATE FUNCTION "reject_audit_log_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "trg_audit_logs__reject_mutation"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "reject_audit_log_mutation"();
--> statement-breakpoint
CREATE TRIGGER "trg_audit_logs__reject_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_log_mutation"();
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE "authentication_sessions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_type" "authentication_client_type" NOT NULL,
	"session_status" "authentication_session_status" DEFAULT 'active' NOT NULL,
	"device_name" varchar(120),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_authentication_sessions" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" varchar(16) NOT NULL,
	"code_digest" varchar(64) NOT NULL,
	"challenge_status" "otp_challenge_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_otp_challenges" PRIMARY KEY("id"),
	CONSTRAINT "chk_otp_challenges__attempt_count_range" CHECK ("otp_challenges"."attempt_count" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "password_credentials" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_password_credentials" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_permissions" PRIMARY KEY("id"),
	CONSTRAINT "chk_permissions__code_normalized" CHECK ("permissions"."code" ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$')
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"authentication_session_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"refresh_token_status" "refresh_token_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_refresh_tokens" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_role_permissions" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_roles" PRIMARY KEY("id"),
	CONSTRAINT "chk_roles__code_normalized" CHECK ("roles"."code" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "sms_delivery_attempts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"sms_provider_configuration_id" uuid NOT NULL,
	"provider_key" varchar(80) NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"destination_hash" varchar(64) NOT NULL,
	"delivery_status" "sms_delivery_status" NOT NULL,
	"provider_message_id" varchar(160),
	"error_code" varchar(80),
	"attempt_number" integer NOT NULL,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_sms_delivery_attempts" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "sms_provider_configurations" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "sms_provider_scope_type" DEFAULT 'platform' NOT NULL,
	"scope_id" uuid,
	"provider_key" varchar(80) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"api_url" text,
	"encrypted_credentials" jsonb NOT NULL,
	"sender_id" varchar(40),
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"retry_count" integer DEFAULT 1 NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_successful_test_revision" integer,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_sms_provider_configurations" PRIMARY KEY("id"),
	CONSTRAINT "chk_sms_provider_configurations__scope_shape" CHECK (("sms_provider_configurations"."scope_type" = 'platform' and "sms_provider_configurations"."scope_id" is null) or ("sms_provider_configurations"."scope_type" = 'city' and "sms_provider_configurations"."scope_id" is not null)),
	CONSTRAINT "chk_sms_provider_configurations__timeout_range" CHECK ("sms_provider_configurations"."timeout_ms" between 1000 and 30000),
	CONSTRAINT "chk_sms_provider_configurations__retry_range" CHECK ("sms_provider_configurations"."retry_count" between 0 and 3),
	CONSTRAINT "chk_sms_provider_configurations__revision_positive" CHECK ("sms_provider_configurations"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "sms_provider_tests" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"sms_provider_configuration_id" uuid NOT NULL,
	"configuration_revision" integer NOT NULL,
	"destination_hash" varchar(64) NOT NULL,
	"destination_masked" varchar(24) NOT NULL,
	"is_successful" boolean NOT NULL,
	"error_code" varchar(80),
	"duration_ms" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_sms_provider_tests" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "totp_factors" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_secret" jsonb NOT NULL,
	"last_accepted_time_step" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_totp_factors" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "totp_recovery_codes" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"totp_factor_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_totp_recovery_codes" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_user_roles" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "authentication_sessions" ADD CONSTRAINT "fk_authentication_sessions__user_id__users" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_credentials" ADD CONSTRAINT "fk_password_credentials__user_id__users" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_tokens__authentication_session_id__authentication_sessions" FOREIGN KEY ("authentication_session_id") REFERENCES "public"."authentication_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions__role_id__roles" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions__permission_id__permissions" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "fk_sms_delivery_attempts__sms_provider_configuration_id__sms_provider_configurations" FOREIGN KEY ("sms_provider_configuration_id") REFERENCES "public"."sms_provider_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_provider_configurations" ADD CONSTRAINT "fk_sms_provider_configurations__created_by_user_id__users" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_provider_configurations" ADD CONSTRAINT "fk_sms_provider_configurations__updated_by_user_id__users" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_provider_tests" ADD CONSTRAINT "fk_sms_provider_tests__sms_provider_configuration_id__sms_provider_configurations" FOREIGN KEY ("sms_provider_configuration_id") REFERENCES "public"."sms_provider_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_provider_tests" ADD CONSTRAINT "fk_sms_provider_tests__actor_user_id__users" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_factors" ADD CONSTRAINT "fk_totp_factors__user_id__users" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "fk_totp_recovery_codes__totp_factor_id__totp_factors" FOREIGN KEY ("totp_factor_id") REFERENCES "public"."totp_factors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles__user_id__users" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles__role_id__roles" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs__actor_id_created_at" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs__target_type_target_id_created_at" ON "audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_authentication_sessions__user_id_session_status" ON "authentication_sessions" USING btree ("user_id","session_status");--> statement-breakpoint
CREATE INDEX "idx_otp_challenges__phone_number_status_created_at" ON "otp_challenges" USING btree ("phone_number","challenge_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_password_credentials__user_id" ON "password_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_permissions__code" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_refresh_tokens__token_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens__authentication_session_id_status" ON "refresh_tokens" USING btree ("authentication_session_id","refresh_token_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_role_permissions__role_id_permission_id" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_roles__code" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_sms_delivery_attempts__configuration_created_at" ON "sms_delivery_attempts" USING btree ("sms_provider_configuration_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_sms_provider_configurations__scope_provider_revision" ON "sms_provider_configurations" USING btree ("scope_type",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid),"provider_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_sms_provider_configurations__active_scope" ON "sms_provider_configurations" USING btree ("scope_type",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "sms_provider_configurations"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_totp_factors__user_id" ON "totp_factors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_totp_recovery_codes__totp_factor_id_code_hash" ON "totp_recovery_codes" USING btree ("totp_factor_id","code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_user_roles__user_id_role_id" ON "user_roles" USING btree ("user_id","role_id");
--> statement-breakpoint
INSERT INTO "roles" ("id", "code", "name")
VALUES ('10000000-0000-4000-8000-000000000001', 'super_admin', 'Super Admin')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "name")
VALUES (
  '20000000-0000-4000-8000-000000000001',
  'sms_provider_configurations.manage',
  'Manage platform SMS provider configurations'
)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT
  '30000000-0000-4000-8000-000000000001',
  r."id",
  p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'super_admin'
  AND p."code" = 'sms_provider_configurations.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
