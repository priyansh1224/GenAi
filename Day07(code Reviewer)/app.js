import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs/promises"; // FIXED: Changed to fs/promises for async operations
import path from "path";

// Load environment variables
dotenv.config();

// Validate API key exists
if (!process.env.GOOGLE_API_KEY) {
   console.error("ERROR: GOOGLE_API_KEY is not set in your .env file");
   process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// ============================================================
// TOOL FUNCTIONS
// ============================================================

/**
 * Lists all supported files in a directory recursively
 */
async function listFiles({ directory }) {
   const files = [];
   const extensions = [
      // Web
      ".html", ".htm", ".css", ".scss", ".sass", ".less",
      // JavaScript / TypeScript
      ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
      // Config
      ".json", ".yaml", ".yml", ".toml",
      // Templating
      ".ejs", ".hbs", ".pug",
      // Markdown
      ".md",
      // Environment (to catch hardcoded secrets)
      ".env.example",
   ];

   const skipDirs = [
      "node_modules", "dist", "build", ".git",
      ".next", ".nuxt", ".output", "coverage",
      "__pycache__", ".cache", ".parcel-cache",
      "vendor", "bower_components", ".code-review-backups" // FIXED: Added .code-review-backups to skipDirs
   ];

   async function scan(dir) { // FIXED: Made scan async
      let items;
      try {
         items = await fs.readdir(dir); // FIXED: Used fs.promises.readdir
      } catch (err) {
         console.warn(`Warning: Cannot read directory "${dir}": ${err.message}`);
         return;
      }

      for (const item of items) {
         const fullPath = path.join(dir, item);

         // Skip unwanted directories
         if (skipDirs.some((skip) => item === skip)) continue; // FIXED: Corrected logic and used item for comparison

         let stat;
         try {
            stat = await fs.stat(fullPath); // FIXED: Used fs.promises.stat
         } catch (err) {
            console.warn(`Warning: Cannot stat "${fullPath}": ${err.message}`);
            continue;
         }

         if (stat.isDirectory()) {
            await scan(fullPath); // FIXED: Await recursive call
         } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (extensions.includes(ext)) {
               files.push(fullPath);
            }
         }
      }
   }

   // Validate directory exists
   try { // FIXED: Added try-catch for existsSync check
       const exists = await fs.access(directory).then(() => true).catch(() => false);
       if (!exists) {
           const errMsg = `Directory "${directory}" does not exist`;
           console.error(errMsg);
           return { error: errMsg, files: [] };
       }
   } catch (err) {
       console.error(`Error checking directory existence: ${err.message}`);
       return { error: err.message, files: [] };
   }


   await scan(directory); // FIXED: Await initial scan
   console.log(`Found ${files.length} files in "${directory}"`);
   return { files, count: files.length };
}

/**
 * Reads content of a single file
 */
async function readFile({ file_path }) { // FIXED: Consistent parameter name file_path
   try {
      const exists = await fs.access(file_path).then(() => true).catch(() => false); // FIXED: Used fs.promises.access
      if (!exists) {
         const errMsg = `File "${file_path}" does not exist`;
         console.error(errMsg);
         return { error: errMsg };
      }

      const stat = await fs.stat(file_path); // FIXED: Used fs.promises.stat

      // Prevent reading huge files (limit: 1MB)
      const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // FIXED: Used named constant
      if (stat.size > MAX_FILE_SIZE_BYTES) {
         const errMsg = `File "${file_path}" is too large (${(stat.size / 1024).toFixed(1)}KB). Skipping.`;
         console.warn(errMsg);
         return { error: errMsg };
      }

      const content = await fs.readFile(file_path, "utf8"); // FIXED: Used fs.promises.readFile
      const lineCount = content.split("\n").length;
      console.log(`Reading: ${file_path} (${lineCount} lines)`);

      return {
         content,
         file_path,
         line_count: lineCount,
         size_bytes: stat.size,
         extension: path.extname(file_path),
      };
   } catch (err) {
      console.error(`Error reading "${file_path}": ${err.message}`);
      return { error: err.message };
   }
}

/**
 * Writes content to a file (creates backup first)
 */
async function writeFile({ file_path, content }) { // FIXED: Consistent parameter name file_path
   try {
      // Create backup of original file before modifying
      const fileExists = await fs.access(file_path).then(() => true).catch(() => false); // FIXED: Used fs.promises.access
      if (fileExists) {
         const backupDir = path.join(path.dirname(file_path), ".code-review-backups");
         try {
             await fs.mkdir(backupDir, { recursive: true }); // FIXED: Used fs.promises.mkdir
         } catch (mkdirErr) {
             // Ignore if directory already exists
         }


         const timestamp = Date.now();
         const backupName = `${path.basename(file_path)}.${timestamp}.bak`;
         const backupPath = path.join(backupDir, backupName);

         await fs.copyFile(file_path, backupPath); // FIXED: Used fs.promises.copyFile
         console.log(`Backup created: ${backupPath}`);
      }

      // Ensure parent directory exists
      const dir = path.dirname(file_path);
      try {
          await fs.mkdir(dir, { recursive: true }); // FIXED: Used fs.promises.mkdir
      } catch (mkdirErr) {
          // Ignore if directory already exists
      }

      await fs.writeFile(file_path, content, "utf8"); // FIXED: Used fs.promises.writeFile
      const lineCount = content.split("\n").length;
      console.log(`Fixed: ${file_path} (${lineCount} lines written)`);

      return { success: true, file_path, lines_written: lineCount };
   } catch (err) {
      console.error(`Error writing "${file_path}": ${err.message}`);
      return { success: false, error: err.message };
   }
}

/**
 * Reads multiple files at once (batch operation)
 */
async function readMultipleFiles({ file_paths }) {
   const results = {};
   // FIXED: Use Promise.all for parallel reading
   const readPromises = file_paths.map(async (filePath) => {
       results[filePath] = await readFile({ file_path: filePath });
   });
   await Promise.all(readPromises);
   console.log(`Batch read: ${file_paths.length} files`);
   return results;
}

/**
 * Gets project info — package.json, config files etc.
 */
async function getProjectInfo({ directory }) {
   const info = {
      has_package_json: false,
      has_tsconfig: false,
      has_eslint: false,
      has_prettier: false,
      has_git: false,
      has_env: false,
      has_env_example: false,
      dependencies: {},
      dev_dependencies: {},
      scripts: {},
      project_type: "unknown",
   };

   try {
      // Helper to check file existence asynchronously
      const checkFileExists = async (filePath) => {
          try {
              await fs.access(filePath);
              return true;
          } catch {
              return false;
          }
      };

      // Check for common config files
      info.has_package_json = await checkFileExists(path.join(directory, "package.json"));
      info.has_tsconfig = await checkFileExists(path.join(directory, "tsconfig.json"));
      info.has_git = await checkFileExists(path.join(directory, ".git"));
      info.has_env = await checkFileExists(path.join(directory, ".env"));
      info.has_env_example = await checkFileExists(path.join(directory, ".env.example"));

      // Check for eslint config (multiple possible filenames)
      const eslintFiles = [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs"];
      info.has_eslint = await Promise.all(eslintFiles.map(f => checkFileExists(path.join(directory, f)))).then(results => results.some(r => r));

      // Check for prettier config
      const prettierFiles = [".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js"];
      info.has_prettier = await Promise.all(prettierFiles.map(f => checkFileExists(path.join(directory, f)))).then(results => results.some(r => r));

      // Read package.json for more details
      if (info.has_package_json) {
         const pkgContent = await fs.readFile(path.join(directory, "package.json"), "utf8"); // FIXED: Used fs.promises.readFile
         const pkg = JSON.parse(pkgContent);

         info.dependencies = pkg.dependencies || {};
         info.dev_dependencies = pkg.devDependencies || {};
         info.scripts = pkg.scripts || {};

         // Detect project type
         const allDeps = { ...info.dependencies, ...info.dev_dependencies };
         if (allDeps["next"]) info.project_type = "Next.js";
         else if (allDeps["nuxt"]) info.project_type = "Nuxt.js";
         else if (allDeps["react"]) info.project_type = "React";
         else if (allDeps["vue"]) info.project_type = "Vue";
         else if (allDeps["@angular/core"]) info.project_type = "Angular";
         else if (allDeps["svelte"]) info.project_type = "Svelte";
         else if (allDeps["express"]) info.project_type = "Express/Node";
         else if (allDeps["fastify"]) info.project_type = "Fastify/Node";
         else if (info.has_tsconfig) info.project_type = "TypeScript";
         else info.project_type = "JavaScript";
      }

      console.log(`Project info: ${info.project_type} project`);
      return info;
   } catch (err) {
      console.error(`Error getting project info: ${err.message}`);
      return { ...info, error: err.message };
   }
}

/**
 * Creates a new file (only if it doesn't exist)
 */
async function createFile({ file_path, content }) {
   try {
      const fileExists = await fs.access(file_path).then(() => true).catch(() => false); // FIXED: Used fs.promises.access
      if (fileExists) {
         return { success: false, error: `File "${file_path}" already exists. Use write_file to overwrite.` };
      }

      const dir = path.dirname(file_path);
      try {
          await fs.mkdir(dir, { recursive: true }); // FIXED: Used fs.promises.mkdir
      } catch (mkdirErr) {
          // Ignore if directory already exists
      }

      await fs.writeFile(file_path, content, "utf8"); // FIXED: Used fs.promises.writeFile
      console.log(`Created: ${file_path}`);
      return { success: true, file_path };
   } catch (err) {
      console.error(`Error creating "${file_path}": ${err.message}`);
      return { success: false, error: err.message };
   }
}

/**
 * Deletes a file (moves to backup instead of permanent delete)
 */
async function deleteFile({ file_path }) {
   try {
      const fileExists = await fs.access(file_path).then(() => true).catch(() => false); // FIXED: Used fs.promises.access
      if (!fileExists) {
         return { success: false, error: `File "${file_path}" does not exist` };
      }

      // Move to backup instead of deleting
      const backupDir = path.join(path.dirname(file_path), ".code-review-backups");
      try {
          await fs.mkdir(backupDir, { recursive: true }); // FIXED: Used fs.promises.mkdir
      } catch (mkdirErr) {
          // Ignore if directory already exists
      }

      const timestamp = Date.now();
      const backupName = `${path.basename(file_path)}.${timestamp}.deleted`;
      const backupPath = path.join(backupDir, backupName);

      await fs.rename(file_path, backupPath); // FIXED: Used fs.promises.rename
      console.log(`Deleted (moved to backup): ${file_path}`);
      return { success: true, backup_path: backupPath };
   } catch (err) {
      console.error(`Error deleting "${file_path}": ${err.message}`);
      return { success: false, error: err.message };
   }
}

/**
 * Renames / moves a file
 */
async function renameFile({ old_path, new_path }) {
   try {
      const oldFileExists = await fs.access(old_path).then(() => true).catch(() => false); // FIXED: Used fs.promises.access
      if (!oldFileExists) {
         return { success: false, error: `File "${old_path}" does not exist` };
      }
      const newFileExists = await fs.access(new_path).then(() => true).catch(() => false); // FIXED: Used fs.promises.access
      if (newFileExists) {
         return { success: false, error: `File "${new_path}" already exists` };
      }

      const dir = path.dirname(new_path);
      try {
          await fs.mkdir(dir, { recursive: true }); // FIXED: Used fs.promises.mkdir
      } catch (mkdirErr) {
          // Ignore if directory already exists
      }

      await fs.rename(old_path, new_path); // FIXED: Used fs.promises.rename
      console.log(`Renamed: ${old_path} → ${new_path}`);
      return { success: true, old_path, new_path };
   } catch (err) {
      console.error(`Error renaming: ${err.message}`);
      return { success: false, error: err.message };
   }
}

// ============================================================
// TOOL REGISTRY
// ============================================================

const tools = {
   list_files: listFiles,
   read_file: readFile,
   write_file: writeFile,
   read_multiple_files: readMultipleFiles,
   get_project_info: getProjectInfo,
   create_file: createFile,
   delete_file: deleteFile,
   rename_file: renameFile,
};

// ============================================================
// TOOL DECLARATIONS (for Gemini)
// ============================================================

const toolDeclarations = [
   {
      name: "list_files",
      description: "Recursively list all supported source files (JS, TS, HTML, CSS, JSON, YAML, etc.) in a directory, skipping node_modules and build folders.",
      parameters: {
         type: Type.OBJECT,
         properties: {
            directory: {
               type: Type.STRING,
               description: "Directory path to scan",
            },
         },
         required: ["directory"],
      },
   },
   {
      name: "read_file",
      description: "Read the content of a single file. Returns content, line count, and file size.",
      parameters: {
         type: Type.OBJECT,
         properties: {
            file_path: {
               type: Type.STRING,
               description: "Path of the file to read",
            },
         },
         required: ["file_path"],
      },
   },
   {
      name: "write_file",
      description: "Write content to a file. Automatically creates a backup of the original file before overwriting.",
      parameters: {
         type: Type.OBJECT,
         properties: {
            file_path: {
               type: Type.STRING,
               description: "Path of the file to write",
            },
            content: {
               type: Type.STRING,
               description: "Full content to write to the file",
            },
         },
         required: ["file_path", "content"],
      },
   },
   {
      name: "read_multiple_files",
      description: "Read multiple files at once. More efficient than calling read_file multiple times.",
      parameters: {
         type: Type.OBJECT,
         properties: {
            file_paths: {
               type: Type.ARRAY,
               items: { type: Type.STRING },
               description: "Array of file paths to read",
            },
         },
         required: ["file_paths"],
      },
   },
   {
      name: "get_project_info",
      description: "Get project metadata: package.json info, project type (React/Vue/Angular/Express etc.), dependencies, available scripts, and config files present.",
      parameters: {
         type: Type.OBJECT,
         properties: {
            directory: {
               type: Type.STRING,
               description: "Root directory of the project",
            },
         },
         required: ["directory"],
      },
   },
   {
      name: "create_file",
      description: "Create a new file. Fails if the file already exists (use write_file to overwrite existing files).",
      parameters: {
         type: Type.OBJECT,
         properties: {
            file_path: {
               type: Type.STRING,
               description: "Path for the new file",
            },
            content: {
               type: Type.STRING,
               description: "Content for the new file",
            },
         },
         required: ["file_path", "content"],
      },
   },
   {
      name: "delete_file",
      description: "Delete a file by moving it to a backup folder (safe delete, can be recovered).",
      parameters: {
         type: Type.OBJECT,
         properties: {
            file_path: {
               type: Type.STRING,
               description: "Path of the file to delete",
            },
         },
         required: ["file_path"],
      },
   },
   {
      name: "rename_file",
      description: "Rename or move a file from one path to another.",
      parameters: {
         type: Type.OBJECT,
         properties: {
            old_path: {
               type: Type.STRING,
               description: "Current file path",
            },
            new_path: {
               type: Type.STRING,
               description: "New file path",
            },
         },
         required: ["old_path", "new_path"],
      },
   },
];

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are an expert full-stack code reviewer and fixer. You review and FIX real code issues across all web technologies.

## YOUR WORKFLOW:
1. Use get_project_info to understand the project structure and type.
2. Use list_files to get all source files in the directory.
3. Use read_file or read_multiple_files to read file contents.
4. Analyze every file thoroughly for ALL issue categories below.
5. Use write_file to fix every issue you find (write the corrected full file content).
6. If a missing file is needed (e.g., .gitignore, .env.example), use create_file.
7. After fixing everything, respond with a detailed summary report.

## ISSUE CATEGORIES TO CHECK:

### HTML Issues:
- Missing or incorrect DOCTYPE
- Missing meta tags (charset, viewport, description, og tags)
- Non-semantic HTML (div soup instead of header/main/section/article/footer/nav)
- Missing alt attributes on images
- Missing form labels and accessibility attributes (aria-*)
- Broken or empty href/src attributes
- Inline styles that should be in CSS
- Missing lang attribute on <html>
- Unclosed or improperly nested tags
- Missing title tag
- Forms without proper validation attributes
- Tables without proper headers (th, scope)
- Missing rel="noopener noreferrer" on target="_blank" links
- Deprecated HTML tags (center, font, marquee, etc.)

### CSS Issues:
- Syntax errors and invalid properties
- Duplicate selectors and redundant rules
- Missing vendor prefixes for properties that need them
- Using px where rem/em would be better for accessibility
- Missing fallback fonts in font-family
- Overly specific selectors (reduce specificity)
- !important overuse
- Deprecated properties
- Missing box-sizing: border-box
- Color contrast issues (if detectable)
- Z-index management issues
- Unused CSS classes (if cross-referencing with HTML)
- Missing responsive design / media queries
- Hardcoded colors that should be CSS variables

### JavaScript / TypeScript Issues:
**Bugs:**
- Null/undefined reference errors (missing null checks)
- Missing return statements
- Type coercion bugs (== instead of ===)
- Off-by-one errors in loops
- Async/await without try-catch
- Missing error handling in promises (.catch)
- Race conditions
- Memory leaks (event listeners not cleaned up)
- Incorrect use of closures in loops
- Variable shadowing

**Security:**
- Hardcoded API keys, passwords, tokens, secrets
- Use of eval(), Function(), setTimeout/setInterval with strings
- innerHTML usage (XSS risk) — suggest textContent or sanitization
- Missing input validation/sanitization
- SQL injection patterns
- Path traversal vulnerabilities
- Insecure random number generation (Math.random for security)
- Missing CORS configuration
- Sensitive data in localStorage
- Missing Content Security Policy headers
- Prototype pollution risks

**Code Quality:**
- console.log/debug/warn statements left in production code
- Unused variables, functions, imports
- Functions that are too long (>50 lines)
- Deeply nested code (>3 levels)
- Magic numbers (should be named constants)
- Poor variable/function naming
- Missing error handling
- Code duplication
- Missing JSDoc comments on exported functions
- var usage (should be const/let)
- Callback hell (should use async/await)
- Missing semicolons (if project uses them)
- Inconsistent formatting

**Performance:**
- Synchronous file operations in server code (use async)
- Missing debounce/throttle on frequent events
- DOM queries inside loops
- Large bundle imports (import entire library vs specific module)
- Missing lazy loading for images/components
- N+1 query patterns

### JSON Issues:
- Syntax errors (trailing commas, missing quotes)
- package.json: missing required fields, outdated patterns
- tsconfig.json: suboptimal compiler options

### Environment / Config Issues:
- .env files committed to git (should be in .gitignore)
- Missing .env.example file
- Missing .gitignore entries (node_modules, dist, .env, etc.)

## RULES:
- ACTUALLY FIX THE CODE. Do not just report issues — write the corrected file.
- Preserve the original code style and formatting as much as possible.
- Add comments (// FIXED: description) next to significant changes.
- Do NOT remove functionality — only fix and improve.
- If you're unsure about a change, err on the side of safety.
- For security fixes, add a comment explaining the vulnerability.

## FINAL SUMMARY FORMAT:
After all fixes, provide a report like:

📋 CODE REVIEW COMPLETE
========================

📁 Project Type: [type]
📄 Files Reviewed: [count]
🔧 Files Modified: [count]
🐛 Issues Fixed: [count]

🔒 SECURITY FIXES:
- [file]:[line] — [description]

🐛 BUG FIXES:
- [file]:[line] — [description]

🎨 HTML/CSS FIXES:
- [file]:[line] — [description]

✨ CODE QUALITY IMPROVEMENTS:
- [file]:[line] — [description]

⚡ PERFORMANCE IMPROVEMENTS:
- [file]:[line] — [description]

📝 FILES CREATED:
- [file] — [reason]

⚠️ MANUAL REVIEW RECOMMENDED:
- [items that need human judgment]
`;

// ============================================================
// AGENT LOOP
// ============================================================

export async function runAgent(directoryPath) {
   console.log("=".repeat(60));
   console.log("  CODE REVIEW AGENT");
   console.log("=".repeat(60));
   console.log(`Target directory: ${path.resolve(directoryPath)}`);
   console.log(`Started at: ${new Date().toLocaleString()}`);
   console.log("=".repeat(60));
   console.log();

   const history = [
      {
         role: "user",
         parts: [
            {
               text: `Review and fix all code in the directory: "${directoryPath}". \nStart by getting the project info, then list all files, read them, analyze for ALL issue categories, fix everything you find, and provide a complete summary report.`,
            },
         ],
      },
   ];

   let iteration = 0;
   const MAX_ITERATIONS = 50; // Safety limit to prevent infinite loops

   while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`\n--- Iteration ${iteration} ---`);

      let result;
      try {
         result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: history,
            config: {
               systemInstruction: SYSTEM_PROMPT,
               tools: [
                  {
                     functionDeclarations: toolDeclarations,
                  },
               ],
            },
         });
      } catch (err) {
         console.error(`\nAPI Error: ${err.message}`);

         // Retry logic for transient errors
         if (err.message.includes("429") || err.message.includes("rate")) {
            console.log("Rate limited. Waiting 10 seconds before retry...");
            await new Promise((resolve) => setTimeout(resolve, 10000));
            continue;
         }
         if (err.message.includes("500") || err.message.includes("503")) {
            console.log("Server error. Waiting 5 seconds before retry...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
         }

         console.error("Fatal API error. Exiting.");
         break;
      }

      // Check for function calls
      const functionCalls = result.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
         // Push the model's response (all function calls) into history
         history.push({
            role: "model",
            parts: functionCalls.map((fc) => ({ functionCall: fc })),
         });

         // Execute all function calls and collect responses
         const functionResponseParts = [];

         for (const functionCall of functionCalls) {
            const { name, args } = functionCall;
            console.log(`  → ${name}(${JSON.stringify(args).substring(0, 100)}${JSON.stringify(args).length > 100 ? "..." : ""})`);

            if (!tools[name]) {
               console.error(`  ✗ Unknown tool: ${name}`);
               functionResponseParts.push({
                  functionResponse: {
                     name,
                     response: { error: `Unknown tool: ${name}` },
                  },
               });
               continue;
            }

            try {
               const toolResponse = await tools[name](args);
               functionResponseParts.push({
                  functionResponse: {
                     name,
                     response: { result: toolResponse },
                  },
               });
            } catch (err) {
               console.error(`  ✗ Error in ${name}: ${err.message}`);
               functionResponseParts.push({
                  functionResponse: {
                     name,
                     response: { error: err.message },
                  },
               });
            }
         }

         // Push all responses as a single user message
         history.push({
            role: "user",
            parts: functionResponseParts,
         });
      } else {
         // No function calls — this is the final text response
         const finalText = result.text || "Review complete. No summary provided.";
         console.log("\n" + "=".repeat(60));
         console.log(finalText);
         console.log("=".repeat(60));
         console.log(`\nCompleted at: ${new Date().toLocaleString()}`);
         console.log(`Total iterations: ${iteration}`);
         break;
      }
   }

   if (iteration >= MAX_ITERATIONS) {
      console.error(`\nAgent reached maximum iterations (${MAX_ITERATIONS}). Stopping.`);
   }
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

const directory = process.argv[2] || ".";

// Validate the directory
async function validateAndRun() { // FIXED: Wrapped CLI entry in an async 
// function for await fs.access
    try {
        const exists = await fs.access(directory).then(() => true).catch(() => false);
        if (!exists) {

            console.error(`Error: Directory "${directory}" does not exist.`);
            console.log("Usage: node index.js <directory-path>");
            console.log("Example: node index.js ../my-project");
            process.exit(1);

        }

        const stat = await fs.stat(directory); // FIXED: Used fs.promises.stat
        if (!stat.isDirectory()) {

            console.error(`Error: "${directory}" is not a directory.`);
            process.exit(1);
            
        }

        await runAgent(directory);
    } catch (err) {
        console.error(`Fatal error during CLI startup: ${err.message}`);
        process.exit(1);
    }
}

validateAndRun(); // FIXED: Call the async validation and run function

