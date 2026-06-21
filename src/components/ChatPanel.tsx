import React, { useState, useRef, useEffect } from "react";
import { Message } from "../types";
import { Send, Bot, User, CornerDownLeft, Sparkles, AlertCircle, Copy, Check } from "lucide-react";

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  activeContextFileCount: number;
  apiError: string | null;
  selectedFileNames: string[];
}

export default function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  activeContextFileCount,
  apiError,
  selectedFileNames
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const QUICK_PROMPTS = [
    { label: "Summarize selected files", text: "Please provide a concise high-level summary of what these selected files do." },
    { label: "Search for TODOs & issues", text: "Look through the selected files and find any placeholders, TODOs, comments/issues, or potential code improvements." },
    { label: "Explain codebase design", text: "What architectural patterns or design decisions exist in these files? Explain the code structure." },
    { label: "Draft unit test suite", text: "Write comprehensive unit test cases (using Jest/TypeScript/etc. as applicable) for the selected code context." }
  ];

  return (
    <div className="flex flex-col h-[600px] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm" id="chat-panel-container">
      
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Workspace AI Assistant</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-500">gemini-3.5-flash • Full-Stack</span>
            </div>
          </div>
        </div>

        {/* Selected Context badge */}
        <div className="flex items-center">
          <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${
            activeContextFileCount > 0 
              ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
              : "bg-amber-50 text-amber-700 border border-amber-100"
          }`}>
            {activeContextFileCount} {activeContextFileCount === 1 ? "file" : "files"} in context
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50" id="chat-messages-scroll">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4 animate-bounce">
              <Sparkles size={24} />
            </div>
            <h4 className="text-sm font-semibold text-slate-700 mb-1">Ask anything about this directory</h4>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mb-6">
              I can analyze directories, search code, trace references, structure templates, write tests, or find issues. Put file checkmarks on the sidebar to seed my knowledge context window.
            </p>

            {/* Quick Prompts list */}
            <div className="w-full space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Quick analysis tasks:</p>
              <div className="grid grid-cols-1 gap-2">
                {QUICK_PROMPTS.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSendMessage(qp.text)}
                    className="flex text-left items-center justify-between text-xs px-3 py-2 bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 text-slate-700 rounded-lg transition-all shadow-2xs group"
                  >
                    <span>{qp.label}</span>
                    <Sparkles size={12} className="text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0 ml-1" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 max-w-[85%] ${
                message.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
              id={`chat-msg-${message.id}`}
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                message.role === "user" 
                  ? "bg-slate-200 text-slate-700" 
                  : "bg-indigo-600 text-white"
              }`}>
                {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm shadow-2xs leading-relaxed overflow-x-auto ${
                  message.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
                }`}>
                  <MessageFormatter content={message.content} isUser={message.role === "user"} />
                </div>
                <span className="text-[9px] font-mono text-slate-400 mt-1">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex gap-3 mr-auto max-w-[85%] animate-pulse">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-400 flex items-center justify-center shrink-0">
              <Bot size={16} />
            </div>
            <div className="flex flex-col">
              <div className="px-4 py-3 bg-white border border-slate-100 rounded-2xl rounded-tl-none flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
                <span className="text-[10px] font-mono text-slate-400 ml-1">Analyzing workspace...</span>
              </div>
            </div>
          </div>
        )}

        {apiError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2 max-w-xl mx-auto">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">
              <p className="font-semibold text-rose-800">Connection Error</p>
              <p className="font-mono text-[11px] mt-0.5 leading-relaxed">{apiError}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips above input */}
      {messages.length > 0 && activeContextFileCount > 0 && !isLoading && (
        <div className="bg-slate-50 border-t border-slate-200 flex items-center gap-1 px-3 py-2 overflow-x-auto whitespace-nowrap">
          {QUICK_PROMPTS.map((qp, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSendMessage(qp.text)}
              className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/20 transition-all cursor-pointer"
            >
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Form area */}
      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={handleSubmit} className="relative flex items-end bg-slate-50 border border-slate-200 rounded-xl focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all p-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeContextFileCount > 0 
                ? "Ask workspace assistant about these checked files..." 
                : "Select text files in the file explorer, then chat here..."
            }
            rows={2}
            className="flex-1 min-h-[44px] max-h-24 resize-none bg-transparent outline-none border-none py-2 px-3 text-sm text-slate-800 font-sans leading-relaxed"
          />
          <div className="flex flex-col items-center justify-end px-2 pb-1 shrink-0">
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 transition-colors shadow-sm"
              id="send-message-btn"
            >
              <Send size={15} />
            </button>
            <div className="text-[9px] text-slate-400 font-mono mt-1 pr-1 hidden sm:flex items-center gap-0.5">
              <span>Enter to send</span>
              <CornerDownLeft size={8} />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Custom code-aware message formatter to elegantly show raw text or program segments
function MessageFormatter({ content, isUser }: { content: string; isUser: boolean }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          // It is a code block
          const lines = part.split("\n");
          // Remove first Line (```lang) and last line (```)
          const firstLine = lines[0];
          const lang = firstLine.replace("```", "").trim();
          const codeLines = lines.slice(1, -1);
          const blockCode = codeLines.join("\n");

          return (
            <div key={index}>
              <CodeBlock code={blockCode} lang={lang || "code"} />
            </div>
          );
        } else {
          // Standard text paragraphs formatted with simple bold parsing
          return (
            <div key={index} className="whitespace-pre-wrap select-text break-words">
              {formatInlineText(part, isUser)}
            </div>
          );
        }
      })}
    </div>
  );
}

// Formats helper elements like `code` tags or bold text **text** in messages
function formatInlineText(text: string, isUser: boolean) {
  // Convert bullet points to proper layout
  const lines = text.split("\n");
  const parsedLines = lines.map((line, lidx) => {
    let trimmed = line.trim();
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
    if (isBullet) {
      trimmed = trimmed.replace(/^[-*]\s+/, "");
      return (
        <li key={lidx} className="ml-4 list-disc mt-0.5">
          {parseStyleTags(trimmed, isUser)}
        </li>
      );
    }
    return <span key={lidx} className="block">{parseStyleTags(line, isUser)}</span>;
  });

  return <div className="space-y-0.5">{parsedLines}</div>;
}

function parseStyleTags(text: string, isUser: boolean) {
  // Simple bold and inline code matching
  // Replace `code` and **bold**
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(regex);
  
  if (parts.length <= 1) return text;
  
  return parts.map((part, pidx) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      const code = part.slice(1, -1);
      return (
        <code 
          key={pidx} 
          className={`font-mono text-xs px-1.5 py-0.5 rounded-sm ${
            isUser ? "bg-indigo-750 text-indigo-200" : "bg-slate-100 text-slate-800 border border-slate-200"
          }`}
        >
          {code}
        </code>
      );
    } else if (part.startsWith("**") && part.endsWith("**")) {
      const boldText = part.slice(2, -2);
      return <strong key={pidx} className="font-semibold">{boldText}</strong>;
    }
    return part;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col bg-slate-900 text-slate-100 rounded-lg border border-slate-850 my-2 overflow-hidden max-w-full font-mono text-[11px] sm:text-xs">
      <div className="flex justify-between items-center bg-slate-950 px-3 py-1.5 border-b border-slate-850">
        <span className="text-[10px] text-slate-400 capitalize font-bold">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto whitespace-pre leading-normal max-h-[300px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
