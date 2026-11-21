import { Migration } from '@mikro-orm/migrations';

export class Migration20261023040412_user_management_in_app extends Migration {

  override name = 'Migration20261023040412_user_management_in_app';

  override up(): void | Promise<void> {
    this.addSql(`create table "refused_sign_in" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "username" varchar(320) not null, "email" varchar(320) null, "first_name" varchar(100) not null default '', "last_name" varchar(100) not null default '', "attempts" int not null default 1, "first_attempt_at" timestamptz not null, "last_attempt_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "refused_sign_in" add constraint "refused_sign_in_username_unique" unique ("username");`);
    this.addSql(`create index "refused_sign_in_last_attempt_at_index" on "refused_sign_in" ("last_attempt_at");`);

    this.addSql(`alter table "app_user" drop constraint "app_user_email_unique";`);
    // Existing accounts (test data, no real users yet) take their username from their email.
    this.addSql(`alter table "app_user" add "username" varchar(320) null, add "email_from_okta" boolean not null default false;`);
    this.addSql(`update "app_user" set "username" = lower("email");`);
    this.addSql(`alter table "app_user" alter column "username" set not null;`);
    this.addSql(`alter table "app_user" alter column "first_name" set default '';`);
    this.addSql(`alter table "app_user" alter column "last_name" set default '';`);
    this.addSql(`alter table "app_user" add constraint "app_user_username_unique" unique ("username");`);
    this.addSql(`create index "app_user_email_index" on "app_user" ("email");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "refused_sign_in" cascade;`);

    this.addSql(`alter table "app_user" drop constraint "app_user_username_unique";`);
    this.addSql(`drop index "app_user_email_index";`);
    this.addSql(`alter table "app_user" drop column "username", drop column "email_from_okta";`);
    this.addSql(`alter table "app_user" alter column "first_name" drop default;`);
    this.addSql(`alter table "app_user" alter column "last_name" drop default;`);
    this.addSql(`alter table "app_user" add constraint "app_user_email_unique" unique ("email");`);
  }

}
