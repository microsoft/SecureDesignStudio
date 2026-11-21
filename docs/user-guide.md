# SecureDesignStudio user guide

Use SecureDesignStudio in a **modern browser on Windows, macOS, or Linux**,
such as Firefox, Microsoft Edge, or Google Chrome.

**Contents**

1. [What SecureDesignStudio is](#1-what-securedesignstudio-is)
2. [How to install and run](#2-how-to-install-and-run)
3. [Start the support-case walkthrough](#3-start-the-support-case-walkthrough)
4. [Walk through the calls in sequence](#4-walk-through-the-calls-in-sequence)
5. [Review the support-case design](#5-review-the-support-case-design)

For settings, libraries, import/export, and troubleshooting, see
[Advanced configuration and reference](advanced-configuration.md).

## 1. What SecureDesignStudio is

SecureDesignStudio helps you draw how information moves through a system,
describe its security and privacy controls, and record review questions.

| Concept | Meaning |
|---|---|
| **Node** | A component, such as a web app, API, database, or outside service. |
| **Flow / edge** | An arrow showing a call from one component to another. It can carry request and response data. |
| **Boundary** | A labeled area around components that share a security or privacy requirement. |
| **Scenario** | One workflow, with its own components, call order, data, retention choices, and comments. |
| **Finding** | A concern raised during review, for example by Analyze, AI, or a reviewer. |
| **Deviation** | A recorded difference between the model and service evidence, with an explanation. |
| **Document** | The whole model, including scenarios and review records. Save it as a `.tma` file. |

Nodes, flows, and boundaries can belong to several scenarios. Renaming a shared
node changes it in every scenario. Call order and retention can differ between
scenarios. Choose a scenario in the top bar to see its workflow, or **Show all**
to see the whole model.

**The diagram describes a design; it does not configure your services.**
Selecting authentication does not enable sign-in. Drawing a boundary does not
enforce isolation. A review with no findings does not prove a system is secure
or compliant.

## 2. How to install and run

### From source on Windows, macOS, or Linux

Use Git, a terminal, current Edge or Chrome, and **Node.js 24 LTS with npm**.
The locked frontend toolchain requires Node 22.12 or later; Node 24 LTS is
the recommended choice and also supports the repository's contributor checks.
Ordinary modeling needs no Azure account, API, MCP server or cloud resource.

| Platform | Setup notes |
|---|---|
| Windows | Install [Git for Windows](https://git-scm.com/install/windows) and [Node.js 24 LTS](https://nodejs.org/en/download) with npm and PATH enabled. PowerShell is included with Windows; Windows Terminal can host it. If available, `winget install --id Git.Git --exact --source winget` and `winget install --id OpenJS.NodeJS.LTS --exact --source winget` are installer alternatives; verify the installed Node major version. |
| macOS / Linux | Install [Git](https://git-scm.com/downloads) and Node.js 24 LTS. A version manager such as [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) can install/select official Node builds. |

Follow your organization's software-installation process. Reopen your terminal,
then verify `git --version`, `node --version`, and `npm --version`.
In Windows PowerShell, use `npm.cmd` wherever this guide says `npm` if
PowerShell blocks the `npm.ps1` wrapper; no execution-policy change is needed.
Node should report `v24.x.x` for the recommended setup.

From a folder where you keep projects:

```sh
git clone https://github.com/microsoft/SecureDesignStudio.git
cd SecureDesignStudio
npm start
```

`npm start` runs the cross-platform prerequisite-checking launcher
`scripts/launch.mjs`. It installs dependencies with `npm ci` on first run,
repairs missing or incompatible direct dependencies after updates, and starts
the app. Initial installation needs internet access. Alternative wrappers
from the repository root are `.\Start-SecureDesignStudio.ps1` on Windows
and `./start-securedesignstudio.sh` on macOS/Linux.

Open **http://localhost:5173/**. Keep that terminal running; Ctrl+C stops it.
Port 5173 is strict: the launcher checks it first and, when it is busy, reports
how to inspect its owner. Stop only your own server, and never an unfamiliar process
on a shared machine. Follow the
[port guidance](advanced-configuration.md#troubleshooting-and-quick-reference).

This starts Vite only. Collaboration and Design Assistant are disabled.
After initial page load, editing, analysis, autosave, and local file operations
work offline. External help links and optional network features are separate.

If you prefer to run the underlying steps yourself, `npm ci` followed by
`npm run dev` starts the same local mode without the launcher's prerequisite checks.

### Start with the optional AI assistant

The AI Design Assistant is **bring your own AI**. No model service ships with
SecureDesignStudio and none is provided for you. Choose one provider: an Azure
OpenAI/Foundry deployment you are authorized to use, or the official Claude Code
or Codex CLI signed in with your own eligible subscription. Everything in this
guide except Chat, AI Analysis, Simulate breach and Design with AI works
without it.

Choose a provider at startup. The remaining setup differs by provider:

On any supported OS, use `npm run start:ai -- --provider azure` (or `claude`
or `codex`). On macOS/Linux, `./start-securedesignstudio-with-ai.sh` accepts
the same options. The PowerShell examples below are Windows alternatives.
See [cross-platform AI startup](bring-your-own-ai.md#cross-platform-startup)
for diagnostics and Node build requirements.

| Requirement | Notes |
|---|---|
| AI provider | Choose Azure OpenAI/Foundry, Claude Code, or Codex in the launcher or in SDS. |
| Azure Functions Core Tools | Required only for Azure; runs the local API on port 7071. The launcher reports the install command if it is missing. Claude/Codex use Vite on port 5173 and require no Functions installation. |
| Azure CLI, signed in | Required only for Azure. A secured account accepts Microsoft Entra tokens, so `az login` is required. No API key is used. |
| Azure OpenAI deployment | Required only for Azure: its HTTPS endpoint and model deployment name. |

```powershell
$env:AZURE_OPENAI_ENDPOINT = "https://<your-resource>.openai.azure.com"
$env:MODEL_DEPLOYMENT_NAME = "<your-model-deployment-name>"
az login
.\Start-SecureDesignStudio-WithAI.ps1 -Provider Azure
```

For Azure, add `-VerifyEndpoint` to probe the deployment before starting. The
probe sends an inference request and may incur usage. It reports a missing
role, a blocked IP, or a wrong deployment name as a clear message rather than
an opaque failure in the browser.

For Claude or Codex, install and sign in to its CLI (`claude auth login` or
`codex login`), then start with `-Provider Claude` or `-Provider Codex`. No
Azure resource, Azure CLI or Functions Core Tools is needed. Add
`-DiagnoseProvider` to check CLI readiness without starting servers or making
an inference request. Omit `-Provider` for an interactive menu. Successful
sign-in alone does not establish executable discovery or isolation support;
see [CLI startup troubleshooting](bring-your-own-ai.md#troubleshoot-subscription-cli-startup).

To create an Azure OpenAI instance and secure it properly — disabling key
authentication, restricting network access, and assigning the data-plane role —
follow [Bring your own AI](bring-your-own-ai.md). For what the assistant sends,
see [advanced configuration](advanced-configuration.md).

### Update an existing clone safely

Inspect `git status --short --branch` in the clone. Save a `.tma` backup,
stop only your own server, preserve local changes, and confirm the intended
branch before running:

```sh
git pull --ff-only
npm start
```

The launcher checks installed direct dependencies and runs `npm ci` when
`node_modules` is absent or packages are missing or incompatible. For a
lockfile-only update to otherwise compatible packages, run `npm ci` yourself
to restore the exact locked versions. Resolve Git conflicts or
non-fast-forward updates with the branch owner; do not discard edits or switch
a shared preview branch.

### From a trusted standalone HTML file

A trusted `dist-single/index.html` or exported standalone HTML opens directly
in a browser without Git, Node, or a server. Obtain it from an approved source;
no public download or release package is assumed.

To build it from your trusted clone, run `npm run build:single` and open
`dist-single/index.html`. This does not deploy a website. Standalone editing
works offline, but enabled collaboration can contact services, unlike
`npm start`.

<a id="3-simple-how-to"></a>

## 3. Start the support-case walkthrough

Sections 3–5 follow one example: build a support-case model, follow its calls,
then review and export it.

<a id="build-a-model-manually"></a>

### Create the sample manually

**In this exercise, you will create the diagram yourself. Start by choosing
Create, not Design with AI.** You need no AI service, real application IDs,
or live resources.

The sample is **Submit a support case**: a web app sends a case to an API,
which saves it in a storage account. All names, settings, and explanations
below are fictional practice choices, not recommendations for a production
service. Do not enter real customer data.

1. **Create the scenario.** In a blank app, enter `Submit a support case` in
   **Create your first scenario**, then choose **Create**.
   If you already have a model open, save it first. Use **File > New** for a
   fresh model, or **Model > New scenario** to add this exercise to your
   current model. Make sure `Submit a support case` is selected in the top bar.
2. **Add three nodes, one at a time.** Right-click blank canvas and choose
   **New Node**. In **each node's Properties > General / Security**, enter its
   **Title** and choose its **Type** using the table below. Repeat until all
   three nodes are present. Other fields can stay unchanged for now.

   | Title | Type |
   |---|---|
   | `Support web` | **App Service app** |
   | `Support API` | **App Service app** |
   | `Case store` | **Storage account** |

3. **Connect the nodes.** Drag a connection handle from Support web to Support
   API. Select the arrow and set its **Title** to `Submit case`.
   Create a second arrow from Support API to Case store and name it `Store case`.
   Check that both arrows point in the direction of the call.
4. **Set communication and authentication on both flows.** Select each arrow,
   open **Properties > General / Security**, and set the following:

   | Flow | Communication: Protocol profile | Authentication method |
   |---|---|---|
   | `Submit case` | **HTTPS** | **Entra user** |
   | `Store case` | **HTTPS** | **Managed identity** |

   For this sample, assume a signed-in user submits the case and the API uses
   its managed identity to write to storage. These selections describe that
   assumption; they do not configure or verify it.
   **Optional for your own model:** if you have the real values, you can also
   enter the caller's **Application ID**, intended audience, access constraints,
   and required access rights where applicable. For this demo, leave those
   fields blank and go to step 5. Analyze may later ask for missing details;
   that is an expected review question in this exercise.
5. **Add and attach the data.** Choose **Model > Data Elements > Add data item**.
   Name it `Case text`, choose **Customer Content**, and leave **Sample** blank.
   Select `Submit case`, open its **Privacy** tab, and attach `Case text` under
   **Data in request**. Do the same for `Store case`, reusing the same data item.
6. **Add security and privacy boundaries.** Right-click blank canvas and choose
   **New Security Boundary**. Name it `Support service`, choose **Azure** as its
   **Security subtype** in Properties, and resize it around Support API and
   Case store. Drag the outer border to move it; use its handles to resize.
   Then choose **New Privacy Boundary**, name it `Case data region`, select
   **Geo boundary** as its **Privacy subtype**, and resize it around those
   same two nodes. The privacy boundary surrounds the components that handle
   `Case text`, not the data item's entry in the Data list.
   Right-click the `Submit case` flow, choose **Add new comment**, paste this
   fictional explanation, then click **Post**:
   `For this exercise, the API processes case text and the store keeps it in
   the same approved region. The web app sends the text into that region.
   The Support service boundary marks the Azure components managed by our team.`
   You do not need AI to write this explanation. Neither boundary enforces
   the stated controls.
7. **Set retention.** Choose **Review > Analyze** to add incoming data to the
   receiving nodes' privacy inventories. Select Support API, open **Privacy**,
   and set `Case text` to **Processing only (no storage)** for this scenario.
   Select Case store and set it to **Storage ≥ 48 hours**.
   These are sample assumptions; real retention periods need owner approval.
8. **Select Optimize.** Use **Optimize** beside the bottom-left zoom controls,
   or **View > Optimize diagram**, to arrange the diagram. You can still drag
   nodes and adjust flows afterward. Use **Undo** if you prefer the old layout.
9. **Review and save.** Choose **Review > Analyze** again, then open
   **Review > Issues** to read the remaining questions. Record anything you
   cannot answer as a comment or work item; do not invent real identities or
   controls just to clear a warning. Choose **File > Save as >
   SecureDesignStudio model (.tma)** and save `support-case.tma`.
   Use **File > Open** to reopen it.

### Optional node details: asset ID and endpoint matching

Continue with the **Submit a support case** diagram you just created.
This optional exercise adds asset labels, then shows how the app uses endpoint
patterns to recognize the types of components in a file.

1. **Label your three assets.** Select each node and enter the following in
   **Properties > General / Security > Inventory ID**:

   | Node | Asset ID |
   |---|---|
   | Support web | `SUPPORT-WEB-001` |
   | Support API | `SUPPORT-API-001` |
   | Case store | `SUPPORT-STORE-001` |

   These fictional IDs identify your assets in the diagram; they do not create
   anything in Azure. Save your model before trying the next steps.
2. **Set the matching patterns for this exercise.** Open **Model > Node Type
   Catalog**, search for **App Service app**, and select it to edit.
   Replace **Endpoint regex** with the first pattern below, then choose
   **Save type**. Repeat for **Storage account** using the second pattern.
   Leave other type settings unchanged.

   | Type to edit | Copy into Endpoint regex | What it recognizes |
   |---|---|---|
   | App Service app | `^https://support-(web\|api)\.example\.com(/\|$)` | The fictional Support web and Support API addresses |
   | Storage account | `^https://case-store\.example\.com(/\|$)` | The fictional Case store address |

   A regex is a matching pattern. You can copy these as written; you do not
   need to learn regex syntax for the exercise. Both Support web and Support
   API use the same **App Service app** type, so they share its matching rule.
   These edits are saved in this diagram's catalog, not the shipped library.
   **Do not enter these patterns in individual nodes' EndpointRegex fields:**
   the importer uses the type definitions you just edited.
3. **Create the endpoint file.** In a text editor, paste the following and save
   it as `support-endpoints.txt`, with one address per line:

   ```text
   https://support-web.example.com/
   https://support-api.example.com/cases
   https://case-store.example.com/cases
   ```

4. **Import the text file.** Switch back to the browser tab containing
   SecureDesignStudio. At the top of the app, open the **Scenario** dropdown
   and choose **Submit a support case**, the scenario you created in step 1
   of the main walkthrough. If it is already selected, leave it selected.
   Open the **Model** menu and click **Endpoint matching**.
   In the **Import nodes from Endpoints** dialog, click **Choose file…**.
   Find `support-endpoints.txt` in the folder where you saved it, select it,
   and click **Open** in the file picker. The import runs when you open the file;
   there is no separate Import button.
5. **Read the browser's result popup.** Immediately after import, a popup
   should say:

   ```text
   Imported 0 new node types (2 matched in total). All endpoints recognized.
   ```

   Click **OK** to close it. The popup shows totals, **not a list of which
   address matched which type**. In this exercise, the patterns you entered
   match the web and API addresses to **App Service app**, and the store
   address to **Storage account**.
   Zero new nodes is expected because both types already exist in your diagram.
   Your three nodes and two flows stay in place; no matching labels or URL
   assignments are added to them. If you already closed the popup, import the
   same file again to see the totals; it will not duplicate existing types.
   If the popup reports unmatched addresses, check the copied patterns and file
   contents. Those lines are downloaded in `support-endpoints_unknown.txt`.
6. **Save the exercise.** Save your `.tma` again to keep the asset IDs and
   edited type definitions.

Endpoint matching is useful when you have an endpoint list and want to add
missing component types to a model. It adds one node per missing type, not one
per address. It does not visit the URLs, configure services, or draw flows.

### Editing, undo, and recovery

Continue with **Submit a support case**. Try a small edit, undo it, and reopen
your saved model:

1. **Save a starting copy.** Choose **File > Save** to save your current
   `support-case.tma`. If you have not saved it yet, choose **File > Save as >
   SecureDesignStudio model (.tma)** and use that filename.
2. **Edit the API node.** Click **Support API** on the diagram, then choose
   **View > Properties**. In **General / Security**, select all the text in
   **Title** and paste `Support API - reviewed` over it in one edit.
   Click outside the Title field.
   Check that the node's label on the diagram now shows the new name.
3. **Undo the edit.** Click the app's **Undo** button. The node should be named
   `Support API` again. If Properties no longer shows the node, click it again
   to see its details.
4. **Redo the edit.** Click **Redo**. The label should return to
   `Support API - reviewed`. Click **Undo** once more to restore `Support API`
   so the names still match the rest of this exercise.
5. **Practice reopening your backup.** Choose **File > Open**, select
   `support-case.tma` from the folder where you saved it, and click **Open**.
   Confirm replacement if asked. In the top **Scenario** dropdown, choose
   **Submit a support case** if it is not already selected. Check that your
   three nodes, two flows, boundaries, and saved settings are still present.

For document shortcuts, click outside text fields before pressing Ctrl+Z
(Cmd+Z on macOS) for Undo. Inside a field, that shortcut may undo typing instead.

**Autosave helps recover unsaved work in the same browser profile and site;
it is not a backup.** If recovery is unavailable, use **File > Open** to reopen
your saved `.tma`, as you just practiced. Edits made after that file was saved
will not be in the file. Save regularly, especially before replacing or sharing
a model or clearing browser storage.

### Build a proposed threat model with AI

Now build **Submit a support case** again, this time using AI. Keep the manual
version so you can compare the two.

**Before you start, complete the AI connection.** Follow
[Start with the optional AI assistant](#start-with-the-optional-ai-assistant)
and [Bring your own AI](bring-your-own-ai.md) to configure your chosen provider
and confirm it is available. Ordinary `npm run dev` disables AI; you must use
the appropriate AI-enabled startup. If you have not connected a provider, skip
this exercise for now. Your manual model still works without AI.

1. **Keep your manual model.** Save it as `support-case.tma` before changing
   startup modes or creating another model.
2. **Start a separate model.** In the AI-enabled app, choose **File > New**
   and confirm replacement if asked. Enter `Submit a support case` in
   **Create your first scenario**, then choose **Create**.
   This gives AI an empty scenario without changing your saved manual file.
3. **Ask AI to build the sample.** With **Submit a support case** selected in
   the top **Scenario** dropdown, choose **File > Design with AI**.
   Paste this prompt into the **Threat Model Designer** and press Enter:

   ```text
   Build a fictional "Submit a support case" workflow for a training exercise.
   Create exactly three nodes:
   - Support web: App Service app.
   - Support API: App Service app.
   - Case store: Storage account.

   Add these calls in this order:
   1. Support web to Support API, titled "Submit case", using HTTPS and Entra user.
   2. Support API to Case store, titled "Store case", using HTTPS and Managed identity.

   Create one data item called "Case text", classified as Customer Content.
   Attach it as request data on both flows. Do not include real customer samples.

   Put Support API and Case store inside a security boundary named
   "Support service", with Azure as its subtype.
   Put those same two nodes inside a privacy boundary named
   "Case data region", with Geo boundary as its subtype.
   Leave Support web outside both boundaries.

   Explain the fictional assumption that the API processes case text and the
   store keeps it in the same approved region, managed by our team.
   Do not invent application IDs or claim any resources or controls are deployed.
   ```

4. **Check the generated diagram.** When AI finishes, look for the three named
   nodes, two correctly directed flows, and two boundaries.
   Select each flow and open **Properties > General / Security** to check
   HTTPS and its authentication method. In **Privacy**, check that `Case text`
   is attached under **Data in request** on both flows.
   AI can make mistakes; do not assume the prompt was followed exactly.
5. **Correct anything missing.** Use the same Designer dialog for a specific
   follow-up, for example:
   `The Store case flow is missing Case text in its request data. Attach the
   existing Case text item to that flow; do not create another data item.`
   You can also edit the diagram manually. Each applied AI response is one
   Undo step. Choose **Collapse** to make more room for checking the canvas.
6. **Complete retention and the explanation.** Select Support API and set
   `Case text` retention to **Processing only (no storage)** in **Privacy**.
   On Case store, choose **Storage ≥ 48 hours**.
   AI-added request data should already appear on the receiving nodes; if
   needed, choose **Review > Analyze** to populate their privacy inventories.
   New retention entries start as **Not specified** until you choose a value.
   Right-click `Submit case`, choose **Add new comment**, and post the same
   fictional boundary explanation used in step 6 of the manual walkthrough.
7. **Arrange, review, and save.** Select **Optimize**, then choose
   **Review > Analyze** and read the remaining Issues.
   Choose **File > Save as > SecureDesignStudio model (.tma)** and save
   `support-case-ai.tma`. Do not overwrite `support-case.tma`.
   To compare the two models, choose **File > Compare to previous** and select
   your manual `support-case.tma`, then open **Review > Changes**.

**AI output is a proposal, not evidence of a deployed system.** These settings
and explanations remain practice assumptions. AI does not deploy resources or
discover your services.

The Designer shows which configured endpoint receives your prompt and model
context. Generated model content is saved in `.tma`; the chat and unfinished
prompt are not. **Stop generating** or closing the dialog cancels a pending
request. Switching models or scenarios clears the conversation.
**Review > Design Assistant** is the separate chat and analysis experience,
not the command used to build this sample.

<a id="6-using-sequence-view"></a>

## 4. Walk through the calls in sequence

Use the **same support-case model you just built** to explain what happens
when a user submits a case.

1. **Open Sequence.** Select **Submit a support case** in the top **Scenario**
   dropdown, choose **Filter > Clear all**, then **View > Sequence**.
2. **Find the three participants.** Across the top, look for Support web,
   Support API, and Case store.
3. **Follow the request.** Read `Submit case` from Support web to Support API,
   then `Store case` from Support API to Case store. Check the call numbers:
   Submit case should be first and Store case second.
4. **Follow the returns.** The dashed arrows show the return from Case store
   to Support API, then the return to Support web. These are drawn from call
   order; they do not prove real response timing or require separate flows.
5. **Inspect a call.** Click the `Store case` call and choose **View > Properties**.
   Check its HTTPS and Managed identity settings. In **Privacy**, find
   `Case text` under **Data in request**. Clicking its dashed return selects
   the same flow; response data, if recorded, belongs under **Data in response**.
6. **Correct the order if needed.** Choose **View > Edge list**.
   If Store case is before Submit case, select Submit case and use **Move up**
   until it is first. Return to **View > Sequence** and check the order.
   If it was already correct, leave it unchanged.
7. **Return and save.** Choose **View > Diagram**. Your three nodes and two
   flows are the same model, not a converted copy. Use **File > Save**.

Now review the design and record any questions in section 5.

<a id="5-analysis-and-review"></a>

## 5. Review the support-case design

Continue with the **Submit a support case** model from section 3. You can use
the manual version or the AI-built version. This exercise checks the same
two calls and records a question that a real service owner would need to answer.

### Check the sample with Analyze

1. **Select the workflow.** In the top **Scenario** dropdown, choose
   **Submit a support case**. Choose **Filter > Clear all** so you can see
   all three nodes and both flows.
2. **Run the local checks.** Choose **Review > Analyze**. The Issues inspector
   opens with the results. This needs no AI connection and checks the whole
   document, not just what is visible.
3. **Read any issues.** Open an issue and use its explanation to find the
   affected node or flow. Results depend on your saved settings and libraries:
   there is no fixed number of issues for this sample. Missing application IDs
   or unreviewed service policies may still need attention.
   **Not re-evaluated** means the app could not check that concern, not that it
   passed. Do not invent real values to remove a warning.
4. **Check the two calls yourself.** Select `Submit case` and open
   **Properties > General / Security**: it should use **HTTPS** and
   **Entra user**. Select `Store case`: it should use **HTTPS** and
   **Managed identity**. In each flow's **Privacy**, check `Case text` under
   **Data in request**.
5. **Check retention.** Select Support API and open **Privacy**:
   `Case text` should be **Processing only (no storage)**.
   On Case store it should be **Storage ≥ 48 hours**.
   Correct any differences, then choose **Review > Analyze** again.

No issues does not prove the fictional design is secure. Analyze checks what
you recorded; it does not inspect deployed resources.

### Record a review question and follow-up

1. **Add a question to the storage call.** Right-click the `Store case` flow
   and choose **Add new comment**. In **Write a new comment…**, enter
   `For a real service, who approves how long case text is kept, and how is it
   deleted?` Click **Post**, then close the dialog.
2. **Find the question again.** Choose **Review > Comments**. Look for your
   comment on `Store case` in **Submit a support case**. This discussion stays
   with the scenario and flow.
3. **Create a follow-up item.** Choose **Model > Work Items**, then
   **+ Add work item**. Set **Name** to `Confirm case-text retention`,
   **Description** to `Ask the service owner to confirm the retention period
   and deletion process for Case store`, **Work item type** to **Task**, and
   **Severity** to **3 - Medium** as a fictional exercise choice.
   Leave **Weakness Type** and **Link** blank, and leave the submission decision
   as **Pending review**. You are recording work, not sending it to Azure DevOps.
4. **Save your review.** Use **File > Save** to keep the comments, work item,
   and corrected settings in your current `.tma`.

### Optional: review the same sample with AI

Continue with **Submit a support case**. You must complete the AI connection
from section 3 before running this review. The CSV and Excel exercises below
also work with the manual work item you created earlier if AI is unavailable.

#### Run the AI review

1. **Select the sample.** Choose **Submit a support case** in the top
   **Scenario** dropdown. Do not choose **Show all**.
2. **Run AI Analysis.** Choose **Review > Design Assistant**, switch to
   **AI Analysis**, and click **Analyze model**. Wait for the findings to appear.
   This sends the scenario context to your configured provider; it is not the
   offline **Review > Analyze** command.
3. **Save the completed review.** Choose **File > Save**. Save again after
   recording your decisions. Running AI Analysis again replaces the current
   AI results, so finish this exercise before requesting another analysis.

AI results vary. The example concerns below help you understand the controls;
they are not promises that AI will return those findings.

#### Use the STRIDE view

1. **Open the combined review.** Choose **Review > Findings**.
   Set **Scope** to **Current scenario**, **Source** to **All sources**, and
   **Status** to **Needs attention**.
2. **Read the STRIDE evidence table.** Rows group concerns by threat category.
   Columns show where the evidence came from: **AI analysis**, **Analyzer rules**,
   **Saved notes / issues**, or **Service-model deviations**.
   Use these sample questions to understand the rows:

   | STRIDE row | Question for the support-case example |
   |---|---|
   | Spoofing | Could someone submit a case while pretending to be another user? |
   | Tampering | Could someone change another user's case text? |
   | Repudiation | Can the owner trace who submitted or changed a case? |
   | Information disclosure | Could an unauthorized person read case text? |
   | Denial of service | Could oversized submissions overwhelm Support API? |
   | Elevation of privilege | Does the API's managed identity have more storage permissions than it needs? |
   | Unclassified | Is there a concern that has not been mapped to a STRIDE category? |

3. **Open a group of findings.** For example, if **Information disclosure**
   has a nonzero number in the **AI analysis** column, click that number.
   The list below changes to **Matching findings** for that category and source.
   If it is zero, choose another nonzero count; do not assume zero means safe.
   If the table is collapsed, click **Show STRIDE evidence** first.
4. **Inspect one finding.** Read **Why** and **Next**, then click **Details**
   to read the complete finding. Clicking the card's heading instead selects
   and centers its referenced component on the diagram.
   Use the inspector's pin control if you want to keep Findings open while
   selecting diagram objects.
5. **Return to the full list.** Return from Details using the onscreen Back
   control, then click **Clear** beside the selected category/source above
   Matching findings. This clears the chosen table count, not the findings.

One finding can belong to more than one STRIDE row, so adding all row counts
can count it more than once. The table organizes evidence; it does not verify
that a threat exists or that the design is secure.

#### Accept a useful finding and create work

Suppose AI raises a concern such as **"Case store access needs review"**.
You agree that the owner should confirm who can read or change case text.

1. **Choose a useful AI finding.** In Findings, open its **Details** and expand
   **Work item actions**. If that exact example is absent, use another relevant
   finding from your results.
2. **Classify the follow-up.** Set **Work item type** to **Task**.
   Leave **Weakness Type** blank for this exercise.
3. **Create the work item.** Click **Create work item**.
   SDS marks the AI finding accepted and opens the new item in **Work**.
   Accepting means you chose to act on the concern; it does not mean it is fixed.
4. **Edit the new Work card.** For this practice task, set **Name** to
   `Review Case store access` and **Description** to
   `Confirm who can read and change case text, and whether Support API has only
   the storage permissions it needs.`
   Check **Work item type** is **Task**. Review the copied AI severity and choose
   **3 - Medium** as a fictional exercise value. Leave **Link** blank because
   no external tracker item has been created.
5. **Accept the work for export.** On that Work card, set **Submission decision**
   to **Accept**. This is a separate decision from accepting the AI finding.
   It selects the work for export or later submission; it does not contact ADO.
   Leave the earlier `Confirm case-text retention` item **Pending review** if
   you want this export to contain only the new task.
6. **Save.** Use **File > Save** to retain the finding decision and work item.

Alternatively, **Create issue** accepts an AI finding as a saved diagram issue.
Use it when you want an issue rather than a Work item. Choose your action before
accepting: creation actions are disabled once that finding is accepted.
**Resolve** is different again: it records a review decision that the concern
has been addressed. Creating work alone is not a reason to resolve it.

If you skipped AI, use the earlier **Confirm case-text retention** Work card
instead: check its Name, Description, Task type, and severity, leave Link blank,
and set **Submission decision** to **Accept**.

#### Delete an unwanted AI finding

For example, AI may repeat the same concern twice. Read both before deleting one.

1. **Keep the useful record.** Choose **Review > Findings** and set **Source**
   to **AI analysis** so you are acting on an AI finding, not a saved issue.
   Set **Status** to **All statuses** if needed.
2. **Delete only the duplicate.** On the unwanted finding, click **Delete**.
   Read the confirmation and confirm only if you intend to remove that finding.
   It disappears from the list. If no finding should be removed, skip this step.
3. **Practice recovery if you wish.** Click the app's **Undo** to restore the
   deleted finding, or leave it deleted and save your decision.

Deleting an AI finding does not delete an Issue or Work item already created
from it. It can appear again in a later AI analysis.
Do not delete a concern merely because the diagram labels a control as present;
the label alone does not prove the control is implemented.

#### Export the accepted work as CSV

This exercise prepares a file locally. **Do not connect, submit, or import
fictional training work into a real ADO project.**

1. **Open Work.** Choose **Model > Work Items**.
   Check your chosen task is **Accept**, has Name, Description, Task type,
   and Severity filled in, and has no Link. Pending, rejected, linked, or
   previously submitted/uncertain items are excluded.
2. **Set the export configuration.** Expand **ADO configuration**.
   If you already have a saved destination, do not overwrite it for this demo.
   If the editor has no configuration, paste the fictional training example
   below into **ADO configuration (JSON)**, then click **Save ADO configuration**:

   ```json
   {
     "organizationUrl": "https://dev.azure.com/example-training",
     "project": "SupportCaseDemo",
     "inventoryId": "11111111-1111-4111-8111-111111111111",
     "reviewer": "reviewer@example.com",
     "descriptionField": "System.Description",
     "defaults": {
       "System.AreaPath": "SupportCaseDemo",
       "System.Tags": "Training; DataSource:SecureDesignStudio",
       "Custom.ReviewTeam": "Training review team",
       "Custom.TeamID": "22222222-2222-4222-8222-222222222222"
     }
   }
   ```

   These values only let you practice preparing a file; they do not create or
   verify an ADO destination. The export needs an inventory GUID, reviewer,
   area path, review team, and team ID. This inventory GUID is separate from
   the three node asset labels used earlier.
   For real work, obtain the correct settings from your administrator; see
   [ADO configuration](advanced-configuration.md#work-items-and-azure-devops-submission).
3. **Export.** Click **Export ADO CSV**.
   Look beside the export buttons for the prepared-item count or an error.
   If it reports a missing field, correct that Work card or the configuration
   and try again.
4. **Find the file.** Open your browser's Downloads (Ctrl+J on Windows) and find
   `secure-design-studio-ado-import.csv`. For this exercise, expect one task
   row if only your chosen task is accepted and eligible.
   Open it in a text editor to check the title and description.

CSV export does not submit work or record an ADO success.
For real, approved work, Azure Boards imports the CSV through
**Boards > Queries > Import work items**; review validation before saving.
After creation, record each item's tracker Link in SDS to avoid duplicate work.
Do not import this fictional file.

#### Open the ADO Excel template

The following viewing steps use **Microsoft Excel installed on Windows**.
SDS can export without Excel installed. XLSX is not Windows-only: the files
can also be viewed in Excel on macOS or Excel for the web.

1. **Export the same accepted task.** In Work, click **Export ADO Excel template**.
   Find `secure-design-studio-ado-import.xlsx` in your browser's Downloads.
2. **Open it in Excel.** Open the downloaded file with Microsoft Excel.
   Select the **ADO import** worksheet using the sheet tabs at the bottom.
   Find `Review Case store access` (or your retention task) in **Title**.
   Check Description, Work Item Type, Severity, and the configured destination
   fields. You should see the same accepted task as in the CSV.
3. **Check the blank fields.** **ID**, **Created Date**, and **State** are blank
   because no ADO item has been created. **Assigned To** is blank in the training
   configuration above; a real saved configuration may provide it for reference.
   The creation CSV omits those four columns.
4. **Read Import instructions.** Select that worksheet for the file's usage
   notes. This workbook is for preparing and reviewing ADO rows; it has no
   connected Publish button. Opening or editing it does not submit work or
   update the SDS model.

#### Export and read the complete review workbook

This is a **different XLSX file** from the ADO template. It includes the whole
review, not just accepted work.

1. **Export from the inspector.** Choose **Review > Findings**, then click
   **Excel (.xlsx)** above the inspector tabs. Its accessible label is
   **Export all inspector data (.xlsx)**.
2. **Open the download in Excel.** Find `secure-design-studio-inspector.xlsx`
   in browser Downloads and open it.
3. **Read Export info.** Check which scenario was analyzed and when the file
   was exported.
4. **Review AI findings.** Select the **AI findings** sheet. Locate the finding
   you acted on and check **Accepted** is **Yes**. Read its rationale,
   recommendation, references, and Status. A deleted AI finding is not exported.
5. **Review Work.** Select the **Work** sheet. Find your accepted task and the
   earlier pending retention task. Both are included here: this workbook is
   not filtered to the ADO export queue.
6. **Inspect the design evidence.** In **Edges**, find Submit case and Store case
   and check their authentication and protocol IDs. In **Comments**, find your
   retention question. Use **Nodes**, **Data**, and **Scenarios** to review
   the rest of the sample. Retention settings are retained in the Scenarios
   sheet's **Complete record (JSON)** column; to read them more easily, return
   to each node's **Privacy** tab in SDS.
   In Excel, click the header row and choose **Data > Filter** to narrow a sheet.
   If a cell refers to **Long text**, read the numbered parts on that sheet.
7. **Keep the editable model.** Save `.tma` separately.
   The workbook is a snapshot across all scenarios and statuses, even when
   Findings was filtered to this sample. Editing Excel does not change SDS.

| Download | Purpose |
|---|---|
| `secure-design-studio-ado-import.csv` | Accepted, eligible work prepared for Azure Boards CSV import |
| `secure-design-studio-ado-import.xlsx` | Excel worksheet for reviewing the same ADO creation rows |
| `secure-design-studio-inspector.xlsx` | Complete model/review snapshot, including pending and resolved records |

The XLSX files contain text cells, not macros or executable formulas.
Re-export after changing the model; existing downloads do not update themselves.

<a id="simulate-a-breach-path"></a>

**Simulate breach** in the Assistant's AI Analysis tab is an optional
illustration based on retained AI findings and connected flows, not a real
attack or proof of exploitability. See the
[AI review reference](advanced-configuration.md#collaborate-or-use-optional-ai).

### Share the sample as a PNG image or HTML report

Use the **Export** button on the command bar to share this sample with someone
who does not need to edit it. Neither export requires an AI connection.

#### Export a picture of the diagram

1. **Prepare the sample.** Select **Submit a support case**, choose
   **Filter > Clear all**, and open **View > Diagram**. Check that all three
   nodes and both flows are visible. The PNG option is unavailable in Sequence
   view or when **Show all** is selected.
2. **Download the image.** Click **Export**, then **Diagram image (.png)…**.
3. **Open the result.** Open your browser's Downloads (Ctrl+J on Windows).
   If your model is saved as `support-case.tma`, look for
   `support-case-diagram.png`. Open it in your image viewer.
   Check that Support web, Support API, Case store, and their flows appear.
4. **Use the picture.** Add it to a document or presentation to explain the
   design. It is an image, not an editable model; values hidden on the canvas
   are not revealed in the picture. Keep your `.tma` file for editing.

#### Export a readable review report

1. **Keep the sample selected.** Stay in **View > Diagram** with
   **Submit a support case** selected and filters cleared.
2. **Download the report.** Click **Export**, then **Review report (.html)…**.
3. **Open the result in a browser.** Find `support-case-review-report.html`
   in Downloads and open it with your browser. Do not use SDS's **File > Open**.
   The filename follows your saved model name, so the AI-built copy produces
   `support-case-ai-review-report.html`.
4. **Read the sample's details.** Check the scenario heading and diagram.
   Scroll to **Node inventory** for the three components, then **Data flow
   inventory** for their authentication and communication settings.
   In **Data inventory and retention**,
   find Case text and check the retention recorded for Support API and Case
   store. Review the comments and saved issues further down the report.
   If the browser could not capture the diagram, the text tables are still
   available.
5. **Share or print.** Share the HTML file with your reviewer, or use your
   browser's Print command to print it or save a PDF.
   Check the contents before sharing: the report includes the selected
   scenario's recorded details, not just what was visible on the canvas.

This HTML report is a readable snapshot, not the standalone SDS application
or a model backup. It does not replace the complete AI findings workbook.
Changes made later in SDS do not update either download; export again when
you need a fresh picture or report.

You have now created, edited, walked through, reviewed, and exported one complete sample.
<a id="4-advanced-features"></a>
<a id="7-import-and-export"></a>
<a id="8-troubleshooting-and-quick-reference"></a>

For library customization, scope settings, import/export formats, collaboration,
and troubleshooting, use [Advanced configuration and reference](advanced-configuration.md).
