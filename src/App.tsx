import { useEffect, useState } from "react";
import { FileNode, FlatFile, Message, ScanResponse } from "./types";
import FileTree from "./components/FileTree";
import ChatPanel from "./components/ChatPanel";
import FileInspector from "./components/FileInspector";
import { 
  FolderSearch, 
  RefreshCw, 
  FileCheck, 
  Trash2,
  Lock,
  Globe,
  Settings,
  X,
  AlertTriangle,
  FolderMinus,
  CheckCheck,
  Search,
  Code2,
  FilePlus,
  Terminal,
  Download,
  Copy,
  ChevronRight,
  BookOpen,
  Sparkles
} from "lucide-react";

export default function App() {
  // Advanced features state
  const [ragliteMode, setRagliteMode] = useState<boolean>(true);
  const [grepQuery, setGrepQuery] = useState<string>("");
  const [grepMatches, setGrepMatches] = useState<any[]>([]);
  const [isSearchingGrep, setIsSearchingGrep] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"explorer" | "grep" | "windows">("explorer");

  // Create file states
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);
  const [newFilePath, setNewFilePath] = useState<string>("");
  const [newFileContent, setNewFileContent] = useState<string>("");

  // Scanned context states
  const [targetPath, setTargetPath] = useState<string>(".");
  const [activeScannedPath, setActiveScannedPath] = useState<string>(".");
  const [tree, setTree] = useState<FileNode[]>([]);
  const [flatFiles, setFlatFiles] = useState<FlatFile[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Selection contexts
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set<string>());
  
  // Messaging contexts
  const [messages, setMessages] = useState<Message[]>([]);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem("workspace_custom_api_key") || "";
  });
  const [showKeyField, setShowKeyField] = useState<boolean>(false);
  const [lastPromptStats, setLastPromptStats] = useState<{ originalTotalChars: number; finalPromptChars: number; ratioSaved: number } | null>(null);

  // Advanced dynamic RAG configuration params
  const [ragMaxChunks, setRagMaxChunks] = useState<number>(15);
  const [ragChunkSize, setRagChunkSize] = useState<number>(15);
  const [ragChunkOverlap, setRagChunkOverlap] = useState<number>(5);
  const [showRagConfig, setShowRagConfig] = useState<boolean>(false);

  // Injected matched chunks inspector visualizer tracker
  const [injectedChunks, setInjectedChunks] = useState<any[]>([]);
  const [showInjectedChunks, setShowInjectedChunks] = useState<boolean>(false);

  // Grep helper
  const triggerGrepSearch = (query: string = grepQuery) => {
    if (!query.trim()) return;
    setIsSearchingGrep(true);
    fetch(`/api/grep?q=${encodeURIComponent(query)}&path=${encodeURIComponent(activeScannedPath)}`)
      .then(res => res.json())
      .then(data => {
        setGrepMatches(data.matches || []);
      })
      .catch(e => console.error(e))
      .finally(() => setIsSearchingGrep(false));
  };

  // Create file helper
  const handleSaveNewFile = () => {
    if (!newFilePath.trim()) return;
    fetch("/api/save-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: newFilePath, contents: newFileContent })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
        } else {
          setIsCreatingFile(false);
          setNewFilePath("");
          setNewFileContent("");
          scanTargetDirectory(activeScannedPath); // Rescan
        }
      });
  };

  // Loadings and errors
  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(false);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  
  // File inspection focus
  const [inspectedFilePath, setInspectedFilePath] = useState<string | null>(null);

  // Trigger directory scan
  const scanTargetDirectory = (pathToScan: string = targetPath) => {
    setIsLoadingTree(true);
    setGeneralError(null);
    
    // Default to workspace root if empty
    const normalizedPath = pathToScan.trim() || ".";

    fetch(`/api/scan?path=${encodeURIComponent(normalizedPath)}`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((data) => {
            throw new Error(data.error || "Failed to scan filesystem path.");
          });
        }
        return res.json();
      })
      .then((data: ScanResponse) => {
        setTree(data.tree);
        setFlatFiles(data.flatFiles);
        setActiveScannedPath(data.currentPath);
        
        // Auto-select text config/source files that have size < 20KB for immediate convenient boarding context
        const autoSelected = new Set<string>();
        data.flatFiles.forEach((file) => {
          // If it is code/source file and small (under 20KB)
          const ext = file.path.split(".").pop()?.toLowerCase();
          const isSourceCode = ["ts", "tsx", "js", "jsx", "json", "html", "css", "md", "yml", "yaml", "env", "gitignore"].includes(ext || "");
          if (file.isText && isSourceCode && file.size < 20000) {
            autoSelected.add(file.path);
          }
        });
        setSelectedFiles(autoSelected);
      })
      .catch((err: any) => {
        console.error("Scanning Error:", err);
        setGeneralError(err?.message || "An unexpected error occurred during filesystem scan.");
      })
      .finally(() => {
        setIsLoadingTree(false);
      });
  };

  // Perform initial scan on load
  useEffect(() => {
    scanTargetDirectory(".");
  }, []);

  // Save custom key in localstorage
  const handleSaveApiKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("workspace_custom_api_key", key);
  };

  // Checkbox toggle handler
  const handleToggleFileSelection = (filePath: string) => {
    const updated = new Set(selectedFiles);
    if (updated.has(filePath)) {
      updated.delete(filePath);
    } else {
      updated.add(filePath);
    }
    setSelectedFiles(updated);
  };

  // Select all visible matching text files
  const handleSelectAllText = () => {
    const updated = new Set(selectedFiles);
    flatFiles.forEach((file) => {
      if (file.isText) {
        // filter by search term if active
        if (searchTerm) {
          if (file.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            updated.add(file.path);
          }
        } else {
          updated.add(file.path);
        }
      }
    });
    setSelectedFiles(updated);
  };

  // Deselect all files action
  const handleDeselectAll = () => {
    setSelectedFiles(new Set<string>());
  };

  // Sending a chat message to proxy backend server
  const handleSendChatMessage = async (userInputText: string) => {
    if (!userInputText.trim() || isLoadingChat) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: userInputText,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoadingChat(true);
    setChatError(null);

    // Call chat API proxy
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          selectedFiles: Array.from(selectedFiles),
          userApiKey: customApiKey || undefined,
          ragMode: ragliteMode,
          ragConfig: {
            maxChunks: ragMaxChunks,
            chunkSize: ragChunkSize,
            chunkOverlap: ragChunkOverlap
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to retrieve model insights.");
      }

      const data = await response.json();
      if (data.promptStats) {
        setLastPromptStats(data.promptStats);
      }
      if (data.injectedChunks) {
        setInjectedChunks(data.injectedChunks);
      }
      
      const assistantMsg: Message = {
        id: Math.random().toString(36).substring(7),
        role: "assistant",
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Chat Call Error:", err);
      setChatError(err?.message || "Communication with Gemini API server failed.");
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Clear chat conversation logs
  const handleResetConversation = () => {
    setMessages([]);
    setChatError(null);
    setLastPromptStats(null);
    setInjectedChunks([]);
    setShowInjectedChunks(false);
  };

  // Calculated totals
  const totalTextFilesMatchingCount = flatFiles.filter(f => f.isText).length;
  const selectedFilesList = Array.from(selectedFiles) as string[];
  const totalSizeSelected = flatFiles
    .filter(f => selectedFiles.has(f.path))
    .reduce((sum, file) => sum + file.size, 0);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased" id="root-app-viewport">
      
      {/* Upper Navigation/Branding strip */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 py-3.5 px-6 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
              <FolderSearch size={22} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Directory AI Chatbot</h1>
              <p className="text-[10px] text-slate-500 font-medium">Filesystem crawler, code inspector & chat assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick API Key field indicator */}
            <button
              type="button"
              onClick={() => setShowKeyField(!showKeyField)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all cursor-pointer ${
                customApiKey 
                  ? "bg-emerald-50/50 border-emerald-200 text-emerald-700 hover:bg-emerald-50" 
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Lock size={12} />
              <span className="hidden sm:inline">
                {customApiKey ? "Using Custom Key" : "Workspace Default Key"}
              </span>
              <Settings size={12} className="opacity-60" />
            </button>
          </div>
        </div>
      </header>

      {/* API Key Modal/Drawover Drawer if open */}
      {showKeyField && (
        <div className="bg-amber-50 border-b border-amber-200/60 transition-all duration-300 p-4" id="api-key-panel">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                <Globe size={13} />
                <span>Configure fallback API key</span>
              </div>
              <p className="text-xs text-amber-900/80 leading-relaxed">
                By default, this app calls Gemini via your AI Studio workspace default secure API key. If you are deploying or testing locally, or if your workspace secret is unavailable, you can paste an API key below.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto relative">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={customApiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                className="w-full md:w-64 px-3 py-1.5 text-xs rounded-md bg-white border border-amber-300 outline-none focus:border-amber-500 transition-colors placeholder-amber-400/60 font-mono text-slate-800"
              />
              {customApiKey && (
                <button
                  type="button"
                  title="Clear Key"
                  onClick={() => handleSaveApiKey("")}
                  className="absolute right-10 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowKeyField(false)}
                className="p-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-md transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Body content container */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6" id="app-main-body">
        
        {/* Top summary/action dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          
          {/* Target directory input form */}
          <div className="md:col-span-2 bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-indigo-600 block uppercase tracking-wider">Crawl target directory</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-slate-400 shrink-0 text-xs">Path:</span>
                <input
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && scanTargetDirectory()}
                  placeholder="e.g. . or src/components"
                  className="w-full bg-transparent border-none outline-none font-mono text-xs text-slate-800"
                  id="target-directory-input"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={isLoadingTree}
              onClick={() => scanTargetDirectory()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
              id="scan-dir-btn"
            >
              <RefreshCw size={12} className={isLoadingTree ? "animate-spin" : ""} />
              <span>Scan</span>
            </button>
          </div>

          {/* Active path summary */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Current Location</span>
            <div className="text-xs font-semibold mt-1 font-mono text-slate-700 truncate" title={activeScannedPath}>
              {activeScannedPath === "." ? "project root / workspace" : `./${activeScannedPath}`}
            </div>
          </div>

          {/* Selection memory stats */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Selected Context Size</span>
            <div className="text-xs font-semibold mt-1 text-slate-700 flex justify-between items-center">
              <span>{selectedFilesList.length} files matching</span>
              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                ~{formatSize(totalSizeSelected)}
              </span>
            </div>
          </div>

        </div>

        {/* Scaffold grids */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT: Directories Explorer & Assistant Utility Hub */}
          <section className="lg:col-span-4 flex flex-col bg-white border border-slate-200 rounded-xl max-h-[690px] overflow-hidden shadow-2xs" id="sidebar-explorer">
            
            {/* Tab selection header */}
            <div className="flex border-b border-slate-150 bg-slate-50/80 p-1 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => { setActiveTab("explorer"); scanTargetDirectory(activeScannedPath); }}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === "explorer"
                    ? "bg-white text-indigo-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                <BookOpen size={12} />
                <span>Explorer</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("grep")}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === "grep"
                    ? "bg-white text-indigo-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                <Search size={12} />
                <span>Grep Content</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("windows")}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === "windows"
                    ? "bg-white text-indigo-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                <Terminal size={12} />
                <span>Windows App</span>
              </button>
            </div>

            {/* TAB CONTENT: Explorer */}
            {activeTab === "explorer" && (
              <div className="flex flex-col flex-1 p-4 overflow-hidden gap-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 shrink-0">
                  <div>
                    <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">Workspace Directory</h2>
                    <p className="text-[10px] text-slate-400 font-sans">Check files to include in RAG / prompt context</p>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Create fresh workspace file"
                      onClick={() => setIsCreatingFile(true)}
                      className="p-1 px-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                    >
                      <FilePlus size={11} />
                      <span>New File</span>
                    </button>
                    <button
                      type="button"
                      title="Refresh filesystem"
                      onClick={() => scanTargetDirectory(activeScannedPath)}
                      className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      <RefreshCw size={11} className={isLoadingTree ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                {/* Create File Mini Form inline overlay */}
                {isCreatingFile && (
                  <div className="bg-slate-50 border border-indigo-100 rounded-lg p-2.5 flex flex-col gap-2 shrink-0 my-1 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-705">Create File Creator</span>
                      <button type="button" onClick={() => setIsCreatingFile(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={12} />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="src/components/MyHelper.ts"
                      value={newFilePath}
                      onChange={(e) => setNewFilePath(e.target.value)}
                      className="w-full text-xs p-1.5 rounded border border-slate-250 bg-white font-mono text-slate-800 focus:outline-none focus:border-indigo-400"
                    />
                    <textarea
                      placeholder="Add file code contents..."
                      rows={4}
                      value={newFileContent}
                      onChange={(e) => setNewFileContent(e.target.value)}
                      className="w-full text-xs p-1.5 rounded border border-slate-250 bg-white font-mono text-slate-800 focus:outline-none focus:border-indigo-400 resize-none"
                    />
                    <div className="flex justify-end gap-1.5 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsCreatingFile(false)}
                        className="px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-150 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveNewFile}
                        disabled={!newFilePath.trim()}
                        className="px-2.5 py-1 text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded shadow-3xs"
                      >
                        Save File
                      </button>
                    </div>
                  </div>
                )}

                {/* Error inside sidebar explorer */}
                {generalError && (
                  <div className="p-3 bg-rose-50 border border-rose-150 rounded-lg text-rose-700 text-xs flex items-start gap-1.5 leading-relaxed shrink-0">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div className="flex-1 font-sans">
                      <p className="font-semibold text-rose-800">Scan failed</p>
                      <p className="text-[11px] font-mono mt-0.5">{generalError}</p>
                    </div>
                  </div>
                )}

                {/* Search Filter & Select All Batch tools */}
                <div className="flex flex-col gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
                    <FolderSearch size={14} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Filter file tree..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-transparent border-none outline-none text-slate-700 text-xs w-full"
                    />
                    {searchTerm && (
                      <button type="button" onClick={() => setSearchTerm("")} className="text-slate-400 hover:text-slate-600">
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Selection Batch-toggles */}
                  <div className="flex items-center justify-between text-[11px] border-b border-slate-100 pb-2">
                    <div className="text-slate-500 font-mono">
                      {totalTextFilesMatchingCount} eligible text files found
                    </div>
                    <div className="flex items-center gap-2 font-semibold">
                      <button
                        type="button"
                        onClick={handleSelectAllText}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <CheckCheck size={11} />
                        <span>Select Text</span>
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="text-amber-600 hover:text-amber-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <FolderMinus size={11} />
                        <span>Clear All</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tree listing output */}
                <div className="flex-1 overflow-y-auto min-h-[140px]" id="tree-container">
                  {isLoadingTree ? (
                    <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2 justify-center">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <p className="font-sans">Scanning workspace directory tree...</p>
                    </div>
                  ) : (
                    <FileTree
                      tree={tree}
                      selectedFiles={selectedFiles}
                      onToggleSelect={handleToggleFileSelection}
                      onInspectFile={setInspectedFilePath}
                      searchTerm={searchTerm}
                    />
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: Grep content find files */}
            {activeTab === "grep" && (
              <div className="flex flex-col flex-1 p-4 overflow-hidden gap-3">
                <div className="border-b border-slate-100 pb-2 shrink-0">
                  <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">File Content searcher</h2>
                  <p className="text-[10px] text-slate-400 font-sans">Find matching strings inside workspace text files</p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 shrink-0">
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Enter keyword to grep (e.g. Gemini, state)..."
                    value={grepQuery}
                    onChange={(e) => setGrepQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && triggerGrepSearch()}
                    className="bg-transparent border-none outline-none text-slate-700 text-xs w-full"
                  />
                  <button
                    type="button"
                    onClick={() => triggerGrepSearch()}
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-semibold transition-colors"
                  >
                    Go
                  </button>
                </div>

                {/* Matches list box output */}
                <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[220px] pr-1">
                  {isSearchingGrep ? (
                    <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <p>Searching file nodes content...</p>
                    </div>
                  ) : grepMatches.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs font-sans">
                      <Search size={22} className="mx-auto mb-1.5 opacity-30 text-indigo-500" />
                      <p>No query matches found yet.</p>
                      <p className="text-[10px] text-slate-400 mt-1">Press Enter or click Go to trigger scan.</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold text-indigo-600 px-1 uppercase tracking-wider">
                        Matched {grepMatches.length} occurrences:
                      </div>
                      <div className="space-y-1.5">
                        {grepMatches.map((m, idx) => (
                          <div 
                            key={idx}
                            onClick={() => {
                              setInspectedFilePath(m.filePath);
                            }}
                            className="p-2 rounded border border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50 transition-all cursor-pointer text-left font-mono"
                          >
                            <div className="flex items-center justify-between text-[10px] text-indigo-705 font-bold mb-1">
                              <span className="truncate flex-1 font-sans text-slate-800">{m.filePath.split("/").pop()}</span>
                              <span className="bg-slate-100 text-slate-500 px-1.5 rounded shrink-0">Line {m.line}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-sans truncate mb-0.5">{m.filePath}</div>
                            <div className="text-[11px] text-indigo-900 bg-indigo-50/50 p-1 rounded border border-indigo-100/30 font-mono select-none overflow-x-auto whitespace-pre">
                              {m.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: Windows Assistant helper instructions download dashboard */}
            {activeTab === "windows" && (
              <div className="flex flex-col flex-1 p-4 overflow-y-auto gap-3.5 text-left text-slate-700">
                <div className="border-b border-slate-100 pb-2.5 shrink-0">
                  <h2 className="text-xs font-bold text-indigo-600 tracking-wide uppercase flex items-center gap-1">
                    <Terminal size={13} />
                    <span>Windows Desktop Assistant</span>
                  </h2>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">Run this directory chatbot natively on your PC!</p>
                </div>

                <div className="text-xs space-y-3 leading-relaxed">
                  <p>
                    You can easily connect your private desktop files and codebase to Gemini model intelligence on Windows! We have already pre-generated the necessary bootstrap scripts in your workspace:
                  </p>

                  <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[11px] space-y-1">
                    <div className="font-semibold text-slate-800 flex items-center gap-1">
                      <Code2 size={11} className="text-indigo-600" />
                      <span>Script files preinstalled:</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-mono text-[10px]">
                      <li>windows_assistant_bootstrap.py</li>
                      <li>run_assistant.bat</li>
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <strong className="text-xs text-slate-800 block">How to run locally on Windows:</strong>
                    <ol className="list-decimal pl-4 text-xs text-slate-600 space-y-2">
                      <li>
                        Download the files or copy the python code.
                      </li>
                      <li>
                        Double click <code className="font-mono bg-slate-100 px-1 py-0.5 text-[10px] rounded text-pink-600">run_assistant.bat</code> to automatically initialize python paths and install dependencies!
                      </li>
                      <li>
                        Paste your Gemini key into the desktop client setup box, choose any windows directory tab, and begin!
                      </li>
                    </ol>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Quick Actions:</span>
                    
                    <button
                      type="button"
                      onClick={() => {
                        // Quick download py script file helper
                        fetch("/api/file-content?path=windows_assistant_bootstrap.py")
                          .then(r => r.json())
                          .then(data => {
                            const blob = new Blob([data.contents], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = "windows_assistant_bootstrap.py";
                            link.click();
                          })
                          .catch(() => alert("Could not fetch file. Please select it manually from workspace root folder files."));
                      }}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs transition-colors"
                    >
                      <Download size={12} />
                      <span>Download python script</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        // Quick download BAT launcher
                        fetch("/api/file-content?path=run_assistant.bat")
                          .then(r => r.json())
                          .then(data => {
                            const blob = new Blob([data.contents], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = "run_assistant.bat";
                            link.click();
                          })
                          .catch(() => alert("Could not fetch launcher. Please inspect run_assistant.bat."));
                      }}
                      className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-350 rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Download size={12} />
                      <span>Download Windows launcher (BAT)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer selected files contexts */}
            {activeTab === "explorer" && selectedFilesList.length > 0 && (
              <div className="border-t border-slate-150 pt-2 bg-slate-50 rounded-b-lg p-2 max-h-[140px] overflow-y-auto shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Loaded Context Files:</span>
                  <button 
                    type="button" 
                    onClick={handleDeselectAll} 
                    className="text-[9px] text-slate-400 hover:text-slate-600 hover:underline"
                  >
                    Clear {selectedFilesList.length}
                  </button>
                </div>
                <ul className="space-y-1">
                  {selectedFilesList.map((fpath, fidx) => (
                    <li key={fidx} className="flex items-center justify-between text-[10px] text-slate-600 font-mono bg-white border border-slate-200/60 px-1.5 py-0.5 rounded">
                      <span className="truncate flex-1 mr-2">{fpath}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleFileSelection(fpath)}
                        className="text-slate-300 hover:text-rose-500 hover:bg-slate-100 p-0.5 rounded transition-all"
                      >
                        <X size={10} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* RIGHT: Conversational Chat Panel */}
          <section className="lg:col-span-8 flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-white rounded-lg px-4 py-2 border border-slate-200 shadow-2xs text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-2">
                <FileCheck size={14} className="text-emerald-500" />
                <span>
                  Context Seed: <strong className="font-semibold text-slate-700">{selectedFilesList.length} files</strong> context loaded.
                </span>
              </div>
              <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                <label className="flex items-center gap-1.5 font-semibold text-indigo-750 bg-indigo-50/50 hover:bg-indigo-50 px-2.5 py-1 rounded border border-indigo-100 transition-colors cursor-pointer text-[11px] select-none">
                  <input
                    type="checkbox"
                    checked={ragliteMode}
                    onChange={(e) => setRagliteMode(e.target.checked)}
                    className="accent-indigo-600 cursor-pointer h-3.5 w-3.5"
                  />
                  <span>RAGlite Mode (Selective Chunks)</span>
                </label>

                {ragliteMode && (
                  <button
                    type="button"
                    onClick={() => setShowRagConfig(!showRagConfig)}
                    className="flex items-center gap-0.5 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded border border-slate-200 text-[11px] transition-all cursor-pointer font-medium"
                    title="Customize retrieval limits and lines chunk sizes"
                  >
                    <span>⚙️ Config</span>
                  </button>
                )}

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetConversation}
                    className="flex items-center gap-1 px-2.5 py-1 hover:bg-slate-100 rounded text-amber-600 hover:text-amber-800 transition-colors shrink-0 font-semibold text-[11px] cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Configurable Sliders for RAGlite selective matching precision */}
            {ragliteMode && showRagConfig && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex flex-col gap-3 animate-fadeIn shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-150 pb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">⚙️ Customize Code Chunking & Retrieval Precision</span>
                    <span className="text-[9px] text-indigo-600 bg-indigo-50 px-1 rounded">Advanced</span>
                  </div>
                  <button type="button" onClick={() => setShowRagConfig(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold font-mono">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                      <span>Max Retreived Chunks:</span>
                      <strong className="font-mono text-indigo-600 text-[11px]">{ragMaxChunks} chunks</strong>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      value={ragMaxChunks}
                      onChange={(e) => setRagMaxChunks(parseInt(e.target.value))}
                      className="accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                    />
                    <p className="text-[9px] text-slate-400">Total matched segment blocks sent to Gemini helper.</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                      <span>Chunk Line Size:</span>
                      <strong className="font-mono text-indigo-600 text-[11px]">{ragChunkSize} lines</strong>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="5"
                      value={ragChunkSize}
                      onChange={(e) => setRagChunkSize(parseInt(e.target.value))}
                      className="accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                    />
                    <p className="text-[9px] text-slate-400">Lines per chunk block to maintain structural context.</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                      <span>Chunk Overlap Lines:</span>
                      <strong className="font-mono text-indigo-600 text-[11px]">{ragChunkOverlap} lines</strong>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={ragChunkOverlap}
                      onChange={(e) => setRagChunkOverlap(parseInt(e.target.value))}
                      className="accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                    />
                    <p className="text-[9px] text-slate-400">Overlapping boundary lines to prevent split keywords.</p>
                  </div>
                </div>
              </div>
            )}

            {lastPromptStats && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gradient-to-r from-emerald-50/90 to-teal-50/90 border border-emerald-150 rounded-xl px-3.5 py-2.5 text-xs text-teal-800 shadow-3xs animate-fadeIn gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <div>
                    <span className="font-extrabold text-teal-950 uppercase tracking-wide text-[10px] mr-1">Reduction Log:</span>{" "}
                    Optimized context load to <strong className="font-mono text-emerald-950 text-[11px] bg-white px-1.5 py-0.5 border border-emerald-100 rounded inline-block">{Math.round(lastPromptStats.finalPromptChars / 1024 * 10) / 10} KB</strong> instead of raw files (
                    <span className="line-through text-slate-400 font-mono text-[11px]">{Math.round(lastPromptStats.originalTotalChars / 1024 * 10) / 10} KB</span>).
                  </div>
                </div>
                <div className="bg-emerald-600 text-white font-mono px-2 py-0.5 rounded text-[10px] font-extrabold shadow-3xs shrink-0 uppercase tracking-widest flex items-center gap-1 select-none animate-pulse">
                  ⚡ Saved {lastPromptStats.ratioSaved}%
                </div>
              </div>
            )}

            {/* Injected matched chunks inspector visualizer collapsible accordion */}
            {injectedChunks.length > 0 && (
              <div className="flex flex-col bg-slate-50 border border-slate-200/80 rounded-lg p-3 gap-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-indigo-650" />
                    <span className="font-bold text-slate-700">Matched RAG Passages ({injectedChunks.length})</span>
                    <span className="text-[9px] text-slate-400 font-sans hidden sm:inline-block">Injected context segments sent to assistant</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInjectedChunks(!showInjectedChunks)}
                    className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {showInjectedChunks ? "Hide Passages ✕" : "Inspect Passages (↴)"}
                  </button>
                </div>

                {showInjectedChunks && (
                  <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto mt-1 pr-1 font-mono text-[11px]">
                    {injectedChunks.map((chunk, cidx) => (
                      <div key={cidx} className="bg-white border border-slate-200/90 rounded-lg p-2.5 shadow-3xs flex flex-col gap-1">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1 bg-slate-50 px-2 py-0.5 rounded text-[10px]">
                          <span className="text-slate-800 font-semibold truncate max-w-[350px]">
                            📁 {chunk.filePath} <span className="text-slate-400 font-normal">(Line: {chunk.lineNumber})</span>
                          </span>
                          {chunk.score !== undefined && (
                            <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 rounded">TF-IDF score: {Math.round(chunk.score * 10) / 10}</span>
                          )}
                        </div>
                        <pre className="text-slate-600 leading-relaxed overflow-x-auto select-text font-mono text-[10px] max-h-[100px] whitespace-pre bg-slate-950 text-slate-200 p-2 rounded">
                          <code>{chunk.text}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chat message display engine */}
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendChatMessage}
              isLoading={isLoadingChat}
              activeContextFileCount={selectedFilesList.length}
              apiError={chatError}
              selectedFileNames={selectedFilesList}
            />
          </section>

        </div>
      </main>

      {/* FOOTER credit and reference instructions section */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 px-6 text-center text-slate-400 text-[11px] font-sans">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Directory AI Assistant. Powered by Gemini 3.5-flash.</p>
          <div className="flex gap-4">
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); scanTargetDirectory("."); }}
              className="hover:text-indigo-600 transition-colors hover:underline"
            >
              Reset view to App Root
            </a>
            <span className="text-slate-200">|</span>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); setShowKeyField(true); }}
              className="hover:text-amber-600 transition-colors hover:underline"
            >
              Configure Fallback API Token
            </a>
          </div>
        </div>
      </footer>

      {/* OVERLAY PANEL: File inspector preview modal */}
      {inspectedFilePath && (
        <FileInspector
          filePath={inspectedFilePath}
          onClose={() => setInspectedFilePath(null)}
        />
      )}

    </div>
  );
}
