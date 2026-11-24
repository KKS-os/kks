import { AlertTriangle, CheckCircle2, Info, KeyRound, X, XCircle } from "lucide-react";
import type { ToastNotification } from "./types";

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  onOpenApiKeySettings: () => void;
}

export function ToastContainer({
  toasts,
  onDismiss,
  onOpenApiKeySettings,
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="အသိပေးချက်များ"
      className="print:hidden fixed bottom-20 md:bottom-4 left-3 right-3 sm:left-auto sm:right-4 z-[70] flex flex-col gap-2.5 sm:w-full sm:max-w-sm pointer-events-none font-burmese pb-[env(safe-area-inset-bottom)]"
    >
      {toasts.map((toast) => {
        const styleMap = {
          error: {
            box: "bg-[#1F0B0E]/95 border-red-500/60 text-red-100 shadow-[0_12px_35px_rgba(239,68,68,0.28)]",
            icon: <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />,
            titleColor: "text-red-200",
          },
          warning: {
            box: "bg-[#1D1405]/95 border-[#F59E0B]/70 text-[#FEF3C7] shadow-[0_12px_35px_rgba(245,158,11,0.3)]",
            icon: <AlertTriangle className="w-5 h-5 text-[#FBBF24] shrink-0 mt-0.5" />,
            titleColor: "text-[#FDE68A]",
          },
          success: {
            box: "bg-[#092117]/95 border-emerald-500/60 text-emerald-100 shadow-[0_12px_35px_rgba(16,185,129,0.25)]",
            icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
            titleColor: "text-emerald-200",
          },
          info: {
            box: "bg-[#111118]/95 border-[#F59E0B]/45 text-[#F4F4F6] shadow-[0_12px_35px_rgba(0,0,0,0.65)]",
            icon: <Info className="w-5 h-5 text-[#FBBF24] shrink-0 mt-0.5" />,
            titleColor: "text-[#FFF2B2]",
          },
        }[toast.variant];

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-2xl border p-3.5 backdrop-blur-md transition-all ${styleMap.box}`}
          >
            <div className="flex items-start gap-2.5">
              {styleMap.icon}
              <div className="min-w-0 flex-1 space-y-1">
                <div className={`text-xs font-bold leading-snug ${styleMap.titleColor}`}>
                  {toast.title}
                </div>
                <p className="text-[11px] sm:text-xs leading-[1.7] opacity-90 break-words">
                  {toast.message}
                </p>

                {toast.actionType === "open_api_key" && (
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenApiKeySettings();
                        onDismiss(toast.id);
                      }}
                      className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-black font-bold text-xs inline-flex items-center justify-center gap-1.5 hover:brightness-105 transition-all cursor-pointer shadow-md"
                    >
                      <KeyRound className="w-3.5 h-3.5 shrink-0" />
                      <span>Free Gemini API Key ထည့်သွင်းမည်</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="အသိပေးချက် ပိတ်မည်"
                className="min-h-[44px] min-w-[44px] -mt-1 -mr-1 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
