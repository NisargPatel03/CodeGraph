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
  - [Graph Visualization](#1-graph-visualization-engine)
  - [File Inspector](#2-file-inspector)
  - [AI Code Intelligence Suite](#3-ai-code-intelligence-suite)
  - [Reports & Analytics Dashboard](#4-reports--analytics-dashboard)
  - [Theme System](#5-theme-system)
- [Architecture](#architecture)
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

### 🤖 AI Code Intelligence Suite
- **Semantic Code Search** — `semanticSearchCodebase` — AI-powered natural language query parser mapping user queries (e.g. "where we validate API keys") to the top matching files with relevance scores and match reasons.
- **AI Mermaid Diagram Generator** — `generateMermaidDiagram` — Automatically structures top-level folder subgraphs and file dependencies into a beautiful, visual Mermaid.js diagram.
- **AI Code Summary** — `getFileExplanation` — Explains a file's purpose, responsibilities, and architecture role in plain English.
- **AI Refactor** — `refactorCodeSmell` — Analyses a detected code smell and returns a clean, refactored implementation.
- **AI Test Suite Generator** — `generateTestSuite` — Generates a high-fidelity unit test suite covering all exports, edge cases, and mock states.
- **Developer Onboarding Guide** — `generateOnboardingGuide` — Creates a full project overview, reading order, and quickstart guide (exportable as Markdown).
- **Architecture Overview** — `generateArchitectureOverview` — Produces a layered architecture report identifying patterns, module categories, and refactoring recommendations.
- **AI Chat Assistant** — `askQuestionAboutCodebase` — A floating chat drawer that answers any developer question with full file-system context.

### 📊 Reports & Analytics
- **Codebase Dashboard** — KPI cards showing total files, functions, lines of code, circular dependencies detected, and dead files
- **Code Smell Detector** — Scans for Long Files, Long Functions, Nested Imports, and Unused Exports with per-smell severity (`critical`, `major`, `minor`) and an ✨ AI Refactor action
- **Circular Dependency Cycles** — Lists all detected cycles with the full chain of files
- **Onboarding Guide** — AI-generated Markdown exportable as `.md`, PDF (via browser print), or copied in Notion-compatible format
- **Architecture Overview** — AI-generated architectural analysis with module-level breakdown

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

---

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | React 19 with TypeScript 6 |
| **Build Tool** | Vite 8 |
| **Visualization** | D3.js v7 (force-directed, tree layouts, zoom/pan) |
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
│   │   ├── AnalyticsDashboard.tsx   # Detailed analysis metrics & AI reports dashboard
│   │   ├── GraphCanvas.tsx          # D3.js multi-mode graph renderer (1929 lines)
│   │   ├── Inspector.tsx            # File inspector sidebar with AI tools
│   │   ├── KpiRibbon.tsx            # Sticky canvas KPI summary ribbon
│   │   ├── Reports.tsx              # Bottom analytics panel & AI reports
│   │   └── RepoSelector.tsx         # Landing page — GitHub URL / ZIP uploader
│   ├── utils/
│   │   ├── aiHelper.ts              # All Gemini AI API helpers
│   │   ├── codeAnalyzer.ts          # Static analysis engine (965 lines)
│   │   └── repoParser.ts            # GitHub API & ZIP file parser
│   ├── App.tsx                      # Root layout, routing, theme controller
│   ├── App.css                      # Layout overrides
│   ├── index.css                    # Global design system & theme tokens
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

---

### 2. File Inspector & PR Diff Inspector

**File:** `src/components/Inspector.tsx`

A right-sidebar panel that activates when a file node or folder node is selected in the graph or file tree.

#### Branch / PR Diff Mode
When a branch comparison is active and a modified node is selected, the inspector enters **PR Diff Mode**, showing:
- **Status Badges** — Indicating `[+] Added` (emerald), `[~] Modified` (orange), or `[-] Deleted` (rose) with additions/deletions counts.
- **Git Patch Viewer** — A line-by-line syntax-highlighted git diff patch (green for `+`, red for `-`, blue/indigo for hunk markers).
- **Sub-Tab Navigation** — Toggle buttons to switch between **Code Review Diff** and **General Metrics**.
- **Virtual Node Support** — Handles deleted file placeholder nodes, rendering the deletion patch without crashing.

#### Info Tab Sections (Metrics View)
| Section | Description |
|---|---|
| **File Metadata** | Path, size, language, complexity score, estimated commit count |
| **Quick Actions** | Copy path, Open in VS Code (via `vscode://file/` URI scheme) |
| **Circular Dependency Alert** | Red banner if the file participates in any detected cycle |
| **Functions** | Parsed function list (name + line number), clickable to scroll code preview |
| **Who Calls This File** | Reverse dependency list — which files import this one |
| **Similar Files** | Top 3 files scored by language, folder proximity, and shared imports |
| **Imports** | List of all resolved import paths from this file |
| **AI Code Summary** | Gemini-powered plain-English explanation of the file |
| **AI Test Suite** | Gemini-generated complete Jest/Vitest unit test file |
| **Code Preview** | Scrollable raw code block with line navigation |

---

### 3. AI Code Intelligence Suite

**File:** `src/utils/aiHelper.ts`

All AI calls use `gemini-3.5-flash` via the official `@google/generative-ai` SDK. Every function gracefully falls back to a demo response if no API key is configured.

#### `getFileExplanation(filePath, fileContent, apiKey)`
Prompts Gemini as a *Senior Principal Engineer* to explain the file's purpose, responsibilities, architecture role, and primary exports in well-formatted Markdown.

#### `generateTestSuite(filePath, fileContent, apiKey)`
Prompts Gemini as a *Senior QA Automation Engineer* to generate a complete unit test suite using **Jest**, **Vitest**, or **Testing Library** — covering all exported functions, mock states, and edge cases. Up to 15,000 characters of file content are submitted.

#### `refactorCodeSmell(filePath, fileContent, smellMessage, smellDetails, apiKey)`
Prompts Gemini as a *Software Architect* to analyse a specific code smell, explain why it's a problem, and return a clean refactored implementation.

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

---

### 4. Reports & Analytics Dashboard

**File:** `src/components/Reports.tsx`

A collapsible bottom panel with five tabs:

#### Dashboard Tab
- **KPI Cards** — Total Files, Total Functions, Lines of Code, Circular Dependency count, Dead Files
- **Top Folders by Complexity** — Bar chart of aggregate complexity per folder
- **Most Imported Files** — Ranking by in-degree (how many files import them)
- **Most Changed Files** — Ranking by churn score

#### Code Smell Detector Tab
Scans all files using the static analysis engine and presents findings categorized by severity:

| Smell Type | Trigger Condition |
|---|---|
| `file_length` | File exceeds 300 lines |
| `func_length` | Function exceeds 50 lines |
| `nested_import` | Deep or circular nested import patterns |
| `unused_export` | Exported symbol with no detected importer |
| `circular_dep` | File participates in a circular dependency chain |

Each smell card shows the file path, a description, severity badge, and an **✨ AI Refactor** button that opens a glassmorphic full-screen modal with Gemini's refactoring suggestion.

#### Circular Dependency Cycles Tab
Lists every detected cycle with the full chain displayed as `File A → File B → File C → File A`.

#### Onboarding Guide Tab
- Generate button triggers `generateOnboardingGuide`
- Renders output as formatted Markdown with code blocks
- **Export options:** Download as `.md`, Print as PDF, Copy to Notion

#### Architecture Visualizer Tab
- Clicking **Generate Architecture Diagram** triggers `generateMermaidDiagram`.
- Automatically renders an interactive, clean **Mermaid.js** topological diagram representing folder subgraphs and file dependencies.

#### Architecture Overview Tab
- Generate button triggers `generateArchitectureOverview`
- Renders a structured architectural analysis report.

---

### 5. Theme System

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
│  → CodebaseGraph { nodes, links, cycles, smells, stats }     │
└────────┬──────────────────────┬───────────────────────────────┘
         │                      │
         ▼                      ▼
┌────────────────┐   ┌──────────────────────────────────────────┐
│  GraphCanvas   │   │                Inspector                  │
│  (D3.js SVG)   │   │  File metadata │ AI Summary │ Test Suite  │
│  4 view modes  │   │  Functions     │ Who Calls  │ Code Preview│
└────────────────┘   └──────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │      aiHelper.ts      │
                    │  Google Gemini AI     │
                    │  gemini-3.5-flash     │
                    └───────────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              ▼                                     ▼
    ┌──────────────────┐                ┌───────────────────┐
    │  AiChatDrawer    │                │      Reports      │
    │  (Q&A Drawer)    │                │  Dashboard │ AI   │
    └──────────────────┘                │  Smells │ Cycles  │
                                        └───────────────────┘
```

### Data Flow
1. **Ingestion** — `RepoSelector` loads a GitHub repo or ZIP archive via `repoParser.ts`, producing a flat `ParsedFile[]` array
2. **Analysis** — `App.tsx` passes files to `codeAnalyzer.ts` which performs static analysis and returns a `CodebaseGraph`
3. **Visualization** — `GraphCanvas` receives the graph data and renders it via D3.js
4. **Inspection** — Clicking a node opens it in `Inspector` where per-file metadata and AI tools are available
5. **AI Augmentation** — Any AI action calls `aiHelper.ts` which talks to Gemini and returns Markdown
6. **Rendering** — All AI responses are rendered by a shared `formatMarkdown()` utility that produces syntax-highlighted code blocks with copy buttons

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
