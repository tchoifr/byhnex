// One navigation component for every full page.
const sidebarMarkup="<aside class=\"bn-sidebar\" id=\"bn-sidebar\" aria-label=\"Navigation principale\"><a class=\"bn-brand\" href=\"index.html\"><img src=\"logo.png\" alt=\"\"><span>byhnex<span class=\"bn-brand-point\">.</span></span></a><div class=\"bn-workspace\"><span class=\"bn-workspace-icon\">B</span><div>Espace personnel<small>Votre boîte à outils crypto</small></div><span>⌄</span></div><p class=\"bn-nav-label\">EXPLORER</p><nav class=\"bn-nav\"><a href=\"index.html\" ><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 10l9-7 9 7 M5 9v12h5v-7h4v7h5V9\"/></svg><span>Vue d’ensemble</span></a><a href=\"signaux-crypto.html\" ><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 13h3l3-8 4 14 3-6h3\"/></svg><span>Signaux &amp; positionnement</span></a><a href=\"cycles.html\" ><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2 20a10 10 0 0 1 20 0 M6 20a6 6 0 0 1 12 0 M10 20a2 2 0 0 1 4 0\"/></svg><span>Cycles &amp; Rainbow</span></a><a href=\"accumulation.html\" ><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 3v18h18 M7 15V7 M5 9h4v4H5 M13 18V6 M11 10h4v5h-4 M19 13V3 M17 6h4v4h-4\"/></svg><span>Accumulation</span></a><a href=\"bot.html\" ><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"8\" width=\"14\" height=\"11\" rx=\"3\"/><path d=\"M12 8V5 M9.5 13h.01 M14.5 13h.01 M9.5 16.2h5 M3 13v2 M21 13v2\"/><circle cx=\"12\" cy=\"4\" r=\"1\"/></svg><span>Bot virtuel</span><b>NOUVEAU</b></a></nav><div class=\"bn-sidebar-bottom\"><div class=\"bn-local\"><span class=\"bn-status-dot\"></span>Vos données vous appartiennent<p>Portefeuille et simulations<br>enregistrés sur votre appareil.</p><span>Sans compte · Gratuit</span></div><a href=\"https://osvalt16.github.io/byhnex/\" target=\"_blank\" rel=\"noopener\" class=\"bn-source\">Site d’origine ↗</a><div class=\"bn-user\"><span>B</span><div>Mon workspace<small>Sauvegarde locale</small></div><i></i></div></div></aside>";
// Mobile: thumb tab bar at the bottom (Accueil, Signaux, Graphique, Cycles, Bot).
const TAB_ORDER=['index.html','signaux-crypto.html','accumulation.html','cycles.html','bot.html'];
const TAB_LABELS={'index.html':'Accueil','signaux-crypto.html':'Signaux','accumulation.html':'Graphique','cycles.html':'Cycles','bot.html':'Bot'};

if (!document.body.classList.contains('embed')) mountSidebar();

function mountSidebar() {
  const host=document.querySelector('[data-shared-sidebar]');
  if (!host) return;
  host.outerHTML=sidebarMarkup;
  document.body.classList.add('bn-shared-nav');
  const sidebar=document.getElementById('bn-sidebar');
  sidebar.querySelector('.bn-brand').setAttribute('aria-label','Accueil Byhnex');
  const page=location.pathname.split('/').pop() || 'index.html';
  const links=[...sidebar.querySelectorAll('.bn-nav a')];
  for (const link of links) {
    const active=link.getAttribute('href')===page;
    link.classList.toggle('active',active);
    link.title=link.querySelector('span').textContent;
    if (active) link.setAttribute('aria-current','page');
  }

  const aurora=document.createElement('div');
  aurora.className='w3-aurora';aurora.setAttribute('aria-hidden','true');

  const bar=document.createElement('div');
  bar.className='bn-menu-bar';
  bar.innerHTML='<a href="index.html" class="bn-menu-brand"><img src="logo.png" alt="">byhnex<b>.</b></a><span></span>';
  bar.querySelector('span').textContent=links.find(link=>link.classList.contains('active'))?.textContent.replace('NOUVEAU','').trim() || 'Workspace';

  const tabs=document.createElement('nav');
  tabs.className='w3-tabbar';tabs.setAttribute('aria-label','Navigation rapide');
  for (const href of TAB_ORDER) {
    const source=links.find(link=>link.getAttribute('href')===href);
    if (!source) continue;
    const tab=document.createElement('a');
    tab.href=href;
    tab.className=href==='accumulation.html'?'w3-tab w3-tab-main':'w3-tab';
    tab.innerHTML='<i>'+source.querySelector('svg').outerHTML+'</i><span></span>';
    tab.querySelector('span').textContent=TAB_LABELS[href];
    if (href===page) tab.setAttribute('aria-current','page');
    tabs.append(tab);
  }
  document.body.prepend(aurora,bar);
  document.body.append(tabs);

  // The side panel is hidden on phones: keep it out of the tab order there.
  const mobile=matchMedia('(max-width:760px)');
  const sync=()=>{sidebar.inert=mobile.matches;};
  sync();
  mobile.addEventListener('change',sync);
}
