CREATE TYPE "public"."comment_sentiment" AS ENUM('positive', 'negative', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('visible', 'shadowbanned');--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "status" "comment_status" DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "sentiment" "comment_sentiment" DEFAULT 'neutral' NOT NULL;