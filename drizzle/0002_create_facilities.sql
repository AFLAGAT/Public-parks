CREATE TYPE "public"."facility_operational_classification" AS ENUM('slot_based', 'entrance_based');--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"facility_type_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"address" varchar(300) NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_facilities" PRIMARY KEY("id"),
	CONSTRAINT "chk_facilities__name_normalized" CHECK ("facilities"."name" = btrim("facilities"."name") and char_length("facilities"."name") > 0),
	CONSTRAINT "chk_facilities__address_normalized" CHECK ("facilities"."address" = btrim("facilities"."address") and char_length("facilities"."address") > 0),
	CONSTRAINT "chk_facilities__location_bounds" CHECK (ST_X("facilities"."location") between -180 and 180 and ST_Y("facilities"."location") between -90 and 90),
	CONSTRAINT "chk_facilities__location_srid" CHECK (ST_SRID("facilities"."location") = 4326)
);
--> statement-breakpoint
CREATE TABLE "facility_types" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"operational_classification" "facility_operational_classification" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_facility_types" PRIMARY KEY("id"),
	CONSTRAINT "chk_facility_types__code_normalized" CHECK ("facility_types"."code" ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'),
	CONSTRAINT "chk_facility_types__name_normalized" CHECK ("facility_types"."name" = btrim("facility_types"."name") and char_length("facility_types"."name") > 0)
);
--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "fk_facilities__facility_type_id__facility_types" FOREIGN KEY ("facility_type_id") REFERENCES "public"."facility_types"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_facilities__facility_type_id" ON "facilities" USING btree ("facility_type_id");--> statement-breakpoint
CREATE INDEX "idx_facilities__location_geography" ON "facilities" USING gist (("location"::geography));--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_facility_types__code" ON "facility_types" USING btree ("code");