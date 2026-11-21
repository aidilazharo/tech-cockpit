import { describe, it } from 'vitest'
import { expectAcceptedRequest, expectSameResponse } from '../../test/contract'
import * as schemas from './schemas'

describe('TRM responses match the API contract', () => {
  it.each([
    ['TrmApplicationSummary', schemas.ApplicationSummarySchema],
    ['TrmApplicationPage', schemas.ApplicationPageSchema],
    ['TrmApplication', schemas.ApplicationSchema],
    ['TrmFacets', schemas.FacetsSchema],
    ['TrmServiceSummary', schemas.ServiceSummarySchema],
    ['TrmServicePage', schemas.ServicePageSchema],
    ['TrmService', schemas.ServiceSchema],
    ['TrmCapabilityList', schemas.CapabilityListSchema],
    ['TrmCapability', schemas.CapabilitySchema],
    ['TrmSoftwareModelSummary', schemas.SoftwareModelSummarySchema],
    ['TrmSoftwareModelPage', schemas.SoftwareModelPageSchema],
    ['TrmSoftwareModel', schemas.SoftwareModelSchema],
    ['TrmProductStandardSummary', schemas.ProductStandardSummarySchema],
    ['TrmProductStandardPage', schemas.ProductStandardPageSchema],
    ['TrmProductStandard', schemas.ProductStandardSchema],
    ['TrmServerSummary', schemas.ServerSummarySchema],
    ['TrmServerPage', schemas.ServerPageSchema],
    ['TrmServer', schemas.ServerSchema],
    ['TrmRef', schemas.RefSchema],
    ['PortfolioRef', schemas.PortfolioRefSchema],
    ['TrmProductStandardRef', schemas.StandardRefSchema],
    ['TrmSyncRun', schemas.SyncRunSchema],
    ['TrmSyncRunPage', schemas.SyncRunPageSchema],
    ['TrmSyncReport', schemas.SyncReportSchema],
    ['TrmMissingSummary', schemas.MissingSummarySchema],
    ['TrmMissingRecord', schemas.MissingRecordSchema],
    ['TrmMissingRecordPage', schemas.MissingPageSchema],
    ['TrmDeleteMissingResult', schemas.DeleteMissingResultSchema],
    ['Portfolio', schemas.PortfolioSchema],
    ['PortfolioList', schemas.PortfolioListSchema],
    ['TrmDomainList', schemas.DomainListSchema],
    ['TrmDomainRef', schemas.DomainRefSchema],
    ['TrmLayers', schemas.LayersSchema],
    ['TrmLayerRef', schemas.LayerSchema],
    ['TrmLandscape', schemas.LandscapeSchema],
    ['TrmTechnologyView', schemas.TechnologyViewSchema],
    ['TrmStandardUsage', schemas.StandardUsageSchema],
    ['TrmInitiativeSummary', schemas.InitiativeSummarySchema],
    ['TrmInitiativePage', schemas.InitiativePageSchema],
    ['TrmInitiative', schemas.InitiativeSchema],
    ['TrmPlannedApplicationRef', schemas.PlannedRefSchema],
    ['TrmPlannedApplicationList', schemas.PlannedApplicationListSchema],
  ] as const)('%s', (name, schema) => expectSameResponse(name, schema))
})

describe('TRM requests only send what the API accepts', () => {
  it.each([
    ['UpdateTrmApplication', schemas.UpdateApplicationRequest],
    ['SetTrmApplicationPortfolios', schemas.SetPortfoliosRequest],
    ['CreatePortfolio', schemas.CreatePortfolioRequest],
    ['UpdatePortfolio', schemas.UpdatePortfolioRequest],
    ['CreateTrmNamed', schemas.CreateNamedRequest],
    ['UpdateTrmNamed', schemas.UpdateNamedRequest],
    ['SetTrmApplicationSubdomains', schemas.SetSubdomainsRequest],
    ['UpdateTrmLayer', schemas.UpdateLayerRequest],
    ['SetTrmLayerMapping', schemas.SetLayerMappingRequest],
    ['CreateTrmInitiative', schemas.CreateInitiativeRequest],
    ['UpdateTrmInitiative', schemas.UpdateInitiativeRequest],
    ['LinkTrmPlannedApplication', schemas.LinkPlannedRequest],
    ['DeleteTrmMissingRecords', schemas.DeleteMissingRequest],
  ] as const)('%s', (name, schema) => expectAcceptedRequest(name, schema))
})
