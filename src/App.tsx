/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sun, Moon, Upload, Download, Plus, Trash2, ChevronDown, 
  ArrowLeft, FileJson, Table, CheckCircle2, Save, X, FolderUp,
  Image as ImageIcon, Video as VideoIcon, Link as LinkIcon,
  Info, Video
} from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import CryptoJS from 'crypto-js';
import { cn } from './lib/utils';
import { Scene, ProjectData } from './types';

const SK = 'storyboard_v2';

export default function App() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [projectFileName, setProjectFileName] = useState('新建项目');
  const [page, setPage] = useState<'home' | 'workspace'>('home');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'none'>('none');
  const [hasSavedProject, setHasSavedProject] = useState(false);
  const [savedProjectMeta, setSavedProjectMeta] = useState<{ name: string; date: string; count: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' | '' } | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'img' | 'vid' } | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Theme management
  useEffect(() => {
    const savedTheme = localStorage.getItem('sb_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('sb_theme', theme);
  }, [theme]);

  // Check for saved project
  useEffect(() => {
    const raw = localStorage.getItem(SK);
    if (raw) {
      try {
        const data = JSON.parse(raw) as ProjectData;
        if (data.scenes && data.scenes.length > 0) {
          setHasSavedProject(true);
          const dt = new Date(data.savedAt);
          setSavedProjectMeta({
            name: data.name || '未命名项目',
            date: dt.toLocaleDateString('zh-CN') + ' ' + dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            count: data.scenes.length
          });
        }
      } catch (e) {
        console.error('Failed to parse saved project', e);
      }
    }
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' | '' = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const autoSave = useCallback((immediate = false) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');

    const save = () => {
      try {
        const data: ProjectData = {
          name: projectFileName,
          savedAt: new Date().toISOString(),
          scenes: scenes.map(s => ({
            id: s.id,
            num: s.num,
            story: s.story,
            imgPrompt: s.imgPrompt,
            vidPrompt: s.vidPrompt,
            imgUrl: s.imgUrl,
            vidUrl: s.vidUrl,
            imgPreviewUrl: s.imgUrl || s.imgPreviewUrl,
            vidPreviewUrl: s.vidUrl || s.vidPreviewUrl,
            notes: s.notes
          }))
        };
        localStorage.setItem(SK, JSON.stringify(data));
        setSaveState('saved');
      } catch (e) {
        console.error('Auto save failed', e);
        setSaveState('none');
      }
    };

    if (immediate) {
      save();
    } else {
      saveTimerRef.current = setTimeout(save, 1400);
    }
  }, [scenes, projectFileName]);

  useEffect(() => {
    if (page === 'workspace' && scenes.length > 0) {
      autoSave();
    }
  }, [scenes, projectFileName, page, autoSave]);

  const handleFile = (file: File) => {
    if (!file) return;
    setProjectFileName(file.name.replace(/\.[^.]+$/, ''));
    const ext = file.name.split('.').pop()?.toLowerCase();

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (!result) return;

      if (ext === 'csv') {
        // Handle encoding: Try UTF-8 first, then GBK
        const uint8Array = new Uint8Array(result as ArrayBuffer);
        let text = new TextDecoder('utf-8').decode(uint8Array);
        
        // Check if it looks like garbled text (heuristic: check for replacement characters or common garbled patterns)
        if (text.includes('')) {
          text = new TextDecoder('gbk').decode(uint8Array);
        }
        parseCSV(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        parseExcel(result as ArrayBuffer);
      } else {
        showToast('❌ 请上传 CSV 或 Excel 文件', 'error');
      }
    };

    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      reader.readAsArrayBuffer(file);
    }
  };

  const parseCSV = (text: string) => {
    // Use xlsx to parse CSV for better handling of quotes and commas
    const wb = XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    
    let start = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const s = rows[i].join('');
      if (s.includes('序号') || s.includes('分镜')) {
        start = i + 1;
      }
    }
    buildScenes(rows.slice(start).filter(r => r[0] !== '' && !isNaN(Number(String(r[0]).trim())) && String(r[0]).trim() !== ''));
  };

  const parseExcel = (buffer: ArrayBuffer) => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    let start = 0;
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const s = rows[i].join('');
      if (s.includes('序号') || s.includes('分镜')) {
        start = i + 1;
      }
    }
    buildScenes(rows.slice(start).filter(r => r[0] !== '' && !isNaN(Number(String(r[0]).trim())) && String(r[0]).trim() !== ''));
  };

  const buildScenes = (rows: any[][]) => {
    const newScenes: Scene[] = rows.map(r => ({
      id: Math.random().toString(36).substring(2, 11),
      num: String(r[0]).trim(),
      story: String(r[1] || '').trim(),
      imgPrompt: String(r[2] || '').trim(),
      vidPrompt: String(r[4] || r[3] || '').trim(),
      imgFile: null,
      imgUrl: '',
      vidFile: null,
      vidUrl: '',
      notes: '',
      imgPreviewUrl: '',
      vidPreviewUrl: '',
    }));

    if (newScenes.length === 0) {
      showToast('⚠️ 未识别到有效数据', 'error');
      return;
    }

    setScenes(newScenes);
    setPage('workspace');
    showToast(`✅ 成功导入 ${newScenes.length} 个分镜`, 'success');
  };

  const restoreProject = () => {
    const raw = localStorage.getItem(SK);
    if (raw) {
      try {
        const data = JSON.parse(raw) as ProjectData;
        setProjectFileName(data.name || '恢复的项目');
        setScenes((data.scenes || []).map(s => ({
          ...s,
          imgFile: null,
          vidFile: null,
          imgPreviewUrl: s.imgPreviewUrl || s.imgUrl || '',
          vidPreviewUrl: s.vidPreviewUrl || s.vidUrl || '',
        })));
        setPage('workspace');
        showToast(`📂 已恢复项目：${data.name}`, 'info');
      } catch (e) {
        showToast('⚠️ 恢复失败', 'error');
      }
    }
  };

  const clearSaved = () => {
    localStorage.removeItem(SK);
    setHasSavedProject(false);
    setSavedProjectMeta(null);
    showToast('已清除保存记录', '');
  };

  const startBlank = () => {
    setScenes([{
      id: Math.random().toString(36).substring(2, 11),
      num: '1',
      story: '',
      imgPrompt: '',
      vidPrompt: '',
      imgFile: null,
      imgUrl: '',
      vidFile: null,
      vidUrl: '',
      notes: '',
      imgPreviewUrl: '',
      vidPreviewUrl: '',
    }]);
    setProjectFileName('新建项目');
    setPage('workspace');
  };

  const addScene = () => {
    const lastNum = scenes.length > 0 ? parseInt(scenes[scenes.length - 1].num) : 0;
    const newScene: Scene = {
      id: Math.random().toString(36).substring(2, 11),
      num: String(isNaN(lastNum) ? scenes.length + 1 : lastNum + 1),
      story: '',
      imgPrompt: '',
      vidPrompt: '',
      imgFile: null,
      imgUrl: '',
      vidFile: null,
      vidUrl: '',
      notes: '',
      imgPreviewUrl: '',
      vidPreviewUrl: '',
    };
    setScenes([...scenes, newScene]);
  };

  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    let matchedCount = 0;
    const newScenes = [...scenes];
    
    for (const file of Array.from(files)) {
      const name = file.name;
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      
      if (!isImg && !isVid) continue;
      
      const match = name.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        const sceneIndex = newScenes.findIndex(s => parseInt(s.num) === num);
        
        if (sceneIndex !== -1) {
          const url = URL.createObjectURL(file);
          if (isImg) {
            newScenes[sceneIndex] = { ...newScenes[sceneIndex], imgFile: file, imgPreviewUrl: url, imgDuration: 5 };
          } else {
            const duration = await getVideoDuration(file);
            newScenes[sceneIndex] = { ...newScenes[sceneIndex], vidFile: file, vidPreviewUrl: url, vidDuration: duration };
          }
          matchedCount++;
        }
      }
    }
    
    setScenes(newScenes);
    if (matchedCount > 0) {
      showToast(`✅ 成功匹配并上传 ${matchedCount} 个媒体文件`, 'success');
    } else {
      showToast('❌ 未能匹配到任何分镜，请确保文件名包含对应序号', 'error');
    }
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => resolve(5); // Fallback
      video.src = URL.createObjectURL(file);
    });
  };

  const exportJianyingDraft = async () => {
    if (scenes.length === 0) {
      showToast('❌ 请先添加分镜内容', 'error');
      return;
    }

    const zip = new JSZip();
    const draftId = Math.random().toString(36).substring(2, 15).toUpperCase();
    const now = Date.now() * 1000; // Microseconds

    // 1. draft_meta_info.json
    const metaInfo = {
      "draft_id": draftId,
      "draft_name": projectFileName,
      "draft_type": "video",
      "draft_root_path": "",
      "draft_cloud_last_action_download": false,
      "draft_cloud_purchase_info": "",
      "draft_cloud_template_id": "",
      "draft_cloud_tutorial_id": "",
      "draft_cloud_videocut_id": "",
      "draft_removable_storage_device": "",
      "tm_draft_cloud_completed": "",
      "tm_draft_cloud_modified": 0,
      "tm_draft_create": now,
      "tm_draft_modified": now,
      "tm_duration": 0
    };

    // 2. draft_settings.json
    const settings = {
      "canvas_config": { "height": 1080, "ratio": "original", "width": 1920 },
      "color_space": 0,
      "config": { "adjust_max_duration_limit": 0, "attachment_info": [], "candidate_audio_filter_ids": [], "candidate_video_filter_ids": [], "fps": 30, "reserve_left_right_margin": 0, "flash_duration": 0 },
      "fps": 30,
      "version": 6
    };

    // 3. draft_content.json
    const materials: any = {
      "audios": [],
      "canvases": [],
      "effects": [],
      "filters": [],
      "images": [],
      "legacies": [],
      "materials": [],
      "placeholders": [],
      "realtime_denoises": [],
      "sounds": [],
      "stickers": [],
      "texts": [],
      "transitions": [],
      "video_converts": [],
      "videos": []
    };

    const mainTrack: any = {
      "id": Math.random().toString(36).substring(2, 15).toUpperCase(),
      "segments": [],
      "type": "video"
    };

    let currentTime = 0;
    const FPS = 30;
    const US_PER_SEC = 1000000;

    scenes.forEach((scene) => {
      const isVideo = !!scene.vidFile || !!scene.vidUrl;
      const file = isVideo ? scene.vidFile : scene.imgFile;
      const fileName = file ? file.name : (isVideo ? 'video_url' : 'image_url');
      const duration = isVideo ? (scene.vidDuration || 5) : (scene.imgDuration || 5);
      const durationUs = Math.floor(duration * US_PER_SEC);

      const materialId = Math.random().toString(36).substring(2, 15).toUpperCase();
      const segmentId = Math.random().toString(36).substring(2, 15).toUpperCase();

      const material = {
        "audio_fade": null,
        "cartoon_path": "",
        "category_id": "",
        "category_name": "",
        "check_flag": 63487,
        "crop": { "lower_left_x": 0.0, "lower_left_y": 1.0, "lower_right_x": 1.0, "lower_right_y": 1.0, "upper_left_x": 0.0, "upper_left_y": 0.0, "upper_right_x": 1.0, "upper_right_y": 0.0 },
        "duration": durationUs,
        "extra_info": fileName,
        "file_Path": fileName,
        "height": 1080,
        "id": materialId,
        "import_time": now,
        "import_time_ms": Math.floor(now / 1000),
        "item_source": 1,
        "md5": "",
        "metainfo_path": "",
        "reverse_duration": 0,
        "reverse_path": "",
        "source_platform": 0,
        "team_id": "",
        "type": isVideo ? "video" : "photo",
        "video_duration": durationUs,
        "width": 1920
      };

      materials.videos.push(material);

      mainTrack.segments.push({
        "cartoon": false,
        "clip": { "alpha": 1.0, "flip": { "horizontal": false, "vertical": false }, "rotation": 0.0, "scale": { "x": 1.0, "y": 1.0 }, "transform": { "x": 0.0, "y": 0.0 } },
        "common_keyframes": [],
        "enable_adjust": true,
        "enable_audio_filter": false,
        "enable_video_filter": false,
        "external_id": "",
        "extra_material_refs": [],
        "group_id": "",
        "hdr_settings": null,
        "id": segmentId,
        "intensifies_audio_filter": null,
        "is_placeholder": false,
        "keyframe_refs": [],
        "last_nonzero_volume": 1.0,
        "material_id": materialId,
        "render_index": 0,
        "reverse": false,
        "source_timerange": { "duration": durationUs, "start": 0 },
        "speed": 1.0,
        "target_timerange": { "duration": durationUs, "start": currentTime },
        "template_id": "",
        "track_id": mainTrack.id,
        "track_render_index": 0,
        "type": isVideo ? "video" : "photo",
        "volume": 1.0
      });

      currentTime += durationUs;
    });

    metaInfo.tm_duration = currentTime;

    const content = {
      "canvas_config": settings.canvas_config,
      "color_space": 0,
      "config": settings.config,
      "duration": currentTime,
      "fps": FPS,
      "is_new_project": false,
      "keyframe_graph_list": [],
      "last_action_time": now,
      "materials": materials,
      "mutable_config": null,
      "name": projectFileName,
      "tracks": [mainTrack],
      "update_time": now,
      "version": 6
    };

    zip.file(`${draftId}/draft_content.json`, encryptJianyingContent(JSON.stringify(content)));
    zip.file(`${draftId}/draft_meta_info.json`, JSON.stringify(metaInfo));
    zip.file(`${draftId}/draft_settings.json`, JSON.stringify(settings));
    zip.file(`${draftId}/draft_virtual_tracks.json`, JSON.stringify({ "tracks": [] }));
    zip.file(`${draftId}/draft_extra_info.json`, JSON.stringify({}));
    zip.file(`${draftId}/draft_timeline_config.json`, JSON.stringify({ "timeline_config": { "fps": 30 } }));
    zip.file(`${draftId}/draft_cloud_meta.json`, JSON.stringify({ "draft_cloud_last_action_download": false }));

    const contentBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(contentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectFileName}_剪映草稿包.zip`;
    a.click();
    showToast('🎬 剪映草稿包已生成，请解压到剪映草稿目录', 'success');
  };

  const encryptJianyingContent = (content: string) => {
    const key = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
    const encrypted = CryptoJS.AES.encrypt(content, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString();
  };

  const removeScene = (id: string) => {
    setScenes(scenes.filter(s => s.id !== id));
  };

  const updateScene = (id: string, field: keyof Scene, value: any) => {
    setScenes(scenes.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const downloadTemplate = () => {
    const hdr = ['序号', '分镜画面', '图片提示词', '图片窗口', '视频提示词', '视频窗口'];
    const rows = [
      ['1', '一只小狗在草地上奔跑', 'a cute dog running on grass, golden hour', '上传文件', 'a dog running on grass, dynamic motion', '上传文件'],
      ['2', '一只小猫趴在窗台上', 'a cat sitting on window sill, soft light', '上传文件', 'a cat resting on window sill, gentle breeze', '上传文件'],
    ];
    const csv = '\uFEFF' + [hdr, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '分镜模板.csv';
    a.click();
    showToast('📥 模板已下载，填写后上传即可', 'success');
  };

  const exportJSON = () => {
    const data = scenes.map(s => ({
      序号: s.num,
      分镜画面: s.story,
      图片提示词: s.imgPrompt,
      视频提示词: s.vidPrompt,
      图片来源: s.imgFile ? s.imgFile.name : s.imgUrl || '',
      视频来源: s.vidFile ? s.vidFile.name : s.vidUrl || '',
      备注: s.notes
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectFileName}_数据.json`;
    a.click();
    showToast('✅ JSON 已导出', 'success');
  };

  const exportCSV = () => {
    const h = ['序号', '分镜画面', '图片提示词', '视频提示词', '图片来源', '视频来源', '备注'];
    const rows = scenes.map(s => [
      s.num, s.story, s.imgPrompt, s.vidPrompt,
      s.imgFile ? s.imgFile.name : s.imgUrl,
      s.vidFile ? s.vidFile.name : s.vidUrl,
      s.notes
    ]);
    const csv = '\uFEFF' + [h, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectFileName}_数据.csv`;
    a.click();
    showToast('✅ CSV 已导出', 'success');
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-7 h-[58px] bg-[var(--header-bg)] border-b border-[var(--border)] sticky top-0 z-[200] backdrop-blur-xl">
        <div className="flex items-center gap-2 font-mono text-sm font-bold text-[var(--accent)] tracking-wider">
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] animate-pulse-custom" />
          STORYBOARD<span className="text-[var(--muted)] font-normal">.PRO</span>
        </div>
        <div className="flex items-center gap-2.5">
          {page === 'workspace' && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <div className={cn(
                "w-[7px] h-[7px] rounded-full transition-colors",
                saveState === 'saved' && "bg-[var(--success)] shadow-[0_0_5px_var(--success)]",
                saveState === 'saving' && "bg-[var(--accent)] animate-pulse-custom",
                saveState === 'none' && "bg-[var(--muted)]"
              )} />
              <span>{saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : '未保存'}</span>
            </div>
          )}
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-[34px] h-[34px] rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] cursor-pointer flex items-center justify-center text-base transition-all hover:border-[var(--accent)] hover:rotate-[22deg]"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {page === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-[700px] mx-auto pt-12 pb-20"
            >
              {/* Saved Banner */}
              {hasSavedProject && savedProjectMeta && (
                <div className="bg-[color-mix(in_srgb,var(--accent2)_9%,var(--surface))] border border-[color-mix(in_srgb,var(--accent2)_38%,transparent)] rounded-[13px] p-4 mb-6 flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <strong className="text-sm text-[var(--text)]">{savedProjectMeta.name}</strong>
                    <span className="text-xs text-[var(--muted)]">{savedProjectMeta.count} 个分镜 · 上次保存：{savedProjectMeta.date}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={restoreProject} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black font-medium text-xs hover:brightness-110 transition-all">
                      📂 继续上次项目
                    </button>
                    <button onClick={clearSaved} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] text-xs hover:border-[var(--accent)] transition-all">
                      ✕ 忽略
                    </button>
                  </div>
                </div>
              )}

              <div className="text-center mb-11">
                <h1 className="text-3xl font-bold tracking-tight leading-tight mb-2.5">
                  半自动化<em className="text-[var(--accent)] not-italic">分镜制作</em>工具
                </h1>
                <p className="text-[var(--muted)] text-sm leading-relaxed">
                  上传分镜表格，自动解析排列分镜内容<br />逐一添加图片与视频，一键导出项目数据
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Upload Card */}
                <div 
                  className="md:col-span-2 bg-[var(--surface)] border-2 border-dashed border-[var(--border)] rounded-2xl p-10 text-center cursor-pointer transition-all hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))] relative"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-[var(--accent)]'); }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-[var(--accent)]'); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-[var(--accent)]'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                >
                  <input 
                    type="file" 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <div className="text-4xl mb-2">📋</div>
                  <div className="text-base font-semibold mb-1">上传分镜表格</div>
                  <div className="text-xs text-[var(--muted)]">点击选择或拖拽文件到此处</div>
                  <div className="flex gap-1.5 justify-center mt-3 flex-wrap">
                    <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] font-mono text-[10px]">.csv</span>
                    <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] font-mono text-[10px]">.xlsx</span>
                    <span className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] font-mono text-[10px]">.xls</span>
                  </div>
                </div>

                {/* Template Card */}
                <div 
                  onClick={downloadTemplate}
                  className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 cursor-pointer transition-all hover:border-[var(--border2)] hover:-translate-y-0.5 hover:shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--accent2)] scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                  <span className="text-2xl mb-2.5 block">📥</span>
                  <div className="text-sm font-semibold mb-1">导入模板</div>
                  <div className="text-xs text-[var(--muted)] leading-relaxed">下载标准 CSV 模板，按格式填写后直接上传，自动识别所有列</div>
                </div>

                {/* Blank Card */}
                <div 
                  onClick={startBlank}
                  className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 cursor-pointer transition-all hover:border-[var(--border2)] hover:-translate-y-0.5 hover:shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--accent)] scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                  <span className="text-2xl mb-2.5 block">✏️</span>
                  <div className="text-sm font-semibold mb-1">手动创建项目</div>
                  <div className="text-xs text-[var(--muted)] leading-relaxed">创建空白项目，逐条手动输入分镜内容与提示词</div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-[1440px] mx-auto pb-24"
            >
              <div className="flex flex-wrap items-center justify-between mb-5 pb-4 border-b border-[var(--border)] gap-3">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => { autoSave(true); setPage('home'); showToast('✅ 项目已自动保存，返回主页', 'success'); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                  >
                    <ArrowLeft size={14} /> 返回主页
                  </button>
                  <div className="flex flex-col">
                    <h2 className="text-lg font-bold">{projectFileName}</h2>
                    <p className="text-xs text-[var(--muted)] mt-0.5">{scenes.length} 个分镜 · 点击卡片展开编辑</p>
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="relative">
                    <button className="px-3 py-1.5 rounded-lg border border-[var(--accent2)] bg-[color-mix(in_srgb,var(--accent2)_8%,transparent)] text-[var(--accent2)] text-xs hover:bg-[var(--accent2)] hover:text-white transition-all flex items-center gap-1.5 font-medium">
                      <FolderUp size={14} /> 批量上传媒体
                    </button>
                    <input 
                      type="file" 
                      multiple
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      onChange={(e) => handleBulkUpload(e.target.files)}
                    />
                  </div>
                  <button onClick={addScene} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center gap-1.5">
                    <Plus size={14} /> 添加分镜
                  </button>
                  <button onClick={exportJSON} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs hover:border-[var(--accent2)] hover:text-[var(--accent2)] transition-all flex items-center gap-1.5">
                    <FileJson size={14} /> 导出 JSON
                  </button>
                  <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black font-medium text-xs hover:brightness-110 transition-all flex items-center gap-1.5">
                    <Table size={14} /> 导出 CSV
                  </button>
                  <button onClick={exportJianyingDraft} className="px-3 py-1.5 rounded-lg bg-[var(--accent2)] text-white font-medium text-xs hover:brightness-110 transition-all flex items-center gap-1.5">
                    <Video size={14} /> 导出剪映草稿
                  </button>
                </div>
              </div>

              {/* Column Headers */}
              <div className="hidden md:grid grid-cols-[48px_1fr_2fr_2fr_140px_140px_44px] gap-4 px-4 py-2 text-[11px] font-bold tracking-widest uppercase text-[var(--muted)] mb-1">
                <div>序号</div><div>分镜内容</div><div>图片提示词</div><div>视频提示词</div><div>图片状态</div><div>视频状态</div><div></div>
              </div>

              {/* Scenes List */}
              <div className="flex flex-col gap-4">
                {scenes.map((scene) => (
                  <SceneCard 
                    key={scene.id} 
                    scene={scene} 
                    onUpdate={updateScene} 
                    onRemove={removeScene}
                    onPreview={(url, type) => setPreviewMedia({ url, type })}
                    showToast={showToast}
                  />
                ))}
              </div>

              <button 
                onClick={addScene}
                className="w-full mt-3 p-3 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--muted)] text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] transition-all"
              >
                <Plus size={18} /> 添加新分镜
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Export Bar */}
      {page === 'workspace' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--header-bg)] border-t border-[var(--border)] p-3 px-6 flex items-center justify-between gap-4 z-[150] backdrop-blur-xl">
          <div className="text-xs text-[var(--muted)]">
            共 <strong className="text-[var(--text)]">{scenes.length}</strong> 个分镜 · 
            图片 <strong className="text-[var(--text)]">{scenes.filter(s => s.imgFile || s.imgUrl).length}</strong> 已上传 · 
            视频 <strong className="text-[var(--text)]">{scenes.filter(s => s.vidFile || s.vidUrl).length}</strong> 已上传
          </div>
          <div className="flex gap-2">
            <button onClick={exportJSON} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs hover:border-[var(--accent)] transition-all">JSON</button>
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black font-medium text-xs hover:brightness-110 transition-all">CSV</button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {previewMedia && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewMedia(null)}
            className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 md:p-10 cursor-zoom-out"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-full max-h-full relative"
              onClick={(e) => e.stopPropagation()}
            >
              {previewMedia.type === 'img' ? (
                <img 
                  src={previewMedia.url} 
                  alt="Preview" 
                  className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video 
                  src={previewMedia.url} 
                  controls 
                  autoPlay
                  className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                />
              )}
              <button 
                onClick={() => setPreviewMedia(null)}
                className="absolute -top-10 -right-10 md:-top-12 md:-right-12 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className={cn(
              "fixed top-[68px] right-[18px] p-3 px-4 rounded-lg border text-sm flex items-center gap-2 max-w-[270px] shadow-2xl z-[999]",
              toast.type === 'success' ? "border-[var(--success)] bg-[var(--surface)] text-[var(--text)]" :
              toast.type === 'error' ? "border-[var(--danger)] bg-[var(--surface)] text-[var(--text)]" :
              "border-[var(--accent2)] bg-[var(--surface)] text-[var(--text)]"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 size={16} className="text-[var(--success)]" /> :
             toast.type === 'error' ? <X size={16} className="text-[var(--danger)]" /> :
             <Info size={16} className="text-[var(--accent2)]" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SceneCardProps {
  scene: Scene;
  onUpdate: (id: string, field: keyof Scene, value: any) => void;
  onRemove: (id: string) => void;
  onPreview: (url: string, type: 'img' | 'vid') => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | '') => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, onUpdate, onRemove, onPreview, showToast }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleImgUpload = (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdate(scene.id, 'imgFile', file);
    onUpdate(scene.id, 'imgPreviewUrl', url);
    onUpdate(scene.id, 'imgDuration', 5);
  };

  const handleVidUpload = async (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdate(scene.id, 'vidFile', file);
    onUpdate(scene.id, 'vidPreviewUrl', url);
    
    // Get duration
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      onUpdate(scene.id, 'vidDuration', video.duration);
      window.URL.revokeObjectURL(video.src);
    };
    video.src = url;
  };

  const removeMedia = (type: 'img' | 'vid') => {
    if (type === 'img') {
      onUpdate(scene.id, 'imgFile', null);
      onUpdate(scene.id, 'imgPreviewUrl', '');
      onUpdate(scene.id, 'imgUrl', '');
    } else {
      onUpdate(scene.id, 'vidFile', null);
      onUpdate(scene.id, 'vidPreviewUrl', '');
      onUpdate(scene.id, 'vidUrl', '');
    }
  };

  const imgStatus = scene.imgFile ? 'has-file' : scene.imgUrl ? 'has-url' : '';
  const vidStatus = scene.vidFile ? 'has-file' : scene.vidUrl ? 'has-url' : '';
  const imgLabel = scene.imgFile ? scene.imgFile.name : scene.imgUrl ? '🔗 URL已链接' : '未上传';
  const vidLabel = scene.vidFile ? scene.vidFile.name : scene.vidUrl ? '🔗 URL已链接' : '未上传';

  return (
    <div className={cn(
      "bg-[var(--card-bg)] border border-[var(--border)] rounded-xl overflow-hidden transition-all shadow-sm",
      isExpanded && "border-[var(--border2)] shadow-lg ring-1 ring-[var(--accent2)]/10"
    )}>
      <div 
        className="grid grid-cols-[48px_1fr_2fr_2fr_140px_140px_44px] items-center p-4 gap-4 cursor-pointer select-none min-h-[64px] hover:bg-[color-mix(in_srgb,var(--accent)_3%,transparent)]"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-[var(--surface2)] border border-[var(--border)] flex items-center justify-center font-mono text-xs font-bold text-[var(--accent)]">
          {scene.num}
        </div>
        <div className="text-[13px] font-medium line-clamp-2 leading-relaxed">{scene.story || <span className="text-[var(--muted)]">未填写</span>}</div>
        <div className="text-[11px] text-[var(--muted)] font-mono leading-relaxed max-h-[60px] overflow-y-auto custom-scrollbar pr-1">{scene.imgPrompt || '—'}</div>
        <div className="text-[11px] text-[var(--muted)] font-mono leading-relaxed max-h-[60px] overflow-y-auto custom-scrollbar pr-1">{scene.vidPrompt || '—'}</div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className={cn(
            "w-[7px] h-[7px] rounded-full flex-shrink-0 transition-colors",
            imgStatus === 'has-file' && "bg-[var(--success)] shadow-[0_0_5px_var(--success)]",
            imgStatus === 'has-url' && "bg-[var(--accent2)] shadow-[0_0_5px_var(--accent2)]",
            !imgStatus && "bg-[var(--border)]"
          )} />
          <span className="text-[var(--muted)] truncate max-w-[115px]">{imgLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className={cn(
            "w-[7px] h-[7px] rounded-full flex-shrink-0 transition-colors",
            vidStatus === 'has-file' && "bg-[var(--success)] shadow-[0_0_5px_var(--success)]",
            vidStatus === 'has-url' && "bg-[var(--accent2)] shadow-[0_0_5px_var(--accent2)]",
            !vidStatus && "bg-[var(--border)]"
          )} />
          <span className="text-[var(--muted)] truncate max-w-[115px]">{vidLabel}</span>
        </div>
        <div className="flex justify-center">
          <button className={cn(
            "w-7 h-7 rounded-md border border-[var(--border)] bg-transparent text-[var(--muted)] cursor-pointer flex items-center justify-center text-[11px] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]",
            isExpanded && "rotate-180 border-[var(--accent)] text-[var(--accent)]"
          )}>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_30%,transparent)]"
        >
          {/* Image Panel */}
          <div className="p-5 border-r border-[var(--border)] space-y-4">
            <div className="text-[11px] font-bold tracking-widest uppercase text-[var(--muted)] flex items-center gap-2">
              <ImageIcon size={14} /> 图片面板
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] text-[var(--muted)] mb-1.5">分镜画面描述</div>
                  <input 
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-[13px] p-2.5 focus:outline-none focus:border-[var(--accent2)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent2)_11%,transparent)]"
                    type="text" 
                    value={scene.story} 
                    placeholder="描述分镜内容..."
                    onChange={(e) => onUpdate(scene.id, 'story', e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-[11px] text-[var(--muted)] mb-1.5">图片提示词</div>
                  <textarea 
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-[13px] p-2.5 h-[160px] leading-relaxed focus:outline-none focus:border-[var(--accent2)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent2)_11%,transparent)] resize-none overflow-y-auto"
                    placeholder="输入图片生成提示词..."
                    value={scene.imgPrompt}
                    onChange={(e) => onUpdate(scene.id, 'imgPrompt', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[11px] text-[var(--muted)]">预览 / 上传</div>
                {!scene.imgPreviewUrl && !scene.imgUrl ? (
                  <div 
                    className="aspect-square border-2 border-dashed border-[var(--border)] rounded-xl p-4 text-center cursor-pointer transition-all bg-[var(--surface)] flex flex-col items-center justify-center gap-2 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))] relative"
                  >
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handleImgUpload(e.target.files[0])}
                    />
                    <Upload size={20} className="text-[var(--muted)]" />
                    <div className="text-[10px] text-[var(--muted)]">上传图片</div>
                  </div>
                ) : (
                  <div className="aspect-square rounded-xl overflow-hidden relative group border border-[var(--border)] bg-black/5">
                    <img 
                      src={scene.imgPreviewUrl || scene.imgUrl} 
                      alt="" 
                      className="w-full h-full object-cover block cursor-zoom-in"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/error/400/400?blur=10';
                        showToast('图片加载失败，可能是跨域限制或链接失效', 'error');
                      }}
                      onClick={() => onPreview(scene.imgPreviewUrl || scene.imgUrl, 'img')}
                    />
                    <button 
                      onClick={() => removeMedia('img')}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 border-none text-white cursor-pointer flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input 
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-xs font-mono p-2 pl-8 focus:outline-none focus:border-[var(--accent2)]"
                  type="url" 
                  placeholder="粘贴图片直接链接 (如 .jpg, .png)..."
                  value={scene.imgUrl} 
                  onChange={(e) => onUpdate(scene.id, 'imgUrl', e.target.value)}
                />
              </div>
              <button 
                onClick={() => onUpdate(scene.id, 'imgPreviewUrl', scene.imgUrl)}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--text)] text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
              >
                加载
              </button>
            </div>
          </div>

          {/* Video Panel */}
          <div className="p-5 space-y-4">
            <div className="text-[11px] font-bold tracking-widest uppercase text-[var(--muted)] flex items-center gap-2">
              <VideoIcon size={14} /> 视频面板 <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--accent2)_12%,var(--surface2))] text-[var(--accent2)] border border-[color-mix(in_srgb,var(--accent2)_30%,transparent)] text-[10px] normal-case tracking-normal font-medium">Beta</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] text-[var(--muted)] mb-1.5">视频提示词</div>
                  <textarea 
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-[13px] p-2.5 h-[160px] leading-relaxed focus:outline-none focus:border-[var(--accent2)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent2)_11%,transparent)] resize-none overflow-y-auto"
                    placeholder="输入视频生成提示词..."
                    value={scene.vidPrompt}
                    onChange={(e) => onUpdate(scene.id, 'vidPrompt', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[11px] text-[var(--muted)]">预览 / 上传</div>
                {!scene.vidPreviewUrl && !scene.vidUrl ? (
                  <div 
                    className="aspect-square border-2 border-dashed border-[var(--border)] rounded-xl p-4 text-center cursor-pointer transition-all bg-[var(--surface)] flex flex-col items-center justify-center gap-2 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))] relative"
                  >
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                      accept="video/*"
                      onChange={(e) => e.target.files?.[0] && handleVidUpload(e.target.files[0])}
                    />
                    <Upload size={20} className="text-[var(--muted)]" />
                    <div className="text-[10px] text-[var(--muted)]">上传视频</div>
                  </div>
                ) : (
                  <div className="aspect-square rounded-xl overflow-hidden relative group border border-[var(--border)] bg-black/5">
                    <video 
                      src={scene.vidPreviewUrl || scene.vidUrl} 
                      className="w-full h-full object-cover block cursor-zoom-in"
                      referrerPolicy="no-referrer"
                      onError={() => {
                        showToast('视频加载失败，请确保是直接的视频文件链接', 'error');
                      }}
                      onClick={() => onPreview(scene.vidPreviewUrl || scene.vidUrl, 'vid')}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
                      <VideoIcon size={24} className="text-white" />
                    </div>
                    <button 
                      onClick={() => removeMedia('vid')}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 border-none text-white cursor-pointer flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input 
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] text-xs font-mono p-2 pl-8 focus:outline-none focus:border-[var(--accent2)]"
                  type="url" 
                  placeholder="粘贴视频直接链接 (如 .mp4, .webm)..."
                  value={scene.vidUrl} 
                  onChange={(e) => onUpdate(scene.id, 'vidUrl', e.target.value)}
                />
              </div>
              <button 
                onClick={() => onUpdate(scene.id, 'vidPreviewUrl', scene.vidUrl)}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--text)] text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
              >
                加载
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 px-5 border-t border-[var(--border)] flex items-center gap-4 bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] md:col-span-2">
            <div className="flex-1 flex items-center gap-2">
              <Info size={14} className="text-[var(--muted)]" />
              <input 
                className="flex-1 bg-transparent border-none border-b border-[var(--border)] text-[var(--muted)] text-xs p-1 focus:outline-none focus:border-[var(--accent2)] focus:text-[var(--text)]"
                type="text" 
                placeholder="添加备注..."
                value={scene.notes} 
                onChange={(e) => onUpdate(scene.id, 'notes', e.target.value)}
              />
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(scene.id); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[11px] font-medium hover:bg-[var(--danger)] hover:text-white transition-all"
            >
              <Trash2 size={14} /> 删除分镜
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
