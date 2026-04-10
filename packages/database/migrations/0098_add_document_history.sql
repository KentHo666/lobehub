CREATE TABLE IF NOT EXISTS "document_histories" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"document_id" varchar(255) NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"storage_kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"base_version" integer,
	"save_source" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_histories" DROP CONSTRAINT IF EXISTS "document_histories_document_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "document_histories" ADD CONSTRAINT "document_histories_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_histories" DROP CONSTRAINT IF EXISTS "document_histories_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "document_histories" ADD CONSTRAINT "document_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_histories_document_id_version_unique" ON "document_histories" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_histories_document_id_saved_at_idx" ON "document_histories" USING btree ("document_id","saved_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_histories_user_id_saved_at_idx" ON "document_histories" USING btree ("user_id","saved_at");
