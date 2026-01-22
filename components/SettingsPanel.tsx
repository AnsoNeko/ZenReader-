import React, { useRef } from 'react';
import { AppSettings, ExportData } from '../types';
import { Download, Upload, Moon, Sun, Monitor, Type } from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  onExport: () => void;
  onImport: (data: ExportData) => void;
}

const SettingsPanel: React.FC<Props> = ({ settings, onUpdateSettings, onExport, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        onImport(data);
      } catch (err) {
        alert("无效的配置文件");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">外观</h3>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
            className={`flex-1 p-2 rounded-lg flex flex-col items-center gap-1 border ${settings.theme === 'light' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Sun className="w-5 h-5" />
            <span className="text-xs">亮色</span>
          </button>
          <button
            onClick={() => onUpdateSettings({ ...settings, theme: 'sepia' })}
            className={`flex-1 p-2 rounded-lg flex flex-col items-center gap-1 border ${settings.theme === 'sepia' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Monitor className="w-5 h-5" />
            <span className="text-xs">护眼</span>
          </button>
          <button
            onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
            className={`flex-1 p-2 rounded-lg flex flex-col items-center gap-1 border ${settings.theme === 'dark' ? 'border-purple-500 bg-gray-800 text-purple-300' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Moon className="w-5 h-5" />
            <span className="text-xs">深色</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
               <span className="text-sm">字号</span>
               <span className="text-sm font-mono">{settings.fontSize}px</span>
            </div>
            <input
              type="range"
              min="12"
              max="32"
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ ...settings, fontSize: Number(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>
          <div>
             <div className="flex justify-between mb-1">
               <span className="text-sm">字体</span>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => onUpdateSettings({...settings, fontFamily: 'sans'})}
                  className={`flex-1 py-1 px-2 text-sm border rounded ${settings.fontFamily === 'sans' ? 'bg-primary-600 text-white' : ''}`}>
                  黑体 (Sans)
                </button>
                <button 
                  onClick={() => onUpdateSettings({...settings, fontFamily: 'serif'})}
                  className={`flex-1 py-1 px-2 text-sm border rounded font-serif ${settings.fontFamily === 'serif' ? 'bg-primary-600 text-white' : ''}`}>
                  宋体 (Serif)
                </button>
             </div>
          </div>
        </div>
      </div>

      <div className="border-t pt-4 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">数据</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={onExport}
            className="flex items-center justify-center gap-2 w-full p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>导出阅读进度</span>
          </button>
          <button
            onClick={handleImportClick}
            className="flex items-center justify-center gap-2 w-full p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>导入阅读进度</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;