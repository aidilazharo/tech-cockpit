import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as renderAlone, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagram, DiagramContent, DiagramSlot } from "../schemas";
import { DiagramSlotEditor } from "./DiagramSlotEditor";
import type { CanvasEdit } from "./flow";
import { BOX_HEIGHT, BOX_WIDTH, emptyContent } from "./model";

// The slot editor reads the version's files through TanStack Query (none here: no version is given).
const render = (ui: ReactElement) => {
  const client = new QueryClient();
  return renderAlone(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

// The real canvas needs a browser layout; here a stand-in sends the same edits a drag, resize or click would.
vi.mock("./DiagramCanvas", () => ({
  DiagramCanvas: ({
    diagram,
    onSelect,
    onEdits,
  }: {
    diagram: Diagram;
    onSelect: (id: string | null) => void;
    onEdits: (edits: CanvasEdit[]) => void;
  }) => (
    <div data-testid="canvas" data-title={diagram.title}>
      <button
        type="button"
        onClick={() =>
          onEdits([{ kind: "move", id: diagram.boxes[0].id, x: 400, y: 300 }])
        }
      >
        drag first box
      </button>
      <button
        type="button"
        onClick={() =>
          onEdits([
            {
              kind: "resize",
              id: diagram.zones[0].id,
              width: 500,
              height: 300,
            },
          ])
        }
      >
        resize first zone
      </button>
      <button
        type="button"
        onClick={() => onEdits([{ kind: "select", id: diagram.lines[0].id }])}
      >
        select first line
      </button>
      <button type="button" onClick={() => onSelect(null)}>
        click empty canvas
      </button>
    </div>
  ),
}));

let latest: DiagramContent | undefined;
beforeEach(() => {
  latest = undefined;
});
function Harness({
  slot,
  initial,
  editable = true,
  drawnIn,
  error,
}: {
  slot: DiagramSlot;
  initial: DiagramContent;
  editable?: boolean;
  drawnIn?: string;
  error?: string;
}) {
  const [content, setContent] = useState(initial);
  const change = (next: DiagramContent) => {
    latest = next;
    setContent(next);
  };
  return (
    <DiagramSlotEditor
      slot={slot}
      content={content}
      onChange={editable ? change : undefined}
      drawnIn={drawnIn}
      error={error}
    />
  );
}

const drawn = (): DiagramContent => ({
  diagrams: [
    {
      id: "monitoring-1",
      title: "Monitoring",
      sizing: "auto",
      zones: [
        {
          id: "zone-1",
          label: "CRM",
          kind: "This application",
          x: 0,
          y: 0,
          width: 300,
          height: 160,
        },
      ],
      boxes: [
        {
          id: "box-1",
          label: "Portal",
          type: "monitoring",
          parentId: "zone-1",
          x: 20,
          y: 40,
        },
        { id: "box-2", label: "Bank", type: "system", x: 400, y: 0 },
      ],
      lines: [
        {
          id: "line-1",
          from: "box-1",
          to: "box-2",
          label: "Payment API",
          dashed: true,
        },
      ],
    },
  ],
});
const first = () => (latest as { diagrams: Diagram[] }).diagrams[0];
const details = () => screen.getByRole("complementary", { name: "Details" });
const type = async (
  label: string,
  text: string,
  scope: HTMLElement = document.body,
) => {
  const field = within(scope).getByLabelText(label);
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
};

describe("DiagramSlotEditor, drawing", () => {
  it("takes drags, resizes and selection from the canvas, and switches zone sizes", async () => {
    render(<Harness slot="monitoring" initial={drawn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "drag first box" }),
    );
    expect(first().boxes[0]).toMatchObject({ x: 400, y: 300 });
    expect(first().zones[0].width).toBe(400 + BOX_WIDTH + 20);
    expect(
      screen.getByText(
        "Zones fit what they hold and grow as boxes move outwards; empty zones shrink to their name.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "By hand" }));
    expect(first().sizing).toBe("manual");
    expect(
      screen.getByText(
        "Select a zone and drag its corners. Zones grow with what they hold, and so do the zones around them; they never shrink on their own.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "resize first zone" }),
    );
    // 500 by 300 is smaller than the dragged box plus 20px: the zone stops there.
    expect(first().zones[0]).toMatchObject({
      width: 400 + BOX_WIDTH + 20,
      height: 300 + BOX_HEIGHT + 20,
    });
    await userEvent.click(screen.getByRole("radio", { name: "Automatic" }));
    expect(first().sizing).toBe("auto");

    await userEvent.click(
      screen.getByRole("button", { name: "select first line" }),
    );
    expect(
      within(details()).getByRole("heading", { name: "Portal → Bank" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "click empty canvas" }),
    );
    expect(
      within(details()).getByText(
        "Select a zone, box or line on the canvas or in the tables.",
      ),
    ).toBeInTheDocument();
  });

  it("sets a zone sized by hand from the keyboard too: its width and height", async () => {
    render(<Harness slot="monitoring" initial={drawn()} />);
    await userEvent.click(
      within(screen.getByRole("table", { name: "Grouping boxes" })).getByRole(
        "button",
        { name: "CRM" },
      ),
    );
    expect(
      within(details()).queryByRole("spinbutton", { name: "Width" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "By hand" }));
    const width = within(details()).getByRole("spinbutton", { name: "Width" });
    expect(width).toHaveValue(300);
    await userEvent.clear(width);
    await userEvent.type(width, "520");
    await userEvent.clear(
      within(details()).getByRole("spinbutton", { name: "Height" }),
    );
    await userEvent.type(
      within(details()).getByRole("spinbutton", { name: "Height" }),
      "240",
    );
    expect(first().zones[0]).toMatchObject({ width: 520, height: 240 });
  });

  it("keeps a size it cannot use as typed, says the range, and changes nothing until the size fits", async () => {
    render(
      <Harness
        slot="monitoring"
        initial={{
          diagrams: [
            {
              ...(drawn() as { diagrams: Diagram[] }).diagrams[0],
              sizing: "manual",
            },
          ],
        }}
      />,
    );
    await userEvent.click(
      within(screen.getByRole("table", { name: "Grouping boxes" })).getByRole(
        "button",
        { name: "CRM" },
      ),
    );
    const width = within(details()).getByRole("spinbutton", { name: "Width" });
    await userEvent.clear(width);
    await userEvent.type(width, "5");
    expect(width).toHaveValue(5);
    expect(
      within(details()).getByText(
        "Enter a whole number of pixels from 20 to 50,000",
      ),
    ).toBeInTheDocument();
    expect(latest).toBeUndefined();
    await userEvent.tab();
    expect(width).toHaveValue(300);
    expect(
      within(details()).queryByText(
        "Enter a whole number of pixels from 20 to 50,000",
      ),
    ).not.toBeInTheDocument();
  });

  it("answers Not applicable with a reason, and goes back to the diagram it had", async () => {
    const { unmount } = render(<Harness slot="solution" initial={drawn()} />);
    await userEvent.click(
      screen.getByRole("radio", { name: "Does not apply" }),
    );
    expect(
      screen.getByText("Say why the diagram does not apply"),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Why it does not apply"),
      "SaaS only",
    );
    expect(latest).toEqual({ notApplicable: true, reason: "SaaS only" });
    await userEvent.click(screen.getByRole("radio", { name: "Diagram" }));
    expect(first().boxes.map((b) => b.label)).toEqual(["Portal", "Bank"]);
    unmount();

    render(
      <Harness
        slot="monitoring"
        initial={{ notApplicable: true, reason: "Vendor" }}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Diagram" }));
    expect(latest).toEqual(emptyContent("monitoring"));
  });

  it("holds several titled CI and CD flows: add, rename, switch and remove", async () => {
    render(<Harness slot="ci-cd" initial={emptyContent("ci-cd")} />);
    expect(screen.getByRole("tab", { name: "CI and CD flow" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await type("Diagram title", "CI flow");
    expect(screen.getByRole("tab", { name: "CI flow" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove this diagram" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add diagram" }));
    expect(screen.getByRole("tab", { name: "New diagram" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await type("Diagram title", "");
    expect(screen.getByText("Enter a title")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "—" })).toBeInTheDocument();
    await type("Diagram title", "CD flow");
    await userEvent.click(screen.getByRole("tab", { name: "CI flow" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute(
      "data-title",
      "CI flow",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove this diagram" }),
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "CD flow",
    ]);
  });

  it("shows the infrastructure as fixed Production and Non-production tabs, and a save error", async () => {
    render(
      <Harness
        slot="infrastructure"
        initial={emptyContent("infrastructure")}
        error="Infrastructure diagram was not saved: Not a zone on this diagram"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not a zone on this diagram",
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Production",
      "Non-production",
    ]);
    expect(
      screen.queryByRole("button", { name: "Add diagram" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Non-production" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute(
      "data-title",
      "Non-production",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add zone" }));
    await type(
      "Name",
      "vnet-sit",
      screen.getByRole("group", { name: "Add zone" }),
    );
    await userEvent.click(
      within(screen.getByRole("group", { name: "Add zone" })).getByRole(
        "button",
        { name: "Add" },
      ),
    );
    const [production, nonProduction] = (latest as { diagrams: Diagram[] })
      .diagrams;
    expect([
      production.zones.length,
      nonProduction.zones.map((z) => z.label).at(-1),
    ]).toEqual([6, "vnet-sit"]);
  });

  it("shows the first diagram when the one on screen is no longer there (e.g. after a reload)", () => {
    const { rerender } = render(
      <DiagramSlotEditor
        slot="ci-cd"
        content={{
          diagrams: [
            { ...emptyContent("ci-cd").diagrams[0], id: "gone", title: "Old" },
            { ...emptyContent("ci-cd").diagrams[0], id: "x", title: "X" },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    rerender(
      <DiagramSlotEditor
        slot="ci-cd"
        content={{
          diagrams: [
            {
              ...emptyContent("ci-cd").diagrams[0],
              id: "new",
              title: "Reloaded",
            },
            { ...emptyContent("ci-cd").diagrams[0], id: "y", title: "Y" },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: "Reloaded" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
