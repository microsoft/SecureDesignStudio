# Advanced configuration and reference

[Home](../README.md) → [User guide](user-guide.md) → Advanced reference

Start with the [user guide](user-guide.md) for the step-by-step support-case
exercise. Use this document when you need to customize the app, understand a
review setting, import or export files, or troubleshoot a problem.
These are reference sections, not additional steps in the beginner exercise.

**Contents**

- [Modeling and review settings](#modeling-and-review-settings): roles, scope, scenarios, libraries, privacy, inspector layout, and work items.
- [Analysis and review reference](#analysis-and-review-reference): checks, unavailable policies, comments, and deviations.
- [Import and export](#import-and-export): formats, endpoint files, annotations, and backups.
- [Troubleshooting and quick reference](#troubleshooting-and-quick-reference): common problems, shortcuts, and Optimize.
- [Runtime modes](#runtime-modes): local startup and optional service configuration.
- [Optional local Design Assistant](#optional-local-design-assistant): AI setup, request limits, and saved results.
- [Collaboration](#collaboration).
- [Browser recovery](#browser-recovery).
- [Implementation and contributor references](#implementation-and-contributor-references).

Ordinary `npm start` (or `npm run dev`) works on **Windows, macOS, or Linux**
without optional services. The prerequisite-checking npm and POSIX launchers
are available on all three platforms; `.ps1` wrappers are Windows helpers.
See [cross-platform startup](bring-your-own-ai.md#cross-platform-startup).
Use approved endpoints and fictional examples when experimenting.
Nothing on this page authorizes deployment or changing someone else's preview.

## Modeling and review settings

### DFD roles and scenario scope

A **Type** names the technology, such as Azure SQL. A **DFD role** describes
what the component does in the data-flow diagram:

| Role | Use it for |
|---|---|
| **Process** | A component that works on data, such as an API. |
| **Data Store** | A component that keeps data, such as a database. |
| **External Interactor** | A person or outside system whose internal design you are not reviewing. |

In **Properties > General / Security**, choose **Use type default**, or select
a role yourself. For example, a new Azure SQL node defaults to **Data Store**.
Types without a role default use **Process**. The app does not choose roles
from a node's name or icon.

Changing the role does not change the technology type, asset ID, endpoint, or
policy. A role you select yourself remains selected if you later change the
type. Older models keep their previous Process role until you choose a default
or another role. You can edit type defaults in **Model > Node Type Catalog**.

#### Out-of-scope reason

Use this field to explain **why you are not reviewing a component's internal
design in the selected scenario**. For example:
`The payment service is owned and reviewed by another team. This review covers
our calls to it, not its internal implementation.`

Select a scenario, select the node, and enter the reason in Properties.
An empty reason means the node is in scope. Delete the text to bring it back
into scope. A reason applies only to that scenario; another scenario can review
the same node. Duplicating a scenario copies its reasons, which you can then
edit independently. **Show all** displays scope information but does not let you
set one reason for every scenario.

Removing a node from a scenario keeps its reason in case you add it back.
Deleting the node removes its reasons.

#### Undo and Redo for scope edits

The app groups continuous typing in a reason into one Undo step. Leaving the
field or starting another edit creates a separate step. Undo and Redo keep the
node editor open when the node still belongs to the active scenario.
Inside the field, Ctrl+Z or Cmd+Z uses the browser's text undo.

#### What scope changes affect

An **External Interactor** is already treated as a black box: AI review looks
at its interactions, not its internal design. It therefore does not need an
out-of-scope reason. If an imported model has such a reason, the app shows it
as inactive so you can review or clear it. Unrecognized imported roles or
scope values are shown with warnings, not used to silently exclude components.

Out-of-scope components remain on the diagram with labels and dashed borders.
**Scope appearance (this browser)** changes their local appearance only; it
does not change or share the review scope.

Only optional **LLM review** uses these exclusions. It skips the internal
details of out-of-scope Processes and Data Stores, and of External Interactors.
It still reviews crossing flows, except a flow between an External Interactor
and an out-of-scope node. The same rule applies to request and response data.
For included crossing flows, it receives only the endpoint information needed
to understand the call, not the excluded component's internal details.
A missing endpoint is a model gap, not a successful review.

**Review > Analyze is unchanged by scope choices.** Scope edits also leave
existing findings and reviewer decisions unchanged.

Save `.tma` to retain roles and scenario reasons. Use current versions for all
collaborators; older versions or external formats may lose these details.
If collaborators edit different scope reasons in the same scenario at the
same time, one saved set of reasons can replace the other. Coordinate those
edits. Node-catalog exports include type defaults, not individual scope reasons.

### Reuse scenarios without duplicating services

Choose **Model > Duplicate current scenario**, or **New scenario > Start from**,
then adjust which objects and data belong to the new workflow.
Duplication copies membership, call order, data attachments, and retention,
but not comment threads. Use **Scenario settings** to edit its description.

**Add to scenario / Remove from scenario** changes membership, not the shared
object itself. Removing a node also removes its connected flows from that
scenario. Deleting an object affects all scenarios that use it.
Read the confirmation for **Model > Delete current scenario**: objects used
only there can be deleted, while shared objects remain.

### Choose and customize libraries

Libraries provide reusable choices such as node types, authentication methods,
communication profiles, and data classifications. **You can use the sample
without installing a Custom Library.** A library adds choices or checks; it
does not give access to services or turn on networking.

#### Node types

Open **Model > Node Type Catalog**. Choose a catalog, then search within it:
**All node types**, **Generic**, **Microsoft**, or **Document** for types saved
in this diagram. Additional installed catalogs appear in the same selector.
Finish or cancel an edit before switching catalogs.

You can add a type, edit an existing definition for this diagram, reset a
built-in override, or import/export catalog JSON. These changes are saved with
the `.tma`; they do not edit the shipped source or your other diagrams.

Public choices include Dataverse, Dataverse Table, Dataverse Plugin,
Microsoft Copilot Studio, and Power Platform connectors. You do not need a
Custom Library to select them. Some types have no reviewed authentication or
data-handling policy; **Unspecified** means you still need to check those
requirements. See the [cloud catalog guide](microsoft-cloud-node-catalog.md)
for service descriptions and product differences.

#### AI design guidance

Some node types and authentication methods include optional guidance for AI:
context, dependencies, risks, questions, and source links.
**Guidance is reference material, not a verified control or policy approval.**
Selecting a type or method does not send an AI request, and the app does not
open its source links automatically.

Expand **AI design guidance** in a node's Properties to read it. Choose
**Edit guidance for this type in this diagram**, edit the draft, and select
**Save guidance** or **Cancel guidance edit**. Saving updates guidance for every node of that type in
this diagram, not your installed libraries. Use the node's own Description for
information specific to that component.

Flow properties offer **Authentication AI design guidance** and
**Edit guidance for this method in this diagram**. Saving there updates all
flows using that method in the diagram, not your browser's library or the
flow's authentication selection.

Undo and Redo restore guidance edits. Clearing saved guidance does not
automatically bring back the library's version. If the definition changes
while you edit, reopen the editor after the warning.

AI requests have size limits. If the selected context and guidance are too
large, reduce the scenario rather than expecting the app to omit important
details. Owner-specific methods such as CDT, PFAT, and PoP + PFT may have limited
public documentation; ask the owner for their actual contract.
See [guidance details](custom-libraries.md#ai-design-guidance),
[authentication guidance](authentication-library.md#ai-design-guidance), and
[AI size limits](bring-your-own-ai.md#request-size-and-tokens-per-minute).

#### Authentication

Open **Model > Customize authentication** to edit method names, descriptions,
and optional AI guidance. You can disable methods or import/export library JSON.
The library belongs to this browser profile and site; diagram-specific
definitions travel with the model.

Select a method separately on each flow. **Not specified** means you have not
chosen one. **Custom method** needs an explanation and review.
Use **Internal process call** only for a call inside one process, not for
anonymous network access. A legacy certificate label does not establish that
mutual TLS is used.

Disabled or unknown methods remain visible on saved flows so you can review
them. If a saved diagram definition differs from your library, the app asks you
to resolve the difference; opening a model does not overwrite your library.
See the [Authentication Library guide](authentication-library.md).

#### Communication

Open **Model > Communication Library** to manage profiles such as HTTPS.
Select a **Protocol profile** in each flow's **Communication** section.
Authentication remains a separate choice; a profile's suggestions do not set it
for you.

The diagram saves the profiles it uses. If one differs from your browser's
library, the saved diagram definition takes precedence until you choose to
change it. A protocol choice records the intended communication; it does not
prove that encryption or other protections are configured.

### Document required flow access rights

Select a flow and open **Properties > General / Security > Required access
rights**. Record what the caller needs, for example `Read case records` or an
Azure RBAC role. Authentication says how the caller is identified; access rights
say what it should be allowed to do.

This field is optional. Blank means undocumented, not that no rights are needed.
The text is shared wherever that flow is used. It has a limit of roughly 4,000
characters; some characters count as two.

Save `.tma` to keep the full text. Review HTML includes it, but TM7, Visio, and
PNG are not complete backups of these details.

### Document boundary network intent

Drag a boundary's **outer border** to move it and its members. Select its
border or title to open Properties, use the handles to resize it, or double-click
its title to rename it. Dragging empty space inside the boundary does not move it.

For a security boundary, **Inbound Allow**, **Inbound Deny**, **Outbound Allow**,
and **Outbound Deny** let you describe intended traffic rules. For example,
an inbound note might say `Allow HTTPS calls from the web app`.
These are notes, not firewall rules that the app applies or verifies.
Blank fields mean the rules have not been documented.

Shared boundaries have shared notes across scenarios. Changing a boundary to
Privacy hides its network notes but keeps them; changing it back to Security
shows them again. Editing notes does not call AI, although they can be included
when you explicitly request an Assistant review.
Keep a `.tma` backup; external drawing formats may omit these notes.

### Model privacy and lifecycle

Use **Model > Customize classifications** to manage data categories, their
descriptions, and the default for new data items. You can disable unused choices
and import/export the library. The import preview explains **Merge** and
**Replace** before you apply them.

Read the classification descriptions before choosing. For example,
**Customer Content** describes content supplied by customers, while
**Customer Data** is broader. **Administrator Data** concerns people's
administrative activity, not just permissions. Identifiers and system metadata
can still be personal data. Colors do not indicate legal risk.
See the [Classification Library guide](classification-library.md).

Create reusable data items in **Model > Data Elements**. On each flow's
**Privacy** tab, attach them in the correct direction:
**Data in request** goes to the target; response data goes back to the source.
Available choices may depend on the receiver's policy. A selectable item is
not automatically approved for use.

After **Review > Analyze**, open the receiving node's **Privacy** tab and choose
retention for each item in that scenario: not specified, processing only,
storage under 48 hours, or storage of at least 48 hours.
Analyze preserves retention you have already entered.

Type defaults and privacy-policy descriptions are starting points for review,
not automatically created boundaries. Confirm geography, retention periods,
and responsibilities with the service owner. Do not enter real sensitive
data in the Sample field.

### Navigate a larger model

**Filter** lets you narrow the visible diagram by text, node type,
authentication, or classification. Choose **Apply** to use your draft filters,
or Cancel/Escape to discard them. **Clear all** removes filters immediately.
Filters do not delete anything or restrict the whole-document Analyze check.

Use inspector tabs for Properties, Edges, Issues, Comments, Changes, Data,
Work, and Findings, with additional tabs when relevant. Pin a tab to keep it
open as you select other items. Unpin it to let selection return you to details.
**View > Inspector** closes or reopens the panel.

Drag the divider to resize the docked inspector; double-click it to reset.
On narrow screens, **Expand inspector** gives it more room and
**Restore inspector size** returns it to its usual height.

In Diagram view, drag a selected flow's line or double-click it to add a bend
(waypoint). Select that point to move or delete it.
Double-click a node or flow title to edit it.

Select a boundary and choose its subtype in Properties to read the description.
For example, **VNet**, **Subnet**, **Process**, and **Machine** describe different
security perimeters; **Geo boundary** describes a privacy region.
A Process boundary is not the same as a node's Process role.
Organization-specific choices may require a Custom Library.

New browser profiles use light mode. Choose **Settings > Dark Theme** to change
it. **Reset all preferences** returns to light mode without changing the model.

### Collaborate or use optional AI

**About** shows whether collaboration and Design Assistant are configured and
where they connect. Configuration does not guarantee that you have access or
that the service is reachable.

Ordinary `npm run dev` keeps collaboration and AI disabled. No local mode
enables collaboration. An approved deployed or standalone copy can offer
encrypted rooms through the status menu.
**Share the full room link only with authorized people:** it contains the
decryption key. Rooms share model content, not browser library preferences.

For AI review, choose a specific scenario, then **Review > Design Assistant**.
Chat and AI Analysis use your configured provider. They receive the active
scenario's review context, not just selected or filtered items.
**Show all** is not an AI review scope.
See [Bring your own AI](bring-your-own-ai.md) and
[advanced configuration](advanced-configuration.md).

Select a finding heading or **Focus** to center a referenced object.
Pin the inspector if you want to keep the findings visible while navigating.
**Go to AI findings** scrolls past setup controls to the results.
Missing objects are shown as unavailable.

Use **Resolve** to record your review decision, **Reopen** to revisit it,
or **Delete** to remove an AI finding after confirmation.
Resolving does not fix the system. Deleting does not remove Issues or Work items
already created from that finding. These actions support Undo and Redo.

Completed AI findings and their analyzed scenario are saved with the model
and can be read offline. **Analyze model** in the AI panel replaces the saved
AI results; Undo restores the previous set. **Simulate breach**, beside Analyze model in AI Analysis, uses active
findings from that saved analysis to illustrate a path through connected
flows. It does not execute an attack or verify exploitability. Navigating
the diagram does not automatically refresh the analysis.

Chat and unsent drafts are not saved in `.tma` or shared with collaborators.
Changing the provider clears chat but keeps saved findings. Opening a different
model or room clears the old conversation. Reloading clears unsent drafts.
You can drag the chat box's bottom-right handle to make it taller.

#### Move the whole inspector

Use **Inspector display** above any inspector tab:

| Choice | What it does |
|---|---|
| **Dock in inspector** | Keeps the panel beside the canvas. |
| **Float in this page** | Frees the docked space and places the panel over the canvas. Drag its title bar to move it and its corner to resize it. |
| **Open separate window** | Opens the same inspector in a browser window you can move to another monitor. Keep the main SDS page open. |

The same tabs, results, and unfinished edits move with the inspector.
Moving it does not start another AI request. Press Escape, close the separate
window, or choose docking to return it to the main page.
If the browser blocks a separate window, use the floating option.
Closing the inspector or reloading resets its display to docked; closing it
also cancels a pending AI request.

#### Export all inspector data to Excel

Choose **Excel (.xlsx)** above any inspector tab. It exports the model's
retained data across **all scenarios and statuses**, regardless of the current
tab, selection, or filters. It includes properties, flows, data, retention,
comments, work, deviations, comparison changes, saved issues, and completed
AI findings. It does not include unsent drafts or deleted findings.

The workbook is a local review snapshot, not an editable model or an ADO import
file. An AI finding and an issue created from it can appear as separate records.
Long text is kept in numbered parts on a **Long text** sheet.
Values are text, not executable formulas or macros. Export sends no AI request.
Keep `.tma` as your editable backup.

#### Work items and Azure DevOps submission

Open **Model > Work Items** or the **Work** tab to record follow-up work.
Give each item a **Name**, **Description**, **Work item type** (Bug or Task),
and **Severity**. **Weakness Type** is optional.
Choose **Accept** when it is ready for submission, or **Reject** to leave it
out. Accepting alone does not contact Azure DevOps (ADO).

In Findings, **Create work item** copies the concern and recommendation into
a new draft. Review its classification and wording before accepting it.
Later AI analyses do not overwrite that draft.

**Link** is for an existing tracker item, not the destination organization or
project. A linked item is excluded from new-item submission and import exports.
Do not clear a real link just to submit it again.

For offline submission, use **Export ADO CSV** or **Export ADO Excel template**
in Work. These include only accepted, unlinked items that do not already have
a submitted or uncertain result. The inspector-wide **Excel (.xlsx)** export
is different: it includes the full review, not just work ready for import.

In Azure Boards, open **Boards > Queries > Import work items**, choose the CSV,
review validation, and select **Save items**. The import limit is 1,000 items
per file. The Excel template is for preparing and reviewing rows; it has no
connected Publish command. Follow Microsoft's
[CSV import instructions](https://learn.microsoft.com/en-us/azure/devops/boards/queries/import-work-items-from-csv?view=azure-devops).
After import, copy the created items' links back into SDS before another export
or submission. Do not import the same batch twice.

Expand **ADO configuration** to set the destination. Paste the complete JSON
object, or choose **Load JSON file**, then **Save ADO configuration**.
Loading only changes the draft. **Download JSON** saves the validated draft
without applying it. Unsaved changes block Connect, Submit, and ADO import
exports so they cannot accidentally use an old destination.

Example configuration: replace all sample values with values valid for your
organization and project.

```json
{
  "organizationUrl": "https://dev.azure.com/your-organization",
  "project": "ExampleProject",
  "inventoryId": "11111111-1111-4111-8111-111111111111",
  "reviewer": "reviewer@example.com",
  "descriptionField": "System.Description",
  "defaults": {
    "System.AreaPath": "ExampleProject\\Security",
    "System.IterationPath": "ExampleProject",
    "System.AssignedTo": "owner@example.com",
    "System.Tags": "Security; DataSource:SecureDesignStudio",
    "Custom.ReviewTeam": "Your review team",
    "Custom.TeamID": "22222222-2222-4222-8222-222222222222"
  }
}
```

Unlike the optional node asset ID, the ADO configuration's `inventoryId` requires
a GUID. `reviewer` identifies the security reviewer; it is separate from
Assigned To, Team ID, and the person signing in.
The dedicated import exports require Inventory ID, Reviewer, Area Path,
Review Team, and Team ID. Your project's process may require more fields.
Area and iteration paths must belong to the configured project. In JSON,
write a path separator as `\\`. Obtain the field mappings and administrator
setup for your approved destination before connecting or submitting.

For direct submission, choose **Connect to Azure DevOps**, sign in, then
**Submit accepted**. Check the destination and count in the confirmation.
SDS validates the queued items before creating them and reports results for
each item. Your account and project rules determine what you can create.
Do not enter a PAT, client secret, or copied token in the configuration.

Direct submission needs an administrator-configured hosted app and API relay,
or explicit local ADO setup using `npm run dev:ado`.
Ordinary local startup and file-opened standalone HTML support authoring and
export, not ADO sign-in or submission. The ADO-only local mode keeps AI and
collaboration disabled. Configuration stays in this browser profile; it is not
shared in the model.

**If a submission times out, check ADO before retrying.** The item may have
been created even if SDS did not receive the result. SDS blocks automatic
retries for an unknown outcome. Use one designated submitter; the browser's
submission record does not coordinate other browsers.
Do not clear browser data to bypass this protection.
Undo or deletion in SDS does not delete an ADO item.
If an older model lacks a recorded result, use **Keep recorded result in model**
before saving. Save `.tma` and export a new review workbook after submission.

## Analysis and review reference

### Deployment-selected Custom Libraries

Open **Model > Custom Libraries** to see selected packages, their choices,
metadata fields, checks, and help. Missing or rejected packages show warnings.
**About** and the status bar summarize the selected libraries.

Packages are not selected automatically. A saved diagram can preserve a type's
description without installing the package or its checks.
See [Custom Libraries](custom-libraries.md) for setup and trust requirements.

### Use the local review loop

**Review > Analyze** runs local checks across the **whole document**, not just
the visible scenario. It adds request data to receiving targets and response
data to receiving sources, then opens Issues.

Checks can identify missing data or retention, authentication incompatibilities,
missing required caller IDs, communication questions, and receiver-policy
problems. The standard app does not require a node asset ID; a Custom Library
can add that requirement.

Open a finding, read its explanation, locate the object, correct the model,
and Analyze again. Findings that still apply keep their review status and
discussion. Findings that no longer apply are removed when their rule can fully
check the target. Manual issues and comments are not removed by Analyze.
Save a review snapshot if you need to preserve earlier results.

**Not re-evaluated** means the app could not check an existing finding, for
example because its rule or required policy is unavailable.
It keeps the finding and warning rather than treating missing information as a
pass. Restore the needed library or definition and Analyze again.
Search Issues for `not re-evaluated` to find these records.
If Analyze itself fails, it reports an error and leaves the model unchanged.

**Review > Issues** offers All, Active, and Resolved views.
Resolve records your decision, not proof of a fix. Local issues have review
status; AI findings also have a suggested severity for you to assess.

Use **Review > Comments** for scenario discussion and **Model > Work Items**
for actions and tracker links.
**Review > Deviations** shows differences recorded by service-evidence reviews.
Every deviation needs an explanation. You can edit that explanation, but the
UI does not delete deviations or change their status. Evidence tools or imported
files can supply statuses. A deviation stays in the document if its referenced
object is deleted. **View sample calls**, when available, shows supporting
network observations.

### Compare models and assess the limits

Choose **File > Compare to previous** (also under Review) to load a `.tma` or
compatible JSON baseline without replacing your working model.
Open **Review > Changes** to inspect differences. **No changes** means the
comparison found no differences; it does not mean a security review passed.

Analyze does not inspect deployed resources or scan for live vulnerabilities.
Check flow direction and order, boundaries, classifications, real configuration,
and unresolved policy questions separately.
Review AI recommendations before **Create issue / Create work item**.
AI severity does not transfer to ordinary issues.

Before sharing, review scenario membership, authentication, data and retention,
boundary assumptions, and open actions. Analyze and save a named `.tma`.

## Import and export

**Save a native `.tma` first.** Other formats are useful for exchange or review,
but can omit model details.

**File > Save** or **File > Save as > SecureDesignStudio model (.tma)** uses a
browser save picker or download dialog. **File > Open** replaces the model;
**Compare to previous** does not.

| Format | Command | What it is for |
|---|---|---|
| `.tma` / compatible native JSON | File > Open; Save / Save as | Your editable model and view state, including supported older models. Browser preferences and whole profile libraries are separate. |
| Threat Modeling Tool `.tm7` | File > Import; File > Save as | Exchange drawings with Threat Modeling Tool. Some security/privacy metadata is lost. |
| Scenario/DFD JSON | File > Import > Import JSON format | Import a supported scenario/diagram export, not arbitrary JSON. Replaces the model. |
| Privacy Manager `.pmexp` | File > Import > PMEXP import | Merge a local data inventory into mapped or new nodes. You need scenarios first. |
| Endpoint `.txt` | File > Import > Endpoints text; Model > Endpoint matching | Match listed endpoints to node types and add missing nodes in the active scenario. Endpoint import results lists every address; choose a node and click Assign to save it under Properties > Endpoints. Does not discover calls or scan services. Unmatched lines download as `_unknown.txt`. |
| Visio `.vsdx` | File > Save as > Microsoft Visio | Export one page per scenario. Privacy boundaries are included; security boundaries and text annotations are omitted. There is no Visio importer. |
| Diagram `.png` | Export > Diagram image | A picture of the active Diagram scenario, including offscreen content within current filters. Not editable model data. |
| Review `.html` | Export > Review report | A report for the active scenario, optionally with a diagram image. Not the app itself. |
| Standalone `.html` | File > Save as > Standalone HTML | The single-file app plus the model. Open it in the browser, not through File > Open. |
| Node-catalog JSON | Model > Node Type Catalog > Import / Export | Type definitions and referenced authentication dependencies, not the whole diagram. |
| Authentication-catalog JSON | Model > Customize authentication > Import / Export | Move your authentication library between browser profiles. |

#### Saved definitions and older versions

A model can save the definitions it uses so another reviewer can read their
labels and descriptions without installing the same library.
If a saved definition differs from an installed one, the saved definition wins
for that diagram. Before replacing a saved definition, open **About** and expand
**Catalog labels in this diagram** below **Custom Libraries** to review it.

**(unresolved)** means a definition is unavailable. The app retains its ID
instead of guessing a replacement. It does not install a missing library.
See [saved definitions](catalog-snapshots.md) and
[model compatibility](model-compatibility.md).

Use current versions for editing and collaboration. Older versions and external
formats may discard newer roles, scope reasons, guidance, annotations, or saved
findings. Keep `.tma` and separate library JSON backups.

### Supported scenario/DFD JSON import

Use **File > Import > Import JSON format...** for a local Threat Modeling
Copilot scenario/DFD export. This works locally without portal sign-in.
Use **File > Open** for native model JSON, or the separate PMEXP command for a
data inventory.

The format must contain `scenarios.threatModel.scenarios` and `dfds.items`.
Scenario IDs match `diagram.id`, not list position. This small sample shows the
expected structure:

```json
{
  "scenarios": {
    "threatModel": {
      "scenarios": [{"id": "scenario-example", "name": "Example flow"}]
    }
  },
  "dfds": {
    "items": [{
      "diagram": {
        "id": "scenario-example",
        "nodes": [
          {"id": "node-client", "type": "externalinteractor", "label": "Client", "position": {"x": 100, "y": 100}},
          {"id": "node-api", "type": "process", "label": "API", "position": {"x": 400, "y": 100}}
        ],
        "edges": [
          {"id": "edge-request", "source": "node-client", "target": "node-api", "label": "1. Request"}
        ]
      }
    }]
  }
}
```

The importer converts supported shapes, boundaries, and calls. It does not
infer authentication or classifications from their text.
Read its summary for omitted annotations, unresolved edges, empty scenarios,
and unmatched diagrams. Cancel leaves the model unchanged.
Undo reverses a successful import; save `.tma` to keep the converted model.

### PMEXP inventory import

Use **File > Import > PMEXP import...** for a local Privacy Manager inventory.
The app does not sign in, download records, or query services.
The file contains an array of records or an object with a `data` array:

```json
{
  "data": [{
    "serviceId": "11111111-1111-4111-8111-111111111111",
    "serviceName": "Example service",
    "elementName": "Example record",
    "sampleData": "Example case text",
    "dataClassification": "Customer Data",
    "dataRetainDuration": "7 days",
    "dataStoreBoundary": "Stored"
  }]
}
```

Records need a nonempty `serviceId`. The importer compares it with saved node
asset IDs. A unique match merges automatically. Otherwise, the mapping dialog
lets you create a node, choose an existing node, or ignore that service.
**Create all / Ignore all** apply to services not yet mapped.

Import merges inventory into every scenario, reuses matching data items, and
preserves existing samples and retention choices. Unknown classifications
become Other. Read the created, reused, and skipped counts.
Cancel changes nothing; Undo reverses the whole import.

### Endpoint import

Import a local text list through **File > Import > Endpoints text** or
**Model > Endpoint matching**. Review and edit node-type patterns in
**Model > Node Type Catalog**.
Matched types missing from the model can become nodes in the selected scenario.
The **Endpoint import results** dialog shows every address, its matched type,
and **Node added**, **Type already exists**, or **No matching type**.
Choose a node and click **Assign** on each row you want to keep; even a newly
added node receives no address automatically. **Assigned to:** confirms the
saved association. See or remove it in the node's **Properties > Endpoints** tab.
Unmatched rows remain visible, and their original lines download as `_unknown.txt`.
You can explicitly assign an unmatched address to a known node.

Import at most 1000 nonblank lines in a file no larger than 4.2 MB; each address
must be at most 4096 characters without control characters. Repeated assignment
to the same node does not duplicate an address. Associations are authored model
metadata, not verified API, deployment, authentication, or connectivity evidence.

A Custom Library may provide instructions for obtaining an endpoint list.
Those instructions are optional: copying an example does not run it, sign you
in, or discover services. You can choose a local file without that library.

### TM7 and Visio export limits

Read the export's loss preview before continuing. TM7 omits privacy boundaries,
data and retention, and much review metadata. Imported nodes need their policy
types reviewed. Some unsupported connectors or shapes produce warnings.
See [TM7 compatibility](tm7-compatibility.md).

Visio is export-only. After opening it in Visio, use
**Position > Auto Align & Space** if prompted.
The template's license notice is available under **About > Visio template
notice** and in the exported file. See
[third-party notices](third-party-notices.md).

### Canvas text annotations

Choose **Model > New text annotation**, or right-click the canvas and choose
**New text annotation**. Use a note to explain the drawing without adding a
component, data item, or review finding.

Select the note, enter text in Properties, then choose **Apply text**.
**Discard text edits** returns to its saved text. Apply before selecting
another note or closing the editor. Drag it to move, use the resize handles,
or edit its position and size in Properties.
Keyboard users can focus the note, press Enter to edit, and use arrows to move
it (Shift moves farther).

Notes can belong to several scenarios. Edits to a shared note appear in all
of them. **Remove from scenario** keeps it elsewhere; Delete removes it.
Sequence view lists notes separately from call participants.
Save `.tma` to preserve text, placement, and membership.
Visio omits notes; PNG only preserves their appearance.

### Backups and recovery

Keep versioned `.tma` files and separate library JSON backups.
Autosave belongs to the browser profile and site address; it can fail if storage
is blocked or full. It does not update an HTML file on disk.
Reopening a standalone HTML file loads its embedded model first.
See [browser recovery](advanced-configuration.md#browser-recovery) before
clearing storage.

Local imports do not upload files. If you are in a collaboration room, however,
the resulting model edits are shared with the room.

## Troubleshooting and quick reference

| Problem | Action |
|---|---|
| Port 5173 is occupied | The launcher reports how to inspect its owner: `Get-NetTCPConnection -LocalPort 5173 -State Listen` on Windows, `lsof -nP -iTCP:5173 -sTCP:LISTEN` on macOS, or `ss -ltnp 'sport = :5173'` on Linux. Stop only your own server; coordinate with other owners. |
| Public clone fails | Check `https://github.com/microsoft/SecureDesignStudio.git`, network/proxy access, and your organization's GitHub controls. This public repository needs no private-repository access; Azure credentials are unrelated. |
| Node version error | Install Node 24 LTS, reopen the terminal, and check `node --version`. |
| PowerShell script blocked | Use `npm.cmd start` instead of a `.ps1` launcher or `npm.ps1`. No execution-policy change is needed. Follow your organization's software policy. |
| AI missing or failing | Check your chosen provider's setup. For Azure on Windows, use `.\Start-SecureDesignStudio-WithAI.ps1 -VerifyEndpoint`; on macOS/Linux, use the shell setup under [optional AI startup](user-guide.md#start-with-the-optional-ai-assistant). See [Bring your own AI](bring-your-own-ai.md). |
| Missing node, flow, or sequence participant | Check the scenario and **Filter > Clear all**. Use Show all in Diagram to find objects elsewhere. Sequence shows only nodes with visible flows. |
| Cannot create nodes or boundaries | Create and select a scenario first. Show all is not an authoring scenario. |
| Cannot attach data | Check classification, request/response direction, and receiver policy. Do not weaken policy just to remove a warning. |
| Recovery missing or storage full | Save `.tma`. Check the browser profile, site address, and storage permissions. Back up before clearing site data. |
| Unknown authentication or conflicting definitions | Read the warnings in **Model > Customize authentication** and review the needed library or saved definition. **Affected items** lists where methods are used; a compatibility notice is not an authentication failure. |
| Collaboration unavailable locally | Expected: local modes do not enable collaboration. Use an approved deployed or standalone copy configured for rooms. |
| AI analysis disabled with a model open | Select a specific scenario rather than Show all, then check provider configuration. |
| Inspector hidden or on the wrong tab | **View > Inspector** reopens it; **View > Properties** returns to details. Unpin the tab if you want it to follow selection. |

**Essential shortcuts** (use Cmd instead of Ctrl on macOS):

| Action | Shortcut |
|---|---|
| New / Open / Save / Save as | Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Document Undo / Redo outside text fields | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z |
| Add or remove an object from a selection | Ctrl+click |
| Delete selected objects outside text fields | Delete / Backspace. Use Remove from scenario to keep the object in other scenarios. |
| Diagram zoom out / in / reset / fit | `-` / `+` or `=` / `0` / `F`, with canvas focus and no Ctrl modifier |
| Finish / cancel an inline title edit | Ctrl+Enter / Escape |
| Navigate menus or inspector tabs | Arrow keys, Home, End; Enter activates, Escape closes |

### Arrange the diagram with Optimize

Choose **Optimize** beside the bottom-left zoom controls, or
**View > Optimize diagram**. It arranges visible objects while keeping their
full flow titles and visible communication-profile, authentication, and privacy
classification badges (such as `EUII +1`). Badges summarize request and response
data; full assignments remain on the flow's **Privacy** tab.
Select a flow to open Properties.

You can keep dragging, resizing, connecting, and editing after Optimize.
**Undo** restores the previous layout in one step; **Redo** reapplies it.
Save `.tma` to keep the arrangement.

Optimize does not change connections, call order, metadata, or review decisions.
Shared objects also move in other scenarios; hidden objects stay in place,
though a shared boundary may expand to contain them.
Use Show all to arrange the whole model. Changing scenarios or filters does
not automatically rearrange it.

Nested boundaries stay grouped. Crossing (neither disjoint nor nested)
memberships cannot be arranged automatically; Optimize reports this without
changing the document. Adjust the model manually if needed.
Large diagrams may still need zooming or flow routing.
Optimize runs locally, without AI or network requests.

See [model concepts](user-guide.md#1-what-securedesignstudio-is),
[Authentication Library](authentication-library.md), and the
[cloud catalog](microsoft-cloud-node-catalog.md) for more detail.

## Runtime modes

For normal installation and startup, use the
[user-guide setup section](user-guide.md#2-how-to-install-and-run).
For optional provider setup, use [Bring your own AI](bring-your-own-ai.md).
The following table is a configuration reference, not another setup checklist.

| Mode | Local processes and network behavior |
|---|---|
| `npm start` (`npm run dev`) | Vite only, strict `http://localhost:5173/`. No Azure credentials, API, room persistence, or model-service requests. Room/key fragments are ignored and left untouched. |
| `npm run start:ai -- --provider claude` or `--provider codex` (`npm run dev:ai:local`) | Explicit opt-in: Vite on 5173 serves the app and local CLI bridge in one process. No Azure Functions host, API package installation, or Azure credentials. Collaboration stays disabled. |
| `npm run start:ai -- --provider azure` (`npm run dev:ai`) | Explicit opt-in: Vite on 5173, API build watcher, and local Azure Functions on 7071. The bridge calls your Azure deployment. Collaboration stays disabled. |
| `npm run dev:ado` | Separate explicit opt-in: Vite and delegated ADO adapter on 5173; requires an administrator-provided SPA registration. No AI or collaboration. |
| Deployed `dist` | Local modeling by default. Collaboration and Assistant require explicit build configuration; using them is a network operation. |
| Standalone `dist-single\index.html` | Browser-openable local editor by default. Explicitly configured services may use the network; collaboration also requires a hosted share destination. |

`npm start` and `npm run start:ai` are prerequisite-checking launchers, as are
the root PowerShell and POSIX wrappers. The lower-level npm scripts shown
in parentheses remain available without those launcher checks. Windows
PowerShell users can substitute `npm.cmd` if `npm.ps1` is blocked.
See [cross-platform AI startup](bring-your-own-ai.md#cross-platform-startup);
the detailed PowerShell examples below are Windows alternatives.

Local Vite rejects `VITE_COLLAB_TOKEN_ENDPOINT` and
`VITE_DESIGN_ASSISTANT_ENDPOINT` overrides. Do not use overrides to bypass the
local-mode boundary. For AI opt-in it uses the fixed
`http://localhost:5173/api/design-assistant` endpoint for Claude/Codex. Azure
uses the same browser endpoint on 5173, which Vite proxies only to the local
Functions endpoint at `http://localhost:7071/api/design-assistant`. Azure
settings and Entra authentication are loaded by Functions, not the CLI bridge.

Production builds have **no built-in service destinations**, including no
implicit `/api/design-assistant` endpoint. Service selection is explicit and
independent of Custom Libraries. These are build-time values, not model fields
or an end-user operational mode.

### Service availability and disclosure

Use `SDS_SERVICE_CONFIG` to select one local, data-only JSON file:

```powershell
$env:SDS_SERVICE_CONFIG = 'examples\service-configuration\example.json'
npm run build
```

The example uses reserved example domains; replace them in your own reviewed
file. Its schema is:

```json
{
  "format": "secure-design-studio-service-configuration",
  "version": 1,
  "id": "example",
  "name": "Example services",
  "collaboration": {
    "tokenEndpoint": "https://services.example.invalid/api/collab-token",
    "appUrl": "https://diagram.example.invalid/app/"
  },
  "assistant": {
    "hostedEndpoint": "/api/design-assistant",
    "standaloneEndpoint": ""
  }
}
```

All fields are required; empty endpoint strings disable those capabilities.
A file that enables collaboration must also supply its hosted app URL, so the
same selection can be used for standalone sharing and CLI origin validation.
The ID/name identify the selected configuration in About. The reader allows one
regular local file up to 16 KiB, with a bounded read. No directory discovery,
remote download, scripts, room-link overrides or model-installed settings.
Missing/unreadable/invalid files disable all services and produce a visible
diagnostic rather than contacting a fallback. A selected file is validated as
a whole, including both Assistant delivery settings.

Alternatively, without a file selection, explicitly supply
`VITE_COLLAB_TOKEN_ENDPOINT`, `VITE_COLLAB_APP_URL` and/or
`VITE_DESIGN_ASSISTANT_ENDPOINT`. Unset or empty values are disabled. File
selection and these overrides **cannot be combined**, even with empty
overrides; conflicts disable services. Remove all four variables for a
plain disconnected build. Merely having an internal configuration file or
selecting a Custom Library does not activate services.

The file is read during a production build, not fetched by the browser or
discovered beside an exported HTML file. A standalone export retains the
configuration of the build that produced it. Ordinary Vite serving never
reads `SDS_SERVICE_CONFIG` and cannot enable deployment services through it;
local AI retains its separately selected fixed localhost workflow.

Service URLs support HTTP(S) without embedded credentials, query parameters or
fragments. Never put API keys in frontend configuration. The Assistant supports
an explicit same-origin path, such as `/api/design-assistant`, in hosted builds
only. A standalone file requires absolute service URLs and a valid hosted
`VITE_COLLAB_APP_URL` to make collaboration links usable by recipients.
Hosted sharing continues to use the current page's origin and path.

**About** displays effective service availability and the configured addresses.
The Assistant panel repeats its destination before a user sends model context.
These displays do not contact a service, authorize access or attest to service
health. Invalid settings disable the affected capability with a visible
diagnostic; rejected values are not echoed. Custom Libraries cannot configure
or enable services.

Builds also produce `service-build.json`, a local consistency receipt binding
the configuration to hashes of the emitted HTML/assets. With the same selection:

```powershell
node scripts/service-configuration.mjs --verify dist-single
```

Verification rejects errors, configuration differences, missing/changed/extra
artifacts and symbolic links. It is not signed provenance, an authorization
check or public-release approval. The browser does not fetch this receipt,
and standalone export still downloads one HTML file.

Disabled collaboration ignores room/key fragments without interpreting them,
creating room persistence or requesting tokens. Ordinary local Vite remains
collaboration-disabled regardless of endpoint values. The local AI workflow
still uses only its fixed localhost endpoint; disabling or misconfiguring a
service does not affect local editing, autosave, native imports or exports.

## Optional local Design Assistant

**File > Design with AI** (directly below **Open**) uses this same endpoint and server-side
provider dispatch as review/chat (Entra/Azure in hosted mode; Azure or subscription CLI in explicit local AI mode). It introduces
no provider, default cloud destination or credential setting. Default
credential-free localhost disables both experiences; the explicitly selected
`dev:ai` workflow continues to use only the fixed localhost API.

Browser and API authoring share `shared/designContract.ts`. Keep shared runtime
code outside `api/`: Vite serves source modules by path, while credential-free
browser checks deliberately block every `/api/` request, including source files.
The API compiler uses the repository root for its source layout and emits
`api/dist/api/{collab-token,design-assistant,ado-work-items}/index.js` plus
the shared contracts in `api/dist/shared/`. Each `function.json` and the API
package's `main` point into that compiled tree. Build with
`npm --prefix api run build` from the full checkout before packaging `api/`;
the compiled shared module stays inside that deployable folder, and HTTP routes
are unchanged. The same layout applies to the API watch command.

The ADO function explicitly selects `entryPoint: "default"`: its module also
exports the opt-in loopback Vite adapter, so Functions cannot infer a unique
handler. Keep that adapter separate from the deployed HTTP entry point;
selecting it would bypass the deployed relay's enablement check.

`shared/aiDesignGuidance.ts` supplies the guidance validator, fixed trusted
reference-data policy and request-size budgets to both browser and API.
It also compiles under `api/dist/shared/`. Node-type, protocol and
authentication-method guidance stays in the
serialized user/model-context message, never interpolated into the system
prompt. Both AI experiences resolve diagram-local guidance before installed
definitions; review includes only applicable interior-node bindings, and only
cards for authentication methods used by in-scope flows. Guidance
sources are not fetched, and guidance carries no privileged instructions or
verified authentication assurance. The browser and API enforce one
384,000-byte serialized guidance budget across node, protocol and
authentication cards, plus the 500,000-byte whole-request limit; these are
UTF-8 byte limits, not provider token limits. See
[AI design guidance](custom-libraries.md#ai-design-guidance) and the
[authentication guidance contract](authentication-library.md#ai-design-guidance)
for authoring, portability, provenance and explicit overflow behavior.
Local development guards are unchanged: credential-free `npm run dev` still
makes no AI or other non-local request, and selecting or editing guidance
sends nothing.

The API isolates authoring (`mode: "design"`) from the evidence-based review
policy. Authoring uses strict JSON-schema output with the request's actual
component, authentication and classification IDs as enumerated choices, followed
by server and browser validation. Use a deployment supporting structured output,
such as GPT-4.1. Chat and AI Analysis retain their existing JSON-object mode.
Unsupported structured requests report an explicit error; they do not silently
fall back to unconstrained generation.

The empty component type (`type: ""`) is the editor's existing unspecified
component, not a new catalog entry. AI uses it for people, browsers and generic
components without a suitable service type, with `dfdRole` set independently.
`ExternalInteractor` is a role, not a component ID. Unknown nonempty component
IDs are still rejected atomically rather than coerced to unrelated services.

Authoring accepts at most 12 history messages, a 4,000-character prompt
and a 500,000-byte request. Threat Model Designer treats that request as one
**ask, then response** exchange when its library is large: the planning call
sends compact node, protocol and authentication indexes (no card bodies) and the
design call sends the selected and already-used cards (planning selects at
most 24 component types, 24 protocols and 8 authentication methods). Both calls
are independent HTTP requests; the provider is not assumed to remember the first.
The required in-use cards are checked before any call: if they cannot fit, no
provider call is made. If selected
cards push the design request past the guidance or request budget, the design
call is not sent: the dialog explains the exceeded boundary and measured sizes,
asks for a narrower design task, and applies nothing. SDS does not truncate
cards, batch automatically or add a repeated "ask for another card" loop. The
status line reports which authentication guidance was supplied and any
in-use or proposed authentication method without a card. Chat and AI Analysis
have no selection round; they send the cards for in-use flow methods directly.
Complete JSON responses have bounded lists (24 nodes,
48 flows, 12 boundaries and 24 data items); unknown fields, invalid references,
unavailable catalog values and non-stop/truncated completions never partially
apply. The service request timeout is 90 seconds and the dialog cancels after
100 seconds. Server diagnostics log status/error class, not downstream model
content. These limits are implementation safeguards, not a guarantee that a
live model will produce an acceptable design.

The structured design carries explicit `remove.nodeIds`, `remove.edgeIds` and
`remove.boundaryIds` arrays, limited to 100 supplied IDs each. Only targets in
the selected scenario can be named, but deletion and incident-flow cleanup are
global. Unknown targets, duplicate/delete-and-edit conflicts and references to
deleted nodes fail before any store/history mutation. Incident connections
explicitly rerouted in the same batch survive if both final endpoints exist.
Rerouted shared connections gain their new endpoints in every scenario that
uses them; surviving order/numbers are retained.

Edges carry `dataMode: "merge" | "replace"` for selected-scenario request/response
attachments. Boundaries carry `membershipMode: "merge" | "replace"` for global
node membership. Replace uses the exact supplied arrays, including empty
arrays. Older additive responses that omit these modes remain additive; omitted
elements or `remove` never imply deletion. No persisted document format change
is required. New readers still revalidate all output against the live document
and catalog before applying a single atomic, undoable transition.

`design.edgeOrder` is either `null` (preserve order) or a complete ordered list
of the selected scenario's surviving flow IDs, including temporary IDs for
connections created in that response. Explicit ordering is validated as an exact
permutation after deletions/reroutes, then writes both `Scenario.edgeIds` and
consecutive `edgeNumbers` from 1 in one history step. Missing, duplicate, unknown,
deleted and out-of-scenario IDs reject the entire response. Legacy responses
that omit ordering retain their existing behavior and custom numbering.
The AI context includes the actual timeline (`flowOrder`, positions and display
numbers); connectivity is not treated as proof of sequence order. Sequence
participants already follow first appearance in `edgeIds`; no canvas geometry
or persisted format change is needed.

AI-edited flows also populate missing receiving-node data entries in the selected
scenario using the same pure directional propagation helper as Analyze and the
explicit store propagation action. Only flows present in the AI edit are
propagated automatically; unrelated scenarios/flows are not rewritten.
Requests populate the target, responses the source, with retention `""`
(unspecified), never an inferred storage promise. Existing node retention,
including values unrelated to current flow attachments, remains intact.
Both flow attachments and their node entries are persisted inside the one
AI-response history transition; no Analyze pass or extra Undo entry is required.

When a proposed boundary would enclose unrelated components, the designer tries
one alternate placement of **new** components next to the existing members;
it never moves existing components merely to fit an addition. If geometry still
conflicts, it preserves the existing model and adds only the identifiable new
components, disconnected, plus a scenario-scoped canvas text annotation.
The annotation explains the conflict, deferred flows/boundaries/deletions and
the owner decisions needed. The dialog explicitly reports a partial design
instead of repeating the model's claim that all edits succeeded.

The optional `design.humanReviewNotes` array supports the same fallback for
unresolved requirements (at most 16 nonblank notes of 1,000 characters each).
Structured-output providers return an empty array for fully specified designs;
older responses may omit it. AI is instructed to use disconnected components
and specific notes rather than guess consequential routing, authentication or
boundary decisions. All original operations still undergo catalog, reference,
scope and order validation before any fallback; malformed or unauthorized
output remains an atomic error. Neither fallback nor annotations certify the
design. Components and annotation share one Undo/Redo step and persist through
native save/open, autosave and collaboration using the existing annotation
format, without a document schema version change.
Scenario annotations are included as explicitly untrusted author notes in the
next design context, so the owner can resolve a decision and request a connected
refinement. Notes do not authorize deferred changes or become flow endpoints.

New scenarios require a nonblank name (at most 160 characters) and description
(at most 4,000 characters). For existing scenarios, responses send a
`scenario: {}` patch or only the fields explicitly being edited. Omitted fields
retain their saved values locally, even when authored descriptions or appended
assumptions exceed the response limit. Supplied fields still undergo strict
type and length validation; an explicitly empty description clears it.
Name-only, description-only and explicit description-clearing updates to an
existing scenario do not require any element upserts. Each actual change is
one Undo step; repeating the same patch without new assumptions is a no-op.
Assumptions are appended without repeating already-saved text or duplicates
within the response. Saved content is never truncated to fit a refinement.

Selected-scenario authoring context includes names/descriptions, roles, flows,
membership, numbering, directional data/retention, protocol profiles, and
active caller IDs plus preserved historical identity evidence for existing
flows. Historical identity is never a source for a new caller ID; the model
may only echo an active GUID on the same unchanged caller edge. Node inventory
metadata, data samples, comments and review records are not projected.
Authored text is still untrusted and may contain sensitive information; review
what you send. The designer's chat and draft
remain in memory across closing/reopening for the current scenario. A scenario
switch, New/Open/imported model replacement, or page reload clears them. Dialog
position is also session-local; neither it nor chat becomes a document field
or collaboration state. Closing aborts any pending request. See the
[authoring workflow](user-guide.md#build-a-proposed-threat-model-with-ai).

### Prerequisites

The assistant is **bring your own AI**: no model service ships with the app and
none is provided for you. To create an Azure OpenAI instance and secure it —
disabling key authentication with `disableLocalAuth`, restricting network
access, and assigning the data-plane role — follow
[bring your own AI](bring-your-own-ai.md). This page covers how the local
workflow consumes it.

In addition to the [source setup](user-guide.md#2-how-to-install-and-run),
Azure Functions Core Tools (`func`) are needed only for `-Provider Azure`.
Choose Claude Code or Codex with a consumer subscription sign-in as described in
[bring your own AI](bring-your-own-ai.md#choose-a-provider-at-startup-or-in-sds).
The following Azure-specific setup applies only to `-Provider Azure`: an Azure CLI identity
authorized to invoke an existing Azure AI deployment, its HTTPS endpoint,
and its model deployment name. If you are using someone else's deployment,
obtain those from its owner. Basic use of SecureDesignStudio does not require
creating Azure resources.

For provider installation and sign-in, follow
[Bring your own AI](bring-your-own-ai.md#choose-a-provider-at-startup-or-in-sds).
The following Windows launcher notes explain its diagnostics; they are not
another installation checklist.

Run the Function host on a Node version it supports (22 or 24). Node 20 reached
end of support in April 2026, and odd-numbered Current releases such as Node 25
are never supported: they can start Vite but leave the host on port 7071
failing. Node 24 LTS satisfies both the frontend toolchain and the Function
host.

The cross-platform `npm run start:ai` launcher reports an unsupported Node
version and installation guidance; it does not install Node. Install or select
an official supported Node build through your approved setup and reopen the
terminal.

The **Windows PowerShell AI launcher** can instead print the exact upgrade
command and offer to run it. The following installation prompts and MSI checks
apply only to that Windows launcher. The prompt defaults to **no**, states that a
machine-wide install affects every project on the computer, and prefers
`nvm install 24` when nvm-windows is present because that is reversible and
needs no elevation.

The winget package is a machine-wide MSI, so it requires administrator
approval. When the window is not elevated the launcher says so before
prompting, then requests elevation itself. Declining the User Account Control
prompt changes nothing and reports that, rather than failing with a bare
`0x8A150006`; the same code from any other cause is decoded too.

Two conditions make the MSI fail with error 1603, and the launcher checks for
both before offering to install anything:

| Condition | Why it fails |
|---|---|
| `OpenJS.NodeJS` (the Current release) already installed | It is a separate winget package owning the same folder as `OpenJS.NodeJS.LTS`, so it must be uninstalled first |
| Running `node.exe` processes from the install directory | The installer cannot replace files that are in use |

When either applies the launcher prints the exact remediation instead of
starting an install that cannot succeed. Node bundled inside other
applications lives elsewhere and is correctly ignored.

Accepting a successful install stops the launcher afterwards: PATH changes
never reach a running process, so the upgrade only takes effect in a new
PowerShell window. Set `PS_LAUNCHER_NONINTERACTIVE=1` (or `CI`) to print the
command without prompting.

Set the non-secret service configuration in the PowerShell session that will
launch the app:

```powershell
$env:AZURE_OPENAI_ENDPOINT = "https://<your-resource>.openai.azure.com"
$env:MODEL_DEPLOYMENT_NAME = "<your-model-deployment-name>"
```

`AZURE_AI_ENDPOINT` is an alternative to `AZURE_OPENAI_ENDPOINT`.
Set `AZURE_OPENAI_API_VERSION` only if the deployment needs an override.
Do not copy real credentials into these values or into the diagram.

If the required identity is not already available, use your approved
`az login` workflow. The Function uses `DefaultAzureCredential`, which can
use the local Azure CLI identity; credentials are not supplied by the browser.
The local host cannot automatically read deployed application settings.

The account accepts Microsoft Entra tokens only — key-based access is
disabled — so a signed-in identity is required, not optional. The launcher
checks for one before starting and stops with guidance when it is missing,
because an unauthenticated Function surfaces only an opaque HTTP 500 to the
browser. Assign **Cognitive Services OpenAI User** on the account to the
identity that will run it. See
[grant yourself access](bring-your-own-ai.md#5-grant-yourself-access).

### Start and stop

First stop only your own ordinary Vite server. The launcher checks that ports
5173 and 7071 are free and reports the owning process when they are not. From
the repository root in the configured PowerShell session:

```powershell
az login
.\Start-SecureDesignStudio-WithAI.ps1 -Provider Azure
```

The launcher requires Node, npm, `func`, and the selected provider's prerequisites.
Azure requires an endpoint, deployment name and Entra identity; Claude/Codex
require their official CLI and subscription sign-in, not Azure credentials.
Without `-Provider` the interactive launcher presents a choice; non-interactive
callers must supply it. The shared in-app selector can switch to another ready
provider afterward. It installs dependencies if their
directories are missing, then runs `npm run dev:ai`. It finds Core Tools
installed outside the current PATH, and when a prerequisite is missing it
reports what is missing and the command that fixes it instead of failing with
a bare error. `npm run dev:ai` runs `setup:ai`, builds the API, then starts
Vite, the API TypeScript watcher, and the Function host. It can still be
invoked directly — though that path performs no prerequisite or identity check.

Two switches adjust the preflight:

| Switch | Effect |
|---|---|
| `-VerifyEndpoint` | Azure only: an explicit, potentially billable inference probe. Failures warn but do not block. |
| `-SkipAuthCheck` | Azure only: starts without checking for an identity. Requests still require valid credentials. |

The launcher also warns when `AZURE_CLIENT_ID`/`AZURE_TENANT_ID` service
principal variables are present, because `DefaultAzureCredential` prefers them
over the Azure CLI sign-in and would present a different principal than the
one you signed in as.

The configuration helper writes ignored `api\local.settings.json` from the
environment, including `SDS_LOCAL_AI=1` and `SDS_AI_PROVIDER`. Existing Azure
deployment values are retained when selecting another provider. Missing Azure
endpoint/deployment values are errors only when Azure is the initial provider.
API keys and CLI login credentials are not written to this file.
`npm run setup:ai` creates/refreshes configuration without starting servers.
Never commit the local settings file.

Open http://localhost:5173/, select a scenario, and choose **Review >
Design Assistant**. Ctrl+C in the owning terminal stops this workflow.
Return to `.\Start-SecureDesignStudio.ps1` for credential-free operation; do
not leave an unneeded API running.

### What is sent and what is saved

Chat and AI Analysis send the prompt plus the active scenario, its member
nodes, edges and boundaries, referenced authentication and catalog-display
definitions (including any saved, unverified library metadata), the authored
AI design guidance for in-use node types, protocols and authentication methods,
attached
data (including sample fields), retention, and selection metadata. Filters
and selection do **not** narrow this to just visible or selected objects.
DFD scope omits excluded node-interior fields and excluded-flow data
attachments. Endpoint-only nodes still carry identity; scope coverage,
stored reasons and structural diagnostics are sent as model data.
Out-of-scope is a review boundary, not a confidentiality filter.
The local API forwards context to the configured model service.

Use only information approved for that destination. Keep secrets and real
personal/confidential sample values out of the model. Review AI evidence
against source or deployment facts: this is not a live vulnerability database
lookup or security certification.

Completed AI findings and their analysis snapshot are saved model data, including
unaccepted findings, Active/Resolved status, classification and accepted-state
feedback. Native files, autosave, standalone HTML and current collaboration peers
retain them. Resolve/Reopen and confirmed Delete are undoable. **Create issue**
and **Create work item** make separate saved copies; deleting a finding never
deletes those copies. A new AI analysis replaces the saved review and can be
undone. Chat, drafts, provider choice and return navigation remain transient or
profile-local. The deterministic **Review > Analyze** needs none of this service
setup and remains a separate operation.

## Collaboration

In a collaboration-enabled build, use the status menu to **Start
collaboration**, copy the room link, or **Leave collaboration**. Joining a
valid shared link connects to the existing room; ordinary localhost Vite
does not join rooms.

Web PubSub carries encrypted document synchronization. The AES key is in
the URL fragment after `#`, which is not part of the browser's HTTP request
to the app server. The full link is nevertheless a bearer secret: anyone
with it can join and decrypt the room. Share privately with authorized
participants, never in logs, public issues, screenshots, or command lines.
Leaving a room is not revocation of a link already given to someone else.

A room synchronizes diagram state, including saved authentication
definitions, not each participant's browser-profile Authentication Library
preferences. Use compatible builds; readers before 0.1.5 can discard new or
custom auth IDs. Older peers cannot be reliably detected or prevented.
Save a `.tma` backup rather than treating a live room as archival storage.

A standalone file's copied collaboration link opens the configured public
app, not the sender's local path. Browser restrictions on `file://` network
access can prevent hosting; use the approved hosted app rather than disabling
browser protections. Local file editing does not require a room.

## Browser recovery

Autosave stores the document, bounded Undo/Redo history, active scenario, and
filters in browser storage for the app origin/profile. Each tab keeps its own
sessionStorage recovery copy, with a shared localStorage checkpoint for new
tabs. Edits are coalesced within the selected autosave interval, including
continuous editing, with an additional flush when the page is hidden or closed.
Browser quota or denied storage produces a visible warning; in-memory editing
is not evidence that a save succeeded. A later successful edit clears the warning.

The current key is `secure-design-studio:autosave:v1`. Startup can migrate
the legacy `privsec-diagram:autosave:v1` value when there is no current
autosave. Standalone HTML first restores recovery associated with its exact
embedded seed; otherwise it opens that embedded model, never an unrelated
diagram's recovery. A newly exported snapshot starts a separate recovery scope.
Standalone file-origin storage behavior varies by browser.

Recovery download/discard helpers use the current tab and embedded seed too.
Discard removes only that selected recovery value, not another tab's newer
shared checkpoint. When tab storage is unavailable, the shared copy retains
its Undo/Redo history and the app reports the loss of tab-isolated recovery.

An unchanged stale tab cannot replace another tab's shared checkpoint. If
another tab has changed it, subsequent edits remain in this tab's recovery copy
and a warning explains that new tabs will not restore those edits. Refresh
restores the current tab's copy; closing it may discard sessionStorage. Save a
`.tma` backup before closing tabs or clearing browser data. Autosave does not
rewrite an opened `.tma`, the original HTML, or a PNG: use Save or re-export.
Annotation text must be explicitly applied before it becomes model content.

If you deliberately want to remove **document recovery only**, save a `.tma`
backup first. In developer tools for the correct app origin, run:

```javascript
localStorage.removeItem("secure-design-studio:autosave:v1");
localStorage.removeItem("privsec-diagram:autosave:v1");
sessionStorage.removeItem("secure-design-studio:autosave:v1");
location.reload();
```

The legacy name here is cleanup-only, never a new output identifier. This
does not clear the separate Authentication Library, inspector/preferences,
or collaboration IndexedDB caches. Room caches use
`secure-design-studio:collab:<room>` with legacy migration support.
Export library JSON before broader site-data cleanup. Clearing local data
does not delete another participant's copy or revoke a shared link.

## Implementation and contributor references

**Next:** [Use cases](use-cases.md) and [architecture and design](architecture.md)
explain how these workflows and settings fit together.
Return to the [reading order](../README.md#reading-and-review-order) for
focused references.

| Surface | Source of truth |
|---|---|
| React shell and commands | [`src/App.tsx`](../src/App.tsx), [`Toolbar.tsx`](../src/components/Toolbar.tsx), [`SidePanel.tsx`](../src/components/SidePanel.tsx) |
| Serializable model, state, undo, normalization, I/O | [`src/types.ts`](../src/types.ts), [`src/store.tsx`](../src/store.tsx) |
| Graph and sequence | [`DiagramCanvas.tsx`](../src/components/DiagramCanvas.tsx), [`SequenceDiagramView.tsx`](../src/components/SequenceDiagramView.tsx), [`EdgeTable.tsx`](../src/components/EdgeTable.tsx) |
| Policy and deterministic analysis | [`src/policy.ts`](../src/policy.ts), [`src/IssueManager.ts`](../src/IssueManager.ts) |
| Authentication and node definitions | [Library contract](authentication-library.md), [cloud catalog](microsoft-cloud-node-catalog.md), [`src/data`](../src/data) |
| Data classification and retention descriptions | [`dataClassifications.json`](../src/data/dataClassifications.json), [`retentionTypes.json`](../src/data/retentionTypes.json) |
| External format mapping | [`tm7Import.ts`](../src/tm7Import.ts), [`tm7Export.ts`](../src/tm7Export.ts), [`tmcImport.ts`](../src/tmcImport.ts), [`privacyManagerImport.ts`](../src/privacyManagerImport.ts), [`vsdxExport.ts`](../src/vsdxExport.ts) |
| Native recovery and embedded files | [`src/autosave.ts`](../src/autosave.ts), [`src/embeddedDoc.ts`](../src/embeddedDoc.ts) |
| Semantic model comparison | [`src/diff.ts`](../src/diff.ts) |
| Yjs/Web PubSub and short-lived room tokens | [`src/collab`](../src/collab), [`api/collab-token`](../api/collab-token) |
| AI request and local configuration | [`src/designAssistant.ts`](../src/designAssistant.ts), [`api/design-assistant`](../api/design-assistant), [`configure-local-ai.mjs`](../scripts/configure-local-ai.mjs) |
| Launchers and prerequisite checks | Cross-platform [`launch.mjs`](../scripts/launch.mjs); Windows [`Start-SecureDesignStudio.ps1`](../Start-SecureDesignStudio.ps1), [`Start-SecureDesignStudio-WithAI.ps1`](../Start-SecureDesignStudio-WithAI.ps1), [`launcher-common.ps1`](../scripts/launcher-common.ps1); POSIX [`start-securedesignstudio.sh`](../start-securedesignstudio.sh), [`start-securedesignstudio-with-ai.sh`](../start-securedesignstudio-with-ai.sh) |

For source changes, follow [contributing and local validation](contributing.md)
and the scoped [browser checks](../tests/browser/README.md). Keep code validation
distinct from analysis of a user's model. Local results are contributor evidence
for maintainer review, not enforced merge protection. No user setup, build or
validation step deploys the site. Companion integrations have separate setup
and validation owned by their maintainers.
