<div align="center">

<img src="src/assets/logo.png" alt="CodeGraph Logo" width="80" />

# CodeGraph

**An AI-powered, interactive codebase visualization and intelligence platform.**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![D3.js](https://img.shields.io/badge/D3.js-7.9-F9A03C?style=flat-square&logo=d3dotjs)](https://d3js.org/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-3.5_Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

> *Load any GitHub repository or ZIP archive and instantly get an interactive dependency map, code smell reports, AI explanations, and auto-generated test suites — all in the browser.*

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Feature Deep Dives](#feature-deep-dives)
  - [Graph Visualization](#graph-visualization-engine)
  - [File Inspector](#file-inspector)
  - [AI Code Intelligence Suite](#ai-code-intelligence-suite)
  - [Reports & Analytics Dashboard](#reports-analytics-dashboard)
  - [API Documentation Portal](#api-documentation-portal)
  - [KPI Ribbon](#kpi-ribbon)
  - [Theme System](#theme-system)
  - [Static Analysis Engine](#static-analysis-engine)
  - [Markdown & LaTeX Formatting Pipeline](#markdown-latex-formatting-pipeline)
  - [Command Palette & Keyboard Controls](#command-palette-keyboard-controls)
  - [Shareable URLs & Deep-Linking State](#shareable-urls-deep-linking-state)
  - [Recent Workspaces History](#recent-workspaces-history)
  - [AI Response Caching Layer](#ai-response-caching-layer)
  - [Real GitHub File Metadata HUD](#real-github-file-metadata-hud)
  - [Dynamic Filter System](#dynamic-filter-system)
  - [3D WebGL-Style Graph Canvas](#3d-webgl-style-graph-canvas)
  - [AI Caching & Token Telemetry Dashboard](#ai-caching-token-telemetry-dashboard)
  - [Churn vs. Complexity Risk Quadrant Chart](#churn-vs-complexity-risk-quadrant-chart)
  - [Mermaid.js UML Diagram Exporter](#mermaidjs-uml-diagram-exporter)
  - [Visual API-to-Database Mapping & Drift Analysis](#visual-api-to-database-mapping-drift-analysis)
  - [One-Click AI-Patch Applicator](#one-click-ai-patch-applicator)
  - [Keyboard Shortcut Reference Panel](#keyboard-shortcut-reference-panel)
  - [Babel AST-Based Static Analysis](#babel-ast-based-static-analysis)
  - [Gemini LLM Call-Graph Validation](#gemini-llm-call-graph-validation)
  - [Database ER Diagram Export & Styling Controls](#database-er-diagram-export-styling-controls)
  - [Interactive Codebase Sonification](#interactive-codebase-sonification)
  - [Visual AppSec & Dependency CVE Vulnerability Map](#visual-appsec--dependency-cve-vulnerability-map)
- [Architecture](#architecture)
- [Security & Privacy](#security-privacy-error-handling)
- [Contributing](#contributing)

---

## Overview

**CodeGraph** is a browser-based developer tool that transforms any codebase into an interactive, visual knowledge graph. It parses source files from a GitHub URL or a local ZIP archive, builds an accurate dependency graph, and then layers AI-powered intelligence on top — giving you deep insights into your project's structure, quality, and testability.

Whether you are onboarding to a new team, performing a code review, identifying technical debt, or simply trying to understand how modules connect — CodeGraph gives you a birds-eye view in seconds, no installation required on the target repository.

---

## Key Features

### 🗺️ Multi-Mode Graph Visualization
| Mode | Description |
|---|---|
| **Dependency Graph** | Force-directed layout showing all file import/export relationships with edge weights |
| **Module Clusters** | Files grouped by their parent folder, visualizing module boundaries |
| **Call Graph** | Function-to-function call relationships with interactive bioluminescent execution flow simulation |
| **Component Tree** | React component hierarchy shown as top-down or radial tree layout |
| **DB Schema** | Interactive Entity-Relationship (ER) database schema map parsing definitions (Prisma, SQL DDL, Mongoose, SQLAlchemy) |

### 📊 Codebase Evolution Timeline (Git Replay)
- **Chronological Growth Playback** — Simulated 10-step commit history mapping the codebase growth from birth (earliest files) to the present day. Sliding the timeline replays the historical changes of the codebase, showing new node clusters popping up and expanding as the codebase matures.
- **Bioluminescent Node Animations** — Newly added nodes scale up with glowing purple neon birth pulses (`#a855f7`), and modified files pulse with a warm orange wave (`#fb923c`) to highlight active zones during replay ticks.
- **Coordinate Caching Engine** — Persists D3 force coordinates across timeline steps via React refs, ensuring smooth growth transitions without visual layout shifting or canvas jumps.
- **Multi-View Compatibility** — Replays codebase growth seamlessly across Dependency Graph, Module Clusters, Call Graph, and Component Tree view modes.

### 🗂️ Multi-Branch / Pull-Request Comparison (Diff Graph)
- **Visual Changeset Map** — Modified, added, or deleted files are highlighted directly on the D3 canvas tree in specific color glows (Yellow/Green/Red), giving code reviewers a visual map of the changes before merging.
- **PR Diff Inspector HUD** — Select a changed node to open an interactive code review HUD showing status-specific badges and line additions/deletions counts.
- **Git Patch Visualizer** — Line-by-line syntax-highlighted git patch renderer showing precise code modifications inside the Inspector.
- **Virtual Deleted Node Support** — Support for inspecting placeholder nodes of files that have been deleted in the head branch, preventing crashes and offering full deleted patch history.
- **Dual-View Interface** — Toggle sub-tab interface allowing reviewers to switch between the visual patch changeset and traditional file metrics.

### 🗂️ Multi-File Refactor (Cross-File Suggestions)
- **Interactive Multi-Select Mode** — Toggle checkboxes next to all workspace files inside the files panel.
- **Cross-File Code Analysis** — Selecting two or more files allows triggering a shared architectural evaluation using Gemini.
- **Intelligent Refactoring Console** — Streams modular decoupling blueprints, shared helper suggestions, interface integrations, and step-by-step code edits to consolidate duplicate patterns or smells across multiple files.

### 🔍 File Inspector
- **Code Review Diff / General Metrics Sub-tabs** — Toggle between code review diff patches and general file metrics
- **Function List** — Auto-parses and lists all functions with scroll-to-line navigation
- **Cyclomatic Complexity Score** — Per-file complexity metric (Low / Medium / High) with colour coding
- **Who Calls This File** — Reverse dependency lookup showing all importers
- **Similar Files** — Recommends related files scored by folder, language, and shared imports
- **Circular Dependency Warnings** — Inline alerts when the selected file is part of a detected cycle
- **Code Preview** — Syntax-aware scrollable raw code block
- **AI Code Summary** — One-click Gemini AI explanation of any selected file
- **AI Test Suite Generator** — Generates a complete Jest/Vitest unit test suite for any file
- **Real Git Metadata HUD** — Dynamically queries the GitHub API to render the file's last modified timestamp, author, last commit message (with multiline wrap), and exact total commit count (parsed from HTTP pagination headers). Gracefully falls back to size-based simulated commit estimates for ZIP/sandbox workspaces.

### 🤖 AI Code Intelligence Suite
- **⚡ Real-Time Streaming AI Responses** — Renders response text token-by-token directly in the browser. Utilises Google Gemini's `generateContentStream` API to stream answers for the AI Chat Assistant, Folder Explanations, Refactoring suggestions, Folder Restructure Simulation, and API-Database Contract Drift analysis. Accompanied by a neon typing cursor indicator to signal active processing.
- **Semantic Code Search** — `semanticSearchCodebase` — AI-powered natural language query parser mapping user queries (e.g. "where we validate API keys") to the top matching files with relevance scores and match reasons.
- **AI Mermaid Diagram Generator** — `generateMermaidDiagram` — Automatically structures top-level folder subgraphs and file dependencies into a beautiful, visual Mermaid.js diagram.
- **AI Code Summary** — `getFileExplanation` — Explains a file's purpose, responsibilities, and architecture role in plain English.
- **AI Refactor** — `refactorCodeSmell` — Analyses a detected code smell and returns a clean, refactored implementation.
- **AI Test Suite Generator** — `generateTestSuite` — Generates a high-fidelity unit test suite covering all exports, edge cases, and mock states.
- **Developer Onboarding Guide** — `generateOnboardingGuide` — Creates a full project overview, reading order, and quickstart guide (exportable as Markdown).
- **Architecture Overview** — `generateArchitectureOverview` — Produces a layered architecture report identifying patterns, module categories, and refactoring recommendations.
- **AI Chat Assistant** — `askQuestionAboutCodebase` — A floating chat drawer that answers any developer question with full file-system context.
- **AI Architectural Linter** — `lintCodebaseRules` — Define custom architectural boundary rules in natural language (e.g. "components should never import from utils directly"). Gemini evaluates the dependency graph against the rule and returns violating nodes/links, which are highlighted with orange warning flashes on the D3 canvas.
- **Dependency Risk Auditor** — `runDependencyAudit` — Computes afferent coupling (fan-in), efferent coupling (fan-out), and instability index for every file. Identifies Single Points of Failure (SPOFs) and generates a letter-graded Coupling Health Report with actionable refactoring recommendations.
- **AI REST API Extractor** — `aiExtractEndpoints` — Scans codebase files for REST route registrations (Express, NestJS, Flask, FastAPI, Django, Spring) and generates a full interactive API documentation portal with endpoint specs, parameter forms, and response schemas.
- **AI Database Design Auditor** — `auditDatabaseSchema` — Audits SQL DDL, Prisma schemas, SQLAlchemy, or Mongoose models using Gemini to locate circular references, missing indices, normalization flaws, and integrity risks, with an offline static analyzer fallback.

### 📖 REST API Documentation Portal
- **Auto-Detection** — Statically parses route definitions across 6+ frameworks (Express, NestJS, Flask, FastAPI, Django, Spring Boot) with regex-based pattern matching, enhanced by Gemini AI for deep extraction
- **Interactive Endpoint Directory** — Searchable sidebar listing all detected endpoints grouped by source file, with colour-coded HTTP method badges (GET/POST/PUT/DELETE/PATCH)
- **Live Request Tester** — Built-in HTTP client with configurable server URL, dynamic path/query parameter forms, custom headers editor, and JSON body payload editor
- **cURL Generator** — Real-time cURL command compiler that updates as you modify parameters, with one-click copy
- **Response Console** — Terminal-style output panel showing status codes, response headers, and formatted JSON response bodies

### 📊 Reports & Analytics
- **Codebase Dashboard** — KPI cards showing total files, functions, lines of code, complexity score, and dead files
- **Code Smell Detector** — Scans for Long Files, Long Functions, Nested Imports, and Unused Exports with per-smell severity (`critical`, `major`, `minor`) and an ✨ AI Refactor action
- **Circular Dependency Cycles** — Lists all detected cycles with the full chain of files
- **Duplicate Function Detector** — Identifies functions with identical names across multiple files, flagging potential copy-paste code
- **Dead Code Finder** — Lists files with zero incoming imports (not entry points), indicating unused/orphaned modules
- **Highly Active Files (Churn)** — Ranks files by estimated commit frequency to identify hotspots
- **Onboarding Guide** — AI-generated Markdown exportable as `.md`, PDF (via browser print), or copied in Notion-compatible format
- **Architecture Overview** — AI-generated architectural analysis with module-level breakdown

### 📌 KPI Ribbon
- **Sticky Summary Bar** — A compact, always-visible ribbon below the graph tabs showing key metrics at a glance: total files, functions, lines of code, circular dependency count, and dead file count
- **Interactive Chips** — Each KPI chip is clickable, navigating to the relevant analytics section or file
- **Complexity Dropdown** — Expandable panel showing the top 5 most complex files ranked by line count

### 🎨 Theme System
Six built-in visual themes, switchable with an animated ripple effect:

| Theme ID | Name |
|---|---|
| `cyberpunk` | Cyber Neon (default) |
| `midnight-green` | Midnight Green / Emerald |
| `solar-amber` | Solar Amber / Yellow |
| `arctic-light` | Arctic Light / Clean Mode |
| `rose-gold` | Rose Gold / Bold Dark |
| `synthwave` | Synthwave / Retro |

### ⌨️ Global Command Palette (`Ctrl/Cmd + K`)
- **Instant Switcher** — Quickly jump between views (Dependency Graph, Clusters, Call Graph, Component Tree, DB Schema), REST API Docs, and full-screen Analytics Dashboard.
- **Fuzzy Search & Selector** — Interactive, fuzzy real-time search of workspace files with keyboard shortcuts.
- **Action Shortcuts** — Trigger dependency risk audits, database schema audits, cycle application themes (`Alt + T`), or toggle the AI Chat Assistant (`Alt + A`) instantly.
- **Full Keyboard Accessibility** — Move selection with arrow keys, activate commands with Enter, and dismiss with Escape.

### 🛠️ Live-Writable Monaco IDE Editor
- **Embedded Monaco Engine** — Houses a fully-featured Monaco Editor (powering VS Code) directly in the sidebar for code previewing and editing.
- **Precision Line Navigation** — Clicking any parsed function or code smell scrolls, highlights, and places the cursor on the exact line dynamically.
- **In-Browser Inline Code Editing** — Edit any selected file directly in the editor and click **Save** to commit changes to the workspace memory.
- **Dynamic Telemetry Recalculation** — Saving changes triggers the static analysis engine to instantly recalculate codebase metrics, import graphs, circular dependencies, and duplicate functions.

### 🕒 Recent Workspaces History
- **Persistent Tracking** — Automatically logs successful repository/workspace setups inside `localStorage.recent_repos_history`, storing the last 5 accessed workspaces.
- **One-Click Loading** — Instantly fetches and reloads prior GitHub repositories and Demo Sandboxes.
- **Glassmorphic History Cards** — Renders custom colored status badges (`GitHub`, `ZIP Archive`, `Demo Sandbox`), creation timestamps, and a "Clear History" button.
- **Synchronous Write-Thru** — Bypasses React batch scheduling to immediately commit history data to disk on load, preventing unmount race conditions.

### ⚡ AI Response Caching Layer
- **Centralized In-Memory Caches** — Employs a cache lookup map utilizing a custom polynomial rolling hash key to prevent redundant Gemini API calls.
- **Instant Stream Replay** — Instantly serves cached stream results chunk-by-chunk on cache hits to simulate typewriter responses with zero network delay.
- **Comprehensive API Coverage** — Wraps all 12 promise-based AI methods and 5 streaming generators with token-saving caching guards.

### ⚙️ Glassmorphic Settings Console
- **Automated API Key Verification** — Automatically detects and verifies the Google Gemini API key loaded from environment variables (`VITE_GEMINI_API_KEY`).
- **Telemetry & Status Monitor** — Renders the real-time cache diagnostic panel, token metrics, and API health status directly in the settings drawer.

### 🔗 Shareable URL & Deep-Linking State
- **URL-Based State Persistence** — Automatically syncs the active visualization state (`repo`, `view`, `node`, `search`, `trace`, `depth`, `theme`) with browser query parameters in real-time using `window.history.replaceState`.
- **Deep-Linking Workspace Loading** — Direct URL loading of public GitHub repositories (e.g. `?repo=owner/repo`) or the sandbox demo project (`?repo=demo`) with glassmorphic loading/error overlays.
- **Share Link Tool** — A single-click "Share View" header button copies the exact deep-linked visualization state directly to your clipboard.

### 🖼️ Graph Visualizations Export (SVG/PNG)
- **High-Fidelity Canvas Capture** — Capture the active D3 graph layout directly from the browser window.
- **Embedded Stylesheet Parser** — Extracts CSS custom properties, theme tokens, marker definitions, and component styling, rendering a perfect vector SVG or high-resolution PNG.
- **Integrated Canvas Controls** — Sleek export triggers built right next to the zoom and reset HUD in the canvas corner.

### ⚡ D3 Performance Optimizations (Large Codebases)
- **Synchronous Offline Simulation Warming** — Bypasses 60 FPS visual rendering cycles during initial chaotic layout settling on repositories with $>100$ files. Runs `100 - 180` force ticks synchronously in memory, instantly placing nodes in their stable coordinate configurations.
- **Dynamic Quadtree Friction Tuning** — Lowers collision strength to `0.45` on large graphs ($>300$ nodes) to prevent bouncing oscillations and speed up simulation convergence.

### 🎛️ Dynamic Graph Filter System
- **Real-Time Graph Pruning** — A floating control panel allows developers to filter files/tables on the viewport by programming language (e.g. JavaScript, Python, Rust, Go), complexity size thresholds, or sub-folder directories.
- **Physics Layout Re-Settling** — Applying filters automatically re-runs D3 simulations for the filtered subset, immediately settling layout coordinates without rendering frozen nodes.

### 🎨 3D WebGL-Style Graph Canvas
- **Native Canvas 3D Holomap** — Toggle the visualization from 2D SVG into a 3D perspective Canvas. Renders nodes as shiny 3D spheres with dynamic depth-sorting (Z-ordering) and links as light-faded pathways.
- **Bioluminescent Particle Streams** — Animates data packets traversing link pathways in real-time.
- **Interactive Orbit Controls** — Support for mouse-drag camera orbit rotation, mouse-wheel scroll zooming, and a slow-spin auto-rotation mode. Full synchronization with node hover and click-selection details.

### ⚡ AI Cache Savings & Token Telemetry Dashboard
- **Live Cache Diagnostics Panel** — A telemetry dashboard inside the Settings drawer displaying cache hit ratios, cumulative processed vs. saved tokens, and real-time developer financial cost/time savings metrics.

### 🎯 Visual API-to-Database Mapping & Drift Analysis
- **Unified Controller-to-Schema Connection** — Automatically detects and visually overlays REST API endpoint routes onto their corresponding database tables.
- **Orphan Database Table Isolation** — Instantly flags database schema tables that are isolated from routing controller logic.
- **Data Contract Drift Analysis** — Inspects route parameter structures against schema column definitions, alerting developers to schema drift or type casting discrepancies.

### ⚡ One-Click AI-Patch Applicator
- **Instant Code Refactoring** — A single-click patch trigger embedded inside the Code Smells reports and dashboards.
- **Automated Regex Extractor** — Asynchronously fetches recommendations from Gemini, extracts raw code segments from code blocks, and replaces file content seamlessly in memory.
- **Hot-Reloaded Telemetry Recalculation** — Applying a patch instantly updates the repository workspace state and re-triggers codebase health evaluations, clearing resolved code smells on the fly.

### ⌨️ Keyboard Shortcut Reference Panel
- **Global Key Bindings Indicator** — A dedicated helper panel displaying all command palette, navigation, and theme hotkeys.
- **Instant Hotkey Toggle** — Accessible anywhere in the application by pressing the `?` key or `Alt + H`.
- **Theme-Integrated Design** — Fits natively into all dark and light themes with glowing `<kbd>` styling.

### 🔊 Interactive Codebase Sonification (Audio Feedback)
- **Topological Audio Landscaping** — Leverages the browser's native Web Audio API to synthesize real-time ambient soundscapes mapped directly to codebase parameters as developers interact with the graph canvas.
- **Dynamic Wave Synthesizers** — Small, clean files produce soft, high-frequency, harmonious sine waves; large, complex, or high-risk files trigger rich, lower-frequency sawtooth or triangle oscillator tones.
- **Dissonant Cycle Alerts** — Code cycles (circular dependencies) trigger distinct dissonant musical intervals (e.g. tritones) to signal structural flaws auditorily.
- **Trace Path Arpeggios** — Simulating call traces plays a sequence of arpeggiated notes where execution speeds map directly to tempo, helping developers "hear" performance bottlenecks.
- **Settings Console Controls** — Includes master volume adjustment slider (0% to 100%), test chime trigger, and quick mute switches.

### 🛡️ Visual AppSec & Dependency CVE Vulnerability Map
- **Static Security Auditing** — Scans package manifest and configuration files (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`) for vulnerable third-party dependencies against a database of CVE security advisories.
- **2D/3D Canvas Alerts** — Vulnerable nodes pulsate with bright neon red highlights (`rgba(239, 68, 68, 0.4)`) and feature vector red shield badges on both 2D SVG and 3D Canvas visualizations.
- **Remediation Profile HUD** — Selecting a compromised package node in the Inspector sidebar loads its CVE severity, vulnerability descriptions, local import locations, and the exact console command needed to upgrade/patch the library.
- **Security KPI Chip** — Integrates a persistent "Vulnerabilities" chip in the sticky ribbon bar with an interactive dropdown displaying all detected advisories.

---

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | React 19 with TypeScript 6 |
| **Build Tool** | Vite 8 |
| **Visualization** | D3.js v7 (force-directed, tree layouts, zoom/pan) |
| **Diagramming** | Mermaid.js v11 (UML architecture diagrams, exportable as SVG/PNG) |
| **AI Provider** | Google Gemini AI (`gemini-3.5-flash`) via `@google/generative-ai` |
| **ZIP Parsing** | JSZip 3 |
| **Icons** | Lucide React |
| **Styling** | Vanilla CSS with CSS custom properties (no Tailwind) |
| **Linting** | ESLint with TypeScript-ESLint and React Hooks plugins |

---

## Project Structure

```
CodeGraph/
├── public/
│   └── favicon.png
├── src/
│   ├── assets/
│   │   └── logo.png                 # Neural Tree brand logo
│   ├── components/
│   │   ├── AiChatDrawer.tsx         # Sliding AI chat assistant drawer
│   │   ├── AiIcon.tsx               # Reusable animated AI sparkle icon component
│   │   ├── AnalyticsDashboard.tsx   # Detailed analysis metrics & AI reports dashboard
│   │   ├── ApiDocsPortal.tsx        # REST API documentation portal with live tester
│   │   ├── CommandPalette.tsx       # Global keyboard-driven shortcuts & search command palette
│   │   ├── EvolutionPlayer.tsx      # Git timeline replay slider & commit controls
│   │   ├── GraphCanvas.tsx          # D3.js multi-mode graph renderer
│   │   ├── Inspector.tsx            # File inspector sidebar with AI tools
│   │   ├── KpiRibbon.tsx            # Sticky canvas KPI summary ribbon
│   │   ├── Reports.tsx              # Bottom analytics panel & AI reports
│   │   └── RepoSelector.tsx         # Landing page — GitHub URL / ZIP uploader
│   ├── utils/
│   │   ├── aiHelper.ts              # All Gemini AI API helpers (1099 lines)
│   │   ├── codeAnalyzer.ts          # Static analysis engine (1161 lines)
│   │   ├── repoParser.ts            # GitHub API & ZIP file parser
│   │   └── schemaParser.ts          # Database schema parsing engine (Prisma, SQL DDL, Mongoose, SQLAlchemy)
│   ├── App.tsx                      # Root layout, routing, theme controller
│   ├── App.css                      # Layout overrides
│   ├── index.css                    # Global design system & theme tokens (2842 lines)
│   └── main.tsx                     # React DOM entry point
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── .env                             # Local environment variables (gitignored)
```

---

## Getting Started

### Prerequisites
- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Google Gemini API Key** (free tier available at [ai.google.dev](https://ai.google.dev/))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/NisargPatel03/CodeGraph.git
   cd CodeGraph
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** *(see [Configuration](#configuration))*
   ```bash
   cp .env.example .env
   # Edit .env and add your Gemini API key
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production
```bash
npm run build
npm run preview
```

---

## Configuration

Create a `.env` file in the project root (this file is gitignored and never committed):

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

> **Note:** Without a Gemini API key, all AI features will gracefully fall back to offline/demo mode — the visualization, graph, and static analysis engine remain fully functional.

| Variable | Required | Description |
|---|---|---|
| `VITE_GEMINI_API_KEY` | Optional | Google Gemini AI API key for enabling all AI-powered features |

### Optional: Private GitHub Repositories
When loading a GitHub repository, CodeGraph accepts an optional **GitHub Personal Access Token (PAT)** in the landing page form to access private repositories and increase API rate limits. This token is **not persisted** beyond the session.

---

## Feature Deep Dives

<a id="graph-visualization-engine"></a>
### 1. Graph Visualization Engine

**File:** `src/components/GraphCanvas.tsx`

The graph engine is built on **D3.js v7** and renders four distinct view modes on an SVG canvas with full zoom, pan, and reset controls.

#### Dependency Graph
- **Force-Directed Simulation** with collision detection, link distance, and charge forces
- **Edge thickness** scales with import weight (number of symbols imported)
- **Folder Collapse** — Any folder can be collapsed to a single super-node in the graph directly from the file tree, keeping large monorepos manageable
- **Depth Filter** — Slider to limit graph rendering to N levels of dependency depth from the selected node
- **Heatmap Modes** — Overlay file nodes with colour coding based on **complexity score** or **churn score** to immediately spot hot spots
- **Shortest Path Finder** — Select a source and target node to highlight the exact import chain between them
- **Live Minimap** — A Canvas-rendered minimap in the corner for large graph navigation

#### Module Clusters
- Groups file nodes into **bubble clusters** by their parent folder
- Hovering a cluster shows a tooltip with file count and inter-cluster connection count

#### Call Graph
- Parses function calls between files and renders function-to-function edges
- **Step Tracer** — Animates through the call chain from any selected function, stepping 3 levels deep
- **Interactive Execution Flow Simulator** — Selecting a function node and clicking **⚡ Simulate Execution Flow** starts a real-time D3-driven animation loop showing synchronous and asynchronous execution paths with glowing bioluminescent pulses travelling along the dependency paths.

#### Component Tree
- Parses React component hierarchies using JSX pattern detection
- Renders as a **top-down** or **radial** D3 tree layout

#### DB Schema (ER Visualizer)
- **Multi-Format Schema Extraction** — Statically parses database definitions across four formats:
  - **Prisma Schema (`.prisma`)**: Extracts models, attributes, types, primary keys (`@id`), and relation constraints (`@relation`).
  - **SQL DDL (`.sql`)**: Extracts `CREATE TABLE` structures, column definitions, data types, `PRIMARY KEY` markers, and `FOREIGN KEY REFERENCES`.
  - **Mongoose Schemas (`.js`/`.ts`)**: Parsed using a recursive brace-counting scanner and top-level field parser to handle nested configuration objects (e.g. `{ type: String, required: true }`) without terminating early. Extracts model names, attributes, types, and schema references.
  - **SQLAlchemy Models (`.py`)**: Detects Python class models, SQLAlchemy columns, primary keys, foreign keys, and relationship links.
- **Glassmorphic Entity Cards** — Renders rich, interactive card nodes in the D3 canvas using SVG `<foreignObject>`, displaying table name, fields, data types, and primary key (`🔑`)/foreign key (`🔗`) badges.
- **Relational Connections** — Computes bounding box intersections to draw clean, curved connection lines between referencing fields and target tables, terminating with custom arrowheads.
- **Custom D3 force simulation** — Engineered a force-directed network using custom `d3.forceSimulation` parameters to keep cards perfectly separated:
  - **Link Distance**: set to `240` to maintain generous space for table details.
  - **Charge Strength**: set to `-600` to prevent dense grouping.
  - **Collision Radius**: calculated dynamically based on card bounding boxes (`Math.max(width, height) / 2 + 40`).
- **Interactive Hover & Click HUD** — Hovering fades unrelated tables to `35%` opacity, keeping focus on the selected table and its immediate relational paths. Clicking a table card displays a dedicated floating HUD on the right side of the canvas listing fields, primary/foreign constraints, outgoing foreign keys, and incoming references.
- **Double Click to Focus** — Resets viewport zoom and centers on the targeted table card.
- **File Inspector Sync** — Click a database table card to highlight the source file and view the raw schema code side-by-side.
- **Interactive Sandbox Onboarding** — Automatically loads a multi-table e-commerce mock schema (User, Order, OrderItem, Product, Category) if no database files are present, allowing immediate visual exploration.

#### 📤 Graph Export Controls (SVG/PNG)
- **Automatic Style Sheet Scanning** — CodeGraph scans document style sheets on export to capture and inline all vector colors, line widths, and font properties.
- **Transparent and Theme Background support** — Exports with solid or transparent configurations corresponding to the user's active theme.
- **Vector SVG Export** — Generates lightweight, scalable vectors (`.svg`) ideal for insertion into technical manuals, architectures documents, or READMEs.
- **High-Resolution PNG Export** — Rasterizes the SVG elements to an off-screen HTML5 Canvas and triggers a direct image download (`.png`).

#### ⚡ High-Performance D3 Optimization Suite
To support codebases exceeding 500+ files without lagging or crashing the browser tab, CodeGraph implements three distinct optimization layers:
1. **Synchronous Simulation Warming (Offline Ticking)**: When entering a large codebase ($>100$ nodes), the renderer disables D3 visual frame ticks, runs `100 - 180` layout computations entirely in memory, and settles the nodes instantly. This avoids up to 5 seconds of intensive DOM reflows and repaints.
2. **Dynamic Quadtree Collision Force tuning**: Sets collision strength to `0.45` on large graphs ($>300$ nodes) to prevent nodes from bouncing around indefinitely, speeding up layout stabilization.
3. **Responsive Minimap**: Employs an optimized HTML5 Canvas-based mini-viewport tracker instead of heavy SVG replicas, keeping panning smooth.

---

<a id="file-inspector"></a>
### 2. File Inspector & PR Diff Inspector

**File:** `src/components/Inspector.tsx`

A right-sidebar panel that activates when a file node or folder node is selected in the graph or file tree.

#### Writable Workspace & Inline Monaco Editor
- **Monaco Editor Integration** — High-fidelity Monaco Editor instance handles syntax highlighting, code folding, scrollbar maps, and VS Code keyboard shortcuts.
- **Precision Scrolling** — Clicking any function in the accordion list immediately centers the editor onto the declaration line and positions the cursor.
- **In-Browser Inline Code Editing** — Switch from read-only mode to full editor mode. Edit file content directly in the browser and click **Save** to update.
- **Live Graph Updates** — Saving code updates the repository state in the parent workspace, which automatically re-runs the static analysis pipeline, updating dependency edges, function listings, and quality metrics instantly.

#### Branch / PR Diff Mode
When a branch comparison is active and a modified node is selected, the inspector enters **PR Diff Mode**, showing:
- **Status Badges** — Indicating `[+] Added` (emerald), `[~] Modified` (orange), or `[-] Deleted` (rose) with additions/deletions counts.
- **Git Patch Viewer** — A line-by-line syntax-highlighted git diff patch (green for `+`, red for `-`, blue/indigo for hunk markers).
- **Sub-Tab Navigation** — Toggle buttons to switch between **Code Review Diff** and **General Metrics**.
- **Virtual Node Support** — Handles deleted file placeholder nodes, rendering the deletion patch without crashing.

#### Multi-File Refactoring Suggestions (Multi-Select)
- **Checkboxed Selection** — Toggle the `☑️ Multi-File Refactor` option in the sidebar to display checkboxes next to all items in the file tree.
- **Cross-File Code Analysis** — Selecting two or more files displays a floating trigger at the bottom of the files panel: `✨ Refactor Selected Files`.
- **Intelligent Architectural Decoupling** — Queries the Gemini AI engine to perform cross-file structural comparisons. Streams a detailed refactoring recommendation outlining common patterns, code consolidation, API layout adjustments, and file structure changes.

#### Info Tab Sections (Metrics View)
| Section | Description |
|---|---|
| **File Metadata** | Path, size, language, complexity score, estimated commit count |
| **Quick Actions** | Copy path, Open in VS Code (via `vscode://file/` URI scheme) |
| **Circular Dependency Alert** | Red banner if the file participates in any detected cycle |
| **Functions** | Parsed function list (name + line number), clickable to scroll/focus code editor |
| **Who Calls This File** | Reverse dependency list — which files import this one |
| **Similar Files** | Top 3 files scored by language, folder proximity, and shared imports |
| **Imports** | List of all resolved import paths from this file |
| **AI Code Summary** | Gemini-powered plain-English explanation of the file |
| **AI Test Suite** | Gemini-generated complete Jest/Vitest unit test file |
| **Code Preview & Editor** | High-fidelity Monaco Editor panel with inline edit and save triggers |

---

<a id="ai-code-intelligence-suite"></a>
### 3. AI Code Intelligence Suite

**File:** `src/utils/aiHelper.ts`

All AI calls use `gemini-3.5-flash` via the official `@google/generative-ai` SDK. Every function gracefully falls back to a demo response if no API key is configured.

#### `getFileExplanation(filePath, fileContent, apiKey)`
Prompts Gemini as a *Senior Principal Engineer* to explain the file's purpose, responsibilities, architecture role, and primary exports in well-formatted Markdown.

#### `generateTestSuite(filePath, fileContent, apiKey)`
Prompts Gemini as a *Senior QA Automation Engineer* to generate a complete unit test suite using **Jest**, **Vitest**, or **Testing Library** — covering all exported functions, mock states, and edge cases. Up to 15,000 characters of file content are submitted.

#### `refactorCodeSmell(filePath, fileContent, smellMessage, smellDetails, apiKey)`
Prompts Gemini as a *Software Architect* to analyse a specific code smell, explain why it's a problem, and return a clean refactored implementation. In the Code Smells report, developers can click **Apply Refactor** to instantly inject the AI-generated code block back into the active workspace.

#### `generateOnboardingGuide(filesSummary, apiKey)`
Prompts Gemini as a *Technical Lead* to write a step-by-step developer onboarding guide — project purpose, entry points, reading order, and key commands — based on the repository file list.

#### `generateArchitectureOverview(filesSummary, apiKey)`
Prompts Gemini as a *Software Architect* to produce an architecture analysis identifying the design pattern, module categories, strengths, and refactoring recommendations.

#### `askQuestionAboutCodebase(question, currentFile, allFiles, apiKey)`
Full-context codebase Q&A. Sends the entire file list (up to 80 files) and the currently-selected file's content as context alongside the developer's question.

#### `semanticSearchCodebase(query, filesSummary, apiKey)`
AI-powered semantic search. Rather than standard keyword filtering, users can type descriptive queries (e.g. "where is the zoom and pan handled"). Gemini analyzes the project layout, mapping the prompt semantically to matching files. Returns top 5 files with custom % relevance scores and rationale statements.

#### `generateMermaidDiagram(filesSummary, links, apiKey)`
Automatically generates a customized **Mermaid.js** graph diagram showing folder organization/boundaries (as subgraphs) and key dependency connections, representing a live topological architecture map of your project.

#### `lintCodebaseRules(rule, files, links, apiKey)`
Accepts a natural-language architectural constraint (e.g. *"components should never import from utils"*). Gemini evaluates the full dependency graph against the rule and returns a `LinterViolation` object containing `violatingNodes`, `violatingLinks`, and a Markdown `explanation`. Violations are rendered as orange warning flashes on the D3 canvas. Includes a smart offline fallback that parses folder keywords from the rule to simulate boundary checks.

#### `runDependencyAudit(files, links, apiKey)`
Computes **Afferent Coupling** (Ca / fan-in), **Efferent Coupling** (Ce / fan-out), and **Instability Index** (Ce / (Ca + Ce)) for every file. Files with a risk score ≥ 6.0 are flagged. Gemini produces a letter-graded (A–F) Coupling Health Report identifying SPOFs and recommending Dependency Inversion, event-driven decoupling, or module splitting. Falls back to a fully static audit with the same metrics when offline.

#### `aiExtractEndpoints(files, apiKey)` / `extractEndpointsFromCodebase(files)`
Two-tier REST API route extractor. The static parser (`extractEndpointsFromCodebase`) uses regex patterns to detect route registrations across **Express/Node.js**, **NestJS**, **Flask**, **FastAPI**, **Django**, and **Spring Boot**. The AI-enhanced version (`aiExtractEndpoints`) sends routing file contents to Gemini for deep extraction with full parameter schemas, response specs, and an architectural summary. Returns an `ApiDocsReport` with typed `ApiEndpoint[]` objects.

#### `auditDatabaseSchema(schema, apiKey)`
AI-powered database design auditor. Formats parsed database schema tables (columns, datatypes, indexes, relationships) into JSON.
- **Gemini Mode**: Prompts Gemini as a *Principal Database Architect* to scan for database schema violations (circular dependencies, 1NF/2NF/3NF design issues, missing indexes on foreign keys, redundant mappings). Outputs actionable recommendations with warning/tip boxes.
- **Offline Fallback**: Evaluates schema structure locally, locating tables missing primary keys, orphaned tables with no links, and index targets on foreign key relations. Computes a localized **Database Health Score** out of 100.

#### Real-Time Streaming Helpers (`generateContentStream`)
For interactive components, CodeGraph uses asynchronous streaming generators to render text token-by-token instead of waiting for a single block completion:
- **`askQuestionAboutCodebaseStream(question, currentFile, allFiles, apiKey, onChunk)`** — Streams responses in the floating Chat Drawer with codebase file context.
- **`explainEntireFolderStream(folderPath, files, apiKey, onChunk)`** — Streams folder explanation summaries inside the glassmorphic directory modals.
- **`suggestCrossFileRefactorStream(refactorDetails, apiKey, onChunk)`** — Streams refactoring solutions during code smell refactor modal sessions.
- **`suggestFolderRestructureStream(filesSummary, apiKey, onChunk)`** — Streams layout proposals and grouping guidelines under the Restructure tab.
- **`validateApiDbContractsStream(endpoints, tables, apiKey, onChunk)`** — Streams data validation rules and contract drift alerts in the API-Database contract tab.

---

<a id="reports-analytics-dashboard"></a>
### 4. Reports & Analytics Dashboard

**Files:** `src/components/Reports.tsx` (Bottom Drawer) and `src/components/AnalyticsDashboard.tsx` (Full-screen view)

CodeGraph provides two distinct analytical panels: a quick-access bottom **Reports Drawer** and a comprehensive, full-screen **Analytics Dashboard**.

#### 📂 Collapsible Reports Drawer (`Reports.tsx`)
A bottom panel for quick codebase telemetry checks:
- **Dashboard Tab** — Live metrics (Total Files/Functions, LoC, complexity, dead files), module line complexity distribution, and dead code detection.
- **Code Smell Detector Tab** — Scans modules statically for length or dependency issues with an **✨ AI Refactor** action.
- **Circular Dependency Cycles Tab** — Displays import loops (`File A → File B → File A`) to resolve tightly coupled code.
- **Onboarding Guide Tab** — Triggers Gemini to write a readme/reading order guide (Download MD / Copy Notion / PDF Print).
- **Architecture Visualizer & Overview Tab** — Generates and visualizes dynamic folder-subgraphed Mermaid.js topological diagrams.

#### 📊 Full-Screen Analytics Dashboard (`AnalyticsDashboard.tsx`)
A premium, multi-tab intelligence command center featuring:
- **Tab 1: Codebase Health Metrics** — Complete KPI dashboard featuring:
  - **Churn vs. Complexity "Risk Quadrant" Chart**: A 2D scatter plot mapping code modifications against file complexity. It categorizes files into four color-coded quadrants: `🚨 Refactor Candidate` (Red), `⚡ Active / Changing` (Purple), `⚙️ Stable / Complex` (Orange), and `Healthy / Low Risk` (Gray). Includes interactive tooltips and click-to-focus inspector sidebar sync.
  - **Module Complexity Heatmaps**: Visualizes file sizes and functions count distribution.
  - **Metrics Leaders**: Displays top imported files and code smell distributions.
- **Tab 2: UML & Architecture** — Side-by-side workspace displaying a rendered, dynamic **UML Graph TD** diagram (built using Mermaid.js) and an AI-authored Architectural Guide.
  - **UML Export Controls**: Direct client-side download buttons to export the rendered Mermaid diagram as a Scalable Vector Graphics file (`Export SVG`) or a high-DPI raster image (`Export PNG`).
- **Tab 3: Onboarding Exporter** — Developer onboarding wizard allowing direct Markdown download, Notion clipboard copy, and print-optimized PDF generation.
- **Tab 4: Restructuring & Contracts** (AI Simulator Suite):
  - **Folder Restructure Simulator**: Evaluates coupling limits and generates a clean folder/file structural blueprint. Includes a **📄 PDF Export** button that renders a printable light-mode document.
  - **API-Database Contract Auditor**: Statically scans express/next routing endpoints and database schemas (Prisma, SQL, SQLAlchemy, Mongoose). Uses Gemini to check model attribute drift or invalid type casts. Includes a **📄 PDF Export** button that outputs a print-friendly audit report.

---

<a id="api-documentation-portal"></a>
### 5. API Documentation Portal

**File:** `src/components/ApiDocsPortal.tsx`

A full-featured, interactive REST API documentation explorer accessible from the **📖 API Docs** tab in the workspace.

#### Endpoint Detection
- **Multi-Framework Static Parser** — Regex-based detection for Express (`router.get`), NestJS (`@Get()`), Flask (`@app.route`), FastAPI (`@router.get`), Django (`path()`), and Spring Boot (`@GetMapping`) route patterns
- **AI-Enhanced Extraction** — When a Gemini API key is configured, routing files are sent to Gemini for deep extraction of parameter schemas, response specifications, and controller mappings

#### Interactive Workspace
| Panel | Description |
|---|---|
| **Endpoint Directory** | Searchable left sidebar grouping endpoints by source file with colour-coded method badges |
| **Documentation Pane** | Endpoint heading, description, file/line reference, handler name, and response schema specs |
| **Parameter Forms** | Dynamic input fields for path, query, header, and JSON body parameters |
| **Server URL Config** | Configurable base URL (default `http://localhost:3000`) for live testing |
| **cURL Generator** | Real-time cURL command that updates as you modify parameters, with copy button |
| **Interactive Console** | Send Request button, response status display, and formatted JSON response body output |

---

<a id="kpi-ribbon"></a>
### 6. KPI Ribbon

**File:** `src/components/KpiRibbon.tsx`

A compact, sticky summary bar rendered directly below the graph tabs (visible in all graph view modes, hidden in Analytics and API Docs views).

- **Metric Chips** — Displays Total Files, Total Functions, Lines of Code, Circular Dependencies, and Dead Files as clickable chips
- **Complexity Dropdown** — An expandable section showing the top 5 most complex files ranked by line count, with clickable entries that select the file in the graph
- **Open Analytics** — Quick-access button to switch to the full Analytics Dashboard view

---

<a id="theme-system"></a>
### 7. Theme System

Themes are controlled by a `data-theme` attribute on `<html>` and a set of CSS custom properties:

```css
/* Example — Cyberpunk theme */
[data-theme="cyberpunk"] {
  --color-primary: #8b5cf6;
  --color-secondary: #06b6d4;
  --color-accent: #0ea5e9;
  --bg-primary: #0a0a0f;
  --text-primary: #e2e8f0;
  /* ... */
}
```

Theme selection persists in `localStorage`. Switching themes triggers a CSS-animated colour ripple from the click position.

---

<a id="static-analysis-engine"></a>
### 8. Static Analysis Engine

**File:** `src/utils/codeAnalyzer.ts`

A fully client-side, zero-dependency static analysis engine that parses source files and produces a complete `CodebaseGraph` object.

#### Multi-Language Import Resolution
| Language | Pattern Detection |
|---|---|
| **JavaScript / TypeScript** | ES6 `import/export`, dynamic `import()`, CommonJS `require()`, `@/` alias resolution |
| **Python** | `import module`, `from module import name` |
| **Rust** | `use crate::module`, `mod module` |
| **C / C++** | `#include "header.h"` |
| **Go** | `func` declarations and file-level parsing |

#### Analysis Pipeline
1. **Dependency Graph Construction** — Resolves all imports with extension inference (`.ts`, `.tsx`, `.js`, `.jsx`, `/index.*`) and builds weighted edges based on symbol count
2. **Circular Dependency Detection** — DFS-based cycle finder with deduplication via sorted path hashing
3. **Call Graph Extraction** — Parses function declarations and scans for cross-file invocations to build function-to-function edges
4. **React Component Hierarchy** — Detects functional components (PascalCase functions in `.tsx`/`.jsx`) and JSX parent-child relationships (`<ComponentName />`), extracting props, state variables, and hooks
5. **Code Smell Detection** — Flags file length (>500 lines), function length (>50 lines), deeply nested imports (4+ levels), unused exports, circular dependency participation, and dead code files
6. **Duplicate Function Analysis** — Identifies function names that appear in multiple files across the codebase
7. **Dead Code Detection** — Files with zero incoming imports (excluding entry points like `main.tsx`, `App.tsx`, `index.html`, `*.config.*`)
8. **NPM Dependency Mapping** — Tracks external package imports and builds separate npm dependency nodes

#### Git History Simulation
- `generateGitHistory()` — Creates a simulated 10-step commit timeline by categorizing files into logical development stages (config → utils → models → components → main)
- `mapFilesToRealCommits()` — Maps real GitHub API commit data to files using commit message keyword matching and proportional distribution

---

<a id="markdown-latex-formatting-pipeline"></a>
### 9. Markdown & LaTeX Formatting Pipeline

To guarantee visual elegance and technical correctness for all AI-generated contents (including the Chat Drawer, Inspector explanation, and Analytics reports), CodeGraph runs a multi-stage parser utility:

- **Math-Mode LaTeX Sanitizer** — Strips LLM-introduced mathematical dollar signs and automatically converts LaTeX notation (e.g. `\to` $\to$ `→`, `\implies` $\to$ `⇒`, `\dots` $\to$ `...`, etc.) into clean, standard Unicode symbols.
- **Glassmorphic Table Generator** — A custom parser that reads markdown pipe tables and outputs high-contrast, responsive CSS tables with hover highlights, clear headers, and scroll wrappers.
- **Pre-formatted Code Isolation** — Identifies, separates, and placeholders code blocks during markdown sanitization to ensure syntax highlighting and copy-to-clipboard buttons operate reliably without collision.

---

<a id="command-palette-keyboard-controls"></a>
### 10. Global Command Palette & Keyboard Controls

**File:** `src/components/CommandPalette.tsx`

Accessible via `Ctrl + K` or `Cmd + K`, the command palette offers keyboard-first navigation and file discovery for power developers:

- **Unified Navigation Commands** — Switch view tabs or toggle dashboard panels with keyboard commands.
- **Fuzzy File Search** — Type any part of a file path (e.g. `App.tsx` or `aiHelper`) to instantly search and highlight the file node on the D3 canvas.
- **Action Shortcuts** — Trigger audits (e.g. DB Schema Audit, Instability coupling audit) or cycle themes instantly using global shortcuts (e.g. `Alt + T` to cycle themes, `Alt + A` to toggle AI chat).
- **Keyboard-Accessible HUD** — Full list navigation support via Arrow keys, Enter to select, and Escape to dismiss.

---

<a id="shareable-urls-deep-linking-state"></a>
### 11. Shareable URLs & Deep-Linking State

CodeGraph supports full serialization of the application's visual configurations directly into the browser URL query string. This enables sharing a specific codebase analysis state with other team members.

- **Real-Time State Serialization**: Whenever you change view modes, select a node, type a search query, run a function trace, or toggle themes, the changes are written immediately to the browser's address bar (`window.history.replaceState`) without forcing a page reload.
- **Bi-directional State Sync**:
  - **`repo`**: Loads the target GitHub repository (e.g., `?repo=NisargPatel03/CodeGraph`) or triggers the sample mock sandbox setup (`?repo=demo`).
  - **`view`**: Restores the active visualization pane (e.g., `dependency`, `cluster`, `call`, `dbSchema`, `apiDocs`, `analytics`).
  - **`node`, `search`, `trace`, `depth`, `theme`**: Restores the selected file path, search text, function trace ID, depth layout level, and interface color theme automatically on load.
- **Glassmorphic Loading States**: Includes dedicated initialization screens that fetch resources via the GitHub REST API or load the local ZIP parser dynamically, rendering smooth loading transitions and error modals for broken parameters.

---

<a id="recent-workspaces-history"></a>
### 12. Recent Workspaces History

**File:** `src/components/RepoSelector.tsx`

To make returning to previous codebases fast and seamless, CodeGraph features a persistent workspace history tracker:
- **Automatic Logging:** Successfully opening any codebase (via GitHub URL, ZIP dropzone, or sandbox button) logs it in `recent_repos_history` in `localStorage`.
- **Intelligent Reload Logic:**
  - **GitHub URL / Sandbox:** Instantly fires the API request or sets up mock models in a single click.
  - **Local ZIP Archives:** Indicates that local files must be uploaded again (due to browser sandbox security policies) and presets input areas.
- **Deduplication & Truncation:** Maintains exactly the 5 most recently loaded workspaces, sorting them chronologically and clearing older duplicates.

---

<a id="ai-response-caching-layer"></a>
### 13. AI Response Caching Layer

**File:** `src/utils/aiHelper.ts`

To minimize API usage cost, prevent rate-limiting, and boost responsiveness, CodeGraph implements a high-performance in-memory caching system:
- **Hash-Key Generation:** Utilizes a polynomial rolling hash function that produces distinct cache keys based on query context, file path, and active text content.
- **Unified Cache Wrapping:** All 12 promise-based AI methods (e.g. `getFileExplanation`, `generateTestSuite`, `runDependencyAudit`, etc.) and all 5 async generator streaming methods are wrapped in cache-first logic.
- **Streaming Caching:** When a streaming generator executes, the cache intercepts and collects the output chunks. On cache hits, the cached stream is instantaneously re-emitted chunk-by-chunk to maintain typing animations without hitting the network.

---

<a id="real-github-file-metadata-hud"></a>
### 14. Real GitHub File Metadata HUD

**File:** `src/components/Inspector.tsx`

When a GitHub repository is loaded, CodeGraph replaces simulated metadata calculations with real, on-demand telemetry directly from the GitHub REST API:
- **On-Demand Background Fetching:** When a node or file tree element is selected, the inspector fires a request using the user's optional Personal Access Token (PAT) to ensure high rate limits.
- **Metadata Extraction:** Extracts the real author name, last modified date/time (formatted locally), and the last commit message.
- **Exact Commit Counts:** Synchronously parses the `Link` headers of the commits API to discover the exact number of times the selected file has been changed in the repository's history.
- **Fluid Layout Wrapper:** The commit message container utilizes standard CSS wrapping guidelines (`pre-wrap`/`break-word`) to prevent long descriptions from truncating.

---

<a id="dynamic-filter-system"></a>
### 15. Dynamic Filter System

**File:** `src/components/GraphCanvas.tsx`

The Dynamic Graph Filtering panel floats on the main viewport, providing real-time, interactive graph querying:
- **Language Filtering:** Show/hide files based on their programming language extension (JavaScript, TypeScript, Python, Rust, Go, SQL, HTML, CSS).
- **Complexity Size Thresholding:** A slider filter to hide small boilerplate files and focus only on complex source modules (complexity LOC metrics).
- **Directory Path Scoping:** A folder query text filter that matches folder names (e.g. `/src/components` or `/utils`) to isolate specific subgraphs.
- **Simulation Re-warm Integration:** Filter states are fully wired into D3's reactivity loops. Filtering immediately triggers D3 force layout adjustments, computing positions only for the active, visible subset of files or database tables.

---

<a id="3d-webgl-style-graph-canvas"></a>
### 16. 3D WebGL-Style Graph Canvas

**File:** `src/components/GraphCanvas.tsx`

A high-fidelity 3D visualization option built using lightweight, native HTML5 Canvas drawing loops rather than heavy Three.js dependencies:
- **Perspective Projection Engine:** Implements 3D rotation matrices and perspective division mapping (`fov` ratio calculations) to translate three-dimensional coordinates `(x, y, z)` onto a flat 2D viewport.
- **Z-Order Depth Sorting:** Sorts nodes and connection lines by Z-depth dynamically before drawing each frame, guaranteeing correct visual occlusion.
- **Interactive Orbit Camera Controls:** Users can drag the canvas to rotate the graph on the X and Y axes, scroll the mouse wheel to scale zoom, and click nodes to open sidebar metrics.
- **Auto-Rotation (Spin Mode):** Toggles a slow, orbital Y-axis rotation that showcases the network structure as a holographic visualizer.
- **Glowing Sphere Shading:** Uses radial gradient fills to paint glowing sphere materials for nodes, with depth-faded line links.
- **Real-time Flow Particles:** Animates bioluminescent packets of light that flow along connection pathways, indicating codebase execution routing.

---

<a id="ai-caching-token-telemetry-dashboard"></a>
### 17. AI Caching & Token Telemetry Dashboard

**Files:** `src/components/RepoSelector.tsx` and `src/utils/aiHelper.ts`

An analytical instrumentation dashboard embedded inside the Settings slide-out panel that displays real-time telemetry from the Gemini caching layer:
- **Cache Hit Rate:** Visualizes the effectiveness of the caching layer as a percentage of queries served locally.
- **Token Counters:** Displays cumulative tokens processed by Gemini versus total tokens saved (retrieved from cache hits). Token estimates are calculated using standard character-to-token multipliers.
- **Financial Savings Estimate:** Translates saved tokens into US dollar estimates based on standard Gemini 3.5 API pricing models ($0.15 per million input tokens).
- **Engineering Hours Saved:** Translates cache hits into time saved, based on a developer onboarding velocity estimate (approx. 2 minutes of comprehension time saved per AI request cache hit).

---

<a id="churn-vs-complexity-risk-quadrant-chart"></a>
### 18. Churn vs. Complexity Risk Quadrant Chart

**File:** `src/components/AnalyticsDashboard.tsx`

The Churn vs. Complexity Scatter Plot is an interactive SVG-rendered graph layout designed to automatically highlight refactoring hot spots and technical debt in the active workspace:
- **Axis Metrics:** The X-axis maps file line counts (complexity metric scaled using a square root scale to prevent layout outliers), and the Y-axis maps git changesets (file churn metric).
- **Interactive Scatter Points:** Each file node in the graph is plotted as a circular point. Points are colored based on risk level: Red for candidate targets, Purple for active files, Orange for stable-complex components, and Gray for low-risk elements.
- **Dynamic Watermark Dividers:** Computes average churn and average complexity dynamically across all files to draw division threshold lines, splitting the canvas into four risk segments:
  1. **🚨 Refactor Candidate (Top-Right):** Highly complex files that are frequently modified. These represent priority targets for architectural decoupling or component splitting.
  2. **⚡ Active / Changing (Top-Left):** Low complexity files that change frequently (e.g. entry configurations or route indexes).
  3. **⚙️ Stable / Complex (Bottom-Right):** Large helper libraries or core calculation engines that have high LOC but rarely require modifications.
  4. **Healthy / Low Risk (Bottom-Left):** Standard, simple utility files that represent healthy codebase architecture.
- **Node Highlighting and Navigation:** Hovering any scatter node reveals a floating tooltip showing the exact file path, LOC complexity count, commit churn level, and calculated risk score product ($LOC \times Churn$). Clicking a node automatically pans the D3 canvas and selects the file in the workspace.

---

<a id="mermaidjs-uml-diagram-exporter"></a>
### 19. Mermaid.js UML Diagram Exporter

**Files:** `src/components/AnalyticsDashboard.tsx` and `src/components/Reports.tsx`

An integrated technical exporter that allows exporting the Gemini-generated Mermaid.js class/folder diagrams:
- **Export SVG:** Grabs the DOM elements of the rendered Mermaid chart, attaches explicit SVG namespaces, injects dark-mode styling properties (`#0a0a0f` background color, rounded borders, and padding), compiles a standardized XML string, and downloads it directly as a `.svg` vector file.
- **Export PNG:** Instantiates an off-screen HTML5 Canvas. Loads the SVG data URL onto the canvas using a scaling factor of `2.0` (delivering high-DPI retina rendering resolution), draws a dark solid background, and compiles it into a high-quality `.png` download file.
- **Regenerate Operations:** Includes a quick action trigger that queries the Gemini model to reconstruct and redraw the Mermaid UML code.

---

<a id="visual-api-to-database-mapping-drift-analysis"></a>
### 20. Visual API-to-Database Mapping & Drift Analysis

**Files:** `src/components/Inspector.tsx`, `src/components/GraphCanvas.tsx`

- **Visual Connection Overlays**: Shows bidirectional mappings linking REST API controller definitions to corresponding database tables directly on the D3 network visualization graph.
- **Orphan Database Analysis**: Identifies and flags tables that are completely isolated from routing controller endpoints, helping developers prune dead database schema assets.
- **Field-Level Schema Inspector**: Selecting any database table node in the graph displays relational fields, data types, and primary key (`🔑`)/foreign key (`🔗`) attributes.
- **Contract Drift Warnings**: Analyzes route parameters against database column types, exposing potential data drift or type casting vulnerabilities.

---

<a id="one-click-ai-patch-applicator"></a>
### 21. One-Click AI-Patch Applicator

**Files:** `src/components/AnalyticsDashboard.tsx`, `src/components/Reports.tsx`, `src/utils/aiHelper.ts`

- **Inline Trigger Buttons**: Standardized "Auto-Apply" buttons placed inside code smell lists, dashboards, and modal inspectors.
- **Background Patch Execution**: Bypasses manual copy-paste sequences by using an async pipeline that parses Gemini markdown response segments for code blocks.
- **Seamless Local Memory Commits**: Invokes `onUpdateFileContent` synchronously to write updates directly to workspace memory.
- **Automatic Health Re-evaluation**: Saving the patch instantly invokes `analyzeCodebase`, reloading import paths, complexity metrics, cycle indicators, and smell status dynamically.

---

<a id="keyboard-shortcut-reference-panel"></a>
### 22. Keyboard Shortcut Reference Panel

**Files:** `src/components/KeyboardShortcutsHelp.tsx`, `src/components/CommandPalette.tsx`, `src/App.tsx`

An interactive helper overlay listing all global shortcuts:
- **Hotkeys Directory**: Maps and categorizes commands into Global Navigation, Graph Views, and AI/Settings shortcuts.
- **Double-Activation Triggers**: Toggles with either the standard `?` key or `Alt + H` global hotkey.
- **Fuzzy Search Integration**: Registered within the Command Palette, enabling keyboard-only users to open the reference modal via query commands.
- **Theme Reactivity**: Styled with adaptive borders, dynamic box-shadows, and glassmorphic panels matching Cyberpunk, Arctic Light, Solar Amber, and all other visual themes.

---

<a id="babel-ast-based-static-analysis"></a>
### 23. Babel AST-Based Static Analysis

**File:** `src/utils/codeAnalyzer.ts`

To ensure precision and eliminate false positives (such as matching calls/imports inside strings or comments), CodeGraph processes JavaScript and TypeScript codebases using a fully in-browser Babel AST parser:
- **Babel Parsing Pipeline**: Utilizes `@babel/parser` with full support for JSX, TypeScript, and modern ECMA stages.
- **Import/Export Resolution**: Walks the Abstract Syntax Tree (AST) to resolve precise module dependency links, identifiers, alias mappings, and dynamic imports.
- **Function/Class Extraction**: Identifies exact function declarations, arrow functions, methods, class hierarchies, and properties with physical line locations, mapping them directly to the Monaco editor.

---

<a id="gemini-llm-call-graph-validation"></a>
### 24. Gemini LLM Call-Graph Validation

**File:** `src/utils/aiHelper.ts`

When generating a codebase's Function Call Graph, different modules often share identical, generic method names (e.g. `init()`, `validate()`, `reset()`). This causes visual overlap noise. CodeGraph resolves this via a hybrid AI-validation pipeline:
- **Ambiguity Detection**: The static analyzer flags functions containing call-sites that map to multiple possible target definitions.
- **LLM Call-Site Resolution**: CodeGraph passes the caller function's code context and candidate definitions to Google Gemini. The model analyzes imports, context, and arguments to determine the exact destination.
- **D3 Graph Refinement**: The resolved target is updated, converting ambiguous links to verified call pathways and stripping away invalid connections.

---

<a id="database-er-diagram-export-styling-controls"></a>
### 25. Database ER Diagram Export & Styling Controls

**Files:** `src/components/GraphCanvas.tsx`

To produce clean, production-ready Database Schema exports, CodeGraph features a dedicated high-fidelity SVG export pipeline specifically engineered for HTML-based database cards:
- **Dynamic Bounding Box Calculation**: Programmatically queries the bounding box (`getBBox()`) of the `.main-container` group, resetting viewport panning and zoom transforms. It sets custom `viewBox` coordinates with `60px` margins to capture every database table card.
- **Computed CSS Inlining (`inlineDbSchemaStyles`)**: Recursively scans and maps CSS variables (`--color-primary`, `--bg-card`, etc.) to inline inline styling attributes on SVGs and `foreignObject` DOM nodes.
- **Standardized Font & Scrollbar Overrides**: Injects a global `<style>` tag into the exported SVG to enforce standard typography (`Inter`, `monospace`) and hide browser scrollbar elements (`scrollbar-width: none`), guaranteeing identical rendering across independent vector viewers.
- **Synchronous Layout Settling**: Runs `250` simulation ticks synchronously before export to settle and separate cards, completely preventing overlapping database table blocks.

---

<a id="interactive-codebase-sonification"></a>
### 26. Interactive Codebase Sonification

**Files:** `src/utils/audioSonifier.ts` and `src/components/GraphCanvas.tsx`

Maps the topological properties of the codebase structure into a dynamic auditory landscape, using low-latency Web Audio API synthesizers to guide developer exploration:
- **Audio Context Management**: Dynamically initializes and resumes a shared browser `AudioContext` only after user interaction to satisfy browser security policies.
- **Polyphonic Synthesizer Engine**:
  - **Oscillators**: Utilizes native `OscillatorNode` elements with custom waveforms (sine waves for clean files; triangle/sawtooth waves combined with a `BiquadFilterNode` low-pass filter for complex or high-risk files).
  - **Frequency Mapping**: Maps file line counts logarithmically to frequency ranges ($220\text{Hz}$ to $880\text{Hz}$), translating larger files to lower, heavier pitches.
  - **Panning**: Uses `StereoPannerNode` to dynamically pan sounds from left to right based on the node's horizontal coordinate on the 2D/3D canvas.
- **Structural Feedback Rules**:
  - **Circular Dependency Alerts**: Triggers a two-tone dissonant tritone interval (e.g., $C$ and $F\#$) to auditorily flag files participating in import loops.
  - **Arpeggiated Trace Playback**: Simulating execution traces triggers a sequence of envelope-shaped synthesizer notes with tempos mapping to transaction speeds.
- **UI Integration & State Settings**:
  - **Master Gain node**: Connects all sound sources to a single master volume gain control.
  - **Settings Dashboard controls**: Slider control mapping master gain levels from `0` to `1` with state persistent storage in `localStorage.audio_volume` and `localStorage.audio_enabled`.
  - **Test Chime trigger**: Includes a button to synthesize a clean, decaying chord to preview active audio parameters.

---

<a id="visual-appsec--dependency-cve-vulnerability-map"></a>
### 27. Visual AppSec & Dependency CVE Vulnerability Map

**Files:** `src/utils/cveScanner.ts`, `src/components/Inspector.tsx`, `src/components/KpiRibbon.tsx`, and `src/components/GraphCanvas.tsx`

Integrates a static package audit pipeline directly into the visualization canvas to identify and help patch vulnerable third-party dependencies:
- **Static Manifest Parser**:
  - Automatically identifies dependency management configuration files: `package.json` (NPM), `requirements.txt` (Python/Pip), `Cargo.toml` (Rust/Cargo), and `go.mod` (Go).
  - Extracts package names and declared semantic version strings using custom parser functions.
- **Local Advisory Database**:
  - Evaluates extracted package coordinates against an in-memory database of security advisories (matching name, ecosystem, and semver vulnerability boundaries).
- **Interactive D3 Visual overlays**:
  - **2D SVG Mode**: Vulnerable package nodes are appended with a custom vector polygon shield icon badge (`polygon points="0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6"`) filled with neon red overlays and trigger custom `@keyframes pulse-vulnerable` CSS filters.
  - **3D Canvas Mode**: Computes three-dimensional vector coordinates to overlay red glowing outer halos and projection-adjusted shield icons next to target nodes.
- **Advisory Remediation Inspector**:
  - Selecting a vulnerable node dynamically loads security profiles detailing:
    - **Advisory CVE ID** (e.g. CVE-2023-45853, CVE-2024-22871).
    - **Description and Severity level** (Low, Moderate, High, Critical).
    - **Remediation commands** (e.g. `npm install package@version` or `pip install --upgrade package`).
    - **Import References**: A listing of all local codebase source files that import the vulnerable dependency.
- **Metric Telemetry Sync**:
  - Integrates a dedicated red **Vulnerabilities** chip to the sticky KPI ribbon bar.
  - Clicking the chip displays a list of all detected CVE items. Selecting any list item focuses and highlights the corresponding package node in the workspace.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        RepoSelector                          │
│  GitHub URL → fetchGitHubRepo()    ZIP → parseZipFile()      │
│                  (repoParser.ts)                             │
└──────────────────────┬───────────────────────────────────────┘
                       │  ParsedFile[]
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                     codeAnalyzer.ts                          │
│  parseImports → resolveImportPath → buildDependencyGraph     │
│  detectCodeSmells → detectCycles (DFS) → extractCallGraph    │
│  extractClassHierarchy → generateGitHistory                  │
│  → CodebaseGraph { nodes, links, cycles, smells, stats }     │
└────────┬──────────────────────┬───────────────────────────────┘
         │                      │
         ▼                      ▼
┌────────────────┐   ┌──────────────────────────────────────────┐
│  GraphCanvas   │   │                Inspector                  │
│  (D3.js SVG)   │   │  File metadata │ AI Summary │ Test Suite  │
│  4 view modes  │   │  Linter │ Audit │ Who Calls │ Code Preview│
│  + KpiRibbon   │   └──────────────────────────────────────────┘
│  + Evolution   │                  │
└────────────────┘                  ▼
         │               ┌───────────────────────┐
         │               │      aiHelper.ts      │
         │               │  Google Gemini AI     │
         │               │  gemini-3.5-flash     │
         │               └───────────────────────┘
         │                          │
         │        ┌─────────────────┼──────────────────┐
         │        ▼                 ▼                   ▼
         │  ┌──────────────┐ ┌───────────────┐ ┌───────────────┐
         │  │ AiChatDrawer │ │    Reports    │ │ ApiDocsPortal │
         │  │ (Q&A Drawer) │ │ Dashboard│AI │ │ REST API Docs │
         │  └──────────────┘ │ Smells│Cycles │ │ Live Tester   │
         │                   └───────────────┘ └───────────────┘
         ▼
┌────────────────────────────────┐
│     AnalyticsDashboard        │
│  Code Smells │ Architecture   │
│  Onboarding  │ Mermaid UML    │
└────────────────────────────────┘
```

### Data Flow
1. **Ingestion** — `RepoSelector` loads a GitHub repo or ZIP archive via `repoParser.ts`, producing a flat `ParsedFile[]` array
2. **Analysis** — `App.tsx` passes files to `codeAnalyzer.ts` which performs static analysis and returns a `CodebaseGraph` containing nodes, links, cycles, call graphs, class hierarchies, code smells, duplicate functions, and dead files
3. **Visualization** — `GraphCanvas` receives the graph data and renders it via D3.js across 4 view modes. `KpiRibbon` displays sticky metric summaries. `EvolutionPlayer` drives the Git Replay timeline.
4. **Inspection** — Clicking a node opens it in `Inspector` where per-file metadata, AI tools, the Architectural Linter, and Dependency Auditor are available
5. **AI Augmentation** — Any AI action calls `aiHelper.ts` which talks to Gemini and returns Markdown. This includes file explanations, test suites, refactoring, semantic search, architecture linting, dependency auditing, and API route extraction.
6. **API Documentation** — `ApiDocsPortal` uses `aiExtractEndpoints` to scan for REST routes and presents an interactive documentation workspace with live request testing
7. **Rendering** — All AI responses are rendered by a shared `formatMarkdown()` utility that produces syntax-highlighted code blocks with copy buttons
8. **API-to-Database Mapping & Drift** — The visual overlay engine correlates endpoints and databases, highlighting contract mismatches in the HUD.
9. **One-Click Refactoring** — Auto-Apply commits parsed AI code block recommendations directly to the active file, triggering an automated re-analysis flow.

---

<a id="security-privacy-error-handling"></a>
## 🔒 Security, Privacy & Error Handling

CodeGraph is engineered with a strict client-side architecture to safeguard proprietary codebases, secure configuration keys, and deliver clean, descriptive error states.

### 1. Proprietary Code Privacy
- **Direct-to-Endpoint Communications:** All source code parsing and structural graph indexing happen **entirely in your local browser sandbox**.
- **No Third-Party Intermediaries:** There are no backend database servers or server-side relays intercepting your files.
- **AI Requests Scope:** CodeGraph only sends file summaries (names, sizes, languages) or isolated active file contents (limited to 15,000 characters) directly to the Google Gemini API (via `https://generativelanguage.googleapis.com`) when you explicitly request AI explanations, test suites, or reports.

### 2. Token & API Key Protection
- **Build-time Environment Configuration:** Your Gemini API Key is loaded securely from the build environment variables (`VITE_GEMINI_API_KEY`) at build/dev time and is never saved in the browser's `localStorage` or shown on screen. Your GitHub Personal Access Token (PAT) is stored exclusively in the browser's local sandbox (`localStorage`).
- **Zero Remote Exfiltration:** CodeGraph never transmits your keys or tokens to any external servers other than the official Google Gemini and GitHub endpoints.
- **Token Best Practices:** When loading private repositories, we recommend using scope-restricted GitHub Personal Access Tokens (classic PAT with only `repo` read permission or fine-grained token with read-only contents access).

### 3. Content Security Policy (CSP)
To prevent unauthorized script execution and guard against data exfiltration, the app enforces a strict Content Security Policy meta-tag inside `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https: blob:;
  connect-src 'self' https://api.github.com https://generativelanguage.googleapis.com;
  worker-src 'self' blob:;
  child-src 'self' blob:;
" />
```
This restricts outbound network calls exclusively to local assets, trusted script CDNs, Google Fonts, GitHub API, and Google's Gemini API endpoints, while allowing Monaco Editor's background syntax-checking workers to spawn.

### 4. Quota Limits & Rate Limit Error Handling
- **Dynamic Error Decoders:** If the environment Gemini API Key experiences a connection error, CodeGraph catches it and formats it into user-friendly markdown notices:
  - **Rate Limit (429 ResourceExhausted):** Recognizes rate limits and displays a custom warnings banner containing recommendations to wait 1-2 minutes.
  - **Invalid Key (API_KEY_INVALID):** Alerts the user if the environment-configured key is invalid, providing direct links to get a new key from Google AI Studio.
- **Offline Fallbacks:** All features—such as Dependency Risk Auditing, Database Schema Audits, API route detection, and onboarding summaries—automatically revert to robust static offline analysis if the API key is missing from the build environment or quota is exhausted.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

### Development Commands

```bash
npm run dev       # Start development server (http://localhost:5173)
npm run build     # TypeScript compile + Vite production build
npm run lint      # Run ESLint
npm run preview   # Serve the production build locally
```

---

<div align="center">

Built with ❤️ using React, D3.js, and Google Gemini AI

*CodeGraph — Beta v1.0*

</div>
