import { Chapter } from "../types";

// Detect encoding using jschardet
const detectEncoding = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    // Read the first 4KB to detect encoding
    const chunk = file.slice(0, 4096);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && window.jschardet) {
        // @ts-ignore
        const binaryString = [...new Uint8Array(e.target.result as ArrayBuffer)]
            .map(byte => String.fromCharCode(byte)).join('');
        const detected = window.jschardet.detect(binaryString);
        console.log("Detected encoding:", detected);
        resolve(detected.encoding || 'utf-8');
      } else {
        resolve('utf-8'); // Fallback
      }
    };
    reader.onerror = () => resolve('utf-8');
    reader.readAsArrayBuffer(chunk);
  });
};

// Optimized TXT Parser with Two-Pass Strategy
const parseTxtContentOptimized = async (text: string): Promise<Chapter[]> => {
  // Regex for Chapter headings
  // Improved to allow spaces inside headers (e.g. "第 1 章") and strict punctuation filtering
  const chapterRegex = /(?:^|\n)\s*((?:第\s*[0-9零一二三四五六七八九十百千两]+\s*[章回节卷集部篇]|Chapter\s*[\dIVX]+|Section\s*[\d]+|Part\s*[\d]+|序章|前言|引子|尾声|后记|正文|楔子|[0-9]+\s*\.\s*)(?:[^\n]{0,50}))(?:\n|$)/gim;

  const invalidTitleChars = /[,，。？！“”!?"';]/;
  
  // PASS 1: Identify all potential chapter start points
  interface ChapterPoint {
    title: string;
    startIndex: number; // The exact index where the title line starts
  }
  
  const points: ChapterPoint[] = [];
  let match;

  while ((match = chapterRegex.exec(text)) !== null) {
    const rawMatch = match[0];
    const titleLine = match[1].trim();
    
    // Strict Filtering
    if (invalidTitleChars.test(titleLine)) continue;
    if (titleLine.length > 50 || titleLine.length === 0) continue;

    // Calculate accurate start index of the title text
    const offsetInMatch = rawMatch.indexOf(match[1]);
    const startIndex = match.index + offsetInMatch;

    points.push({
      title: titleLine,
      startIndex: startIndex
    });
    
    // Yield to UI thread occasionally
    if (points.length % 100 === 0) {
         await new Promise(r => setTimeout(r, 0));
    }
  }

  // PASS 2: Construct Chapters from Points
  // This guarantees contiguous blocks: Chapter N ends exactly where Chapter N+1 starts.
  const chapters: Chapter[] = [];
  let chapterCounter = 0;

  // Handle Prologue (Text before first detected chapter)
  if (points.length > 0 && points[0].startIndex > 50) {
      chapters.push({
          id: `chap-pre`,
          title: "开始",
          index: 0,
          startStringIndex: 0,
          endStringIndex: points[0].startIndex
      });
      chapterCounter++;
  } else if (points.length === 0) {
      // No chapters found at all
      return [{
          id: 'chap-0',
          title: '全文',
          index: 0,
          startStringIndex: 0,
          endStringIndex: text.length
      }];
  }

  // Process identified points
  for (let i = 0; i < points.length; i++) {
      const currentPoint = points[i];
      const nextPoint = points[i + 1];
      
      // The chapter starts at the title
      // It ends at the start of the next title, or end of file
      const endStringIndex = nextPoint ? nextPoint.startIndex : text.length;

      chapters.push({
          id: `chap-${chapterCounter}`,
          title: currentPoint.title,
          index: chapterCounter,
          startStringIndex: currentPoint.startIndex,
          endStringIndex: endStringIndex
      });
      chapterCounter++;
  }

  return chapters;
};

export const parseFile = async (file: File): Promise<{ title: string; chapters: Chapter[]; fullText?: string }> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'txt') {
    const encoding = await detectEncoding(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
            const buffer = e.target?.result as ArrayBuffer;
            const decoder = new TextDecoder(encoding);
            const text = decoder.decode(buffer);
            const chapters = await parseTxtContentOptimized(text);
            resolve({ 
                title: file.name.replace('.txt', ''), 
                chapters,
                fullText: text 
            });
        } catch (err) {
            reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  if (extension === 'docx') {
    if (!window.mammoth) {
      throw new Error("Mammoth library not loaded.");
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result;
        window.mammoth.convertToHtml({ arrayBuffer })
          .then((result: any) => {
            const html = result.value;
            const chapters: Chapter[] = [{
                id: 'chap-0',
                title: file.name,
                content: html,
                index: 0
            }];
            resolve({ title: file.name.replace('.docx', ''), chapters });
          })
          .catch((err: any) => reject(err));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  if (extension === 'epub') {
      if (!window.ePub) {
          throw new Error("EPUB library not loaded.");
      }
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
              const arrayBuffer = e.target?.result;
              const book = window.ePub(arrayBuffer);
              book.ready.then(async () => {
                 const toc = await book.loaded.navigation;
                 const chapters: Chapter[] = [];
                 let index = 0;
                 const spine = book.spine;
                 for (const item of spine.items) {
                    if (index % 5 === 0) await new Promise(r => setTimeout(r, 0));
                    try {
                        const doc = await item.load(book.load.bind(book));
                         // @ts-ignore
                        let content = "";
                        if(doc && doc.body) {
                             content = doc.body.innerHTML;
                        } else if (typeof doc === 'string') {
                            content = doc;
                        }
                        const tocItem = toc.toc.find((t: any) => t.href.includes(item.href));
                        const title = tocItem ? tocItem.label : `第 ${index + 1} 章`;
                        chapters.push({
                            id: `chap-${index}`,
                            title,
                            content,
                            index
                        });
                        index++;
                    } catch (err) {
                        console.warn("Failed to load chapter", item, err);
                    }
                 }
                 resolve({ title: book.package.metadata.title || file.name, chapters });
              }).catch(reject);
          };
          reader.readAsArrayBuffer(file);
      });
  }

  throw new Error("不支持的文件格式。请使用 .txt, .docx, 或 .epub");
};