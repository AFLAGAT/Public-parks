CREATE TYPE "public"."qr_code_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."qr_scannable_type" AS ENUM('slot_reservation', 'entrance_ticket');--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"scannable_type" "qr_scannable_type" NOT NULL,
	"scannable_id" uuid NOT NULL,
	"qr_code_status" "qr_code_status" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_qr_codes" PRIMARY KEY("id"),
	CONSTRAINT "chk_qr_codes__revocation_consistency" CHECK (("qr_codes"."qr_code_status" = 'active' and "qr_codes"."revoked_at" is null) or ("qr_codes"."qr_code_status" = 'revoked' and "qr_codes"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_qr_codes__scannable__where_active" ON "qr_codes" USING btree ("scannable_type","scannable_id") WHERE "qr_codes"."qr_code_status" = 'active';