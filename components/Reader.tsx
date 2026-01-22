import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Chapter, AppSettings, Bookmark } from '../types';
import { BookmarkPlus, MessageSquareQuote, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  chapter: Chapter;
  settings: AppSettings;
  initialScrollPercentage: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onScrollProgress: (percentage: number) => void;
  onAddBookmark: (b: Omit<Bookmark, 'id' | 'timestamp'>) => void;
  onSummarize: (text: string) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
}

const Reader: React.FC<Props> = ({ 
  chapter, 
  settings, 
  initialScrollPercentage, 
  hasPrevious,
  hasNext,
  onScrollProgress, 
  onAddBookmark,
  onSummarize,
  onPrevChapter,
  onNextChapter
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [selection, setSelection] = useState<string>('');
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });

  // Handle Initial Scroll
  useEffect(() => {
    if (containerRef.current && initialScrollPercentage > 0) {
       const scrollHeight = containerRef.current.scrollHeight - containerRef.current.clientHeight;
       containerRef.current.scrollTop = scrollHeight * initialScrollPercentage;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]); // Only run when chapter changes, but we ideally want to wait for render.

  // Handle Scroll tracking with debounce
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const maxScroll = scrollHeight - clientHeight;
    const percentage = maxScroll > 0 ? scrollTop / maxScroll : 0;
    onScrollProgress(percentage);
  }, [onScrollProgress]);

  // Handle Text Selection for Context Menu
  useEffect(() => {
    const handleSelection = (e: Event) => {
      // Ignore interactions inside the toolbar to prevent it from closing itself before click registers
      const target = e.target as HTMLElement;
      if (target.closest('[data-zen-toolbar]')) {
          return;
      }

      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Calculate relative position within the container? 
        // Or fixed position on screen. Fixed is easier.
        setToolbarPosition({
            x: rect.left + (rect.width / 2) - 40, // Center approx
            y: rect.top - 50 // Above text
        });
        setSelection(sel.toString());
        setShowToolbar(true);
      } else {
        setShowToolbar(false);
      }
    };

    const el = containerRef.current;
    if(el) {
        // We attach to mouseup to capture selection finish
        el.addEventListener('mouseup', handleSelection);
        el.addEventListener('keyup', handleSelection);
        el.addEventListener('scroll', handleScroll);
    }

    return () => {
        if(el) {
            el.removeEventListener('mouseup', handleSelection);
            el.removeEventListener('keyup', handleSelection);
            el.removeEventListener('scroll', handleScroll);
        }
    };
  }, [handleScroll]);

  const handleBookmarkClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop propagation
    if(!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const maxScroll = scrollHeight - clientHeight;
    const percentage = maxScroll > 0 ? scrollTop / maxScroll : 0;

    onAddBookmark({
        chapterId: chapter.id,
        textSnippet: selection.substring(0, 50) + (selection.length > 50 ? '...' : ''),
        scrollPercentage: percentage
    });
    setShowToolbar(false);
    window.getSelection()?.removeAllRanges();
  };

  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-300',
    sepia: 'bg-[#f4ecd8] text-[#5b4636]'
  };

  return (
    <div 
      ref={containerRef}
      className={`h-full overflow-y-auto relative outline-none transition-colors duration-300 ${themeClasses[settings.theme]}`}
      style={{
          fontFamily: settings.fontFamily === 'serif' ? '"Merriweather", "Georgia", "Songti SC", "SimSun", serif' : 'system-ui, "Microsoft YaHei", sans-serif',
      }}
    >
      <div 
        className="max-w-3xl mx-auto px-6 py-12 min-h-screen flex flex-col"
        style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight
        }}
      >
        <h2 className="text-3xl font-bold mb-8 opacity-70 border-b pb-4">{chapter.title}</h2>
        
        {/* Render HTML content safely */}
        <div 
          className="prose dark:prose-invert max-w-none flex-1"
          dangerouslySetInnerHTML={{ __html: chapter.content }} 
        />
        
        {/* Bottom Navigation Area */}
        <div className="mt-20 pt-10 border-t border-gray-200 dark:border-gray-700">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                
                {/* Left: Previous Chapter */}
                <div className="col-span-1 flex justify-start order-2 md:order-1">
                    {hasPrevious && (
                        <button 
                            onClick={onPrevChapter}
                            className="group flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors text-base"
                            title="上一章"
                        >
                            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            <span className="hidden sm:inline">上一章</span>
                        </button>
                    )}
                </div>

                {/* Center: Next Chapter (Prominent) */}
                <div className="col-span-2 flex justify-center order-1 md:order-2 w-full">
                    {hasNext ? (
                        <button 
                            onClick={onNextChapter}
                            className="flex items-center justify-center gap-2 w-full md:w-auto md:px-12 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 font-bold text-lg"
                        >
                            <span>下一章</span>
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    ) : (
                        <div className="text-gray-400 font-medium italic">
                            全书完
                        </div>
                    )}
                </div>

                {/* Right: AI Summary */}
                <div className="col-span-1 flex justify-end order-3 md:order-3">
                    <button 
                        onClick={() => onSummarize(chapter.content.replace(/<[^>]*>?/gm, ''))} 
                        className="group flex items-center gap-2 px-3 py-2 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors text-base"
                        title="AI 章节总结"
                    >
                        <MessageSquareQuote className="w-5 h-5" />
                        <span className="hidden sm:inline">AI 总结</span>
                    </button>
                </div>

             </div>
        </div>
      </div>

      {/* Floating Toolbar for Selection */}
      {showToolbar && (
        <div 
            data-zen-toolbar="true"
            className="fixed z-50 flex items-center bg-gray-900 text-white rounded shadow-xl px-2 py-1 gap-2 -translate-x-1/2 transform animate-fade-in"
            style={{ top: toolbarPosition.y, left: toolbarPosition.x }}
            onMouseUp={(e) => e.stopPropagation()}
        >
            <button 
                onClick={handleBookmarkClick}
                onMouseDown={(e) => e.preventDefault()} // Prevent losing selection focus
                className="p-2 hover:bg-gray-700 rounded flex items-center gap-1 text-xs"
                title="添加书签"
            >
                <BookmarkPlus className="w-4 h-4" />
                添加书签
            </button>
        </div>
      )}
    </div>
  );
};

export default Reader;