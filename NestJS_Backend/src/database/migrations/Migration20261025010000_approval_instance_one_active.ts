import { Migration } from '@mikro-orm/migrations';

export class Migration20261025010000_approval_instance_one_active extends Migration {

  override name = 'Migration20261025010000_approval_instance_one_active';

  override up(): void | Promise<void> {
    // One approval in progress per record, even for two submissions at once (the service checks first and says why).
    this.addSql(`create unique index "approval_instance_one_active" on "approval_instance" ("workflow_code", "subject_type", "subject_id") where "status" in ('in_progress', 'returned', 'awaiting_info');`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "approval_instance_one_active";`);
  }

}
