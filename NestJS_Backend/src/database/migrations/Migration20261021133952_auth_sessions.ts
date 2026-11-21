import { Migration } from '@mikro-orm/migrations';

export class Migration20261021133952_auth_sessions extends Migration {

  override name = 'Migration20261021133952_auth_sessions';

  override up(): void | Promise<void> {
    this.addSql(`create table "saml_request" ("request_id" varchar(100) not null, "issued_at" timestamptz not null, "expires_at" timestamptz not null, "consumed_at" timestamptz null, "return_to" varchar(2048) not null default '/', primary key ("request_id"));`);
    this.addSql(`create index "saml_request_expires_at_index" on "saml_request" ("expires_at");`);

    this.addSql(`create table "auth_session" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "user_id" uuid not null, "refresh_token_hash" varchar(64) not null, "previous_refresh_token_hash" varchar(64) null, "refreshed_at" timestamptz null, "last_seen_at" timestamptz not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "revoke_reason" text null, "ip_address" varchar(64) null, "user_agent" varchar(500) null, primary key ("id"));`);
    this.addSql(`create index "auth_session_user_id_index" on "auth_session" ("user_id");`);
    this.addSql(`alter table "auth_session" add constraint "auth_session_refresh_token_hash_unique" unique ("refresh_token_hash");`);
    this.addSql(`create index "auth_session_previous_refresh_token_hash_index" on "auth_session" ("previous_refresh_token_hash");`);
    this.addSql(`create index "auth_session_expires_at_index" on "auth_session" ("expires_at");`);

    this.addSql(`alter table "audit_log" add "session_id" uuid null;`);
    this.addSql(`create index "audit_log_session_id_index" on "audit_log" ("session_id");`);

    this.addSql(`alter table "auth_session" add constraint "auth_session_user_id_foreign" foreign key ("user_id") references "app_user" ("id");`);
    this.addSql(`alter table "auth_session" add constraint "auth_session_revoke_reason_check" check ("revoke_reason" in ('logout', 'idle', 'refresh-reuse', 'user-disabled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "saml_request" cascade;`);
    this.addSql(`drop table if exists "auth_session" cascade;`);

    this.addSql(`drop index "audit_log_session_id_index";`);
    this.addSql(`alter table "audit_log" drop column "session_id";`);
  }

}
