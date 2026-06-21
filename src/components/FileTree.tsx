import React, { useState } from "react";
import { FileNode } from "../types";
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  FileCode, 
  ChevronRight, 
  ChevronDown, 
  Eye,
  CheckSquare,
  Square,
  Search
} from "lucide-react";

// Visual file type layout decorator badges
const extensionColors: { [key: string]: { bg: string, label: string } } = {
  ts: { bg: "bg-sky-950/40 text-sky-400 border border-sky-900/30", label: "TS" },
  tsx: { bg: "bg-indigo-950/40 text-indigo-400 border border-indigo-900/30", label: "TSX" },
  js: { bg: "bg-yellow-950/40 text-yellow-500 border border-yellow-900/30", label: "JS" },
  jsx: { bg: "bg-amber-950/40 text-amber-500 border border-amber-900/30", label: "JSX" },
  json: { bg: "bg-teal-950/40 text-teal-400 border border-teal-900/30", label: "JSON" },
  py: { bg: "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30", label: "PY" },
  css: { bg: "bg-pink-950/40 text-pink-405 border border-pink-900/30", label: "CSS" },
  html: { bg: "bg-orange-950/40 text-orange-400 border border-orange-900/30", label: "HTML" },
  md: { bg: "bg-slate-800 text-slate-300 border border-slate-700/55", label: "MD" },
  bat: { bg: "bg-rose-950/40 text-rose-455 border border-rose-900/20", label: "BAT" },
  sh: { bg: "bg-cyan-950/40 text-cyan-400 border border-cyan-900/30", label: "SH" },
  // Microsoft Office Suite & documents
  pdf: { bg: "bg-red-950/50 text-red-400 border border-red-900/30", label: "PDF" },
  docx: { bg: "bg-blue-950/50 text-blue-405 border border-blue-900/30", label: "DOCX" },
  xlsx: { bg: "bg-emerald-950/50 text-emerald-400 border border-emerald-900/30", label: "XLSX" },
  pptx: { bg: "bg-amber-950/50 text-amber-400 border border-amber-900/30", label: "PPTX" },
  // Images
  png: { bg: "bg-purple-950/40 text-purple-400 border border-purple-900/20", label: "IMG" },
  jpg: { bg: "bg-purple-950/40 text-purple-400 border border-purple-900/20", label: "IMG" },
  jpeg: { bg: "bg-purple-950/40 text-purple-400 border border-purple-900/20", label: "IMG" },
  webp: { bg: "bg-purple-950/40 text-purple-400 border border-purple-900/20", label: "IMG" },
  gif: { bg: "bg-purple-950/40 text-purple-400 border border-purple-900/20", label: "IMG" }
};

interface FileTreeProps {
  tree: FileNode[];
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onInspectFile: (path: string) => void;
  searchTerm: string;
}

export default function FileTree({ 
  tree, 
  selectedFiles, 
  onToggleSelect, 
  onInspectFile,
  searchTerm 
}: FileTreeProps) {
  
  // Recursive Tree Node Component
  function TreeNode({ node, depth = 0 }: { node: FileNode; depth: number }) {
    const [isOpen, setIsOpen] = useState(depth === 0); // Keep root/top level expanded by default
    
    const isFolder = node.isDirectory;
    const isChecked = selectedFiles.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    
    // Check if node or any of its children matches the search filter
    function matchesSearch(item: FileNode): boolean {
      if (!searchTerm) return true;
      if (item.name.toLowerCase().includes(searchTerm.toLowerCase())) return true;
      if (item.children) {
        return item.children.some(child => matchesSearch(child));
      }
      return false;
    }

    if (!matchesSearch(node)) {
      return null;
    }

    const fileExt = node.name.split(".").pop()?.toLowerCase();
    const isCodeFile = ["ts", "tsx", "js", "jsx", "json", "html", "css", "md", "sh", "sql"].includes(fileExt || "");

    const handleFolderToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen(!isOpen);
    };

    const formatSize = (bytes: number) => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return (
      <div className="flex flex-col select-none" id={`tree-node-${node.path.replace(/[^a-zA-Z0-9]/g, "-")}`}>
        {/* Row element */}
        <div 
          className="group flex items-center justify-between py-1 px-2 rounded-md hover:bg-slate-100 transition-colors text-sm text-slate-700 cursor-pointer"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => isFolder ? setIsOpen(!isOpen) : onToggleSelect(node.path)}
        >
          <div className="flex items-center gap-2 overflow-hidden mr-2">
            {/* Folder Toggle arrow */}
            {isFolder ? (
              <button 
                onClick={handleFolderToggle}
                className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                id={`collapse-btn-${node.path.replace(/[^a-zA-Z0-9]/g, "-")}`}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5" /> // spacer
            )}

            {/* Checkbox for files */}
            {!isFolder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(node.path);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                {isChecked ? (
                  <CheckSquare size={16} className="text-indigo-600 fill-indigo-50" />
                ) : (
                  <Square size={16} />
                )}
              </button>
            )}

            {/* Icon */}
            <span>
              {isFolder ? (
                isOpen ? (
                  <FolderOpen size={16} className="text-yellow-500 fill-yellow-50" />
                ) : (
                  <Folder size={16} className="text-yellow-500 fill-yellow-50" />
                )
              ) : isCodeFile ? (
                <FileCode size={16} className="text-blue-500" />
              ) : (
                <FileText size={16} className="text-slate-400" />
              )}
            </span>

            {/* Label */}
            <span className={`truncate ${isChecked ? "font-semibold text-slate-900" : "text-slate-700"} flex items-center gap-1.5`}>
              <span>{node.name}</span>
              {!isFolder && fileExt && extensionColors[fileExt] && (
                <span className={`text-[8px] font-extrabold uppercase font-mono px-1 py-0.2 rounded scale-90 ${extensionColors[fileExt].bg}`}>
                  {extensionColors[fileExt].label}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            {/* Meta Size */}
            <span className="text-[10px] font-mono text-slate-500">
              {formatSize(node.size)}
            </span>

            {/* Preview Button */}
            {!isFolder && (
              <button
                type="button"
                title="View original file contents"
                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspectFile(node.path);
                }}
                id={`inspect-file-${node.path.replace(/[^a-zA-Z0-9]/g, "-")}`}
              >
                <Eye size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Children Render */}
        {isFolder && isOpen && node.children && (
          <div className="flex flex-col mt-0.5">
            {node.children.map((child, idx) => (
              <div key={child.path + "-" + idx}>
                <TreeNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="py-8 text-center text-slate-400 text-xs font-sans">
        No matched files in target directory.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto pr-1">
      {tree.map((node, index) => (
        <div key={node.path + "-" + index}>
          <TreeNode node={node} depth={0} />
        </div>
      ))}
    </div>
  );
}
