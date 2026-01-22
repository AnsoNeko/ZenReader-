import { GoogleGenAI } from "@google/genai";

// We check if the key exists, but we don't block the app if it doesn't.
// The AI features will just be disabled or show an error when clicked.
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

export const summarizeChapter = async (text: string): Promise<string> => {
  if (!apiKey) {
    return "API Key 缺失，AI 功能不可用。";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `请用简体中文对以下书籍章节内容提供简明扼要的总结（最多3段）。重点关注关键情节和角色发展。\n\n文本内容：\n${text.substring(0, 15000)}...`, // Limit context to avoid token limits on large chapters
      config: {
        systemInstruction: "你是一个乐于助人的文学助手。",
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking for faster summaries
      }
    });
    
    return response.text || "无法生成总结。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "与 AI 服务通信时发生错误。";
  }
};

export const explainText = async (selection: string, context: string): Promise<string> => {
    if (!apiKey) {
      return "API Key 缺失。";
    }
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `请结合故事情境，用简体中文解释以下选中的文本。\n\n选文： "${selection}"\n\n选文上下文： "${context.substring(0, 1000)}..."`,
      });
      
      return response.text || "无法解释文本。";
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "发生错误。";
    }
  };