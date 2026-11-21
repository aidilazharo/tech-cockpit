import { Migration } from '@mikro-orm/migrations';

export class Migration20261028065500_system_admin_data_access extends Migration {

  override name = 'Migration20261028065500_system_admin_data_access';

  override up(): void | Promise<void> {
    // The system administrator holds every permission, so it also sees every data class (it was seeded with "none").
    this.addSql(`update "role" set "data_access" = "data_access" || '{"financial": "all", "contract": "all", "personal": "all"}'::jsonb where "is_system_admin" = true;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`update "role" set "data_access" = "data_access" || '{"financial": "none", "contract": "none", "personal": "none"}'::jsonb where "is_system_admin" = true;`);
  }

}
