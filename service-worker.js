// C2: producer-verified release caches. No user storage or legacy cache is deleted.
// Contract validation mirrors the existing Gate B consumer; conformance is tested offline.
const LAND_DOCUMENTS = ["v1/history.json", "v1/latest.json", "v2/history.json", "v2/latest.json", "v2/statistics.json"];
const LAND_FINANCIAL_FIELDS = ["price_man_yen", "land_area_sqm", "land_area_tsubo", "unit_price_man_per_tsubo"];
const TSUBO_SQM = 3.305785;
function declaredFinancialFieldsValid(record) {
  return Boolean(record && typeof record.source === "string" && record.source &&
    typeof (record.source_url || record.id) === "string" && (record.source_url || record.id) &&
    ["detail_confirmed", "listing_observed"].includes(record.financial_status) &&
    (record.source !== "LIFULL HOME'S" || record.financial_status === "detail_confirmed") &&
    validFinancialTimestamp(record.financial_checked_at) &&
    [record.price_man_yen, record.land_area_sqm, record.unit_price_man_per_tsubo]
      .every((value) => typeof value === "number" && Number.isFinite(value) && value > 0));
}


function requestReceiptVerified(record) {
  const proof = record?.verification_evidence;
  const identity = record?.source_url || record?.id;
  const listing = proof?.listing;
  const receipt = record?.source === "LIFULL HOME'S" ? proof?.detail : listing;
  const validReceipt = item => item?.success === true && item.source === record.source &&
    item.source_url === identity && item.listing_id === identity &&
    item.collection_id === proof.collection_id && validFinancialTimestamp(item.fetched_at) &&
    /^[a-f0-9]{64}$/.test(item.input_sha256 || "");
  return Boolean(proof?.schema_version === 1 && proof.parser_version === "land-extraction-d1" &&
    typeof proof.collection_id === "string" && proof.collection_id && validReceipt(listing) &&
    validReceipt(receipt) && declaredFinancialFieldsValid(record) &&
    Date.parse(receipt.fetched_at) === Date.parse(record.financial_checked_at) &&
    ["price_man_yen", "land_area_sqm"].every(key => receipt.extracted?.[key] === record[key]) &&
    record.unit_price_man_per_tsubo === roundFinancialHundredth(record.price_man_yen / (record.land_area_sqm / 3.305785)) &&
    (record.land_area_tsubo == null || record.land_area_tsubo === roundFinancialHundredth(record.land_area_sqm / 3.305785)) &&
    (record.address === undefined || listing.extracted?.address === record.address));
}


function financialEvidence(record) { return declaredFinancialFieldsValid(record) && requestReceiptVerified(record); }

function validFinancialTimestamp(value) {
  if (typeof value !== "string") return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
  return date.getUTCFullYear() === Number(parts[1]) && date.getUTCMonth() + 1 === Number(parts[2]) &&
    date.getUTCDate() === Number(parts[3]) && Number(parts[4]) < 24 && Number(parts[5]) < 60 && Number(parts[6]) < 60 &&
    (!parts[8] || (Number(parts[8]) < 24 && Number(parts[9]) < 60));
}


function safeFinancialRecord(record, historical = false) {
  if (!record || typeof record.id !== "string" || !record.id) throw new Error("物件IDが不正です");
  const result = { ...record };
  const eligible = historical ? financialEvidence(record) : hasConfirmedFinancials(record);
  if (!eligible) {
    result.unconfirmed_financial_observation = record.unconfirmed_financial_observation || {
      values: Object.fromEntries(LAND_FINANCIAL_FIELDS.map((key) => [key, record[key]])),
    };
    LAND_FINANCIAL_FIELDS.forEach((key) => { result[key] = null; });
    result.financial_state = "pending";
    result.financial_status = "pending";
    result.is_cheap_new = false;
  } else if (!(typeof result.land_area_tsubo === "number" && Number.isFinite(result.land_area_tsubo) && result.land_area_tsubo > 0)) {
    result.land_area_tsubo = Math.round(result.land_area_sqm / TSUBO_SQM * 100) / 100;
  }
  return result;
}


function safePriceHistory(entry) {
  if (!Array.isArray(entry.price_history || [])) throw new Error("価格履歴が不正です");
  const reference = entry.latest || entry;
  return (entry.price_history || []).filter((row) => financialEvidence({
    source: reference.source, source_url: reference.source_url || reference.id, ...row,
  }) && (row.source || reference.source) === reference.source &&
    (row.source_url || reference.source_url || reference.id) === (reference.source_url || reference.id));
}


function safeLegacyLandPair(latest, history) {
  const clean = record => {
    if (!record || requestReceiptVerified(record)) return record;
    return { ...record, financial_status: "pending", financial_state: "pending",
      financial_checked_at: null, detail_pending_reason: "legacy_receipt_unverified" };
  };
  const current = { ...latest, listings: latest.listings.map(clean) };
  const previous = { ...history, listings: history.listings.map(entry => ({ ...entry,
    latest: clean(entry.latest), price_history: (entry.price_history || []).map(row => clean({
      source: entry.latest?.source, source_url: entry.latest?.source_url || entry.id, ...row,
    })), last_confirmed: entry.last_confirmed ? clean(entry.last_confirmed) : undefined,
  })) };
  return safeLandPair(current, previous);
}


function safeLandPair(latest, history) {
  if (![1, 2].includes(latest?.schema_version) || latest.schema_version !== history?.schema_version ||
      !Array.isArray(latest.listings) || !Array.isArray(history.listings)) throw new Error("土地データ形式が不正です");
  if ((latest.generation_id || history.generation_id) && latest.generation_id !== history.generation_id) {
    throw new Error("一覧と履歴の世代が一致しません");
  }
  const unique = (rows) => {
    const ids = rows.map((row) => row.id);
    if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) throw new Error("物件IDが重複しています");
  };
  unique(latest.listings); unique(history.listings);
  if ((latest.collection_id || history.last_collection_id) && latest.collection_id !== history.last_collection_id) throw new Error("一覧と履歴の収集実行が一致しません");
  for (const row of latest.listings.filter(hasConfirmedFinancials)) {
    if (latest.collection_id && row.verification_evidence.collection_id !== latest.collection_id) throw new Error("Collection/evidence mismatch");
    const entry = history.listings.find((item) => item.id === row.id);
    if (!entry || entry.latest?.source !== row.source || entry.latest?.source_url !== row.source_url ||
        LAND_FINANCIAL_FIELDS.some((key) => row[key] !== entry.latest[key])) throw new Error("一覧と履歴の金融値が一致しません");
  }
  const rows = latest.listings.map((row) => safeFinancialRecord(row));
  const entries = history.listings.map((entry) => {
    if (entry.latest?.id !== entry.id) throw new Error("履歴の物件IDが一致しません");
    return { ...entry, latest: safeFinancialRecord(entry.latest, true), price_history: safePriceHistory(entry) };
  });
  const current = financialStatistics(rows);
  const past = historicalFinancialStatistics(entries, new Set(rows.filter(hasConfirmedFinancials).map((row) => row.id)));
  return { latest: { ...latest, listings: rows, ...current }, history: { ...history, listings: entries, ...past } };
}


function financialStatistics(rows) {
  const eligible = rows.filter((row) => hasConfirmedFinancials(row) && row.display_status !== "duplicate");
  return { summary: {
    listing_count: rows.length, financial_listing_count: eligible.length, observed_identity_count: rows.length,
    representative_listing_count: rows.filter((row) => row.display_status !== "duplicate").length,
    pending_listing_count: rows.filter((row) => !hasConfirmedFinancials(row)).length,
    overall_average_unit_price_man_per_tsubo: financialMean(eligible.map((row) => row.unit_price_man_per_tsubo)),
  }, towns: buildTownRowsFromListings(eligible).sort((a, b) => a.town < b.town ? -1 : a.town > b.town ? 1 : 0) };
}


function financialCalculationHeld(record) {
  return ["individual_review_hold", "address_conflict_review"].includes(record?.detail_pending_reason);
}

function historicalFinancialStatistics(entries, currentIds) {
  const eligible = entries.filter((entry) => entry.display_status !== "duplicate" &&
    !financialCalculationHeld(entry.latest)).map((entry) => {
    const reference = financialEvidence(entry.latest) ? entry.latest : entry.last_confirmed;
    return !financialCalculationHeld(reference) && financialEvidence(reference) ? { ...entry, latest: reference } : null;
  }).filter(Boolean);
  const towns = [...new Set(eligible.map((entry) => String(entry.latest.town || "")))].sort().map((town) => {
    const group = eligible.filter((entry) => String(entry.latest.town || "") === town);
    const values = group.map((entry) => entry.latest.unit_price_man_per_tsubo);
    const current = group.filter((entry) => currentIds.has(entry.id)).map((entry) => entry.latest.unit_price_man_per_tsubo);
    return { town, historical_unique_listing_count: group.length, current_listing_count: current.length,
      historical_average_unit_price_man_per_tsubo: financialMean(values), current_average_unit_price_man_per_tsubo: financialMean(current),
      minimum_unit_price_man_per_tsubo: Math.min(...values), maximum_unit_price_man_per_tsubo: Math.max(...values) };
  });
  return { summary: { unique_listing_count: entries.length, financial_history_count: eligible.length,
    current_listing_count: currentIds.size, historical_average_unit_price_man_per_tsubo: financialMean(eligible.map((entry) => entry.latest.unit_price_man_per_tsubo)) }, towns };
}


function financialMean(values) {
  return values.length ? roundFinancialHundredth(compensatedFinancialSum(values) / values.length) : null;
}

// Python 3.12 sum(float): compensated accumulation before rounding.
// A naive reduce changes the verified 3.715 mean to 3.7150000000000003.
function compensatedFinancialSum(values) {
  let high = 0, low = 0;
  for (const value of values) {
    const total = high + value;
    low += Math.abs(high) >= Math.abs(value) ? (high - total) + value : (value - total) + high;
    high = total;
  }
  return low !== 0 && Number.isFinite(low) ? high + low : high;
}

// Python round(x, 2): use the exact binary value and ties-to-even, not Math.round.

function roundFinancialHundredth(value) {
  // At this ULP, rounding to hundredths cannot change the original float.
  if (Math.abs(value) >= 2 ** 46) return value;
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const rawExponent = Number((bits >> 52n) & 2047n);
  const exponent = (rawExponent || 1) - 1023 - 52;
  let numerator = ((bits & ((1n << 52n) - 1n)) + (rawExponent ? 1n << 52n : 0n)) * 100n;
  const denominator = exponent < 0 ? 1n << BigInt(-exponent) : 1n;
  if (exponent > 0) numerator <<= BigInt(exponent);
  let rounded = numerator / denominator; const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n)) rounded += 1n;
  return Number(rounded) / 100;
}


async function sha256Text(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}


function bareContractText(text) {
  if (!text.startsWith("{") || !text.endsWith("}\n")) throw new Error("契約JSONの符号化が不正です");
  const members = []; let start = 1, depth = 0, quoted = false, escaped = false;
  for (let index = 1; index < text.length - 2; index += 1) {
    const char = text[index];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) { members.push(text.slice(start, index)); start = index + 1; }
  }
  members.push(text.slice(start, -2));
  const keys = members.map((member) => JSON.parse(member.slice(0, member.indexOf(":"))));
  if (new Set(keys).size !== keys.length || keys.filter((key) => key === "generation_id").length !== 1) throw new Error("契約キーが不正です");
  return `{${members.filter((member, index) => keys[index] !== "generation_id").join(",")}}`;
}


function sameContractValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a).sort(); const other = Object.keys(b).sort();
  return keys.length === other.length && keys.every((key, index) => key === other[index] && sameContractValue(a[key], b[key]));
}


async function validateLandBundle(pointer, manifestText, texts) {
  const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const manifest = JSON.parse(manifestText);
  if (!hex(pointer.generation_id) || !hex(pointer.manifest_sha256) || await sha256Text(manifestText) !== pointer.manifest_sha256 ||
      manifest.schema_version !== 2 || manifest.policy !== "land-financial-evidence-v2" || manifest.generation_id !== pointer.generation_id ||
      !sameContractValue(Object.keys(manifest.files || {}).sort(), LAND_DOCUMENTS) ||
      !manifest.reference_versions || Object.values(manifest.reference_versions).some((value) => typeof value !== "string")) throw new Error("土地manifest検証失敗");
  const ageRefs=manifest.reference_versions;
  if (Object.hasOwn(ageRefs,'financial_max_age_seconds') || Object.hasOwn(ageRefs,'financial_update_warn_seconds')) {
    for(const key of ['financial_max_age_seconds','financial_update_warn_seconds']) {
      const value=Number(ageRefs[key]);
      if(!Number.isInteger(value) || value<1 || value>2592000) throw new Error('Invalid financial freshness policy');
    }
  }
  const files = {}; const bare = [];
  for (const name of LAND_DOCUMENTS) {
    if (!hex(manifest.files[name]) || typeof texts[name] !== "string" || await sha256Text(texts[name]) !== manifest.files[name]) throw new Error("土地ファイルハッシュ不一致");
    const doc = JSON.parse(texts[name]);
    if (doc.generation_id !== pointer.generation_id || doc.schema_version !== (name.startsWith("v1/") ? 1 : 2) ||
        !sameContractValue(doc.reference_versions, manifest.reference_versions)) throw new Error("土地世代・参照版不一致");
    files[name] = doc; bare.push(`${JSON.stringify(name)}:${bareContractText(texts[name])}`);
  }
  const generationText = `{"files":{${bare.join(",")}},"policy":"land-financial-evidence-v2"}\n`;
  if (await sha256Text(generationText) !== pointer.generation_id) throw new Error("土地世代ハッシュ不一致");
  for (const row of files["v2/latest.json"].listings || []) {
    if (!hasConfirmedFinancials(row) && LAND_FINANCIAL_FIELDS.some((key) => row[key] != null)) throw new Error("未確認金融値が確定欄に含まれています");
  }
  const pair = safeLandPair(files["v2/latest.json"], files["v2/history.json"]);
  const stats = files["v2/statistics.json"];
  if (!sameContractValue(stats.summary, pair.latest.summary) || !sameContractValue(stats.towns, pair.latest.towns) ||
      !sameContractValue(stats.history, { summary: pair.history.summary, towns: pair.history.towns })) throw new Error("土地集計の検証失敗");
  safeLandPair(files["v1/latest.json"], files["v1/history.json"]);
  const v1Ids = files["v1/latest.json"].listings.map((row) => row.id).sort();
  const eligibleIds = pair.latest.listings.filter((row) => hasConfirmedFinancials(row) && row.display_status !== "duplicate").map((row) => row.id).sort();
  if (!sameContractValue(v1Ids, eligibleIds)) throw new Error("v1/v2物件集合不一致");
  for (const row of files["v1/latest.json"].listings) {
    const matching = pair.latest.listings.find((item) => item.id === row.id);
    if (!hasConfirmedFinancials(row) || !matching || !hasConfirmedFinancials(matching) ||
        LAND_FINANCIAL_FIELDS.some((key) => row[key] !== matching[key])) throw new Error("v1/v2金融値不一致");
  }
  for (const entry of files["v1/history.json"].listings) {
    const matching = pair.history.listings.find((item) => item.id === entry.id);
    if (!financialEvidence(entry.latest) || !matching || LAND_FINANCIAL_FIELDS.some((key) => entry.latest[key] !== matching.latest[key])) throw new Error("v1/v2履歴不一致");
  }
  // Any unverified history removed by normalization invalidates a signed v2 contract.
  if (files["v2/history.json"].listings.some((entry, index) => !sameContractValue(entry.price_history || [], pair.history.listings[index].price_history))) throw new Error("未確認の価格履歴です");
  return { ...pair, manifest, mode: "v2", verified_at: new Date().toISOString(), verified_bundle: { pointer, manifestText, texts } };
}


function hasConfirmedFinancials(listing) {
  return !financialCalculationHeld(listing) && financialEvidence(listing) && (listing.financial_state == null || ["confirmed", "listing_observed"].includes(listing.financial_state));
}


function buildTownRowsFromListings(listings) {
  const groups = new Map();
  listings.forEach((listing) => {
    if (!hasConfirmedFinancials(listing) || numberValue(listing.unit_price_man_per_tsubo) <= 0) return;
    const values = groups.get(listing.town) || [];
    values.push(numberValue(listing.unit_price_man_per_tsubo));
    groups.set(listing.town, values);
  });
  return [...groups.entries()].map(([town, values]) => ({
    town,
    listing_count: values.length,
    average_unit_price_man_per_tsubo: financialMean(values),
    minimum_unit_price_man_per_tsubo: Math.min(...values),
    maximum_unit_price_man_per_tsubo: Math.max(...values),
  }));
}


function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}


const CACHE_PREFIX = 'land-verified-c2-';
const READER_PREFIX = 'land-reader-c2-';
const READER_DESCRIPTOR = 'reader-shell.json';
const CONTROL_CACHE = 'land-release-control-c2';
const CONTROL_URL = new URL('.land-cache/control.json', self.registration.scope).href;
const CLIENT_PROTOCOL = 'land-viewer-c2';
let preparation = Promise.resolve();
const verifiedPackages = new Map();

function localURL(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..' || part === '.git' || part.startsWith('review-')) || /[%?#\\]/.test(name)) throw new Error('Unsafe release path');
  return new URL(name, self.registration.scope).href;
}

function correctType(name, response) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (name.endsWith('.json')) return ['application/json', 'application/manifest+json'].includes(type);
  if (name.endsWith('.js')) return ['application/javascript', 'text/javascript'].includes(type);
  if (name.endsWith('.css')) return type === 'text/css';
  if (name.endsWith('.html')) return type === 'text/html';
  if (name.endsWith('.md')) return ['text/plain', 'text/markdown'].includes(type);
  return false;
}

async function validatedText(name, response, expected) {
  if (!response || !response.ok || !correctType(name, response)) throw new Error('HTTP or Content-Type validation failed');
  const text = new TextDecoder('utf-8', {fatal:true}).decode(await response.clone().arrayBuffer());
  if (name.endsWith('.json')) JSON.parse(text);
  if (expected && await sha256Text(text) !== expected) throw new Error('Release file hash mismatch');
  return text;
}

async function control() {
  const response = await (await caches.open(CONTROL_CACHE)).match(CONTROL_URL);
  if (!response) return {current:null, available:[], clients:{}};
  const value = await response.json();
  if (!Array.isArray(value.available) || typeof value.clients !== 'object') throw new Error('Cache registry is invalid');
  return value;
}

async function saveControl(value) {
  await (await caches.open(CONTROL_CACHE)).put(CONTROL_URL, new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}}));
}

function serialized(task) {
  const next = preparation.catch(() => {}).then(task);
  preparation = next;
  return next;
}

async function verifyPackage(releaseText, responses) {
  const release = JSON.parse(releaseText);
  const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (release.schema_version !== 1 || !hex(release.generation_id) || !release.files || !/^[a-f0-9]{40}$/.test(release.source_revision || '')) throw new Error('Invalid release metadata');
  const privatePreview = release.private_only === true && release.publication_authorized === false && release.references?.private_preview === 'true';
  if ((release.private_only || release.references?.private_preview) && (!privatePreview || !['127.0.0.1','localhost','[::1]'].includes(new URL(self.registration.scope).hostname))) throw new Error('Private preview is loopback-only');
  const names = Object.keys(release.files);
  const required = ['index.html','app.js','styles.css','history.html','history.js','service-worker.js','manifest.json','latest.json','history.json','fixed-asset-route-values.json','viewer-contracts/current.json'];
  if (required.some(name => !names.includes(name)) || names.some(name => !hex(release.files[name]))) throw new Error('Incomplete release');
  const texts = {};
  for (const name of names) {
    localURL(name);
    texts[name] = await validatedText(name, responses[name], release.files[name]);
  }
  // A new worker only declares a C2 shell after verifying its actual producer bytes.
  if (!texts['app.js'].includes('const LAND_CLIENT_PROTOCOL = "land-viewer-c2";')) throw new Error('Unsupported viewer shell protocol');
  const pointer = JSON.parse(texts['viewer-contracts/current.json']);
  if (pointer.generation_id !== release.generation_id) throw new Error('Release/pointer generation mismatch');
  const prefix = `viewer-contracts/generations/${release.generation_id}/`;
  const manifestText = texts[`${prefix}manifest.json`];
  const docs = Object.fromEntries(LAND_DOCUMENTS.map(name => [name,texts[prefix+name]]));
  const pair = await validateLandBundle(pointer, manifestText, docs);
  if (!pair.latest.summary.financial_listing_count && !privatePreview) throw new Error('Empty v1 publication is blocked');
  if (texts['latest.json'] !== docs['v1/latest.json'] || texts['history.json'] !== docs['v1/history.json']) throw new Error('Legacy URLs must remain safe v1');
  if (pair.manifest.reference_versions.source_revision !== release.source_revision) throw new Error('Source revision mismatch');
  for (const name of ['fixed-asset-route-values.json','route-values.json']) {
    if (!(name in texts)) continue;
    const expected = pair.manifest.reference_versions[`${name.slice(0,-5)}_sha256`];
    if (!hex(expected) || await sha256Text(texts[name]) !== expected || texts[prefix+'references/'+name] !== texts[name]) throw new Error('Reference generation mismatch');
  }
  const fixed = JSON.parse(texts['fixed-asset-route-values.json']);
  if (fixed.schema_version !== 1 || !Array.isArray(fixed.items) || fixed.updated_at !== release.fixed_updated_at) throw new Error('Fixed asset metadata mismatch');
  const expectedReferences = Object.fromEntries(Object.entries(pair.manifest.reference_versions).filter(([name]) => !['source_latest_sha256','source_history_sha256'].includes(name)));
  if (!sameContractValue(release.references, expectedReferences)) throw new Error('Reference versions mismatch');
  return {release, texts};
}

async function verifyReader(text, responses) {
  const doc = JSON.parse(text);
  const names = ['app.js','history.html','history.js','index.html','manifest.json','service-worker.js','styles.css'];
  if (doc.schema_version !== 1 || doc.protocol !== CLIENT_PROTOCOL ||
      !sameContractValue(Object.keys(doc.files || {}).sort(), names)) throw new Error('Reader shell incomplete');
  const texts = {};
  for (const name of names) {
    if (!/^[a-f0-9]{64}$/.test(doc.files[name])) throw new Error('Reader shell hash invalid');
    texts[name] = await validatedText(name,responses[name],doc.files[name]);
  }
  if (!texts['app.js'].includes('const LAND_CLIENT_PROTOCOL = "land-viewer-c2";')) throw new Error('Reader protocol mismatch');
  return doc;
}

async function readReader(name) {
  const cache = await caches.open(name);
  const marker = await (await cache.match(localURL('.land-cache/verified.json')))?.json();
  const descriptor = await cache.match(localURL(READER_DESCRIPTOR));
  const text = await validatedText(READER_DESCRIPTOR,descriptor);
  if (!marker || marker.kind !== 'reader' || await sha256Text(text) !== marker.shell_hash) throw new Error('Reader cache unverified');
  const doc = JSON.parse(text);const responses = {};
  for (const path of Object.keys(doc.files || {})) responses[path] = await cache.match(localURL(path));
  await verifyReader(text,responses);
  return {kind:'reader',name,cache,marker,release:{generation_id:'reader-'+marker.shell_hash,files:doc.files}};
}

async function prepareReader() {
  const registry = await control();
  if (registry.available.some(name=>name.startsWith(CACHE_PREFIX))) throw new Error('Verified v2 cannot downgrade to legacy');
  const descriptor = await fetch(localURL(READER_DESCRIPTOR),{cache:'no-store'});
  const text = await validatedText(READER_DESCRIPTOR,descriptor);const doc=JSON.parse(text);const responses={};
  for (const [path,hash] of Object.entries(doc.files || {})) {
    const response=await fetch(localURL(path),{cache:'no-store'});
    await validatedText(path,response,hash);responses[path]=response;
  }
  await verifyReader(text,responses);
  const hash=await sha256Text(text),name=READER_PREFIX+hash,cache=await caches.open(name);
  for (const [path,response] of Object.entries(responses)) await cache.put(localURL(path),response.clone());
  await cache.put(localURL(READER_DESCRIPTOR),descriptor.clone());
  await cache.put(localURL('.land-cache/verified.json'),new Response(JSON.stringify({kind:'reader',shell_hash:hash,verified_at:new Date().toISOString()}),{headers:{'Content-Type':'application/json'}}));
  await readReader(name);
  const changed=registry.current!==name;registry.current=name;
  registry.available=[name,...registry.available.filter(item=>item!==name)];await saveControl(registry);
  return {protocol:CLIENT_PROTOCOL,mode:'legacy-reader',cache:name,generation_id:'reader-'+hash,changed};
}

const legacyFlights = new Map();
async function readerPair(selected) {
  const active=legacyFlights.get(selected.name);
  if (active && Date.now()<active.until) return active.promise;
  const next=(async()=>{
    const key=localURL('.land-cache/legacy-pair.json');
    try {
      const responses=await Promise.all(['latest.json','history.json'].map(name=>fetch(localURL(name),{cache:'no-store'})));
      const texts=await Promise.all(responses.map((response,i)=>validatedText(i?'history.json':'latest.json',response)));
      const values=texts.map(JSON.parse);
      if (values.some(doc=>doc.schema_version!==1 || doc.generation_id)) throw new Error('Legacy reader cannot adopt a new generation without a release');
      safeLegacyLandPair(...values);
      const record={texts,hashes:await Promise.all(texts.map(sha256Text)),verified_at:new Date().toISOString()};
      // One cache record commits the pair atomically; no separate JSON cache writes.
      await selected.cache.put(key,new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));
      return {...record,stale:false};
    } catch(error) {
      const cached=await selected.cache.match(key);if (!cached) throw error;
      const record=await cached.json();
      if (!Array.isArray(record.texts) || record.texts.length!==2 || !sameContractValue(record.hashes,await Promise.all(record.texts.map(sha256Text)))) throw new Error('Legacy cached pair hash mismatch');
      const values=record.texts.map(JSON.parse);
      if (values.some(doc=>doc.schema_version!==1 || doc.generation_id)) throw new Error('Invalid cached legacy pair');
      safeLegacyLandPair(...values);return {...record,stale:true};
    }
  })();
  const entry={promise:next,until:Infinity};legacyFlights.set(selected.name,entry);
  next.finally(()=>{entry.until=Date.now()+50;setTimeout(()=>{if(legacyFlights.get(selected.name)===entry)legacyFlights.delete(selected.name);},50);}).catch(()=>{});
  return next;
}

async function serveReader(event,selected,name) {
  if (name==='latest.json' || name==='history.json') {
    const pair=await readerPair(selected),index=name==='latest.json'?0:1;
    return new Response(pair.texts[index],{status:200,headers:{'Content-Type':'application/json',
      'X-Land-Legacy-Snapshot':pair.hashes.join('-'),'X-Land-Verified-At':pair.verified_at,
      'X-Land-Data-Stale':pair.stale?'1':'0'}});
  }
  if (name===READER_DESCRIPTOR || name in selected.release.files) {
    const response=await selected.cache.match(localURL(name));
    await validatedText(name,response,name===READER_DESCRIPTOR?selected.marker.shell_hash:selected.release.files[name]);
    return response;
  }
  let response;
  try { response=await fetch(event.request); }
  catch(error) {
    // A verified reader shell predates public contracts. Remember their absence,
    // so offline startup can use the atomically cached, still-unconfirmed pair.
    if (name==='viewer-contracts/release.json' || name==='viewer-contracts/current.json')
      return new Response(JSON.stringify({error:'Public contract absent in reader mode'}),{status:404,headers:{'Content-Type':'application/json'}});
    throw error;
  }
  if (name.endsWith('.json') && response.status!==404) await validatedText(name,response);
  return response;
}

async function readVerified(name, full = false) {
  if (!full && verifiedPackages.has(name)) return verifiedPackages.get(name);
  if (name?.startsWith(READER_PREFIX)) return readReader(name);
  if (!name || !name.startsWith(CACHE_PREFIX) || !(await caches.keys()).includes(name)) throw new Error('No verified cache');
  const cache = await caches.open(name);
  const markerResponse = await cache.match(localURL('.land-cache/verified.json'));
  if (!markerResponse) throw new Error('Incomplete cache');
  const marker = await markerResponse.json();
  const releaseResponse = await cache.match(localURL('viewer-contracts/release.json'));
  const releaseText = await validatedText('viewer-contracts/release.json', releaseResponse);
  if (await sha256Text(releaseText) !== marker.release_hash) throw new Error('Cached release mismatch');
  const release = JSON.parse(releaseText);
  const responses = {};
  for (const path of Object.keys(release.files || {})) responses[path] = await cache.match(localURL(path));
  await verifyPackage(releaseText, responses);
  const selected = {cache, release, marker, name};
  verifiedPackages.set(name, selected);
  return selected;
}

async function fetchReleaseResource(path, progress) {
  const controller = new AbortController();
  let idle;
  const activity = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(), 15000); };
  activity();
  try {
    const response = await fetch(localURL(path), {cache:'no-store', signal:controller.signal});
    const reader = response.body?.getReader();
    if (!reader) return response;
    const chunks = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length; activity();
    }
    progress({state:'downloading', bytes:size});
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new Response(bytes, {status:response.status, headers:response.headers});
  } finally { clearTimeout(idle); }
}

async function prepareRelease(progress) {
  progress = typeof progress === 'function' ? progress : () => {};
  const descriptor = await fetchReleaseResource('viewer-contracts/release.json', progress);
  if (descriptor.status===404) return prepareReader();
  const releaseText = await validatedText('viewer-contracts/release.json', descriptor);
  const release = JSON.parse(releaseText);
  const responses = {};
  // Consume each response before opening the next stream; this also bounds fetch pressure.
  const names = Object.keys(release.files || {}); let completed = 0;
  for (const name of names) {
    progress({state:'fetching', completed, total:names.length});
    const response = await fetchReleaseResource(name, detail => progress({...detail,completed,total:names.length}));
    await validatedText(name, response, release.files[name]);
    responses[name] = new Response(await response.arrayBuffer(), {status:response.status, headers:response.headers});
    completed++;
  }
  progress({state:'verifying',completed,total:names.length});
  await verifyPackage(releaseText, responses);
  const releaseHash = await sha256Text(releaseText);
  const name = CACHE_PREFIX + releaseHash;
  const cache = await caches.open(name);
  // A failed write leaves an unselectable candidate; the previous verified cache stays intact.
  completed = 0;
  for (const [path,response] of Object.entries(responses)) {
    progress({state:'caching',completed,total:names.length});
    await cache.put(localURL(path), response.clone()); completed++;
  }
  await cache.put(localURL('viewer-contracts/release.json'), descriptor.clone());
  await cache.put(localURL('.land-cache/verified.json'), new Response(JSON.stringify({release_hash:releaseHash, verified_at:new Date().toISOString()}), {headers:{'Content-Type':'application/json'}}));
  await readVerified(name);
  const registry = await control();
  const changed = registry.current !== name;
  registry.current = name;
  registry.available = [name,...registry.available.filter(item => item !== name)];
  await saveControl(registry);
  return {protocol:CLIENT_PROTOCOL, cache:name, generation_id:release.generation_id, changed};
}

async function selectVerified(clientId, navigation = false, full = false) {
  const registry = await control();
  const pinned = !navigation && clientId && registry.clients[clientId];
  const candidates = pinned ? [pinned] : [registry.current,...registry.available];
  for (const name of [...new Set(candidates.filter(Boolean))]) {
    try {
      const selected = await readVerified(name, full || navigation);
      if (clientId && registry.clients[clientId] !== name) {
        registry.clients[clientId] = name;
        await saveControl(registry);
      }
      return selected;
    } catch (error) { verifiedPackages.delete(name); /* A partial/corrupt cache is never used. No cache is deleted. */ }
  }
  throw new Error('Verified complete release unavailable');
}

function failure() {
  return new Response(JSON.stringify({error:'Verified data unavailable'}), {status:503, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}

async function serve(event) {
  const url = new URL(event.request.url);
  const relative = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  const navigation = event.request.mode === 'navigate';
  const name = navigation ? (relative === 'history.html' ? 'history.html' : 'index.html') : relative;
  try {
    const selected = await serialized(() => selectVerified(navigation ? event.resultingClientId : event.clientId, navigation));
    if (selected.kind==='reader') return serveReader(event,selected,name);
    if (name === 'viewer-contracts/release.json' || name in selected.release.files) {
      const response = await selected.cache.match(localURL(name));
      await validatedText(name, response, selected.release.files[name]);
      const headers = new Headers(response.headers);
      headers.set('X-Land-Generation', selected.release.generation_id);
      headers.set('X-Land-Verified-At', selected.marker.verified_at);
      return new Response(await response.arrayBuffer(), {status:200,headers});
    }
    // Unknown requests are never entered into the verified cache and JSON never falls back to HTML.
    const response = await fetch(event.request);
    if (name.endsWith('.json')) await validatedText(name, response);
    return response;
  } catch (error) { return failure(); }
}

self.addEventListener('install', event => {
  // No automatic skipWaiting, deletion of old caches, or unverified cache.addAll.
  event.waitUntil(serialized(prepareRelease));
});
self.addEventListener('activate', event => {
  event.waitUntil(serialized(() => selectVerified(null)));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(serve(event));
});
self.addEventListener('message', event => {
  // Progress is opt-in: old cached JavaScript must receive only its final reply.
  const protocol = 'land-worker-progress-v1';
  const streaming = event.data?.progress_protocol === protocol;
  let state = {state:'queued'};
  const report = detail => { state = {...state,...detail}; if (streaming) event.ports[0]?.postMessage({progress_protocol:protocol,phase:'progress',...state}); };
  const heartbeat = streaming ? setInterval(() => report(state), 1000) : null;
  const answer = value => {
    clearInterval(heartbeat);
    event.ports[0]?.postMessage(streaming ? (value?.error ? {progress_protocol:protocol,phase:'error',error:value.error} : {progress_protocol:protocol,phase:'complete',result:value}) : value);
  };
  report(state);
  if (event.data?.type === 'CHECK_RELEASE') {
    event.waitUntil(serialized(() => prepareRelease(report)).then(answer).catch(() => answer({error:'Release update validation failed'})));
  } else if (event.data?.type === 'CLIENT_INFO') {
    event.waitUntil(serialized(async () => { const known = Boolean((await control()).clients[event.source?.id]); const selected = await selectVerified(event.source?.id, false, true); return {protocol:CLIENT_PROTOCOL,cache:selected.name,generation_id:selected.release.generation_id,mode:selected.kind==='reader'?'legacy-reader':'v2',verified_at:selected.marker.verified_at,needs_reload:!known}; }).then(answer).catch(() => answer({error:'Verified complete release unavailable'})));
  } else if (event.data?.type === 'ACTIVATE_VERIFIED') {
    event.waitUntil(serialized(() => selectVerified(null)).then(() => { answer({protocol:CLIENT_PROTOCOL}); return self.skipWaiting(); }).catch(() => answer({error:'No verified release to activate'})));
  } else { clearInterval(heartbeat); }
});
