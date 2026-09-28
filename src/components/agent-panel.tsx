"use client";

/**
 * Nibble — Ortak Mod arayüzü
 *
 * İki parça: altta her zaman görünen canlı şerit, bir de izin panelini içeren
 * diyalog. Şeridin görevi ajanın yaptığını GÖRÜNÜR kılmak — kullanıcı ne
 * olduğunu görmezse "AI bir şeyler yaptı" hissi güvensizlik üretir.
 */

import Icon from "./icon";
import { Dialog } from "./ui";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/editor-store";
import { AGENT_SCOPES, type AgentScope } from "@/lib/agent-policy";

const SCOPE_ICON: Record<AgentScope, string> = {
  draw: "✎",
  animate: "▶",
  layers: "≡",
  palette: "◧",
  destructive: "⚠",
  files: "⇩",
};

/* ────────── alt şerit ────────── */
export function AgentTicker({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const connected = useEditor((s) => s.agentConnected);
  const enabled = useEditor((s) => s.agentPolicy.enabled);
  const log = useEditor((s) => s.agentLog);
  const request = useEditor((s) => s.agentRequest);
  const setAgentScope = useEditor((s) => s.setAgentScope);
  const clearRequest = useEditor((s) => s.clearAgentRequest);
  const last = log[log.length - 1];

  // izin isteği her şeyin önüne geçer — kullanıcı kararı bekleniyor
  if (request) {
    return (
      <div className="agent-ticker asking">
        <span className="dot" />
        <span className="live-tag">{SCOPE_ICON[request.scope]}</span>
        <span className="msg">
          {t.agent.requestPending} <b>{t.agent.perms[request.scope]}</b>: <code>{request.call}</code>
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn sm primary" onClick={() => setAgentScope(request.scope, true)}>
          {t.agent.allowOnce}
        </button>
        <button className="btn sm ghost" onClick={clearRequest}>
          {t.common.cancel}
        </button>
      </div>
    );
  }

  return (
    <div className={`agent-ticker ${connected && enabled ? "live" : ""}`}>
      <span className="dot" />
      {!enabled ? (
        <span className="msg">{t.agent.permanentlyOff}</span>
      ) : connected ? (
        <>
          <span className="live-tag">{t.agent.coop}</span>
          <span className={`msg${last?.denied ? " denied" : ""}`}>
            ▸ {last?.text ?? t.agent.connected}
          </span>
        </>
      ) : (
        <span className="msg">
          {t.agent.notConnected} <code>window.nibble.help()</code> {t.agent.notConnected2}
        </span>
      )}
      <span style={{ flex: 1 }} />
      <button className="btn sm ghost" onClick={onOpen}>
        <Icon name="help" size={11} /> {enabled ? t.agent.connect : t.agent.reconnect}
      </button>
    </div>
  );
}

/* ────────── izin listesi ────────── */
function Permissions() {
  const t = useT();
  const policy = useEditor((s) => s.agentPolicy);
  const setAgentScope = useEditor((s) => s.setAgentScope);

  return (
    <div className="perms">
      {AGENT_SCOPES.map((scope) => {
        const on = policy.scopes[scope];
        const risky = scope === "destructive" || scope === "files";
        return (
          <label key={scope} className={`perm${risky ? " risky" : ""}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={!policy.enabled}
              onChange={(e) => setAgentScope(scope, e.target.checked)}
            />
            <span className="perm-body">
              <b>
                <span aria-hidden>{SCOPE_ICON[scope]}</span> {t.agent.perms[scope]}
              </b>
              <span className="hint">{t.agent.perms[`${scope}Desc` as const]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ────────── diyalog ────────── */
export function AgentDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const connected = useEditor((s) => s.agentConnected);
  const enabled = useEditor((s) => s.agentPolicy.enabled);
  const log = useEditor((s) => s.agentLog);
  const setAgentEnabled = useEditor((s) => s.setAgentEnabled);
  const showToast = useEditor((s) => s.showToast);

  return (
    <Dialog title={t.agent.dialogTitle} onClose={onClose} wide>
      <p style={{ marginTop: 0 }}>{t.agent.intro}</p>
      <pre className="code">{t.agent.prompt}</pre>
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <CopyPromptButton text={t.agent.prompt} label={t.agent.copyPrompt} done={t.common.copied} />
        <span className="hint">{connected ? t.agent.connectedYes : t.agent.connectedNo}</span>
      </div>

      <h4 className="section">{t.agent.permTitle}</h4>
      <p className="hint" style={{ marginBottom: 10 }}>
        {t.agent.permLead}
      </p>
      <Permissions />

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className={`btn${enabled ? " danger" : " primary"}`}
          onClick={() => {
            setAgentEnabled(!enabled);
            showToast(enabled ? t.agent.disconnected : null);
          }}
        >
          {enabled ? t.agent.disconnect : t.agent.reconnect}
        </button>
      </div>

      <h4 className="section">{t.agent.safetyTitle}</h4>
      <ul className="bullets">
        {t.agent.safety.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <h4 className="section">{t.agent.howTitle}</h4>
      <p className="hint" style={{ lineHeight: 1.8 }}>
        {t.agent.how}
      </p>

      {log.length > 0 && (
        <>
          <h4 className="section">{t.agent.recent}</h4>
          <pre className="code">
            {log
              .slice(-16)
              .map((l) => `${l.denied ? "✕" : "▸"} ${l.text}`)
              .join("\n")}
          </pre>
        </>
      )}
    </Dialog>
  );
}

function CopyPromptButton({
  text,
  label,
  done,
}: {
  text: string;
  label: string;
  done: string;
}) {
  const showToast = useEditor((s) => s.showToast);
  return (
    <button
      className="btn primary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          showToast(done);
        } catch {
          showToast(null);
        }
      }}
    >
      {label}
    </button>
  );
}
