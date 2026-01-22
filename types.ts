export interface Chapter {
  id: string;
  title: string;
  content?: string; // Content is now optional, used for EPUB/DOCX or loaded dynamically for TXT
  index: number;
  startStringIndex?: number; // For TXT lazy loading
  endStringIndex?: number;   // For TXT lazy loading
}

export interface Bookmark {
  id: string;
  chapterId: string;
  textSnippet: string;
  timestamp: number;
  scrollPercentage: number;
}

export interface BookMetadata {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  fileType: 'txt' | 'docx' | 'epub' | 'doc';
  lastReadTimestamp: number;
  totalChapters: number;
  encoding?: string; // Save detected encoding
}

export interface ReadingProgress {
  bookId: string;
  currentChapterId: string;
  chapterTitle?: string;     // Added: To display on bookshelf
  currentChapterIndex?: number; // Added: To calculate global percentage
  totalChapters?: number;    // Added: To calculate global percentage
  scrollPercentage: number; // 0 to 1 (intra-chapter)
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'sepia';
  fontSize: number; // in pixels
  lineHeight: number;
  fontFamily: 'serif' | 'sans';
}

export interface ExportData {
  version: number;
  progress: Record<string, ReadingProgress>;
  bookmarks: Record<string, Bookmark[]>;
  settings: AppSettings;
}

// Declarations for global libraries loaded via CDN
declare global {
  interface Window {
    mammoth: any;
    ePub: any;
    jschardet: any;
  }
}