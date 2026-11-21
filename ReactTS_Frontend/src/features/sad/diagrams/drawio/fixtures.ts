// draw.io files for tests and journeys, written as draw.io writes them (uncompressed).

export const drawioModel = (cells: string) => `<mxGraphModel dx="1000" dy="600"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
export const drawioFile = (...pages: [name: string, body: string][]) =>
  `<mxfile host="app.diagrams.net">${pages.map(([name, body]) => `<diagram name="${name}" id="${name}">${body}</diagram>`).join('')}</mxfile>`
export const vertex = (id: string, value: string, style: string, [x, y, w, h]: number[], parent = '1') =>
  `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`
export const edge = (id: string, value: string, style: string, source?: string, target?: string) =>
  `<mxCell id="${id}" value="${value}" style="${style}" edge="1" parent="1"${source ? ` source="${source}"` : ''}${target ? ` target="${target}"` : ''}><mxGeometry relative="1" as="geometry"/></mxCell>`

const AZURE = (icon: string) => `image;html=1;image=img/lib/azure2/${icon}.svg;`

/** CRM's box with its portal (an Azure icon), a customer, the bank and Billing; a note; three arrows. */
export const SOLUTION_DRAWIO = drawioFile([
  'Solution',
  drawioModel(
    [
      vertex('crm', 'CRM', 'swimlane;html=1;', [0, 0, 300, 200]),
      vertex('portal', 'Portal', AZURE('app_services/App_Services'), [40, 60, 176, 64], 'crm'),
      vertex('customer', 'Customer', 'shape=umlActor;', [-300, 60, 176, 64]),
      vertex('bank', 'Bank', 'rounded=0;', [500, 0, 176, 64]),
      vertex('billing', 'Billing', 'rounded=0;', [500, 200, 176, 64]),
      vertex('note', 'Draft only', 'text;html=1;', [0, 400, 120, 30]),
      edge('a1', 'Agent portal', '', 'customer', 'portal'),
      edge('a2', 'Payment API', 'dashed=1;', 'portal', 'bank'),
      edge('a3', 'Billing API', '', 'portal', 'billing'),
    ].join(''),
  ),
])

/** Two pages: a CI flow (Developer and Azure DevOps lanes, a step drawn outside them) and a CD flow. */
export const FLOWS_DRAWIO = drawioFile(
  [
    'CI flow',
    drawioModel(
      [
        vertex('dev', 'Developer', 'swimlane;horizontal=0;', [0, 0, 1000, 150]),
        vertex('ado', 'Azure DevOps', 'swimlane;horizontal=0;', [0, 150, 1000, 150]),
        vertex('start', 'Code change', 'shape=mxgraph.flowchart.terminator;', [40, 40, 176, 64], 'dev'),
        vertex('build', 'Build and scan', 'rounded=0;', [40, 40, 176, 64], 'ado'),
        vertex('check', 'Within policy?', 'rhombus;', [300, 40, 176, 64], 'ado'),
        vertex('deploy', 'Deploy to UAT', 'rounded=0;', [600, 400, 176, 64]),
        edge('c1', '', '', 'start', 'build'),
        edge('c2', '', '', 'build', 'check'),
        edge('c3', 'Yes', '', 'check', 'deploy'),
      ].join(''),
    ),
  ],
  ['CD flow', drawioModel([vertex('snow', 'ServiceNow change', 'swimlane;', [0, 0, 800, 150]), vertex('approve', 'Change approved?', 'rounded=0;', [40, 40, 176, 64], 'snow')].join(''))],
)

/** Dynatrace, Application Insights (an Azure icon), ServiceNow and the support team. */
export const MONITORING_DRAWIO = drawioFile([
  'Monitoring',
  drawioModel(
    [
      vertex('dt', 'Dynatrace', 'rounded=0;', [0, 0, 176, 64]),
      vertex('ai', 'App telemetry', AZURE('devops/Application_Insights'), [0, 200, 176, 64]),
      vertex('snow', 'ServiceNow', 'rounded=0;', [300, 0, 176, 64]),
      vertex('support', 'Support team', 'shape=umlActor;', [600, 0, 176, 64]),
      edge('m1', 'Incident', '', 'dt', 'snow'),
      edge('m2', 'Assigned', '', 'snow', 'support'),
    ].join(''),
  ),
])

/** MY01 with Southeast Asia, a VNet and subnet holding a VM and an App Service; PDC with a database server; the Internet with a customer. */
export const INFRA_DRAWIO = drawioFile([
  'Production',
  drawioModel(
    [
      vertex('sub', 'MY01 subscription', 'swimlane;', [0, 0, 1000, 700]),
      vertex('sea', 'Southeast Asia', 'swimlane;', [20, 40, 900, 600], 'sub'),
      vertex('vnet', 'vnet-crm', 'swimlane;', [20, 40, 800, 400], 'sea'),
      vertex('snet', 'snet-app', 'swimlane;', [20, 40, 700, 200], 'vnet'),
      vertex('vm', 'CRM VM', 'rounded=0;', [20, 40, 176, 64], 'snet'),
      vertex('app', 'Portal', AZURE('app_services/App_Services'), [300, 40, 176, 64], 'snet'),
      vertex('pdc', 'PDC', 'swimlane;', [0, 800, 400, 200]),
      vertex('db', 'DB server', 'rounded=0;', [20, 40, 176, 64], 'pdc'),
      vertex('net', 'Internet', 'swimlane;', [1100, 0, 300, 200]),
      vertex('user', 'Customer', 'shape=umlActor;', [20, 40, 176, 64], 'net'),
      edge('i1', 'HTTPS', '', 'user', 'app'),
      edge('i2', 'SQL', '', 'app', 'db'),
    ].join(''),
  ),
])
