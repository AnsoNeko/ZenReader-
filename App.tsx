import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BookMetadata, Chapter, AppSettings, ReadingProgress, Bookmark, ExportData } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { parseFile } from './utils/fileParser';
import { summarizeChapter } from './services/geminiService';
import { saveBookToDB, getAllBooksMetadata, getBookFromDB, deleteBookFromDB, updateBookLastRead, LibraryBook } from './utils/db';
import Reader from './components/Reader';
import SettingsPanel from './components/SettingsPanel';
import { 
  Book as BookIcon, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Bookmark as BookmarkIcon, 
  Settings, 
  FileText, 
  BrainCircuit, 
  Trash2,
  Plus,
  Library,
  Archive,
  ArchiveRestore
} from 'lucide-react';

const STORAGE_KEY_SETTINGS = 'zenreader_settings';
const STORAGE_KEY_PROGRESS = 'zenreader_progress';
const STORAGE_KEY_BOOKMARKS = 'zenreader_bookmarks';

const App: React.FC = () => {
  // State
  const [book, setBook] = useState<{ metadata: BookMetadata; chapters: Chapter[] } | null>(null);
  const [fullText, setFullText] = useState<string | null>(null); // Store full text for lazy loading
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark[]>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'bookmarks' | 'settings'>('toc');
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Library State
  const [library, setLibrary] = useState<LibraryBook[]>([]);

  // Refs for file inputs
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Load Initial Data
  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    const savedProgress = localStorage.getItem(STORAGE_KEY_PROGRESS);
    const savedBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARKS);

    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedProgress) setProgress(JSON.parse(savedProgress));
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));

    // Load library from IndexedDB
    refreshLibrary();
  }, []);

  const refreshLibrary = async () => {
    try {
      const books = await getAllBooksMetadata();
      // Sort by lastReadTimestamp desc, then addedAt desc
      setLibrary(books.sort((a, b) => {
          const timeA = a.metadata.lastReadTimestamp || a.addedAt;
          const timeB = b.metadata.lastReadTimestamp || b.addedAt;
          return timeB - timeA;
      }));
    } catch (e) {
      console.error("Failed to load library", e);
    }
  };

  // Persist Data
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    // Apply theme to body
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(bookmarks));
  }, [bookmarks]);

  // Auto-scroll TOC to active chapter
  useEffect(() => {
    if (sidebarTab === 'toc') {
        const timer = setTimeout(() => {
            const activeEl = document.getElementById('active-chapter-item');
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [sidebarOpen, sidebarTab, currentChapterIndex, book]);

  // Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    // Explicitly type fileList as File[] to avoid 'unknown' type inference issues
    const fileList = Array.from(files) as File[];
    let successCount = 0;
    let failList: string[] = [];

    // Process files sequentially to avoid overwhelming browser memory
    for (const file of fileList) {
        try {
            const data = await parseFile(file);
            // Use file name + size as ID to be relatively unique but persistent for same file
            const bookId = `${file.name}-${file.size}`; 
            
            const newBookMetadata: BookMetadata = {
                id: bookId,
                title: data.title,
                fileName: file.name,
                fileType: file.name.split('.').pop() as any,
                lastReadTimestamp: Date.now(),
                totalChapters: data.chapters.length
            };

            // Save to Library DB
            await saveBookToDB({
                id: bookId,
                file: file,
                metadata: newBookMetadata,
                addedAt: Date.now()
            });
            successCount++;
        } catch (err) {
            console.error(`Error importing ${file.name}:`, err);
            failList.push(file.name);
        }
    }

    await refreshLibrary();
    setLoading(false);

    if (failList.length > 0) {
        alert(`导入完成。\n成功: ${successCount} 本\n失败: ${failList.length} 本\n\n失败文件: ${failList.join(', ')}\n请检查文件格式。`);
    } else if (fileList.length > 1) {
        // Optional: Notify user if bulk import was fully successful (for single file, simply appearing is enough feedback)
        // alert(`成功导入 ${successCount} 本书籍。`);
    }
  };

  const handleOpenFromLibrary = async (libraryBook: LibraryBook) => {
      setLoading(true);
      try {
          // Update last read timestamp in DB immediately
          await updateBookLastRead(libraryBook.id, Date.now());
          
          // Retrieve full Blob from DB
          const record = await getBookFromDB(libraryBook.id);
          if (!record) {
              alert("找不到文件，可能已被删除。");
              await refreshLibrary();
              return;
          }

          // Convert Blob back to File object for the parser (needs name)
          const file = new File([record.file], record.metadata.fileName, { type: record.file.type });
          
          // Re-parse (Parsing is fast enough usually, and safer than storing massive JSON structure in IDB)
          setFullText(null);
          const data = await parseFile(file);

          const newBook = {
            metadata: {
                ...record.metadata,
                lastReadTimestamp: Date.now() // Ensure local state is also fresh
            },
            chapters: data.chapters
          };

          setBook(newBook);
          if (data.fullText) setFullText(data.fullText);

           // Restore progress
            if (progress[record.id]) {
                const savedChapterId = progress[record.id].currentChapterId;
                const index = data.chapters.findIndex(c => c.id === savedChapterId);
                if (index >= 0) setCurrentChapterIndex(index);
            } else {
                setCurrentChapterIndex(0);
            }
            setSidebarOpen(false);
            
            // Refresh library in background to update sort order
            refreshLibrary();

      } catch (err) {
          console.error(err);
          alert("打开书籍失败");
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteBook = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      console.log("Delete button clicked for", id);
      
      if (window.confirm("确定要从书架删除这本书吗？")) {
          // Cleanup LocalStorage state
          setProgress(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
          });
          setBookmarks(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
          });

          await deleteBookFromDB(id);
          await refreshLibrary();
      }
  };

  // Full Backup Logic using JSZip
  const handleFullBackup = async () => {
      if (!window.JSZip) {
          alert("正在加载 Zip 组件，请检查网络或稍后重试。");
          return;
      }
      setLoading(true);
      try {
          const zip = new window.JSZip();
          const books = await getAllBooksMetadata();
          
          // 1. Add Metadata JSON
          const data = {
              version: 1,
              timestamp: Date.now(),
              progress,
              bookmarks,
              settings,
              bookList: books.map(b => ({ id: b.id, metadata: b.metadata, addedAt: b.addedAt }))
          };
          zip.file("zenreader_backup.json", JSON.stringify(data));

          // 2. Add Book Files
          const booksFolder = zip.folder("books");
          if (booksFolder) {
              books.forEach(book => {
                   booksFolder.file(book.id, book.file);
              });
          }

          // 3. Generate Zip
          const content = await zip.generateAsync({ type: "blob" });
          
          // 4. Download
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = `zenreader_full_backup_${new Date().toISOString().slice(0,10)}.zip`;
          a.click();
          URL.revokeObjectURL(url);
          
      } catch (e) {
          console.error(e);
          alert("备份导出失败");
      } finally {
          setLoading(false);
      }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      
      // Check for JSZip first
      if (!window.JSZip) {
         alert("系统组件 (JSZip) 尚未加载完成，请刷新页面或稍后重试。");
         if (e.target) e.target.value = ''; // Reset to allow retry
         return;
      }

      if (!file) return;

      if (!window.confirm("导入备份将覆盖当前的进度和设置（现有书籍会保留，但同名书籍会被覆盖）。确定继续吗？")) {
          // IMPORTANT: Reset input if cancelled so selecting the same file again works
          if (e.target) e.target.value = '';
          return;
      }

      setLoading(true);
      try {
          const zip = await window.JSZip.loadAsync(file);
          
          // 1. Read Metadata
          const metaFile = zip.file("zenreader_backup.json");
          if (!metaFile) throw new Error("无效的备份文件：缺少配置文件");
          
          const metaStr = await metaFile.async("string");
          const data = JSON.parse(metaStr);

          // 2. Restore LocalStorage Data
          if (data.progress) setProgress(data.progress);
          if (data.bookmarks) setBookmarks(data.bookmarks);
          if (data.settings) setSettings(data.settings);

          // 3. Restore Books to IndexedDB
          const booksFolder = zip.folder("books");
          if (booksFolder && data.bookList) {
               for (const bookMeta of data.bookList) {
                   const fileData = await booksFolder.file(bookMeta.id)?.async("blob");
                   if (fileData) {
                       await saveBookToDB({
                           id: bookMeta.id,
                           file: fileData,
                           metadata: bookMeta.metadata,
                           addedAt: bookMeta.addedAt || Date.now()
                       });
                   }
               }
          }

          alert("备份恢复成功！");
          await refreshLibrary();
          
      } catch (e) {
          console.error(e);
          alert("恢复失败：文件格式错误或损坏");
      } finally {
          setLoading(false);
          // Always clear input after operation to allow selecting same file later
          if (backupInputRef.current) backupInputRef.current.value = '';
      }
  };

  const handleUpdateProgress = useCallback((percentage: number) => {
    if (!book) return;
    const currentChapter = book.chapters[currentChapterIndex];
    
    // Store more metadata in progress to display on bookshelf without loading the file
    setProgress(prev => ({
      ...prev,
      [book.metadata.id]: {
        bookId: book.metadata.id,
        currentChapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        currentChapterIndex: currentChapterIndex,
        totalChapters: book.chapters.length,
        scrollPercentage: percentage
      }
    }));
  }, [book, currentChapterIndex]);

  const handleAddBookmark = (b: Omit<Bookmark, 'id' | 'timestamp'>) => {
    if (!book) return;
    const newBookmark: Bookmark = {
      ...b,
      id: Date.now().toString(),
      timestamp: Date.now()
    };
    
    setBookmarks(prev => ({
      ...prev,
      [book.metadata.id]: [...(prev[book.metadata.id] || []), newBookmark]
    }));
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    if (!book) return;
    setBookmarks(prev => {
        const list = prev[book.metadata.id] || [];
        return {
            ...prev,
            [book.metadata.id]: list.filter(b => b.id !== bookmarkId)
        };
    });
  };

  // Only used for Settings Panel export (lightweight JSON)
  const handleSettingsExport = () => {
    const data: ExportData = {
      version: 1,
      progress,
      bookmarks,
      settings
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zenreader-settings.json';
    a.click();
  };

  const handleSettingsImport = (data: ExportData) => {
    if (data.settings) setSettings(data.settings);
    if (data.progress) setProgress(data.progress);
    if (data.bookmarks) setBookmarks(data.bookmarks);
    alert("配置导入成功！");
  };

  const handleAiSummarize = async (text: string) => {
      setAiLoading(true);
      setAiSummary(null);
      const summary = await summarizeChapter(text);
      setAiSummary(summary);
      setAiLoading(false);
  };

  // Derive current chapter content safely
  const activeChapterData = useMemo(() => {
    if (!book) return null;
    const chapter = book.chapters[currentChapterIndex];
    
    // If content exists (EPUB/DOCX), use it
    if (chapter.content) {
        return chapter;
    }

    // If TXT, lazy load from fullText
    if (fullText && chapter.startStringIndex !== undefined) {
        const end = chapter.endStringIndex !== undefined ? chapter.endStringIndex : fullText.length;
        let rawContent = fullText.substring(chapter.startStringIndex, end);
        
        const firstNewline = rawContent.indexOf('\n');
        if (firstNewline !== -1) {
            const firstLine = rawContent.substring(0, firstNewline).trim();
            if (firstLine.includes(chapter.title.trim()) || chapter.title.trim().includes(firstLine)) {
                rawContent = rawContent.substring(firstNewline + 1);
            }
        }

        return {
            ...chapter,
            content: rawContent.split('\n').map(line => `<p>${line}</p>`).join('')
        };
    }

    return { ...chapter, content: '<p>正在加载内容...</p>' };
  }, [book, currentChapterIndex, fullText]);


  // Rendering: Bookshelf View
  if (!book) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <BookIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">我的书架</h1>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={handleFullBackup}
                        disabled={loading}
                        className={`flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="导出包含所有书籍文件和进度的备份包"
                    >
                        <Archive className="w-4 h-4" />
                        <span>导出备份</span>
                    </button>
                    <label className={`flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200 cursor-pointer ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <ArchiveRestore className="w-4 h-4" />
                        <span>恢复备份</span>
                        <input 
                            ref={backupInputRef}
                            type="file" 
                            accept=".zip" 
                            className="hidden" 
                            onClick={(e) => { e.currentTarget.value = ''; }}
                            onChange={handleRestoreBackup}
                            disabled={loading}
                        />
                    </label>
                </div>
            </header>

            {loading && (
                 <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col items-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-4"></div>
                        <p className="text-gray-700 dark:text-gray-200">正在处理...</p>
                    </div>
                 </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {/* Book Cards - Rendered FIRST */}
                {library.map((item) => {
                    const itemProgress = progress[item.id];
                    let displayPercent = 0;
                    let lastReadLabel = "未开始";

                    if (itemProgress) {
                        const currentIdx = itemProgress.currentChapterIndex || 0;
                        const totalChapters = itemProgress.totalChapters || 1; 
                        const chapterScroll = itemProgress.scrollPercentage || 0;
                        
                        if (itemProgress.totalChapters) {
                             displayPercent = ((currentIdx + chapterScroll) / totalChapters) * 100;
                        }
                        
                        displayPercent = Math.min(100, Math.max(0, displayPercent));
                        
                        if (itemProgress.chapterTitle) {
                            lastReadLabel = itemProgress.chapterTitle;
                        } else if (itemProgress.currentChapterId) {
                            lastReadLabel = "继续阅读"; 
                        }
                    }

                    const gradients = [
                        'from-blue-400 to-indigo-600',
                        'from-emerald-400 to-teal-600',
                        'from-orange-400 to-red-600',
                        'from-pink-400 to-rose-600',
                        'from-purple-400 to-violet-600'
                    ];
                    const gradientClass = gradients[item.id.length % gradients.length];

                    return (
                        <div 
                            key={item.id} 
                            onClick={() => handleOpenFromLibrary(item)}
                            className="group relative flex flex-col h-64 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-xl transition-all overflow-hidden border border-gray-100 dark:border-gray-700 cursor-pointer"
                        >
                            {/* Visual Content Layer */}
                            <div className="flex flex-col h-full pointer-events-none">
                                <div className={`h-2/5 w-full bg-gradient-to-br ${gradientClass} flex items-center justify-center relative`}>
                                    <FileText className="w-12 h-12 text-white/50" />
                                    <span className="absolute bottom-2 right-2 text-xs font-bold text-white/80 bg-black/20 px-2 py-0.5 rounded uppercase">
                                        {item.metadata.fileType}
                                    </span>
                                </div>

                                <div className="p-4 flex flex-col flex-1 justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 line-clamp-2 mb-1" title={item.metadata.title}>
                                            {item.metadata.title}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {new Date(item.metadata.lastReadTimestamp || item.addedAt).toLocaleDateString()}
                                            {item.metadata.lastReadTimestamp ? ' 阅读' : ' 添加'}
                                        </p>
                                    </div>

                                    <div className="mt-2">
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            <span className="truncate max-w-[70%]" title={lastReadLabel}>
                                                {lastReadLabel}
                                            </span>
                                            <span className="font-mono">{displayPercent.toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className="bg-primary-500 h-full transition-all duration-500 ease-out"
                                                style={{ width: `${displayPercent}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Delete Button - Placed in a high z-index container */}
                            <div className="absolute top-2 right-2 z-50">
                                <button 
                                    type="button"
                                    onClick={(e) => handleDeleteBook(e, item.id)}
                                    className="p-1.5 bg-black/20 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm cursor-pointer"
                                    title="删除书籍"
                                >
                                    <Trash2 className="w-4 h-4 pointer-events-none" />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Upload Card - Rendered LAST */}
                <label className="group flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-gray-700/50 transition-all order-last">
                    <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-700 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors mb-4">
                        <Plus className="w-8 h-8 text-gray-400 group-hover:text-primary-600 dark:text-gray-300" />
                    </div>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">导入新书籍</span>
                    <span className="text-xs text-gray-400 mt-1">.txt, .epub, .docx</span>
                    <input 
                        type="file" 
                        className="hidden" 
                        accept=".txt,.docx,.epub" 
                        multiple 
                        onClick={(e) => { e.currentTarget.value = ''; }}
                        onChange={handleFileUpload} 
                        disabled={loading}
                    />
                </label>
            </div>
            
            {library.length === 0 && !loading && (
                <div className="mt-12 text-center text-gray-400">
                    <Library className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>您的书架是空的，导入一本书开始阅读吧。</p>
                </div>
            )}
        </div>
      </div>
    );
  }

  const bookBookmarks = bookmarks[book.metadata.id] || [];

  return (
    <div className={`flex h-screen overflow-hidden ${settings.theme === 'dark' ? 'dark' : ''}`}>
      
      {/* Mobile Backdrop Overlay - Closes sidebar when clicking outside */}
      {book && sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 flex flex-col shadow-2xl lg:shadow-none`}
      >
         {/* Sidebar Header */}
         <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800 gap-2">
            <div className="flex-1 min-w-0">
                <h2 className="font-bold text-gray-800 dark:text-white truncate" title={book.metadata.title}>
                    {book.metadata.title}
                </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setBook(null); setFullText(null); refreshLibrary(); }} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium whitespace-nowrap px-2 py-1 rounded hover:bg-primary-50 dark:hover:bg-primary-900/20">
                    书架
                </button>
                {/* Mobile Close Button */}
                <button 
                    onClick={() => setSidebarOpen(false)}
                    className="lg:hidden p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                    title="收起侧边栏"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            </div>
         </div>

         {/* Sidebar Tabs */}
         <div className="flex border-b dark:border-gray-700">
            <button 
                onClick={() => setSidebarTab('toc')}
                className={`flex-1 py-3 text-sm font-medium flex justify-center ${sidebarTab === 'toc' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 dark:text-gray-400'}`}
                title="目录"
            >
                <Menu className="w-4 h-4" />
            </button>
            <button 
                onClick={() => setSidebarTab('bookmarks')}
                className={`flex-1 py-3 text-sm font-medium flex justify-center ${sidebarTab === 'bookmarks' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 dark:text-gray-400'}`}
                title="书签"
            >
                <BookmarkIcon className="w-4 h-4" />
            </button>
            <button 
                onClick={() => setSidebarTab('settings')}
                className={`flex-1 py-3 text-sm font-medium flex justify-center ${sidebarTab === 'settings' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 dark:text-gray-400'}`}
                title="设置"
            >
                <Settings className="w-4 h-4" />
            </button>
         </div>

         {/* Sidebar Content */}
         <div className="flex-1 overflow-y-auto">
            {sidebarTab === 'toc' && (
                <ul className="py-2">
                    {book.chapters.map((chap, idx) => (
                        <li key={chap.id}>
                            <button
                                id={idx === currentChapterIndex ? 'active-chapter-item' : undefined}
                                onClick={() => {
                                    setCurrentChapterIndex(idx);
                                    if(window.innerWidth < 1024) setSidebarOpen(false);
                                }}
                                className={`w-full text-left px-4 py-3 text-sm truncate transition-colors ${idx === currentChapterIndex ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-l-4 border-primary-500' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                                {chap.title}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {sidebarTab === 'bookmarks' && (
                <div className="p-4 space-y-3">
                    {bookBookmarks.length === 0 && <p className="text-gray-400 text-sm text-center italic">暂无书签。</p>}
                    {bookBookmarks.map((bm) => (
                        <div key={bm.id} className="group bg-gray-50 dark:bg-gray-800 p-3 rounded border dark:border-gray-700 hover:shadow-md transition-all cursor-pointer relative" 
                             onClick={() => {
                                const chIdx = book.chapters.findIndex(c => c.id === bm.chapterId);
                                if (chIdx >= 0) setCurrentChapterIndex(chIdx);
                             }}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                    {new Date(bm.timestamp).toLocaleDateString()}
                                </span>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteBookmark(bm.id);
                                    }}
                                    className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                                    title="删除书签"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3 leading-relaxed border-l-2 border-primary-300 pl-2">
                                {bm.textSnippet}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {sidebarTab === 'settings' && (
                <SettingsPanel 
                    settings={settings} 
                    onUpdateSettings={setSettings} 
                    onExport={handleSettingsExport}
                    onImport={handleSettingsImport}
                />
            )}
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex flex-col h-full bg-gray-100 dark:bg-black transition-colors">
        {/* Toggle Sidebar Mobile - Only show when closed */}
        {!sidebarOpen && (
            <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden absolute top-4 left-4 z-20 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md text-gray-700 dark:text-gray-200"
            >
                <Menu className="w-5 h-5" />
            </button>
        )}

        {/* Reader Area */}
        <div className="flex-1 overflow-hidden relative">
            {activeChapterData && (
                <Reader
                    key={activeChapterData.id} 
                    chapter={activeChapterData as Chapter}
                    settings={settings}
                    initialScrollPercentage={
                        (progress[book.metadata.id]?.currentChapterId === activeChapterData.id) 
                        ? progress[book.metadata.id].scrollPercentage 
                        : 0
                    }
                    hasPrevious={currentChapterIndex > 0}
                    hasNext={currentChapterIndex < book.chapters.length - 1}
                    onScrollProgress={handleUpdateProgress}
                    onAddBookmark={handleAddBookmark}
                    onSummarize={handleAiSummarize}
                    onPrevChapter={() => setCurrentChapterIndex(c => c - 1)}
                    onNextChapter={() => setCurrentChapterIndex(c => c + 1)}
                />
            )}
            
            {/* Navigation Overlay Arrows */}
            {currentChapterIndex > 0 && (
                <button 
                    onClick={() => setCurrentChapterIndex(c => c - 1)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 dark:bg-gray-800/80 rounded-full shadow hover:bg-white dark:hover:bg-gray-700 transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                    title="上一章"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            {currentChapterIndex < book.chapters.length - 1 && (
                <button 
                    onClick={() => setCurrentChapterIndex(c => c + 1)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 dark:bg-gray-800/80 rounded-full shadow hover:bg-white dark:hover:bg-gray-700 transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                    title="下一章"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}
        </div>
      </div>

      {/* AI Summary Modal */}
      {(aiSummary || aiLoading) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                  <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                        <BrainCircuit className="w-6 h-6" />
                        <h3 className="font-bold text-lg">AI 智能分析</h3>
                      </div>
                      <button onClick={() => { setAiSummary(null); setAiLoading(false); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                      {aiLoading ? (
                          <div className="flex flex-col items-center py-8">
                              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                              <p className="text-gray-500 animate-pulse">正在使用 Gemini 分析文本...</p>
                          </div>
                      ) : (
                          <div className="prose dark:prose-invert text-sm leading-relaxed">
                              {aiSummary?.split('\n').map((para, i) => (
                                  <p key={i} className="mb-2">{para}</p>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;