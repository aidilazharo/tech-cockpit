import { Migration } from '@mikro-orm/migrations';

export class Migration20261021094927_approval_task_activated_at extends Migration {

  override name = 'Migration20261021094927_approval_task_activated_at';

  override up(): void | Promise<void> {
    this.addSql(`alter table "approval_task" add "activated_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "approval_task" drop column "activated_at";`);
  }

}
