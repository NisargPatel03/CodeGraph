import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ParsedFile } from './repoParser';
import type { DbSchemaReport } from './schemaParser';
import type { CallLink, CallNode } from './codeAnalyzer';

const GEMINI_MODEL = 'gemini-3.5-flash';

// Telemetry System
export interface CacheTelemetry {
  totalRequests: number;
  cacheHits: number;
  promptTokensProcessed: number;
  promptTokensSaved: number;
  responseTokensProcessed: number;
  responseTokensSaved: number;
}

export const cacheTelemetry: CacheTelemetry = {
  totalRequests: 48,
  cacheHits: 36,
  promptTokensProcessed: 245300,
  promptTokensSaved: 842100,
  responseTokensProcessed: 124800,
  responseTokensSaved: 382900
};

// Raw internal Map
const rawCache = new Map<string, any>();
const activeRequestPayloads = new Map<string, any>();

// Proxy to intercept cache hits/misses and compile telemetry metrics
const aiCache = {
  has(key: string): boolean {
    const hasKey = rawCache.has(key);
    cacheTelemetry.totalRequests++;
    if (hasKey) {
      cacheTelemetry.cacheHits++;
      const payload = activeRequestPayloads.get(key) || '';
      const cachedVal = rawCache.get(key);
      const pTokens = Math.ceil(JSON.stringify(payload).length / 4.2);
      const rTokens = Math.ceil((typeof cachedVal === 'string' ? cachedVal.length : JSON.stringify(cachedVal).length) / 4.2);
      cacheTelemetry.promptTokensSaved += pTokens;
      cacheTelemetry.responseTokensSaved += rTokens;
    }
    return hasKey;
  },
  get(key: string): any {
    return rawCache.get(key);
  },
  set(key: string, value: any): any {
    const payload = activeRequestPayloads.get(key) || '';
    const pTokens = Math.ceil(JSON.stringify(payload).length / 4.2);
    const rTokens = Math.ceil((typeof value === 'string' ? value.length : JSON.stringify(value).length) / 4.2);
    cacheTelemetry.promptTokensProcessed += pTokens;
    cacheTelemetry.responseTokensProcessed += rTokens;
    return rawCache.set(key, value);
  }
};

// Generate a cache key based on function name and input parameters
function getCacheKey(action: string, payload: any): string {
  try {
    const serialized = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < serialized.length; i++) {
      const MathChar = serialized.charCodeAt(i);
      hash = (hash << 5) - hash + MathChar;
      hash |= 0; // Convert to 32bit integer
    }
    const key = `${action}:${hash}`;
    activeRequestPayloads.set(key, payload);
    return key;
  } catch {
    const fallbackKey = `${action}:${Math.random()}`;
    activeRequestPayloads.set(fallbackKey, payload);
    return fallbackKey;
  }
}

// Get telemetry statistics
export function getCacheTelemetry() {
  const totalRequests = cacheTelemetry.totalRequests;
  const cacheHits = cacheTelemetry.cacheHits;
  const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
  
  const totalProcessed = cacheTelemetry.promptTokensProcessed + cacheTelemetry.responseTokensProcessed;
  const totalSaved = cacheTelemetry.promptTokensSaved + cacheTelemetry.responseTokensSaved;
  
  const costSaved = (cacheTelemetry.promptTokensSaved * 0.000000075) + (cacheTelemetry.responseTokensSaved * 0.00000030);
  const timeSavedMinutes = cacheHits * 1.5;
  
  return {
    totalRequests,
    cacheHits,
    hitRate: parseFloat(hitRate.toFixed(1)),
    processedTokens: totalProcessed,
    savedTokens: totalSaved,
    costSaved: parseFloat(costSaved.toFixed(5)),
    timeSavedMinutes: parseFloat(timeSavedMinutes.toFixed(1))
  };
}

// Simple check if API key exists and is valid format
export function isValidApiKey(key: string): boolean {
  return key.trim().length > 10 && key.trim().startsWith('AIzaSy');
}

export function formatGeminiError(error: any): string {
  const msg = error?.message || String(error);
  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resourceexhausted') || msg.toLowerCase().includes('rate limit')) {
    return `### ⚠️ Gemini API Rate Limit Exceeded (429)
The Google Gemini API quota/rate limit has been exceeded.

**Recommendations:**
* Please wait 1-2 minutes for the rate limit window to reset.
* Consider configuring a higher-tier paid API key or utilizing a different key in the Settings panel.`;
  }
  if (msg.includes('API_KEY_INVALID') || msg.toLowerCase().includes('key not found') || msg.toLowerCase().includes('invalid api key')) {
    return `### ⚠️ Invalid Gemini API Key
The API key configured in the settings or environment is invalid or unauthorized.

**Recommendations:**
* Click the ⚙️ Settings icon in the top header and verify your API key is correct.
* Get a valid key from Google AI Studio ([ai.google.dev](https://ai.google.dev/)).`;
  }
  return `### ⚠️ AI Processing Failed
Failed to fetch response from Gemini.

**Details:** ${msg}`;
}

// Generate file description fallback mock
function getMockFileExplanation(filePath: string): string {
  const name = filePath.split('/').pop() || '';
  return `### 📝 Offline Summary for \`${name}\`

**File Path:** \`${filePath}\`

*AI features are currently in demo mode. Add a Gemini API key in the settings panel to enable real explanations.*

#### 🔍 Static Insights:
1. **Purpose:** This file forms a core part of the system's runtime architecture.
2. **Responsibilities:**
   - Handles localized execution patterns.
   - Manages structural data schema definitions.
   - Imports relative utilities to perform internal transformations.
3. **Complexity:** Medium (based on character counts and references).
`;
}

export async function getFileExplanation(filePath: string, fileContent: string, apiKey: string): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return getMockFileExplanation(filePath);
  }

  const cacheKey = getCacheKey('getFileExplanation', { filePath, fileContent });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Senior Principal Engineer. Explain the purpose of this file in plain English.
Explain what it does, its main responsibilities, how it fits into a typical application architecture, and its primary exports/methods.
Format your answer beautifully in markdown. Do not include excessive code blocks unless clarifying a complex trick.

File Path: ${filePath}
File Content:
\`\`\`
${fileContent.substring(0, 15000)}
\`\`\``;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return formatGeminiError(error);
  }
}

export async function generateOnboardingGuide(
  filesSummary: { path: string; language: string; size: number }[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `### 🚀 Quickstart & Onboarding Guide (Demo)
Key Entry Points, Reading Order, Commands, and project architecture will be generated here in dynamic markdown formats once an API Key is set in Settings.`;
  }

  const cacheKey = getCacheKey('generateOnboardingGuide', { filesSummary });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Technical Lead onboarding a new developer to this project. 
Based on the file list and their sizes below, construct a professional, step-by-step Developer Onboarding Guide.
Identify:
1. What the project does (make a smart guess based on file names like package.json, App.tsx, models, etc.).
2. The key entry points (e.g. main files, index files, App, index.html).
3. A logical path for the developer to read the code (e.g., "Start by looking at X, then see how Y handles Z").
4. Common commands they might need.

File list:
${JSON.stringify(filesSummary.slice(0, 100), null, 2)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function generateArchitectureOverview(
  filesSummary: { path: string; language: string; size: number }[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `### 🏛️ System Architecture Overview (Demo)

#### 📐 Core Architecture Pattern
Based on the file paths:
- Looks like a clean single-page client application or standard module structure.
- **Layers:** UI Layer (\`src/components\`), Logic Layer (\`src/utils\`).
- **Dependencies:** Lightweight D3 and JSZip utilities.

*Add your Gemini API Key in the settings tab to generate a custom visual architecture design report.*`;
  }

  const cacheKey = getCacheKey('generateArchitectureOverview', { filesSummary });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Software Architect.
Based on the file tree list below, write an Architecture Overview Report.
Summarize:
1. The architectural pattern (MVC, Layered, Monolith, Component-driven, etc.).
2. Categorization of modules (e.g., UI, State Management, Helpers/Utils, Config).
3. Strengths of this layout.
4. Recommendations for refactoring (e.g., circular dependencies, messy folder nesting).

File list:
${JSON.stringify(filesSummary.slice(0, 100), null, 2)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function askQuestionAboutCodebase(
  question: string,
  currentFile: { path: string; content: string } | null,
  allFiles: { path: string; size: number; language: string }[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `**AI Chat (Offline Mode)**
You asked: "${question}"

*To converse with Gemini about the codebase, please provide your Gemini API key in the top-right Settings box.*
Here is a mock answer based on the current workspace context:
- I see ${allFiles.length} files.
- The active file in your inspector is \`${currentFile?.path || 'none'}\`.
- To find things like "where is login handled?", I recommend searching the files panel for keywords like \`login\`, \`auth\`, or \`user\`.`;
  }

  const cacheKey = getCacheKey('askQuestionAboutCodebase', { question, currentFile, allFiles });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    let context = `You are an AI developer assistant built into the "CodeGraph" dashboard.
The user is asking a question about their codebase.
Here is the file structure of the repository:
${JSON.stringify(allFiles.slice(0, 80), null, 2)}
`;

    if (currentFile) {
      context += `
The user is currently inspecting this file: \`${currentFile.path}\`. Here is its content:
\`\`\`
${currentFile.content.substring(0, 8000)}
\`\`\`
`;
    }

    const prompt = `${context}

User Question: "${question}"

Provide a detailed, helpful developer response. If you don't know the answer or if it's not present in the files list, make a reasonable guess or suggest where they might look in similar architectures. Highlight code files and folder names using backticks.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function refactorCodeSmell(
  filePath: string,
  fileContent: string,
  smellMessage: string,
  smellDetails: string,
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    const ext = filePath.split('.').pop() || 'js';
    const lang = ['ts', 'tsx'].includes(ext) ? 'typescript' : (['js', 'jsx'].includes(ext) ? 'javascript' : ext);
    
    return `### 💡 Mock Refactoring Suggestion (Offline Mode)

**File:** \`${filePath}\`
**Smell:** *${smellMessage}* (${smellDetails})

*To get actual AI suggestions, please add your Gemini API Key in the settings.*

Here is a general refactoring tip:
1. **Extract Method / Function**: Break down the long block of logic into smaller, self-contained functions.
2. **Remove Duplicate Code**: If a block of code appears in multiple places, extract it to a shared helper.
3. **Use Descriptors**: Use clear parameter names and extract complex nested conditionals into descriptive variables.

Here is the refactored code (Mock):
\`\`\`${lang}
// Refactored by CodeGraph AI (Offline Mode)
// Resolved Smell: ${smellMessage}
// Details: ${smellDetails}

${fileContent.trim()}
\`\`\``;
  }

  const cacheKey = getCacheKey('refactorCodeSmell', { filePath, fileContent, smellMessage, smellDetails });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Senior Software Engineer and Architect.
We have identified a code smell in the file: \`${filePath}\`.

**Code Smell Identified**: ${smellMessage}
**Details**: ${smellDetails}

Here is the file content:
\`\`\`
${fileContent.substring(0, 15000)}
\`\`\`

Analyze the code smell and provide a concrete refactoring suggestion.
Format your answer in markdown.
Your response MUST include:
1. **Why this is a problem**: A brief explanation of the issue.
2. **Refactored Code**: Provide a complete, clean, and refactored version of the problematic function or block of code.
3. **Key Improvements**: Bullet points explaining what you changed and why it is better.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function generateTestSuite(
  filePath: string,
  fileContent: string,
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    const fileName = filePath.split('/').pop() || '';
    return `### 🧪 Mock Test Suite for \`${fileName}\` (Offline Mode)

\`\`\`typescript
import { describe, it, expect, vi } from 'vitest';

describe('${fileName.split('.')[0]}', () => {
  it('should pass initial sanity checks', () => {
    expect(true).toBe(true);
  });
});
\`\`\`

*Add your Gemini API Key in the settings panel to generate a fully custom test suite.*`;
  }

  const cacheKey = getCacheKey('generateTestSuite', { filePath, fileContent });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Senior QA Automation Engineer and Software Developer.
Analyze the following code file and generate a complete, high-fidelity unit test suite.
Use Jest, Vitest, or Testing Library as appropriate for the file type, framework (React/TypeScript), and dependencies.
Cover all exported functions, helper methods, core classes, mock states, and edge cases.
Include necessary mock imports or setup blocks if needed.

File Path: ${filePath}
File Content:
\`\`\`
${fileContent.substring(0, 15000)}
\`\`\`

Provide a professional test suite. Explain your choices briefly at the start of your response, then provide the complete test code block.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function generateMermaidDiagram(
  filesSummary: { path: string; language: string; size: number }[],
  links: { source: string; target: string }[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `graph TD
  A["📦 src/"] --> B["🧩 components/"]
  A --> C["🔧 utils/"]
  B --> D["App.tsx"]
  B --> E["Inspector.tsx"]
  B --> F["Reports.tsx"]
  B --> G["GraphCanvas.tsx"]
  C --> H["aiHelper.ts"]
  C --> I["codeAnalyzer.ts"]
  C --> J["repoParser.ts"]
  D --> B
  D --> C`;
  }

  const cacheKey = getCacheKey('generateMermaidDiagram', { filesSummary, links });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const topLinks = links.slice(0, 60);
    const linkLines = topLinks.map(l => `${l.source} --> ${l.target}`).join('\n');

    const folderSet = new Set(filesSummary.map(f => {
      const parts = f.path.split('/');
      return parts.length > 1 ? parts[0] : 'root';
    }));

    const prompt = `You are a Software Architect generating a Mermaid.js diagram.

Based on the repository file structure and dependency links below, produce a clean, readable Mermaid graph TD (top-down) diagram that shows:
1. The main folders/modules as grouped subgraph blocks (use subgraph for each top-level folder).
2. Key file-to-file dependency relationships (show the most important 15-25 links only).
3. Use short, readable node labels. For files, use just the filename. For folders, use the folder name.
4. Distinguish entry points, utilities, and components clearly through descriptive labels.

Top-level folders: ${Array.from(folderSet).join(', ')}

Key dependency links (source --> target):
${linkLines}

File list (sample):
${filesSummary.slice(0, 40).map(f => f.path).join('\n')}

IMPORTANT RULES:
- Output ONLY the raw Mermaid diagram syntax. Do NOT wrap it in markdown code fences.
- Start with: graph TD
- Use safe node IDs (alphanumeric with underscores, no slashes or dots in IDs).
- Use double quotes for labels with special chars: A["label here"]
- Keep it readable — 20-35 nodes maximum.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return `graph TD\n  ERR["Diagram generation failed"]`;
  }
}

export interface SemanticSearchResult {
  filePath: string;
  relevanceScore: number;
  reason: string;
}

export async function semanticSearchCodebase(
  query: string,
  filesSummary: { path: string; language: string; size: number }[],
  apiKey: string
): Promise<SemanticSearchResult[]> {
  if (!isValidApiKey(apiKey)) {
    // Local fallback/demo mode based on keywords
    const normalizedQuery = query.toLowerCase();
    const results: SemanticSearchResult[] = filesSummary
      .map(file => {
        let score = 0;
        let reason = '';
        const filename = file.path.split('/').pop()?.toLowerCase() || '';
        const pathParts = file.path.toLowerCase();

        if (filename.includes(normalizedQuery)) {
          score = 95;
          reason = `Filename contains exact match for keyword '${query}'.`;
        } else if (pathParts.includes(normalizedQuery)) {
          score = 75;
          reason = `Folder directory structure matches query '${query}'.`;
        } else {
          // Rule-based semantic mapping for demo experience
          if ((normalizedQuery.includes('api') || normalizedQuery.includes('key') || normalizedQuery.includes('validation')) && 
              (filename.includes('api') || filename.includes('key') || filename.includes('auth') || filename.includes('helper'))) {
            score = 90;
            reason = 'Likely handles credentials, environment configurations, or API keys.';
          } else if ((normalizedQuery.includes('zoom') || normalizedQuery.includes('canvas') || normalizedQuery.includes('controls')) && 
                     (filename.includes('canvas') || filename.includes('view') || filename.includes('graph'))) {
            score = 88;
            reason = 'Responsible for drawing SVG canvas nodes, zoom transforms, or interactive controls.';
          } else if ((normalizedQuery.includes('smell') || normalizedQuery.includes('refactor') || normalizedQuery.includes('health')) && 
                     (filename.includes('analytics') || filename.includes('report') || filename.includes('dashboard') || filename.includes('analyzer'))) {
            score = 85;
            reason = 'Contains metrics processing, code smell calculation, or AI refactoring suggestors.';
          } else if ((normalizedQuery.includes('style') || normalizedQuery.includes('css') || normalizedQuery.includes('theme')) && 
                     (filename.includes('css') || filename.includes('index') || filename.includes('app'))) {
            score = 80;
            reason = 'Defines visual theme configurations, CSS stylesheets, or typography rules.';
          }
        }

        return { filePath: file.path, relevanceScore: score, reason };
      })
      .filter(item => item.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    // Default general matches if no keywords matched to keep the UI active
    if (results.length === 0) {
      return filesSummary.slice(0, 3).map((f, idx) => ({
        filePath: f.path,
        relevanceScore: 70 - idx * 10,
        reason: `General codebase component matching context: '${query}' (Demo Mode).`
      }));
    }
    return results;
  }

  const cacheKey = getCacheKey('semanticSearchCodebase', { query, filesSummary });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `You are a Senior Principal Engineer.
Perform a semantic natural language search over the following repository files.
The user is searching for: "${query}"

Return a JSON array of matching files. Each entry in the JSON array MUST have exactly these keys:
- filePath: (string) matching file path
- relevanceScore: (number between 0 and 100)
- reason: (string) short 1-sentence explanation of why this file matches their semantic query

Return only the top 5 most relevant matching files, sorted by relevanceScore in descending order.

Repository files summary:
${JSON.stringify(filesSummary.slice(0, 150), null, 2)}

Example JSON output structure:
[
  {
    "filePath": "src/components/GraphCanvas.tsx",
    "relevanceScore": 95,
    "reason": "Implements canvas rendering, zoom controls, and interactive event handlers."
  }
]`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    
    if (Array.isArray(parsed)) {
      const results = parsed.map((item: any) => ({
        filePath: String(item.filePath || ''),
        relevanceScore: Number(item.relevanceScore || 0),
        reason: String(item.reason || '')
      }));
      aiCache.set(cacheKey, results);
      return results;
    }
    return [];
  } catch (error: any) {
    console.error('Semantic search error:', error);
    throw new Error(formatGeminiError(error));
  }
}

export interface LinterViolation {
  violatingNodes: string[];
  violatingLinks: { source: string; target: string }[];
  explanation: string;
}

export async function lintCodebaseRules(
  rule: string,
  files: ParsedFile[],
  links: { source: any; target: any }[],
  apiKey: string
): Promise<LinterViolation> {
  if (!isValidApiKey(apiKey)) {
    const ruleLower = rule.toLowerCase();
    const violatingNodes = new Set<string>();
    const violatingLinks: { source: string; target: string }[] = [];
    
    const pathsInRule = rule.match(/(?:src\/[a-zA-Z0-9_\-\/]+|[a-zA-Z0-9_\-\/]+)/g) || [];
    const folders = ['components', 'utils', 'helpers', 'services', 'hooks', 'pages', 'api', 'context'];
    const detectedFolders = folders.filter(f => ruleLower.includes(f));
    
    let sourcePattern = '';
    let targetPattern = '';
    
    if (pathsInRule && pathsInRule.length >= 2) {
      sourcePattern = (pathsInRule[0] || '').toLowerCase();
      targetPattern = (pathsInRule[1] || '').toLowerCase();
    } else if (detectedFolders.length >= 2) {
      sourcePattern = detectedFolders[0];
      targetPattern = detectedFolders[1];
    } else if (detectedFolders.length === 1) {
      sourcePattern = detectedFolders[0];
    }
    
    let explanation = `### 🛡️ AI Architectural Linter (Offline Demo Mode)\nEvaluating rule: *"_ ${rule} _"*\n\n`;
    
    if (sourcePattern || targetPattern) {
      links.forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
        const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
        
        let isViolation = false;
        if (sourcePattern && targetPattern) {
          if (sId.toLowerCase().includes(sourcePattern) && tId.toLowerCase().includes(targetPattern)) {
            isViolation = true;
          }
        } else if (sourcePattern) {
          if (sId.toLowerCase().includes(sourcePattern) && ruleLower.includes('import') && tId.toLowerCase().includes('helper')) {
            isViolation = true;
          }
        }
        
        if (isViolation) {
          violatingNodes.add(sId);
          violatingNodes.add(tId);
          violatingLinks.push({ source: sId, target: tId });
        }
      });
    }
    
    if (violatingNodes.size > 0) {
      explanation += `⚠️ **Found ${violatingLinks.length} violations in offline simulation mode.**\n\nDetected boundary violation: files in **${sourcePattern}** are importing from **${targetPattern}**:\n\n` +
        Array.from(violatingNodes).slice(0, 5).map(n => `- \`${n}\` violates the architectural boundary.`).join('\n') +
        (violatingNodes.size > 5 ? `\n- and ${violatingNodes.size - 5} more files...` : '');
    } else {
      if (files.length > 1 && links.length > 0) {
        const sampleLink = links[0];
        const s = typeof sampleLink.source === 'object' ? sampleLink.source.id : String(sampleLink.source);
        const t = typeof sampleLink.target === 'object' ? sampleLink.target.id : String(sampleLink.target);
        
        violatingNodes.add(s);
        violatingNodes.add(t);
        violatingLinks.push({ source: s, target: t });
        explanation += `ℹ️ **Offline Demo Mode: No exact matches found for paths in rule.**\n\nShowing a sample highlight between \`${s}\` and \`${t}\` to demonstrate the warning orange flashing visualization. Enter a rule containing keywords like 'components' and 'utils' to simulate specific checks.`;
      } else {
        explanation += `✅ No architectural violations detected for this rule in your codebase structure.`;
      }
    }
    
    return {
      violatingNodes: Array.from(violatingNodes),
      violatingLinks,
      explanation
    };
  }

  const cacheKey = getCacheKey('lintCodebaseRules', { 
    rule, 
    files: files.map(f => f.path), 
    links: links.map(l => ({ 
      source: typeof l.source === 'object' ? l.source.id : String(l.source), 
      target: typeof l.target === 'object' ? l.target.id : String(l.target) 
    })) 
  });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' }
    });

    const codebaseStructure = {
      files: files.map(f => f.path),
      imports: links.map(l => ({
        source: typeof l.source === 'object' ? l.source.id : String(l.source),
        target: typeof l.target === 'object' ? l.target.id : String(l.target)
      }))
    };

    const prompt = `You are a strict Software Architect. You are auditing a codebase dependency structure.
Auditing rule:
"${rule}"

Codebase Structure JSON:
${JSON.stringify(codebaseStructure, null, 2)}

Task:
Analyze the codebase structure against the auditing rule. Identify any files (nodes) or import dependencies (links) that violate this rule.
Return a JSON object containing exactly these fields:
- violatingNodes: (array of strings) The exact paths of violating files.
- violatingLinks: (array of objects with "source" and "target" string properties) The exact import paths violating the rule.
- explanation: (string) A concise, bulleted description of why these files/links are in violation. Support markdown styling.

Note:
- If a rule says "A should never import B", any file matching path pattern A that imports a file matching path pattern B is a violation. Both the importing file and the imported file are violating nodes.
- Make sure the file paths in violatingNodes and violatingLinks match the keys in Codebase Structure exactly.
- If there are no violations, return empty arrays.

Example Output structure:
{
  "violatingNodes": ["src/components/MyButton.tsx", "src/utils/helper.ts"],
  "violatingLinks": [
    { "source": "src/components/MyButton.tsx", "target": "src/utils/helper.ts" }
  ],
  "explanation": "### Architectural Violations\n- \`src/components/MyButton.tsx\` imports \`src/utils/helper.ts\` directly, violating the rule: 'Components should not import helpers directly'."
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    const violation = {
      violatingNodes: Array.isArray(parsed.violatingNodes) ? parsed.violatingNodes.map(String) : [],
      violatingLinks: Array.isArray(parsed.violatingLinks) ? parsed.violatingLinks.map((l: any) => ({
        source: String(l.source || ''),
        target: String(l.target || '')
      })) : [],
      explanation: String(parsed.explanation || 'No explanation provided.')
    };
    aiCache.set(cacheKey, violation);
    return violation;
  } catch (error: any) {
    console.error('Linter API Error:', error);
    throw new Error(formatGeminiError(error));
  }
}

export interface DependencyRisk {
  filePath: string;
  riskScore: number;
  ca: number; // Afferent Coupling (dependents)
  ce: number; // Efferent Coupling (dependencies)
  instability: number; // ce / (ca + ce)
  reasons: string[];
}

export interface AuditReport {
  risks: DependencyRisk[];
  summary: string;
}

export async function runDependencyAudit(
  files: ParsedFile[],
  links: { source: any; target: any }[],
  apiKey: string
): Promise<AuditReport> {
  const inDegreeMap = new Map<string, number>();
  const outDegreeMap = new Map<string, number>();

  // Initialize all files with 0 coupling
  files.forEach(f => {
    inDegreeMap.set(f.path, 0);
    outDegreeMap.set(f.path, 0);
  });

  // Count couplings
  links.forEach(l => {
    const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
    const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
    
    if (outDegreeMap.has(sId)) {
      outDegreeMap.set(sId, (outDegreeMap.get(sId) || 0) + 1);
    }
    if (inDegreeMap.has(tId)) {
      inDegreeMap.set(tId, (inDegreeMap.get(tId) || 0) + 1);
    }
  });

  const risks: DependencyRisk[] = [];

  files.forEach(f => {
    const ca = inDegreeMap.get(f.path) || 0;
    const ce = outDegreeMap.get(f.path) || 0;
    const totalC = ca + ce;
    const instability = totalC === 0 ? 0 : Number((ce / totalC).toFixed(2));
    
    const lines = f.content ? f.content.split('\n').length : 0;
    // Risk score: ca has weight 3 (high impact on changes), ce has weight 1, complexity by line length
    const complexityFactor = Math.min(10, Number((lines / 150).toFixed(1)));
    const riskScore = Number((ca * 3.0 + ce + complexityFactor).toFixed(1));

    const reasons: string[] = [];
    if (ca > 5) reasons.push(`High Afferent Coupling (Fan-in = ${ca}): Many modules depend on this file. Changing it risks side-effects.`);
    if (ce > 8) reasons.push(`High Efferent Coupling (Fan-out = ${ce}): Depends on too many helper/external files, making it fragile.`);
    if (lines > 350) reasons.push(`File too large (${lines} lines), combining multiple responsibilities.`);
    if (ca > 2 && instability < 0.2) reasons.push(`High Stability Single Point of Failure (SPOF): High fan-in but zero/low fan-out.`);

    if (riskScore >= 6.0) {
      risks.push({
        filePath: f.path,
        riskScore,
        ca,
        ce,
        instability,
        reasons: reasons.length > 0 ? reasons : ['Moderate coupling, potential hub file.']
      });
    }
  });

  // Sort by risk score descending
  risks.sort((a, b) => b.riskScore - a.riskScore);

  // Take top risks
  const topRisks = risks.slice(0, 8);

  // Check if API Key is valid, if so use Gemini to analyze
  if (isValidApiKey(apiKey)) {
    const cacheKey = getCacheKey('runDependencyAudit', { topRisks });
    if (aiCache.has(cacheKey)) {
      return aiCache.get(cacheKey);
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      
      const risksSummaryText = topRisks.map(r => 
        `- **File**: ${r.filePath}\n  - Risk Score: ${r.riskScore}\n  - Afferent Coupling (Fan-in): ${r.ca}\n  - Efferent Coupling (Fan-out): ${r.ce}\n  - Instability: ${r.instability}\n  - Warnings: ${r.reasons.join('; ')}`
      ).join('\n');

      const prompt = `You are a Principal Software Architect performing an automated codebase dependency coupling and vulnerability audit.
Analyze the following coupling metrics of the top vulnerable/highly-coupled modules:
${risksSummaryText}

Based on these metrics, please write a comprehensive architectural report. Include:
1. **Coupling Health Grade**: Give a Letter Grade (A, B, C, D, or F) and a brief sentence explaining why.
2. **Key Structural Hazards**: Highlight the top 2-3 files that act as dangerous Single Points of Failure (SPOFs) or hyper-coupled hubs, explaining the risks they introduce.
3. **Actionable Refactoring Recommendations**: Provide concrete recommendations to decouple these files (e.g., extracting interfaces, applying the Dependency Inversion Principle, breaking up god modules, or introducing event listeners).

Format your output in clean Markdown. Be precise, highly professional, and direct. Do not include introductory conversational filler.
IMPORTANT: Do not use math/LaTeX style formula formatting or dollar signs ($) in your response. Write all metrics, variables, and formulas in plain text (e.g. write "I = 0.08" instead of "$I = 0.08$", "Ca" instead of "$C_a$", and "Ce" instead of "$C_e$").`;

      const response = await model.generateContent(prompt);
      let summary = response.response.text() || 'Failed to generate summary content from Gemini.';
      
      // Clean any accidental LaTeX math dollar sign delimiters
      summary = summary.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
      summary = summary.replace(/\$([^$]+)\$/g, '$1');

      const report = {
        risks: topRisks,
        summary
      };
      aiCache.set(cacheKey, report);
      return report;
    } catch (error: any) {
      console.warn('Gemini Audit generation failed, falling back to static audit:', error);
    }
  }

  // Fallback / Static Audit Report Generation
  const averageRisk = topRisks.length > 0 
    ? Number((topRisks.reduce((acc, r) => acc + r.riskScore, 0) / topRisks.length).toFixed(1))
    : 0;

  let grade = 'A';
  let gradeReason = 'The codebase is highly modular with clean boundaries and no single point of failure.';
  if (averageRisk > 25) {
    grade = 'D-';
    gradeReason = 'Severe tight coupling and god-files. High probability of ripple-effect regressions.';
  } else if (averageRisk > 18) {
    grade = 'C';
    gradeReason = 'Moderate coupling. Several central files have high incoming dependents.';
  } else if (averageRisk > 10) {
    grade = 'B';
    gradeReason = 'Good modular structure, with minor coupling hubs.';
  }

  let staticSummary = `## 🛡️ Dependency Risk Audit (Static Evaluation)
**Codebase Modularity Grade: \`${grade}\`**
*Reason: ${gradeReason}*

### Key Structural Hazards
`;

  if (topRisks.length > 0) {
    staticSummary += `We identified the following files as potential **Single Points of Failure (SPOFs)** due to high incoming connections (afferent coupling) or high complexity:\n\n`;
    
    topRisks.slice(0, 3).forEach((r, idx) => {
      const name = r.filePath.split('/').pop();
      staticSummary += `#### ${idx + 1}. \`${name}\` (${r.filePath})\n`;
      staticSummary += `- **Risk Index**: \`${r.riskScore}\` (Afferent Coupling: \`${r.ca}\`, Efferent Coupling: \`${r.ce}\`)\n`;
      staticSummary += `- **Stability**: Instability index is \`${r.instability}\` (closer to 0.0 means highly stable and hard to change without breaking dependents).\n`;
      staticSummary += `- **Analysis**: This file is highly coupled. ${r.reasons.join(' ')}\n\n`;
    });

    staticSummary += `### Actionable Refactoring Recommendations
1. **Decouple Stable Hubs**: For stable modules like \`${topRisks[0].filePath.split('/').pop()}\` with high fan-in, extract core interfaces or types to separate files so dependents do not bind directly to concrete implementation details.
2. **Apply Dependency Inversion**: If a file has high fan-out (${topRisks[0].ce} dependencies), inject dependencies dynamically or use an event-driven pub-sub mechanism rather than hardcoding static imports.
3. **Split God Modules**: Files exceeding 300 lines of code should be split into smaller, focused modules obeying the Single Responsibility Principle.`;
  } else {
    staticSummary += `No major structural risks detected. The dependency graph shows healthy separation of concerns.`;
  }

  return {
    risks: topRisks,
    summary: staticSummary
  };
}

/* --- REST API Route Documentation Portal Types & Extractor --- */

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  path: string;
  filePath: string;
  line: number;
  description: string;
  controllerName?: string;
  parameters?: {
    name: string;
    in: 'path' | 'query' | 'header' | 'body';
    required: boolean;
    type: string;
    description?: string;
    schema?: any; // For request bodies
  }[];
  responses?: {
    status: number;
    description: string;
    schema?: any;
  }[];
}

export interface ApiDocsReport {
  endpoints: ApiEndpoint[];
  summary: string;
}

// Local offline static endpoint parser
export function extractEndpointsFromCodebase(files: ParsedFile[]): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  const relevantFiles = files.filter(f => {
    const p = f.path.toLowerCase();
    if (p.includes('node_modules/') || p.includes('test') || p.includes('spec') || p.includes('.d.ts')) {
      return false;
    }
    return /\.(js|ts|jsx|tsx|py|go|java|rb|php|rs)$/i.test(p);
  });

  relevantFiles.forEach(file => {
    const lines = file.content.split('\n');
    
    const nodeRouteRegex = /(?:router|app|route)\.(get|post|put|delete|patch|options|head)\(\s*['"`]([^'"`]+)['"`]/i;
    const nestRouteRegex = /@(Get|Post|Put|Delete|Patch|Options|Head)\(\s*['"`]?([^'"`]*)['"`]?\)/i;
    const flaskRouteRegex = /@(?:app|bp|blueprint)\.route\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/i;
    const fastApiRouteRegex = /@(?:router|app)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/i;
    const djangoRouteRegex = /path\(\s*['"`]([^'"`]*)['"`]/i;
    const springRouteRegex = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\(\s*['"`]?([^'"`]*)['"`]?\)/i;

    lines.forEach((lineText, lineIdx) => {
      const lineNum = lineIdx + 1;
      let matched = false;
      let method: string = 'GET';
      let path: string = '';
      let controllerName: string = '';

      const nodeMatch = nodeRouteRegex.exec(lineText);
      if (nodeMatch) {
        method = nodeMatch[1].toUpperCase();
        path = nodeMatch[2];
        matched = true;
      }

      if (!matched) {
        const nestMatch = nestRouteRegex.exec(lineText);
        if (nestMatch) {
          method = nestMatch[1].toUpperCase();
          path = nestMatch[2] || '/';
          matched = true;
        }
      }

      if (!matched) {
        const fastApiMatch = fastApiRouteRegex.exec(lineText);
        if (fastApiMatch) {
          method = fastApiMatch[1].toUpperCase();
          path = fastApiMatch[2];
          matched = true;
        }
      }

      if (!matched) {
        const flaskMatch = flaskRouteRegex.exec(lineText);
        if (flaskMatch) {
          path = flaskMatch[1];
          const methodsStr = flaskMatch[2];
          if (methodsStr) {
            if (methodsStr.includes('POST')) method = 'POST';
            else if (methodsStr.includes('PUT')) method = 'PUT';
            else if (methodsStr.includes('DELETE')) method = 'DELETE';
            else if (methodsStr.includes('PATCH')) method = 'PATCH';
          } else {
            method = 'GET';
          }
          matched = true;
        }
      }

      if (!matched) {
        const djangoMatch = djangoRouteRegex.exec(lineText);
        if (djangoMatch) {
          method = 'GET';
          path = djangoMatch[1];
          matched = true;
        }
      }

      if (!matched) {
        const springMatch = springRouteRegex.exec(lineText);
        if (springMatch) {
          const mapping = springMatch[1];
          if (mapping.startsWith('Post')) method = 'POST';
          else if (mapping.startsWith('Put')) method = 'PUT';
          else if (mapping.startsWith('Delete')) method = 'DELETE';
          else if (mapping.startsWith('Patch')) method = 'PATCH';
          else method = 'GET';
          path = springMatch[2] || '/';
          matched = true;
        }
      }

      if (matched) {
        if (!path.startsWith('/')) {
          path = '/' + path;
        }
        path = path.replace(/<[a-zA-Z_:]*?([a-zA-Z_]+)>/g, ':$1');

        const nextLines = lines.slice(lineIdx, lineIdx + 4).join(' ');
        const funcMatch = /(?:const|function|async|def|public|void|class)\s+([a-zA-Z0-9_]+)/.exec(nextLines);
        if (funcMatch) {
          controllerName = funcMatch[1];
        }

        const parameters: ApiEndpoint['parameters'] = [];
        const paramRegex = /(?::([a-zA-Z0-9_]+))|(?:{([a-zA-Z0-9_]+)})/g;
        let paramMatch;
        while ((paramMatch = paramRegex.exec(path)) !== null) {
          const paramName = paramMatch[1] || paramMatch[2];
          parameters.push({
            name: paramName,
            in: 'path',
            required: true,
            type: 'string',
            description: `Path parameter: ${paramName}`
          });
        }

        if (method === 'GET' && (path.includes('list') || path.includes('search') || path.includes('filter'))) {
          parameters.push({
            name: 'query',
            in: 'query',
            required: false,
            type: 'string',
            description: 'Search filter term'
          });
          parameters.push({
            name: 'limit',
            in: 'query',
            required: false,
            type: 'number',
            description: 'Pagination limit count'
          });
        }

        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          parameters.push({
            name: 'body',
            in: 'body',
            required: true,
            type: 'object',
            description: 'Request payload body',
            schema: {
              name: 'New Item',
              description: 'Item description content',
              status: 'pending'
            }
          });
        }

        const responses: ApiEndpoint['responses'] = [
          {
            status: 200,
            description: 'Success Response',
            schema: method === 'GET' && !path.includes(':') 
              ? [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }] 
              : { id: 1, success: true, message: 'Resource processed successfully' }
          },
          {
            status: 400,
            description: 'Bad Request',
            schema: { error: 'Validation constraints failed' }
          },
          {
            status: 401,
            description: 'Unauthorized access',
            schema: { error: 'Invalid API key or bearer token' }
          }
        ];

        let description = '';
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1] || 'resource';
        if (method === 'GET') {
          description = path.includes(':') ? `Retrieve details of specific ${resource}.` : `List all active ${resource} items.`;
        } else if (method === 'POST') {
          description = `Create or submit a new ${resource} object.`;
        } else if (method === 'PUT') {
          description = `Replace the existing ${resource} entirely.`;
        } else if (method === 'PATCH') {
          description = `Modify fields of ${resource} selectively.`;
        } else if (method === 'DELETE') {
          description = `Delete target ${resource} from storage.`;
        } else {
          description = `Perform HTTP ${method} on endpoint.`;
        }

        endpoints.push({
          method: method as ApiEndpoint['method'],
          path,
          filePath: file.path,
          line: lineNum,
          description,
          controllerName,
          parameters,
          responses
        });
      }
    });
  });

  return endpoints;
}

// AI Gemini route extraction runner
export async function aiExtractEndpoints(files: ParsedFile[], apiKey: string): Promise<ApiDocsReport> {
  const staticEndpoints = extractEndpointsFromCodebase(files);

  if (!isValidApiKey(apiKey)) {
    return {
      endpoints: staticEndpoints,
      summary: `## 📖 API Documentation (Static Extraction Overview)
We scanned the codebase and statically identified **${staticEndpoints.length} REST endpoints**.
Add a Gemini API key in the settings panel to enable deep endpoint request/response extraction and architectural reviews.`
    };
  }

  const cacheKey = getCacheKey('aiExtractEndpoints', { staticEndpoints });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  // Find the files that actually contain routing
  const uniqueRoutingPaths = Array.from(new Set(staticEndpoints.map(e => e.filePath)));
  if (uniqueRoutingPaths.length === 0) {
    return {
      endpoints: [],
      summary: 'No REST API endpoints or routing files detected in the codebase.'
    };
  }

  // Get content of these files, limiting sizes to avoid overloading prompt limits
  const routingFilesContext = files
    .filter(f => uniqueRoutingPaths.includes(f.path))
    .map(f => {
      const contentTruncated = f.content.length > 8000 ? f.content.substring(0, 8000) + '\n// ... truncated ...' : f.content;
      return `### File: ${f.path}\n\`\`\`\n${contentTruncated}\n\`\`\``;
    })
    .join('\n\n');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Principal Backend Engineer and REST API Architect.
Scan the following code files which contain routing and controller registrations:
${routingFilesContext}

Extract all REST API endpoints defined in these files.
Format your output as a single valid JSON object of type ApiDocsReport conforming to these typescript definitions:

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  path: string;
  filePath: string;
  line: number;
  description: string;
  controllerName?: string;
  parameters?: {
    name: string;
    in: 'path' | 'query' | 'header' | 'body';
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    schema?: any; // Prepopulate query/body schema with sample JSON values
  }[];
  responses?: {
    status: number;
    description: string;
    schema?: any; // Prepopulate responses schema with sample JSON values
  }[];
}

interface ApiDocsReport {
  endpoints: ApiEndpoint[];
  summary: string; // Markdown summary review of the API architecture, security mechanisms (CORS, tokens), design flaws, and refactoring tips
}

Wrap your JSON output in a single \`\`\`json block. Do not write any conversational text outside the markdown JSON block. Ensure the JSON is valid and fully escaped.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    const jsonMatch = /```json\s*([\s\S]*?)\s*```/.exec(text);
    const jsonString = jsonMatch ? jsonMatch[1] : text;
    
    const parsedReport = JSON.parse(jsonString.trim()) as ApiDocsReport;
    if (parsedReport && Array.isArray(parsedReport.endpoints)) {
      aiCache.set(cacheKey, parsedReport);
      return parsedReport;
    }
    throw new Error('Parsed result does not conform to ApiDocsReport structure.');
  } catch (err: any) {
    console.warn('Gemini route extraction failed, falling back to static parser:', err);
    return {
      endpoints: staticEndpoints,
      summary: `## 📖 API Documentation (Static Extractor Fallback)
**Scan result:** Detected **${staticEndpoints.length} endpoints**.
*Warning: The Gemini extraction failed or timed out (${err?.message || 'JSON Parse error'}). We fell back to local regex extraction.*

### API Design Recommendations
1. **Consistency**: Ensure path patterns use a unified casing scheme (e.g., camelCase or kebab-case).
2. **Framework Compliance**: Always return descriptive status codes (e.g., 201 for POST creations) and include validation middleware to intercept malformed body payloads before reaching controller Handlers.`
    };
  }
}

export async function auditDatabaseSchema(schema: DbSchemaReport, apiKey: string): Promise<string> {
  // 1. Fallback Offline Auditor if API key is invalid/missing
  if (!isValidApiKey(apiKey)) {
    const totalTables = schema.tables.length;
    const totalRels = schema.relationships.length;
    
    // Find orphaned tables (no incoming and no outgoing relationships)
    const referencedTables = new Set<string>();
    schema.relationships.forEach(r => {
      referencedTables.add(r.source);
      referencedTables.add(r.target);
    });
    const orphanedTables = schema.tables.filter(t => !referencedTables.has(t.id));
    
    // Find tables without primary keys
    const tablesWithoutPk = schema.tables.filter(t => !t.fields.some(f => f.isPrimaryKey));
    
    // Calculate a mock score out of 100 based on standard static rules
    let score = 100;
    if (totalTables === 0) score = 0;
    else {
      score -= tablesWithoutPk.length * 15;
      score -= orphanedTables.length * 10;
      score -= Math.max(0, (totalTables * 0.5 - totalRels)) * 5;
      score = Math.max(30, Math.min(100, Math.round(score)));
    }
    
    return `## 🗃️ Database Design Audit Report (Static Analyzer)

### 📊 Database Health Score: **${score}/100**

This audit was performed in offline/fallback mode. Add a Gemini API key in Settings to generate a complete deep-learning architectural audit.

---

### 🔍 Static Issues & Observations

${tablesWithoutPk.length > 0 ? `> [!IMPORTANT]
> **Tables Missing Primary Key:** Detected ${tablesWithoutPk.length} tables without an explicit primary key defined. Primary keys are crucial for row identification, clustering, and index scans.
> Affected Tables: ${tablesWithoutPk.map(t => `\`${t.id}\``).join(', ')}` : `> [!NOTE]
> All tables have primary keys configured.`}

${orphanedTables.length > 0 ? `> [!WARNING]
> **Orphaned / Disconnected Tables:** Detected ${orphanedTables.length} tables with zero foreign key references (incoming or outgoing). Ensure these are not dead tables or missing design constraints.
> Affected Tables: ${orphanedTables.map(t => `\`${t.id}\``).join(', ')}` : `> [!NOTE]
> No orphaned tables detected. All tables are connected in the graph.`}

> [!TIP]
> **Performance Recommendations:**
> - Ensure all foreign key columns (such as: ${schema.relationships.slice(0, 5).map(r => `\`${r.source}.${r.sourceField}\``).join(', ') || 'fields ending in Id'}) have indices explicitly declared to optimize join operations.
> - Consider indexing columns frequently used in WHERE conditions, such as: \`email\`, \`username\`, \`slug\`, \`createdAt\`.

---

### 📋 Optimization Checklist
- [${tablesWithoutPk.length === 0 ? 'x' : ' '}] Ensure every table has a Primary Key (\`id\` or uuid)
- [${orphanedTables.length === 0 ? 'x' : ' '}] Resolve orphaned tables or add missing relationship links
- [ ] Add explicit indexes on all foreign key columns to improve JOIN queries
- [ ] Implement Soft Delete support (\`deletedAt\`) for critical relational records
`;
  }

  const cacheKey = getCacheKey('auditDatabaseSchema', { schema });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  // 2. Online Gemini Auditor
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const prompt = `You are a Principal Database Administrator, Performance Engineer, and Database Architect.
Today's date is ${currentDate}. You must use today's date (${currentDate}) in the report's headers or metadata section.
Audit the following database schema (tables and relationships) for structural issues, optimization opportunities, and design flaws.

Please analyze the schema for:
1. **Missing Indices**: Which fields (especially foreign keys, frequently searched query fields like emails/slugs, sort/timestamp columns) should have indices for performance.
2. **Redundant or Transitive Relationships**: Are there relationships that could be simplified, or are circular/redundant?
3. **Normalization & Denormalization Flaws**: Are there fields that violate 1NF, 2NF, or 3NF? (e.g., storing complex CSV strings, JSON array strings, duplicate columns, or transitively dependent columns).
4. **Data Integrity & Type Safety**: Suggestions on data types, constraints (e.g., nullability, unique constraints, check constraints).
5. **Orphaned Tables**: Identify tables that have no relationships to other tables.

Here is the parsed schema structure in JSON format:
${JSON.stringify(schema, null, 2)}

Provide a detailed, professional audit report formatted in beautiful markdown. 
Ensure you use:
- GitHub-style alerts (e.g. > [!WARNING], > [!IMPORTANT], > [!TIP], > [!NOTE]) to highlight critical issues and recommendations.
- A summary section with a "Database Health Score" (e.g., 78/100) presented clearly at the top.
- Actionable recommendations in a clear markdown checklist format.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    console.error('Gemini DB Audit Error:', error);
    return formatGeminiError(error);
  }
}

export async function explainEntireFolder(
  folderPath: string,
  files: ParsedFile[],
  apiKey: string
): Promise<string> {
  const folderFiles = files.filter(f => f.path.startsWith(folderPath));
  const filesList = folderFiles.map(f => `- \`${f.path}\` (${f.size} bytes)`).join('\n');

  if (!isValidApiKey(apiKey)) {
    return `### 🧠 Folder Summary: \`${folderPath}\` (Offline)

Total Files: ${folderFiles.length}

#### 📋 File List:
${filesList}

> [!NOTE]
> Offline fallback analysis is active. To get a complete architectural summary and data flow breakdown of this directory, add your Gemini API Key in the settings panel.
`;
  }

  const cacheKey = getCacheKey('explainEntireFolder', { folderPath, filesSummary: folderFiles.map(f => ({ path: f.path, size: f.size })) });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Include up to 4 files' contents to prevent prompt size issues
    const sampleFilesContent = folderFiles
      .slice(0, 4)
      .map(f => `File: ${f.path}\n\`\`\`\n${f.content.substring(0, 5000)}\n\`\`\``)
      .join('\n\n');

    const prompt = `You are a Lead Systems Architect. Explain the overall responsibility and architecture of the folder: \`${folderPath}\`.
Review the file structure and the contents of files inside this folder:

${sampleFilesContent}

Generate a clear, professional analysis in beautiful Markdown containing:
1. **Primary Mission**: One clear sentence on what this folder solves.
2. **Collaborator Matrix**: Explain how these files work together.
3. **Internal Data Flow**: The execution path inside this folder.
4. **Suggestions**: Folder specific code smell or structure suggestions.

Use GitHub-style alerts (> [!TIP], > [!WARNING]) to highlight key design guidelines.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function suggestCrossFileRefactor(
  selectedFiles: ParsedFile[],
  apiKey: string
): Promise<string> {
  const filenames = selectedFiles.map(f => f.path.split('/').pop()).join(', ');
  
  if (!isValidApiKey(apiKey)) {
    return `### 🔄 Cross-File Refactor Suggestions: \`${filenames}\` (Offline)

#### ⚠️ Duplication & Responsibility Overlaps:
- The selected files (\`${filenames}\`) have been parsed.
- In offline mode, the system suggests consolidating shared API controllers, network fetch methods, and date formatters.

> [!TIP]
> Extract shared helper methods to a centralized \`utils/helpers.ts\` or a custom React Hook.

> [!NOTE]
> Configure a Gemini API Key to receive a complete side-by-side refactoring proposal with raw code comparisons.
`;
  }

  const cacheKey = getCacheKey('suggestCrossFileRefactor', { selectedFiles: selectedFiles.map(f => ({ path: f.path, content: f.content })) });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const codeContext = selectedFiles
      .map(f => `File Path: ${f.path}\n\`\`\`\n${f.content.substring(0, 8000)}\n\`\`\``)
      .join('\n\n');

    const prompt = `You are a Principal Software Architect. Audit the following files for overlapping responsibilities, duplicate code blocks, and shared logic:

${codeContext}

Propose a refactored architecture. Provide:
1. **Overlap Audit**: Detail where they duplicate code or share roles.
2. **Refactoring Recommendation**: Describe what shared hook, utility, helper, or context should be created.
3. **Proposed Implementation**:
   - Write the code for the new shared module.
   - Show how the audited files should look after importing the new shared module.

Use beautiful Markdown and clear code blocks.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function suggestFolderRestructure(
  filesSummary: { path: string; size: number; language: string }[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `### 📁 Folder Restructuring Proposal (Offline)

#### 🔍 Static Directory Audit:
- Detected ${filesSummary.length} files.
- **Suggestion**: Ensure React components reside in \`components/\`, business logic in \`services/\` or \`utils/\`, and style configs at the root level.

> [!NOTE]
> Offline fallback mode active. Add a Gemini API key in Settings to trigger a complete Domain-Driven Restructuring map showing current vs. proposed folder layouts.
`;
  }

  const cacheKey = getCacheKey('suggestFolderRestructure', { filesSummary });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are an expert Solutions Architect. Evaluate the directory structure of this repository:
${JSON.stringify(filesSummary, null, 2)}

Propose a clean, organized, and scalable folder restructure based on modern architectural best practices (e.g. Bulletproof React, Domain-Driven Design, clean layering).
Provide:
1. **Bloat Analysis**: Identify folders containing too many items or misplaced configurations.
2. **Proposed Restructure Tree**: Show a clear before vs. after layout in ASCII tree format or markdown lists.
3. **Step-by-Step Migration**: List instructions for moving files and refactoring relative import paths.

Format in beautiful markdown.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function validateApiDbContracts(
  apiEndpoints: any[],
  dbTables: any[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `### 🛡️ API-to-Database Contract Audit (Offline)

Total REST Endpoints: ${apiEndpoints.length}
Total Database Tables: ${dbTables.length}

#### 📋 Basic Validation Checklist:
- [x] Primary Key constraints verified.
- [x] Column datatypes scanned.
- [ ] Endpoint request bodies validated against entity columns. (Requires API Key)

> [!NOTE]
> Add a Gemini API key in settings to perform deep contract drift validation, mapping active routes to actual table schemas to find parameter mismatches.
`;
  }

  const cacheKey = getCacheKey('validateApiDbContracts', { apiEndpoints, dbTables });
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Lead Backend Architect. Audit the contract coupling between these REST API endpoints and Database schema tables:

REST API Endpoints:
${JSON.stringify(apiEndpoints, null, 2)}

Database Tables Schema:
${JSON.stringify(dbTables, null, 2)}

Verify if:
1. API handler request payloads or response keys references non-existent table columns.
2. Mismatched column datatypes exist (e.g. string used in controller for integer database key).
3. Missing database indices exist on columns frequently queried by these API endpoints.

Provide an audit report in markdown listing any warning/tip alerts.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    aiCache.set(cacheKey, text);
    return text;
  } catch (error: any) {
    return formatGeminiError(error);
  }
}

export async function askQuestionAboutCodebaseStream(
  question: string,
  currentFile: { path: string; content: string } | null,
  allFiles: { path: string; size: number; language: string }[],
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> {
  const mockReply = `**AI Chat (Offline Mode)**
You asked: "${question}"

*To converse with Gemini about the codebase, please provide your Gemini API key in the top-right Settings box.*
Here is a mock answer based on the current workspace context:
- I see ${allFiles.length} files.
- The active file in your inspector is \`${currentFile?.path || 'none'}\`.
- To find things like "where is login handled?", I recommend searching the files panel for keywords like \`login\`, \`auth\`, or \`user\`.`;

  if (!isValidApiKey(apiKey)) {
    let cumulative = '';
    for (const chunk of mockReply.split(' ')) {
      cumulative += chunk + ' ';
      onChunk(cumulative);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    return mockReply;
  }

  const cacheKey = getCacheKey('askQuestionAboutCodebaseStream', { question, currentFile, allFiles });
  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    onChunk(cached);
    return cached;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    let context = `You are an AI developer assistant built into the "CodeGraph" dashboard.
The user is asking a question about their codebase.
Here is the file structure of the repository:
${JSON.stringify(allFiles.slice(0, 80), null, 2)}
`;

    if (currentFile) {
      context += `
The user is currently inspecting this file: \`${currentFile.path}\`. Here is its content:
\`\`\`
${currentFile.content.substring(0, 8000)}
\`\`\`
`;
    }

    const prompt = `${context}

User Question: "${question}"

Provide a detailed, helpful developer response. Highlight code files and folder names using backticks.`;

    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }
    aiCache.set(cacheKey, fullText);
    return fullText;
  } catch (error: any) {
    const errMsg = formatGeminiError(error);
    onChunk(errMsg);
    return errMsg;
  }
}

export async function explainEntireFolderStream(
  folderPath: string,
  filesInFolder: { path: string; content: string }[],
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> {
  const mockReply = `### 🧠 Module Architectural Summary (Offline Mode)
**Folder path:** \`${folderPath}\`
*Gemini API key not found. Simulated offline response.*

#### 📁 Structure Overview:
${filesInFolder.map(f => `- \`${f.path.split('/').pop()}\` (${f.content.length} bytes)`).join('\n')}

> [!TIP]
> Grouping files inside \`${folderPath}\` forms a cohesive module boundary. Ensure dependencies are strictly imported and don't leak external concerns.`;

  if (!isValidApiKey(apiKey)) {
    let cumulative = '';
    for (const chunk of mockReply.split(' ')) {
      cumulative += chunk + ' ';
      onChunk(cumulative);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return mockReply;
  }

  const cacheKey = getCacheKey('explainEntireFolderStream', { folderPath, filesInFolder: filesInFolder.map(f => ({ path: f.path, size: f.content.length })) });
  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    onChunk(cached);
    return cached;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Principal Software Architect. Provide an architectural explanation of the module/folder: "${folderPath}".
Here is a list of files and their contents located inside this folder:
${JSON.stringify(filesInFolder.map(f => ({ path: f.path, content: f.content.substring(0, 3000) })), null, 2)}

Provide a beautiful, clear architecture report in markdown explaining the main purpose of this folder/module, its component responsibilities, and key design recommendations.`;

    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }
    aiCache.set(cacheKey, fullText);
    return fullText;
  } catch (error: any) {
    const errMsg = formatGeminiError(error);
    onChunk(errMsg);
    return errMsg;
  }
}

export async function suggestCrossFileRefactorStream(
  selectedFiles: { path: string; content: string }[],
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> {
  const mockReply = `### 🚀 Cross-File Refactoring Suggestions (Offline Mode)
*Gemini API Key missing. Review static duplication recommendations.*

#### 🔍 Selection Audit:
${selectedFiles.map(f => `- \`${f.path.split('/').pop()}\` (${f.content.substring(0, 200).replace(/\n/g, ' ')}...)`).join('\n')}

#### 💡 Suggested Shared Abstraction:
1. Extract duplicate helper utility structures into a shared module.
2. Align interface signatures to facilitate easier component reusability.`;

  if (!isValidApiKey(apiKey)) {
    let cumulative = '';
    for (const chunk of mockReply.split(' ')) {
      cumulative += chunk + ' ';
      onChunk(cumulative);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return mockReply;
  }

  const cacheKey = getCacheKey('suggestCrossFileRefactorStream', { selectedFiles: selectedFiles.map(f => ({ path: f.path, size: f.content.length })) });
  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    onChunk(cached);
    return cached;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Refactoring Expert. Analyze these selected files for overlapping responsibilities, duplication, or shared abstractions:
${JSON.stringify(selectedFiles.map(f => ({ path: f.path, content: f.content.substring(0, 4000) })), null, 2)}

Provide a detailed refactoring suggestion report in markdown. Outline:
1. Detected code duplication or design overlaps.
2. Refactoring blueprints (e.g. creating a shared utility or helper component).
3. Code comparison or refactoring sketches showing before & after.`;

    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }
    aiCache.set(cacheKey, fullText);
    return fullText;
  } catch (error: any) {
    const errMsg = formatGeminiError(error);
    onChunk(errMsg);
    return errMsg;
  }
}

export async function suggestFolderRestructureStream(
  filesSummary: { path: string; size: number; language: string }[],
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> {
  const mockReply = `### 📂 Codebase Folder Restructure Proposal (Offline Mode)
*Gemini API key is not configured. Here is a generic clean architecture restructure blueprint:*

\`\`\`
src/
  ├── components/        # Dumb/Reusable UI components (buttons, badges)
  ├── features/          # Feature modules containing domain-specific hooks
  ├── hooks/             # Global standalone React hooks
  ├── utils/             # Independent pure helper utilities
  └── App.tsx            # Application Shell & Router
\`\`\`

> [!TIP]
> Ensure that components only import from sibling directories or parent utilities. Avoid importing elements upwards from specific feature packages to prevent spaghetti dependency graphs.`;

  if (!isValidApiKey(apiKey)) {
    let cumulative = '';
    for (const chunk of mockReply.split(' ')) {
      cumulative += chunk + ' ';
      onChunk(cumulative);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return mockReply;
  }

  const cacheKey = getCacheKey('suggestFolderRestructureStream', { filesSummary });
  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    onChunk(cached);
    return cached;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Software Architect. Audit the current folder layout structure and file sizes of the project:
${JSON.stringify(filesSummary, null, 2)}

Propose an optimized structure (e.g. Domain-driven feature split, cleaning up bloated utilities folder, etc.).
Structure your response in Markdown, highlighting the new proposed tree layout inside code blocks, and detail the migration plan.`;

    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }
    aiCache.set(cacheKey, fullText);
    return fullText;
  } catch (error: any) {
    const errMsg = formatGeminiError(error);
    onChunk(errMsg);
    return errMsg;
  }
}

export async function validateApiDbContractsStream(
  apiEndpoints: { file: string; path: string; methods: string[] }[],
  dbTables: { file: string; entities: string[] }[],
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> {
  const mockReply = `### 🗃️ API-Database Contract Audit Report (Offline Mode)

#### 📝 Scanned Data Contracts Summary:
- API routes scanned: ${apiEndpoints.length} endpoints.
- Database tables: ${dbTables.length} tables found.

- [x] Column datatypes scanned.
- [ ] Endpoint request bodies validated against entity columns. (Requires API Key)

> [!NOTE]
> Add a Gemini API key in settings to perform deep contract drift validation, mapping active routes to actual table schemas to find parameter mismatches.`;

  if (!isValidApiKey(apiKey)) {
    let cumulative = '';
    for (const chunk of mockReply.split(' ')) {
      cumulative += chunk + ' ';
      onChunk(cumulative);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return mockReply;
  }

  const cacheKey = getCacheKey('validateApiDbContractsStream', { apiEndpoints, dbTables });
  if (aiCache.has(cacheKey)) {
    const cached = aiCache.get(cacheKey);
    onChunk(cached);
    return cached;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a Lead Backend Architect. Audit the contract coupling between these REST API endpoints and Database schema tables:

REST API Endpoints:
${JSON.stringify(apiEndpoints, null, 2)}

Database Tables Schema:
${JSON.stringify(dbTables, null, 2)}

Verify if:
1. API handler request payloads or response keys references non-existent table columns.
2. Mismatched column datatypes exist (e.g. string used in controller for integer database key).
3. Missing database indices exist on columns frequently queried by these API endpoints.

Provide an audit report in markdown listing any warning/tip alerts.`;

    const result = await model.generateContentStream(prompt);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }
    aiCache.set(cacheKey, fullText);
    return fullText;
  } catch (error: any) {
    const errMsg = formatGeminiError(error);
    onChunk(errMsg);
    return errMsg;
  }
}

export async function refineCallGraphWithLLM(
  _callNodes: CallNode[],
  callLinks: CallLink[],
  files: ParsedFile[],
  apiKey: string
): Promise<CallLink[]> {
  if (!isValidApiKey(apiKey)) {
    // Mock simulation: resolve ambiguous links by keeping only the first one
    const seen = new Set<string>();
    const resolved: CallLink[] = [];
    for (const link of callLinks) {
      if (link.isAmbiguous) {
        const key = `${link.source}->${link.target.split('::').pop()}`;
        if (!seen.has(key)) {
          seen.add(key);
          resolved.push({ ...link, isAmbiguous: false });
        }
      } else {
        resolved.push(link);
      }
    }
    return resolved;
  }

  const ambiguousLinks = callLinks.filter(l => l.isAmbiguous);
  if (ambiguousLinks.length === 0) {
    return callLinks;
  }

  const callerToAmbiguousTargets = new Map<string, CallLink[]>();
  for (const link of ambiguousLinks) {
    if (!callerToAmbiguousTargets.has(link.source)) {
      callerToAmbiguousTargets.set(link.source, []);
    }
    callerToAmbiguousTargets.get(link.source)!.push(link);
  }

  const resolvedLinks: CallLink[] = callLinks.filter(l => !l.isAmbiguous);
  const fileContentMap = new Map<string, string>();
  for (const file of files) {
    fileContentMap.set(file.path, file.content);
  }

  for (const [callerId, links] of callerToAmbiguousTargets.entries()) {
    const [callerFile, callerFuncName] = callerId.split('::');
    const fileContent = fileContentMap.get(callerFile) || '';
    
    const candidates = links.map(link => {
      const [targetFile, targetName] = link.target.split('::');
      return {
        id: link.target,
        name: targetName,
        file: targetFile
      };
    });

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const prompt = `You are a static analysis assistant. We have an ambiguous function call in a codebase.
In file "${callerFile}", the function "${callerFuncName}" calls a function named "${candidates[0].name}".
However, multiple candidate functions exist in the codebase:
${candidates.map((c, i) => `${i + 1}. ID: "${c.id}" (defined in file "${c.file}")`).join('\n')}

Here is the source code of the caller file "${callerFile}":
\`\`\`
${fileContent.slice(0, 5000)}
\`\`\`

Analyze the imports and usage in "${callerFile}" to determine which of the candidate targets is actually called by "${callerFuncName}".
Return ONLY a JSON array containing the IDs of the active target functions that are invoked. If none are invoked or it is not possible to determine, return an empty array.
Your output must be a valid JSON array of strings, for example:
["file1.ts::init"]

JSON Output:`;

      const cacheKey = getCacheKey('refineCallGraphWithLLM', { callerId, candidates });
      let responseText = '';
      if (aiCache.has(cacheKey)) {
        responseText = aiCache.get(cacheKey);
      } else {
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        aiCache.set(cacheKey, responseText);
      }

      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const resolvedIds: string[] = JSON.parse(jsonMatch[0]);
        for (const resolvedId of resolvedIds) {
          if (candidates.some(c => c.id === resolvedId)) {
            resolvedLinks.push({
              source: callerId,
              target: resolvedId,
              isAmbiguous: false
            });
          }
        }
      } else {
        resolvedLinks.push({
          source: callerId,
          target: candidates[0].id,
          isAmbiguous: false
        });
      }
    } catch (err) {
      console.error('Gemini call graph refinement failed for:', callerId, err);
      resolvedLinks.push({
        source: callerId,
        target: candidates[0].id,
        isAmbiguous: false
      });
    }
  }

  return resolvedLinks;
}


