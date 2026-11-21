import { describe, it } from 'vitest'
import { expectAcceptedRequest, expectSameResponse } from '../../test/contract'
import * as schemas from './schemas'

describe('SAD responses match the API contract', () => {
  it.each([
    ['SadTemplate', schemas.TemplateSchema],
    ['SadTemplateGroup', schemas.GroupSchema],
    ['SadTableColumn', schemas.ColumnSchema],
    ['SadOption', schemas.OptionSchema],
    ['SadCondition', schemas.ConditionSchema],
    ['SadSectionCompletion', schemas.CompletionSchema],
    ['SadListItem', schemas.ListItemSchema],
    ['SadListPage', schemas.ListPageSchema],
    ['SadApplicationRef', schemas.ApplicationRefSchema],
    ['SadPersonRef', schemas.PersonRefSchema],
    ['SadOverview', schemas.OverviewSchema],
    ['SadVersion', schemas.VersionSchema],
    ['SavedSadSection', schemas.SavedSectionSchema],
    ['SadDiagramRef', schemas.DiagramRefSchema],
    ['SadDiagramZone', schemas.ZoneSchema],
    ['SadDiagramBox', schemas.BoxSchema],
    ['SadDiagramLine', schemas.LineSchema],
    ['SadDiagram', schemas.DiagramSchema],
    ['SadDiagrams', schemas.DiagramsSchema],
    ['SavedSadDiagram', schemas.SavedDiagramSchema],
    ['SadBusinessApplication', schemas.BusinessApplicationSchema],
    ['SadBusinessApplications', schemas.BusinessApplicationsSchema],
    ['SadHosting', schemas.HostingSchema],
    ['SadServer', schemas.ServerSchema],
    ['SadDiagramApi', schemas.DiagramApiSchema],
    ['SadCallApplication', schemas.CallApplicationSchema],
    ['SadApplicationCall', schemas.ApplicationCallSchema],
    ['SadApplicationCalls', schemas.ApplicationCallsSchema],
    ['SadUpload', schemas.UploadSchema],
    ['SadUploads', schemas.UploadsSchema],
    ['SadServers', schemas.ServersSchema],
    ['SadDiagramDefaults', schemas.DiagramDefaultsSchema],
    ['SadVersionRef', schemas.VersionRefSchema],
    ['SadApi', schemas.ApiSchema],
    ['SadApiPage', schemas.ApiPageSchema],
    ['SadRetentionStandard', schemas.RetentionStandardSchema],
    ['SadRetentionList', schemas.RetentionListSchema],
  ])('%s', (name, schema) => {
    expectSameResponse(name, schema)
  })
})

describe('SAD requests are accepted by the API', () => {
  it.each([
    ['SaveSadSection', schemas.SaveSectionSchema],
    ['SaveSadDiagram', schemas.SaveDiagramSchema],
    ['SaveSadDiagramDefaults', schemas.SaveDiagramDefaultsSchema],
    ['CreateSadRetentionStandard', schemas.CreateRetentionSchema],
    ['UpdateSadRetentionStandard', schemas.UpdateRetentionSchema],
  ])('%s', (name, schema) => {
    expectAcceptedRequest(name, schema)
  })
})
