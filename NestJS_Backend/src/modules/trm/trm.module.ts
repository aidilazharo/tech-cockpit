import { Module } from '@nestjs/common';
import { FieldClassRegistry } from '../access/field-classes.js';
import { TRM_FIELDS } from './trm-fields.js';
import { TrmCatalogueService } from './trm-catalogue.service.js';
import { TrmRemovalService } from './trm-removal.service.js';
import { TrmRoadmapService } from './trm-roadmap.service.js';
import { TrmStructureService } from './trm-structure.service.js';
import { TrmSyncService } from './trm-sync.service.js';
import { TrmController, TrmRemovalController, TrmRoadmapController, TrmStructureController, TrmSyncController } from './trm.controllers.js';

/** Technology Reference Model: ServiceNow APM data loaded from the Node app's exports, plus TRM-only fields. */
@Module({
  controllers: [TrmController, TrmSyncController, TrmRemovalController, TrmStructureController, TrmRoadmapController],
  providers: [TrmCatalogueService, TrmSyncService, TrmRemovalService, TrmStructureService, TrmRoadmapService],
})
export class TrmModule {
  constructor(fieldClasses: FieldClassRegistry) {
    fieldClasses.register(...TRM_FIELDS);
  }
}
