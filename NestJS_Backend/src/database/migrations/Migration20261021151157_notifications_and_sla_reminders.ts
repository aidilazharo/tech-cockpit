import { Migration } from '@mikro-orm/migrations';

export class Migration20261021151157_notifications_and_sla_reminders extends Migration {

  override name = 'Migration20261021151157_notifications_and_sla_reminders';

  override up(): void | Promise<void> {
    this.addSql(`create table "notification" ("id" uuid not null, "created_at" timestamptz not null, "recipient_id" uuid not null, "type" text not null, "params" jsonb not null, "link" varchar(500) null, "read_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "notification_created_at_index" on "notification" ("created_at");`);
    this.addSql(`create index "notification_recipient_id_read_at_index" on "notification" ("recipient_id", "read_at");`);

    this.addSql(`alter table "approval_task" add "reminder_sent_at" timestamptz null;`);

    this.addSql(`alter table "notification" add constraint "notification_recipient_id_foreign" foreign key ("recipient_id") references "app_user" ("id");`);
    this.addSql(`alter table "notification" add constraint "notification_type_check" check ("type" in ('approval.task.assigned', 'approval.task.review-again', 'approval.task.reassigned', 'approval.task.escalated', 'approval.task.info-answered', 'approval.task.sla-reminder', 'approval.request.approved', 'approval.request.returned', 'approval.request.info-requested', 'approval.request.cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "notification" cascade;`);

    this.addSql(`alter table "approval_task" drop column "reminder_sent_at";`);
  }

}
