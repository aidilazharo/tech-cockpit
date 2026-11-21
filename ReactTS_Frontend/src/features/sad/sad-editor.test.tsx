import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  json,
  mockApi,
  problem,
  renderRoute,
  signInWith,
} from "../../test/harness";
import { applicationSummary, page as trmPage } from "../trm/fixtures";
import { calls } from "./calls/fixtures";
import { drawioFile, drawioModel, vertex } from "./diagrams/drawio/fixtures";
import {
  ADA,
  APP_BILLING,
  APP_CRM,
  diagramSlots,
  retention,
  STANDARD_ID,
  template,
  version,
  VERSION_ID,
} from "./fixtures";
import { SAD_ANY } from "./permissions";
import type { SadSectionKey, Version } from "./schemas";

let api: ReturnType<typeof mockApi>;
const EDIT = `/api/v1/sad/versions/${VERSION_ID}`;
/** Saves like the API: the section comes back with the answers sent and a new row version. */
const saved = (section: SadSectionKey) => (call: { body: unknown }) =>
  json(200, {
    section,
    rowVersion: 1,
    answers: (call.body as { answers: unknown }).answers,
    completion: version().completion,
    hidden: version().hidden,
  });

/** A draft whose security answers say the application uses APIs (so the API inventory applies). */
const usesApis = () =>
  version({
    sections: version().sections.map((s) =>
      s.key === "security-design"
        ? { ...s, answers: { "uses-apis": { value: { answer: "yes" } } } }
        : s,
    ),
  });

function serve(data: Version = version()) {
  api.on(`GET ${EDIT}`, json(200, data));
}

beforeEach(() => {
  api = mockApi();
  api.on(`GET ${EDIT}/uploads`, json(200, { items: [] }));
  api.on("GET /api/v1/me/notifications/unread-count", json(200, { unread: 0 }));
  api.on("GET /api/v1/sad/template", json(200, template));
  api.on(
    "GET /api/v1/sad/retention-standards",
    json(200, { items: retention }),
  );
  signInWith([...SAD_ANY, "trm:application:read"]);
  serve();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const open = (section: SadSectionKey) =>
  renderRoute(`/sad/versions/${VERSION_ID}/edit?section=${section}`);
const question = (name: string) => screen.getByRole("group", { name });
const choose = async (
  container: HTMLElement,
  label: string,
  option: string,
) => {
  await userEvent.click(
    within(container).getByRole("combobox", { name: label }),
  );
  await userEvent.click(await screen.findByRole("option", { name: option }));
};
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save section" }));
const body = (section: SadSectionKey) =>
  api.callsTo(`PUT ${EDIT}/sections/${section}`).at(-1)?.body as {
    answers: Record<string, unknown>;
    version: number;
  };

describe("Editing a SAD draft", () => {
  it("answers a section, showing questions as they start to apply, and saves it with its row version", async () => {
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      saved("solution-integration"),
    );
    open("solution-integration");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Solution & Integration Architecture",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Application hosted in AIA Azure and PDC/SDC",
      }),
    ).not.toBeInTheDocument();

    const hosting = question("Application hosting location");
    await userEvent.click(
      within(hosting).getByRole("checkbox", { name: "AIA Azure" }),
    );
    await userEvent.click(
      within(hosting).getByRole("checkbox", { name: "Other" }),
    );
    await userEvent.type(
      within(hosting).getByRole("textbox", { name: "Other (specify)" }),
      "Colo",
    );
    expect(
      screen.getByRole("heading", {
        name: "Application hosted in AIA Azure and PDC/SDC",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Answer for AIA-hosted applications."),
    ).toBeInTheDocument();
    await choose(
      question("Server/VM check-in process"),
      "Server/VM check-in process",
      "Yes",
    );
    await userEvent.type(
      within(question("Server/VM check-in process")).getByRole("textbox", {
        name: "How (optional)",
      }),
      "Agents",
    );
    await userEvent.click(
      within(question("Application accessibility")).getByRole("checkbox", {
        name: "Internet",
      }),
    );
    await userEvent.click(
      within(question("Internet-facing protection")).getByRole("checkbox", {
        name: "WAF",
      }),
    );
    // Unticking the last option clears the answer again.
    await userEvent.click(
      within(question("Internet-facing protection")).getByRole("checkbox", {
        name: "WAF",
      }),
    );

    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    expect(body("solution-integration")).toEqual({
      version: 0,
      answers: {
        "hosting-location": {
          value: { selected: ["aia-azure", "other"], other: "Colo" },
        },
        "vm-check-in": { value: { answer: "yes", details: "Agents" } },
        accessibility: { value: { selected: ["internet"] } },
      },
    });
  });

  it("keeps question fields at a readable width, while table questions use the whole page", async () => {
    open("security-design");
    const users = await screen.findByRole("group", { name: "Number of users" });
    // jsdom has no layout: the width shows only as the readable-width class.
    expect(users.closest(".max-w-3xl")).not.toBeNull();
    expect(question("Security scans").closest(".max-w-3xl")).toBeNull();
    expect(
      screen
        .getByRole("heading", {
          level: 2,
          name: "Security Architecture Design",
        })
        .closest(".max-w-3xl"),
    ).not.toBeNull();
  });

  it("needs a reason for a question that does not apply", async () => {
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      saved("solution-integration"),
    );
    open("solution-integration");
    await userEvent.click(
      within(
        await screen.findByRole("group", { name: "Application accessibility" }),
      ).getByRole("checkbox", { name: "Does not apply" }),
    );
    const accessibility = question("Application accessibility");
    expect(
      within(accessibility).getByText("Say why it does not apply"),
    ).toBeInTheDocument();
    await save();
    expect(
      api.callsTo(`PUT ${EDIT}/sections/solution-integration`),
    ).toHaveLength(0);
    expect(
      screen.getByText(
        "Some answers need attention: see the messages under them.",
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      within(accessibility).getByRole("textbox", {
        name: "Why it does not apply",
      }),
      "Batch job",
    );
    await save();
    await waitFor(() =>
      expect(body("solution-integration").answers).toEqual({
        accessibility: { notApplicable: true, reason: "Batch job" },
      }),
    );
    // A save shows the section afresh; ticking "does not apply" off again returns to answering.
    await userEvent.click(
      within(question("Application accessibility")).getByRole("checkbox", {
        name: "Does not apply",
      }),
    );
    expect(
      within(question("Application accessibility")).getByRole("checkbox", {
        name: "Internal",
      }),
    ).toBeInTheDocument();
  });

  it("shows the API's message under the question, and offers a reload after someone else's save", async () => {
    api.on(`PUT ${EDIT}/sections/security-design`, problem(400, "Bad Request"));
    api.on(`PUT ${EDIT}/sections/security-design`, () =>
      json(400, {
        title: "Bad Request",
        status: 400,
        errors: [
          { path: "answers.user-count.value", message: "Too small" },
          {
            path: "answers.acacm-link.value.0.url",
            message: "Links must start with https://",
          },
          { path: "version", message: "x" },
        ],
      }),
    );
    open("security-design");
    await userEvent.type(
      await screen.findByRole("spinbutton", { name: /Number of users/ }),
      "12",
    );
    await save();
    expect(
      await within(question("Number of users")).findByText("Too small"),
    ).toBeInTheDocument();
    expect(
      within(question("Link to your latest ACACM document")).getByText(
        "Links must start with https://",
      ),
    ).toBeInTheDocument();
    await userEvent.clear(
      screen.getByRole("spinbutton", { name: /Number of users/ }),
    );
    expect(
      within(question("Number of users")).queryByText("Too small"),
    ).not.toBeInTheDocument();

    api.on(
      `PUT ${EDIT}/sections/security-design`,
      problem(409, "Conflict", "Someone else changed this section."),
    );
    await save();
    const reload = await screen.findByRole("button", { name: "Reload" });
    await userEvent.click(reload);
    await waitFor(() =>
      expect(api.callsTo(`GET ${EDIT}`).length).toBeGreaterThan(1),
    );
  });

  it('edits links, numbers, choices with "other", fixed and added table rows', async () => {
    api.on(`PUT ${EDIT}/sections/security-design`, saved("security-design"));
    open("security-design");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a link" }),
    );
    const links = question("Link to your latest ACACM document");
    await userEvent.type(
      within(links).getByRole("textbox", { name: "Link 1 text (optional)" }),
      "ACACM",
    );
    await userEvent.type(
      within(links).getByRole("textbox", { name: "Link 1 address" }),
      "aia.com/acacm",
    );
    await userEvent.click(
      within(links).getByRole("button", { name: "Add a link" }),
    );
    // Editing the second link leaves the first as it is.
    await userEvent.type(
      within(links).getByRole("textbox", { name: "Link 2 text (optional)" }),
      "Spare",
    );
    await userEvent.type(
      within(links).getByRole("textbox", { name: "Link 2 address" }),
      "aia.com/spare",
    );
    expect(
      within(links).getByRole("textbox", { name: "Link 1 text (optional)" }),
    ).toHaveValue("ACACM");
    await userEvent.click(
      within(links).getByRole("button", { name: "Remove link 2" }),
    );
    await choose(
      question("Authentication method"),
      "Authentication method",
      "Other",
    );
    await userEvent.type(
      within(question("Authentication method")).getByRole("textbox", {
        name: "Other (specify)",
      }),
      "Kerberos",
    );
    await userEvent.type(
      screen.getByRole("spinbutton", { name: /Number of users/ }),
      "1200",
    );
    const scans = question("Security scans");
    await choose(
      within(scans).getByRole("group", { name: "Veracode SAST & SCA scan" }),
      "Status",
      "Done",
    );
    const roles = question("Roles and authorised permissions");
    await userEvent.type(
      within(
        within(roles).getByRole("group", { name: "Application User" }),
      ).getByRole("textbox", { name: "Authorized permission" }),
      "Read",
    );
    await userEvent.click(
      within(roles).getByRole("button", { name: "Add a row" }),
    );
    const added = within(roles).getByRole("group", { name: "Row 1" });
    await userEvent.type(
      within(added).getByRole("textbox", { name: "Row name" }),
      "Auditors",
    );
    await userEvent.type(
      within(added).getByRole("textbox", { name: "Authorized permission" }),
      "Read logs",
    );
    await userEvent.click(
      within(roles).getByRole("button", { name: "Add a row" }),
    );
    await userEvent.click(
      within(roles).getByRole("button", { name: "Remove row 2" }),
    );
    await save();
    await waitFor(() => expect(body("security-design")).toBeDefined());
    const answers = body("security-design").answers;
    expect(answers["acacm-link"]).toEqual({
      value: [{ label: "ACACM", url: "https://aia.com/acacm" }],
    });
    expect(answers["authentication-method"]).toEqual({
      value: { selected: "other", other: "Kerberos" },
    });
    expect(answers["user-count"]).toEqual({ value: 1200 });
    expect(answers["security-scans"]).toEqual({
      value: [{ row: "Veracode SAST & SCA scan", cells: { status: "done" } }],
    });
    expect(answers["role-permissions"]).toEqual({
      value: [
        { row: "Application User", cells: { permission: "Read" } },
        {
          id: expect.any(String),
          row: "Auditors",
          cells: { permission: "Read logs" },
        },
      ],
    });
  });

  it("answers TRM fields that TRM does not hold, shows the ones it does, and keeps names hidden when they are", async () => {
    serve(
      version({ trm: { ...version().trm!, restricted: ["businessOwner"] } }),
    );
    api.on(
      `PUT ${EDIT}/sections/application-details`,
      saved("application-details"),
    );
    open("application-details");
    expect(
      await screen.findByRole("group", { name: "Supporting Entity" }),
    ).toHaveTextContent("AIA BhdFrom TRM (ServiceNow)");
    expect(question("Business Owner")).toHaveTextContent("Restricted");
    expect(question("Application Name")).toHaveTextContent("CRM");
    const classification = question("Data Classification");
    expect(classification).toHaveTextContent(
      "TRM does not hold this: answer it here.",
    );
    await choose(classification, "Data Classification", "Confidential");
    await choose(question("ICFR Application"), "ICFR Application", "No");
    await save();
    await waitFor(() =>
      expect(body("application-details").answers).toEqual({
        "data-classification": { value: { selected: "confidential" } },
        icfr: { value: { answer: "no" } },
      }),
    );
  });

  it("fills the API inventory: dependent applications from TRM, and no names for someone who may not see them", async () => {
    serve({ ...usesApis(), namesHidden: true });
    api.on(
      "GET /api/v1/trm/applications",
      json(
        200,
        trmPage([
          applicationSummary({
            id: APP_BILLING,
            name: "Billing",
            number: "APM-2",
          }),
        ]),
      ),
    );
    api.on(`PUT ${EDIT}/sections/api-inventory`, saved("api-inventory"));
    open("api-inventory");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a row" }),
    );
    const row = screen.getByRole("group", { name: "Row 1" });
    expect(row).toHaveTextContent("Hidden: you cannot see people’s names");
    await userEvent.type(
      within(row).getByRole("textbox", { name: "API name" }),
      "Policy API",
    );
    await choose(row, "Third-party API", "No");
    await userEvent.type(
      within(row).getByRole("spinbutton", { name: /Calls per day/ }),
      "50",
    );
    await userEvent.type(
      within(row).getByRole("combobox", {
        name: "Add a dependent application",
      }),
      "Bi",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Billing/ }),
    );
    // The same application once only.
    await userEvent.type(
      within(row).getByRole("combobox", {
        name: "Add a dependent application",
      }),
      "Bi",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Billing/ }),
    );
    expect(within(row).getAllByText("Billing")).toHaveLength(1);
    await userEvent.type(
      within(row).getByRole("textbox", { name: "Other systems (optional)" }),
      "Mainframe",
    );
    await save();
    await waitFor(() => expect(body("api-inventory")).toBeDefined());
    expect(body("api-inventory").answers.apis).toEqual({
      value: [
        {
          id: expect.any(String),
          cells: {
            name: "Policy API",
            thirdParty: "no",
            calls: 50,
            dependencies: {
              items: [{ id: APP_BILLING, name: "Billing" }],
              other: "Mainframe",
            },
          },
        },
      ],
    });
    await userEvent.click(
      within(row).getByRole("button", { name: "Remove Billing" }),
    );
    expect(within(row).queryByText("Billing")).not.toBeInTheDocument();
  });

  it("picks people for person columns, and offers only free text without the TRM application search", async () => {
    signInWith([...SAD_ANY, "people:directory:read"]);
    serve(usesApis());
    api.on(
      "GET /api/v1/people",
      json(200, {
        items: [{ ...ADA, email: "ada@aia.com", isExternal: false }],
      }),
    );
    open("api-inventory");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a row" }),
    );
    const row = screen.getByRole("group", { name: "Row 1" });
    expect(
      within(row).queryByRole("combobox", {
        name: "Add a dependent application",
      }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      within(row).getByRole("combobox", { name: "API owner" }),
      "Ad",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Ada Admin/ }),
    );
    expect(
      within(row).getByRole("combobox", { name: "API owner" }),
    ).toHaveValue("Ada Admin");
    await userEvent.clear(
      within(row).getByRole("combobox", { name: "API owner" }),
    );
    expect(
      within(row).getByRole("combobox", { name: "API owner" }),
    ).toHaveValue("");
  });

  it("types an owner who is not a TechCockpit user, and lists the data connected as data objects with their key attributes", async () => {
    signInWith([...SAD_ANY, "people:directory:read"]);
    serve(usesApis());
    api.on(`PUT ${EDIT}/sections/api-inventory`, saved("api-inventory"));
    open("api-inventory");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a row" }),
    );
    const row = screen.getByRole("group", { name: "Row 1" });
    await userEvent.type(
      within(row).getByRole("textbox", { name: "API name" }),
      "Claims API",
    );
    await userEvent.click(
      within(row).getByRole("checkbox", {
        name: "Type the API owner (not a TechCockpit user)",
      }),
    );
    expect(
      within(row).queryByRole("combobox", { name: "API owner" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      within(row).getByRole("textbox", { name: "API owner" }),
      "Vendor support desk",
    );
    const data = within(row).getByRole("group", {
      name: "Data connected to the API",
    });
    await userEvent.click(
      within(data).getByRole("button", { name: "Add a data object" }),
    );
    await userEvent.click(
      within(data).getByRole("button", { name: "Add a data object" }),
    );
    await userEvent.type(
      within(data).getAllByRole("textbox", { name: "Data object" })[0],
      "Claim",
    );
    await userEvent.type(
      within(data).getAllByRole("textbox", { name: "Key attributes" })[0],
      "claim number, amount",
    );
    await userEvent.click(
      within(data).getAllByRole("button", {
        name: "Remove the data object",
      })[1],
    );
    await save();
    await waitFor(() => expect(body("api-inventory")).toBeDefined());
    const [saved1] = (
      body("api-inventory").answers.apis as {
        value: { cells: Record<string, unknown> }[];
      }
    ).value;
    expect(saved1.cells).toMatchObject({
      name: "Claims API",
      apiOwner: { name: "Vendor support desk" },
      data: [{ object: "Claim", attributes: "claim number, amount" }],
    });
    // Back to picking: the typed name goes.
    await userEvent.click(
      within(screen.getByRole("group", { name: "Row 1" })).getByRole(
        "checkbox",
        { name: "Type the API owner (not a TechCockpit user)" },
      ),
    );
    expect(
      within(screen.getByRole("group", { name: "Row 1" })).getByRole(
        "combobox",
        { name: "API owner" },
      ),
    ).toHaveValue("");
  });

  it("ticks the standard backup rows that apply and names their resources", async () => {
    api.on(`PUT ${EDIT}/sections/backup`, saved("backup"));
    open("backup");
    await screen.findByRole("checkbox", {
      name: "Database - MsSQL on VM — Financial Transaction",
    });
    const schedule = question("Cloud services backup schedule");
    expect(schedule).toHaveTextContent(
      "Yearly 8 Years · Monthly 12 months · Weekly 5 weeks · Daily 7 days",
    );
    await userEvent.click(
      within(schedule).getByRole("checkbox", {
        name: "Database - MsSQL on VM — Financial Transaction",
      }),
    );
    // Each ticked row's fields are named within that row.
    const row = within(schedule).getByRole("group", {
      name: "Database - MsSQL on VM — Financial Transaction",
    });
    await userEvent.type(
      within(row).getByRole("textbox", { name: "Resource name" }),
      "sql-crm-prod",
    );
    await userEvent.type(
      within(row).getByRole("textbox", { name: "Comment (optional)" }),
      "Prod",
    );
    await save();
    await waitFor(() =>
      expect(body("backup").answers).toEqual({
        "backup-schedule": {
          value: {
            rows: [
              {
                standardId: STANDARD_ID,
                resourceName: "sql-crm-prod",
                comment: "Prod",
              },
            ],
          },
        },
      }),
    );
    await userEvent.click(
      within(question("Cloud services backup schedule")).getByRole("checkbox", {
        name: "Database - MsSQL on VM — Financial Transaction",
      }),
    );
    expect(
      within(question("Cloud services backup schedule")).queryByRole(
        "textbox",
        { name: "Resource name" },
      ),
    ).not.toBeInTheDocument();
  });

  it("records a date, and shows a section the reader may view but not edit", async () => {
    serve(
      version({
        sections: version().sections.map((s) =>
          s.key === "network"
            ? {
                ...s,
                editable: false,
                answers: { "network-note": { value: "Hub and spoke" } },
              }
            : s,
        ),
      }),
    );
    api.on(`PUT ${EDIT}/sections/resiliency`, saved("resiliency"));
    open("resiliency");
    const drTest = await screen.findByRole("textbox", { name: "Last DR test" });
    await userEvent.type(drTest, "01012026");
    await userEvent.clear(drTest);
    await userEvent.type(drTest, "15092026");
    await save();
    await waitFor(() =>
      expect(body("resiliency").answers).toEqual({
        "dr-test-date": { value: "2026-09-15" },
      }),
    );

    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(
      within(nav).getByRole("link", {
        name: /Physical and Network Architecture/,
      }),
    ).toHaveTextContent("View only");
    await userEvent.click(
      within(nav).getByRole("link", {
        name: /Physical and Network Architecture/,
      }),
    );
    expect(
      await screen.findByText("You can view this section but not edit it."),
    ).toBeInTheDocument();
    expect(screen.getByText("Hub and spoke")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save section" }),
    ).not.toBeInTheDocument();
  });

  it("asks before leaving a section with unsaved changes", async () => {
    const { here } = open("solution-integration");
    await userEvent.click(
      within(
        await screen.findByRole("group", { name: "Application accessibility" }),
      ).getByRole("checkbox", { name: "Internal" }),
    );
    const nav = screen.getByRole("navigation", { name: "Sections" });
    await userEvent.click(
      within(nav).getByRole("link", { name: /Data Protection/ }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Leave this section?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(here()).toBe(
      `/sad/versions/${VERSION_ID}/edit?section=solution-integration`,
    );
    await userEvent.click(
      within(nav).getByRole("link", { name: /Data Protection/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Leave without saving",
      }),
    );
    await waitFor(() =>
      expect(here()).toBe(
        `/sad/versions/${VERSION_ID}/edit?section=data-protection`,
      ),
    );
    // Nothing unsaved now: moving on needs no question.
    await userEvent.click(
      within(nav).getByRole("link", { name: /Deployment Architecture/ }),
    );
    await waitFor(() =>
      expect(here()).toBe(
        `/sad/versions/${VERSION_ID}/edit?section=deployment`,
      ),
    );
    await userEvent.click(
      within(nav).getByRole("link", { name: /Deployment Architecture/ }),
    );
  });

  it("shows how far each section is answered as a bar beside the count", async () => {
    serve(
      version({
        completion: version().completion.map((c) =>
          c.section === "network" ? { ...c, answered: 1, missing: ["y"] } : c,
        ),
      }),
    );
    open("solution-integration");
    const nav = await screen.findByRole("navigation", { name: "Sections" });
    expect(
      within(nav).getByRole("progressbar", {
        name: "Physical and Network Architecture: 1 of 2 answered",
      }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(
      within(nav).getByRole("progressbar", {
        name: "Solution & Integration Architecture: 0 of 2 answered",
      }),
    ).toHaveAttribute("aria-valuenow", "0");
  });

  it("asks before leaving the editor with unsaved changes by any link, and before the tab is closed", async () => {
    const { here } = open("solution-integration");
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    await screen.findByRole("group", { name: "Application accessibility" });
    expect(unload()).toBe(false);
    await userEvent.click(
      within(
        screen.getByRole("group", { name: "Application accessibility" }),
      ).getByRole("checkbox", { name: "Internal" }),
    );
    expect(unload()).toBe(true);
    await userEvent.click(
      screen.getByRole("link", { name: "Review and submit" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Leave this section?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(here()).toBe(
      `/sad/versions/${VERSION_ID}/edit?section=solution-integration`,
    );
    await userEvent.click(
      screen.getByRole("link", { name: "Back to the draft" }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Leave without saving",
      }),
    );
    await waitFor(() => expect(here()).toBe(`/sad/versions/${VERSION_ID}`));
  });

  it("shows section 4 the infrastructure diagram read-only, even to its editors in section 3", async () => {
    const withRef = {
      ...template,
      sections: template.sections.map((s) =>
        s.key === "resiliency"
          ? {
              ...s,
              groups: [
                {
                  ...s.groups[0],
                  diagrams: [
                    {
                      slot: "infrastructure" as const,
                      view: "infrastructure" as const,
                    },
                  ],
                },
              ],
            }
          : s,
      ),
    };
    api.on("GET /api/v1/sad/template", json(200, withRef));
    const [, infrastructureSlot] = diagramSlots();
    api.on(
      `GET ${EDIT}/diagrams`,
      json(200, {
        items: [{ ...infrastructureSlot, editableViews: ["infrastructure"] }],
        apis: [],
      }),
    );
    open("resiliency");
    const infrastructure = await screen.findByRole("region", {
      name: "Infrastructure diagram",
    });
    expect(
      within(infrastructure).getByText(
        "Drawn in “Physical and Network Architecture”. Shown here read-only.",
      ),
    ).toBeInTheDocument();
    expect(
      within(infrastructure).queryByRole("button", { name: "Add zone" }),
    ).not.toBeInTheDocument();
    expect(
      within(infrastructure).queryByRole("radio", { name: "Does not apply" }),
    ).not.toBeInTheDocument();
  });

  it("saves without a Does not apply left blank on a question that no longer applies", async () => {
    serve(
      version({
        sections: version().sections.map((s) =>
          s.key === "solution-integration"
            ? {
                ...s,
                answers: {
                  "internet-protection": { notApplicable: true, reason: "" },
                },
              }
            : s,
        ),
      }),
    );
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      saved("solution-integration"),
    );
    open("solution-integration");
    await userEvent.click(
      within(
        await screen.findByRole("group", { name: "Application accessibility" }),
      ).getByRole("checkbox", { name: "Internal" }),
    );
    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    expect(body("solution-integration").answers).not.toHaveProperty(
      "internet-protection",
    );
  });

  it("refreshes the APIs integration connections may link to once the API inventory is saved", async () => {
    serve(usesApis());
    api.on(`PUT ${EDIT}/sections/api-inventory`, saved("api-inventory"));
    open("api-inventory");
    await screen.findByRole("heading", { level: 2, name: "API Inventory" });
    const before = api.callsTo(`GET ${EDIT}/diagrams`).length;
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Does not apply" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Why it does not apply" }),
      "Only internal calls",
    );
    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.callsTo(`GET ${EDIT}/diagrams`).length).toBeGreaterThan(
        before,
      ),
    );
  });

  it("opens the first section the reader may edit, and refuses a version that is no longer a draft", async () => {
    serve(
      version({
        sections: version().sections.map((s) => ({
          ...s,
          editable: s.key === "logging",
        })),
        completion: version().completion.map((c) => ({
          ...c,
          answered: c.total,
        })),
      }),
    );
    renderRoute(`/sad/versions/${VERSION_ID}/edit`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Logging & Monitoring",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every question in this section is answered"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Sections" })).getAllByText(
        "Complete",
      ).length,
    ).toBeGreaterThan(1);
  });

  it("says when the version is no longer a draft", async () => {
    serve(version({ status: "in_approval" }));
    open("network");
    expect(
      await screen.findByText("This version can no longer be edited."),
    ).toBeInTheDocument();
  });

  it("clears answers that are emptied again, and answers a TRM field as text", async () => {
    serve(
      version({
        trm: {
          ...version().trm!,
          values: { ...version().trm!.values, ownedBusinessUnit: null },
        },
      }),
    );
    api.on(
      `PUT ${EDIT}/sections/application-details`,
      saved("application-details"),
    );
    open("application-details");
    const entity = await screen.findByRole("textbox", {
      name: "Supporting Entity",
    });
    await userEvent.type(entity, "AIA Bhd");
    await choose(question("ICFR Application"), "ICFR Application", "Yes");
    const details = within(question("ICFR Application")).getByRole("textbox", {
      name: "Details (optional)",
    });
    await userEvent.type(details, "SOX");
    await userEvent.clear(details);
    await save();
    await waitFor(() =>
      expect(body("application-details").answers).toEqual({
        "supporting-entity": { value: "AIA Bhd" },
        icfr: { value: { answer: "yes" } },
      }),
    );
    await userEvent.clear(
      screen.getByRole("textbox", { name: "Supporting Entity" }),
    );
    await save();
    await waitFor(() =>
      expect(body("application-details").answers).toEqual({
        icfr: { value: { answer: "yes" } },
      }),
    );
  });

  it("records dates and numbers in table cells, and clears cells emptied again", async () => {
    serve(usesApis());
    api.on(`PUT ${EDIT}/sections/security-design`, saved("security-design"));
    open("security-design");
    const veracode = within(
      await screen.findByRole("group", { name: "Security scans" }),
    ).getByRole("group", { name: "Veracode SAST & SCA scan" });
    // A date typed and removed again leaves nothing behind.
    await userEvent.type(
      within(veracode).getByRole("textbox", { name: "Last date (optional)" }),
      "01092026",
    );
    await userEvent.clear(
      within(veracode).getByRole("textbox", { name: "Last date (optional)" }),
    );
    await userEvent.type(
      within(veracode).getByRole("textbox", { name: "Last date (optional)" }),
      "30092026",
    );
    const users = screen.getByRole("spinbutton", { name: /Number of users/ });
    await userEvent.type(users, "5");
    await userEvent.clear(users);
    await save();
    await waitFor(() =>
      expect(body("security-design").answers).toEqual({
        "uses-apis": { value: { answer: "yes" } },
        "security-scans": {
          value: [
            {
              row: "Veracode SAST & SCA scan",
              cells: { lastDate: "2026-09-30" },
            },
          ],
        },
      }),
    );
  });

  it("shows what went wrong when a save fails for another reason", async () => {
    api.on(
      `PUT ${EDIT}/sections/network`,
      problem(500, "Server error", "Something broke."),
    );
    open("network");
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: "Physical and Network Architecture notes",
      }),
      "Hub",
    );
    await save();
    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
  });

  it("shows the first readable section, read-only, to someone who can edit none", async () => {
    serve(
      version({
        sections: version().sections.map((s) => ({ ...s, editable: false })),
      }),
    );
    renderRoute(`/sad/versions/${VERSION_ID}/edit`);
    expect(
      await screen.findByText("You can view this section but not edit it."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Application Details" }),
    ).toBeInTheDocument();
  });

  it("flags local authentication in the section 8 editor only", async () => {
    serve(version({ localAuthentication: true }));
    open("security-iam");
    expect(await screen.findByText("Local authentication")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The application does its own authentication (section 5): check the controls and roles here cover it.",
      ),
    ).toBeInTheDocument();
  });

  it("asks the justification of local authentication without a Not applicable option", async () => {
    serve(
      version({
        sections: version().sections.map((s) =>
          s.key === "security-design"
            ? {
                ...s,
                answers: {
                  "authentication-method": {
                    value: { selected: "other", other: "Kerberos" },
                  },
                },
              }
            : s,
        ),
      }),
    );
    open("security-design");
    const justification = await screen.findByRole("group", {
      name: "Why the application does its own authentication",
    });
    expect(
      within(justification).queryByRole("checkbox", { name: "Does not apply" }),
    ).not.toBeInTheDocument();
  });

  it("warns while answering when the API session timeout is over 15 minutes without a refresh token", async () => {
    open("security-design");
    await userEvent.type(
      await screen.findByRole("spinbutton", { name: /API session timeout/ }),
      "30",
    );
    await choose(document.body, "An API refresh token is implemented", "No");
    expect(
      screen.getByText(
        "The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.",
      ),
    ).toBeInTheDocument();
    await choose(document.body, "An API refresh token is implemented", "Yes");
    expect(
      screen.queryByText(
        "The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.",
      ),
    ).not.toBeInTheDocument();
  });

  it("offers only active standard rows, and shows a ticked row since retired so it can be unticked", async () => {
    const retired = {
      id: "8e000000-0000-4000-8000-000000000009",
      serviceType: "Cosmos DB",
      dataType: "Others",
      yearly: "-",
      monthly: "12 months",
      weekly: "5 weeks",
      daily: "7 days",
      comment: null,
      active: false,
    };
    // Maintainers' list has retired rows too: they are not offered.
    api.on(
      "GET /api/v1/sad/retention-standards",
      json(200, {
        items: [
          ...retention,
          {
            ...retired,
            id: "8e000000-0000-4000-8000-00000000000a",
            serviceType: "Old row",
            version: 1,
            position: 3,
          },
        ],
      }),
    );
    const backup = {
      "backup-schedule": {
        value: {
          rows: [{ standardId: retired.id, resourceName: "cosmos-crm" }],
        },
      },
    };
    serve(
      version({
        retention: [retired],
        sections: version().sections.map((s) =>
          s.key === "backup" ? { ...s, answers: backup } : s,
        ),
      }),
    );
    api.on(`PUT ${EDIT}/sections/backup`, saved("backup"));
    open("backup");
    const schedule = await screen.findByRole("group", {
      name: "Cloud services backup schedule",
    });
    await within(schedule).findByRole("checkbox", {
      name: "Database - MsSQL on VM — Financial Transaction",
    });
    expect(
      within(schedule).queryByRole("checkbox", { name: /Old row/ }),
    ).not.toBeInTheDocument();
    const ticked = within(schedule).getByRole("checkbox", {
      name: "Cosmos DB — Others",
    });
    expect(ticked).toBeChecked();
    expect(schedule).toHaveTextContent(
      "No longer in the standard list: untick it, or keep it as approved before.",
    );
    await userEvent.click(ticked);
    await save();
    await waitFor(() => expect(body("backup").answers).toEqual({}));
  });

  it("says when the standard rows cannot be loaded, with a way to try again", async () => {
    api.on("GET /api/v1/sad/retention-standards", problem(500, "Server error"));
    open("backup");
    const schedule = await screen.findByRole("group", {
      name: "Cloud services backup schedule",
    });
    expect(
      await within(schedule).findByText(
        "The standard backup rows could not be loaded.",
      ),
    ).toBeInTheDocument();
    api.on(
      "GET /api/v1/sad/retention-standards",
      json(200, { items: retention }),
    );
    await userEvent.click(
      within(schedule).getByRole("button", { name: "Try again" }),
    );
    expect(
      await within(schedule).findByRole("checkbox", {
        name: "Database - MsSQL on VM — Financial Transaction",
      }),
    ).toBeInTheDocument();
  });

  it("ticks several backup rows and keeps each one's resource name", async () => {
    api.on(`PUT ${EDIT}/sections/backup`, saved("backup"));
    open("backup");
    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Database - MsSQL on VM — Financial Transaction",
      }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Storage Account - Blob Container — Non-business data",
      }),
    );
    const nameIn = (row: string) =>
      within(screen.getByRole("group", { name: row })).getByRole("textbox", {
        name: "Resource name",
      });
    await userEvent.type(
      nameIn("Storage Account - Blob Container — Non-business data"),
      "blob-1",
    );
    await userEvent.type(
      nameIn("Database - MsSQL on VM — Financial Transaction"),
      "sql-1",
    );
    await save();
    await waitFor(() =>
      expect(body("backup").answers).toEqual({
        "backup-schedule": {
          value: {
            rows: [
              { standardId: STANDARD_ID, resourceName: "sql-1" },
              { standardId: retention[1].id, resourceName: "blob-1" },
            ],
          },
        },
      }),
    );
  });

  it("clears a table, links and dependent applications that are emptied, and marks a single question as not applying", async () => {
    serve(usesApis());
    api.on(
      "GET /api/v1/trm/applications",
      json(
        200,
        trmPage([
          applicationSummary({
            id: APP_BILLING,
            name: "Billing",
            number: "APM-2",
          }),
        ]),
      ),
    );
    open("api-inventory");
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a row" }),
    );
    const row = screen.getByRole("group", { name: "Row 1" });
    await userEvent.type(
      within(row).getByRole("textbox", { name: "Other systems (optional)" }),
      "X",
    );
    await userEvent.clear(
      within(row).getByRole("textbox", { name: "Other systems (optional)" }),
    );
    await userEvent.type(
      within(row).getByRole("combobox", {
        name: "Add a dependent application",
      }),
      "Bi",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Billing/ }),
    );
    await userEvent.click(
      within(row).getByRole("button", { name: "Remove Billing" }),
    );
    await userEvent.click(
      within(row).getByRole("button", { name: "Remove row 1" }),
    );
    expect(
      screen.queryByRole("group", { name: "Row 1" }),
    ).not.toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Sections" });
    await userEvent.click(
      within(nav).getByRole("link", { name: /Security Architecture Design/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Leave without saving",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a link" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove link 1" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Link 1 address" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Answer Yes to fill the API inventory."),
    ).toBeInTheDocument();
    await userEvent.click(
      within(question("Number of users")).getByRole("checkbox", {
        name: "Does not apply",
      }),
    );
    expect(
      within(question("Number of users")).queryByRole("spinbutton"),
    ).not.toBeInTheDocument();
  });

  it("shows the API's message under a rich-text question", async () => {
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      json(400, {
        title: "Bad Request",
        status: 400,
        errors: [
          {
            path: "answers.solution-overview.value",
            message: "Keep the text under 20000 characters",
          },
        ],
      }),
    );
    open("solution-integration");
    const toolbar = await screen.findByRole("toolbar", {
      name: "Formatting for General overview",
    });
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Bullets" }),
    );
    await save();
    expect(
      await screen.findByText("Keep the text under 20000 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "General overview" }),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("offers a retry when the template cannot be loaded", async () => {
    let fail = true;
    api.on("GET /api/v1/sad/template", () =>
      fail ? problem(500, "Server error") : json(200, template),
    );
    open("network");
    const retry = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    await userEvent.click(retry);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Physical and Network Architecture",
      }),
    ).toBeInTheDocument();
  });

  it("formats rich text with headings, underline, strikethrough and font sizes", async () => {
    const overview = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Front Door" }] },
      ],
    };
    serve(
      version({
        sections: version().sections.map((s) =>
          s.key === "solution-integration"
            ? { ...s, answers: { "solution-overview": { value: overview } } }
            : s,
        ),
      }),
    );
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      saved("solution-integration"),
    );
    open("solution-integration");
    const editor = await screen.findByRole("textbox", {
      name: "General overview",
    });
    const toolbar = screen.getByRole("toolbar", {
      name: "Formatting for General overview",
    });
    // Focused, not clicked: placing the cursor by pointer needs a browser layout.
    act(() => editor.focus());
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Underline" }),
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Strikethrough" }),
    );
    await choose(toolbar, "Font size", "Large");
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Heading" }),
    );
    await save();
    await waitFor(() => expect(body("solution-integration")).toBeDefined());
    const [heading] = (
      body("solution-integration").answers["solution-overview"] as {
        value: {
          content: {
            type: string;
            attrs: object;
            content: { text: string; marks: object[] }[];
          }[];
        };
      }
    ).value.content;
    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 4 },
      content: [{ text: "Front Door" }],
    });
    expect(heading.content[0].marks).toEqual(
      expect.arrayContaining([
        { type: "underline" },
        { type: "strike" },
        { type: "textStyle", attrs: { fontSize: "large" } },
      ]),
    );
    expect(
      within(toolbar).getByRole("button", { name: "Subheading" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("adds a table of text, and rows and columns to it", async () => {
    const overview = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Services:" }] },
      ],
    };
    serve(
      version({
        sections: version().sections.map((s) =>
          s.key === "solution-integration"
            ? { ...s, answers: { "solution-overview": { value: overview } } }
            : s,
        ),
      }),
    );
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      saved("solution-integration"),
    );
    open("solution-integration");
    const toolbar = await screen.findByRole("toolbar", {
      name: "Formatting for General overview",
    });
    act(() =>
      screen.getByRole("textbox", { name: "General overview" }).focus(),
    );
    expect(
      within(toolbar).queryByRole("button", { name: "Add a row" }),
    ).not.toBeInTheDocument();
    const tool = (name: string) =>
      userEvent.click(within(toolbar).getByRole("button", { name }));
    for (const name of [
      "Table",
      "Add a row",
      "Remove the row",
      "Add a column",
      "Remove the column",
      "Remove the table",
    ])
      await tool(name);
    expect(
      within(toolbar).queryByRole("button", { name: "Add a row" }),
    ).not.toBeInTheDocument();
    for (const name of ["Table", "Add a row", "Add a column"]) await tool(name);
    await save();
    await waitFor(() => expect(body("solution-integration")).toBeDefined());
    const blocks = (
      body("solution-integration").answers["solution-overview"] as {
        value: {
          content: {
            type: string;
            content: { content: { type: string }[] }[];
          }[];
        };
      }
    ).value.content;
    const table = blocks.find((block) => block.type === "table")!;
    expect(table.content).toHaveLength(4);
    expect(table.content[0].content.map((c) => c.type)).toEqual([
      "tableHeader",
      "tableHeader",
      "tableHeader",
      "tableHeader",
    ]);
    expect(table.content[1].content.map((c) => c.type)).toEqual([
      "tableCell",
      "tableCell",
      "tableCell",
      "tableCell",
    ]);
  });

  it("formats rich text with the toolbar and only accepts safe links", async () => {
    open("solution-integration");
    const editor = await screen.findByRole("textbox", {
      name: "General overview",
    });
    const toolbar = screen.getByRole("toolbar", {
      name: "Formatting for General overview",
    });
    expect(
      within(toolbar).getByRole("button", { name: "Bold" }),
    ).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Bold" }),
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Italic" }),
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Bullets" }),
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Numbering" }),
    );
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Link" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Link" });
    const address = within(dialog).getByRole("textbox", {
      name: "Link address",
    });
    await userEvent.clear(address);
    await userEvent.type(address, "javascript:alert(1)");
    expect(
      within(dialog).getByText(
        "Use an address starting with https://, http:// or mailto:",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Save link" }),
    ).toBeDisabled();
    await userEvent.clear(address);
    await userEvent.type(address, "https://aia.com");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save link" }),
    );
    expect(editor).toHaveAttribute("aria-multiline", "true");
  });
});

describe("Diagrams in the section editor", () => {
  const slotSection = (name: string) => screen.getByRole("region", { name });
  const addBlock = async (label: string) => {
    const solution = slotSection("Solution diagram");
    await userEvent.click(
      within(solution).getByRole("button", { name: "Add block" }),
    );
    const form = within(solution).getByRole("group", { name: "Add block" });
    await userEvent.type(within(form).getByLabelText("Name"), label);
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
  };
  const refused = (
    status: number,
    errors: { path: string; message: string }[] = [],
  ) =>
    new Response(
      JSON.stringify({
        type: "about:blank",
        title: status === 409 ? "Conflict" : "Bad Request",
        status,
        detail: status === 500 ? "Database unavailable" : undefined,
        errors,
      }),
      {
        status,
        headers: { "content-type": "application/problem+json" },
      },
    );

  beforeEach(() => {
    api.on(
      `GET ${EDIT}/diagrams`,
      json(200, { items: diagramSlots(), apis: [] }),
    );
    api.on(
      `PUT ${EDIT}/sections/solution-integration`,
      saved("solution-integration"),
    );
  });

  it("asks for a diagram never saved to be saved before files are added to it", async () => {
    open("solution-integration");
    const solution = await screen.findByRole("region", {
      name: "Solution diagram",
    });
    expect(
      await within(solution).findByText(
        "Save the section first to add files to this diagram.",
      ),
    ).toBeInTheDocument();
    expect(
      within(solution).queryByLabelText("Add a file"),
    ).not.toBeInTheDocument();
  });

  describe("keeping an imported draw.io file", () => {
    const DRAWIO = drawioFile([
      "Solution",
      drawioModel(vertex("bank", "Bank", "shape=umlActor;", [0, 0, 176, 64])),
    ]);
    const POST = `POST ${EDIT}/diagrams/solution/solution/uploads`;
    const echo = (call: { body: unknown }) =>
      json(200, {
        slot: "solution",
        rowVersion: 1,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      });
    const importFile = async (name: string) => {
      open("solution-integration");
      const solution = await screen.findByRole("region", {
        name: "Solution diagram",
      });
      await userEvent.click(
        within(solution).getByRole("button", { name: "Import draw.io" }),
      );
      await userEvent.upload(
        within(solution).getByLabelText("draw.io file"),
        new File([DRAWIO], name),
      );
      await screen.findByRole("table", { name: "What is on “Solution”" });
      await userEvent.click(
        within(solution).getByRole("button", { name: "Import" }),
      );
    };

    it("stores it under the diagram it made once the section is saved (a .xml file as .drawio)", async () => {
      const order: string[] = [];
      api.on(`PUT ${EDIT}/diagrams/solution`, (call) => {
        order.push("diagram");
        return echo(call);
      });
      api.on(POST, (call) => {
        order.push(((call.body as FormData).get("file") as File).name);
        return json(201, {
          id: "90000000-0000-4000-8000-000000000001",
          slot: "solution",
          diagramId: "solution",
          name: "network.drawio",
          type: "drawio",
          size: 10,
          scan: "unscanned",
          uploadedBy: null,
          uploadedAt: "2026-10-24T02:00:00.000Z",
        });
      });
      await importFile("network.xml");
      expect(api.callsTo(POST)).toHaveLength(0);
      await save();
      await waitFor(() => expect(order).toEqual(["diagram", "network.drawio"]));
      // Kept once only: saving again stores nothing more.
      await save();
      await waitFor(() =>
        expect(
          api.callsTo(`PUT ${EDIT}/sections/solution-integration`),
        ).toHaveLength(2),
      );
      expect(api.callsTo(POST)).toHaveLength(1);
    });

    it("keeps nothing when the imported diagram is gone before the save (answered Does not apply), and saves the answers", async () => {
      api.on(`PUT ${EDIT}/diagrams/solution`, echo);
      await importFile("crm.drawio");
      const solution = screen.getByRole("region", { name: "Solution diagram" });
      await userEvent.click(
        within(solution).getByRole("radio", { name: "Does not apply" }),
      );
      await userEvent.type(
        within(solution).getByRole("textbox", {
          name: "Why it does not apply",
        }),
        "A SaaS product",
      );
      await save();
      expect(await screen.findByText("Section saved.")).toBeInTheDocument();
      expect(api.callsTo(POST)).toHaveLength(0);
    });

    it("says when the file could not be kept, stopping before the answers, and tries it again on the next save", async () => {
      api.on(`PUT ${EDIT}/diagrams/solution`, echo);
      api.on(POST, problem(409, "Conflict", "A diagram holds up to 20 files."));
      await importFile("crm.drawio");
      // A second import waits too.
      const solution = screen.getByRole("region", { name: "Solution diagram" });
      await userEvent.click(
        within(solution).getByRole("button", { name: "Import draw.io" }),
      );
      await userEvent.upload(
        within(solution).getByLabelText("draw.io file"),
        new File([DRAWIO], "again.drawio"),
      );
      await screen.findByRole("table", { name: "What is on “Solution”" });
      await userEvent.click(
        within(solution).getByRole("button", { name: "Import" }),
      );
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: "Replace",
        }),
      );
      await save();
      expect(
        await screen.findByText(
          "The imported draw.io file was not kept: A diagram holds up to 20 files.",
        ),
      ).toBeInTheDocument();
      expect(
        api.callsTo(`PUT ${EDIT}/sections/solution-integration`),
      ).toHaveLength(0);
      api.on(
        POST,
        json(201, {
          id: "90000000-0000-4000-8000-000000000001",
          slot: "solution",
          diagramId: "solution",
          name: "crm.drawio",
          type: "drawio",
          size: 10,
          scan: "unscanned",
          uploadedBy: null,
          uploadedAt: "2026-10-24T02:00:00.000Z",
        }),
      );
      await save();
      await waitFor(() =>
        expect(
          api.callsTo(`PUT ${EDIT}/sections/solution-integration`),
        ).toHaveLength(1),
      );
      // The failed one, then both.
      expect(
        api
          .callsTo(POST)
          .map((call) => ((call.body as FormData).get("file") as File).name),
      ).toEqual(["crm.drawio", "crm.drawio", "again.drawio"]);
      expect(api.callsTo(`PUT ${EDIT}/diagrams/solution`)).toHaveLength(1);
    });
  });

  it("lists the calls from other applications' approved SADs under the solution diagram it draws", async () => {
    api.on(
      `GET /api/v1/sad/applications/${APP_CRM}/calls`,
      json(200, { items: calls }),
    );
    open("solution-integration");
    const incoming = await screen.findByRole("region", {
      name: "Calls from other applications",
    });
    expect(
      await within(incoming).findByRole("cell", {
        name: "Customer Portal (APM-0005)",
      }),
    ).toBeInTheDocument();
  });

  it("draws the section's own diagram, shows another section's read-only, and saves the diagram before the answers", async () => {
    api.on(`PUT ${EDIT}/diagrams/solution`, (call) =>
      json(200, {
        slot: "solution",
        rowVersion: 1,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      }),
    );
    open("solution-integration");
    expect(
      await screen.findByRole("region", { name: "Solution diagram" }),
    ).toBeInTheDocument();
    const integration = slotSection("Infrastructure diagram: Integration view");
    expect(
      within(integration).getByText(
        "Drawn in “Physical and Network Architecture”. Shown here read-only.",
      ),
    ).toBeInTheDocument();
    expect(
      within(integration).queryByRole("button", { name: /Add / }),
    ).not.toBeInTheDocument();
    expect(
      within(integration).getByRole("tab", { name: "Production" }),
    ).toBeInTheDocument();

    await addBlock("Customer portal");
    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    const diagramCall = api.callsTo(`PUT ${EDIT}/diagrams/solution`)[0];
    expect(diagramCall.body).toMatchObject({
      version: 0,
      content: {
        diagrams: [
          {
            id: "solution",
            boxes: [{ label: "Customer portal", type: "part" }],
          },
        ],
      },
    });
    expect(api.calls.indexOf(diagramCall)).toBeLessThan(
      api.calls.indexOf(
        api.callsTo(`PUT ${EDIT}/sections/solution-integration`)[0],
      ),
    );
  });

  it("keeps the answers and says what is wrong when a diagram is refused", async () => {
    api.on(
      `PUT ${EDIT}/diagrams/solution`,
      refused(400, [
        {
          path: "content.diagrams.0.boxes.0.parentId",
          message: "Not a zone on this diagram",
        },
      ]),
    );
    open("solution-integration");
    await screen.findByRole("region", { name: "Solution diagram" });
    await addBlock("Portal");
    await save();
    expect(
      await within(slotSection("Solution diagram")).findByRole("alert"),
    ).toHaveTextContent(
      "Solution diagram was not saved: Not a zone on this diagram",
    );
    expect(
      screen.getByText(
        "Some answers need attention: see the messages under them.",
      ),
    ).toBeInTheDocument();
    expect(
      api.callsTo(`PUT ${EDIT}/sections/solution-integration`),
    ).toHaveLength(0);

    api.on(`PUT ${EDIT}/diagrams/solution`, refused(500));
    await addBlock("Bank");
    await save();
    expect(
      await within(slotSection("Solution diagram")).findByRole("alert"),
    ).toHaveTextContent("Solution diagram was not saved: Database unavailable");
  });

  it("offers a reload when someone else saved the diagram first", async () => {
    api.on(`PUT ${EDIT}/diagrams/solution`, refused(409));
    open("solution-integration");
    await screen.findByRole("region", { name: "Solution diagram" });
    await addBlock("Portal");
    await save();
    expect(
      await screen.findByText(
        "Someone else saved Solution diagram after you opened it. Reload to see their changes (yours will be lost).",
      ),
    ).toBeInTheDocument();
    const loads = api.callsTo(`GET ${EDIT}/diagrams`).length;
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(api.callsTo(`GET ${EDIT}/diagrams`).length).toBeGreaterThan(loads),
    );
    expect(
      within(slotSection("Solution diagram")).queryByRole("button", {
        name: "Portal",
      }),
    ).not.toBeInTheDocument();
  });

  it("needs a reason before saving a diagram that does not apply", async () => {
    open("solution-integration");
    const solution = await screen.findByRole("region", {
      name: "Solution diagram",
    });
    await userEvent.click(
      within(solution).getByRole("radio", { name: "Does not apply" }),
    );
    await save();
    expect(within(solution).getByRole("alert")).toHaveTextContent(
      "Say why the diagram does not apply",
    );
    expect(api.callsTo(`PUT ${EDIT}/diagrams/solution`)).toHaveLength(0);
    expect(
      api.callsTo(`PUT ${EDIT}/sections/solution-integration`),
    ).toHaveLength(0);
  });

  it("shows the diagrams read-only to someone who may view the section but not edit it", async () => {
    serve(
      version({
        sections: version().sections.map((s) =>
          s.key === "solution-integration" ? { ...s, editable: false } : s,
        ),
      }),
    );
    api.on(
      `GET ${EDIT}/diagrams`,
      json(200, { items: diagramSlots({ solutionEditable: false }), apis: [] }),
    );
    open("solution-integration");
    const solution = await screen.findByRole("region", {
      name: "Solution diagram",
    });
    expect(
      within(solution).queryByRole("button", { name: "Add block" }),
    ).not.toBeInTheDocument();
    expect(within(solution).queryByText(/Drawn in/)).not.toBeInTheDocument();
  });

  it("sets the hosting names and draws the infrastructure in section 3, saving it before the answers", async () => {
    const [, infrastructureSlot] = diagramSlots();
    api.on(
      `GET ${EDIT}/diagrams`,
      json(200, {
        items: [{ ...infrastructureSlot, editableViews: ["infrastructure"] }],
        apis: [],
      }),
    );
    api.on(`PUT ${EDIT}/sections/network`, saved("network"));
    api.on(`PUT ${EDIT}/diagrams/infrastructure`, (call) =>
      json(200, {
        slot: "infrastructure",
        rowVersion: 3,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      }),
    );
    open("network");
    const infrastructure = await screen.findByRole("region", {
      name: "Infrastructure diagram",
    });
    const hosting = within(infrastructure).getByRole("group", {
      name: "Hosting settings",
    });
    await userEvent.clear(within(hosting).getByLabelText("Subscription"));
    await userEvent.type(
      within(hosting).getByLabelText("Subscription"),
      "MY02",
    );
    await userEvent.click(
      within(infrastructure).getByRole("button", { name: "Add zone" }),
    );
    const form = within(infrastructure).getByRole("group", {
      name: "Add zone",
    });
    await userEvent.type(within(form).getByLabelText("Name"), "vnet-crm");
    await userEvent.click(within(form).getByRole("button", { name: "Add" }));
    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    const diagramCall = api.callsTo(`PUT ${EDIT}/diagrams/infrastructure`)[0];
    const content = (
      diagramCall.body as {
        version: number;
        content: {
          hosting: { subscription: string };
          diagrams: { zones: { label: string }[] }[];
        };
      }
    ).content;
    expect((diagramCall.body as { version: number }).version).toBe(2);
    expect(content.hosting.subscription).toBe("MY02");
    expect(content.diagrams.map((d) => d.zones.map((z) => z.label))).toEqual([
      [
        "MY02",
        "Southeast Asia",
        "East Asia",
        "PDC",
        "SDC",
        "Office network",
        "vnet-crm",
      ],
      ["MY02", "Southeast Asia", "East Asia", "PDC", "SDC", "Office network"],
    ]);
    expect(api.calls.indexOf(diagramCall)).toBeLessThan(
      api.calls.indexOf(api.callsTo(`PUT ${EDIT}/sections/network`)[0]),
    );
    // Only what the API takes: no ids the editor keeps for itself, no copy asked for.
    expect(JSON.stringify(diagramCall.body)).not.toContain("taken");
    expect(diagramCall.body).not.toHaveProperty("copyFromProduction");
  });

  it("asks the API to copy production's integration connections too when section 3 copies production (it may not see them)", async () => {
    const [, infrastructureSlot] = diagramSlots();
    const hidden = [
      {
        diagramId: "production",
        takenIds: ["line-4"],
        carriers: [{ id: "box-1", view: "integration" }],
      },
    ];
    api.on(
      `GET ${EDIT}/diagrams`,
      json(200, {
        items: [
          { ...infrastructureSlot, editableViews: ["infrastructure"], hidden },
        ],
        apis: [],
      }),
    );
    api.on(`PUT ${EDIT}/sections/network`, saved("network"));
    api.on(`PUT ${EDIT}/diagrams/infrastructure`, (call) =>
      json(200, {
        slot: "infrastructure",
        rowVersion: 3,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      }),
    );
    open("network");
    const infrastructure = await screen.findByRole("region", {
      name: "Infrastructure diagram",
    });
    await userEvent.click(
      within(infrastructure).getByRole("tab", { name: "Non-production" }),
    );
    await userEvent.click(
      within(infrastructure).getByRole("button", {
        name: "Copy from production",
      }),
    );
    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    const body = api.callsTo(`PUT ${EDIT}/diagrams/infrastructure`)[0].body as {
      copyFromProduction?: boolean;
      content: object;
    };
    expect(body.copyFromProduction).toBe(true);
    expect(JSON.stringify(body.content)).not.toMatch(
      /taken|copiedFromProduction/,
    );
  });

  it("records data flow facts in section 9 and saves them with the solution diagram, before the answers", async () => {
    const [solutionSlot] = diagramSlots();
    const drawn = {
      diagrams: [
        {
          id: "solution",
          title: "Solution diagram",
          sizing: "auto" as const,
          zones: [],
          boxes: [
            { id: "box-1", label: "Core", type: "part", x: 0, y: 0 },
            { id: "box-2", label: "Bank", type: "external", x: 300, y: 0 },
          ],
          lines: [{ id: "line-1", from: "box-1", to: "box-2" }],
        },
      ],
    };
    // A section 9 editor who cannot read section 2: what connections call and do is left out.
    api.on(
      `GET ${EDIT}/diagrams`,
      json(200, {
        items: [
          {
            ...solutionSlot,
            readableViews: ["data-flow"],
            editableViews: ["data-flow"],
            rowVersion: 3,
            content: drawn,
          },
        ],
        apis: [],
      }),
    );
    api.on(
      `PUT ${EDIT}/sections/data-architecture`,
      saved("data-architecture"),
    );
    api.on(`PUT ${EDIT}/diagrams/solution`, (call) =>
      json(200, {
        slot: "solution",
        rowVersion: 4,
        content: (call.body as { content: unknown }).content,
        completion: version().completion,
        hidden: version().hidden,
      }),
    );
    open("data-architecture");
    const solution = await screen.findByRole("region", {
      name: "Solution diagram: Data flow view",
    });
    expect(
      within(solution).getByText(
        "Drawn in “Solution & Integration Architecture”. Record the data flow facts of its connections here.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(
        within(solution).getByRole("table", { name: "Connections" }),
      ).getByRole("button", { name: "Core → Bank" }),
    );
    const details = within(solution).getByRole("complementary", {
      name: "Details",
    });
    await userEvent.type(
      within(details).getByLabelText("Data objects and key attributes"),
      "Payment: amount",
    );
    await userEvent.type(
      within(details).getByLabelText("Frequency / volume"),
      "Real time",
    );
    await save();
    expect(await screen.findByText("Section saved.")).toBeInTheDocument();
    const diagramCall = api.callsTo(`PUT ${EDIT}/diagrams/solution`)[0];
    expect(diagramCall.body).toEqual({
      version: 3,
      content: {
        diagrams: [
          {
            ...drawn.diagrams[0],
            lines: [
              {
                id: "line-1",
                from: "box-1",
                to: "box-2",
                data: "Payment: amount",
                frequency: "Real time",
              },
            ],
          },
        ],
      },
    });
    expect(api.calls.indexOf(diagramCall)).toBeLessThan(
      api.calls.indexOf(
        api.callsTo(`PUT ${EDIT}/sections/data-architecture`)[0],
      ),
    );
  });
});
