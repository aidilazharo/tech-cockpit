import { Migration } from '@mikro-orm/migrations';

export class Migration20261022205741_configurable_rbac extends Migration {

  override name = 'Migration20261022205741_configurable_rbac';

  override up(): void | Promise<void> {
    this.addSql(`create table "approval_workflow_setting" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "workflow_code" varchar(63) not null, "approvers_see_financials" boolean not null, primary key ("id"));`);
    this.addSql(`alter table "approval_workflow_setting" add constraint "approval_workflow_setting_workflow_code_unique" unique ("workflow_code");`);

    this.addSql(`create table "field_class_override" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "field_key" varchar(200) not null, "data_class" text not null, primary key ("id"));`);
    this.addSql(`alter table "field_class_override" add constraint "field_class_override_field_key_unique" unique ("field_key");`);

    this.addSql(`alter table "role" add "can_act_for_staff" boolean not null default false;`);

    this.addSql(`alter table "field_class_override" add constraint "field_class_override_data_class_check" check ("data_class" in ('financial', 'contract', 'personal', 'internal'));`);

    // Configurable RBAC, decided with the product owner on 2026-10-22 (docs/modules/rbac-configurable.md).
    // Who can act for staff (out-of-office delegates, roadmap owners): the approver roles.
    this.addSql(`update "role" set "can_act_for_staff" = true where "code" in ('tech-exco', 'finance-exco', 'arb-member', 'arb-chair', 'enterprise-architect', 'solution-architect', 'application-manager', 'pmo', 'portfolio-lead');`);
    // "View all ServiceNow fields": every role that views TRM today, except Vendor.
    this.addSql(`update "role" set "permissions" = array(select distinct unnest("permissions" || array['trm:source-fields:read']::text[]) order by 1) where 'trm:application:read' = any("permissions") and "code" <> 'vendor';`);
    // "Search the staff directory": every seeded staff role.
    this.addSql(`update "role" set "permissions" = array(select distinct unnest("permissions" || array['people:directory:read']::text[]) order by 1) where "is_system" and not "is_system_admin" and "code" <> 'vendor';`);
    // The other new permissions start with nobody (system administrators hold every permission).
  }

  override down(): void | Promise<void> {
    this.addSql(`update "role" set "permissions" = array(select p from unnest("permissions") as p where p not in ('trm:source-fields:read', 'people:directory:read', 'access:system-admin:manage', 'access:field-class:manage', 'sad:draft:manage', 'approvals:instance:manage', 'approvals:any-delegation:manage') order by 1);`);
    this.addSql(`drop table if exists "approval_workflow_setting" cascade;`);
    this.addSql(`drop table if exists "field_class_override" cascade;`);

    this.addSql(`alter table "role" drop column "can_act_for_staff";`);
  }

}
