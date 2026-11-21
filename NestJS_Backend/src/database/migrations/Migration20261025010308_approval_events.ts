import { Migration } from '@mikro-orm/migrations';

export class Migration20261025010308_approval_events extends Migration {

  override name = 'Migration20261025010308_approval_events';

  override up(): void | Promise<void> {
    this.addSql(`create table "approval_event" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "instance_id" uuid not null, "action" text not null, "actor_id" uuid not null, "step_key" varchar(63) not null, "round" int not null, "comment" text null, "at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "approval_event_instance_id_index" on "approval_event" ("instance_id");`);

    this.addSql(`alter table "approval_event" add constraint "approval_event_instance_id_foreign" foreign key ("instance_id") references "approval_instance" ("id") on delete cascade;`);
    this.addSql(`alter table "approval_event" add constraint "approval_event_actor_id_foreign" foreign key ("actor_id") references "app_user" ("id");`);
    this.addSql(`alter table "approval_event" add constraint "approval_event_action_check" check ("action" in ('submitted', 'approved', 'returned', 'info_requested', 'answered', 'resubmitted', 'cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "approval_event" cascade;`);
  }

}
