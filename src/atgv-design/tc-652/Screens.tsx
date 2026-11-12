/* ATGV UI/UX code handoff: TC-652, Story TC-652, revision 1.
 * Visual scaffold only; API/business behavior is not yet implemented. */
import React, {useState} from 'react';
import './Screens.css';
export const sourceJira = {"storyKey":"TC-652","designKey":"TC-652","revision":1,"framework":"aia-qi"} as const;
const screens = [
  {
    "id": "screen-1",
    "name": "Names Management — Loaded List",
    "purpose": "Primary screen for viewing persisted person-name records and starting CRUD actions.",
    "components": [
      "Responsive application header with page title “Person names” and compact navigation context",
      "Main content container using provisional semantic tokens: surface, text, border, primary, danger, success, and focus",
      "Create form with visible label “Person name”, single-line text input, character guidance “1–80 characters”, and primary “Add” button",
      "Names table with columns Name, ID, Created, Updated, and Actions; records sorted oldest-first",
      "Each row displays the immutable persistent ID and readable timestamps",
      "Each row includes “Edit” and “Delete” buttons with accessible names containing the person name",
      "Non-blocking status region with polite live announcements for successful actions",
      "Visible keyboard focus outline, minimum 44px action targets, semantic table markup, and responsive horizontal scrolling or stacked row layout"
    ],
    "interactions": [
      "On page load, request the records and display them oldest-first after HTTP 200.",
      "Typing preserves inner spaces and Unicode letters; leading and trailing whitespace is normalized on submission.",
      "Activate Add by click or keyboard to submit the create request.",
      "Successful HTTP 201 inserts the returned record, including stable ID, and announces that the name was added.",
      "Duplicate names remain as separate rows.",
      "Edit opens inline editing for only the selected row.",
      "Delete requires explicit activation of that row’s Delete control before showing confirmation.",
      "Unexpected API or network failures show an alert without removing or altering unchanged records."
    ]
  },
  {
    "id": "screen-2",
    "name": "Names Management — Empty State",
    "purpose": "Explain that no records exist and provide the first-create action.",
    "components": [
      "Same page header and create form as the loaded list",
      "Empty-state panel with text “No person names yet” and supporting text explaining that added names will appear here",
      "Empty-state icon placeholder that does not contain proprietary artwork",
      "Primary Add action remains in the form and receives focus after a successful initial load",
      "Accessible status region identifying the empty result"
    ],
    "interactions": [
      "Display after HTTP 200 returns an empty collection.",
      "Submitting a valid name replaces the empty state with the new persistent row after HTTP 201.",
      "Keyboard users can move from the input to Add without navigating through decorative content.",
      "A failed create keeps the empty state visible and exposes the validation or request error."
    ]
  },
  {
    "id": "screen-3",
    "name": "Names Management — Initial Loading",
    "purpose": "Provide clear feedback while records are being retrieved.",
    "components": [
      "Create form disabled until the initial request completes",
      "Table-region skeleton rows matching the Name, ID, Created, Updated, and Actions columns",
      "Accessible live status “Loading person names”",
      "No misleading record count or success message while data is unavailable"
    ],
    "interactions": [
      "Show during the initial GET request.",
      "Replace skeletons with the loaded list or empty state after HTTP 200.",
      "Replace skeletons with the request-error state after a failed request.",
      "Preserve visible focus context when loading completes."
    ]
  },
  {
    "id": "screen-4",
    "name": "Names Management — Create Validation",
    "purpose": "Show inline validation for invalid new-name submissions.",
    "components": [
      "Create input with persistent label and described-by guidance",
      "Inline danger message associated with the input through aria-describedby",
      "Error styling that uses text and icon or border in addition to color",
      "Add button remains available for correction",
      "Status region does not announce false success"
    ],
    "interactions": [
      "For blank or whitespace-only input, show “Enter a person name” and do not create a record.",
      "For a trimmed value longer than 80 characters, show “Name must be 80 characters or fewer” and do not create a record.",
      "Return focus to the invalid input after submission.",
      "Do not clear the user’s input after a validation failure.",
      "A corrected valid submission clears the error only after successful validation."
    ]
  },
  {
    "id": "screen-5",
    "name": "Names Management — Inline Edit",
    "purpose": "Allow one selected record to be updated without changing its immutable ID.",
    "components": [
      "Selected row changes Name cell to a labeled text input populated with the stored name",
      "Read-only ID, Created, and Updated values remain visible",
      "Row actions change to “Save” and “Cancel”",
      "Inline validation message area associated with the edit input",
      "Row-level loading indicator and disabled Save control while the update request is pending"
    ],
    "interactions": [
      "Edit activation focuses the row input and selects or places the cursor in the existing value.",
      "Save trims leading and trailing whitespace before submitting while preserving inner spaces and Unicode letters.",
      "HTTP 200 updates only the selected record’s name and updated timestamp; its ID remains unchanged.",
      "Invalid blank or over-80-character edits show an inline error and preserve the original stored name.",
      "Cancel restores the original value without an API request.",
      "A failed update shows an error and preserves the unchanged record."
    ]
  },
  {
    "id": "screen-6",
    "name": "Names Management — Delete Confirmation",
    "purpose": "Prevent accidental deletion while ensuring deletion targets only the selected ID.",
    "components": [
      "Modal dialog titled “Delete person name?”",
      "Quoted selected name and immutable ID for confirmation context",
      "Warning text stating that deletion removes only this record",
      "Secondary “Cancel” button and danger “Delete” button",
      "Dialog focus trap, initial focus on Cancel, Escape-to-close behavior, and labelled dialog description"
    ],
    "interactions": [
      "Open only after explicit activation of a row’s Delete button.",
      "Cancel, Escape, or backdrop dismissal closes the dialog without an API request.",
      "Confirm sends DELETE for the displayed immutable ID only.",
      "While pending, disable both actions and announce “Deleting person name”.",
      "HTTP 204 removes the selected row and announces success; if it was the last row, show the empty state.",
      "HTTP 404 or network failure keeps the row visible and shows an actionable error without false success."
    ]
  },
  {
    "id": "screen-7",
    "name": "Names Management — Request Error",
    "purpose": "Expose API and network failures without hiding unchanged data or exposing technical details.",
    "components": [
      "Persistent danger alert near the relevant form or list region",
      "Human-readable message such as “We couldn’t load the person names. Try again.”",
      "Secondary “Try again” action for load failures",
      "Operation-specific retry action for create, update, or delete failures where safe",
      "No stack trace, raw server payload, or internal implementation details"
    ],
    "interactions": [
      "Show after GET, POST, PUT/PATCH, or DELETE network/API failure.",
      "For create failure, retain the entered value and leave existing rows unchanged.",
      "For edit failure, restore or retain the original stored name and ID.",
      "For delete failure, keep the selected row visible.",
      "Retry repeats only the failed operation after explicit activation.",
      "Successful retry removes the related error and announces the result."
    ]
  },
  {
    "id": "screen-8",
    "name": "Names Management — Mobile Layout",
    "purpose": "Define the responsive presentation for narrow screens while retaining all CRUD actions.",
    "components": [
      "Single-column page layout with 16px minimum content padding",
      "Create input and Add button stacked vertically with full-width touch targets",
      "Each record presented as a bordered card or horizontally scrollable semantic table, subject to design-owner review",
      "Name displayed prominently; ID and timestamps shown as labelled metadata",
      "Edit and Delete controls placed in a full-width or wrapping action group",
      "No hover-only controls and visible focus indicators"
    ],
    "interactions": [
      "All controls remain keyboard and touch operable at narrow widths.",
      "Long names wrap without clipping or horizontal page overflow.",
      "If a table is used, provide an accessible caption and an explicit horizontal-scroll cue.",
      "Edit, validation, confirmation, loading, and error behavior matches the desktop layout.",
      "Orientation or viewport changes preserve unsaved input where technically feasible."
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
