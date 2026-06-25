import { FileCode2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import type { SessionProcessModel } from "./sessionEvents";

interface SessionFileChangesViewProps {
  model: SessionProcessModel;
  onJumpToMessage: (messageIndex: number) => void;
  onOpenDiff: () => void;
}

export function SessionFileChangesView({ model, onJumpToMessage, onOpenDiff }: SessionFileChangesViewProps) {
  const { t } = useI18n();
  if (model.fileGroups.length === 0) {
    return <div className="ui-session-process-empty">{t("history.files.empty")}</div>;
  }

  return (
    <div className="ui-session-process-view">
      <div className="ui-session-process-toolbar">
        <div className="ui-session-process-summary">
          <span>{t("history.files.fileCount", { count: model.fileGroups.length })}</span>
          <span>{t("history.files.diffBlockCount", { count: model.diffBlocks.length })}</span>
        </div>
        <button type="button" className="ui-session-process-primary" onClick={onOpenDiff}>
          {t("history.files.openDiff")}
        </button>
      </div>

      <div className="ui-session-file-groups">
        {model.fileGroups.map((group) => (
          <section key={group.filePath} className="ui-session-process-card">
            <div className="ui-session-file-header">
              <FileCode2 size={14} />
              <span title={group.filePath}>{group.filePath}</span>
              <small>+{group.additions} / -{group.deletions}</small>
            </div>
            <div className="ui-session-file-events">
              {group.events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="ui-session-file-event"
                  onClick={() => event.messageIndex !== null && onJumpToMessage(event.messageIndex)}
                >
                  <span>{event.detail}</span>
                  <small>{event.timestamp ?? (event.messageIndex !== null ? t("history.files.messageRef", { index: event.messageIndex + 1 }) : "-")}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
