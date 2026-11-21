import { Migration } from '@mikro-orm/migrations';

export class Migration20261022082430_trm_views_roadmap extends Migration {

  override name = 'Migration20261022082430_trm_views_roadmap';

  override up(): void | Promise<void> {
    this.addSql(`create table "trm_domain" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "name" varchar(200) not null, "active" boolean not null default true, primary key ("id"));`);
    this.addSql(`alter table "trm_domain" add constraint "trm_domain_name_unique" unique ("name");`);

    this.addSql(`create table "trm_layer" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "name" varchar(200) not null, "position" int not null, "active" boolean not null default true, primary key ("id"));`);
    this.addSql(`alter table "trm_layer" add constraint "trm_layer_name_unique" unique ("name");`);

    this.addSql(`create table "trm_layer_mapping" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "standard_category" varchar(500) not null, "layer_id" uuid not null, primary key ("id"));`);
    this.addSql(`alter table "trm_layer_mapping" add constraint "trm_layer_mapping_standard_category_unique" unique ("standard_category");`);
    this.addSql(`create index "trm_layer_mapping_layer_id_index" on "trm_layer_mapping" ("layer_id");`);

    this.addSql(`create table "trm_planned_application" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "name" varchar(300) not null, "linked_application_id" uuid null, primary key ("id"));`);
    this.addSql(`alter table "trm_planned_application" add constraint "trm_planned_application_name_unique" unique ("name");`);

    this.addSql(`create table "trm_subdomain" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "domain_id" uuid not null, "name" varchar(200) not null, "active" boolean not null default true, primary key ("id"));`);
    this.addSql(`create index "trm_subdomain_domain_id_index" on "trm_subdomain" ("domain_id");`);
    this.addSql(`alter table "trm_subdomain" add constraint "trm_subdomain_domain_id_name_unique" unique ("domain_id", "name");`);

    this.addSql(`create table "trm_application_subdomain" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "application_id" uuid not null, "subdomain_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "trm_application_subdomain_application_id_index" on "trm_application_subdomain" ("application_id");`);
    this.addSql(`create index "trm_application_subdomain_subdomain_id_index" on "trm_application_subdomain" ("subdomain_id");`);
    this.addSql(`alter table "trm_application_subdomain" add constraint "trm_application_subdomain_application_id_subdomain_id_unique" unique ("application_id", "subdomain_id");`);

    this.addSql(`create table "trm_initiative" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "name" varchar(300) not null, "description" text null, "rationale" text null, "start_date" date not null, "end_date" date not null, "status" text not null, "owner_id" uuid null, "estimated_cost" numeric(15,2) null, primary key ("id"));`);
    this.addSql(`create index "trm_initiative_status_index" on "trm_initiative" ("status");`);

    this.addSql(`create table "trm_initiative_capability" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "initiative_id" uuid not null, "capability_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "trm_initiative_capability_initiative_id_index" on "trm_initiative_capability" ("initiative_id");`);
    this.addSql(`create index "trm_initiative_capability_capability_id_index" on "trm_initiative_capability" ("capability_id");`);
    this.addSql(`alter table "trm_initiative_capability" add constraint "trm_initiative_capability_initiative_id_capability_id_unique" unique ("initiative_id", "capability_id");`);

    this.addSql(`create table "trm_initiative_action" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "initiative_id" uuid not null, "position" int not null, "action" text not null, "application_id" uuid null, "planned_application_id" uuid null, "replacement_application_id" uuid null, "replacement_planned_id" uuid null, primary key ("id"));`);
    this.addSql(`create index "trm_initiative_action_initiative_id_index" on "trm_initiative_action" ("initiative_id");`);
    this.addSql(`create index "trm_initiative_action_application_id_index" on "trm_initiative_action" ("application_id");`);
    this.addSql(`create index "trm_initiative_action_planned_application_id_index" on "trm_initiative_action" ("planned_application_id");`);

    this.addSql(`alter table "trm_layer_mapping" add constraint "trm_layer_mapping_layer_id_foreign" foreign key ("layer_id") references "trm_layer" ("id");`);

    this.addSql(`alter table "trm_planned_application" add constraint "trm_planned_application_linked_application_id_foreign" foreign key ("linked_application_id") references "trm_application" ("id") on delete set null;`);

    this.addSql(`alter table "trm_subdomain" add constraint "trm_subdomain_domain_id_foreign" foreign key ("domain_id") references "trm_domain" ("id");`);

    this.addSql(`alter table "trm_application_subdomain" add constraint "trm_application_subdomain_application_id_foreign" foreign key ("application_id") references "trm_application" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_application_subdomain" add constraint "trm_application_subdomain_subdomain_id_foreign" foreign key ("subdomain_id") references "trm_subdomain" ("id");`);

    this.addSql(`alter table "trm_initiative" add constraint "trm_initiative_owner_id_foreign" foreign key ("owner_id") references "app_user" ("id") on delete set null;`);
    this.addSql(`alter table "trm_initiative" add constraint "trm_initiative_status_check" check ("status" in ('proposed', 'approved', 'in_progress', 'completed', 'cancelled'));`);

    this.addSql(`alter table "trm_initiative_capability" add constraint "trm_initiative_capability_initiative_id_foreign" foreign key ("initiative_id") references "trm_initiative" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_initiative_capability" add constraint "trm_initiative_capability_capability_id_foreign" foreign key ("capability_id") references "trm_capability" ("id");`);

    this.addSql(`alter table "trm_initiative_action" add constraint "trm_initiative_action_initiative_id_foreign" foreign key ("initiative_id") references "trm_initiative" ("id") on delete cascade;`);
    this.addSql(`alter table "trm_initiative_action" add constraint "trm_initiative_action_application_id_foreign" foreign key ("application_id") references "trm_application" ("id") on delete set null;`);
    this.addSql(`alter table "trm_initiative_action" add constraint "trm_initiative_action_planned_application_id_foreign" foreign key ("planned_application_id") references "trm_planned_application" ("id") on delete set null;`);
    this.addSql(`alter table "trm_initiative_action" add constraint "trm_initiative_action_replacement_application_id_foreign" foreign key ("replacement_application_id") references "trm_application" ("id") on delete set null;`);
    this.addSql(`alter table "trm_initiative_action" add constraint "trm_initiative_action_replacement_planned_id_foreign" foreign key ("replacement_planned_id") references "trm_planned_application" ("id") on delete set null;`);
    this.addSql(`alter table "trm_initiative_action" add constraint "trm_initiative_action_action_check" check ("action" in ('introduce', 'enhance', 'replace', 'retire'));`);
    // The 10 researched technology layers (editable in TechCockpit afterwards).
    this.addSql(`insert into "trm_layer" ("id", "created_at", "updated_at", "version", "name", "position", "active") values
      (gen_random_uuid(), now(), now(), 1, 'Channels & Presentation', 1, true),
      (gen_random_uuid(), now(), now(), 1, 'Business Applications', 2, true),
      (gen_random_uuid(), now(), now(), 1, 'Integration & APIs', 3, true),
      (gen_random_uuid(), now(), now(), 1, 'Data & Analytics', 4, true),
      (gen_random_uuid(), now(), now(), 1, 'Application Platform', 5, true),
      (gen_random_uuid(), now(), now(), 1, 'Infrastructure & Hosting', 6, true),
      (gen_random_uuid(), now(), now(), 1, 'Network & Connectivity', 7, true),
      (gen_random_uuid(), now(), now(), 1, 'Security & Identity', 8, true),
      (gen_random_uuid(), now(), now(), 1, 'Management & Operations', 9, true),
      (gen_random_uuid(), now(), now(), 1, 'Engineering & Delivery', 10, true)
      on conflict ("name") do nothing;`);
    // Confirmed 2026-10-22: EAs maintain domains, layers and the roadmap; every TRM viewer sees the roadmap.
    for (const code of ['trm:domain:manage', 'trm:layer:manage', 'trm:roadmap:manage']) {
      this.addSql(`update "role" set "permissions" = array_append("permissions", '${code}') where "code" = 'enterprise-architect' and not ('${code}' = any("permissions"));`);
    }
    this.addSql(`update "role" set "permissions" = array_append("permissions", 'trm:roadmap:read') where "code" in ('enterprise-architect', 'solution-architect', 'arb-member', 'arb-chair', 'portfolio-lead', 'product-manager', 'pmo', 'tech-exco', 'finance-exco', 'application-owner-team', 'trm-viewer') and not ('trm:roadmap:read' = any("permissions"));`);

  }

  override down(): void | Promise<void> {
    this.addSql(`update "role" set "permissions" = array_remove(array_remove(array_remove(array_remove("permissions", 'trm:domain:manage'), 'trm:layer:manage'), 'trm:roadmap:manage'), 'trm:roadmap:read');`);

    this.addSql(`alter table "trm_subdomain" drop constraint "trm_subdomain_domain_id_foreign";`);
    this.addSql(`alter table "trm_layer_mapping" drop constraint "trm_layer_mapping_layer_id_foreign";`);
    this.addSql(`alter table "trm_initiative_action" drop constraint "trm_initiative_action_planned_application_id_foreign";`);
    this.addSql(`alter table "trm_initiative_action" drop constraint "trm_initiative_action_replacement_planned_id_foreign";`);
    this.addSql(`alter table "trm_application_subdomain" drop constraint "trm_application_subdomain_subdomain_id_foreign";`);
    this.addSql(`alter table "trm_initiative_capability" drop constraint "trm_initiative_capability_initiative_id_foreign";`);
    this.addSql(`alter table "trm_initiative_action" drop constraint "trm_initiative_action_initiative_id_foreign";`);

    this.addSql(`drop table if exists "trm_domain" cascade;`);
    this.addSql(`drop table if exists "trm_layer" cascade;`);
    this.addSql(`drop table if exists "trm_layer_mapping" cascade;`);
    this.addSql(`drop table if exists "trm_planned_application" cascade;`);
    this.addSql(`drop table if exists "trm_subdomain" cascade;`);
    this.addSql(`drop table if exists "trm_application_subdomain" cascade;`);
    this.addSql(`drop table if exists "trm_initiative" cascade;`);
    this.addSql(`drop table if exists "trm_initiative_capability" cascade;`);
    this.addSql(`drop table if exists "trm_initiative_action" cascade;`);
  }

}
