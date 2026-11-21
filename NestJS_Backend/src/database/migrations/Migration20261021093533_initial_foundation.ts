import { Migration } from '@mikro-orm/migrations';

export class Migration20261021093533_initial_foundation extends Migration {

  override name = 'Migration20261021093533_initial_foundation';

  override up(): void | Promise<void> {
    this.addSql(`create table "approval_rule_set" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "workflow_code" varchar(63) not null, "rule_version" int not null, "status" text not null default 'draft', "definition" jsonb not null, "published_at" timestamptz null, "published_by" uuid null, primary key ("id"));`);
    this.addSql(`create index "approval_rule_set_workflow_code_index" on "approval_rule_set" ("workflow_code");`);
    this.addSql(`alter table "approval_rule_set" add constraint "approval_rule_set_workflow_code_rule_version_unique" unique ("workflow_code", "rule_version");`);

    this.addSql(`create table "audit_log" ("id" uuid not null, "occurred_at" timestamptz not null, "actor_user_id" uuid null, "auth_method" varchar(20) null, "api_key_id" uuid null, "action" varchar(100) not null, "resource_type" varchar(100) null, "resource_id" varchar(100) null, "http_method" varchar(10) null, "path" varchar(500) null, "status_code" int null, "request_id" varchar(64) null, "ip_address" varchar(64) null, "user_agent" varchar(500) null, "changes" jsonb null, "metadata" jsonb null, primary key ("id"));`);
    this.addSql(`create index "audit_log_occurred_at_index" on "audit_log" ("occurred_at");`);
    this.addSql(`create index "audit_log_actor_user_id_index" on "audit_log" ("actor_user_id");`);
    this.addSql(`create index "audit_log_action_index" on "audit_log" ("action");`);
    this.addSql(`create index "audit_log_resource_type_resource_id_index" on "audit_log" ("resource_type", "resource_id");`);

    this.addSql(`create table "department" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "code" varchar(50) not null, "name" varchar(200) not null, "active" boolean not null default true, primary key ("id"));`);
    this.addSql(`alter table "department" add constraint "department_code_unique" unique ("code");`);

    this.addSql(`create table "role" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "code" varchar(50) not null, "name" varchar(100) not null, "description" varchar(500) null, "is_system" boolean not null default false, "is_system_admin" boolean not null default false, "permissions" text[] not null, "data_access" jsonb not null, primary key ("id"));`);
    this.addSql(`alter table "role" add constraint "role_code_unique" unique ("code");`);

    this.addSql(`create table "app_user" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "email" varchar(320) not null, "first_name" varchar(100) not null, "last_name" varchar(100) not null, "status" text not null default 'active', "is_external" boolean not null default false, "department_id" uuid null, "last_login_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "app_user" add constraint "app_user_email_unique" unique ("email");`);

    this.addSql(`create table "role_assignment" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "user_id" uuid not null, "role_id" uuid not null, "scope_type" text not null, "scope_id" uuid null, "valid_from" timestamptz not null, "valid_to" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "role_assignment_user_id_index" on "role_assignment" ("user_id");`);
    this.addSql(`create index "role_assignment_role_id_index" on "role_assignment" ("role_id");`);

    this.addSql(`create table "approval_instance" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "workflow_code" varchar(63) not null, "subject_type" varchar(63) not null, "subject_id" varchar(100) not null, "subject_title" varchar(300) not null, "rule_set_id" uuid not null, "rule_key" varchar(63) not null, "steps" jsonb not null, "context" jsonb not null, "status" text not null, "current_step_index" int not null, "round" int not null, "submitted_by_id" uuid not null, "department_id" uuid null, "portfolio_id" uuid null, "stream_id" uuid null, "application_id" uuid null, "completed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "approval_instance_workflow_code_index" on "approval_instance" ("workflow_code");`);
    this.addSql(`create index "approval_instance_status_index" on "approval_instance" ("status");`);
    this.addSql(`create index "approval_instance_submitted_by_id_index" on "approval_instance" ("submitted_by_id");`);
    this.addSql(`create index "approval_instance_subject_type_subject_id_index" on "approval_instance" ("subject_type", "subject_id");`);

    this.addSql(`create table "approval_task" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "instance_id" uuid not null, "step_index" int not null, "step_key" varchar(63) not null, "group_index" int not null, "assignee_id" uuid not null, "original_assignee_id" uuid null, "status" text not null, "round" int not null, "comment" text null, "response" text null, "acted_at" timestamptz null, "escalated_at" timestamptz null, "reassign_reason" varchar(500) null, primary key ("id"));`);
    this.addSql(`create index "approval_task_instance_id_index" on "approval_task" ("instance_id");`);
    this.addSql(`create index "approval_task_assignee_id_status_index" on "approval_task" ("assignee_id", "status");`);

    this.addSql(`create table "approval_delegation" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "from_user_id" uuid not null, "to_user_id" uuid not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "reason" varchar(500) null, "cancelled_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "approval_delegation_from_user_id_index" on "approval_delegation" ("from_user_id");`);

    this.addSql(`create table "api_key" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "user_id" uuid not null, "name" varchar(100) not null, "key_id" varchar(32) not null, "secret_hash" varchar(64) not null, "expires_at" timestamptz not null, "last_used_at" timestamptz null, "revoked_at" timestamptz null, "revoked_by" uuid null, primary key ("id"));`);
    this.addSql(`create index "api_key_user_id_index" on "api_key" ("user_id");`);
    this.addSql(`alter table "api_key" add constraint "api_key_key_id_unique" unique ("key_id");`);

    this.addSql(`alter table "approval_rule_set" add constraint "approval_rule_set_status_check" check ("status" in ('draft', 'published', 'retired'));`);

    this.addSql(`alter table "app_user" add constraint "app_user_department_id_foreign" foreign key ("department_id") references "department" ("id") on delete set null;`);
    this.addSql(`alter table "app_user" add constraint "app_user_status_check" check ("status" in ('active', 'disabled'));`);

    this.addSql(`alter table "role_assignment" add constraint "role_assignment_user_id_foreign" foreign key ("user_id") references "app_user" ("id");`);
    this.addSql(`alter table "role_assignment" add constraint "role_assignment_role_id_foreign" foreign key ("role_id") references "role" ("id");`);
    this.addSql(`alter table "role_assignment" add constraint "role_assignment_scope_type_check" check ("scope_type" in ('global', 'department', 'portfolio', 'stream', 'application', 'vendor'));`);

    this.addSql(`alter table "approval_instance" add constraint "approval_instance_rule_set_id_foreign" foreign key ("rule_set_id") references "approval_rule_set" ("id");`);
    this.addSql(`alter table "approval_instance" add constraint "approval_instance_submitted_by_id_foreign" foreign key ("submitted_by_id") references "app_user" ("id");`);
    this.addSql(`alter table "approval_instance" add constraint "approval_instance_status_check" check ("status" in ('in_progress', 'returned', 'awaiting_info', 'approved', 'cancelled'));`);

    this.addSql(`alter table "approval_task" add constraint "approval_task_instance_id_foreign" foreign key ("instance_id") references "approval_instance" ("id") on delete cascade;`);
    this.addSql(`alter table "approval_task" add constraint "approval_task_assignee_id_foreign" foreign key ("assignee_id") references "app_user" ("id");`);
    this.addSql(`alter table "approval_task" add constraint "approval_task_original_assignee_id_foreign" foreign key ("original_assignee_id") references "app_user" ("id") on delete set null;`);
    this.addSql(`alter table "approval_task" add constraint "approval_task_status_check" check ("status" in ('pending', 'blocked', 'approved', 'rejected', 'info_requested', 'superseded'));`);

    this.addSql(`alter table "approval_delegation" add constraint "approval_delegation_from_user_id_foreign" foreign key ("from_user_id") references "app_user" ("id");`);
    this.addSql(`alter table "approval_delegation" add constraint "approval_delegation_to_user_id_foreign" foreign key ("to_user_id") references "app_user" ("id");`);

    this.addSql(`alter table "api_key" add constraint "api_key_user_id_foreign" foreign key ("user_id") references "app_user" ("id");`);

    // --- Hand-written: audit_log is append-only ---
    this.addSql(`create or replace function "audit_log_append_only"() returns trigger language plpgsql as $$ begin raise exception 'audit_log is append-only'; end; $$;`);
    this.addSql(`create trigger "audit_log_no_update_delete" before update or delete on "audit_log" for each row execute function "audit_log_append_only"();`);
    this.addSql(`create trigger "audit_log_no_truncate" before truncate on "audit_log" for each statement execute function "audit_log_append_only"();`);

    // --- Hand-written: seeded system roles (admins may change permissions and data access) ---
    this.addSql(`insert into "role" ("id", "created_at", "updated_at", "version", "code", "name", "description", "is_system", "is_system_admin", "permissions", "data_access") values
      (gen_random_uuid(), now(), now(), 1, 'system-admin', 'System administrator', 'Full administration. Holds every permission.', true, true, '{}'::text[], '{"financial": "none", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'portfolio-lead', 'Portfolio lead', 'Leads a portfolio or stream; sees its financial data.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read}'::text[], '{"financial": "scope", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'product-manager', 'Product manager', 'Submits business cases; sees own financial data.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read}'::text[], '{"financial": "own", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'solution-architect', 'Solution architect', 'Designs solutions; financial visibility configurable.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read,approvals:rule-set:read}'::text[], '{"financial": "all", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'enterprise-architect', 'Enterprise architect', 'Owns the TRM and architecture standards.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read,approvals:rule-set:read}'::text[], '{"financial": "all", "contract": "none", "sadSecurity": "all", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'arb-member', 'ARB member', 'Reviews solutions in the Architecture Review Board.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read}'::text[], '{"financial": "none", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'arb-chair', 'ARB chair', 'Gives final ARB approval.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read}'::text[], '{"financial": "none", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'pmo', 'PMO', 'Runs the project management office processes.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read,approvals:rule-set:read,access:user:read}'::text[], '{"financial": "all", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'tech-exco', 'Tech EXCO', 'Technology executive committee approver.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read}'::text[], '{"financial": "all", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'finance-exco', 'Finance EXCO', 'Finance executive committee approver.', true, false, '{approvals:instance:read,approvals:task:act,approvals:delegation:manage,apikey:own:manage,system:api-docs:read}'::text[], '{"financial": "all", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb),
      (gen_random_uuid(), now(), now(), 1, 'vendor', 'Vendor', 'Third-party user. Never sees financial, contract, security or personal data.', true, false, '{apikey:own:manage}'::text[], '{"financial": "none", "contract": "none", "sadSecurity": "none", "personal": "none"}'::jsonb);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "approval_instance" drop constraint "approval_instance_rule_set_id_foreign";`);
    this.addSql(`alter table "app_user" drop constraint "app_user_department_id_foreign";`);
    this.addSql(`alter table "role_assignment" drop constraint "role_assignment_role_id_foreign";`);
    this.addSql(`alter table "role_assignment" drop constraint "role_assignment_user_id_foreign";`);
    this.addSql(`alter table "approval_instance" drop constraint "approval_instance_submitted_by_id_foreign";`);
    this.addSql(`alter table "approval_task" drop constraint "approval_task_assignee_id_foreign";`);
    this.addSql(`alter table "approval_task" drop constraint "approval_task_original_assignee_id_foreign";`);
    this.addSql(`alter table "approval_delegation" drop constraint "approval_delegation_from_user_id_foreign";`);
    this.addSql(`alter table "approval_delegation" drop constraint "approval_delegation_to_user_id_foreign";`);
    this.addSql(`alter table "api_key" drop constraint "api_key_user_id_foreign";`);
    this.addSql(`alter table "approval_task" drop constraint "approval_task_instance_id_foreign";`);

    this.addSql(`drop table if exists "approval_rule_set" cascade;`);
    this.addSql(`drop table if exists "audit_log" cascade;`);
    this.addSql(`drop table if exists "department" cascade;`);
    this.addSql(`drop table if exists "role" cascade;`);
    this.addSql(`drop table if exists "app_user" cascade;`);
    this.addSql(`drop table if exists "role_assignment" cascade;`);
    this.addSql(`drop table if exists "approval_instance" cascade;`);
    this.addSql(`drop table if exists "approval_task" cascade;`);
    this.addSql(`drop table if exists "approval_delegation" cascade;`);
    this.addSql(`drop table if exists "api_key" cascade;`);
    this.addSql(`drop function if exists "audit_log_append_only"() cascade;`);
  }

}
