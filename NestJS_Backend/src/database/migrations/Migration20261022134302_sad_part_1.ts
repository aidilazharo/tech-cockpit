import { Migration } from '@mikro-orm/migrations';

export class Migration20261022134302_sad_part_1 extends Migration {

  override name = 'Migration20261022134302_sad_part_1';

  override up(): void | Promise<void> {
    this.addSql(`create table "sad_retention_standard" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "position" int not null, "service_type" varchar(200) not null, "data_type" varchar(200) not null, "yearly" varchar(50) not null, "monthly" varchar(50) not null, "weekly" varchar(50) not null, "daily" varchar(50) not null, "comment" text null, "active" boolean not null default true, primary key ("id"));`);

    this.addSql(`create table "sad_document" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "application_id" uuid not null, "last_number" int not null default 0, primary key ("id"));`);
    this.addSql(`alter table "sad_document" add constraint "sad_document_application_id_unique" unique ("application_id");`);

    this.addSql(`create table "sad_version" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "document_id" uuid not null, "status" text not null, "number" int null, "template_version" int not null, "trm_snapshot" jsonb null, "started_by_id" uuid not null, "submitted_by_id" uuid null, "submitted_at" timestamptz null, "approved_at" timestamptz null, "cancelled_at" timestamptz null, "approval_instance_id" uuid null, primary key ("id"));`);
    this.addSql(`create index "sad_version_document_id_index" on "sad_version" ("document_id");`);
    this.addSql(`create index "sad_version_status_index" on "sad_version" ("status");`);

    this.addSql(`create table "sad_section" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sad_version_id" uuid not null, "section" text not null, "answers" jsonb not null, primary key ("id"));`);
    this.addSql(`create index "sad_section_sad_version_id_index" on "sad_section" ("sad_version_id");`);
    this.addSql(`alter table "sad_section" add constraint "sad_section_sad_version_id_section_unique" unique ("sad_version_id", "section");`);

    this.addSql(`create table "sad_api" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "application_id" uuid not null, "sad_version_id" uuid not null, "position" int not null, "name" text not null, "description" text null, "api_owner" jsonb null, "business_owner" jsonb null, "environment" text null, "url" text null, "auth_method" text null, "hosting" text null, "third_party" boolean null, "classification" text null, "data" text null, "dependencies" jsonb null, "priority" text null, "justification" text null, primary key ("id"));`);
    this.addSql(`create index "sad_api_application_id_index" on "sad_api" ("application_id");`);
    this.addSql(`create index "sad_api_sad_version_id_index" on "sad_api" ("sad_version_id");`);
    this.addSql(`create index "sad_api_environment_index" on "sad_api" ("environment");`);
    this.addSql(`create index "sad_api_classification_index" on "sad_api" ("classification");`);
    this.addSql(`create index "sad_api_priority_index" on "sad_api" ("priority");`);

    this.addSql(`alter table "sad_document" add constraint "sad_document_application_id_foreign" foreign key ("application_id") references "trm_application" ("id") on delete cascade;`);

    this.addSql(`alter table "sad_version" add constraint "sad_version_document_id_foreign" foreign key ("document_id") references "sad_document" ("id") on delete cascade;`);
    this.addSql(`alter table "sad_version" add constraint "sad_version_started_by_id_foreign" foreign key ("started_by_id") references "app_user" ("id");`);
    this.addSql(`alter table "sad_version" add constraint "sad_version_submitted_by_id_foreign" foreign key ("submitted_by_id") references "app_user" ("id") on delete set null;`);
    this.addSql(`alter table "sad_version" add constraint "sad_version_status_check" check ("status" in ('draft', 'in_approval', 'current', 'superseded', 'cancelled'));`);

    this.addSql(`alter table "sad_section" add constraint "sad_section_sad_version_id_foreign" foreign key ("sad_version_id") references "sad_version" ("id") on delete cascade;`);
    this.addSql(`alter table "sad_section" add constraint "sad_section_section_check" check ("section" in ('application-details', 'solution-integration', 'network', 'resiliency', 'security-design', 'api-inventory', 'data-protection', 'security-iam', 'data-architecture', 'deployment', 'environment', 'logging', 'backup'));`);

    this.addSql(`alter table "sad_api" add constraint "sad_api_application_id_foreign" foreign key ("application_id") references "trm_application" ("id") on delete cascade;`);
    this.addSql(`alter table "sad_api" add constraint "sad_api_sad_version_id_foreign" foreign key ("sad_version_id") references "sad_version" ("id") on delete cascade;`);
    // One open draft and one current version per application (the services also lock the document).
    this.addSql(`create unique index "sad_version_one_open" on "sad_version" ("document_id") where "status" in ('draft', 'in_approval');`);
    this.addSql(`create unique index "sad_version_one_current" on "sad_version" ("document_id") where "status" = 'current';`);

    // AIA's standard backup retention rows, from the SAD template (system admins maintain them).
    this.addSql(`insert into "sad_retention_standard" ("id", "created_at", "updated_at", "version", "position", "service_type", "data_type", "yearly", "monthly", "weekly", "daily", "comment", "active") values
      (gen_random_uuid(), now(), now(), 1, 1, 'Database - MsSQL on VM', 'Financial Transaction', '8 Years', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 2, 'Database - MsSQL on VM', 'Others with Business Data', '3 Years', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 3, 'Database - MsSQL on VM', 'Others', '-', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 4, 'Database - SQL Managed Instance', 'Financial Transaction', '8 Years', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 5, 'Database - SQL Managed Instance', 'Others with Business Data', '3 Years', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 6, 'Database - SQL Managed Instance', 'Others', '-', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 7, 'Storage Account - Blob Container', 'Financial Transactions', '8 Years', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 8, 'Storage Account - Blob Container', 'Audit Logs', '3 Years', '12 months', '5 weeks', '7 days', null, true),
      (gen_random_uuid(), now(), now(), 1, 9, 'Storage Account - Blob Container', 'Others Business data', '-', '12 months', '5 weeks', '7 days', 'Backup or soft delete retention of 365 days is acceptable.', true),
      (gen_random_uuid(), now(), now(), 1, 10, 'Storage Account - Blob Container', 'Non-business data', '-', '-', '-', '-', '7 days soft delete', true);`);

    // Per-section SAD access replaces the "SAD security sections" data class (product owner, 2026-10-22).
    this.addSql(`update "role" set "data_access" = "data_access" - 'sadSecurity';`);

    // New scoped roles (assigned per application or portfolio), confirmed 2026-10-22. Authors follow and
    // resubmit their SAD approvals; the application manager approves (same approval rights as other approver roles).
    this.addSql(`insert into "role" ("id", "created_at", "updated_at", "version", "code", "name", "description", "is_system", "is_system_admin", "permissions", "data_access") values
      (gen_random_uuid(), now(), now(), 1, 'application-lead', 'Application lead', 'Assigned per application: writes and submits the SAD.', true, false, '{sad:application-details:read,sad:solution-integration:read,sad:network:read,sad:resiliency:read,sad:security-design:read,sad:api-inventory:read,sad:data-protection:read,sad:security-iam:read,sad:data-architecture:read,sad:deployment:read,sad:environment:read,sad:logging:read,sad:backup:read,sad:application-details:update,sad:solution-integration:update,sad:network:update,sad:resiliency:update,sad:security-design:update,sad:api-inventory:update,sad:data-protection:update,sad:security-iam:update,sad:data-architecture:update,sad:deployment:update,sad:environment:update,sad:logging:update,sad:backup:update,approvals:instance:read}'::text[], '{"financial": "none", "contract": "none", "personal": "scope"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'developer', 'Developer', 'Assigned per application: writes and submits the SAD.', true, false, '{sad:application-details:read,sad:solution-integration:read,sad:network:read,sad:resiliency:read,sad:security-design:read,sad:api-inventory:read,sad:data-protection:read,sad:security-iam:read,sad:data-architecture:read,sad:deployment:read,sad:environment:read,sad:logging:read,sad:backup:read,sad:application-details:update,sad:solution-integration:update,sad:network:update,sad:resiliency:update,sad:security-design:update,sad:api-inventory:update,sad:data-protection:update,sad:security-iam:update,sad:data-architecture:update,sad:deployment:update,sad:environment:update,sad:logging:update,sad:backup:update,approvals:instance:read}'::text[], '{"financial": "none", "contract": "none", "personal": "scope"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'application-manager', 'Application manager', 'Assigned per application: first approver of SAD versions.', true, false, '{sad:application-details:read,sad:solution-integration:read,sad:network:read,sad:resiliency:read,sad:security-design:read,sad:api-inventory:read,sad:data-protection:read,sad:security-iam:read,sad:data-architecture:read,sad:deployment:read,sad:environment:read,sad:logging:read,sad:backup:read,sad:application-details:update,sad:solution-integration:update,sad:network:update,sad:resiliency:update,sad:security-design:update,sad:api-inventory:update,sad:data-protection:update,sad:security-iam:update,sad:data-architecture:update,sad:deployment:update,sad:environment:update,sad:logging:update,sad:backup:update,approvals:delegation:manage,approvals:instance:read,approvals:task:act}'::text[], '{"financial": "none", "contract": "none", "personal": "scope"}'::jsonb)
      on conflict ("code") do nothing;`);

    // Seeded section access, confirmed 2026-10-22. Additive only: roles an admin changed keep the rest.
    this.addSql(`update "role" set "permissions" = array(select distinct unnest("permissions" || array['sad:application-details:read', 'sad:solution-integration:read', 'sad:network:read', 'sad:resiliency:read', 'sad:security-design:read', 'sad:api-inventory:read', 'sad:data-protection:read', 'sad:security-iam:read', 'sad:data-architecture:read', 'sad:deployment:read', 'sad:environment:read', 'sad:logging:read', 'sad:backup:read', 'sad:application-details:update', 'sad:solution-integration:update', 'sad:network:update', 'sad:resiliency:update', 'sad:security-design:update', 'sad:api-inventory:update', 'sad:data-protection:update', 'sad:security-iam:update', 'sad:data-architecture:update', 'sad:deployment:update', 'sad:environment:update', 'sad:logging:update', 'sad:backup:update']::text[]) order by 1) where "code" = 'solution-architect';`);
    this.addSql(`update "role" set "permissions" = array(select distinct unnest("permissions" || array['sad:application-details:read', 'sad:solution-integration:read', 'sad:network:read', 'sad:resiliency:read', 'sad:security-design:read', 'sad:api-inventory:read', 'sad:data-protection:read', 'sad:security-iam:read', 'sad:data-architecture:read', 'sad:deployment:read', 'sad:environment:read', 'sad:logging:read', 'sad:backup:read']::text[]) order by 1) where "code" in ('enterprise-architect', 'arb-member', 'arb-chair', 'application-owner-team');`);
    this.addSql(`update "role" set "permissions" = array(select distinct unnest("permissions" || array['sad:application-details:read', 'sad:solution-integration:read', 'sad:resiliency:read', 'sad:deployment:read', 'sad:environment:read', 'sad:backup:read']::text[]) order by 1) where "code" in ('portfolio-lead', 'product-manager', 'pmo', 'tech-exco');`);

    // SAD versions: application manager, then solution architect, both within the application's scope.
    this.addSql(`insert into "approval_rule_set" ("id", "created_at", "updated_at", "version", "workflow_code", "rule_version", "status", "definition", "published_at") values
      (gen_random_uuid(), now(), now(), 1, 'sad-version', 1, 'published', '{"rules": [{"key": "sad-version", "name": "SAD version", "priority": 10, "when": null, "steps": [{"key": "application-manager", "name": "Application manager", "approvers": [{"kind": "role", "roleCode": "application-manager", "scope": "subject"}], "quorum": "any", "reReview": "all"}, {"key": "solution-architect", "name": "Solution architect", "approvers": [{"kind": "role", "roleCode": "solution-architect", "scope": "subject"}], "quorum": "any", "reReview": "all"}]}]}'::jsonb, now())
      on conflict do nothing;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "approval_rule_set" where "workflow_code" = 'sad-version';`);
    this.addSql(`delete from "role" where "code" in ('application-lead', 'developer', 'application-manager');`);
    this.addSql(`update "role" set "permissions" = array(select p from unnest("permissions") as p where p not like 'sad:%' order by 1);`);
    this.addSql(`update "role" set "data_access" = "data_access" || '{"sadSecurity": "none"}'::jsonb;`);

    this.addSql(`alter table "sad_version" drop constraint "sad_version_document_id_foreign";`);
    this.addSql(`alter table "sad_section" drop constraint "sad_section_sad_version_id_foreign";`);
    this.addSql(`alter table "sad_api" drop constraint "sad_api_sad_version_id_foreign";`);

    this.addSql(`drop table if exists "sad_retention_standard" cascade;`);
    this.addSql(`drop table if exists "sad_document" cascade;`);
    this.addSql(`drop table if exists "sad_version" cascade;`);
    this.addSql(`drop table if exists "sad_section" cascade;`);
    this.addSql(`drop table if exists "sad_api" cascade;`);
  }

}
