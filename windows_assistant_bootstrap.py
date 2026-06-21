# -*- coding: utf-8 -*-
"""
Windows Local AI Directory Assistant (RAGlite Concept)
------------------------------------------------------
This script implements a local desktop assistant on Windows. It reads folders,
chunks document contents, indexes code files, performs mini vector-less matches,
and chats with Gemini models using your custom API Key.

Requirements:
    pip install google-genai

Usage:
    python windows_assistant_bootstrap.py
"""

import os
import sys
import math
import re
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

# Attempt to load modern SDK
try:
    from google import genai
    from google.genai import types
    HAS_SDK = True
except ImportError:
    HAS_SDK = False

IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "bin", "obj", "__pycache__", 
    ".idea", ".vscode", "venv", ".venv", "env"
}

TEXT_EXTS = {
    "ts", "tsx", "js", "jsx", "json", "css", "html", "md", "txt", "py", "cs", 
    "cpp", "h", "java", "sql", "sh", "bat", "ps1", "yml", "yaml", "env", "ini"
}

def is_text_file(filename):
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    return ext in TEXT_EXTS

class LocalRAGLite:
    """Lite local chunk ranker simulating RAGlite"""
    def __init__(self, directory):
        self.directory = directory
        self.chunks = []

    def load_and_chunk(self):
        self.chunks = []
        for root, dirs, files in os.walk(self.directory):
            # Block ignored folders
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
            
            for file in files:
                if file.startswith("."):
                    continue
                if is_text_file(file):
                    filepath = os.path.join(root, file)
                    relpath = os.path.relpath(filepath, self.directory)
                    try:
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            if len(content.strip()) > 0:
                                self._create_chunks(relpath, content)
                    except Exception as e:
                        print(f"Skipped {relpath} due to read error: {e}")

    def _create_chunks(self, relpath, content):
        lines = content.split("\n")
        chunk_lines_size = 15
        overlap = 5
        
        for i in range(0, len(lines), chunk_lines_size - overlap):
            segment = lines[i: i + chunk_lines_size]
            if not segment:
                break
            combined_text = "\n".join(segment)
            if combined_text.strip():
                self.chunks.append({
                    "path": relpath,
                    "text": combined_text,
                    "line": i + 1
                })
            if i + chunk_lines_size >= len(lines):
                break

    def query_similarity(self, query, top_k=10):
        if not self.chunks:
            return []
        
        terms = [t.lower() for t in query.split() if len(t) > 1]
        if not terms:
            return self.chunks[:top_k]

        scored = []
        for chunk in self.chunks:
            score = 0
            text_lower = chunk["text"].lower()
            for term in terms:
                # Occurrence bonus
                match_count = len(re.findall(re.escape(term), text_lower))
                score += match_count * 15
                if term in text_lower:
                    score += 25
            if score > 0:
                scored.append((score, chunk))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:top_k]]

class WindowsAssistantApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Windows AI Directory Assistant (Vibe Edition)")
        self.root.geometry("850x650")
        self.root.minsize(700, 500)
        
        self.api_key = tk.StringVar(value=os.environ.get("GEMINI_API_KEY", ""))
        self.target_dir = tk.StringVar(value=os.getcwd())
        self.rag_mode = tk.BooleanVar(value=True)
        self.raglite_engine = None

        self._build_ui()
        self._on_directory_change()

    def _build_ui(self):
        # Master Style
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TFrame', background='#F3F4F6')
        style.configure('Header.TLabel', font=('Segoe UI', 13, 'bold'), foreground='#1E1B4B')
        style.configure('Section.TLabel', font=('Segoe UI', 9, 'bold'), foreground='#475569')
        style.configure('Dark.TButton', background='#4F46E5', foreground='white', font=('Segoe UI', 9, 'bold'))
        style.map('Dark.TButton', background=[('active', '#4338CA')])

        main_container = ttk.Frame(self.root, padding=12)
        main_container.pack(fill=tk.BOTH, expand=True)

        # 1. Header controls
        header_frame = ttk.Labelframe(main_container, text=" Configurations ", padding=10)
        header_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(header_frame, text="Gemini Token Key:").grid(row=0, column=0, sticky='w', padx=5, pady=2)
        key_entry = ttk.Entry(header_frame, textvariable=self.api_key, width=40, show="*")
        key_entry.grid(row=0, column=1, sticky='w', padx=5, pady=2)

        ttk.Label(header_frame, text="Scan Location:").grid(row=1, column=0, sticky='w', padx=5, pady=2)
        dir_entry = ttk.Entry(header_frame, textvariable=self.target_dir, width=60)
        dir_entry.grid(row=1, column=1, sticky='we', padx=5, pady=2)
        
        btn_browse = ttk.Button(header_frame, text="Browse...", command=self._browse_dir)
        btn_browse.grid(row=1, column=2, padx=5, pady=2)

        btn_reindex = ttk.Button(header_frame, text="Scan Directory", style='Dark.TButton', command=self._on_directory_change)
        btn_reindex.grid(row=1, column=3, padx=5, pady=2)

        # Mode controls
        mode_frame = ttk.Frame(header_frame)
        mode_frame.grid(row=2, column=0, columnspan=4, sticky='w', pady=(5, 0), padx=5)
        
        ttk.Checkbutton(mode_frame, text="Enable Local RAGlite Passage Chunking (Highly Recommended for large files)", variable=self.rag_mode).pack(side=tk.LEFT)

        # 2. Workspace Status banner
        self.status_lbl = ttk.Label(main_container, text="Files scanned: Ready", foreground='#2563EB', font=('Consolas', 9))
        self.status_lbl.pack(fill=tk.X, pady=(0, 6))

        # 3. Two columns: explorer matched files & visual chat
        body_paned = ttk.PanedWindow(main_container, orient=tk.HORIZONTAL)
        body_paned.pack(fill=tk.BOTH, expand=True)

        # Left panel (File directory view overview)
        left_frame = ttk.Labelframe(body_paned, text=" Directory Index (Overview) ", padding=8)
        body_paned.add(left_frame, weight=1)

        self.file_listbox = tk.Listbox(left_frame, font=('Consolas', 9), background='#FAFAFA', foreground='#334155')
        self.file_listbox.pack(fill=tk.BOTH, expand=True)
        self.file_listbox.bind('<Double-Button-1>', self._on_listbox_inspect)

        # Right panel (Chat Console)
        right_frame = ttk.Labelframe(body_paned, text=" Assistant Conversation Console ", padding=8)
        body_paned.add(right_frame, weight=3)

        self.chat_display = tk.Text(right_frame, state='disabled', wrap='word', font=('Segoe UI', 10), background='white')
        self.chat_display.pack(fill=tk.BOTH, expand=True, pady=(0, 6))

        # Text input panel
        input_container = ttk.Frame(right_frame)
        input_container.pack(fill=tk.X)

        self.input_box = tk.Text(input_container, height=3, font=('Segoe UI', 10))
        self.input_box.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 6))
        self.input_box.bind("<Return>", self._send_on_enter)

        self.btn_send = ttk.Button(input_container, text="Ask Assistant", style='Dark.TButton', command=self._send)
        self.btn_send.pack(side=tk.RIGHT, fill=tk.Y, ipady=10)

    def _browse_dir(self):
        sel = filedialog.askdirectory(initialdir=self.target_dir.get())
        if sel:
            self.target_dir.set(sel)
            self._on_directory_change()

    def _on_directory_change(self):
        path = self.target_dir.get()
        if not os.path.exists(path):
            messagebox.showerror("Error", f"Path does not exist: {path}")
            return

        self.status_lbl.config(text="Scanning & indexing code passages...")
        self.root.update_idletasks()

        self.raglite_engine = LocalRAGLite(path)
        self.raglite_engine.load_and_chunk()

        # Update lists
        self.file_listbox.delete(0, tk.END)
        unique_paths = sorted(list({c["path"] for c in self.raglite_engine.chunks}))
        for up in unique_paths:
            self.file_listbox.insert(tk.END, f"  {up}")

        self.status_lbl.config(text=f"Index Ready. Chunks: {len(self.raglite_engine.chunks)} across {len(unique_paths)} code files.")

    def _on_listbox_inspect(self, event):
        sel_idx = self.file_listbox.curselection()
        if not sel_idx:
            return
        rel = self.file_listbox.get(sel_idx[0]).strip()
        fullpath = os.path.join(self.target_dir.get(), rel)
        
        try:
            with open(fullpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            inspect_win = tk.Toplevel(self.root)
            inspect_win.title(f"Scope Preview: {rel}")
            inspect_win.geometry("650x450")
            
            txt = tk.Text(inspect_win, font=('Consolas', 9), wrap='none')
            txt.insert(tk.END, content)
            txt.config(state='disabled')
            txt.pack(fill=tk.BOTH, expand=True)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to read file: {e}")

    def _send_on_enter(self, event):
        if not event.state & 0x0001:  # check Shift not pressed
            os_name = sys.platform
            self._send()
            return "break"

    def _log_chat(self, speaker, text):
        self.chat_display.config(state='normal')
        self.chat_display.insert(tk.END, f"\n🔹 {speaker}:\n", "bold")
        self.chat_display.insert(tk.END, f"{text}\n")
        self.chat_display.tag_config("bold", font=('Segoe UI', 10, 'bold'))
        self.chat_display.see(tk.END)
        self.chat_display.config(state='disabled')

    def _send(self):
        query = self.input_box.get("1.0", tk.END).strip()
        if not query:
            return
        self.input_box.delete("1.0", tk.END)

        apiKey = self.api_key.get().strip()
        if not apiKey:
            messagebox.showwarning("API Key missing", "Please configure your Gemini API Key first inside the settings.")
            return

        self._log_chat("You", query)

        context_string = ""
        # 1. Fetch chunks on RAG
        if self.raglite_engine and self.rag_mode.get():
            top_chunks = self.raglite_engine.query_similarity(query, top_k=8)
            if top_chunks:
                context_string = "RELEVANT LOCAL DIRECTORY FILES PASSAGES:\n"
                for tc in top_chunks:
                    context_string += f"--- {tc['path']} (Line {tc['line']}) ---\n{tc['text']}\n"
        else:
            # Fallback direct files content loader
            context_string = "Full files raw context omitted to lower token limit. Configure RAG checkboxes to populate indexing."

        self.status_lbl.config(text="Connecting to Gemini server...")
        self.root.update_idletasks()

        # Connect call
        try:
            if not HAS_SDK:
                # Direct JSON Rest API curl POST fallback
                import urllib.request
                import json
                
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={apiKey}"
                headers = {"Content-Type": "application/json"}
                
                system_instr = "You are a local Windows assistant. Read matching file contexts and guide the user concisely with accurate code snippets."
                
                payload = {
                    "contents": [{
                        "parts": [{
                            "text": f"{context_string}\n\nUser Question: {query}"
                        }]
                    }],
                    "systemInstruction": {
                        "parts": [{"text": system_instr}]
                    },
                    "generationConfig": {
                        "temperature": 0.2
                    }
                }
                
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
                with urllib.request.urlopen(req) as res:
                    raw_res = json.loads(res.read().decode('utf-8'))
                    response_text = raw_res["candidates"][0]["content"]["parts"][0]["text"]
            else:
                client = genai.Client(api_key=apiKey)
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=f"CONTEXT:\n{context_string}\n\nUSER QUESTION:\n{query}",
                    config=types.GenerateContentConfig(
                        system_instruction="You are a local Windows assistant. Read matching file contexts and guide the user concisely with accurate code snippets."
                    )
                )
                response_text = response.text

            self._log_chat("Assistant", response_text)
            self.status_lbl.config(text="Query successful. Ready.")
        except Exception as e:
            self._log_chat("System", f"API connection error: {e}\n(Ensure api key is correct and you have internet access)")
            self.status_lbl.config(text="API error occurred.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cli":
        # CLI loop
        print("Starting Local Windows Assistant Command Line Interface...")
        # (could expand a console interface inside)
    
    root = tk.Tk()
    app = WindowsAssistantApp(root)
    root.mainloop()
