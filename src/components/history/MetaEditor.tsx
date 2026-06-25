import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { RefObject } from "react";
import { useI18n } from "../../lib/i18n";

interface MetaEditorProps {
  aliasDraft: string;
  tagsDraft: string;
  sessionQuery: string;
  sessionSearchRef: RefObject<HTMLInputElement | null>;
  matchCursor: number;
  matchCount: number;
  onAliasDraftChange: (value: string) => void;
  onTagsDraftChange: (value: string) => void;
  onSessionQueryChange: (value: string) => void;
  onSaveMeta: () => void;
  onJumpPrev: () => void;
  onJumpNext: () => void;
}

export function MetaEditor({
  aliasDraft,
  tagsDraft,
  sessionQuery,
  sessionSearchRef,
  matchCursor,
  matchCount,
  onAliasDraftChange,
  onTagsDraftChange,
  onSessionQueryChange,
  onSaveMeta,
  onJumpPrev,
  onJumpNext,
}: MetaEditorProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          value={aliasDraft}
          onChange={(e) => onAliasDraftChange(e.target.value)}
          aria-label={t("history.meta.alias")}
          placeholder={t("history.meta.aliasPlaceholder")}
          className="h-7 px-2 text-xs"
        />
        <Input
          value={tagsDraft}
          onChange={(e) => onTagsDraftChange(e.target.value)}
          aria-label={t("history.meta.tags")}
          placeholder={t("history.meta.tagsPlaceholder")}
          className="h-7 px-2 text-xs"
        />
      </div>

      <div className="mt-2">
        <button onClick={onSaveMeta} className="ui-btn ui-btn-primary text-xs">
          {t("history.meta.save")}
        </button>
      </div>

      <div className="ui-input mt-2 rounded-md px-2 py-1">
        <div className="flex items-center gap-2">
          <Search size={12} className="text-text-muted" />
          <input
            ref={sessionSearchRef}
            value={sessionQuery}
            onChange={(e) => onSessionQueryChange(e.target.value)}
            aria-label={t("history.meta.search")}
            placeholder={t("history.meta.search")}
            className="flex-1 min-w-0 bg-transparent text-xs outline-none"
          />
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <button onClick={onJumpPrev} aria-label={t("history.meta.prevMatch")} className="ui-btn px-2 py-0.5 text-[11px]" title={t("history.meta.prevMatch")}>
            ↑
          </button>
          <button onClick={onJumpNext} aria-label={t("history.meta.nextMatch")} className="ui-btn px-2 py-0.5 text-[11px]" title={t("history.meta.nextMatch")}>
            ↓
          </button>
          <span className="shrink-0 text-[10px] text-text-muted">
            {matchCount === 0 ? "0" : `${Math.min(matchCursor + 1, matchCount)}/${matchCount}`}
          </span>
        </div>
      </div>
    </>
  );
}
