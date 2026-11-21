import { Migration } from '@mikro-orm/migrations';

export class Migration20261022060332_trm_and_portfolios extends Migration {

  override name = 'Migration20261022060332_trm_and_portfolios';

  override up(): void | Promise<void> {
    this.addSql(`create table "portfolio" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "name" varchar(200) not null, "active" boolean not null default true, primary key ("id"));`);
    this.addSql(`alter table "portfolio" add constraint "portfolio_name_unique" unique ("name");`);

    this.addSql(`create table "trm_capability" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sn_sys_id" varchar(32) not null, "source" jsonb not null, "content_hash" varchar(64) not null, "missing_since" timestamptz null, "last_sync_run_id" uuid null, "name" text null, "parent_name" text null, "description" text null, "operational_status" text null, "parent_id" uuid null, "level" smallint null, primary key ("id"));`);
    this.addSql(`alter table "trm_capability" add constraint "trm_capability_sn_sys_id_unique" unique ("sn_sys_id");`);

    this.addSql(`create table "trm_application" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sn_sys_id" varchar(32) not null, "source" jsonb not null, "content_hash" varchar(64) not null, "missing_since" timestamptz null, "last_sync_run_id" uuid null, "number" text null, "name" text null, "display_name" text null, "short_name" text null, "description" text null, "install_status" text null, "operational_status" text null, "record_status" text null, "install_type" text null, "group_or_local" text null, "business_unit" text null, "owned_business_unit" text null, "serving_business_units" text null, "criticality_rating" text null, "bcm_criticality" text null, "rto" text null, "rpo" text null, "recovery_time_capability" text null, "capability_group_name" text null, "capability_family_name" text null, "capability_category_name" text null, "it_application_owner" text null, "application_lead" text null, "application_manager" text null, "licence_cost" numeric(15,2) null, "internal_support_cost" numeric(15,2) null, "external_support_cost" numeric(15,2) null, "infra_on_premises_cost" numeric(15,2) null, "infra_cloud_cost" numeric(15,2) null, "sn_updated_on" text null, "capability_id" uuid null, "capability_mismatch" boolean not null default false, "time_rating" text null, "time_rationale" text null, "functional_fit" smallint null, "technical_fit" smallint null, "planned_go_live" date null, "planned_phase_out" date null, "planned_retirement" date null, "vendor_end_of_support" date null, primary key ("id"));`);
    this.addSql(`alter table "trm_application" add constraint "trm_application_sn_sys_id_unique" unique ("sn_sys_id");`);

    this.addSql(`create table "trm_application_portfolio" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "application_id" uuid not null, "portfolio_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "trm_application_portfolio_application_id_index" on "trm_application_portfolio" ("application_id");`);
    this.addSql(`create index "trm_application_portfolio_portfolio_id_index" on "trm_application_portfolio" ("portfolio_id");`);
    this.addSql(`alter table "trm_application_portfolio" add constraint "trm_application_portfolio_application_id_portfolio_id_unique" unique ("application_id", "portfolio_id");`);

    this.addSql(`create table "trm_product_standard" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sn_sys_id" varchar(32) not null, "source" jsonb not null, "content_hash" varchar(64) not null, "missing_since" timestamptz null, "last_sync_run_id" uuid null, "name" text null, "product" text null, "manufacturer" text null, "status" text null, "standard_category" text null, "functional_category" text null, "product_type" text null, "description" text null, "cloud_service_type" text null, "vm_on_premises" text null, "vm_cloud" text null, "container_on_premises" text null, "container_cloud" text null, "allowed_on_desktop" text null, "ai_controls" text null, "remarks" text null, "last_status_date" text null, "added_date" text null, "assessment_link" text null, primary key ("id"));`);
    this.addSql(`alter table "trm_product_standard" add constraint "trm_product_standard_sn_sys_id_unique" unique ("sn_sys_id");`);

    this.addSql(`create table "trm_server" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "name" varchar(255) not null, "missing_since" timestamptz null, "last_sync_run_id" uuid null, primary key ("id"));`);
    this.addSql(`alter table "trm_server" add constraint "trm_server_name_unique" unique ("name");`);

    this.addSql(`create table "trm_service" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sn_sys_id" varchar(32) not null, "source" jsonb not null, "content_hash" varchar(64) not null, "missing_since" timestamptz null, "last_sync_run_id" uuid null, "kind" text not null, "number" text null, "name" text null, "display_name" text null, "description" text null, "operational_status" text null, "environment" text null, "used_for" text null, "service_classification" text null, "portfolio_status" text null, "business_criticality" text null, "data_classification" text null, "customer_pii_data" text null, "credit_card_data" text null, "healthcare_data" text null, "price_sensitive_data" text null, "network_facing" text null, "rto" text null, "rpo" text null, "application_security_rating" text null, "hosting_provider" text null, "owned_business_unit" text null, "owned_by" text null, "sn_updated_on" text null, primary key ("id"));`);
    this.addSql(`alter table "trm_service" add constraint "trm_service_sn_sys_id_unique" unique ("sn_sys_id");`);
    this.addSql(`create index "trm_service_kind_index" on "trm_service" ("kind");`);

    this.addSql(`create table "trm_application_service" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "application_id" uuid not null, "service_id" uuid not null, "link_source" text not null, primary key ("id"));`);
    this.addSql(`create index "trm_application_service_application_id_index" on "trm_application_service" ("application_id");`);
    this.addSql(`create index "trm_application_service_service_id_index" on "trm_application_service" ("service_id");`);
    this.addSql(`alter table "trm_application_service" add constraint "trm_application_service_application_id_service_id_8f7e1_unique" unique ("application_id", "service_id", "link_source");`);

    this.addSql(`create table "trm_service_dependency" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "service_id" uuid not null, "business_service_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "trm_service_dependency_service_id_index" on "trm_service_dependency" ("service_id");`);
    this.addSql(`create index "trm_service_dependency_business_service_id_index" on "trm_service_dependency" ("business_service_id");`);
    this.addSql(`alter table "trm_service_dependency" add constraint "trm_service_dependency_service_id_business_service_id_unique" unique ("service_id", "business_service_id");`);

    this.addSql(`create table "trm_service_server" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "service_id" uuid not null, "server_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "trm_service_server_service_id_index" on "trm_service_server" ("service_id");`);
    this.addSql(`create index "trm_service_server_server_id_index" on "trm_service_server" ("server_id");`);
    this.addSql(`alter table "trm_service_server" add constraint "trm_service_server_service_id_server_id_unique" unique ("service_id", "server_id");`);

    this.addSql(`create table "trm_software_model" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sn_sys_id" varchar(32) not null, "source" jsonb not null, "content_hash" varchar(64) not null, "missing_since" timestamptz null, "last_sync_run_id" uuid null, "name" text null, "product" text null, "product_version" text null, "manufacturer" text null, "product_type" text null, "model_category" text null, "product_standard_name" text null, "product_standard_id" uuid null, primary key ("id"));`);
    this.addSql(`alter table "trm_software_model" add constraint "trm_software_model_sn_sys_id_unique" unique ("sn_sys_id");`);

    this.addSql(`create table "trm_service_software" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sn_sys_id" varchar(32) not null, "service_id" uuid not null, "software_model_id" uuid not null, "full_version" text null, "primary_model" boolean not null default false, primary key ("id"));`);
    this.addSql(`alter table "trm_service_software" add constraint "trm_service_software_sn_sys_id_unique" unique ("sn_sys_id");`);
    this.addSql(`create index "trm_service_software_service_id_index" on "trm_service_software" ("service_id");`);
    this.addSql(`create index "trm_service_software_software_model_id_index" on "trm_service_software" ("software_model_id");`);

    this.addSql(`create table "trm_sync_run" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "started_by_id" uuid not null, "status" text not null, "dry_run" boolean not null default false, "received" jsonb not null, "completed_at" timestamptz null, "report" jsonb null, "error" text null, primary key ("id"));`);
    this.addSql(`create index "trm_sync_run_started_by_id_index" on "trm_sync_run" ("started_by_id");`);
    this.addSql(`create index "trm_sync_run_status_index" on "trm_sync_run" ("status");`);

    this.addSql(`create table "trm_sync_record" ("id" bigserial primary key, "run_id" uuid not null, "file" text not null, "position" int not null, "payload" jsonb not null);`);
    this.addSql(`create index "trm_sync_record_run_id_file_position_index" on "trm_sync_record" ("run_id", "file", "position");`);

    this.addSql(`alter table "trm_capability" add constraint "trm_capability_parent_id_foreign" foreign key ("parent_id") references "trm_capability" ("id") on delete set null;`);

    this.addSql(`alter table "trm_application" add constraint "trm_application_capability_id_foreign" foreign key ("capability_id") references "trm_capability" ("id") on delete set null;`);
    this.addSql(`alter table "trm_application" add constraint "trm_application_time_rating_check" check ("time_rating" in ('tolerate', 'invest', 'migrate', 'eliminate'));`);

    this.addSql(`alter table "trm_application_portfolio" add constraint "trm_application_portfolio_application_id_foreign" foreign key ("application_id") references "trm_application" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_application_portfolio" add constraint "trm_application_portfolio_portfolio_id_foreign" foreign key ("portfolio_id") references "portfolio" ("id");`);

    this.addSql(`alter table "trm_service" add constraint "trm_service_kind_check" check ("kind" in ('application', 'business'));`);

    this.addSql(`alter table "trm_application_service" add constraint "trm_application_service_application_id_foreign" foreign key ("application_id") references "trm_application" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_application_service" add constraint "trm_application_service_service_id_foreign" foreign key ("service_id") references "trm_service" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_application_service" add constraint "trm_application_service_link_source_check" check ("link_source" in ('ba_as_sm', 'ba_as_bs', 'ba_as_server'));`);

    this.addSql(`alter table "trm_service_dependency" add constraint "trm_service_dependency_service_id_foreign" foreign key ("service_id") references "trm_service" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_service_dependency" add constraint "trm_service_dependency_business_service_id_foreign" foreign key ("business_service_id") references "trm_service" ("id") on delete cascade;`);

    this.addSql(`alter table "trm_service_server" add constraint "trm_service_server_service_id_foreign" foreign key ("service_id") references "trm_service" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_service_server" add constraint "trm_service_server_server_id_foreign" foreign key ("server_id") references "trm_server" ("id") on delete cascade;`);

    this.addSql(`alter table "trm_software_model" add constraint "trm_software_model_product_standard_id_foreign" foreign key ("product_standard_id") references "trm_product_standard" ("id") on delete set null;`);

    this.addSql(`alter table "trm_service_software" add constraint "trm_service_software_service_id_foreign" foreign key ("service_id") references "trm_service" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_service_software" add constraint "trm_service_software_software_model_id_foreign" foreign key ("software_model_id") references "trm_software_model" ("id") on delete cascade;`);

    this.addSql(`alter table "trm_sync_run" add constraint "trm_sync_run_started_by_id_foreign" foreign key ("started_by_id") references "app_user" ("id");`);
    this.addSql(`alter table "trm_sync_run" add constraint "trm_sync_run_status_check" check ("status" in ('receiving', 'completed', 'failed', 'abandoned'));`);

    this.addSql(`alter table "trm_sync_record" add constraint "trm_sync_record_run_id_foreign" foreign key ("run_id") references "trm_sync_run" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_sync_record" add constraint "trm_sync_record_file_check" check ("file" in ('business_application', 'mapped_application_service', 'business_service', 'business_capability', 'product_standard', 'ba_as_sm', 'ba_as_bs', 'ba_as_server'));`);
    // Seeded TRM access, confirmed with the product owner on 2026-10-22. Additive only:
    // roles an admin has already changed keep everything else.
    this.addSql(`update "role" set "permissions" = array_append("permissions", 'trm:application:read') where "code" in ('enterprise-architect', 'solution-architect', 'arb-member', 'arb-chair', 'portfolio-lead', 'product-manager', 'pmo', 'tech-exco', 'finance-exco') and not ('trm:application:read' = any("permissions"));`);
    this.addSql(`update "role" set "permissions" = array_append("permissions", 'trm:application:update') where "code" in ('enterprise-architect', 'solution-architect', 'portfolio-lead') and not ('trm:application:update' = any("permissions"));`);
    // People's names on TRM records are personal data: visible within each assignment's scope.
    this.addSql(`update "role" set "data_access" = jsonb_set("data_access", '{personal}', '"scope"') where "code" in ('enterprise-architect', 'solution-architect', 'arb-member', 'arb-chair', 'portfolio-lead', 'product-manager', 'pmo', 'tech-exco', 'finance-exco') and "data_access"->>'personal' = 'none';`);
    this.addSql(`insert into "role" ("id", "created_at", "updated_at", "version", "code", "name", "description", "is_system", "is_system_admin", "permissions", "data_access") values
      (gen_random_uuid(), now(), now(), 1, 'application-owner-team', 'Application owner team', 'Assigned per application: views TRM and edits the application''s TRM fields.', true, false, '{trm:application:read,trm:application:update}'::text[], '{"financial": "none", "contract": "none", "sadSecurity": "none", "personal": "scope"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'trm-viewer', 'TRM viewer', 'Views TRM. Give it company-wide to people whose other TRM roles are scoped.', true, false, '{trm:application:read}'::text[], '{"financial": "none", "contract": "none", "sadSecurity": "none", "personal": "scope"}'::jsonb)
      on conflict ("code") do nothing;`);

  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "role" where "code" in ('application-owner-team', 'trm-viewer');`);
    this.addSql(`update "role" set "permissions" = array_remove(array_remove("permissions", 'trm:application:read'), 'trm:application:update');`);
    this.addSql(`update "role" set "data_access" = jsonb_set("data_access", '{personal}', '"none"') where "code" in ('enterprise-architect', 'solution-architect', 'arb-member', 'arb-chair', 'portfolio-lead', 'product-manager', 'pmo', 'tech-exco', 'finance-exco');`);

    this.addSql(`alter table "trm_application_portfolio" drop constraint "trm_application_portfolio_portfolio_id_foreign";`);
    this.addSql(`alter table "trm_capability" drop constraint "trm_capability_parent_id_foreign";`);
    this.addSql(`alter table "trm_application" drop constraint "trm_application_capability_id_foreign";`);
    this.addSql(`alter table "trm_application_portfolio" drop constraint "trm_application_portfolio_application_id_foreign";`);
    this.addSql(`alter table "trm_application_service" drop constraint "trm_application_service_application_id_foreign";`);
    this.addSql(`alter table "trm_software_model" drop constraint "trm_software_model_product_standard_id_foreign";`);
    this.addSql(`alter table "trm_service_server" drop constraint "trm_service_server_server_id_foreign";`);
    this.addSql(`alter table "trm_application_service" drop constraint "trm_application_service_service_id_foreign";`);
    this.addSql(`alter table "trm_service_dependency" drop constraint "trm_service_dependency_service_id_foreign";`);
    this.addSql(`alter table "trm_service_dependency" drop constraint "trm_service_dependency_business_service_id_foreign";`);
    this.addSql(`alter table "trm_service_server" drop constraint "trm_service_server_service_id_foreign";`);
    this.addSql(`alter table "trm_service_software" drop constraint "trm_service_software_service_id_foreign";`);
    this.addSql(`alter table "trm_service_software" drop constraint "trm_service_software_software_model_id_foreign";`);
    this.addSql(`alter table "trm_sync_record" drop constraint "trm_sync_record_run_id_foreign";`);

    this.addSql(`drop table if exists "portfolio" cascade;`);
    this.addSql(`drop table if exists "trm_capability" cascade;`);
    this.addSql(`drop table if exists "trm_application" cascade;`);
    this.addSql(`drop table if exists "trm_application_portfolio" cascade;`);
    this.addSql(`drop table if exists "trm_product_standard" cascade;`);
    this.addSql(`drop table if exists "trm_server" cascade;`);
    this.addSql(`drop table if exists "trm_service" cascade;`);
    this.addSql(`drop table if exists "trm_application_service" cascade;`);
    this.addSql(`drop table if exists "trm_service_dependency" cascade;`);
    this.addSql(`drop table if exists "trm_service_server" cascade;`);
    this.addSql(`drop table if exists "trm_software_model" cascade;`);
    this.addSql(`drop table if exists "trm_service_software" cascade;`);
    this.addSql(`drop table if exists "trm_sync_run" cascade;`);
    this.addSql(`drop table if exists "trm_sync_record" cascade;`);
  }

}
