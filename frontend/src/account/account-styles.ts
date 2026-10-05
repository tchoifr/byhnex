// Styles of the account button, pill, dialog and banner. Prefixed with .bx- to stay apart from the site's CSS.
export const accountCss = `
.bx-account{cursor:pointer;border-radius:8px}
.bx-account:hover{background:rgba(255,255,255,.03)}
.bx-account:focus-visible,.bx-pill:focus-visible,.bx-dialog button:focus-visible,.bx-dialog input:focus-visible{outline:2px solid #48d6bc;outline-offset:2px}
.bx-account small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bx-account>div{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bx-dot{width:7px!important;height:7px!important;border-radius:50%;margin-left:auto;flex:none;background:#5f6b82!important}
.bx-dot.ok{background:#47c7ab!important}.bx-dot.syncing,.bx-dot.pending{background:#d9b45a!important}.bx-dot.error{background:#f23645!important}
.bx-pill{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:170;display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:20px;border:1px solid #2a3344;background:#121722;color:#e9edf6;font:600 12px 'Inter','Segoe UI',sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.bx-pill[hidden]{display:none}
.bx-dialog{width:400px;max-width:calc(100vw - 32px);border:1px solid #2a3344;border-radius:12px;background:#121722;color:#e9edf6;padding:0;font:13px/1.5 'Inter','Segoe UI',sans-serif}
.bx-dialog::backdrop{background:rgba(4,6,13,.7);backdrop-filter:blur(3px)}
.bx-dialog form,.bx-body{display:flex;flex-direction:column;gap:14px;padding:22px}
.bx-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.bx-head h2{margin:0;font:600 17px 'Space Grotesk','Segoe UI',sans-serif}
.bx-close{background:none;border:0;color:#8590a6;font-size:18px;cursor:pointer;padding:4px}
.bx-tabs{display:flex;gap:3px;background:#0b0e17;border:1px solid #242b3a;border-radius:8px;padding:3px}
.bx-tabs button{flex:1;border:0;background:none;color:#8590a6;padding:8px;border-radius:6px;font-weight:600;font-size:12px;font-family:inherit;cursor:pointer}
.bx-tabs button[aria-selected="true"]{background:#1b3035;color:#48d6bc}
.bx-dialog label{display:flex;flex-direction:column;gap:6px;font-size:11px;color:#a7b0bd}
.bx-dialog input{background:#0b0e17;border:1px solid #2a3344;border-radius:6px;padding:10px;color:#e9edf6;font-size:13px;font-family:inherit}
.bx-primary{border:0;border-radius:7px;padding:11px;background:#48d6bc;color:#06201b;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer}
.bx-primary:disabled{opacity:.5;cursor:wait}
.bx-ghost{border:1px solid #2a3344;border-radius:7px;padding:10px;background:#0b0e17;color:#e9edf6;font-weight:600;font-size:12px;font-family:inherit;cursor:pointer}
.bx-danger{color:#ff8b98}
.bx-note{margin:0;font-size:11px;color:#8590a6}
.bx-error{margin:0;font-size:12px;color:#ff8b98}.bx-error:empty{display:none}
.bx-status{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:12px;border:1px solid #242b3a;border-radius:8px;background:#0b0e17}
.bx-dialog details{border-top:1px solid #242b3a;padding-top:12px}
.bx-dialog summary{cursor:pointer;font-size:12px;color:#a7b0bd}
.bx-dialog details>div{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.bx-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:190;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:8px;background:#1b3035;border:1px solid #2f6f62;color:#cdf2e9;font:12px 'Inter','Segoe UI',sans-serif;max-width:calc(100vw - 32px)}
.bx-banner button{border:0;border-radius:6px;padding:6px 10px;background:#48d6bc;color:#06201b;font-weight:700;font-size:11px;font-family:inherit;cursor:pointer}
@media (prefers-reduced-motion:no-preference){.bx-dot.syncing{animation:bx-pulse 1s infinite alternate}}
@keyframes bx-pulse{to{opacity:.35}}`
