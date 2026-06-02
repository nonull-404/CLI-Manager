import { useSyncStore } from "../../stores/syncStore";
import { Cloud } from "../icons";
import type { SettingsTab } from "../SettingsModal";

interface SyncStatusIndicatorProps {
  collapsed?: boolean;
  onOpenSettings?: (tab?: SettingsTab) => void;
}

export function SyncStatusIndicator({ collapsed, onOpenSettings }: SyncStatusIndicatorProps) {
  const { status, lastSyncAt, hasPassword } = useSyncStore();

  const openSyncSettings = () => onOpenSettings?.("sync");

  const getStatusColor = () => {
    if (!hasPassword) return "text-on-surface-variant opacity-60";
    switch (status) {
      case "syncing":
        return "text-yellow-500";
      case "success":
        return "text-success";
      case "error":
        return "text-error";
      case "conflict":
        return "text-yellow-500";
      default:
        return "text-on-surface-variant";
    }
  };

  const getStatusText = () => {
    if (!hasPassword) return "未配置";
    switch (status) {
      case "syncing":
        return "同步中...";
      case "success":
        return "已同步";
      case "error":
        return "同步失败";
      case "conflict":
        return "冲突";
      default:
        return lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "--";
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={openSyncSettings}
        className={`ui-focus-ring ui-icon-action ${getStatusColor()}`}
        title={hasPassword ? `云同步: ${getStatusText()}` : "云同步未配置 (点击设置)"}
        aria-label={hasPassword ? "打开同步设置" : "配置云同步"}
      >
        <Cloud size={14} strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        onClick={openSyncSettings}
        className={`ui-sidebar-sync-link ${getStatusColor()}`}
        title={hasPassword ? "点击打开同步设置" : "点击配置云同步"}
        aria-label={hasPassword ? "打开同步设置" : "配置云同步"}
      >
        <Cloud size={12} strokeWidth={1.5} />
        <span className="text-xs">{getStatusText()}</span>
      </button>
    </div>
  );
}