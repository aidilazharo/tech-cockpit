import { Migration } from '@mikro-orm/migrations';

export class Migration20261024144150_sad_uploads extends Migration {

  override name = 'Migration20261024144150_sad_uploads';

  override up(): void | Promise<void> {
    this.addSql(`create table "sad_file" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "storage_key" varchar(200) not null, "name" varchar(200) not null, "type" text not null, "size" int not null, "sha256" varchar(64) not null, "scan" text not null, "uploaded_by_id" uuid not null, "removed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "sad_file" add constraint "sad_file_storage_key_unique" unique ("storage_key");`);
    this.addSql(`create index "sad_file_scan_index" on "sad_file" ("scan");`);

    this.addSql(`create table "sad_upload" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "created_by" uuid null, "updated_by" uuid null, "version" int not null default 1, "sad_version_id" uuid not null, "slot" text not null, "diagram_id" varchar(64) not null, "file_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "sad_upload_file_id_index" on "sad_upload" ("file_id");`);
    this.addSql(`create index "sad_upload_sad_version_id_slot_diagram_id_index" on "sad_upload" ("sad_version_id", "slot", "diagram_id");`);

    this.addSql(`alter table "notification" drop constraint "notification_type_check";`);
    this.addSql(`alter table "notification" add constraint "notification_type_check" check ("type" in ('approval.task.assigned', 'approval.task.review-again', 'approval.task.reassigned', 'approval.task.escalated', 'approval.task.info-answered', 'approval.task.sla-reminder', 'approval.request.approved', 'approval.request.returned', 'approval.request.info-requested', 'approval.request.cancelled', 'sad.upload.malicious'));`);

    this.addSql(`alter table "sad_file" add constraint "sad_file_uploaded_by_id_foreign" foreign key ("uploaded_by_id") references "app_user" ("id");`);
    this.addSql(`alter table "sad_file" add constraint "sad_file_type_check" check ("type" in ('docx', 'xlsx', 'pptx', 'vsdx', 'pdf', 'png', 'jpg', 'jpeg', 'drawio'));`);
    this.addSql(`alter table "sad_file" add constraint "sad_file_scan_check" check ("scan" in ('scanning', 'clean', 'malicious', 'failed', 'unscanned'));`);

    this.addSql(`alter table "sad_upload" add constraint "sad_upload_sad_version_id_foreign" foreign key ("sad_version_id") references "sad_version" ("id") on delete cascade;`);
    this.addSql(`alter table "sad_upload" add constraint "sad_upload_file_id_foreign" foreign key ("file_id") references "sad_file" ("id");`);
    this.addSql(`alter table "sad_upload" add constraint "sad_upload_slot_check" check ("slot" in ('solution', 'infrastructure', 'ci-cd', 'monitoring'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "sad_upload" drop constraint "sad_upload_file_id_foreign";`);

    this.addSql(`drop table if exists "sad_file" cascade;`);
    this.addSql(`drop table if exists "sad_upload" cascade;`);

    this.addSql(`alter table "notification" drop constraint "notification_type_check";`);
    this.addSql(`alter table "notification" add constraint "notification_type_check" check ("type" in ('approval.task.assigned', 'approval.task.review-again', 'approval.task.reassigned', 'approval.task.escalated', 'approval.task.info-answered', 'approval.task.sla-reminder', 'approval.request.approved', 'approval.request.returned', 'approval.request.info-requested', 'approval.request.cancelled'));`);
  }

}
