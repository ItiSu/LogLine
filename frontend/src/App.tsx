import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { Users, Circle, Zap, Play, Terminal, ChevronDown } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript', ext: 'js' },
  { id: 'typescript', name: 'TypeScript', ext: 'ts' },
  { id: 'python', name: 'Python', ext: 'py' },
  { id: 'html', name: 'HTML', ext: 'html' },
  { id: 'css', name: 'CSS', ext: 'css' },
  { id: 'json', name: 'JSON', ext: 'json' },
  { id: 'markdown', name: 'Markdown', ext: 'md' },
  { id: 'java', name: 'Java', ext: 'java' },
  { id: 'cpp', name: 'C++', ext: 'cpp' },
  { id: 'rust', name: 'Rust', ext: 'rs' },
  { id: 'go', name: 'Go', ext: 'go' },
  { id: 'sql', name: 'SQL', ext: 'sql' },
  { id: 'yaml', name: 'YAML', ext: 'yaml' },
  { id: 'xml', name: 'XML', ext: 'xml' },
];

const DEFAULT_CODE: Record<string, string> = {
  javascript: '// Welcome to LogLine\n// Select a language and start coding\n\nconsole.log("Hello, World!");\n',
  typescript: '// Welcome to LogLine\n// TypeScript enabled\n\nconst greeting: string = "Hello, World!";\nconsole.log(greeting);\n',
  python: '# Welcome to LogLine\n# Python mode\n\nprint("Hello, World!")\n',
  html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>LogLine</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>\n',
  css: '/* Welcome to LogLine */\n/* CSS styling */\n\nbody {\n  font-family: sans-serif;\n  background: #f5f5f5;\n}\n',
  json: '{\n  "message": "Welcome to LogLine",\n  "version": "1.0.0"\n}\n',
  markdown: '# Welcome to LogLine\n\nReal-time collaborative editor\n\n- Edit simultaneously\n- Multiple languages\n- Live preview\n',
  java: '// Welcome to LogLine\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  cpp: '// Welcome to LogLine\n\n#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}\n',
  rust: '// Welcome to LogLine\n\nfn main() {\n    println!("Hello, World!");\n}\n',
  go: '// Welcome to LogLine\n\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n',
  sql: '-- Welcome to LogLine\n-- SQL mode\n\nSELECT \'Hello, World!\' AS greeting;\n',
  yaml: '# Welcome to LogLine\n# YAML configuration\n\napp:\n  name: LogLine\n  version: "1.0.0"\n',
  xml: '<?xml version="1.0"?>\n<!-- Welcome to LogLine -->\n<root>\n  <message>Hello, World!</message>\n</root>\n',
};

type UserCursor = {
  userId: string;
  color: string;
  position: { lineNumber: number; column: number };
  selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
};

type UserInfo = {
  id: string;
  color: string;
  name: string;
};

function App() {
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('javascript');
  const [userCount, setUserCount] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showOutput, setShowOutput] = useState<boolean>(false);
  const [userCursors, setUserCursors] = useState<Map<string, UserCursor>>(new Map());
  const [userList, setUserList] = useState<UserInfo[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const isRemoteUpdate = useRef<boolean>(false);
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize socket connection
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setConnectionStatus('connecting');
    });

    // Initial document state
    socket.on('document:init', (data) => {
      setContent(data.content);
      setUserCount(data.users);
    });

    // Document updates from other users
    socket.on('document:update', (data) => {
      if (data.content !== content) {
        isRemoteUpdate.current = true;
        setContent(data.content);
        
        // Update editor if it exists
        if (editorRef.current) {
          const editor = editorRef.current;
          const position = editor.getPosition();
          editor.setValue(data.content);
          if (position) {
            editor.setPosition(position);
          }
        }
      }
    });

    // Presence updates
    socket.on('presence:update', (data: { count: number; users: UserInfo[] }) => {
      setUserCount(data.count);
      setUserList(data.users || []);
    });

    // Cursor updates from other users
    socket.on('cursor:update', (data: UserCursor) => {
      setUserCursors(prev => {
        const newMap = new Map(prev);
        newMap.set(data.userId, data);
        return newMap;
      });
    });

    // Remove cursor when user disconnects
    socket.on('user:left', (userId: string) => {
      setUserCursors(prev => {
        const newMap = new Map(prev);
        newMap.delete(userId);
        return newMap;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [content]);

  // Handle local editor changes
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value) return;
    
    // Only send if this is a local edit (not from remote update)
    if (!isRemoteUpdate.current) {
      setContent(value);
      socketRef.current?.emit('document:edit', { content: value });
    }
    isRemoteUpdate.current = false;
  }, []);

  // Handle language change
  const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setLanguage(newLang);
  }, []);

  // Handle code execution
  const handleRunCode = useCallback(async () => {
    if (!content.trim()) return;
    
    setIsRunning(true);
    setShowOutput(true);
    setOutput('Running...\n');

    try {
      const response = await fetch(`${API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: content, language }),
      });
      
      const result = await response.json();
      setOutput(result.output || result.error || 'No output');
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Failed to execute code'}`);
    } finally {
      setIsRunning(false);
    }
  }, [content, language]);

  // Store cursor widgets
  const cursorWidgetsRef = useRef<Map<string, any>>(new Map());

  // Update cursor decorations when userCursors change
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const monaco = (window as any).monaco;
    if (!monaco) return;

    // Get current user ID
    const currentUserId = socketRef.current?.id;

    // Remove widgets for users that are no longer in userCursors
    cursorWidgetsRef.current.forEach((widget, userId) => {
      if (!userCursors.has(userId) || userId === currentUserId) {
        editor.removeContentWidget(widget);
        cursorWidgetsRef.current.delete(userId);
      }
    });

    // Update or create widgets for each cursor
    userCursors.forEach((cursor) => {
      if (cursor.userId === currentUserId) return; // Skip self

      const existingWidget = cursorWidgetsRef.current.get(cursor.userId);
      
      if (existingWidget) {
        // Update existing widget position
        existingWidget.updatePosition(cursor.position, cursor.color);
      } else {
        // Create new widget
        const widget = createCursorWidget(cursor, monaco, editor);
        editor.addContentWidget(widget);
        cursorWidgetsRef.current.set(cursor.userId, widget);
      }
    });
  }, [userCursors]);

  // Helper function to create cursor widget
  const createCursorWidget = (cursor: UserCursor, monaco: any, editor: any) => {
    const domNode = document.createElement('div');
    domNode.className = 'remote-cursor-container';
    domNode.style.pointerEvents = 'none';
    
    // Get user's first name from userList
    const userInfo = userList.find(u => u.id === cursor.userId);
    const userName = userInfo ? userInfo.name.split('-')[0] : 'User';
    
    domNode.innerHTML = `
      <div class="remote-cursor-line" style="
        position: absolute;
        width: 2px;
        height: 20px;
        background-color: ${cursor.color};
      "></div>
      <div class="remote-cursor-label" style="
        position: absolute;
        top: -22px;
        left: 0;
        background-color: ${cursor.color};
        color: white;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
        font-family: 'Inter', sans-serif;
        font-weight: 500;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      ">${userName}</div>
    `;

    return {
      getId: () => `cursor-${cursor.userId}`,
      getDomNode: () => domNode,
      getPosition: () => ({
        position: {
          lineNumber: cursor.position.lineNumber,
          column: cursor.position.column
        },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
      }),
      updatePosition: (position: any, color: string) => {
        const newPosition = editor.getPosition();
        if (newPosition) {
          // Widget will automatically reposition on next layout
        }
      }
    };
  };

  // Handle editor mount
  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;

    // Track local cursor position and send to server
    editor.onDidChangeCursorPosition((e: any) => {
      socketRef.current?.emit('cursor:move', {
        position: {
          lineNumber: e.position.lineNumber,
          column: e.position.column
        },
        selection: editor.getSelection() ? {
          startLineNumber: editor.getSelection().startLineNumber,
          startColumn: editor.getSelection().startColumn,
          endLineNumber: editor.getSelection().endLineNumber,
          endColumn: editor.getSelection().endColumn
        } : null
      });
    });
  }, []);

  // Get status indicator color
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10b981';
      case 'connecting': return '#f59e0b';
      case 'disconnected': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Live';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Offline';
      default: return 'Unknown';
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <Zap size={20} className="logo-icon" />
            <span>LogLine</span>
          </div>
          <div className="divider" />
          <div className="language-selector">
            <select value={language} onChange={handleLanguageChange}>
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="selector-icon" />
          </div>
        </div>
        
        <div className="header-right">
          <button 
            className="run-button"
            onClick={handleRunCode}
            disabled={isRunning || !content.trim()}
          >
            <Play size={14} fill="currentColor" />
            <span>{isRunning ? 'Running...' : 'Run'}</span>
          </button>
          
          <button 
            className={`output-toggle ${showOutput ? 'active' : ''}`}
            onClick={() => setShowOutput(!showOutput)}
          >
            <Terminal size={14} />
            <span>Output</span>
          </button>
          
          <div className="divider" />
          
          <div 
            className="presence clickable" 
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            ref={dropdownRef}
          >
            <Users size={16} />
            <span className="user-count">{userCount}</span>
            <span className="user-label">{userCount === 1 ? 'user' : 'users'}</span>
            
            {showUserDropdown && userList.length > 0 && (
              <div className="user-dropdown">
                {userList.map((user) => (
                  <div key={user.id} className="user-item">
                    <span 
                      className="user-color-dot" 
                      style={{ backgroundColor: user.color }}
                    />
                    <span className="user-name">{user.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="status">
            <Circle 
              size={8} 
              fill={getStatusColor()} 
              stroke={getStatusColor()} 
            />
            <span className="status-text" style={{ color: getStatusColor() }}>
              {getStatusText()}
            </span>
          </div>
        </div>
      </header>

      <div className="main-content">
        <main className={`editor-container ${showOutput ? 'with-output' : ''}`}>
          <Editor
            height="100%"
            language={language}
            theme="vs-light"
            value={content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: 'JetBrains Mono, monospace',
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              readOnly: false,
              automaticLayout: true,
              padding: { top: 20, bottom: 20 },
              lineHeight: 24,
              renderWhitespace: 'selection',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              tabSize: 2,
            }}
          />
        </main>

        {showOutput && (
          <div className="output-panel">
            <div className="output-header">
              <Terminal size={14} />
              <span>Console Output</span>
            </div>
            <pre className="output-content">{output}</pre>
          </div>
        )}
      </div>

      <footer className="footer">
        <span>Created by Itiza Subedi · <a href="https://github.com/itisu" target="_blank" rel="noopener noreferrer">GitHub</a></span>
      </footer>
    </div>
  );
}

export default App;