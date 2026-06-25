import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTemplateStore } from "../stores/templateStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useProjectStore } from "../stores/projectStore";
import type { CommandTemplate, Project } from "../lib/types";
import { TerminalSquare, Plus, Trash2 } from "./icons";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { EmptyState } from "./ui/EmptyState";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/Skeleton";
import { toast } from "sonner";
import { logError } from "../lib/logger";
import { useI18n } from "../lib/i18n";

/** Resolve template variables: ${projectPath}, ${projectName} */
function resolveCommand(command: string, project?: Project): string {
  if (!project) return command;
  return command
    .replace(/\$\{projectPath\}/g, project.path)
    .replace(/\$\{projectName\}/g, project.name);
}

interface CommandTemplatePanelProps {
  popoverSide?: "top" | "right" | "bottom" | "left";
  toneClassName?: string;
}

export function CommandTemplatePanel({ popoverSide = "bottom", toneClassName = "" }: CommandTemplatePanelProps) {
  const { t } = useI18n();
  const {
    fetchTemplates,
    getForContext,
    createTemplate,
    createSessionTemplate,
    deleteTemplate,
    deleteSessionTemplate,
    pruneSessionTemplates,
  } = useTemplateStore();
  const { sessions, activeSessionId } = useTerminalStore();
  const { projects } = useProjectStore();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"global" | "project" | "session">("global");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    pruneSessionTemplates(sessions.map((item) => item.id));
  }, [sessions, pruneSessionTemplates]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPanelLoading(true);
    void Promise.all([
      fetchTemplates(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 180);
      }),
    ]).finally(() => {
      if (!cancelled) setPanelLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, fetchTemplates]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeProject = activeSession?.projectId
    ? projects.find((p) => p.id === activeSession.projectId)
    : undefined;

  // Show templates relevant to the active project and session.
  const visibleTemplates = getForContext(activeSession?.projectId ?? null, activeSessionId);

  const handleRun = async (template: CommandTemplate) => {
    if (!activeSessionId) return;
    const resolved = resolveCommand(template.command, activeProject);
    try {
      await invoke("pty_write", { sessionId: activeSessionId, data: resolved + "\r" });
      setOpen(false);
    } catch (err) {
      toast.error(t("commandTemplate.toast.runFailed"), { description: String(err) });
      logError("Failed to run command template", {
        templateId: template.id,
        sessionId: activeSessionId,
        err,
      });
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !command.trim()) return;

    try {
      if (scope === "session") {
        if (!activeSessionId) return;
        await createSessionTemplate(activeSessionId, {
          project_id: activeSession?.projectId ?? null,
          session_id: activeSessionId,
          name: name.trim(),
          command: command.trim(),
          description: description.trim(),
        });
      } else {
        await createTemplate({
          project_id: scope === "project" ? projectId : null,
          name: name.trim(),
          command: command.trim(),
          description: description.trim(),
        });
      }

      setName("");
      setCommand("");
      setDescription("");
      setScope("global");
      setProjectId(null);
      setShowForm(false);
      toast.success(t("commandTemplate.toast.saveSuccess"));
    } catch (err) {
      toast.error(t("commandTemplate.toast.saveFailed"), { description: String(err) });
      logError("Failed to save command template", {
        scope,
        projectId,
        activeSessionId,
        err,
      });
    }
  };

  const scopeLabel = (template: CommandTemplate) => {
    if (template.session_id) return t("settings.templates.scope.session");
    if (!template.project_id) return t("settings.templates.scope.global");
    const project = projects.find((item) => item.id === template.project_id);
    return project
      ? t("settings.templates.scope.projectWithName", { name: project.name })
      : t("settings.templates.scope.project");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setShowForm(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={`ui-focus-ring ui-icon-action ${toneClassName}`.trim()}
          title={t("commandTemplate.title")}
          aria-label={t("commandTemplate.openPanel")}
        >
          <TerminalSquare size={14} strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent id="command-template-panel" align="start" side={popoverSide} className="w-72">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold text-on-surface">{t("commandTemplate.title")}</span>
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="ui-flat-action h-6 gap-1 px-2 text-[10px] text-primary"
            aria-label={showForm ? t("commandTemplate.collapseForm") : t("commandTemplate.expandForm")}
          >
            <Plus size={10} strokeWidth={2} /> {t("settings.templates.new")}
          </button>
        </div>

        {/* New template form */}
        {showForm && (
          <div className="space-y-1.5 px-3 py-2">
            <Input
              type="text"
              placeholder={t("settings.templates.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              type="text"
              placeholder={t("settings.templates.commandPlaceholder")}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              type="text"
              placeholder={t("settings.templates.description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-7 text-xs"
            />
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as "global" | "project" | "session")}
              className="h-7 text-xs"
            >
              <option value="global">{t("commandTemplate.scope.global")}</option>
              <option value="project">{t("commandTemplate.scope.project")}</option>
              <option value="session">{t("commandTemplate.scope.session")}</option>
            </Select>
            {scope === "project" && (
              <Select
                value={projectId ?? ""}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="h-7 text-xs"
              >
                <option value="">{t("settings.templates.selectProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
            {scope === "session" && (
              <div className="text-[10px] text-on-surface-variant">
                {activeSessionId
                  ? t("commandTemplate.bindSession", { sessionId: activeSessionId })
                  : t("commandTemplate.openSessionFirst")}
              </div>
            )}
            <div className="flex justify-end gap-1">
              <button
                onClick={() => setShowForm(false)}
                className="ui-flat-action h-6 px-2 text-[10px]"
                aria-label={t("commandTemplate.cancelCreate")}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleCreate}
                disabled={(scope === "project" && !projectId) || (scope === "session" && !activeSessionId)}
                className="ui-flat-action ui-primary-action h-6 px-2 text-[10px] disabled:opacity-50"
                aria-label={t("commandTemplate.save")}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        )}

        {/* Template list */}
        <div className="max-h-48 overflow-y-auto">
          {panelLoading ? (
            <div className="space-y-2 px-3 py-3">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              ))}
            </div>
          ) : visibleTemplates.length === 0 ? (
            <EmptyState
              icon={<TerminalSquare size={20} strokeWidth={1.5} />}
              title={t("commandTemplate.emptyTitle")}
              description={t("commandTemplate.emptyDescription")}
              action={{ label: t("commandTemplate.create"), onClick: () => setShowForm(true) }}
              className="px-3 py-6"
            />
          ) : (
            visibleTemplates.map((template) => (
              <div
                key={template.id}
                className="group ui-interactive flex cursor-pointer items-center gap-2 px-3 py-1.5 text-on-surface-variant"
                onClick={() => handleRun(template)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-on-surface">{template.name}</span>
                    <span className="shrink-0 rounded-full bg-surface-container-high px-1 text-[9px] text-on-surface-variant">
                      {scopeLabel(template)}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-on-surface-variant">{template.command}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (template.session_id) {
                      deleteSessionTemplate(template.session_id, template.id);
                    } else {
                      void deleteTemplate(template.id);
                    }
                  }}
                  className="hidden shrink-0 text-danger opacity-70 group-hover:block"
                  aria-label={t("commandTemplate.deleteNamed", { name: template.name })}
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        {!activeSessionId && (
          <div className="px-3 py-1 text-[10px] text-on-surface-variant">
            {t("commandTemplate.inactiveHint")}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
