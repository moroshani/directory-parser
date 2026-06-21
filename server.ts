import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "assets",
  ".npm",
  "node_modules_cache",
  ".cache"
]);

const TEXT_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "json", "css", "html", "md", "txt", "yml", "yaml", "xml", "env",
  "gitignore", "example", "sql", "ini", "conf", "sh", "bash", "toml", "lock",
  "pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg", "webp", "gif"
]);

function isTextFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return TEXT_EXTS.has(ext);
}

// Robust Multi-Document parsing & analysis helper (Word, Excel, PPTX, PDF, Images)
async function parseBinaryDocument(filePath: string, extension: string): Promise<{ text: string, type: string, extraData?: any }> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error("File not found");
  }

  try {
    if (extension === "pdf") {
      const pdfImport = await import("pdf-parse") as any;
      const pdfParser = pdfImport.default || pdfImport;
      const dataBuffer = fs.readFileSync(absolutePath);
      const data = await pdfParser(dataBuffer);
      return {
        text: data.text || "",
        type: "pdf"
      };
    }

    if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path: absolutePath });
      return {
        text: result.value || "",
        type: "docx"
      };
    }

    if (extension === "xlsx") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.readFile(absolutePath);
      let text = "";
      const sheets: Record<string, any[][]> = {};
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        text += `\n--- SHEET: ${sheetName} ---\n${csv}\n`;
        sheets[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      }
      return {
        text,
        type: "xlsx",
        extraData: { sheets }
      };
    }

    if (extension === "pptx") {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(absolutePath);
      const zipEntries = zip.getEntries();
      let text = "";
      
      const slideEntries = zipEntries
        .filter(entry => entry.entryName.startsWith("ppt/slides/slide") && entry.entryName.endsWith(".xml"))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.match(/\d+/)?.[0] || "0", 10);
          const numB = parseInt(b.entryName.match(/\d+/)?.[0] || "0", 10);
          return numA - numB;
        });

      slideEntries.forEach((entry, idx) => {
        const slideXml = entry.getData().toString("utf-8");
        const matches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const slideText = matches
          .map(tag => tag.substring(5, tag.length - 6)) // extract text inside tags
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
          
        if (slideText) {
          text += `\n--- SLIDE ${idx + 1} ---\n${slideText}\n`;
        }
      });
      
      return {
        text: text || "This PowerPoint file contains no parsed text in its slides.",
        type: "pptx"
      };
    }

    if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
      const dataBuffer = fs.readFileSync(absolutePath);
      const base64Str = dataBuffer.toString("base64");
      const mimeType = `image/${extension === "jpg" ? "jpeg" : extension}`;
      return {
        text: `[IMAGE PREVIEW: ${path.basename(filePath)}]`,
        type: "image",
        extraData: {
          mimeType,
          base64: `data:${mimeType};base64,${base64Str}`
        }
      };
    }
  } catch (err: any) {
    console.error(`Parser error on file ${filePath}:`, err);
    throw new Error(`Failed to extract document text: ${err?.message || err}`);
  }

  throw new Error("Unsupported file extension");
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  isText: boolean;
  children?: FileNode[];
}

function scanDirectory(dirPath: string, rootDir: string): FileNode[] {
  const result: FileNode[] = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      // Ignore specific hidden/control folders except key config files
      if (item.name.startsWith(".") && item.name !== ".gitignore" && item.name !== ".env.example") {
        if (item.name !== ".env" && item.name !== ".github") {
          continue;
        }
      }
      if (IGNORE_DIRS.has(item.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (item.isDirectory()) {
        const children = scanDirectory(fullPath, rootDir);
        const folderSize = children.reduce((acc, child) => acc + child.size, 0);
        result.push({
          name: item.name,
          path: relativePath,
          isDirectory: true,
          size: folderSize,
          isText: false,
          children
        });
      } else {
        const stats = fs.statSync(fullPath);
        const isText = isTextFile(item.name) || stats.size < 50000; // default medium files as potential text
        result.push({
          name: item.name,
          path: relativePath,
          isDirectory: false,
          size: stats.size,
          isText: isText
        });
      }
    }
  } catch (err) {
    console.error(`Error scanning ${dirPath}:`, err);
  }

  // Sort directories first, then files alphabetically
  return result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Flat list search helper
function getFlatFiles(nodes: FileNode[]): { path: string; name: string; size: number; isText: boolean }[] {
  let list: { path: string; name: string; size: number; isText: boolean }[] = [];
  for (const node of nodes) {
    if (node.isDirectory && node.children) {
      list = list.concat(getFlatFiles(node.children));
    } else {
      list.push({
        path: node.path,
        name: node.name,
        size: node.size,
        isText: node.isText
      });
    }
  }
  return list;
}

// 1. Scan directory structure and return files tree & flat details
app.get("/api/scan", (req, res) => {
  const queryPath = (req.query.path as string) || ".";
  const workspaceRoot = process.cwd();
  const targetDir = path.resolve(workspaceRoot, queryPath);

  // Security check: ensure path resolves inside workspaceRoot or is equal to it
  if (!targetDir.startsWith(workspaceRoot)) {
    return res.status(400).json({ error: "Access outside of workspace is denied." });
  }

  if (!fs.existsSync(targetDir)) {
    return res.status(404).json({ error: `Directory not found: ${queryPath}` });
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: "Target path is not a directory." });
  }

  const tree = scanDirectory(targetDir, workspaceRoot);
  const flatFiles = getFlatFiles(tree);

  res.json({
    currentPath: queryPath,
    absolutePath: targetDir,
    tree,
    flatFiles
  });
});

// 2. Fetch content of a specific file
app.get("/api/file-content", async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: "File path parameter 'path' is required." });
  }

  const workspaceRoot = process.cwd();
  const targetFile = path.resolve(workspaceRoot, filePath);

  // Security check
  if (!targetFile.startsWith(workspaceRoot)) {
    return res.status(400).json({ error: "Access outside of workspace is denied." });
  }

  if (!fs.existsSync(targetFile)) {
    return res.status(404).json({ error: "File not found" });
  }

  const stat = fs.statSync(targetFile);
  if (stat.isDirectory()) {
    return res.status(400).json({ error: "Specified path is a directory, not a file." });
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const BINARY_EXTS = ["pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg", "webp", "gif"];
  const isBinaryType = BINARY_EXTS.includes(ext);

  // For complex binary layout attachments support up to 35MB file parsing
  const maxSizeLimit = isBinaryType ? 35 * 1024 * 1024 : 2 * 1024 * 1024;
  if (stat.size > maxSizeLimit) {
    return res.status(400).json({ error: `File is too large to view directly (Limit: ${isBinaryType ? '35MB' : '2MB'}).` });
  }

  try {
    if (isBinaryType) {
      const parsed = await parseBinaryDocument(filePath, ext);
      return res.json({
        path: filePath,
        contents: parsed.text,
        fileType: parsed.type,
        extraData: parsed.extraData,
        size: stat.size,
        isBinary: true
      });
    }

    const contents = fs.readFileSync(targetFile, "utf-8");
    res.json({ path: filePath, contents, size: stat.size, isBinary: false });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to read file: ${err?.message}` });
  }
});

// 3. Write / Edit code files inside the workspace (Assistant saving capability)
app.post("/api/save-file", (req, res) => {
  const { path: filePath, contents } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: "File path is required." });
  }

  const workspaceRoot = process.cwd();
  const targetFile = path.resolve(workspaceRoot, filePath);

  // Security lock
  if (!targetFile.startsWith(workspaceRoot)) {
    return res.status(400).json({ error: "Cannot write outside workspace scope." });
  }

  try {
    // Create folders recursively if they don't exist
    const parentDir = path.dirname(targetFile);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(targetFile, contents || "", "utf-8");
    res.json({ success: true, message: `Successfully saved file: ${filePath}` });
  } catch (err: any) {
    res.status(500).json({ error: `Save failed: ${err?.message}` });
  }
});

// 4. Content grep / find file text patterns
app.get("/api/grep", (req, res) => {
  const query = (req.query.q as string || "").trim().toLowerCase();
  const currentDir = (req.query.path as string || ".");
  
  if (!query) {
    return res.json({ matches: [] });
  }

  const workspaceRoot = process.cwd();
  const targetDir = path.resolve(workspaceRoot, currentDir);

  if (!targetDir.startsWith(workspaceRoot)) {
    return res.status(400).json({ error: "Access denied." });
  }

  interface GrepMatch {
    filePath: string;
    line: number;
    text: string;
  }

  const matches: GrepMatch[] = [];

  function searchInNodes(dir: string) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith(".") && item.name !== ".gitignore") continue;
        if (IGNORE_DIRS.has(item.name)) continue;

        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          searchInNodes(fullPath);
        } else if (isTextFile(item.name)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          lines.forEach((lineText, index) => {
            if (lineText.toLowerCase().includes(query)) {
              matches.push({
                filePath: path.relative(workspaceRoot, fullPath),
                line: index + 1,
                text: lineText.trim()
              });
            }
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  searchInNodes(targetDir);
  // limit search counts to 100 max
  res.json({ matches: matches.slice(0, 100) });
});

interface Chunk {
  filePath: string;
  text: string;
  startIndex: number;
  lineNumber: number;
  score?: number;
}

// Smart prompt compression engine to strip licensing headers, redundant newlines, and non-essential comments
function compressCodeForPrompt(content: string, filePath: string): { originalLength: number; compressedLength: number; text: string } {
  const originalLength = content.length;
  const lines = content.split("\n");
  const filteredLines: string[] = [];
  
  let isInsideLicenseHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Detect and strip standard top copyright/boilerplate banners
    if (trimmed.startsWith("/*") && i < 20) {
      // Lookahead to see if this is a standard open-source license block
      const inspectBlock = lines.slice(i, i + 15).join("\n").toLowerCase();
      if (
        inspectBlock.includes("copyright") || 
        inspectBlock.includes("license") || 
        inspectBlock.includes("all rights reserved") || 
        inspectBlock.includes("apache") || 
        inspectBlock.includes("author") || 
        inspectBlock.includes("created by")
      ) {
        isInsideLicenseHeader = true;
      }
    }

    if (isInsideLicenseHeader) {
      if (trimmed.endsWith("*/")) {
        isInsideLicenseHeader = false;
      }
      continue; // Skip the license line
    }

    // Skip short double-slash comments that are copyright preambles
    if (trimmed.startsWith("//") && i < 15) {
      const lower = trimmed.toLowerCase();
      if (lower.includes("copyright") || lower.includes("license") || lower.includes("all rights reserved")) {
        continue;
      }
    }

    // 2. Clear short comments that contain no JSDoc types, URL, bugs or TODOs (saves up to 15% tokens)
    if (trimmed.startsWith("//") && trimmed.length < 50) {
      const lower = trimmed.toLowerCase();
      if (!lower.includes("todo") && !lower.includes("http") && !lower.includes("@type") && !lower.includes("bug")) {
        continue;
      }
    }

    // 3. Prevent multiple sequential blank lines (Squeezes lines together)
    if (trimmed === "" && filteredLines.length > 0 && filteredLines[filteredLines.length - 1].trim() === "") {
      continue;
    }

    filteredLines.push(line);
  }

  const compressedText = filteredLines.join("\n").trim();
  
  return {
    originalLength,
    compressedLength: compressedText.length,
    text: compressedText
  };
}

// Standard syntax programming vocabulary to damp scoring weight for higher RAG precision
const PROGRAMMING_SYNTAX_KEYWORDS = new Set([
  "const", "let", "var", "function", "import", "export", "return", "class", "default",
  "from", "extends", "implements", "interface", "public", "private", "protected",
  "for", "while", "if", "else", "try", "catch", "finally", "describe", "it", "test",
  "expect", "div", "span", "className", "void", "string", "number", "boolean", "any", "this"
]);

function chunkFile(filePath: string, content: string, chunkSize: number = 15, chunkOverlap: number = 5): Chunk[] {
  // Compress first to optimize chunks
  const compressed = compressCodeForPrompt(content, filePath);
  const lines = compressed.text.split("\n");
  const chunks: Chunk[] = [];

  for (let i = 0; i < lines.length; i += Math.max(1, (chunkSize - chunkOverlap))) {
    const chunkLines = lines.slice(i, i + chunkSize);
    if (chunkLines.length === 0) break;

    chunks.push({
      filePath,
      text: chunkLines.join("\n"),
      startIndex: i,
      lineNumber: i + 1
    });

    if (i + chunkSize >= lines.length) break;
  }
  return chunks;
}

function scoreChunk(chunk: Chunk, queryTerms: string[]): number {
  let score = 0;
  const chunkLower = chunk.text.toLowerCase();

  for (const term of queryTerms) {
    if (!term || term.length < 2) continue;
    
    // Stop-words / programming template syntax weight dampening
    let termWeight = 1.0;
    if (PROGRAMMING_SYNTAX_KEYWORDS.has(term)) {
      termWeight = 0.05; // heavily penalize generic syntax keywords to promote specific code tokens
    } else {
      termWeight = 2.0; // amplify custom, rare codebase keyword matches (TF-IDF simulation)
    }

    // Exact word count occurrences matching
    const termEscaped = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    try {
      const regex = new RegExp(termEscaped, 'gi');
      const termMatches = chunkLower.match(regex);
      if (termMatches) {
        score += termMatches.length * 15 * termWeight;
      }
    } catch (e) {}

    if (chunkLower.includes(term)) {
      score += 25 * termWeight;
    }
  }
  return score;
}

// 5. RAGLite local Passage query matcher
app.post("/api/raglite-query", (req, res) => {
  const { query, selectedFiles, ragConfig } = req.body;
  if (!query) {
    return res.json({ chunks: [] });
  }

  const workspaceRoot = process.cwd();
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.trim().length > 1);
  
  // Custom RAG configurations passed from user settings in front-end
  const maxChunks = ragConfig?.maxChunks || 8;
  const chunkSize = ragConfig?.chunkSize || 15;
  const chunkOverlap = ragConfig?.chunkOverlap || 5;

  let allChunks: Chunk[] = [];

  if (selectedFiles && Array.isArray(selectedFiles)) {
    for (const relativePath of selectedFiles) {
      const targetFile = path.resolve(workspaceRoot, relativePath);
      if (targetFile.startsWith(workspaceRoot) && fs.existsSync(targetFile)) {
        try {
          const stats = fs.statSync(targetFile);
          if (stats.isFile() && stats.size < 500000) { // Limit larger texts
            const content = fs.readFileSync(targetFile, "utf-8");
            const chunks = chunkFile(relativePath, content, chunkSize, chunkOverlap);
            allChunks = allChunks.concat(chunks);
          }
        } catch (e) {}
      }
    }
  }

  // Score chunk matches on key occurrences
  const scoredChunks = allChunks
    .map(chunk => {
      const score = scoreChunk(chunk, queryTerms);
      return { ...chunk, score };
    })
    .filter(chunk => (chunk.score && chunk.score > 0))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  res.json({ chunks: scoredChunks.slice(0, maxChunks) }); // Top chunk passages
});

// 6. Robust Gemini Call proxy with Directory Context Integration
app.post("/api/chat", async (req, res) => {
  const { messages, selectedFiles, userApiKey, ragMode, ragConfig } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  // Fallback API keys order:
  // 1. User supplied apiKey (via UI fallback field if they brought their own)
  // 2. process.env.GEMINI_API_KEY
  // 3. User's hardcoded premium key provided in the original prompt description
  const finalApiKey = userApiKey || process.env.GEMINI_API_KEY || "AIzaSyBdLEaD52ecKRvJy8rVm64jClztOURZTbE";

  if (!finalApiKey) {
    return res.status(400).json({ error: "No Gemini API key available. Please configure your secrets or input a temporary key." });
  }

  const workspaceRoot = process.cwd();
  let fileContexts = "";
  let ragUsedInfo = "";
  let originalTotalChars = 0;
  let injectedChunks: Chunk[] = [];

  // Custom configuration parsing
  const maxChunks = ragConfig?.maxChunks || 15;
  const chunkSize = ragConfig?.chunkSize || 15;
  const chunkOverlap = ragConfig?.chunkOverlap || 5;

  // Get last query for RAG matching
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content || "";

  const imageFiles: string[] = [];
  const documentFiles: string[] = [];

  if (selectedFiles && Array.isArray(selectedFiles) && selectedFiles.length > 0) {
    for (const relativePath of selectedFiles) {
      const ext = relativePath.split(".").pop()?.toLowerCase() || "";
      if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        imageFiles.push(relativePath);
      } else {
        documentFiles.push(relativePath);
      }
    }

    // 1. Gather original statistics of pre-manipulated files
    for (const relativePath of selectedFiles) {
      const targetFile = path.resolve(workspaceRoot, relativePath);
      if (targetFile.startsWith(workspaceRoot) && fs.existsSync(targetFile)) {
        try {
          const stats = fs.statSync(targetFile);
          if (stats.isFile()) {
            originalTotalChars += stats.size;
          }
        } catch (e) {}
      }
    }

    if (ragMode && lastUserMessage) {
      // PERFORM RAGLITE CHUNKING AND PASSAGE RETRIEVAL
      const queryTerms = lastUserMessage.toLowerCase().split(/\s+/).filter((t: string) => t.trim().length > 1);
      let allChunks: Chunk[] = [];

      for (const relativePath of documentFiles) {
        const targetFile = path.resolve(workspaceRoot, relativePath);
        if (targetFile.startsWith(workspaceRoot) && fs.existsSync(targetFile)) {
          try {
            const stats = fs.statSync(targetFile);
            const ext = relativePath.split(".").pop()?.toLowerCase() || "";
            let content = "";
            
            if (["pdf", "docx", "xlsx", "pptx"].includes(ext)) {
              const parsed = await parseBinaryDocument(relativePath, ext);
              content = parsed.text;
            } else if (stats.size < 1500000) {
              content = fs.readFileSync(targetFile, "utf-8");
            }

            if (content) {
              const chunks = chunkFile(relativePath, content, chunkSize, chunkOverlap);
              allChunks = allChunks.concat(chunks);
            }
          } catch (e) {}
        }
      }

      // Rank chunks
      const ranked = allChunks
        .map(chunk => ({ ...chunk, score: scoreChunk(chunk, queryTerms) }))
        .filter(chunk => (chunk.score && chunk.score > 0))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, maxChunks); // Retrieve customized counts of passages

      injectedChunks = ranked;

      if (ranked.length > 0) {
        ragUsedInfo = `[RAGLite Mode active: Selected top ${ranked.length} most relevant passages matching query "${lastUserMessage.slice(0, 40)}..."]`;
        fileContexts = ranked.map(c => `\n--- SOURCE SEGMENT: ${c.filePath} (starting line ${c.lineNumber}) [Relevance Match score: ${c.score}] ---\n${c.text}\n`).join("\n");
      } else {
        // Fallback to absolute subset if no keywords matched
        ragUsedInfo = `[RAGLite Mode active: No keyword match found. Defaulting to first 3 files standard overview]`;
        const subset = documentFiles.slice(0, 3);
        for (const rPath of subset) {
          const targetFile = path.resolve(workspaceRoot, rPath);
          if (fs.existsSync(targetFile)) {
            const ext = rPath.split(".").pop()?.toLowerCase() || "";
            let content = "";
            if (["pdf", "docx", "xlsx", "pptx"].includes(ext)) {
              const parsed = await parseBinaryDocument(rPath, ext);
              content = parsed.text;
            } else {
              content = fs.readFileSync(targetFile, "utf-8");
            }

            const comp = compressCodeForPrompt(content, rPath);
            fileContexts += `\n--- SOURCE FILE: ${rPath} (First 200 lines compressed) ---\n${comp.text.split("\n").slice(0, 200).join("\n")}\n`;
            
            // Add fallback segment to list of chunk visualizers
            injectedChunks.push({
              filePath: rPath,
              text: comp.text.split("\n").slice(0, 200).join("\n"),
              startIndex: 0,
              lineNumber: 1,
              score: 0
            });
          }
        }
      }
    } else {
      // FULL FILE ATTACHMENTS WITH PURE COMPRESSION
      for (const relativePath of documentFiles) {
        const targetFile = path.resolve(workspaceRoot, relativePath);
        if (targetFile.startsWith(workspaceRoot) && fs.existsSync(targetFile)) {
          try {
            const stat = fs.statSync(targetFile);
            const ext = relativePath.split(".").pop()?.toLowerCase() || "";
            let content = "";
            
            if (["pdf", "docx", "xlsx", "pptx"].includes(ext)) {
              const parsed = await parseBinaryDocument(relativePath, ext);
              content = parsed.text;
            } else if (stat.size < 4000000) {
              content = fs.readFileSync(targetFile, "utf-8");
            }

            if (content) {
              const comp = compressCodeForPrompt(content, relativePath);
              fileContexts += `\n--- SOURCE FILE: ${relativePath} (Full extracted text context) ---\n${comp.text}\n`;

              injectedChunks.push({
                filePath: relativePath,
                text: comp.text,
                startIndex: 0,
                lineNumber: 1,
                score: 100
              });
            }
          } catch (error) {
            console.warn(`Could not read file for context: ${relativePath}`, error);
          }
        }
      }
    }
  }

  // Load image binary content for native multimodal parts passing
  const imageParts: any[] = [];
  for (const imgPath of imageFiles) {
    const targetFile = path.resolve(workspaceRoot, imgPath);
    if (fs.existsSync(targetFile)) {
      try {
        const ext = imgPath.split(".").pop()?.toLowerCase() || "png";
        const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
        const buffer = fs.readFileSync(targetFile);
        const base64Str = buffer.toString("base64");
        imageParts.push({
          inlineData: {
            mimeType,
            data: base64Str
          }
        });
      } catch (e) {
        console.warn(`Failed to package image for Gemini: ${imgPath}`, e);
      }
    }
  }

  // Final token counts stats
  const finalPromptChars = fileContexts.length;
  const charsSaved = Math.max(0, originalTotalChars - finalPromptChars);
  const ratioSaved = originalTotalChars > 0 ? Math.round((charsSaved / originalTotalChars) * 100) : 0;

  try {
    const ai = new GoogleGenAI({
      apiKey: finalApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const activeModel = "gemini-3.5-flash";

    // System instruction defining chatbot's role & directory contexts
    const systemInstruction = `You are an expert Directory Reader & Workspace Code Assistant.
The user is working in the codebase directory.
Here is the selected context indexed from their local directory. It contains real files or matched passages from the workspace:
======================
LOCAL FILE CONTENT CONTEXT: ${ragUsedInfo}
${fileContexts || "(No files selected. Instruct the user to select files in the sidebar tree if they want direct answers about their files.)"}
======================
${imageFiles.length > 0 ? `Also, the user has selected and attached ${imageFiles.length} visual images matching their workspace context. Gemini has loaded these image streams natively. Use them to answer UI design, visual mockups, or chart structure questions.` : ""}

Your Goal:
- Fully understand the files/contents/passages/images shown above.
- Answer user questions with supreme precision, code explanations, or architectural guidance.
- If the user asks about specific features or bugs in these files, inspect the exact file source matched.
- Keep answers professional, concise, with helpful code snippets formatted beautifully in markdown. Do not manufacture files or assume logic that is contradictory to the sources given.`;

    // Map history to Google GenAI format:
    // { role: 'user' | 'model', parts: [{ text: string }] }
    const formattedContents = messages.map((m: any, idx: number) => {
      // Standardize role name
      const role = m.role === "assistant" || m.role === "model" ? "model" : "user";
      const isLastUserMsg = idx === messages.length - 1 || (idx === messages.map(msg => msg.role).lastIndexOf("user"));

      // Attach native multi-modal images to latest user request for Gemini to inspect visually!
      if (role === "user" && isLastUserMsg && imageParts.length > 0) {
        return {
          role,
          parts: [
            ...imageParts,
            { text: m.content }
          ]
        };
      }

      return {
        role,
        parts: [{ text: m.content }],
      };
    });

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.2, // lower temperature for high factual accuracy on codebase query
      }
    });

    const answer = response.text || "(No response generated)";
    res.json({ 
      response: answer, 
      promptStats: { 
        originalTotalChars, 
        finalPromptChars, 
        ratioSaved 
      },
      injectedChunks
    });

  } catch (err: any) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err?.message || "An error occurred calling Gemini." });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
