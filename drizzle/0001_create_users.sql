CREATE TABLE "users" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" varchar(16),
	"email" varchar(254),
	"phone_number_verified_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_users" PRIMARY KEY("id"),
	CONSTRAINT "chk_users__identity_channel_present" CHECK ("users"."phone_number" is not null or "users"."email" is not null),
	CONSTRAINT "chk_users__phone_number_e164" CHECK ("users"."phone_number" is null or "users"."phone_number" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "chk_users__email_normalized" CHECK ("users"."email" is null or ("users"."email" = lower(btrim("users"."email")) and char_length("users"."email") between 3 and 254 and position('@' in "users"."email") > 1)),
	CONSTRAINT "chk_users__phone_verification_has_phone_number" CHECK ("users"."phone_number_verified_at" is null or "users"."phone_number" is not null),
	CONSTRAINT "chk_users__email_verification_has_email" CHECK ("users"."email_verified_at" is null or "users"."email" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_users__phone_number" ON "users" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_users__email" ON "users" USING btree ("email");