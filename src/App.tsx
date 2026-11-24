import React, { useEffect, useRef, useState } from "react";
import { ClipOutputSection } from "./components/ClipOutputSection";
import { GoldenFooter } from "./components/GoldenFooter";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { RecapHistorySidebar } from "./components/RecapHistorySidebar";
import { RecapInsightsCards } from "./components/RecapInsightsCards";
import { SettingsWizardModal } from "./components/SettingsWizardModal";
import { StudioHeader } from "./components/StudioHeader";
import { StudioInputSection } from "./components/StudioInputSection";
import { SubtitleEditorModal } from "./components/SubtitleEditorModal";
import { ToastContainer } from "./components/ToastContainer";
import {
  PROCESSING_STEPS_BURMESE,
  clampClipDuration,
  formatDurationBurmese,
  normalizeClipMediaUrls,
  safeFetchJson,
} from "./components/types";
import type {
  ClipItem,
  DemoQuotaStatus,
  InputSourceTab,
  RecapLanguage,
  SettingsWizardTab,
  StructuredRecapSummary,
  SubtitleCue,
  SubtitleStyleOptions,
  ToastNotification,
  UploadTransferProgress,
} from "./components/types";
import {
  clearUserGeminiApiKey,
  getGeminiKeyHeaders,
  loadUserGeminiApiKey,
  resolveApiUrl,
  saveUserGeminiApiKey,
} from "./utils/apiKeyStorage";
import {
  clearRecapHistory,
  deleteRecapHistoryItem,
  loadRecapHistory,
  saveRecapToHistory,
} from "./utils/recapHistory";
import type { RecapHistoryEntry } from "./utils/recapHistory";

export type { ClipItem, StructuredRecapSummary, SubtitleCue, SubtitleStyleOptions };

export default function App() {
  const [activeTab, setActiveTab] = useState<InputSourceTab>("youtube");
  const [textSubMode, setTextSubMode] = useState<"url" | "raw">("url");
  const [articleUrlInput, setArticleUrlInput] = useState<string>("");
  const [rawTextInput, setRawTextInput] = useState<string>("");
  const [videoUrlInput, setVideoUrlInput] = useState<string>("");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadTransferProgress, setUploadTransferProgress] =
    useState<UploadTransferProgress | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [framingMode, setFramingMode] = useState<"blur_bg" | "crop_fill" | "letterbox">("blur_bg");
  const [bypassCensorship, setBypassCensorship] = useState<boolean>(true);
  const [recapLanguage, setRecapLanguage] = useState<RecapLanguage>("my");
  const [audioMode, setAudioMode] = useState<"original" | "voiceover" | "mix">("original");
  const [clipDuration, setClipDuration] = useState<number>(30);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(30);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const seekDebounceRef = useRef<number | null>(null);
  const autoCutDebounceRef = useRef<number | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const justPastedRef = useRef<boolean>(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleOptions>({
    theme: "gold",
    fontSize: "md",
    position: "bottom",
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number | null>(null);
  const [processingStatusText, setProcessingStatusText] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueLength, setQueueLength] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  // BYOK (Bring Your Own Key), Free Demo Quota & Toast Notifications
  const [userApiKey, setUserApiKey] = useState<string>(() => loadUserGeminiApiKey());
  const [demoQuota, setDemoQuota] = useState<DemoQuotaStatus>(() => {
    const hasKey = Boolean(loadUserGeminiApiKey());
    return {
      mode: hasKey ? "byok" : "demo",
      hasPersonalApiKey: hasKey,
      demoLimit: 2,
      demoUsed: 0,
      demoRemaining: 2,
      resetAt: null,
    };
  });
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Multi-Device & PWA Install Support
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);

  const [sourceTitle, setSourceTitle] = useState<string>(
    "KKS Gold OS — နမူနာ ရုပ်ရှင်အနှစ်ချုပ် ဗီဒီယို"
  );
  const [recapSummary, setRecapSummary] = useState<StructuredRecapSummary | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [activeClipIndex, setActiveClipIndex] = useState<number>(0);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadDoneId, setDownloadDoneId] = useState<string | null>(null);

  // Settings Wizard, History Sidebar & Subtitle Editor Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsStep, setSettingsStep] = useState<SettingsWizardTab>(1);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<RecapHistoryEntry[]>(() =>
    loadRecapHistory()
  );
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState<boolean>(false);
  const [editingSubtitles, setEditingSubtitles] = useState<SubtitleCue[]>([]);
  const [isReburning, setIsReburning] = useState<boolean>(false);
  const [reburnSuccessMsg, setReburnSuccessMsg] = useState<string | null>(null);
  const [autoCutOnPaste, setAutoCutOnPaste] = useState<boolean>(true);
  const [draftFirstMode, setDraftFirstMode] = useState<boolean>(false);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [pendingDraftMeta, setPendingDraftMeta] = useState<{
    sourceType: InputSourceTab;
    sourceLabel: string;
    durationSec: number;
  } | null>(null);
  const [isRenderingFromScript, setIsRenderingFromScript] = useState<boolean>(false);

  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outputSectionRef = useRef<HTMLElement | null>(null);
  const recapInsightsRef = useRef<HTMLDivElement | null>(null);
  const preloadedClipFileRef = useRef<{ url: string; file: File } | null>(null);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const pushToast = (toast: Omit<ToastNotification, "id">) => {
    const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, 7000);
  };

  const openSettingsAtStep = (step: SettingsWizardTab = 1) => {
    setSettingsStep(step);
    setIsSettingsOpen(true);
  };

  const handleSaveUserApiKey = (rawKey: string) => {
    const saved = saveUserGeminiApiKey(rawKey);
    setUserApiKey(saved);
    setDemoQuota((prev) => ({
      ...prev,
      mode: "byok",
      hasPersonalApiKey: true,
    }));
    pushToast({
      variant: "success",
      title: "Unlimited Mode Active",
      message: "ကိုယ်ပိုင် Free Gemini API Key ကို သိမ်းဆည်းပြီးပါပြီ။ အကန့်အသတ်မရှိ ဆက်လက်သုံးနိုင်ပါသည်။",
    });
  };

  const handleClearUserApiKey = () => {
    clearUserGeminiApiKey();
    setUserApiKey("");
    safeFetchJson<DemoQuotaStatus>("/api/recap/quota", undefined, 0).then((res) => {
      if (res.ok && res.data) {
        setDemoQuota(res.data);
      } else {
        setDemoQuota((prev) => ({
          ...prev,
          mode: "demo",
          hasPersonalApiKey: false,
        }));
      }
    });
  };

  // Keep Demo Mode quota synced from server response headers & /api/recap/quota
  useEffect(() => {
    const handleQuotaEvent = (evt: Event) => {
      const customEvt = evt as CustomEvent<Partial<DemoQuotaStatus>>;
      if (!customEvt.detail) return;
      setDemoQuota((prev) => ({
        ...prev,
        ...customEvt.detail,
      }));
    };
    window.addEventListener("kks-demo-quota", handleQuotaEvent);
    safeFetchJson<DemoQuotaStatus>("/api/recap/quota", undefined, 0).then((res) => {
      if (res.ok && res.data) {
        setDemoQuota(res.data);
      }
    });
    return () => {
      window.removeEventListener("kks-demo-quota", handleQuotaEvent);
    };
  }, [userApiKey]);

  // Listen for PWA Install Prompt for Multi-Device usage
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
    });
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  // Load initial showcase MP4 clip or deep-linked clip (?clip=...)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const sharedClipId = params.get("clip");
        if (sharedClipId) {
          const res = await safeFetchJson<{ clip: ClipItem }>(
            `/api/recap/clip/${encodeURIComponent(sharedClipId)}`
          );
          if (mounted && res.ok && res.data?.clip) {
            const normalized = normalizeClipMediaUrls(res.data.clip);
            setClips([normalized]);
            setRecapSummary(normalized.recapSummary || null);
            setActiveClipIndex(0);
            setSourceTitle(normalized.titleBurmese || "မျှဝေထားသော ရုပ်ရှင်အနှစ်ချုပ်");
            setIsInitialLoading(false);
            setTimeout(() => {
              outputSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    videoRef.current.play().catch(() => {});
                  }
                });
              }
            }, 300);
            return;
          }
        }

        const result = await safeFetchJson<{
          recapSummary?: StructuredRecapSummary | null;
          clips: ClipItem[];
        }>("/api/recap/showcase");
        if (
          mounted &&
          result.ok &&
          result.data &&
          Array.isArray(result.data.clips) &&
          result.data.clips.length > 0
        ) {
          const normalizedClips = result.data.clips.map(normalizeClipMediaUrls);
          setClips(normalizedClips);
          setRecapSummary(
            result.data.recapSummary || normalizedClips[0]?.recapSummary || null
          );
          setActiveClipIndex(0);
        }
      } catch {
        // Fallback clean state
      } finally {
        if (mounted) setIsInitialLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Cycle Burmese status messages
  useEffect(() => {
    if (!isProcessing) {
      setStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setStepIndex((prev) =>
        prev < PROCESSING_STEPS_BURMESE.length - 1 ? prev + 1 : prev
      );
    }, 3200);
    return () => clearInterval(interval);
  }, [isProcessing]);

  const activeClip: ClipItem | undefined = clips[activeClipIndex] || clips[0];

  // Pre-cache active MP4 as a File (<=45MB) so iOS Safari & Android Chrome Web Share API
  // can invoke navigator.share({ files }) synchronously without losing user gesture activation
  useEffect(() => {
    if (!activeClip?.videoUrl) {
      preloadedClipFileRef.current = null;
      return;
    }
    const resolvedUrl = resolveApiUrl(activeClip.videoUrl);
    if (preloadedClipFileRef.current?.url === resolvedUrl) return;
    preloadedClipFileRef.current = null;

    const controller = new AbortController();
    fetch(resolvedUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) return null;
        const lenHeader = res.headers.get("content-length");
        if (lenHeader && Number(lenHeader) > 45 * 1024 * 1024) return null;
        return res.blob();
      })
      .then((blob) => {
        if (!blob || blob.size === 0 || blob.size > 45 * 1024 * 1024) return;
        const mp4Blob = blob.type === "video/mp4" ? blob : new Blob([blob], { type: "video/mp4" });
        const safeName = activeClip.filename || `KKS_Gold_Clip_0${activeClip.index}.mp4`;
        const file = new File([mp4Blob], safeName, { type: "video/mp4" });
        preloadedClipFileRef.current = { url: resolvedUrl, file };
      })
      .catch(() => {
        // Ignore abort/network errors during optional pre-cache
      });

    return () => controller.abort();
  }, [activeClip?.videoUrl, activeClip?.filename, activeClip?.index]);

  // Auto-play and reset video state whenever the active clip changes or is cut
  useEffect(() => {
    setVideoCurrentTime(0);
    setIsVideoBuffering(false);
    setVideoError(null);
    setBufferedPercent(0);
    if (activeClip) {
      setVideoDuration(activeClip.durationSec || 12);
    }
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsVideoPlaying(true);
          })
          .catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current
                .play()
                .then(() => setIsVideoPlaying(true))
                .catch(() => setIsVideoPlaying(false));
            }
          });
      }
    }
  }, [activeClipIndex, activeClip?.videoUrl]);

  // Buffering Watchdog Timer
  useEffect(() => {
    if (!isVideoBuffering) return;
    const watchdog = setTimeout(() => {
      if (videoRef.current && isVideoBuffering) {
        console.warn("Watchdog nudging video player buffer to unfreeze");
        try {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 0.04);
          videoRef.current.play().catch(() => {});
        } catch {
          // Ignore
        }
        setIsVideoBuffering(false);
      }
    }, 2500);
    return () => clearTimeout(watchdog);
  }, [isVideoBuffering]);

  const handleOpenSubtitleEditor = () => {
    if (!activeClip) return;
    setEditingSubtitles(
      activeClip.subtitles.map((cue) => ({
        startOffset: cue.startOffset,
        endOffset: cue.endOffset,
        text: cue.text,
      }))
    );
    setReburnSuccessMsg(null);
    setIsSubtitleEditorOpen(true);
  };

  const handleSaveAndReburnSubtitles = async () => {
    if (!activeClip || isReburning) return;
    setIsReburning(true);
    setReburnSuccessMsg(null);

    try {
      const result = await safeFetchJson<any>("/api/recap/re-burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFilename: activeClip.filename,
          subtitles: editingSubtitles,
          titleBurmese: activeClip.titleBurmese,
          aspectRatio: activeClip.aspectRatio,
          framingMode,
          bypassCensorship,
          styleOptions: subtitleStyle,
          durationSec: activeClip.durationSec,
        }),
      });

      if (!result.ok || !result.data) {
        if (result.status === 429 || result.status === 0) {
          pushToast({
            variant: result.status === 429 ? "warning" : "error",
            title: result.status === 429 ? "Rate Limit Reached" : "Network Error",
            message:
              result.error || "စာတန်းထိုး ပြန်လည်ထည့်သွင်းရာတွင် အခက်အခဲရှိပါသည်။",
            actionType: result.status === 429 ? "open_api_key" : undefined,
          });
        }
        throw new Error(result.error || "စာတန်းထိုး ပြန်လည်ထည့်သွင်းရာတွင် အခက်အခဲရှိပါသည်။");
      }

      const data = result.data;
      const updatedClip = normalizeClipMediaUrls({
        ...activeClip,
        id: data.id,
        videoUrl: data.videoUrl,
        downloadUrl: data.downloadUrl,
        filename: data.filename,
        fileSizeMb: data.fileSizeMb || activeClip.fileSizeMb,
        subtitles: data.subtitles,
        bypassCensorship: data.bypassCensorship ?? bypassCensorship,
      });

      setClips((prev) => prev.map((c, i) => (i === activeClipIndex ? updatedClip : c)));
      setReburnSuccessMsg("စာတန်းထိုးအသစ်ဖြင့် MP4 ဗီဒီယို ထုတ်ယူပြီးပါပြီ ✓");
      setTimeout(() => {
        setIsSubtitleEditorOpen(false);
      }, 900);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "စာတန်းထိုး ပြန်လည်ထည့်သွင်း၍ မရနိုင်ပါ။"
      );
    } finally {
      setIsReburning(false);
    }
  };

  const pollRecapJob = async (
    jobId: string
  ): Promise<{
    sourceTitle?: string;
    recapSummary?: StructuredRecapSummary | null;
    clips: ClipItem[];
    draftMode?: boolean;
    draftId?: string;
    targetDurationSec?: number;
  }> => {
    const maxDeadline = Date.now() + 14 * 60 * 1000;
    let transientErrors = 0;

    while (Date.now() < maxDeadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await safeFetchJson<{
        jobId: string;
        status: "queued" | "processing" | "done" | "error";
        progress?: number;
        message?: string;
        queuePosition?: number;
        queueLength?: number;
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary | null;
        clips?: ClipItem[];
        draftMode?: boolean;
        draftId?: string;
        targetDurationSec?: number;
        error?: string;
      }>(`/api/recap/status/${encodeURIComponent(jobId)}`);

      if (!statusRes.ok || !statusRes.data) {
        transientErrors += 1;
        if (statusRes.status === 404 || transientErrors >= 6) {
          throw new Error(
            statusRes.error ||
              "ဗီဒီယို ဖြတ်တောက်မှု အခြေအနေ စစ်ဆေးရာတွင် အခက်အခဲ ဖြစ်ပေါ်နေပါသည်။"
          );
        }
        continue;
      }

      transientErrors = 0;
      const job = statusRes.data;
      if (typeof job.queuePosition === "number") {
        setQueuePosition(job.queuePosition > 0 ? job.queuePosition : null);
      }
      if (typeof job.queueLength === "number") {
        setQueueLength(job.queueLength > 0 ? job.queueLength : null);
      }
      if (typeof job.progress === "number") {
        setProcessingProgress(job.progress);
      }
      if (job.message) {
        setProcessingStatusText(job.message);
      }

      if (job.status === "done") {
        setQueuePosition(null);
        setQueueLength(null);
        return {
          sourceTitle: job.sourceTitle,
          recapSummary: job.recapSummary || null,
          clips: Array.isArray(job.clips) ? job.clips : [],
          draftMode: Boolean(job.draftMode),
          draftId: job.draftId,
          targetDurationSec: job.targetDurationSec,
        };
      }

      if (job.status === "error") {
        setQueuePosition(null);
        setQueueLength(null);
        throw new Error(
          job.error ||
            "ဗီဒီယို ဖြတ်တောက်ရာတွင် အခက်အခဲ ဖြစ်ပေါ်နေပါသည်။ Link ကို စစ်ဆေးပြီး ထပ်မံကြိုးစားပါ။"
        );
      }
    }

    throw new Error("ဗီဒီယို ဖြတ်တောက်ချိန် ကြာမြင့်လွန်းသဖြင့် ရပ်တန့်သွားပါသည်။ ထပ်မံကြိုးစားပေးပါ။");
  };

  const applyGeneratedClipsResult = (
    data: {
      sourceTitle?: string;
      recapSummary?: StructuredRecapSummary | null;
      clips: ClipItem[];
      cached?: boolean;
      draftMode?: boolean;
      draftId?: string;
      targetDurationSec?: number;
    },
    fallbackTitle: string,
    historyMeta?: {
      sourceType: InputSourceTab;
      sourceLabel: string;
    }
  ) => {
    const normalizedClips = (data.clips || []).map(normalizeClipMediaUrls);
    const resolvedTitle = data.sourceTitle || fallbackTitle;
    const resolvedRecap = data.recapSummary || normalizedClips?.[0]?.recapSummary || null;

    if (data.draftMode && data.draftId && resolvedRecap) {
      setRecapSummary(resolvedRecap);
      setSourceTitle(resolvedTitle);
      setClips([]);
      setActiveClipIndex(0);
      setPendingDraftId(data.draftId);
      setPendingDraftMeta({
        sourceType: historyMeta?.sourceType || activeTab,
        sourceLabel: historyMeta?.sourceLabel || resolvedTitle,
        durationSec: data.targetDurationSec || clampClipDuration(clipDuration),
      });
      setSuccessMessage(
        "✏️ Recap Script နှင့် Timeline Segments များ ထုတ်ယူပြီးပါပြီ! အောက်တွင် စာသား/အသံ စိတ်ကြိုက်ပြင်ဆင်ပြီးမှ ဗီဒီယို Render ပြုလုပ်နိုင်ပါသည် ✓"
      );
      setTimeout(() => setSuccessMessage(null), 7000);
      setTimeout(() => {
        recapInsightsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
      return;
    }

    if (Array.isArray(normalizedClips) && normalizedClips.length > 0) {
      setPendingDraftId(null);
      setPendingDraftMeta(null);
      setClips(normalizedClips);
      setRecapSummary(resolvedRecap);
      setActiveClipIndex(0);
      setSourceTitle(resolvedTitle);

      if (resolvedRecap && historyMeta) {
        const { items, savedEntry } = saveRecapToHistory({
          sourceType: historyMeta.sourceType,
          sourceLabel: historyMeta.sourceLabel,
          sourceTitle: resolvedTitle,
          recapSummary: resolvedRecap,
          clips: normalizedClips,
          cachedHit: Boolean(data.cached),
        });
        setHistoryItems(items);
        setActiveHistoryId(savedEntry.id);
      }

      const actualSec = data.clips[0]?.durationSec || clipDuration;
      setSuccessMessage(
        data.cached
          ? `⚡ Cache မှ အနှစ်ချုပ်နှင့် ဗီဒီယို (${formatDurationBurmese(actualSec)}) ကို AI ထပ်မံ Run ရန်မလိုဘဲ ချက်ချင်း ပြန်လည်ထုတ်ပေးထားပါသည် ✓`
          : `✓ ရုပ်ရှင်အနှစ်ချုပ် ဗီဒီယို (${formatDurationBurmese(actualSec)}) အလိုအလျောက် ဖြတ်တောက်ပြီးပါပြီ! အောက်တွင် တိုက်ရိုက် ကြည့်ရှုနိုင်ပါသည်`
      );
      setTimeout(() => setSuccessMessage(null), 6000);
      setTimeout(() => {
        outputSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              if (videoRef.current) {
                videoRef.current.muted = true;
                videoRef.current.play().catch(() => {});
              }
            });
          }
        }
      }, 220);
    }
  };

  const handleUpdateRecapInline = (updatedRecap: StructuredRecapSummary) => {
    setRecapSummary(updatedRecap);
  };

  const handleRenderVideoFromScript = async (editedRecap: StructuredRecapSummary) => {
    if (isRenderingFromScript) return;
    setRecapSummary(editedRecap);
    setErrorMessage(null);
    setIsRenderingFromScript(true);

    try {
      const targetDur = pendingDraftMeta?.durationSec || activeClip?.durationSec || clampClipDuration(clipDuration);
      const res = await safeFetchJson<{
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary;
        clips?: ClipItem[];
        rebuiltClip?: Partial<ClipItem> & {
          id: string;
          videoUrl: string;
          downloadUrl: string;
          filename: string;
          fileSizeMb: string;
          subtitles: SubtitleCue[];
          durationSec: number;
          bypassCensorship?: boolean;
          audioRegenerated?: boolean;
        };
      }>("/api/recap/render-from-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: pendingDraftId || undefined,
          originalFilename: !pendingDraftId ? activeClip?.filename : undefined,
          recapSummary: editedRecap,
          aspectRatio: !pendingDraftId && activeClip ? activeClip.aspectRatio : aspectRatio,
          framingMode,
          audioMode,
          bypassCensorship,
          durationSec: targetDur,
          styleOptions: subtitleStyle,
        }),
      });

      if (!res.ok || !res.data) {
        if (res.status === 429 || res.status === 0) {
          pushToast({
            variant: res.status === 429 ? "warning" : "error",
            title: res.status === 429 ? "API Rate Limit" : "Network Error",
            message:
              res.error || "ပြင်ဆင်ထားသော Script ဖြင့် ဗီဒီယို ထုတ်ယူရာတွင် အခက်အခဲရှိနေပါသည်။",
            actionType: res.status === 429 ? "open_api_key" : undefined,
          });
        }
        throw new Error(
          res.error || "ပြင်ဆင်ထားသော Script ဖြင့် ဗီဒီယို ထုတ်ယူရာတွင် အခက်အခဲရှိနေပါသည်။"
        );
      }

      if (Array.isArray(res.data.clips) && res.data.clips.length > 0) {
        const normalizedClips = res.data.clips.map(normalizeClipMediaUrls);
        const finalSummary = res.data.recapSummary || editedRecap;
        const resolvedTitle = res.data.sourceTitle || finalSummary.title || sourceTitle;
        setPendingDraftId(null);
        setClips(normalizedClips);
        setRecapSummary(finalSummary);
        setActiveClipIndex(0);
        setSourceTitle(resolvedTitle);

        const { items, savedEntry } = saveRecapToHistory({
          sourceType: pendingDraftMeta?.sourceType || activeTab,
          sourceLabel: pendingDraftMeta?.sourceLabel || resolvedTitle,
          sourceTitle: resolvedTitle,
          recapSummary: finalSummary,
          clips: normalizedClips,
          cachedHit: false,
        });
        setHistoryItems(items);
        setActiveHistoryId(savedEntry.id);
        setPendingDraftMeta(null);
      } else if (res.data.rebuiltClip && activeClip) {
        const finalSummary = res.data.recapSummary || editedRecap;
        const updatedClip = normalizeClipMediaUrls({
          ...activeClip,
          ...res.data.rebuiltClip,
          titleBurmese: finalSummary.title,
          summaryBurmese: finalSummary.executiveSummary,
          recapSummary: finalSummary,
        });
        const updatedList = clips.map((c, idx) => (idx === activeClipIndex ? updatedClip : c));
        setClips(updatedList);
        setRecapSummary(finalSummary);

        const { items, savedEntry } = saveRecapToHistory({
          sourceType: activeTab,
          sourceLabel: sourceTitle,
          sourceTitle: finalSummary.title || sourceTitle,
          recapSummary: finalSummary,
          clips: updatedList,
          cachedHit: false,
        });
        setHistoryItems(items);
        setActiveHistoryId(savedEntry.id);
      }

      setSuccessMessage("✓ ပြင်ဆင်ထားသော Script နှင့် Timeline ဖြင့် MP4 ဗီဒီယို အသစ် ဖန်တီးပြီးပါပြီ!");
      setTimeout(() => setSuccessMessage(null), 6000);
      setTimeout(() => {
        outputSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 180);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "ပြင်ဆင်ထားသော Script ဖြင့် ဗီဒီယို ဖန်တီး၍ မရနိုင်ပါ။";
      setErrorMessage(msg);
      pushToast({
        variant: "error",
        title: "Render Error",
        message: msg,
      });
    } finally {
      setIsRenderingFromScript(false);
    }
  };

  const handleSelectHistoryItem = (entry: RecapHistoryEntry) => {
    setErrorMessage(null);
    setPendingDraftId(null);
    setPendingDraftMeta(null);
    setClips((entry.clips || []).map(normalizeClipMediaUrls));
    setRecapSummary(entry.recapSummary);
    setActiveClipIndex(0);
    setSourceTitle(entry.sourceTitle);
    setActiveHistoryId(entry.id);
    setIsHistoryOpen(false);
    setSuccessMessage(
      `📚 Recap History မှ "${entry.recapSummary.title}" ကို AI ထပ်မံမသုံးဘဲ ပြန်လည်ဖွင့်ပြထားပါသည်`
    );
    setTimeout(() => setSuccessMessage(null), 5000);
    setTimeout(() => {
      outputSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
  };

  const handleDeleteHistoryItem = (id: string) => {
    const next = deleteRecapHistoryItem(id);
    setHistoryItems(next);
    if (activeHistoryId === id) {
      setActiveHistoryId(null);
    }
  };

  const handleClearHistory = () => {
    const empty = clearRecapHistory();
    setHistoryItems(empty);
    setActiveHistoryId(null);
  };

  const handleSaveCurrentRecapToHistory = () => {
    if (!recapSummary) return;
    const { items, savedEntry } = saveRecapToHistory({
      sourceType: activeTab,
      sourceLabel: sourceTitle,
      sourceTitle,
      recapSummary,
      clips,
      cachedHit: false,
    });
    setHistoryItems(items);
    setActiveHistoryId(savedEntry.id);
  };

  const handleGenerateClips = async (overrideUrl?: string) => {
    if (isProcessingRef.current) return;
    if (autoCutDebounceRef.current) {
      clearTimeout(autoCutDebounceRef.current);
      autoCutDebounceRef.current = null;
    }

    const targetUrl = (overrideUrl ?? videoUrlInput).trim();
    if (!targetUrl) {
      setErrorMessage("ကျေးဇူးပြု၍ မည်သည့် Video Link ကိုမဆို ထည့်သွင်းပေးပါ။");
      return;
    }

    const safeTargetDuration = clampClipDuration(clipDuration);
    isProcessingRef.current = true;
    setErrorMessage(null);
    setIsProcessing(true);
    setProcessingProgress(6);
    setProcessingStatusText(
      `ဗီဒီယို Link မှ ${formatDurationBurmese(safeTargetDuration)} စာ ရုပ်သံကို ဆွဲယူနေပါသည်...`
    );
    setDownloadDoneId(null);

    try {
      const result = await safeFetchJson<{
        jobId?: string;
        status?: string;
        queuePosition?: number;
        queueLength?: number;
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary | null;
        clips?: ClipItem[];
        cached?: boolean;
        draftMode?: boolean;
        draftId?: string;
        targetDurationSec?: number;
      }>("/api/recap/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "youtube",
          url: targetUrl,
          aspectRatio,
          framingMode,
          bypassCensorship,
          audioMode,
          durationSec: safeTargetDuration,
          styleOptions: subtitleStyle,
          asyncMode: true,
          draftOnly: draftFirstMode,
          language: recapLanguage,
        }),
      });

      if (!result.ok || !result.data) {
        const msg =
          result.error ||
            "ဗီဒီယို ဖြတ်တောက်ရာတွင် အခက်အခဲ ဖြစ်ပေါ်နေပါသည်။ Link ကို စစ်ဆေးပြီး ထပ်မံကြိုးစားပါ။";
        setErrorMessage(msg);
        if (result.status === 429 || result.status === 0 || result.status >= 500) {
          pushToast({
            variant: result.status === 429 ? "warning" : "error",
            title:
              result.code === "DEMO_QUOTA_EXCEEDED"
                ? "Free Demo Mode ကန့်သတ်ချက် ပြည့်ပါပြီ"
                : result.status === 429
                ? "API Rate Limit"
                : result.status === 0
                ? "Network Error"
                : "Generation Failed",
            message: msg,
            actionType: result.status === 429 ? "open_api_key" : undefined,
          });
        }
        return;
      }

      if (typeof result.data.queuePosition === "number" && result.data.queuePosition > 0) {
        setQueuePosition(result.data.queuePosition);
        setQueueLength(result.data.queueLength ?? result.data.queuePosition);
      }

      let finalData: {
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary | null;
        clips: ClipItem[];
        cached?: boolean;
        draftMode?: boolean;
        draftId?: string;
        targetDurationSec?: number;
      };
      if (
        result.data.jobId &&
        !result.data.draftMode &&
        (!Array.isArray(result.data.clips) || result.data.clips.length === 0)
      ) {
        finalData = await pollRecapJob(result.data.jobId);
      } else {
        finalData = {
          sourceTitle: result.data.sourceTitle,
          recapSummary: result.data.recapSummary || null,
          clips: result.data.clips || [],
          cached: Boolean(result.data.cached),
          draftMode: Boolean(result.data.draftMode),
          draftId: result.data.draftId,
          targetDurationSec: result.data.targetDurationSec,
        };
      }

      applyGeneratedClipsResult(finalData, "ဖြတ်တောက်ပြီးသော ရုပ်သံအပိုင်းများ", {
        sourceType: "youtube",
        sourceLabel: targetUrl,
      });
    } catch (err) {
      console.error("Clips generation error:", err);
      const isNet =
        err instanceof TypeError ||
        (err instanceof Error &&
          (err.message.includes("fetch") ||
            err.message.includes("network") ||
            err.message.includes("Failed")));
      const msg = isNet
        ? "ဗီဒီယို Link ချိတ်ဆက်ရာတွင် အင်တာနက် အခက်အခဲရှိနေပါသည်။ 'အသင့်စမ်းသပ်ရန်' Link များဖြင့် စမ်းသပ်နိုင်သလို မိမိစက်ထဲမှ ဗီဒီယိုဖိုင် (Upload) ကိုလည်း တိုက်ရိုက် ရွေးချယ်နိုင်ပါသည်။"
        : err instanceof Error
        ? err.message
        : "ဗီဒီယို Link ကို ဖတ်ရှုရာတွင် အခက်အခဲရှိနေပါသည်။";
      setErrorMessage(msg);
      pushToast({
        variant: isNet || msg.includes("Rate limit") || msg.includes("API Key") ? "warning" : "error",
        title: isNet ? "Network Connection Error" : "Recap Generation Error",
        message: msg,
        actionType: msg.includes("API Key") || msg.includes("Rate limit") ? "open_api_key" : undefined,
      });
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setProcessingProgress(null);
      setProcessingStatusText(null);
      setQueuePosition(null);
      setQueueLength(null);
    }
  };

  const handleGenerateTextArticleRecap = async (
    overrideUrl?: string,
    overrideText?: string
  ) => {
    if (isProcessingRef.current) return;

    const targetUrl =
      textSubMode === "url" ? (overrideUrl ?? articleUrlInput).trim() : "";
    const targetText =
      textSubMode === "raw" ? (overrideText ?? rawTextInput).trim() : "";

    if (textSubMode === "url" && !targetUrl) {
      setErrorMessage("ကျေးဇူးပြု၍ ဆောင်းပါး URL Link တစ်ခု ထည့်သွင်းပေးပါ။");
      return;
    }
    if (textSubMode === "raw" && targetText.length < 20) {
      setErrorMessage("ကျေးဇူးပြု၍ အနည်းဆုံး စာလုံး ၂၀ ခန့်ပါဝင်သော စာသား ထည့်သွင်းပေးပါ။");
      return;
    }

    const safeTargetDuration = clampClipDuration(clipDuration);
    isProcessingRef.current = true;
    setErrorMessage(null);
    setIsProcessing(true);
    setProcessingProgress(8);
    setProcessingStatusText(
      targetUrl
        ? "ဆောင်းပါး Link မှ စာသားအချက်အလက်များကို ဖတ်ရှုနေပါသည်..."
        : "ထည့်သွင်းထားသော စာသားကို Gemini AI ဖြင့် အနှစ်ချုပ်နေပါသည်..."
    );
    setDownloadDoneId(null);

    try {
      const result = await safeFetchJson<{
        jobId?: string;
        status?: string;
        queuePosition?: number;
        queueLength?: number;
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary | null;
        clips?: ClipItem[];
        cached?: boolean;
        draftMode?: boolean;
        draftId?: string;
        targetDurationSec?: number;
      }>("/api/recap/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "text_article",
          articleUrl: targetUrl || undefined,
          text: targetText || undefined,
          aspectRatio,
          framingMode,
          bypassCensorship,
          audioMode,
          durationSec: Math.min(30, safeTargetDuration),
          styleOptions: subtitleStyle,
          asyncMode: true,
          draftOnly: draftFirstMode,
          language: recapLanguage,
        }),
      });

      if (!result.ok || !result.data) {
        const msg =
          result.error || "ဆောင်းပါး သို့မဟုတ် စာသား အနှစ်ချုပ် ဖန်တီးရာတွင် အခက်အခဲ ဖြစ်ပေါ်နေပါသည်။";
        setErrorMessage(msg);
        if (result.status === 429 || result.status === 0 || result.status >= 500) {
          pushToast({
            variant: result.status === 429 ? "warning" : "error",
            title:
              result.code === "DEMO_QUOTA_EXCEEDED"
                ? "Free Demo Mode ကန့်သတ်ချက် ပြည့်ပါပြီ"
                : result.status === 429
                ? "API Rate Limit"
                : result.status === 0
                ? "Network Error"
                : "Generation Failed",
            message: msg,
            actionType: result.status === 429 ? "open_api_key" : undefined,
          });
        }
        return;
      }

      if (typeof result.data.queuePosition === "number" && result.data.queuePosition > 0) {
        setQueuePosition(result.data.queuePosition);
        setQueueLength(result.data.queueLength ?? result.data.queuePosition);
      }

      let finalData: {
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary | null;
        clips: ClipItem[];
        cached?: boolean;
        draftMode?: boolean;
        draftId?: string;
        targetDurationSec?: number;
      };
      if (
        result.data.jobId &&
        !result.data.draftMode &&
        (!Array.isArray(result.data.clips) || result.data.clips.length === 0)
      ) {
        finalData = await pollRecapJob(result.data.jobId);
      } else {
        finalData = {
          sourceTitle: result.data.sourceTitle,
          recapSummary: result.data.recapSummary || null,
          clips: result.data.clips || [],
          cached: Boolean(result.data.cached),
          draftMode: Boolean(result.data.draftMode),
          draftId: result.data.draftId,
          targetDurationSec: result.data.targetDurationSec,
        };
      }

      applyGeneratedClipsResult(finalData, "ဆောင်းပါးနှင့် စာသား အနှစ်ချုပ်", {
        sourceType: "text_article",
        sourceLabel: targetUrl || targetText.slice(0, 120),
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "ဆောင်းပါး သို့မဟုတ် စာသားကို ဖတ်ရှုရာတွင် အခက်အခဲရှိနေပါသည်။";
      setErrorMessage(msg);
      pushToast({
        variant: msg.includes("Rate limit") || msg.includes("API Key") ? "warning" : "error",
        title: "Article / Text Recap Error",
        message: msg,
        actionType: msg.includes("API Key") || msg.includes("Rate limit") ? "open_api_key" : undefined,
      });
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setProcessingProgress(null);
      setProcessingStatusText(null);
      setQueuePosition(null);
      setQueueLength(null);
    }
  };

  const uploadMediaWithXhrProgress = (
    uploadUrl: string,
    file: File
  ): Promise<{
    jobId?: string;
    queuePosition?: number;
    queueLength?: number;
    sourceTitle?: string;
    recapSummary?: StructuredRecapSummary | null;
    clips?: ClipItem[];
  }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", resolveApiUrl(uploadUrl), true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      const byokHeaders = getGeminiKeyHeaders();
      Object.entries(byokHeaders).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });

      xhr.upload.onprogress = (evt) => {
        const total = evt.lengthComputable && evt.total > 0 ? evt.total : file.size;
        const pct = total > 0 ? Math.min(99, Math.round((evt.loaded / total) * 100)) : 50;
        setUploadTransferProgress({
          percent: pct,
          loadedBytes: evt.loaded,
          totalBytes: total,
          fileName: file.name,
          phase: "uploading",
        });
        setProcessingProgress(Math.max(4, Math.min(24, Math.round(pct * 0.24))));
        setProcessingStatusText(
          `ဖိုင်တင်သွင်းနေပါသည် (${pct}%) — ${file.name}`
        );
      };

      xhr.onload = () => {
        const remHeader = xhr.getResponseHeader("x-demo-remaining");
        const modeHeader = xhr.getResponseHeader("x-demo-mode");
        const limitHeader = xhr.getResponseHeader("x-demo-limit");
        if (modeHeader || remHeader !== null) {
          const limit = limitHeader !== null ? Number(limitHeader) : 2;
          const remaining = remHeader !== null ? Number(remHeader) : limit;
          setDemoQuota((prev) => ({
            ...prev,
            mode: modeHeader === "byok" ? "byok" : "demo",
            hasPersonalApiKey: modeHeader === "byok",
            demoLimit: Number.isFinite(limit) ? limit : 2,
            demoRemaining: Number.isFinite(remaining) ? Math.max(0, remaining) : 2,
            demoUsed: Math.max(
              0,
              (Number.isFinite(limit) ? limit : 2) - (Number.isFinite(remaining) ? remaining : 2)
            ),
          }));
        }

        let parsed: any = null;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          // Non-JSON response
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadTransferProgress({
            percent: 100,
            loadedBytes: file.size,
            totalBytes: file.size,
            fileName: file.name,
            phase: "analyzing",
          });
          resolve((parsed || {}) as any);
        } else {
          const errMsg =
            parsed?.error ||
            `ဖိုင်တင်သွင်းရာတွင် အခက်အခဲ ဖြစ်ပေါ်ခဲ့ပါသည် (HTTP ${xhr.status})`;
          const errObj: any = new Error(errMsg);
          errObj.status = xhr.status;
          errObj.code = parsed?.code;
          reject(errObj);
        }
      };

      xhr.onerror = () => {
        const errObj: any = new Error("ကွန်ရက်ချိတ်ဆက်မှု ပြတ်တောက်သဖြင့် ဖိုင်တင်သွင်း၍ မရပါ။");
        errObj.status = 0;
        reject(errObj);
      };

      xhr.onabort = () => {
        reject(new Error("ဖိုင်တင်သွင်းမှုကို ရပ်တန့်လိုက်ပါသည်။"));
      };

      xhr.send(file);
    });
  };

  const handleUploadFileObject = async (file: File) => {
    if (isProcessingRef.current) return;

    if (file.size > 150 * 1024 * 1024) {
      setErrorMessage("ဖိုင်အရွယ်အစား 150MB အောက်သာ ရွေးချယ်ပေးပါ။");
      return;
    }

    const safeTargetDuration = clampClipDuration(clipDuration);
    setActiveTab("media_upload");
    setSelectedUploadFile(file);
    isProcessingRef.current = true;
    setErrorMessage(null);
    setIsProcessing(true);
    setUploadTransferProgress({
      percent: 0,
      loadedBytes: 0,
      totalBytes: file.size,
      fileName: file.name,
      phase: "uploading",
    });
    setProcessingProgress(4);
    setProcessingStatusText(
      `ဖိုင်တင်သွင်းပြီး Gemini File API (${formatDurationBurmese(safeTargetDuration)}) ဖြင့် စစ်ဆေးနေပါသည်...`
    );
    setDownloadDoneId(null);

    try {
      const uploadUrl =
        `/api/recap/upload?name=${encodeURIComponent(file.name)}` +
        `&aspect=${encodeURIComponent(aspectRatio)}` +
        `&duration=${encodeURIComponent(String(safeTargetDuration))}` +
        `&framing=${encodeURIComponent(framingMode)}` +
        `&audio=${encodeURIComponent(audioMode)}` +
        `&bypass=${bypassCensorship ? "1" : "0"}` +
        `&theme=${encodeURIComponent(subtitleStyle.theme)}` +
        `&fontSize=${encodeURIComponent(subtitleStyle.fontSize)}` +
        `&position=${encodeURIComponent(subtitleStyle.position)}` +
        `&language=${encodeURIComponent(recapLanguage)}` +
        `&async=1` +
        (draftFirstMode ? "&draft=1" : "");

      const data = await uploadMediaWithXhrProgress(uploadUrl, file);

      if (typeof data.queuePosition === "number" && data.queuePosition > 0) {
        setQueuePosition(data.queuePosition);
        setQueueLength(data.queueLength ?? data.queuePosition);
      }

      let finalData: {
        sourceTitle?: string;
        recapSummary?: StructuredRecapSummary | null;
        clips: ClipItem[];
        draftMode?: boolean;
        draftId?: string;
        targetDurationSec?: number;
      };
      if (data.jobId && (!Array.isArray(data.clips) || data.clips.length === 0)) {
        finalData = await pollRecapJob(data.jobId);
      } else {
        finalData = {
          sourceTitle: data.sourceTitle,
          recapSummary: data.recapSummary || null,
          clips: data.clips || [],
        };
      }

      applyGeneratedClipsResult(finalData, file.name, {
        sourceType: "media_upload",
        sourceLabel: file.name,
      });
    } catch (err: any) {
      const msg =
        err instanceof Error ? err.message : "အသံ/ဗီဒီယိုဖိုင် တင်သွင်းရာတွင် အခက်အခဲရှိနေပါသည်။";
      setErrorMessage(msg);
      pushToast({
        variant: err?.status === 429 ? "warning" : "error",
        title:
          err?.code === "DEMO_QUOTA_EXCEEDED"
            ? "Free Demo Mode ကန့်သတ်ချက် ပြည့်ပါပြီ"
            : err?.status === 429
            ? "API Rate Limit"
            : "Upload Error",
        message: msg,
        actionType: err?.status === 429 ? "open_api_key" : undefined,
      });
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setUploadTransferProgress(null);
      setProcessingProgress(null);
      setProcessingStatusText(null);
      setQueuePosition(null);
      setQueueLength(null);
    }
  };

  const handleLocalFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    await handleUploadFileObject(file);
  };

  const isLikelyIOSDevice = (): boolean => {
    if (typeof navigator === "undefined") return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  };

  const fetchClipAsFile = async (clip: ClipItem): Promise<File> => {
    const resolvedVideoUrl = resolveApiUrl(clip.videoUrl);
    if (preloadedClipFileRef.current?.url === resolvedVideoUrl) {
      return preloadedClipFileRef.current.file;
    }
    const downloadUrl = resolveApiUrl(clip.downloadUrl);
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error("MP4 fetch failed");
    const blob = await res.blob();
    const mp4Blob = blob.type === "video/mp4" ? blob : new Blob([blob], { type: "video/mp4" });
    const filename = clip.filename || `KKS_Gold_Clip_0${clip.index}.mp4`;
    const file = new File([mp4Blob], filename, { type: "video/mp4" });
    preloadedClipFileRef.current = { url: resolvedVideoUrl, file };
    return file;
  };

  const handleShareClip = async () => {
    if (!activeClip) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?clip=${encodeURIComponent(activeClip.id)}`;
    const shareTitle = activeClip.titleBurmese || "KKSRecap Movie Clip";
    const shareText = `${shareTitle} — မြန်မာစာတန်းထိုးပါဝင်သော ရုပ်ရှင်အနှစ်ချုပ် ဗီဒီယို`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      // 1. Prefer synchronous Web Share API with pre-cached MP4 File (saves to Photos/Files on iOS & shares directly on Android)
      const resolvedVideoUrl = resolveApiUrl(activeClip.videoUrl);
      const cached = preloadedClipFileRef.current;
      if (
        cached?.url === resolvedVideoUrl &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [cached.file] })
      ) {
        try {
          await navigator.share({
            files: [cached.file],
            title: shareTitle,
            text: shareText,
          });
          setCopiedShare(true);
          setTimeout(() => setCopiedShare(false), 2500);
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          // Fall through to URL share if file share is rejected
        }
      }

      // 2. Fallback to Web Share API link sharing
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }

    // 3. Clipboard fallback for unsupported browsers
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    } catch {
      setSuccessMessage(`မျှဝေရန် Link: ${shareUrl}`);
      setTimeout(() => setSuccessMessage(null), 6000);
    }
  };

  const handleInstallApp = async () => {
    if (!deferredInstallPrompt) {
      setSuccessMessage(
        "ဖုန်း Browser မီနူး (⋮ သို့မဟုတ် Share icon) မှ 'Add to Home screen' ကို ရွေးချယ်၍ ထည့်သွင်းနိုင်ပါသည်။"
      );
      setTimeout(() => setSuccessMessage(null), 5000);
      return;
    }
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredInstallPrompt(null);
      setIsAppInstalled(true);
    }
  };

  const triggerDirectAttachmentDownload = (url: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDownloadActiveClip = async () => {
    if (!activeClip || isDownloading) return;
    const downloadUrl = resolveApiUrl(activeClip.downloadUrl);
    const filename = activeClip.filename || `KKS_Gold_Clip_0${activeClip.index}.mp4`;
    const isIOS = isLikelyIOSDevice();

    // On iOS Safari, if pre-cached MP4 File is ready & Web Share files is supported,
    // invoke native share sheet synchronously so user can tap "Save Video" directly to Photos/Files
    if (isIOS && typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const resolvedVideoUrl = resolveApiUrl(activeClip.videoUrl);
      const cached = preloadedClipFileRef.current;
      if (
        cached?.url === resolvedVideoUrl &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [cached.file] })
      ) {
        try {
          await navigator.share({
            files: [cached.file],
            title: activeClip.titleBurmese || filename,
            text: filename,
          });
          setDownloadDoneId(activeClip.id);
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          // Fall through to attachment download on non-abort failure
        }
      }
    }

    setIsDownloading(true);
    try {
      if (isIOS) {
        // Trigger server Content-Disposition: attachment download directly so iOS Safari Download Manager saves the MP4
        triggerDirectAttachmentDownload(downloadUrl, filename);
        setDownloadDoneId(activeClip.id);
        pushToast({
          variant: "info",
          title: "MP4 Download စတင်ပါပြီ",
          message:
            "iPhone/iPad Safari တွင် 'Download' ကို နှိပ်၍ Files ထဲသို့ သိမ်းနိုင်သလို Photos ထဲသို့ တိုက်ရိုက်သိမ်းလိုပါက 'Save Video / မျှဝေရန်' ခလုတ်ကို အသုံးပြုနိုင်ပါသည်။",
        });
        return;
      }

      // Desktop & Android Chrome: fetch Blob & save with explicit .mp4 filename
      const file = await fetchClipAsFile(activeClip);
      const blobUrl = URL.createObjectURL(file);
      triggerDirectAttachmentDownload(blobUrl, filename);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
      setDownloadDoneId(activeClip.id);
    } catch {
      triggerDirectAttachmentDownload(downloadUrl, filename);
      setDownloadDoneId(activeClip.id);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleVideoProgress = () => {
    const v = videoRef.current;
    if (!v || v.duration <= 0) return;
    if (v.buffered.length > 0) {
      try {
        const bufferedEnd = v.buffered.end(v.buffered.length - 1);
        setBufferedPercent(Math.min(100, (bufferedEnd / v.duration) * 100));
      } catch {
        // Ignore index errors
      }
    }
  };

  const handleSeekToCue = (startOffset: number) => {
    if (!videoRef.current) return;
    setVideoCurrentTime(startOffset);
    if (seekDebounceRef.current) {
      clearTimeout(seekDebounceRef.current);
    }
    seekDebounceRef.current = window.setTimeout(() => {
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = startOffset;
          videoRef.current.play().catch(() => {});
        } catch {
          // Ignore
        }
      }
    }, 45);
  };

  const handleSliderSeek = (time: number) => {
    setVideoCurrentTime(time);
    if (!videoRef.current) return;
    if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
    seekDebounceRef.current = window.setTimeout(() => {
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = time;
        } catch {
          // Ignore
        }
      }
    }, 35);
  };

  const handleStepSeek = (delta: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + delta));
    handleSeekToCue(target);
  };

  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch((err) => {
        console.warn("Play blocked or failed:", err);
      });
    } else {
      videoRef.current.pause();
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleRestartVideo = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.pause();
    setVideoCurrentTime(0);
    setIsVideoPlaying(false);
  };

  const handleReloadVideo = () => {
    if (!videoRef.current) return;
    setVideoError(null);
    setIsVideoBuffering(true);
    videoRef.current.load();
    videoRef.current.play().catch(() => {
      setIsVideoBuffering(false);
    });
  };

  const handleToggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      videoRef.current.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#000000] text-[#F4F4F6] print:bg-white print:text-neutral-900 relative overflow-x-hidden pb-safe">
      <div className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pb-24 md:pb-16 print:p-0 print:max-w-none">
        <div className="print:hidden">
          <StudioHeader
            isAppInstalled={isAppInstalled}
            historyCount={historyItems.length}
            hasPersonalApiKey={Boolean(userApiKey)}
            demoQuota={demoQuota}
            onInstallApp={handleInstallApp}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenSettings={openSettingsAtStep}
          />

          {/* ၂။ TABBED 3-SOURCE STUDIO INPUT SECTION */}
          <StudioInputSection
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            textSubMode={textSubMode}
            setTextSubMode={setTextSubMode}
            articleUrlInput={articleUrlInput}
            setArticleUrlInput={setArticleUrlInput}
            rawTextInput={rawTextInput}
            setRawTextInput={setRawTextInput}
            videoUrlInput={videoUrlInput}
            setVideoUrlInput={setVideoUrlInput}
            selectedUploadFile={selectedUploadFile}
            uploadTransferProgress={uploadTransferProgress}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            framingMode={framingMode}
            setFramingMode={setFramingMode}
            audioMode={audioMode}
            setAudioMode={setAudioMode}
            bypassCensorship={bypassCensorship}
            setBypassCensorship={setBypassCensorship}
            recapLanguage={recapLanguage}
            setRecapLanguage={setRecapLanguage}
            autoCutOnPaste={autoCutOnPaste}
            setAutoCutOnPaste={setAutoCutOnPaste}
            draftFirstMode={draftFirstMode}
            setDraftFirstMode={setDraftFirstMode}
            clipDuration={clipDuration}
            setClipDuration={setClipDuration}
            isProcessing={isProcessing}
            processingProgress={processingProgress}
            processingStatusText={processingStatusText}
            queuePosition={queuePosition}
            queueLength={queueLength}
            stepIndex={stepIndex}
            errorMessage={errorMessage}
            setErrorMessage={setErrorMessage}
            successMessage={successMessage}
            isProcessingRef={isProcessingRef}
            justPastedRef={justPastedRef}
            autoCutDebounceRef={autoCutDebounceRef}
            fileInputRef={fileInputRef}
            onGenerateClips={handleGenerateClips}
            onGenerateTextArticleRecap={handleGenerateTextArticleRecap}
            onLocalFileUpload={handleLocalFileUpload}
            onUploadFileObject={handleUploadFileObject}
            onClearSelectedUploadFile={() => setSelectedUploadFile(null)}
            onOpenSettings={openSettingsAtStep}
          />

          {/* ၃။ OUTPUT SECTION */}
          <ClipOutputSection
            outputSectionRef={outputSectionRef}
            videoRef={videoRef}
            sourceTitle={sourceTitle}
            clips={clips}
            activeClipIndex={activeClipIndex}
            setActiveClipIndex={setActiveClipIndex}
            activeClip={activeClip}
            isInitialLoading={isInitialLoading}
            isProcessing={isProcessing || isRenderingFromScript || isReburning}
            queuePosition={queuePosition}
            queueLength={queueLength}
            processingStatusText={processingStatusText}
            videoCurrentTime={videoCurrentTime}
            setVideoCurrentTime={setVideoCurrentTime}
            videoDuration={videoDuration}
            setVideoDuration={setVideoDuration}
            bufferedPercent={bufferedPercent}
            isVideoPlaying={isVideoPlaying}
            setIsVideoPlaying={setIsVideoPlaying}
            isVideoBuffering={isVideoBuffering}
            setIsVideoBuffering={setIsVideoBuffering}
            videoError={videoError}
            setVideoError={setVideoError}
            isMuted={isMuted}
            isDownloading={isDownloading}
            downloadDoneId={downloadDoneId}
            copiedShare={copiedShare}
            onOpenSubtitleEditor={handleOpenSubtitleEditor}
            onVideoProgress={handleVideoProgress}
            onSeekToCue={handleSeekToCue}
            onSliderSeek={handleSliderSeek}
            onStepSeek={handleStepSeek}
            onTogglePlay={handleTogglePlay}
            onToggleMute={handleToggleMute}
            onRestartVideo={handleRestartVideo}
            onReloadVideo={handleReloadVideo}
            onToggleFullscreen={handleToggleFullscreen}
            onDownloadActiveClip={handleDownloadActiveClip}
            onShareClip={handleShareClip}
          />
        </div>

        {/* ၄။ STRUCTURED AI RECAP INSIGHTS CARDS (WITH LISTEN, EXPORT, SCRIPT EDITOR & PRINT SHEET) */}
        <div ref={recapInsightsRef}>
          <RecapInsightsCards
            recap={recapSummary}
            activeClipDuration={activeClip?.durationSec}
            hasActiveClip={Boolean(activeClip)}
            isDraftPendingRender={Boolean(pendingDraftId)}
            isRenderingFromScript={isRenderingFromScript}
            onSeekToTime={handleSeekToCue}
            onUpdateRecap={handleUpdateRecapInline}
            onRenderVideoFromScript={handleRenderVideoFromScript}
            onNotifyToast={pushToast}
          />
        </div>

        {/* ၅။ COMPACT GOLDEN FOOTER BAR */}
        <div className="print:hidden">
          <GoldenFooter />
        </div>
      </div>

      {/* STEP-BY-STEP SETTINGS WIZARD MODAL */}
      <div className="print:hidden">
        <SettingsWizardModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settingsStep={settingsStep}
          setSettingsStep={setSettingsStep}
          clipDuration={clipDuration}
          setClipDuration={setClipDuration}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          framingMode={framingMode}
          setFramingMode={setFramingMode}
          audioMode={audioMode}
          setAudioMode={setAudioMode}
          bypassCensorship={bypassCensorship}
          setBypassCensorship={setBypassCensorship}
          autoCutOnPaste={autoCutOnPaste}
          setAutoCutOnPaste={setAutoCutOnPaste}
          subtitleStyle={subtitleStyle}
          setSubtitleStyle={setSubtitleStyle}
          userApiKey={userApiKey}
          onSaveUserApiKey={handleSaveUserApiKey}
          onClearUserApiKey={handleClearUserApiKey}
          demoQuota={demoQuota}
        />

        {/* SUBTITLE EDITOR MODAL */}
        <SubtitleEditorModal
          isOpen={isSubtitleEditorOpen}
          activeClip={activeClip}
          editingSubtitles={editingSubtitles}
          setEditingSubtitles={setEditingSubtitles}
          isReburning={isReburning}
          reburnSuccessMsg={reburnSuccessMsg}
          onClose={() => setIsSubtitleEditorOpen(false)}
          onSeekToCue={handleSeekToCue}
          onSaveAndReburn={handleSaveAndReburnSubtitles}
        />

        {/* RECAP HISTORY SIDEBAR DRAWER */}
        <RecapHistorySidebar
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          items={historyItems}
          activeHistoryId={activeHistoryId}
          canSaveCurrentRecap={Boolean(recapSummary && !activeHistoryId)}
          onSelectItem={handleSelectHistoryItem}
          onDeleteItem={handleDeleteHistoryItem}
          onClearAll={handleClearHistory}
          onSaveCurrentRecap={handleSaveCurrentRecapToHistory}
        />

        {/* GLOBAL TOAST NOTIFICATIONS FOR RATE LIMITS & NETWORK ERRORS */}
        <ToastContainer
          toasts={toasts}
          onDismiss={dismissToast}
          onOpenApiKeySettings={() => openSettingsAtStep("api_key")}
        />

        {/* NATIVE MOBILE BOTTOM NAVIGATION BAR */}
        <MobileBottomNav
          activeView={isHistoryOpen ? "history" : isSettingsOpen ? "settings" : "studio"}
          historyCount={historyItems.length}
          hasPersonalApiKey={Boolean(userApiKey)}
          onSelectStudio={() => {
            setIsHistoryOpen(false);
            setIsSettingsOpen(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onSelectHistory={() => {
            setIsSettingsOpen(false);
            setIsHistoryOpen(true);
          }}
          onSelectSettings={() => {
            setIsHistoryOpen(false);
            openSettingsAtStep("api_key");
          }}
        />
      </div>
    </div>
  );
}
