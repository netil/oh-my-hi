# Dashboard Guide

A guide to each section of the oh-my-hi dashboard.


## Sidebar

The left sidebar provides navigation, workspace selection, and date range filtering.

### Workspace Selector

Switch between **Global** (your entire Claude Code configuration) and **per-project** scopes. Each scope shows only the harness components and usage data relevant to that workspace.

### Date Range

Filter all usage data by time period:

| Button | Description |
|--------|-------------|
| **7d** | Last 7 days (today inclusive) |
| **30d** | Last 30 days (today inclusive) |
| **All** | All collected data since first session |
| **📅** | Custom date range picker |
| **⚖** | Compare toggle — overlays previous period data on stat cards and trend chart (7d/30d only) |

Hover over a non-active button to preview the date range in a tooltip. The active range is shown below the buttons.

**Compare mode**: When ⚖ is active, each stat card shows the previous period value below the current value, and the token trend chart overlays the previous period as a gray line. "Previous period" means the same-length window immediately before the current one (e.g., 7d selected → compares last 7 days vs. the 7 days before that).

### Search

Type to filter sidebar items by name. Matches are highlighted across all categories.

### Categories

Below the main navigation, each harness component category is listed with an item count badge. Click to expand and see individual items; click an item to view its detail page.

---

## Main Pages

### 📊 Harness (Overview)

The landing page showing a high-level summary of your harness activity.

| Section | Description |
|---------|-------------|
| **Stat Cards** | Total usage, skill calls, agent calls, and command invocations for the selected period. Each card shows the change percentage vs. the previous period. |
| **Category Distribution** | Donut chart showing the proportion of skills, agents, and commands. |
| **Daily Trend** | Line chart of daily activity (skills + agents + commands combined). |
| **Popular Skills** | Top 5 most-used skills ranked by call count. |
| **Activity Heatmap** | GitHub-style calendar heatmap of daily activity intensity. |
| **Recent Activity** | Timeline of the 10 most recent skill, agent, and command invocations. |
| **Unused Items** | Skills, agents, and MCP servers that were registered but never called in the selected period. When more than 3 items are unused, a cleanup tip is shown suggesting how to reduce context loading. |

---

### 🪙 Tokens (Overview)

Token usage analytics across all Claude Code sessions.

| Section | Description |
|---------|-------------|
| **Stat Cards** | Total tokens, input tokens, output tokens, cache tokens — each with period-over-period change. In compare mode, previous period values are also shown. |
| **Model Distribution** | Donut chart of token usage by model. |
| **Daily Token Usage** | Area chart of daily token consumption trend. In compare mode, previous period is overlaid as a gray line. |
| **Token Activity** | Calendar heatmap of daily token usage intensity. |
| **Tokens by Task Category** | Horizontal bar chart grouping token usage by auto-classified work type (code editing, documentation, planning, etc.). |
| **Token Usage by Tool** | Horizontal bar chart of tokens attributed to specific skills, agents, or tools (top 10). |
| **Token Usage by Model** | Table breakdown: input, output, cache, total tokens, and estimated cost per model. |
| **Token Insights** | Auto-generated analysis cards covering cache efficiency, response efficiency, model usage, cost breakdown, daily patterns, and peak hours. |

---

### 💰 Tokens > Cost

Cost analysis and budget tracking.

| Section | Description |
|---------|-------------|
| **Stat Cards** | Total cost, daily average cost, and per-model cost cards. Based on Anthropic API token pricing (not actual CLI subscription billing). |
| **Cost Budget** | Configurable daily/weekly/monthly spending thresholds. Set values and click Save — stored in browser localStorage. Progress bars show current spending vs. budget, with warnings at 80% and exceeded amount + percentage at 100%+. |
| **Cost Trend Charts** | Three area gradient charts (daily in orange, weekly in purple, monthly in green). When a budget is set, a blue dashed grid line marks the threshold. |
| **Cost Calculation** | Expandable section with the pricing formula, collapsible model pricing table (per 1M tokens), and a link to [anthropic.com/pricing](https://www.anthropic.com/pricing). |

#### Cost Calculation Formula

```
Cost = (Input × input price + Output × output price
      + Cache Read × cache read price + Cache Write × cache write price) ÷ 1,000,000
```

Prices are per 1M tokens (USD), sourced from Anthropic's official API pricing. Claude Code CLI is subscription-based, so this estimate is for reference only.

---

### 💬 Tokens > Prompt

Prompt and response analysis.

| Section | Description |
|---------|-------------|
| **Prompt Statistics** | Total prompts, average prompt length (chars), short prompt ratio (≤100 chars), long prompt ratio (≥500 chars). |
| **Response Latency** | Average, median (P50), 95th percentile (P95), and max response time (human→assistant interval). |
| **Hourly Token Distribution** | Bar chart of token usage by hour of day (24h). |
| **Cache Efficiency** | Fresh input, cache read, cache creation token counts with percentages and overall cache hit rate. Followed by contextual tips: low hit rate warnings, high creation/read ratio detection, and session-level cache usage analysis. |

---

### 📋 Tokens > Session

Session-level usage analysis.

| Section | Description |
|---------|-------------|
| **Stat Cards** | Total sessions, average messages per session, average session duration, longest session. |
| **Top Sessions** | Table of up to 20 sessions ranked by token usage. Shows date (with day of week), total tokens, estimated cost, duration, and models used. Click any row to open the session detail view. |

#### Session Detail (`#session/{id}`)

Clicking a session row navigates to a dedicated detail page:

| Section | Description |
|---------|-------------|
| **Stat Cards** | Total tokens, estimated cost, duration, message count for this session. |
| **Models Used** | Badges for each model used during the session with call counts. |
| **Skills / Agents / MCP** | Badges showing which skills, agents, and MCP servers were invoked. |
| **Activity Timeline** | Chronological table of every token entry: time, model, context, input/output/cache tokens, and cost. |

Use the "← Back to Sessions" button to return to the session list.

---

### 🗂️ Structure

Visual overview of your harness architecture.

| Section | Description |
|---------|-------------|
| **Component Flow** | SVG diagram showing how harness components relate to each other, grouped into three layers: **Context** (auto-loaded: CLAUDE.md, rules, principles, memory), **Event-driven** (hooks, MCP servers, plugins), and **User-invoked** (skills, agents, commands, teams, plans). |
| **File Tree** | Expandable tree view listing every registered component by category. Click any item to jump to its detail page. Plugins show active/inactive badges. |

---

### Category Pages

Click any category in the sidebar (Skills, Agents, Plugins, Hooks, etc.) to see a dedicated page for that category.

| Section | Description |
|---------|-------------|
| **Stat Cards** | Total items, usage count, and period-over-period change. |
| **Popular Items** | Top 5 most-used items within the category (ranked cards). |
| **Activity Heatmap** | Calendar heatmap filtered to this category only. |
| **Recent Activity** | Latest invocations of items in this category. |
| **Unused Items** | Registered items with zero calls in the selected period. |

---

### Item Detail Pages

Click any individual item (skill, agent, plugin, etc.) to see its detail page.

| Section | Description |
|---------|-------------|
| **Header** | Item name, type badge, file path, and description (from frontmatter). |
| **Metadata** | Parsed frontmatter fields displayed in a formatted card. |
| **Content Preview** | Full content of the item's definition file (markdown rendered). |
| **Usage Stats** | Call count and activity heatmap for this specific item (for skills, agents, commands). |
| **Related Items** | For plugins: list of skills provided by the plugin. For skills: parent plugin link if applicable. |

---

### ❓ Help

In-dashboard reference page.

| Section | Description |
|---------|-------------|
| **Usage** | How to run the `/omh` command. |
| **Parameters** | Table of all command parameters (`--data-only`, `--enable-auto`, etc.). |
| **Data Sources** | Reference for each data parser: what files are read and what data is extracted (config files, skills, agents, plugins, hooks, memory, MCP servers, rules, commands, teams, plans, todos, scopes). |
| **Token & Activity** | How token usage, prompt stats, latency, and activity data are parsed from transcript JSONL files. |

---

## General Features

### Dark / Light Mode

Toggle via the theme button in the sidebar footer. Preference is persisted in `localStorage`.

### Period Comparison

Stat cards with a change percentage compare the selected period against the immediately preceding period of equal length. For example, 7d compares the last 7 days vs. the 7 days before that.

Enable the ⚖ compare toggle in the sidebar to see explicit previous period values on stat cards and a gray overlay line on the token trend chart. Compare mode is available for 7d and 30d periods (disabled for All and custom ranges).

### Data Refresh

Run `/omh --data-only` to regenerate data and the web-ui without opening a new browser tab. Bookmark the generated local file (`output/index.html`) and refresh the page anytime to see the latest data.

Enable auto-refresh with `/omh --enable-auto` to rebuild data on every session end — just refresh the bookmarked tab to see updates.
