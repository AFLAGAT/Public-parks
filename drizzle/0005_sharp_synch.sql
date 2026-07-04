CREATE TYPE "public"."staff_assignment_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "staff_assignments" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"assignment_status" "staff_assignment_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_staff_assignments" PRIMARY KEY("id"),
	CONSTRAINT "chk_staff_assignments__time_range" CHECK ("staff_assignments"."ends_at" is null or "staff_assignments"."ends_at" > "staff_assignments"."starts_at"),
	CONSTRAINT "chk_staff_assignments__revocation_consistency" CHECK (("staff_assignments"."assignment_status" = 'active' and "staff_assignments"."revoked_at" is null and "staff_assignments"."revoked_by_user_id" is null) or ("staff_assignments"."assignment_status" = 'revoked' and "staff_assignments"."revoked_at" is not null and "staff_assignments"."revoked_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "fk_staff_assignments__user_id__users" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "fk_staff_assignments__facility_id__facilities" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "fk_staff_assignments__assigned_by_user_id__users" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "fk_staff_assignments__revoked_by_user_id__users" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_staff_assignments__user_facility__where_active" ON "staff_assignments" USING btree ("user_id","facility_id") WHERE "staff_assignments"."assignment_status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_staff_assignments__facility_id_assignment_status" ON "staff_assignments" USING btree ("facility_id","assignment_status");--> statement-breakpoint
CREATE INDEX "idx_staff_assignments__user_id_assignment_status" ON "staff_assignments" USING btree ("user_id","assignment_status");