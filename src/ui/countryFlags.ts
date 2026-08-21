/** ISO-3 game ids to ISO-2 flag assets. Kept static so selection never performs lookup work. */
const ISO2_BY_NATION: Readonly<Record<string, string>> = {
  abw:'aw',afg:'af',ago:'ao',alb:'al',are:'ae',arg:'ar',arm:'am',atg:'ag',aus:'au',aut:'at',aze:'az',
  bdi:'bi',bel:'be',ben:'bj',bfa:'bf',bgd:'bd',bgr:'bg',bhr:'bh',bih:'ba',blr:'by',blz:'bz',bol:'bo',
  bra:'br',brn:'bn',btn:'bt',bwa:'bw',caf:'cf',can:'ca',che:'ch',chl:'cl',chn:'cn',civ:'ci',cmr:'cm',
  cod:'cd',cog:'cg',col:'co',cri:'cr',cub:'cu',cuw:'cw',cyp:'cy',cze:'cz',deu:'de',dji:'dj',dma:'dm',
  dnk:'dk',dom:'do',dza:'dz',ecu:'ec',egy:'eg',eri:'er',esp:'es',est:'ee',eth:'et',fin:'fi',flk:'fk',
  fra:'fr',fsm:'fm',gab:'ga',gbr:'gb',geo:'ge',gha:'gh',gin:'gn',gmb:'gm',gnb:'gw',gnq:'gq',grc:'gr',
  grd:'gd',grl:'gl',gtm:'gt',gum:'gu',guy:'gy',hnd:'hn',hrv:'hr',hti:'ht',hun:'hu',idn:'id',ind:'in',irl:'ie',
  irn:'ir',irq:'iq',isl:'is',isr:'il',ita:'it',jam:'jm',jor:'jo',jpn:'jp',kaz:'kz',ken:'ke',kgz:'kg',
  khm:'kh',kir:'ki',kor:'kr',kos:'xk',kwt:'kw',lao:'la',lbn:'lb',lbr:'lr',lby:'ly',lca:'lc',lka:'lk',
  lso:'ls',ltu:'lt',lux:'lu',lva:'lv',mar:'ma',mda:'md',mdg:'mg',mex:'mx',mkd:'mk',mli:'ml',mmr:'mm',
  mne:'me',mng:'mn',moz:'mz',mrt:'mr',mwi:'mw',mys:'my',nam:'na',ner:'ne',nga:'ng',nic:'ni',nld:'nl',
  nor:'no',npl:'np',nzl:'nz',omn:'om',pak:'pk',pan:'pa',per:'pe',phl:'ph',png:'pg',pol:'pl',prk:'kp',
  prt:'pt',pry:'py',psx:'ps',qat:'qa',rou:'ro',rus:'ru',rwa:'rw',sau:'sa',sdn:'sd',sds:'ss',sen:'sn',
  sgp:'sg',sle:'sl',slv:'sv',som:'so',srb:'rs',stp:'st',sur:'sr',svk:'sk',svn:'si',swe:'se',swz:'sz',
  syc:'sc',syr:'sy',tcd:'td',tgo:'tg',tha:'th',tjk:'tj',tkm:'tm',tls:'tl',ton:'to',tun:'tn',tur:'tr',
  twn:'tw',tza:'tz',uga:'ug',ukr:'ua',ury:'uy',usa:'us',uzb:'uz',vct:'vc',ven:'ve',vnm:'vn',wsm:'ws',
  yem:'ye',zaf:'za',zmb:'zm',zwe:'zw',
};

// Vite turns these bundled SVGs into local, hashed production assets. The map
// and DOM UI share the exact same URL cache, so flags never depend on a remote
// service and are downloaded only once by the browser.
export const MAP_FLAG_TEXTURE_WIDTH = 256;
export const MAP_FLAG_TEXTURE_HEIGHT = 192;

const RAW_FLAG_ASSETS = import.meta.glob('../../node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  import: 'default',
  // Phaser must receive a URL so it can rasterise each vector at map quality. Vite's
  // default inline data URI is ideal for DOM flags but its SVG loader cannot
  // resize it and would allocate the full source dimensions on the GPU.
  query: '?url&no-inline',
}) as Readonly<Record<string, string>>;

const FLAG_ASSET_BY_ISO2: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RAW_FLAG_ASSETS).flatMap(([path, url]) => {
    const match = path.match(/\/([a-z]{2})\.svg$/);
    return match ? [[match[1]!, url]] : [];
  }),
);

export function countryFlagAssetUrl(nationId: string): string | undefined {
  const code = ISO2_BY_NATION[nationId];
  return code ? FLAG_ASSET_BY_ISO2[code] : undefined;
}

export function countryFlagHtml(nationId: string, fallback: string, eager = false): string {
  const url = countryFlagAssetUrl(nationId);
  if (!url) return `<span class="country-flag__fallback">${fallback}</span>`;
  const loading = eager ? 'eager' : 'lazy';
  return `<span class="country-flag__fallback">${fallback}</span><img src="${url}" alt="" width="80" height="60" loading="${loading}" decoding="async" fetchpriority="low">`;
}
