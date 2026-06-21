export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  isText: boolean;
  children?: FileNode[];
}

export interface FlatFile {
  path: string;
  name: string;
  size: number;
  isText: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ScanResponse {
  currentPath: string;
  absolutePath: string;
  tree: FileNode[];
  flatFiles: FlatFile[];
}
