import { useEffect, useState, useRef } from "react";
import { Copy, Check, X, File, FileCode, Edit3, Save, Eye, Search, Replace, AlertCircle, FileText, Database, Presentation } from "lucide-react";

interface FileInspectorProps {
  filePath: string;
  onClose: () => void;
}

export default function FileInspector({ filePath, onClose }: FileInspectorProps) {
  const [content, setContent] = useState<string>("");
  const [editedContent, setEditedContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [size, setSize] = useState<number>(0);

  // Rich binary and document states
  const [fileType, setFileType] = useState<string>("");
  const [extraData, setExtraData] = useState<any>(null);
  const [isBinary, setIsBinary] = useState<boolean>(false);
  const [xlsxActiveSheet, setXlsxActiveSheet] = useState<string>("");

  // Find & Replace Search states
  const [findText, setFindText] = useState<string>("");
  const [replaceText, setReplaceText] = useState<string>("");
  const [searchStatus, setSearchStatus] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    setContent("");
    setIsEditing(false);
    setFindText("");
    setReplaceText("");
    setSearchStatus("");
    setFileType("");
    setExtraData(null);
    setIsBinary(false);
    setXlsxActiveSheet("");

    fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((data) => {
            throw new Error(data.error || "Failed to load file contents");
          });
        }
        return res.json();
      })
      .then((data) => {
        if (active) {
          setContent(data.contents);
          setEditedContent(data.contents);
          setSize(data.size || 0);
          setFileType(data.fileType || "");
          setExtraData(data.extraData || null);
          setIsBinary(!!data.isBinary);
          
          if (data.fileType === "xlsx" && data.extraData?.sheets) {
            const sheetNames = Object.keys(data.extraData.sheets);
            if (sheetNames.length > 0) {
              setXlsxActiveSheet(sheetNames[0]);
            }
          }
          
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (active) {
          setError(err?.message || "An error occurred");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  // Support Ctrl+S / Cmd+S save command
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isEditing && !saving) {
          triggerSave();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isEditing, editedContent, saving, filePath]);

  // Count search matches
  useEffect(() => {
    if (!findText) {
      setSearchStatus("");
      return;
    }
    const txt = isEditing ? editedContent : content;
    try {
      const escaped = findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = txt.match(regex);
      const count = matches ? matches.length : 0;
      setSearchStatus(`${count} ${count === 1 ? 'match' : 'matches'} found`);
    } catch (e) {
      setSearchStatus("Invalid query");
    }
  }, [findText, editedContent, content, isEditing]);

  const handleCopy = () => {
    navigator.clipboard.writeText(isEditing ? editedContent : content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const triggerSave = () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    
    fetch("/api/save-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, contents: editedContent })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setContent(editedContent);
          setIsEditing(false);
          setSize(new Blob([editedContent]).size);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      })
      .catch((e: any) => setError(e?.message || "Failed to save file"))
      .finally(() => setSaving(false));
  };

  // Find & Replace actions
  const handleReplaceAll = () => {
    if (!findText) return;
    try {
      const escaped = findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const original = isEditing ? editedContent : content;
      const replaced = original.replace(regex, replaceText);
      
      const count = (original.match(regex) || []).length;
      
      if (isEditing) {
        setEditedContent(replaced);
      } else {
        setEditedContent(replaced);
        setIsEditing(true); // Jump to editing to allow saving the replacement
      }
      setSearchStatus(`Replaced all ${count} occurrences`);
    } catch (e) {
      setSearchStatus("Error replacing text");
    }
  };

  const handleReplaceNext = () => {
    if (!findText) return;
    const txt = isEditing ? editedContent : content;
    const regex = new RegExp(findText, "i");
    if (regex.test(txt)) {
      const replaced = txt.replace(regex, replaceText);
      setEditedContent(replaced);
      if (!isEditing) setIsEditing(true);
      setSearchStatus("Replaced next occurrence");
    } else {
      setSearchStatus("No match found for replacement");
    }
  };

  const lines = (isEditing ? editedContent : content).split("\n");
  const extension = filePath.split(".").pop()?.toLowerCase();
  
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Safe client-side regex visual syntax splitter
  function splitAndColorizeLine(line: string) {
    if (!line) return "\n";
    
    const tokenRegex = /(\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|import|export|class|default|from|if|else|try|catch|new|await|async|typeof|instanceof|void|any|string|number|boolean|interface|type)\b|\b\d+\b)/g;
    const parts = line.split(tokenRegex);
    
    if (parts.length <= 1) {
      return line;
    }

    return parts.map((part, pidx) => {
      if (part.startsWith("//")) {
        return <span key={pidx} className="text-emerald-400 font-normal italic">{part}</span>;
      }
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")) || (part.startsWith('`') && part.endsWith('`'))) {
        return <span key={pidx} className="text-amber-400 font-medium select-text">{part}</span>;
      }
      if (/^(const|let|var|function|return|import|export|class|default|from|if|else|try|catch|new|await|async|typeof|instanceof|void|any|string|number|boolean|interface|type)$/.test(part)) {
        return <span key={pidx} className="text-indigo-400 font-bold">{part}</span>;
      }
      if (/^\d+$/.test(part)) {
        return <span key={pidx} className="text-violet-400 font-mono">{part}</span>;
      }
      return <span key={pidx} className="select-text">{part}</span>;
    });
  }

  function highlightCode(code: string, ext?: string) {
    if (!code) {
      return <span className="text-slate-500">/* This file is empty */</span>;
    }
    
    const codeLines = code.split("\n");
    const isStylableFile = ["ts", "tsx", "js", "jsx", "json", "html", "css", "py", "sh", "bat", "yml", "yaml", "md"].includes(ext || "");
    
    return codeLines.map((line, idx) => {
      if (!isStylableFile) {
        return <div key={idx} className="select-text min-h-[1.2rem]">{line}</div>;
      }

      // Pre-process Comments lines
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
        return (
          <div key={idx} className="text-emerald-400 font-normal italic min-h-[1.2rem] select-text">
            {line}
          </div>
        );
      }

      return (
        <div key={idx} className="min-h-[1.2rem] select-text">
          {splitAndColorizeLine(line)}
        </div>
      );
    });
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in"
      id="file-inspector-modal"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-850">
          <div className="flex items-center gap-2 overflow-hidden mr-4">
            <span className="flex items-center justify-center w-5 h-5 rounded bg-indigo-950 text-indigo-400">
              {["ts", "tsx", "js", "jsx", "html", "css"].includes(extension || "") ? (
                <FileCode size={14} />
              ) : (
                <File size={14} />
              )}
            </span>
            <span className="text-xs font-mono text-slate-300 truncate">
              {filePath}
            </span>
            <span className="text-[10px] font-mono text-slate-500 shrink-0 bg-slate-900 px-1.5 py-0.5 rounded">
              {formatSize(size)}
            </span>
            {isBinary ? (
              <span className="text-[9px] uppercase font-bold text-indigo-400 bg-indigo-950/45 border border-indigo-900/40 px-1.5 py-0.5 rounded">
                Parsed {fileType} Document
              </span>
            ) : isEditing ? (
              <span className="text-[9px] uppercase font-bold text-amber-400 bg-amber-950/40 border border-amber-900/30 px-1.5 rounded animate-pulse">
                Editing Mode (Ctrl+S to save)
              </span>
            ) : (
              <span className="text-[9px] uppercase font-bold text-slate-400 bg-slate-850 border border-slate-800 px-1.5 rounded">
                Read Only Preview
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!loading && !error && (
              <>
                {!isBinary && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors font-medium cursor-pointer ${
                      isEditing 
                        ? "bg-amber-600 hover:bg-amber-700 text-white" 
                        : "text-slate-400 hover:text-white hover:bg-slate-850"
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <Eye size={13} />
                        <span>Preview</span>
                      </>
                    ) : (
                      <>
                        <Edit3 size={13} />
                        <span>Edit File</span>
                      </>
                    )}
                  </button>
                )}

                {!isBinary && isEditing && (
                  <button
                    type="button"
                    onClick={triggerSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-600 text-white hover:bg-emerald-700 rounded transition-colors font-medium disabled:opacity-50 cursor-pointer"
                  >
                    <Save size={13} />
                    <span>{saving ? "Saving..." : "Save Changes"}</span>
                  </button>
                )}

                {/* Only support clipboard operations on text extracts */}
                {fileType !== "image" && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-850 rounded transition-colors font-medium cursor-pointer"
                    id="copy-code-btn"
                  >
                    {copied ? (
                      <>
                        <Check size={13} className="text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy Texts</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-850 rounded transition-colors cursor-pointer"
              id="close-inspector-btn"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Find & Replace Utility Bar */}
        {!loading && !error && !isBinary && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-4 py-2 bg-slate-900 border-b border-slate-850 text-xs text-slate-300">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 max-w-[200px]">
                <Search size={12} className="text-slate-500" />
                <input
                  type="text"
                  placeholder="Find term..."
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  className="bg-transparent border-none outline-none text-slate-200 w-full placeholder-slate-600 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 max-w-[200px]">
                <Replace size={12} className="text-slate-500" />
                <input
                  type="text"
                  placeholder="Replace with..."
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  className="bg-transparent border-none outline-none text-slate-200 w-full placeholder-slate-600 text-xs"
                />
              </div>

              {findText && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleReplaceNext}
                    className="bg-slate-800 hover:bg-slate-750 text-slate-300 px-2.5 py-1 rounded transition-all text-[11px] font-medium"
                    title="Replace next occurrence"
                  >
                    Replace Next
                  </button>
                  <button
                    type="button"
                    onClick={handleReplaceAll}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded transition-all text-[11px] font-medium"
                    title="Replace all occurrences"
                  >
                    Replace All
                  </button>
                </div>
              )}
            </div>

            {searchStatus && (
              <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-2 py-0.5 rounded shrink-0">
                {searchStatus}
              </span>
            )}
          </div>
        )}

        {/* Console Container / Code Viewer */}
        <div className="flex-1 overflow-auto bg-slate-950 font-mono text-xs text-slate-300 relative min-h-[350px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 bg-slate-950/80 z-20">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-500">Reading filesystem path...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-950/20 border border-rose-900/40 text-rose-300 rounded-lg m-4 flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-400 mb-0.5">Failed Code Operation</p>
                <p className="font-mono text-[11px] leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="sticky top-0 right-0 left-0 bg-emerald-950/90 border-b border-emerald-800/50 text-emerald-300 text-xs px-4 py-2 flex items-center gap-2 z-10 animate-slide-down">
              <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
              <span>File <strong>{filePath.split('/').pop()}</strong> successfully persisted in workspace!</span>
            </div>
          )}

          {!loading && !error && (
            <div className="h-full min-h-[350px]">
              {isBinary ? (
                <div className="text-slate-300 font-sans">
                  {/* Image Viewer */}
                  {fileType === "image" && (
                    <div className="flex flex-col items-center justify-center p-8 bg-slate-950 w-full h-full min-h-[350px]">
                      <div className="relative group max-w-full max-h-[320px] overflow-hidden rounded border border-slate-800 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] p-4 flex items-center justify-center">
                        <img
                          src={extraData?.base64}
                          alt={filePath.split("/").pop()}
                          className="max-w-full max-h-[260px] object-contain transition-transform duration-200 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="mt-4 text-center">
                        <p className="text-sm font-semibold text-slate-200">{filePath.split("/").pop()}</p>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                          MIME Type: {extraData?.mimeType} | Size: {formatSize(size)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* PDF Document Viewer */}
                  {fileType === "pdf" && (
                    <div className="p-6 text-slate-300 font-sans max-w-4xl mx-auto">
                      <div className="p-4 bg-red-950/20 border border-red-905/30 rounded-lg flex items-center gap-3 mb-6">
                        <div className="p-2 bg-red-900/40 text-red-400 rounded-md">
                          <FileText size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-100">PDF Document Text Extracted</h4>
                          <p className="text-xs text-slate-400">PDF successfully parsed and injected into workspace analysis context.</p>
                        </div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 font-mono text-[13px] leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto select-text">
                        {content || "[Empty PDF text context]"}
                      </div>
                    </div>
                  )}

                  {/* Word Word Document Viewer */}
                  {fileType === "docx" && (
                    <div className="p-6 text-slate-300 font-sans max-w-4xl mx-auto">
                      <div className="p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-900/40 text-blue-400 rounded-md">
                          <FileText size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-100">Word Document Text Extracted</h4>
                          <p className="text-xs text-slate-400">Word .docx document parsed successfully.</p>
                        </div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 font-mono text-[13px] leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto select-text">
                        {content || "[Empty DOCX text context]"}
                      </div>
                    </div>
                  )}

                  {/* PowerPoint Slides Viewer */}
                  {fileType === "pptx" && (
                    <div className="p-6 text-slate-300 font-sans max-w-4xl mx-auto">
                      <div className="p-4 bg-amber-950/20 border border-amber-900/30 rounded-lg flex items-center gap-3 mb-6">
                        <div className="p-2 bg-amber-900/40 text-amber-400 rounded-md">
                          <Presentation size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-100">PowerPoint Slides Extracted</h4>
                          <p className="text-xs text-slate-400">Slides layout parsed successfully slide-by-slide.</p>
                        </div>
                      </div>
                      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                        {content && content.includes("--- SLIDE ") ? (
                          content.split("--- SLIDE ").filter(Boolean).map((slideBlock, i) => {
                            const [slideNumLine, ...slideLines] = slideBlock.split("\n");
                            const slideTextContent = slideLines.join("\n").trim();
                            return (
                              <div key={i} className="bg-slate-900/85 border border-slate-800 rounded-lg overflow-hidden">
                                <div className="bg-slate-850 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                                  <span className="text-xs font-semibold text-amber-400 font-mono uppercase">Slide {slideNumLine.split(" ")[0] || (i + 1)}</span>
                                  <span className="text-[10px] text-slate-500 font-mono uppercase">Visual layout slide</span>
                                </div>
                                <div className="p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-200 select-text">
                                  {slideTextContent || <span className="text-slate-600 italic">No text read on this slide</span>}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-8 text-center bg-slate-900 border border-slate-800 text-slate-500 rounded-lg italic">
                            This office presentation presentation slide text is empty or not parseable.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Excel Spreadsheet Viewer */}
                  {fileType === "xlsx" && (
                    <div className="p-6 text-slate-300 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-950 text-emerald-400 rounded-md border border-emerald-900/50">
                            <Database size={20} />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-100">Excel Spreadsheet Visual Interactive Sheet Panel</h4>
                            <p className="text-xs text-slate-400">Displaying cell grid rows and worksheets.</p>
                          </div>
                        </div>
                      </div>

                      {/* Worksheet Tab selections */}
                      {extraData?.sheets && (
                        <div className="flex flex-wrap gap-1.5 mb-4 border-b border-slate-800 pb-2">
                          {Object.keys(extraData.sheets).map((sheetName) => (
                            <button
                              key={sheetName}
                              type="button"
                              onClick={() => setXlsxActiveSheet(sheetName)}
                              className={`px-3 py-1.5 rounded-t text-xs font-medium transition-all border-t border-r border-l cursor-pointer ${
                                xlsxActiveSheet === sheetName
                                  ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-400 border-b border-b-emerald-950"
                                  : "bg-slate-900 border-transparent text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {sheetName}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Spreadsheet View Grid Table */}
                      <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-[350px] overflow-y-auto bg-slate-950">
                        {extraData?.sheets?.[xlsxActiveSheet] ? (
                          <table className="w-full border-collapse font-sans text-xs">
                            <thead>
                              <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 select-none">
                                <th className="py-2 px-3 border-r border-slate-800 text-center font-mono w-10 shrink-0">#</th>
                                {/* Create Column Letters A, B, C... based on headers */}
                                {Array.from({ length: Math.max(...extraData.sheets[xlsxActiveSheet].map((row: any) => (Array.isArray(row) ? row.length : 0)), 1) }).map((_, colIdx) => (
                                  <th key={colIdx} className="py-2 px-3 border-r border-slate-800 text-left font-mono font-medium">
                                    {String.fromCharCode(65 + (colIdx % 26)) + (colIdx >= 26 ? Math.floor(colIdx / 26) : "")}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {extraData.sheets[xlsxActiveSheet].map((row: any, rowIdx: number) => (
                                <tr key={rowIdx} className="border-b border-slate-850 hover:bg-slate-900/30">
                                  <td className="py-2 px-2 border-r border-slate-800 text-center font-mono bg-slate-900 text-slate-500 select-none">{rowIdx + 1}</td>
                                  {Array.isArray(row) ? (
                                    row.map((cell: any, cellIdx: number) => (
                                      <td key={cellIdx} className="py-2 px-3 border-r border-slate-850 text-slate-300 font-mono">
                                        {cell === null || cell === undefined ? "" : String(cell)}
                                      </td>
                                    ))
                                  ) : (
                                    <td colSpan={10} className="py-2 px-3 text-slate-500 italic">No cell data</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="p-8 text-center text-slate-500 italic">This spreadsheet sheet is empty.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start h-full p-4 pt-4">
                  {/* Line Numbers column */}
                  <div className="select-none text-right pr-4 border-r border-slate-850 text-slate-600 font-mono text-[11px] min-w-[2.5rem] pt-0.5">
                    {lines.map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>

                  {/* Contents block / Editable textarea */}
                  <div className="flex-1 pl-4 h-full">
                    {isEditing ? (
                      <textarea
                        ref={textareaRef}
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full h-full min-h-[350px] bg-transparent text-slate-200 outline-none border-none font-mono text-[12px] leading-normal resize-none focus:ring-0 focus:outline-none"
                        spellCheck={false}
                        autoFocus
                      />
                    ) : (
                      <pre className="pr-2 overflow-x-auto whitespace-pre font-mono text-[12px] leading-normal text-slate-200 select-text">
                        <code>{highlightCode(content, extension)}</code>
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
