CREATE TYPE "public"."entrance_ticket_status" AS ENUM('pending_payment', 'confirmed', 'partially_used', 'fully_used', 'canceled', 'expired', 'refunded', 'disputed');--> statement-breakpoint
CREATE TABLE "entrance_tickets" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"quantity" integer NOT NULL,
	"used_quantity" integer DEFAULT 0 NOT NULL,
	"entrance_ticket_status" "entrance_ticket_status" DEFAULT 'pending_payment' NOT NULL,
	"unit_price_at_booking" bigint NOT NULL,
	"total_amount_at_booking" bigint NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_entrance_tickets" PRIMARY KEY("id"),
	CONSTRAINT "chk_entrance_tickets__quantity_positive" CHECK ("entrance_tickets"."quantity" >= 1),
	CONSTRAINT "chk_entrance_tickets__used_quantity_bounds" CHECK ("entrance_tickets"."used_quantity" >= 0 and "entrance_tickets"."used_quantity" <= "entrance_tickets"."quantity"),
	CONSTRAINT "chk_entrance_tickets__unit_price_nonnegative" CHECK ("entrance_tickets"."unit_price_at_booking" >= 0),
	CONSTRAINT "chk_entrance_tickets__total_matches_quantity" CHECK ("entrance_tickets"."total_amount_at_booking" = "entrance_tickets"."unit_price_at_booking" * "entrance_tickets"."quantity")
);
--> statement-breakpoint
CREATE TABLE "facility_capacities" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"max_capacity" integer NOT NULL,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_facility_capacities" PRIMARY KEY("id"),
	CONSTRAINT "uq_facility_capacities__facility_id_service_date" UNIQUE("facility_id","service_date"),
	CONSTRAINT "chk_facility_capacities__max_capacity_nonnegative" CHECK ("facility_capacities"."max_capacity" >= 0),
	CONSTRAINT "chk_facility_capacities__sold_count_bounds" CHECK ("facility_capacities"."sold_count" >= 0 and "facility_capacities"."sold_count" <= "facility_capacities"."max_capacity")
);
--> statement-breakpoint
ALTER TABLE "entrance_tickets" ADD CONSTRAINT "fk_entrance_tickets__facility_id__facilities" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrance_tickets" ADD CONSTRAINT "fk_entrance_tickets__buyer_user_id__users" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrance_tickets" ADD CONSTRAINT "fk_entrance_tickets__facility_service_date__facility_capacities" FOREIGN KEY ("facility_id","visit_date") REFERENCES "public"."facility_capacities"("facility_id","service_date") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_capacities" ADD CONSTRAINT "fk_facility_capacities__facility_id__facilities" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entrance_tickets__facility_id_visit_date_status" ON "entrance_tickets" USING btree ("facility_id","visit_date","entrance_ticket_status");--> statement-breakpoint
CREATE INDEX "idx_entrance_tickets__buyer_user_id_visit_date" ON "entrance_tickets" USING btree ("buyer_user_id","visit_date");