/**
 * Web Locker — Client half.
 *
 * A pure visual screen-occlusion overlay for the DSH Web UI. It covers the
 * whole frame after a configurable idle period (default 15 min) or on a manual
 * action from the sidebar, so a passer-by cannot read the screen. It does NOT
 * touch Host runtime, the session log, or Agent tool execution — background
 * work keeps running while the screen is covered.
 *
 * Surfaces used (all root-scoped, replaceRisk: none):
 *   - shell.overlay          registration entry; the lock node is portaled to
 *                            document.body so it stacks above body-level modals
 *   - sidebar.footer.action  the manual "Lock screen" button
 *   - settings.section       the bundle's own settings page
 */
window.__ModuleLoader__.load({
  id: 'dsh-web-locker',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const { useState, useEffect, useRef, useCallback } = React;
    const h = React.createElement;

    /* ----------------------------- dictionaries ---------------------------- */
    // Flat keys (no dots) under the "web-locker" namespace, resolved via the
    // real Client locale service through ctx.locale.register / bind.
    const EN = {
      metaTitle: 'Web Locker',
      metaDesc: 'Covers the Web UI with a lock screen after idle timeout or a manual action.',
      title: 'Screen locked',
      idle: 'Locked after idle timeout',
      manual: 'Locked manually',
      placeholder: 'Enter password to unlock',
      unlock: 'Unlock',
      wrong: 'Wrong password',
      hint: 'Click anywhere or press any key to unlock',
      lockBtn: 'Lock screen',
      lockBtnTitle: 'Lock the Web UI now',
      setIdle: 'Idle lock timeout (seconds)',
      setIdleHelp: 'Lock the screen after this many seconds without activity. 0 disables auto-lock.',
      setPassword: 'Unlock password',
      setPasswordHelp: 'If set, the password is required to unlock. Leave empty to unlock by click or keypress.',
      setBlur: 'Lock when tab loses focus',
      setBlurHelp: 'Lock immediately when you switch to another tab or window.',
      setClock: 'Show clock on lock screen',
      setClockHelp: 'Display the current time on the lock screen.',
      setManualBtn: 'Show manual lock button',
      setManualBtnHelp: 'Add a "Lock screen" action to the sidebar footer.'
    };
    const ZH = {
      metaTitle: 'Web 锁定',
      metaDesc: '闲置超时或手动操作后，用锁屏盖住 Web UI，防止旁人偷看屏幕。',
      title: '屏幕已锁定',
      idle: '闲置超时后已锁定',
      manual: '已手动锁定',
      placeholder: '输入密码解锁',
      unlock: '解锁',
      wrong: '密码错误',
      hint: '点击任意处或按任意键解锁',
      lockBtn: '锁定屏幕',
      lockBtnTitle: '立即锁定 Web UI',
      setIdle: '闲置锁定阈值（秒）',
      setIdleHelp: '鼠标键盘无操作达到该秒数后自动锁屏。设为 0 关闭自动锁。',
      setPassword: '解锁密码',
      setPasswordHelp: '设置后解锁需输入正确密码；留空则点击或按键即可解锁。',
      setBlur: '切走标签页即锁定',
      setBlurHelp: '切换到其他标签页或窗口时立即锁定。',
      setClock: '锁屏显示时钟',
      setClockHelp: '在锁屏界面显示当前时间。',
      setManualBtn: '显示手动锁按钮',
      setManualBtnHelp: '在侧边栏底部添加「锁定屏幕」操作。'
    };

    const LOCK_SVG =
      '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

    /* ------------------------------- config -------------------------------- */
    const LS_KEY = 'dsh-web-locker.config.v1';
    const DEFAULTS = {
      idleSeconds: 900,
      password: '',
      lockOnBlur: true,
      showClock: true,
      showManualButton: true
    };
    function loadConfig() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
      } catch (e) {}
      return Object.assign({}, DEFAULTS);
    }
    let config = loadConfig();
    function saveConfig(patch) {
      config = Object.assign({}, config, patch);
      try { localStorage.setItem(LS_KEY, JSON.stringify(config)); } catch (e) {}
    }

    /* --------------------------- cross-component --------------------------- */
    // The always-mounted overlay owns the lock/unlock state machine and exposes
    // it here so the sidebar button can trigger a manual lock.
    const bus = { lock: null, unlock: null };
    function requestLock(reason) { if (bus.lock) bus.lock(reason); }

    /* ----------------------------- runtime ctx ----------------------------- */
    let ctx; // assigned in apply(); closures below only run after apply().

    function lockLabel() {
      try { return ctx.locale.bind('web-locker')('metaTitle'); }
      catch (e) { return 'Web Locker'; }
    }
    function useTranslate() {
      const [, force] = useState(0);
      useEffect(() => {
        try { return ctx.locale.subscribe(() => force((n) => n + 1)); } catch (e) { return undefined; }
      }, []);
      return ctx.locale.bind('web-locker');
    }
    function useConfig() {
      const [cfg, setCfg] = useState(config);
      const update = useCallback((patch) => { saveConfig(patch); setCfg(Object.assign({}, config)); }, []);
      return [cfg, update];
    }

    function fmtTime(ts) {
      try { return new Date(ts).toLocaleTimeString(); } catch (e) { return ''; }
    }

    /* --------------------------- lock overlay ------------------------------ */
    function LockerOverlay() {
      const t = useTranslate();
      const [locked, setLocked] = useState(false);
      const [reason, setReason] = useState('idle');
      const [pw, setPw] = useState('');
      const [err, setErr] = useState(false);
      const [now, setNow] = useState(() => Date.now());
      const idleTimer = useRef(null);
      const inputRef = useRef(null);
      const lockedRef = useRef(false);

      const doLock = useCallback((r) => {
        if (lockedRef.current) return;
        lockedRef.current = true;
        setReason(r || 'idle');
        setPw('');
        setErr(false);
        setLocked(true);
        if (idleTimer.current) clearTimeout(idleTimer.current);
      }, []);

      const scheduleIdle = useCallback(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        const ms = (config.idleSeconds || 0) * 1000;
        if (!ms) return;
        idleTimer.current = setTimeout(() => {
          if (!lockedRef.current) doLock('idle');
        }, ms);
      }, [doLock]);

      const doUnlock = useCallback(() => {
        if (!lockedRef.current) return;
        lockedRef.current = false;
        setLocked(false);
        setPw('');
        setErr(false);
        scheduleIdle();
      }, [scheduleIdle]);

      // Own the lock state + wire activity / blur detection.
      useEffect(() => {
        bus.lock = doLock;
        bus.unlock = doUnlock;
        scheduleIdle();
        const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll', 'pointerdown'];
        const onActivity = () => { if (!lockedRef.current) scheduleIdle(); };
        events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
        const onVis = () => { if (document.hidden && config.lockOnBlur) doLock('idle'); };
        const onBlur = () => { if (config.lockOnBlur) doLock('idle'); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('blur', onBlur);
        return () => {
          bus.lock = null;
          bus.unlock = null;
          if (idleTimer.current) clearTimeout(idleTimer.current);
          events.forEach((e) => window.removeEventListener(e, onActivity));
          document.removeEventListener('visibilitychange', onVis);
          window.removeEventListener('blur', onBlur);
        };
      }, [doLock, doUnlock, scheduleIdle]);

      // Clock ticking while locked.
      useEffect(() => {
        if (!locked || !config.showClock) return;
        const i = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(i);
      }, [locked]);

      // Click / keypress unlock when no password is set.
      useEffect(() => {
        if (!locked || config.password) return;
        const onUser = () => doUnlock();
        window.addEventListener('keydown', onUser);
        window.addEventListener('pointerdown', onUser);
        return () => {
          window.removeEventListener('keydown', onUser);
          window.removeEventListener('pointerdown', onUser);
        };
      }, [locked, doUnlock]);

      // Focus the password field when locked with a password.
      useEffect(() => {
        if (locked && config.password && inputRef.current) inputRef.current.focus();
      }, [locked]);

      const tryUnlock = () => {
        if (!config.password) { doUnlock(); return; }
        if (pw === config.password) doUnlock();
        else setErr(true);
      };

      if (!locked) return null;

      const hasPw = !!config.password;
      // Render into document.body via a portal so the lock screen lives in the
      // same stacking layer as host body-level modals (e.g. the Settings panel,
      // which also uses createPortal). Without this, a shell.overlay entry stays
      // inside the app frame subtree and is painted *under* body-level modals
      // regardless of z-index. This matches the host's own desktop-onboarding.
      const node = h('div', {
        className: 'wl-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('title'),
        onClick: hasPw ? undefined : () => doUnlock()
      },
        h('div', { className: 'wl-card' },
          h('div', { className: 'wl-lockicon', dangerouslySetInnerHTML: { __html: LOCK_SVG } }),
          h('div', { className: 'wl-title' }, t('title')),
          h('div', { className: 'wl-sub' }, reason === 'manual' ? t('manual') : t('idle')),
          config.showClock ? h('div', { className: 'wl-clock' }, fmtTime(now)) : null,
          hasPw
            ? h('form', { className: 'wl-form', onSubmit: (e) => { e.preventDefault(); tryUnlock(); } },
                h('input', {
                  ref: inputRef, className: 'wl-input', type: 'password',
                  placeholder: t('placeholder'), value: pw, autoFocus: true,
                  'aria-label': t('placeholder'),
                  onChange: (e) => { setPw(e.target.value); setErr(false); },
                  onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } }
                }),
                h('button', { type: 'submit', className: 'wl-btn' }, t('unlock'))
              )
            : null,
          h('div', { className: 'wl-error' }, err ? t('wrong') : ''),
          hasPw ? null : h('div', { className: 'wl-hint' }, t('hint'))
        )
      );
      return ReactDOM.createPortal(node, document.body);
    }

    /* --------------------------- manual button ----------------------------- */
    function LockerButton() {
      const t = useTranslate();
      const [cfg] = useConfig();
      if (!cfg.showManualButton) return null;
      return h('button', {
        className: 'wl-lock-btn',
        title: t('lockBtnTitle'),
        onClick: () => requestLock('manual')
      },
        h('span', { className: 'wl-lockicon', style: { width: 18, height: 18 }, dangerouslySetInnerHTML: { __html: LOCK_SVG } }),
        h('span', null, t('lockBtn'))
      );
    }

    /* ---------------------------- settings page ---------------------------- */
    function Row(t, baseKey, control) {
      return h('div', { className: 'wl-row' },
        h('div', { className: 'wl-rowlabel' }, t(baseKey)),
        h('div', { className: 'wl-rowhelp' }, t(baseKey + 'Help')),
        h('div', { className: 'wl-control' }, control)
      );
    }
    function SettingsPage() {
      const t = useTranslate();
      const [cfg, update] = useConfig();
      return h('div', { className: 'wl-settings' },
        h('h2', null, t('metaTitle')),
        Row(t, 'setIdle',
          h('input', {
            className: 'wl-input-sm', type: 'number', min: 0, max: 86400, value: cfg.idleSeconds,
            onChange: (e) => {
              const v = Math.max(0, Math.min(86400, parseInt(e.target.value || '0', 10) || 0));
              update({ idleSeconds: v });
            }
          })),
        Row(t, 'setPassword',
          h('input', {
            className: 'wl-input-sm', type: 'password', value: cfg.password,
            onChange: (e) => update({ password: e.target.value })
          })),
        Row(t, 'setBlur',
          h('input', { type: 'checkbox', checked: cfg.lockOnBlur, onChange: (e) => update({ lockOnBlur: e.target.checked }) })),
        Row(t, 'setClock',
          h('input', { type: 'checkbox', checked: cfg.showClock, onChange: (e) => update({ showClock: e.target.checked }) })),
        Row(t, 'setManualBtn',
          h('input', { type: 'checkbox', checked: cfg.showManualButton, onChange: (e) => update({ showManualButton: e.target.checked }) }))
      );
    }

    /* ------------------------------ styles --------------------------------- */
    const CSS = `
.wl-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-overlay, rgba(8,10,14,0.94));color:var(--dsw-alias-label-primary,#e6e6e6);
  font-family:var(--dsw-alias-font-ui, system-ui, -apple-system, sans-serif);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);user-select:none;}
.wl-card{display:flex;flex-direction:column;align-items:center;gap:14px;padding:32px 40px;border-radius:16px;
  background:var(--dsw-alias-bg-base, rgba(20,22,28,0.6));border:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08));
  box-shadow:0 20px 60px rgba(0,0,0,0.45);text-align:center;min-width:280px;max-width:90vw;}
.wl-title{font-size:20px;font-weight:600;}
.wl-sub{font-size:13px;opacity:0.7;}
.wl-clock{font-size:34px;font-weight:300;letter-spacing:1px;font-variant-numeric:tabular-nums;}
.wl-form{display:flex;gap:8px;margin-top:6px;width:100%;}
.wl-input{flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.14));
  background:var(--dsh-alias-bg-base,#11131a);color:var(--dsh-alias-label-primary,#e6e6e6);font-size:14px;outline:none;}
.wl-input:focus{border-color:var(--dsh-alias-brand-primary,#3b82f6);}
.wl-btn{padding:10px 18px;border:none;border-radius:8px;background:var(--dsh-alias-brand-primary,#3b82f6);
  color:#fff;font-size:14px;font-weight:600;cursor:pointer;}
.wl-btn:hover{filter:brightness(1.08);}
.wl-hint{font-size:12px;opacity:0.62;margin-top:4px;}
.wl-error{color:var(--dsh-alias-state-error-primary,#ef4444);font-size:12px;min-height:16px;}
.wl-lockicon{width:46px;height:46px;opacity:0.85;}
.wl-settings{padding:18px 20px;max-width:640px;}
.wl-settings h2{font-size:16px;margin:0 0 14px;}
.wl-row{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:1px solid var(--dsh-alias-border-l1, rgba(255,255,255,0.08));}
.wl-row:first-of-type{border-top:none;}
.wl-rowlabel{font-size:14px;font-weight:500;}
.wl-rowhelp{font-size:12px;opacity:0.6;}
.wl-control{margin-top:4px;}
.wl-input-sm{padding:8px 10px;border-radius:8px;border:1px solid var(--dsh-alias-border-l1, rgba(255,255,255,0.14));
  background:var(--dsh-alias-bg-base,#11131a);color:var(--dsh-alias-label-primary,#e6e6e6);font-size:14px;outline:none;max-width:240px;}
.wl-input-sm:focus{border-color:var(--dsh-alias-brand-primary,#3b82f6);}
.wl-lock-btn{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;background:transparent;
  color:var(--dsh-alias-label-secondary,#9aa0aa);font-size:13px;cursor:pointer;border-radius:8px;}
.wl-lock-btn:hover{background:var(--dsh-alias-bg-overlay, rgba(255,255,255,0.06));color:var(--dsh-alias-label-primary,#e6e6e6);}
`;
    function injectStyle(css) {
      try {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
          styles.insert(css);
          return null; // managed by the host style registry
        }
      } catch (e) {}
      try {
        const el = document.createElement('style');
        el.setAttribute('data-dsh-web-locker', '1');
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
        return el; // caller removes on dispose
      } catch (e) {}
      return null;
    }

    /* ------------------------------ register ------------------------------- */
    return {
      inject: ['slots', 'locale'],
      apply(c) {
        ctx = c;
        const createdStyleEl = injectStyle(CSS);
        try { ctx.locale.register('web-locker', 'en', EN); } catch (e) {}
        try { ctx.locale.register('web-locker', 'zh', ZH); } catch (e) {}
        const unsubs = [
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register({ name: 'shell.overlay', id: 'dsh-web-locker.overlay', order: 1000 }, LockerOverlay)),
          ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-web-locker.lock', order: 10, label: lockLabel }, LockerButton)),
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register({ name: 'settings.section', id: 'dsh-web-locker', order: 100, label: lockLabel }, SettingsPage))
        ];
        return () => {
          unsubs.forEach((u) => { if (u) u(); });
          if (createdStyleEl && createdStyleEl.parentNode) createdStyleEl.parentNode.removeChild(createdStyleEl);
        };
      }
    };
  }
});
