import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { preflight, doctorTarget, wpGet, decodeHtml, validateInputs } from './wordpress-rankmath-doctor-convergence.mjs';

export const CATEGORY_INDEXABILITY_POLICY = Object.freeze({ taxonomy: 'category', expectedIndexable: true, scope: 'all-sites', source: 'owner-instruction-2026-09-06' });

const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export function publicSeo(html) {
  const rawHtml = String(html);
  // Analyze the document head, excluding inline script/comment lookalikes.
  const clean = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const head = clean.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const body = head ? clean.slice(head.index + head[0].length) : '';
  html = head ? head[1] : clean;
  const result = { titles: [], descriptions: [], canonicals: [], robots: [], schemaBlocks: 0, misplacedSeoTags: 0 };
  for (const match of html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)) result.titles.push(normalize(decodeHtml(match[1])));
  for (const match of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const attrs = {};
    for (const a of match[0].matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = decodeHtml(a[2] ?? a[3] ?? a[4] ?? '');
    const name = (attrs.name || '').toLowerCase();
    if (name === 'description') result.descriptions.push(normalize(attrs.content));
    if (['robots','googlebot','bingbot'].includes(name)) result.robots.push(normalize(attrs.content));
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) result.canonicals.push(attrs.href || '');
  }
  result.schemaBlocks = (rawHtml.match(/<script\b[^>]*type=["']application\/ld\+json["']/gi) || []).length;
  result.misplacedSeoTags = (body.match(/<(?:meta\b[^>]*name=["']description["']|link\b[^>]*rel=["']canonical["'])[^>]*>/gi) || []).length;
  return result;
}
export function publicFindings(seo, url, {taxonomy, xRobotsTag = ""} = {}) {
  const issues = [];
  for (const key of ['titles', 'descriptions', 'canonicals']) {
    if (seo[key].length !== 1 || !seo[key][0]) issues.push(`PUBLIC_${key.toUpperCase()}_MISSING_OR_DUPLICATED`);
  }
  if (seo.canonicals.length === 1) {
    try { if (new URL(seo.canonicals[0], url).href !== new URL(url).href) issues.push('CANONICAL_REVIEW_REQUIRED'); }
    catch { issues.push('CANONICAL_INVALID'); }
  }
  if ([...seo.robots,xRobotsTag].some(value => /\bnoindex\b/i.test(value))) issues.push(taxonomy === CATEGORY_INDEXABILITY_POLICY.taxonomy ? 'CATEGORY_NOINDEX_POLICY_VIOLATION' : 'NOINDEX_REVIEW_REQUIRED');
  if ([...seo.titles, ...seo.descriptions].some(value => /^SeoGrow E2E (categoria|tag) /i.test(value))) issues.push('LEGACY_MARKER_PUBLIC');
  if (seo.misplacedSeoTags) issues.push('MISPLACED_SEO_TAGS_IN_BODY');
  return issues;
}
export function classifyError(error) {
  if (error?.status === 404 && error?.code === 'rest_no_route') return 'CONNECTOR_UPDATE_REQUIRED';
  if ([401,403].includes(error?.status)) return 'AUTH_OR_PERMISSION_REQUIRED';
  return 'CHECK_FAILED';
}

export function resourceExclusion(resource) {
  return resource.postType === 'elementor_library' ? 'ELEMENTOR_TEMPLATE_NOT_SEO_PAGE' : null;
}
export async function fetchPublic(url, siteOrigin, transport = fetch) {
  const seen = new Set();
  const redirects = [];
  for (let hop=0; hop<=4; hop++) {
    const target = new URL(url);
    if (target.origin !== siteOrigin || target.username || target.password) throw new Error('PUBLIC_REDIRECT_OUTSIDE_AUTHORIZED_ORIGIN');
    if (seen.has(target.href)) throw new Error('PUBLIC_REDIRECT_LOOP');
    seen.add(target.href);
    const response = await transport(target.href, {redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'text/html','cache-control':'no-cache'}});
    if ([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');
      if(!location) throw new Error('PUBLIC_REDIRECT_LOCATION_MISSING');
      redirects.push({url:target.href,status:response.status});
      url=new URL(location,target).href;
      continue;
    }
    if(!response.ok) throw new Error(`PUBLIC_HTTP_${response.status}`);
    return {response,url:target.href,redirects};
  }
  throw new Error('PUBLIC_REDIRECT_LIMIT');
}

export async function runGlobal() {
  const report = { schemaVersion: 2, startedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local', healthy: false, categoryPolicy: CATEGORY_INDEXABILITY_POLICY,
    coverage: { taxonomy: 'category/post_tag: metadata diagnostics and public HTML', pages: 'published public inventory: rendered title/description/canonical/robots; no post database proof',
      excluded: ['Elementor templates (listed separately)', 'custom taxonomies', 'draft/private content', 'schema semantic validation', 'Rank Math analytics/redirections/settings', 'editorial correctness'], repair: 'only explicitly supplied category/tag meta_description; no new markers' },
    checks: [], targets: [], excludedResources: [], counts: {discovered: 0, checked: 0}, complete: false };
  const check = async (name, action) => {
    try { const result = await action(); report.checks.push({name, status:'PASS'}); return result; }
    catch (error) { report.checks.push({name,status:'BLOCKED',code:classifyError(error),detail:String(error.message).slice(0,500)}); return null; }
  };
  try {
    validateInputs();
    const site = new URL(process.env.SEOGROW_WP_SITE_URL);
    const explicit = [process.env.SEOGROW_WP_CATEGORY_URL, process.env.SEOGROW_WP_TAG_URL].filter(Boolean);
    const deadline = Date.now() + 8 * 60_000;
    const authorizedUrl = url => {
      const parsed = new URL(url);
      if (parsed.origin !== site.origin || parsed.username || parsed.password) throw new Error('INVENTORY_URL_NOT_AUTHORIZED');
      return parsed;
    };
    const auth = `Basic ${Buffer.from(`${process.env.SEOGROW_WP_USERNAME}:${process.env.SEOGROW_WP_APPLICATION_PASSWORD}`).toString('base64')}`;
    const request = async (url, authenticated = false) => {
      if (Date.now() > deadline) throw new Error('GLOBAL_TIME_BUDGET_EXCEEDED');
      authorizedUrl(url);
      const response = await fetch(url, { redirect:'manual', signal:AbortSignal.timeout(15000), headers: { accept: authenticated ? 'application/json' : 'text/html', ...(authenticated ? {authorization:auth} : {}), 'cache-control':'no-cache' } });
      if (!response.ok) { const error = new Error(`HTTP_${response.status}`); error.status=response.status; throw error; }
      return response;
    };
    let canRepair = false;
    await check('connector-convergence-preflight', async () => { await preflight(); canRepair=true; });
    // Discover both term collections even when the installed Connector is outdated.
    const resources = new Map();
    let inventoryComplete = true;
    for (const [collection, label] of [['categories','categoria'], ['tags','tag']]) {
      const inventory = await check(`inventory-${collection}`, async () => {
        const terms = [];
        let expectedTotal;
        for (let page=1; page<=20; page++) {
          const response = await request(new URL(`/wp-json/wp/v2/${collection}?per_page=100&page=${page}&hide_empty=false&orderby=id&order=asc`, site).href,true);
          const totalHeader = response.headers.get('x-wp-total');
          const pagesHeader = response.headers.get('x-wp-totalpages');
          if (totalHeader === null || pagesHeader === null) throw new Error('INVENTORY_TOTAL_UNPROVEN');
          const total=Number(totalHeader), pages=Number(pagesHeader);
          if (!Number.isInteger(total) || total<0 || !Number.isInteger(pages) || pages>20) throw new Error('INVENTORY_LIMIT_OR_INVALID_TOTAL');
          if (expectedTotal !== undefined && expectedTotal !== total) throw new Error('INVENTORY_CHANGED_DURING_SCAN');
          expectedTotal=total;
          const data=await response.json();
          if (!Array.isArray(data)) throw new Error('INVENTORY_INVALID');
          terms.push(...data);
          if(page>=pages) break;
        }
        if(terms.length !== expectedTotal || new Set(terms.map(t=>t.id)).size !== expectedTotal) throw new Error('INVENTORY_INCOMPLETE');
        return terms.map(t=>({url:authorizedUrl(t.link).href,label,kind:'taxonomy',id:t.id}));
      });
      if (!inventory) inventoryComplete=false;
      else for(const item of inventory) resources.set(item.url,item);
    }
    const pages = await check('inventory-public-pages', async () => {
      const data=await wpGet('wordpress-public-inventory');
      if(data.complete !== true || data.truncated !== false || !Array.isArray(data.resources) || data.resources.length !== data.totalResources) throw new Error('PUBLIC_INVENTORY_INCOMPLETE');
      return data.resources.map(r=>({url:authorizedUrl(r.url).href,kind:'page',id:r.id,postType:r.postType}));
    });
    if (!pages) inventoryComplete=false;
    else for(const item of pages) {
      const reason=resourceExclusion(item);
      if(reason) report.excludedResources.push({url:item.url,postType:item.postType,reason});
      else resources.set(item.url,item);
    }
    for(const url of explicit) resources.set(authorizedUrl(url).href,{...resources.get(url),url,kind:'taxonomy',label:url===process.env.SEOGROW_WP_CATEGORY_URL?'categoria':'tag',repair:true});
    report.counts.discovered=resources.size;
    // Repair the named incident first, once. Continue collecting independent failures.
    for (const item of [...resources.values()].sort((a,b)=>Number(Boolean(b.repair))-Number(Boolean(a.repair)))) {
      if (report.targets.length>=500 || Date.now()>deadline) {inventoryComplete=false; report.checks.push({name:'scan-budget',status:'BLOCKED',code:'INCOMPLETE_SCAN'}); break;}
      const row={url:item.url,kind:item.kind,issues:[],repair:item.repair?'NOT_RUN':'READ_ONLY'};
      if(item.repair && canRepair) {
        try {await doctorTarget(item); row.repair='VERIFIED';}
        catch(error){row.repair='BLOCKED';row.issues.push(String(error.message).slice(0,500));}
      }
      if(item.repair && !canRepair) row.issues.push('CONNECTOR_PREFLIGHT_BLOCKED_REPAIR');
      if(item.kind==='taxonomy') {
        try {
          const d=await wpGet('taxonomy-diagnostics',{url:item.url});
          if(d?.plugins?.rankMath !== true || d?.plugins?.yoast !== false) row.issues.push('OWNERSHIP_NOT_RANK_MATH_ONLY');
          if (!d.meta || !d.term?.id) throw new Error('DIAGNOSTICS_INVALID');
          for(const field of ['rank_math_title','rank_math_description','rank_math_canonical_url','rank_math_robots']) {
            const m=d.meta[field];
            if(!m || !Array.isArray(m.dbRows)) {row.issues.push(`${field}:DIAGNOSTICS_MISSING`);continue;}
            if(m.dbRows.length>1) row.issues.push(`${field}:DUPLICATE_ROWS`);
            if(m.dbRows.length===1 && JSON.stringify(m.apiValue)!==JSON.stringify(m.dbRows[0].value)) row.issues.push(`${field}:API_DATABASE_DIVERGENCE`);
          }
          row.backendDescription=typeof d.meta.rank_math_description?.apiValue==='string' ? d.meta.rank_math_description.apiValue : null;
        } catch(error){row.issues.push(`DIAGNOSTICS:${classifyError(error)}`);}
      }
      try {
        const resolved=await fetchPublic(item.url,site.origin);
        const seo=publicSeo(await resolved.response.text());
        row.finalUrl=resolved.url;
        row.redirects=resolved.redirects;
        row.issues.push(...publicFindings(seo,resolved.url,{taxonomy:item.label==='categoria'?'category':item.label==='tag'?'post_tag':undefined,xRobotsTag:resolved.response.headers.get('x-robots-tag') || ''}));
        if(row.backendDescription) {
          if(/%[^%]+%/.test(row.backendDescription)) row.issues.push('DYNAMIC_TEMPLATE_REVIEW_REQUIRED');
          else if(seo.descriptions.length===1 && normalize(row.backendDescription)!==seo.descriptions[0]) row.issues.push('PUBLIC_DATABASE_DESCRIPTION_DIVERGENCE');
        }
        row.publicCounts={titles:seo.titles.length,descriptions:seo.descriptions.length,canonicals:seo.canonicals.length,schemaBlocks:seo.schemaBlocks};
      } catch(error){row.issues.push(`PUBLIC:${error.message}`);}
      delete row.backendDescription;
      report.targets.push(row); report.counts.checked++;
      console.log(`[global] ${report.counts.checked}/${report.counts.discovered} ${item.kind}: ${row.issues.length} findings; repair=${row.repair}`);
    }
    report.complete=inventoryComplete && report.counts.checked===report.counts.discovered;
    report.healthy=report.complete && report.checks.every(c=>c.status==='PASS') && report.targets.every(t=>t.issues.length===0);
  } catch(error) {report.checks.push({name:'global',status:'BLOCKED',code:classifyError(error),detail:String(error.message).slice(0,500)});}
  report.reviewRequired = report.targets.some(t=>t.issues.some(i=>i.endsWith('REVIEW_REQUIRED')));
  report.finishedAt=new Date().toISOString();
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/rankmath-global.json',JSON.stringify(report,null,2));
  const md=`# Rank Math global verification\n\nStatus: **${report.healthy?'PASS within declared coverage':'BLOCKED / findings require action'}**\n\nCoverage complete: ${report.complete}. Checked ${report.counts.checked}/${report.counts.discovered}. Excluded templates: ${report.excludedResources.length}.\n\nCategory policy: every category must be indexable on every site; category noindex is a policy violation, not an undecided review. This run does not change indexing settings. Repairs: named category/tag description only. Other resources are read-only. Pages have public HTML checks only; this is not certification of every Rank Math feature.\n\n${report.checks.map(c=>`- ${c.name}: ${c.status} ${c.code||''}`).join('\n')}\n\n${report.targets.filter(t=>t.issues.length).map(t=>`- ${t.url}: ${t.issues.join('; ')}`).join('\n')}\n\nIf CONNECTOR_UPDATE_REQUIRED: install the complete seogrow-connector 1.3.1 ZIP artifact, replacing the installed plugin. A repository update does not update WordPress. Do not repeat recovery or supply an invented original value.\n`;
  await writeFile('artifacts/rankmath-global.md',md);
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,md);
  console.log(`RANK_MATH_GLOBAL=${report.healthy?'PASS':'BLOCKED'}`);
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=await runGlobal();
  process.exitCode=report.healthy?0:1;
}
