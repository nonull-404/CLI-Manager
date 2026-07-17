import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type UIEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, ChevronDown, KeyRound, Route, Server, SlidersHorizontal, Terminal } from "lucide-react";
import { useI18n, type TranslationKey } from "../../../lib/i18n";
import type { CreateSshHostInput, SshAuthMode, SshHost, SshHostGroup, SshJumpMode, SshProxyType } from "../../../lib/types";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../../ui/dialog";

type Section = "basic" | "auth" | "routing" | "connection" | "startup";
type Source = "address" | "config";
type SetValue = <K extends keyof CreateSshHostInput>(key: K, value: CreateSshHostInput[K]) => void;

interface Diagnostic { success: boolean; stages: Array<{ key: string; status: string; detail: string }> }
interface Props {
  open: boolean;
  editingId: string | null;
  form: CreateSshHostInput;
  hosts: SshHost[];
  groups: SshHostGroup[];
  source: Source;
  setSource: (source: Source) => void;
  setValue: SetValue;
  diagnostic: Diagnostic | null;
  error: string | null;
  testError: string | null;
  errorCode: string | null;
  password: string;
  credentialStored: boolean;
  testing: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onTest: () => void;
  onSave: () => void;
  onPasswordChange: (password: string) => void;
}

const SECTIONS: Array<{ id: Section; icon: typeof Server; label: TranslationKey }> = [
  { id: "basic", icon: Server, label: "settings.sshHosts.section.basic" },
  { id: "auth", icon: KeyRound, label: "settings.sshHosts.section.auth" },
  { id: "routing", icon: Route, label: "settings.sshHosts.section.routing" },
  { id: "connection", icon: SlidersHorizontal, label: "settings.sshHosts.section.connection" },
  { id: "startup", icon: Terminal, label: "settings.sshHosts.section.startup" },
];

const STAGE_LABELS: Record<string, TranslationKey> = {
  client: "settings.sshHosts.stage.client",
  authentication: "settings.sshHosts.stage.authentication",
  connection: "settings.sshHosts.stage.connection",
  network: "settings.sshHosts.stage.network",
  shell: "settings.sshHosts.stage.shell",
};

const DETAIL_LABELS: Record<string, TranslationKey> = {
  ssh_connection_ready: "settings.sshHosts.detail.connectionReady",
  ssh_interactive_auth_required: "settings.sshHosts.detail.interactiveRequired",
  ssh_client_unavailable: "settings.sshHosts.openSshMissing",
};

export function SshHostEditor(props: Props) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<Section>("basic");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<Section, HTMLElement | null>>({ basic: null, auth: null, routing: null, connection: null, startup: null });

  useEffect(() => {
    if (!props.open) return;
    setActiveSection("basic");
    scrollRef.current?.scrollTo({ top: 0 });
  }, [props.open, props.editingId]);

  useEffect(() => {
    if (!props.errorCode) return;
    const section: Section = props.errorCode.includes("identity") || props.errorCode.includes("auth")
      ? "auth"
      : props.errorCode.includes("jump") || props.errorCode.includes("proxy")
        ? "routing"
        : props.errorCode.includes("timeout") || props.errorCode.includes("alive") || props.errorCode.includes("encoding")
          ? "connection"
          : "basic";
    scrollToSection(section);
  }, [props.errorCode]);

  const scrollToSection = (section: Section) => {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const containerTop = event.currentTarget.getBoundingClientRect().top + 16;
    let current: Section = "basic";
    for (const item of SECTIONS) {
      const element = sectionRefs.current[item.id];
      if (element && element.getBoundingClientRect().top <= containerTop + 96) current = item.id;
    }
    setActiveSection(current);
  };

  const changeSource = (next: Source) => {
    props.setSource(next);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[min(700px,calc(100vh-32px))] w-[min(900px,calc(100vw-32px))] max-w-[900px] flex-col overflow-hidden p-0">
        <DialogTitle className="shrink-0 border-b border-border px-5 py-3 text-base font-bold">{props.editingId ? t("settings.sshHosts.edit") : t("settings.sshHosts.add")}</DialogTitle>
        <div className="shrink-0 border-b border-border bg-surface-low px-3 py-1.5">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={t("settings.sshHosts.sectionNavigation")}>
            {SECTIONS.map(({ id, icon: Icon, label }) => <button key={id} type="button" role="tab" aria-selected={activeSection === id} className={`ui-focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${activeSection === id ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "text-text-muted hover:bg-surface-container-high hover:text-text-primary"}`} onClick={() => scrollToSection(id)}><Icon className="h-3.5 w-3.5" />{t(label)}</button>)}
          </div>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" onScroll={handleScroll}>
          {props.error && <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{props.error}</div>}
          <FormSection section="basic" title={t("settings.sshHosts.section.basic")} description={t("settings.sshHosts.section.basicDescription")} sectionRefs={sectionRefs}>
            <BasicFields form={props.form} groups={props.groups} source={props.source} setSource={changeSource} setValue={props.setValue} />
          </FormSection>
          <FormSection section="auth" title={t("settings.sshHosts.section.auth")} description={t("settings.sshHosts.section.authDescription")} sectionRefs={sectionRefs}>
            {props.source === "config" ? <ConfigManagedInfo text={t("settings.sshHosts.configAuthManaged")} /> : <AuthFields form={props.form} password={props.password} credentialStored={props.credentialStored} setValue={props.setValue} onPasswordChange={props.onPasswordChange} />}
          </FormSection>
          <FormSection section="routing" title={t("settings.sshHosts.section.routing")} description={t("settings.sshHosts.section.routingDescription")} sectionRefs={sectionRefs}>
            {props.source === "config" ? <ConfigManagedInfo text={t("settings.sshHosts.configRoutingManaged")} /> : <RoutingFields form={props.form} hosts={props.hosts} editingId={props.editingId} setValue={props.setValue} />}
          </FormSection>
          <FormSection section="connection" title={t("settings.sshHosts.section.connection")} description={t("settings.sshHosts.section.connectionDescription")} sectionRefs={sectionRefs}>
            <ConnectionFields form={props.form} setValue={props.setValue} />
          </FormSection>
          <FormSection section="startup" title={t("settings.sshHosts.section.startup")} description={t("settings.sshHosts.section.startupDescription")} sectionRefs={sectionRefs}>
            <StartupFields form={props.form} setValue={props.setValue} />
          </FormSection>
        </div>
        <DialogFooter className="shrink-0 flex items-center justify-between border-t border-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-3"><button type="button" className="ui-button-secondary h-9 shrink-0 rounded-lg px-3 text-sm font-bold" disabled={props.testing} onClick={props.onTest}>{props.testing ? t("settings.sshHosts.testing") : t("settings.sshHosts.test")}</button><TestStatus testing={props.testing} diagnostic={props.diagnostic} error={props.testError} /></div>
          <div className="flex gap-2"><button type="button" className="ui-button-secondary h-9 rounded-lg px-3 text-sm font-bold" onClick={() => props.onOpenChange(false)}>{t("common.cancel")}</button><button type="button" className="ui-button-primary h-9 rounded-lg px-4 text-sm font-bold" disabled={props.saving} onClick={props.onSave}>{props.saving ? t("common.saving") : t("common.save")}</button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BasicFields({ form, groups, source, setSource, setValue }: { form: CreateSshHostInput; groups: SshHostGroup[]; source: Source; setSource: (source: Source) => void; setValue: SetValue }) {
  const { t } = useI18n();
  return <div className="space-y-3"><FieldRow label={t("settings.sshHosts.name")} required><input autoFocus value={form.name} onChange={(e) => setValue("name", e.target.value)} placeholder={t("settings.sshHosts.placeholder.name")} /></FieldRow><FieldRow label={t("settings.sshHosts.group")}><SshGroupCombobox groups={groups} value={form.group_id ?? null} onChange={(group) => { setValue("group_id", group?.id ?? null); setValue("group_name", group?.name ?? ""); }} /></FieldRow><FieldRow label={t("settings.sshHosts.connectionSource")}><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface-low p-0.5" role="tablist"><ChoiceButton selected={source === "address"} onClick={() => setSource("address")}>{t("settings.sshHosts.source.address")}</ChoiceButton><ChoiceButton selected={source === "config"} onClick={() => setSource("config")}>{t("settings.sshHosts.source.config")}</ChoiceButton></div></FieldRow>{source === "address" ? <FieldRow label={t("settings.sshHosts.address")} required><div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><input value={form.host} onChange={(e) => setValue("host", e.target.value)} placeholder="gpu-01.internal" /><input type="number" min={1} max={65535} value={form.port} onChange={(e) => setValue("port", Number(e.target.value))} aria-label={t("settings.sshHosts.port")} /></div></FieldRow> : <FieldRow label={t("settings.sshHosts.configAlias")} required><input value={form.config_alias} onChange={(e) => setValue("config_alias", e.target.value)} placeholder="my-server" /></FieldRow>}</div>;
}

function AuthFields({ form, password, credentialStored, setValue, onPasswordChange }: { form: CreateSshHostInput; password: string; credentialStored: boolean; setValue: SetValue; onPasswordChange: (password: string) => void }) {
  const { t } = useI18n();
  const authMode = form.auth_mode === "ssh_config" || !form.auth_mode ? "agent" : form.auth_mode;
  return <div className="space-y-3"><FieldRow label={t("settings.sshHosts.authMode")} description={t(`settings.sshHosts.authHint.${authMode}` as const)} required><select value={authMode} onChange={(e) => { const value = e.target.value as SshAuthMode; setValue("auth_mode", value); if (value !== "identity_file") setValue("identity_file", ""); if (value !== "credential_ref") onPasswordChange(""); }}><option value="agent">{t("settings.sshHosts.auth.agent")}</option><option value="identity_file">{t("settings.sshHosts.auth.identity_file")}</option><option value="credential_ref">{t("settings.sshHosts.auth.credential_ref")}</option><option value="password_prompt">{t("settings.sshHosts.auth.password_prompt")}</option><option value="interactive">{t("settings.sshHosts.auth.interactive")}</option></select></FieldRow><FieldRow label={t("settings.sshHosts.username")} required><input value={form.username} onChange={(e) => setValue("username", e.target.value)} placeholder="root" /></FieldRow>{authMode === "identity_file" && <FieldRow label={t("settings.sshHosts.identityFile")} required><div className="flex gap-2"><input className="min-w-0 flex-1" value={form.identity_file} onChange={(e) => setValue("identity_file", e.target.value)} placeholder="C:\\Users\\me\\.ssh\\id_ed25519" /><button type="button" className="ui-button-secondary shrink-0 rounded-xl px-3 text-xs" onClick={async () => { const selected = await open({ multiple: false, directory: false, title: t("settings.sshHosts.chooseIdentityFile") }); if (typeof selected === "string") setValue("identity_file", selected); }}>{t("common.browse")}</button></div></FieldRow>}{authMode === "credential_ref" && <FieldRow label={t("settings.sshHosts.loginPassword")} description={credentialStored ? t("settings.sshHosts.credentialStoredHint") : t("settings.sshHosts.credentialMissingHint")} required={!credentialStored}><input type="password" autoComplete="new-password" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder={credentialStored ? t("settings.sshHosts.passwordKeepPlaceholder") : t("settings.sshHosts.passwordPlaceholder")} /></FieldRow>}<FieldRow label={t("settings.sshHosts.authOrder")}><InfoBox>{t("settings.sshHosts.authOrder")}</InfoBox></FieldRow></div>;
}

function RoutingFields({ form, hosts, editingId, setValue }: { form: CreateSshHostInput; hosts: SshHost[]; editingId: string | null; setValue: SetValue }) {
  const { t } = useI18n();
  return <div className="space-y-3"><FieldRow label={t("settings.sshHosts.jumpMode")}><select value={form.jump_mode} onChange={(e) => { const value = e.target.value as SshJumpMode; setValue("jump_mode", value); if (value === "none") setValue("jump_host_id", null); }}><option value="none">{t("settings.sshHosts.jump.none")}</option><option value="host">{t("settings.sshHosts.jump.host")}</option><option value="proxy_jump">{t("settings.sshHosts.jump.proxyJump")}</option></select></FieldRow>{form.jump_mode !== "none" && <FieldRow label={t("settings.sshHosts.jumpHost")} required><select value={form.jump_host_id ?? ""} onChange={(e) => setValue("jump_host_id", e.target.value || null)}><option value="">{t("common.none")}</option>{hosts.filter((host) => host.id !== editingId).map((host) => <option key={host.id} value={host.id}>{host.name}</option>)}</select></FieldRow>}<FieldRow label={t("settings.sshHosts.proxyType")}><select value={form.proxy_type} onChange={(e) => { const value = e.target.value as SshProxyType; setValue("proxy_type", value); if (value === "none") setValue("proxy_command", ""); }}><option value="none">{t("settings.sshHosts.proxy.none")}</option><option value="proxy_command">{t("settings.sshHosts.proxy.command")}</option></select></FieldRow>{form.proxy_type === "proxy_command" && <FieldRow label={t("settings.sshHosts.proxyCommand")} required><input value={form.proxy_command} onChange={(e) => setValue("proxy_command", e.target.value)} placeholder="connect.exe -S ..." /></FieldRow>}<InfoBox>{t("settings.sshHosts.routingWarning")}</InfoBox></div>;
}

function ConnectionFields({ form, setValue }: { form: CreateSshHostInput; setValue: SetValue }) {
  const { t } = useI18n();
  return <div className="space-y-3"><FieldRow label={t("settings.sshHosts.timeout")} required><input type="number" min={1} max={300} value={form.connect_timeout_sec} onChange={(e) => setValue("connect_timeout_sec", Number(e.target.value))} /></FieldRow><FieldRow label={t("settings.sshHosts.keepAliveInterval")}><input type="number" min={0} value={form.server_alive_interval_sec} onChange={(e) => setValue("server_alive_interval_sec", Number(e.target.value))} /></FieldRow><FieldRow label={t("settings.sshHosts.keepAliveCount")}><input type="number" min={1} max={100} value={form.server_alive_count_max} onChange={(e) => setValue("server_alive_count_max", Number(e.target.value))} /></FieldRow></div>;
}

function StartupFields({ form, setValue }: { form: CreateSshHostInput; setValue: SetValue }) {
  const { t } = useI18n();
  return <div className="space-y-3"><FieldRow label={t("settings.sshHosts.startupScript")}><textarea rows={2} className="min-h-16" value={form.startup_script} onChange={(e) => setValue("startup_script", e.target.value)} placeholder="source ~/.profile" /></FieldRow><FieldRow label={t("settings.sshHosts.notes")}><textarea rows={2} className="min-h-16" value={form.notes} onChange={(e) => setValue("notes", e.target.value)} /></FieldRow></div>;
}

function FormSection({ section, title, description, sectionRefs, children }: { section: Section; title: string; description: string; sectionRefs: MutableRefObject<Record<Section, HTMLElement | null>>; children: ReactNode }) {
  return <section ref={(element) => { sectionRefs.current[section] = element; }} className="scroll-mt-4 border-b border-border py-5 first:pt-0 last:border-b-0"><div className="mb-4"><h4 className="text-sm font-bold text-text-primary">{title}</h4><p className="mt-1 text-xs text-text-muted">{description}</p></div>{children}</section>;
}

function FieldRow({ label, description, required, children }: { label: string; description?: string; required?: boolean; children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(180px,0.8fr)_minmax(280px,1.2fr)] gap-6 rounded-xl border border-border bg-surface-lowest px-4 py-3"><div><div className="text-xs font-bold text-text-primary">{label}{required && <span className="ml-1 text-danger">*</span>}</div>{description && <div className="mt-1 text-[11px] leading-relaxed text-text-muted">{description}</div>}</div><div className="[&_input]:h-9 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-border [&_input]:bg-surface-low [&_input]:px-3 [&_input]:text-sm [&_input]:text-text-primary [&_select]:h-9 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-surface-low [&_select]:px-3 [&_select]:text-sm [&_select]:text-text-primary [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-surface-low [&_textarea]:p-3 [&_textarea]:text-sm [&_textarea]:text-text-primary">{children}</div></div>;
}

function SshGroupCombobox({ groups, value, onChange }: { groups: SshHostGroup[]; value: string | null; onChange: (group: SshHostGroup | null) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const options = useMemo(() => {
    const children = new Map<string | null, SshHostGroup[]>();
    for (const group of groups) children.set(group.parent_id, [...(children.get(group.parent_id) ?? []), group]);
    const flattened: Array<{ group: SshHostGroup; path: string }> = [];
    const visit = (parentId: string | null, prefix: string, ancestors: Set<string>) => {
      for (const group of (children.get(parentId) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))) {
        if (ancestors.has(group.id)) continue;
        const path = prefix ? `${prefix} / ${group.name}` : group.name;
        flattened.push({ group, path });
        visit(group.id, path, new Set([...ancestors, group.id]));
      }
    };
    visit(null, "", new Set());
    return flattened;
  }, [groups]);
  const selected = options.find((item) => item.group.id === value) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery ? options.filter((item) => item.path.toLocaleLowerCase().includes(normalizedQuery)) : options;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return <div ref={rootRef} className="relative"><input role="combobox" aria-expanded={open} aria-controls={listboxId} value={open ? query : selected?.path ?? ""} placeholder={t("settings.sshHosts.groupSelectPlaceholder")} onFocus={() => { setQuery(""); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} /><button type="button" aria-label={t("settings.sshHosts.groupOpen")} className="ui-focus-ring absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:bg-surface-container-highest" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setOpen((current) => !current); }}><ChevronDown size={12} className={open ? "rotate-180" : ""} /></button>{open && <div id={listboxId} role="listbox" className="ui-select-popover absolute left-0 top-full z-[70] mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-surface-container-high py-1 text-xs shadow-lg"><button type="button" role="option" aria-selected={!value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(null); setOpen(false); }} className="flex w-full items-center px-3 py-2 text-left text-text-muted hover:bg-surface-container-highest"><span className="flex-1">{t("settings.sshHosts.groupNone")}</span>{!value && <Check size={12} />}</button>{filtered.map((item) => <button key={item.group.id} type="button" role="option" aria-selected={item.group.id === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item.group); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-text-primary hover:bg-surface-container-highest"><span className="flex-1 truncate">{item.path}</span>{item.group.id === value && <Check size={12} className="text-primary" />}</button>)}</div>}</div>;
}

function TestStatus({ testing, diagnostic, error }: { testing: boolean; diagnostic: Diagnostic | null; error: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!testing && !diagnostic && !error) return null;
  const success = diagnostic?.success === true;
  const tone = testing ? "text-amber-500" : success ? "text-emerald-500" : "text-red-500";
  const label = testing ? t("settings.sshHosts.testing") : success ? t("settings.sshHosts.testPassed") : t("settings.sshHosts.testFailed");
  const message = error ? `${label}: ${error}` : label;
  return <div className="relative min-w-0"><button type="button" title={message} className={`flex max-w-80 items-center gap-1.5 truncate text-xs font-bold ${tone}`} onClick={() => diagnostic && setOpen((current) => !current)}><span>●</span><span className="truncate">{message}</span></button>{open && diagnostic && <div className="absolute bottom-full left-0 z-[80] mb-3 w-96 max-w-[60vw] shadow-xl"><DiagnosticPanel diagnostic={diagnostic} /></div>}</div>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" role="tab" aria-selected={selected} className={selected ? "ui-button-primary rounded-md px-3 py-1.5 text-xs font-bold" : "rounded-md px-3 py-1.5 text-xs font-bold text-text-muted hover:bg-surface-container-high"} onClick={onClick}>{children}</button>; }
function ConfigManagedInfo({ text }: { text: string }) { return <InfoBox>{text}</InfoBox>; }
function InfoBox({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-border bg-surface-low px-3 py-2 text-xs leading-relaxed text-text-muted">{children}</div>; }

function DiagnosticPanel({ diagnostic }: { diagnostic: Diagnostic }) {
  const { t } = useI18n();
  return <div className="space-y-2 rounded-lg border border-border bg-surface-low p-3"><div className="text-xs font-bold text-text-primary">{t("settings.sshHosts.diagnostic.title")}</div>{diagnostic.stages.map((stage) => { const tone = stage.status === "passed" ? "text-emerald-500" : stage.status === "failed" ? "text-red-500" : "text-amber-500"; return <div key={stage.key} className="flex items-start gap-2 text-sm"><span className={tone}>●</span><div><div className={`font-bold ${tone}`}>{t(STAGE_LABELS[stage.key] ?? "settings.sshHosts.stage.connection")}</div><div className="text-xs text-text-muted">{DETAIL_LABELS[stage.detail] ? t(DETAIL_LABELS[stage.detail]) : stage.detail}</div></div></div>; })}</div>;
}
