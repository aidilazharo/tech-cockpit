/* ATGV UI/UX code handoff: TC-712, Story TC-712, revision 1.
 * Visual scaffold only; API/business behavior is not yet implemented. */
import React, {useState} from 'react';
import './Screens.css';
export const sourceJira = {"storyKey":"TC-712","designKey":"TC-712","revision":1,"framework":"aia-qi"} as const;
const screens = [
  {
    "id": "screen-1",
    "name": "Person Names — Loaded List",
    "purpose": "Primary screen for managing persisted person-name records.",
    "components": [
      "Page header with title “Person names” and concise supporting text",
      "Create form card with visible label “Name”, required indicator, single-line text input, character counter “0/80”, and primary “Add name” button",
      "Live region for success and request-status messages",
      "Records section titled “Saved names”",
      "Accessible table with Name, Stable ID, Created, and Actions columns",
      "Each row displays the exact saved name, immutable stable ID, and oldest-first ordering",
      "Row actions include “Edit” and “Delete” buttons with minimum 44px targets",
      "Visible keyboard focus outline and semantic table headers",
      "Responsive mobile layout that converts each row into a stacked record card"
    ],
    "interactions": [
      "Submitting a valid name trims only leading and trailing whitespace, preserves inner whitespace and Unicode letters, then shows the persisted record after successful creation.",
      "Add action is disabled while the create request is pending and cannot create duplicate submissions.",
      "Successful creation announces confirmation and clears the input while retaining focus on the Name field.",
      "Invalid input keeps the form value, shows an inline field error, and does not add a row.",
      "Network or server failure shows a non-technical alert without claiming success or removing existing records.",
      "Edit and Delete controls are keyboard-operable with Enter or Space.",
      "Reloading the page retrieves records from persistent storage and retains oldest-first ordering."
    ]
  },
  {
    "id": "screen-2",
    "name": "Person Names — Empty State",
    "purpose": "Explain that no records exist and provide the first creation action.",
    "components": [
      "Same page header and create form as the loaded state",
      "Empty-state panel with text “No names saved yet”",
      "Supporting text explaining that added names will appear here",
      "Empty-state icon placeholder using accessible decorative treatment",
      "Primary action or focus guidance directing users to the Name field",
      "Status region reserved for request feedback"
    ],
    "interactions": [
      "The Name field is the first actionable control after the page heading.",
      "Submitting a valid name replaces the empty state with the saved record.",
      "Invalid submission leaves the empty state visible and places an accessible error beside the field.",
      "Failed retrieval displays the retrieval-error state instead of falsely presenting an empty result."
    ]
  },
  {
    "id": "screen-3",
    "name": "Person Names — Create Validation",
    "purpose": "Show inline validation for invalid creation attempts.",
    "components": [
      "Name field with invalid styling and aria-describedby relationship to the error",
      "Inline error for blank or whitespace-only input: “Enter a name.”",
      "Inline error for values exceeding 80 trimmed characters: “Name must be 80 characters or fewer.”",
      "Character counter showing current length against 80",
      "Add name button and unchanged records list",
      "Assertive or polite live region announcing the validation result"
    ],
    "interactions": [
      "Validation runs on submit and may provide non-blocking guidance while typing.",
      "Whitespace-only input is rejected without creating a record.",
      "Overlong input is rejected without database changes.",
      "Focus moves to the invalid field after submission and the error is announced.",
      "Correcting the value clears the error before resubmission."
    ]
  },
  {
    "id": "screen-4",
    "name": "Person Names — Inline Edit",
    "purpose": "Update one existing record without duplication.",
    "components": [
      "Selected row changes to an inline edit form",
      "Name input prefilled with the current saved value and associated label",
      "Character counter and validation message region",
      "Primary “Save” button and secondary “Cancel” button",
      "Stable ID displayed as read-only text",
      "Row-level pending indicator and status text"
    ],
    "interactions": [
      "Activating Edit affects only the selected row.",
      "Save trims leading and trailing whitespace and preserves valid inner whitespace and Unicode letters.",
      "Successful update replaces the original value in the same row and announces completion.",
      "Invalid edits show an accessible error and preserve the original saved value.",
      "Cancel discards unsaved changes and restores the read-only row.",
      "Save is disabled while the update request is pending.",
      "Unexpected response or network failure preserves the unchanged original record and exposes a non-technical error."
    ]
  },
  {
    "id": "screen-5",
    "name": "Person Names — Delete Confirmation",
    "purpose": "Require explicit activation before deleting a selected record.",
    "components": [
      "Modal dialog with accessible name “Delete person name?”",
      "Selected name and stable ID displayed for confirmation",
      "Warning text stating that deletion removes only this record",
      "Primary danger button “Delete” and secondary “Cancel” button",
      "Dialog focus trap and visible focus indicator"
    ],
    "interactions": [
      "Opening the dialog does not delete the record.",
      "Dialog opens with focus on Cancel or the dialog heading according to the agreed focus policy.",
      "Escape and Cancel close the dialog without changes.",
      "Delete requires a second explicit activation and is disabled while the request is pending.",
      "Successful deletion closes the dialog, removes only the selected row, and announces completion.",
      "A failed deletion keeps the row visible, closes or retains the dialog according to error handling decision, and shows a non-technical error.",
      "Unknown-record responses are presented as an actionable failure without removing other records."
    ]
  },
  {
    "id": "screen-6",
    "name": "Person Names — Initial Loading",
    "purpose": "Communicate that saved records are being retrieved.",
    "components": [
      "Page header and create form shell",
      "Disabled or unavailable Add action until initial retrieval completes",
      "Accessible loading status such as “Loading saved names”",
      "Skeleton rows matching the record layout",
      "No empty-state message shown during loading"
    ],
    "interactions": [
      "Screen readers receive a concise loading announcement.",
      "Users cannot submit a create request until required initial data is ready, unless implementation explicitly supports independent creation.",
      "Successful retrieval replaces skeletons with records or the empty state.",
      "Failed retrieval transitions to the retrieval-error state."
    ]
  },
  {
    "id": "screen-7",
    "name": "Person Names — Retrieval or Request Error",
    "purpose": "Show recoverable API or network failures without exposing implementation details.",
    "components": [
      "Persistent danger alert with human-readable message such as “We couldn’t load the names.”",
      "Secondary text advising the user to retry",
      "Primary “Try again” button",
      "Existing unchanged records retained when an individual create, edit, or delete request fails",
      "Accessible live region for request feedback",
      "No stack traces, raw API payloads, or technical diagnostics"
    ],
    "interactions": [
      "Try again repeats the failed retrieval request and returns to loading feedback.",
      "Failed create keeps the entered value available for correction or retry.",
      "Failed edit restores or retains the original persisted value rather than showing false success.",
      "Failed delete leaves the selected record visible.",
      "Retry and all controls remain keyboard-operable with visible focus."
    ]
  },
  {
    "id": "screen-8",
    "name": "Person Names — Responsive Mobile Layout",
    "purpose": "Demonstrate usable interaction on narrow screens.",
    "components": [
      "Single-column page container with consistent horizontal padding",
      "Full-width Name field and Add button",
      "Stacked record cards showing name, stable ID, created information, and actions",
      "Actions arranged as full-width or wrapping buttons with minimum 44px height",
      "No horizontal page scrolling; long IDs wrap or use a copy-safe readable treatment",
      "Persistent status region positioned near the form"
    ],
    "interactions": [
      "All create, edit, delete, cancel, retry, and confirmation actions work by keyboard and touch.",
      "Edit controls expand the selected card without shifting focus unexpectedly.",
      "Delete confirmation remains usable within the viewport and supports Escape.",
      "Text reflows at increased browser zoom without loss of labels or actions."
    ]
  }
] as const;
export function AtgvDesignScreens(){
  const [selected,setSelected] = useState<string>(screens[0].id);
  const screen = screens.find(item=>item.id===selected) || screens[0];
  return (<div className="atgv-design" data-jira-story={sourceJira.storyKey} data-jira-design={sourceJira.designKey}>
    <nav aria-label="Project screens" className="atgv-design-nav">
      {screens.map(item=><button type="button" key={item.id} aria-current={selected===item.id?'page':undefined} onClick={()=>setSelected(item.id)}>{item.name}</button>)}
    </nav>
    <main className="atgv-design-main" data-screen-id={screen.id}>
      <header><h1>{screen.name}</h1><p>{screen.purpose}</p></header>
      <section aria-label="Screen content" className="atgv-design-grid">
        {screen.components.map((label,index)=><article key={index} className="atgv-design-card"><h2>{label}</h2><p>Component interaction and API integration to be implemented.</p></article>)}
      </section>
      <section aria-label="Planned interactions"><h2>Planned interactions</h2><ul>{screen.interactions.map((label,index)=><li key={index}>{label}</li>)}</ul></section>
    </main>
  </div>);
}
export default AtgvDesignScreens;
