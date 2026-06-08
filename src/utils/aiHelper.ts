import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = 'gemini-3.5-flash';

// Simple check if API key exists and is valid format
export function isValidApiKey(key: string): boolean {
  return key.trim().length > 10;
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
    return result.response.text();
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return `### ⚠️ AI Processing Failed
Failed to fetch explanation from Gemini. Error: ${error.message || error}`;
  }
}

export async function generateOnboardingGuide(
  filesSummary: { path: string; language: string; size: number }[],
  apiKey: string
): Promise<string> {
  if (!isValidApiKey(apiKey)) {
    return `### 🚀 Quickstart & Onboarding Guide (Demo)

#### 📦 Project Overview
This repository contains ${filesSummary.length} files across languages like **${Array.from(new Set(filesSummary.map(f => f.language))).join(', ')}**.

#### 🛠️ Getting Started
1. Clone the project locally.
2. Run \`npm install\` to pull core dependencies.
3. Launch the development workspace via \`npm run dev\`.
4. Ensure environment credentials are set up.

*Add your Gemini API Key in the settings tab to generate a fully detailed, custom guide for this specific codebase.*`;
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
    return result.response.text();
  } catch (error: any) {
    return `### ⚠️ Failed to Generate Onboarding Guide\nError: ${error.message}`;
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
    return result.response.text();
  } catch (error: any) {
    return `### ⚠️ Failed to Generate Architecture Overview\nError: ${error.message}`;
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
    return result.response.text();
  } catch (error: any) {
    return `⚠️ Chat request failed. Error: ${error.message}`;
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
    return `### 💡 Mock Refactoring Suggestion (Offline Mode)

**File:** \`${filePath}\`
**Smell:** *${smellMessage}* (${smellDetails})

*To get actual AI suggestions, please add your Gemini API Key in the settings.*

Here is a general refactoring tip:
1. **Extract Method / Function**: Break down the long block of logic into smaller, self-contained functions.
2. **Remove Duplicate Code**: If a block of code appears in multiple places, extract it to a shared helper.
3. **Use Descriptors**: Use clear parameter names and extract complex nested conditionals into descriptive variables.`;
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
    return result.response.text();
  } catch (error: any) {
    return `### ⚠️ AI Refactoring Failed
Error: ${error.message || error}`;
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
    return result.response.text();
  } catch (error: any) {
    return `### ⚠️ Failed to Generate Test Suite
Error: ${error.message || error}`;
  }
}

