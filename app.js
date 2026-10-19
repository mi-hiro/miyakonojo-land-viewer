const LAND_CLIENT_PROTOCOL = "land-viewer-c2";
let landWorkerInfo = null;
let landRequiresVerifiedShell = false;

const LAND_PROGRESS_PROTOCOL = "land-worker-progress-v1";
let landRefreshInFlight = null;

function workerMessage(worker, type, onProgress = null) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('Service Worker unavailable')); return; }
    const channel = new MessageChannel();
    let idleTimer;
    let finished = false;
    const cleanup = () => { clearTimeout(idleTimer); clearTimeout(deadline); channel.port1.close(); worker.removeEventListener?.('statechange', changed); };
    const fail = error => { if (!finished) { finished = true; cleanup(); reject(error); } };
    // The short limit detects a dead worker, not the duration of validation.
    // Only the final verified reply completes the operation; progress never does.
    const alive = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => fail(new Error('Service Worker stopped responding')), 3500); };
    const changed = () => { if (worker.state === 'redundant') fail(new Error('Service Worker was replaced')); };
    const deadline = setTimeout(() => fail(new Error('Service Worker operation did not complete')), 120000);
    worker.addEventListener?.('statechange', changed);
    channel.port1.onmessage = event => {
      const data = event.data;
      if (data?.progress_protocol === LAND_PROGRESS_PROTOCOL) {
        if (data.phase === 'progress') { alive(); if (onProgress) onProgress(data); return; }
        if (data.phase !== 'complete' && data.phase !== 'error') { fail(new Error('Invalid worker progress response')); return; }
        if (data.phase === 'error') { fail(new Error(data.error || 'Release update validation failed')); return; }
        if (!data.result || typeof data.result !== 'object') { fail(new Error('Missing verified worker result')); return; }
        finished = true; cleanup(); resolve(data.result); return;
      }
      // Older installed workers return one final reply and remain compatible.
      if (data?.error) { fail(new Error(data.error)); return; }
      if (!data || typeof data !== 'object' || data.phase) { fail(new Error('Invalid worker result')); return; }
      finished = true; cleanup(); resolve(data);
    };
    alive();
    worker.postMessage({type, progress_protocol: LAND_PROGRESS_PROTOCOL}, [channel.port2]);
  });
}

async function initializeLandData() {
  setStatus("読み込み中");
  try {
    await fetchLandText('./viewer-contracts/release.json');
    landRequiresVerifiedShell = true;
  } catch (error) {
    let cachedC1 = false;
    const stored = localStorage.getItem("miyakonojo_land_verified_v2");
    try { cachedC1 = Boolean(JSON.parse(JSON.parse(stored).manifestText).reference_versions?.source_revision); } catch (cacheError) { /* loadData validates pre-C1 caches independently. */ }
    if (cachedC1) landRequiresVerifiedShell = true;
    else {
      if (error.status !== 404 && !stored) {
        setStatus('配信記録を取得・検証できません。査定を開始できません。');
        els.resultCount.textContent = '取得不能';
        els.listingList.innerHTML = '<div class="empty-state">土地データ取得不能</div>';
        return;
      }
      // Only pre-C1 preview/legacy data may use the evidence-only compatibility path.
      await loadData();
      installLegacyReader().catch(()=>{});
      return;
    }
  }
  if (!('serviceWorker' in navigator)) {
    setStatus('検証済みアプリ一式を利用できません。査定を開始できません。');
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', {updateViaCache:'none'});
    if (registration.installing) {
      await new Promise((resolve,reject) => {
        const worker = registration.installing;
        const timeout = setTimeout(() => reject(new Error('Worker installation timed out')), 15000);
        const check = () => {
          if (worker.state === 'installed' || worker.state === 'activated') { clearTimeout(timeout); resolve(); }
          else if (worker.state === 'redundant') { clearTimeout(timeout); reject(new Error('Worker validation failed')); }
        };
        worker.addEventListener('statechange', check); check();
      });
    }
    if (registration.waiting) {
      const next = registration.waiting;
      await workerMessage(next, 'ACTIVATE_VERIFIED');
      if (next.state !== 'activated') await new Promise((resolve,reject) => {
        const timeout = setTimeout(() => reject(new Error('Worker activation timed out')), 8000);
        const check = () => {
          if (next.state === 'activated') { clearTimeout(timeout); resolve(); }
          else if (next.state === 'redundant') { clearTimeout(timeout); reject(new Error('Worker activation failed')); }
        };
        next.addEventListener('statechange',check); check();
      });
    }
    const ready = await navigator.serviceWorker.ready;
    landWorkerInfo = await workerMessage(ready.active, 'CLIENT_INFO');
    if (landWorkerInfo.protocol !== LAND_CLIENT_PROTOCOL) throw new Error('Shell protocol mismatch');
    if (!navigator.serviceWorker.controller || landWorkerInfo.needs_reload) {
      const key = 'land_c2_initial_reload';
      if (sessionStorage.getItem(key) === landWorkerInfo.cache) throw new Error('Verified shell is not controlling this page');
      sessionStorage.setItem(key, landWorkerInfo.cache);
      window.location.reload();
      return;
    }
    sessionStorage.removeItem('land_c2_initial_reload');
    await loadData();
  } catch (error) {
    setStatus('アプリ・データ一式の検証が完了していません。最後の検証済みアプリで再読み込みするか、通信復帰後に更新してください。');
    els.resultCount.textContent = '取得不能';
  }
}

async function installLegacyReader() {
  if (!('serviceWorker' in navigator)) return;
  const registration=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});
  if (registration.installing) await new Promise((resolve,reject)=>{
    const worker=registration.installing;const timeout=setTimeout(()=>reject(new Error('Reader install timed out')),12000);
    worker.addEventListener('statechange',()=>{if(worker.state==='installed'||worker.state==='activated'){clearTimeout(timeout);resolve();}else if(worker.state==='redundant'){clearTimeout(timeout);reject(new Error('Reader shell verification failed'));}});
  });
  if (registration.waiting) await workerMessage(registration.waiting,'ACTIVATE_VERIFIED');
}

async function refreshLandViewer() {
  if (landRefreshInFlight) return landRefreshInFlight;
  const button = document.getElementById('refreshButton');
  if (button) button.disabled = true;
  landRefreshInFlight = performLandRefresh().finally(() => {
    landRefreshInFlight = null;
    if (button) button.disabled = false;
  });
  return landRefreshInFlight;
}

async function performLandRefresh() {
  if (landRequiresVerifiedShell) {
    try {
      const result = await workerMessage(navigator.serviceWorker.controller, 'CHECK_RELEASE', progress => {
        const labels = {queued:'待機',fetching:'取得',downloading:'受信',verifying:'整合性検証',caching:'保存'};
        const count = Number.isInteger(progress.completed) && Number.isInteger(progress.total) ? ` ${progress.completed}/${progress.total}` : '';
        setStatus(`更新を検証中（${labels[progress.state] || '検証'}${count}）— 完了まで現在の検証済み表示を保持します。`);
      });
      if (result.cache !== landWorkerInfo?.cache) { window.location.reload(); return; }
      await loadData();
    } catch (error) {
      await loadData();
      state.dataStale = true;
      setStatus(`更新を検証できません。最後の検証済み一式（取得 ${formatDateTime(landWorkerInfo?.verified_at)}）を表示しています。`);
    }
  } else await loadData();
}

// Gate A's five-document contract is verified before any financial data is used.
const LAND_DOCUMENTS = ["v1/history.json", "v1/latest.json", "v2/history.json", "v2/latest.json", "v2/statistics.json"];
const LAND_FINANCIAL_FIELDS = ["price_man_yen", "land_area_sqm", "land_area_tsubo", "unit_price_man_per_tsubo"];
let lastVerifiedLand = null;
let landLoadSequence = 0;

function declaredFinancialFieldsValid(record) {
  return Boolean(record && typeof record.source === "string" && record.source &&
    typeof (record.source_url || record.id) === "string" && (record.source_url || record.id) &&
    ["detail_confirmed", "listing_observed"].includes(record.financial_status) &&
    (record.source !== "LIFULL HOME'S" || record.financial_status === "detail_confirmed") &&
    validFinancialTimestamp(record.financial_checked_at) &&
    [record.price_man_yen, record.land_area_sqm, record.unit_price_man_per_tsubo]
      .every((value) => typeof value === "number" && Number.isFinite(value) && value > 0));
}

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

// Reader-first legacy migration: tags alone are not request evidence.
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


function financialEvidence(record) {
  return declaredFinancialFieldsValid(record) && requestReceiptVerified(record);
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
    if (latest.collection_id && row.verification_evidence.collection_id !== latest.collection_id) throw new Error("現在の収集と確認証跡が一致しません");
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

// Clock-based display policy is separate from immutable cryptographic validation.
// Cached bytes stay verifiable; expired values are never current appraisal inputs.
function financialFreshnessSettings(pair) {
  const refs = pair?.manifest?.reference_versions || pair?.latest?.reference_versions || {};
  if (!Object.hasOwn(refs, "financial_max_age_seconds")) {if(Object.hasOwn(refs,"financial_update_warn_seconds")) throw new Error("金融値鮮度設定が不完全です");return null;}
  const age = Number(refs.financial_max_age_seconds), warn = Number(refs.financial_update_warn_seconds);
  if (!Number.isInteger(age) || age < 1 || age > 2592000 || !Number.isInteger(warn) || warn < 1 || warn > 2592000) throw new Error("金融値鮮度設定が不正です");
  return {maxAge: age, warnAfter: warn, provisional: refs.financial_freshness_provisional === "true"};
}

function financialFreshnessProjection(pair, nowMs = Date.now()) {
  const settings = financialFreshnessSettings(pair);
  const expired = [];
  const rows = pair.latest.listings.map(row => {
    if (!hasConfirmedFinancials(row) || !settings) return {...row};
    const age = (nowMs - Date.parse(row.financial_checked_at)) / 1000;
    if (Number.isFinite(age) && age >= 0 && age <= settings.maxAge) return {...row};
    expired.push(row.id);
    return {...row, ...Object.fromEntries(LAND_FINANCIAL_FIELDS.map(key => [key,null])),
      last_confirmed: {...row,financial_state:"past_confirmed"}, financial_status:"pending",financial_state:"pending",
      financial_checked_at:row.financial_checked_at, detail_pending_reason:"financial_confirmation_expired", is_cheap_new:false};
  });
  const generationAge = (nowMs-Date.parse(pair.latest.generated_at))/1000;
  return {latest:{...pair.latest,listings:rows,...financialStatistics(rows)},history:pair.history,
    expired, updateStopped:Boolean(settings && (!Number.isFinite(generationAge) || generationAge<0 || generationAge>settings.warnAfter)),
    settings};
}

function refreshFinancialFreshness() {
  if (!state.financialSourcePair) return;
  const previousExpiry = JSON.stringify(state.financialFreshness?.expired || []);
  const projected = financialFreshnessProjection(state.financialSourcePair);
  state.latest = projected.latest; state.history = projected.history;
  state.listings = projected.latest.listings.filter(row=>row.display_status!=="duplicate").map(normalizeListing);
  state.financialFreshness = projected;
  const message = projected.expired.length ? `最終確認から期限を過ぎた価格 ${projected.expired.length}件は価格確認中／査定保留です。` : "";
  const stopped = projected.updateStopped ? "土地データの更新が停止しています。生成日時は金融値の確認日時とは異なります。" : "";
  const note = projected.settings?.provisional ? "鮮度期限は検証用の暫定値です（本番採用未承認）。" : !projected.settings ? "鮮度期限は未設定です。金融値の最終確認日時を確認してください。" : "";
  let warning = document.getElementById("financialFreshnessWarning");
  if (!warning) {warning=document.createElement("p");warning.id="financialFreshnessWarning";warning.setAttribute("role","status");els.resultCount.parentNode.insertBefore(warning,els.resultCount);}
  warning.textContent=[message,stopped,note].filter(Boolean).join(" ");
  if (state.view === "detail" && state.currentDetailId && previousExpiry !== JSON.stringify(projected.expired)) {
    const listing = state.listings.find(row=>row.id===state.currentDetailId);
    const detailRoot=els.detailPageBody || els.detailBody;
    if (listing && detailRoot) {detailRoot.innerHTML=renderDetail(listing);bindDetailControls(listing,detailRoot);renderDetailMap(listing);}
  }
}

// Wall-clock expiry also applies to a tab kept open or resumed offline.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  setInterval(()=>{if(state.financialSourcePair){refreshFinancialFreshness();render();}},60000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden && state.financialSourcePair){refreshFinancialFreshness();render();}});
}

// Cache only inside one synchronous render, then discard in finally.
// Verified aggregates must never survive a new data load or input mutation.
let financialRenderSnapshot = null;
function currentFinancialSnapshots() {
  if (financialRenderSnapshot) return financialRenderSnapshot;
  const rows = state.listings || [];
  return {current: financialStatistics(rows),
    history: historicalFinancialStatistics(state.history?.listings || [], new Set(rows.filter(hasConfirmedFinancials).map(row => row.id)))};
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

async function fetchLandText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) { const error = new Error(`土地データ取得失敗: ${response.status}`); error.status = response.status; throw error; }
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const host = new URL(url, window.location.href).hostname;
  if (!["application/json", "application/manifest+json"].includes(type) && !(host === "raw.githubusercontent.com" && type === "text/plain")) throw new Error("JSONのContent-Typeが不正です");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await response.arrayBuffer());
  return { text, value: JSON.parse(text), verified_at: response.headers.get("X-Land-Verified-At"), snapshot_id: response.headers.get("X-Land-Legacy-Snapshot"), stale: response.headers.get("X-Land-Data-Stale")==="1" };
}

// Preserve Python's numeric lexemes (580.0 is not 580) when hashing the generation.
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
  financialFreshnessSettings({manifest});
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

async function fetchLandPair() {
  const bases = window.location.protocol === "file:" ? ["./", RAW_BASE] : ["./"]; // Keep web data within one publication origin.
  let absent = true;
  for (const base of bases) {
    let pointer;
    try { pointer = (await fetchLandText(`${base}viewer-contracts/current.json`)).value; }
    catch (error) { if (error.status === 404) continue; absent = false; throw error; }
    absent = false;
    if (!/^[a-f0-9]{64}$/.test(pointer?.generation_id)) throw new Error("世代ポインタが不正です");
    const path = `${base}viewer-contracts/generations/${pointer.generation_id}/`;
    const manifest = await fetchLandText(`${path}manifest.json`);
    const documents = await Promise.all(LAND_DOCUMENTS.map(async (name) => [name, (await fetchLandText(`${path}${name}`)).text]));
    const pair = await validateLandBundle(pointer, manifest.text, Object.fromEntries(documents));
    if (pair.manifest.reference_versions.source_revision && !landRequiresVerifiedShell) throw new Error("公開v2には検証済み配信一式が必要です");
    if (pair.manifest.reference_versions.private_preview === "true" && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(window.location.href).hostname)) throw new Error("非公開プレビューはローカル環境限定です");
    pair.data_base = base;
    pair.generation_path = path;
    if (landRequiresVerifiedShell && pair.manifest.generation_id !== landWorkerInfo?.generation_id) throw new Error("アプリとデータの世代が一致しません");
    if (manifest.verified_at) pair.verified_at = manifest.verified_at;
    return pair;
  }
  if (!absent) throw new Error("v2土地データが利用できません");
  for (const base of bases) {
    try {
      const [latest, history] = await Promise.all([fetchLandText(`${base}latest.json`), fetchLandText(`${base}history.json`)]);
      if (latest.value.schema_version !== 1 || history.value.schema_version !== 1) throw new Error("v2は世代一式の検証が必要です");
      if ((latest.snapshot_id || history.snapshot_id) && latest.snapshot_id!==history.snapshot_id) throw new Error('旧データのスナップショットが一致しません');
      return { ...safeLegacyLandPair(latest.value, history.value), mode: "legacy", stale:latest.stale||history.stale, verified_at:latest.verified_at || new Date().toISOString() };
    } catch (error) { if (base === bases.at(-1)) throw error; }
  }
}

function compareFinancialNumber(a, b, field, descending = false) {
  const valid = (row) => hasConfirmedFinancials(row) && typeof row[field] === "number" && Number.isFinite(row[field]) && row[field] > 0;
  if (!valid(a) || !valid(b)) return valid(a) ? -1 : valid(b) ? 1 : 0;
  return (a[field] - b[field]) * (descending ? -1 : 1);
}

function formatMeasure(value, suffix) {
  return value == null ? "未確認" : `${formatNumber(value)}${suffix}`;
}

function formatAssessmentScore(score) {
  return score == null ? "査定保留" : `${formatInteger(score)}点`;
}

const RAW_BASE =
  "https://raw.githubusercontent.com/mi-hiro/miyakonojo-land-viewer/main/";

const CITY_CENTER = [31.7196, 131.0616];
const CITY_BOUNDS = [
  [31.55, 130.75],
  [31.98, 131.25],
];
const TSUBO_SQM = 3.305785;
const LIST_PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_LIST_PAGE_SIZE = 20;
const FIXED_ASSET_ROUTE_VALUE_RATIO = 0.7;
const INHERITANCE_TAX_ROUTE_VALUE_RATIO = 0.8;
const LAND_DIAGRAM_IMAGE_TERMS = [
  "区画",
  "区画図",
  "区画割",
  "土地図",
  "敷地",
  "敷地図",
  "配置図",
  "公図",
  "測量図",
  "地積測量",
  "図面",
  "案内図",
  "地形図",
  "造成図",
  "plan",
  "plot",
  "parcel",
  "lot",
  "layout",
  "survey",
  "drawing",
  "cadastre",
];
const PERSON_CHARACTER_IMAGE_TERMS = [
  "人物",
  "人物写真",
  "顔写真",
  "スタッフ",
  "担当者",
  "営業担当",
  "社員",
  "代表者",
  "キャラクター",
  "マスコット",
  "イメージキャラクター",
  "アバター",
  "似顔絵",
  "営業",
  "プロフィール",
  "顔",
  "店長",
  "社長",
  "代表",
  "相談員",
  "案内人",
];
const PERSON_CHARACTER_IMAGE_PATTERN =
  /(?:^|[/_.-])(?:person|people|human|portrait|profile|prof|avatar|staff|member|owner|agent|sales|manager|president|ceo|mascot|character|chara|anime|cartoon|face|headshot|smile|realtor|tantou|eigyo|tencho)(?:[/_.-]|$)/i;
const STORAGE_KEYS = {
  favorites: "miyakonojo_land_favorites_v1",
  candidates: "miyakonojo_land_candidates_v1",
  excluded: "miyakonojo_land_excluded_v1",
  notes: "miyakonojo_land_notes_v1",
  listLayout: "miyakonojo_land_list_layout_v1",
  listPageSize: "miyakonojo_land_list_page_size_v1",
  mapLayerType: "miyakonojo_land_map_layer_type_v1",
  hiddenImages: "miyakonojo_land_hidden_images_v1",
  deviceMode: "miyakonojo_land_device_mode_v1",
  showHazardAreas: "miyakonojo_land_show_hazard_areas_v1",
  showFixedAssetCoverage: "miyakonojo_land_show_fixed_asset_coverage_v1",
  notificationsEnabled: "miyakonojo_land_notifications_enabled_v1",
  lastNotifiedAt: "miyakonojo_land_last_notified_at_v1",
};

const JAPANESE_TEXT_COLLATOR = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

const MAP_LAYER_DEFS = {
  standard: {
    label: "地図",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  satellite: {
    label: "航空写真",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
};

const TOWN_COORDS = {
  "安久町": [31.6505, 131.098],
  "一万城町": [31.7215, 131.087],
  "栄町": [31.735, 131.075],
  "横市町": [31.744, 131.002],
  "乙房町": [31.793, 131.015],
  "下水流町": [31.807, 131.085],
  "下川東": [31.748, 131.068],
  "下長飯町": [31.681, 131.026],
  "夏尾町": [31.865, 130.862],
  "菓子野町": [31.822, 131.02],
  "関之尾町": [31.797, 130.95],
  "丸谷町": [31.827, 131.0],
  "吉之元町": [31.902, 130.82],
  "久保原町": [31.717, 131.0],
  "宮丸町": [31.723, 131.057],
  "郡元町": [31.75, 131.075],
  "五十町": [31.695, 131.0],
  "広原町": [31.732, 131.091],
  "甲斐元町": [31.714, 131.055],
  "高崎町江平": [31.942, 131.085],
  "高崎町前田": [31.888, 131.015],
  "高崎町大牟田": [31.872, 131.062],
  "高崎町東霧島": [31.907, 130.967],
  "高崎町縄瀬": [31.887, 130.985],
  "高城町高城": [31.805, 131.122],
  "高城町桜木": [31.775, 131.142],
  "高城町四家": [31.85, 131.18],
  "高城町石山": [31.808, 131.168],
  "高城町大井手": [31.79, 131.135],
  "高城町穂満坊": [31.783, 131.112],
  "高城町有水": [31.89, 131.16],
  "高木町": [31.786, 131.102],
  "今町": [31.652, 130.995],
  "山田町山田": [31.78, 130.995],
  "山田町中霧島": [31.821, 131.026],
  "山之口町花木": [31.74, 131.16],
  "山之口町富吉": [31.737, 131.205],
  "志比田町": [31.733, 131.032],
  "若葉町": [31.719, 131.082],
  "祝吉": [31.745, 131.078],
  "庄内町": [31.779, 130.972],
  "菖蒲原町": [31.732, 131.085],
  "上川東": [31.742, 131.075],
  "上長飯町": [31.705, 131.083],
  "前田町": [31.729, 131.07],
  "早水町": [31.742, 131.1],
  "早鈴町": [31.715, 131.072],
  "太郎坊町": [31.786, 131.072],
  "大王町": [31.727, 131.051],
  "大岩田町": [31.654, 131.028],
  "鷹尾": [31.71, 131.017],
  "都原町": [31.733, 131.004],
  "都島町": [31.704, 131.04],
  "都北町": [31.774, 131.072],
  "南横市町": [31.716, 131.0],
  "南鷹尾町": [31.707, 131.018],
  "梅北町": [31.61, 131.063],
  "美川町": [31.756, 130.93],
  "姫城町": [31.717, 131.062],
  "平江町": [31.733, 131.067],
  "平塚町": [31.697, 130.992],
  "豊満町": [31.652, 131.14],
  "蓑原町": [31.718, 130.99],
  "野々美谷町": [31.822, 131.065],
  "立野町": [31.726, 131.098],
};

const TOWN_READING_ORDER = {
  "菖蒲原町": "あやめばるちょう",
  "一万城町": "いちまんじょうちょう",
  "五十町": "いそまち",
  "今町": "いままち",
  "祝吉": "いわよし",
  "梅北町": "うめきたちょう",
  "大岩田町": "おおいわだちょう",
  "大王町": "だいおうちょう",
  "乙房町": "おとぼうちょう",
  "甲斐元町": "かいもとちょう",
  "菓子野町": "かしのちょう",
  "上川東": "かみかわひがし",
  "上長飯町": "かみながえちょう",
  "久保原町": "くぼばるちょう",
  "郡元町": "こおりもとちょう",
  "栄町": "さかえまち",
  "志比田町": "しびたちょう",
  "下川東": "しもかわひがし",
  "下水流町": "しもづるちょう",
  "下長飯町": "しもながえちょう",
  "庄内町": "しょうないちょう",
  "神之山町": "じんのやまちょう",
  "関之尾町": "せきのおちょう",
  "早鈴町": "はやすずちょう",
  "早水町": "はやみずちょう",
  "前田町": "まえだちょう",
  "高木町": "たかぎちょう",
  "高崎町江平": "たかざきちょうえひら",
  "高崎町大牟田": "たかざきちょうおおむた",
  "高崎町東霧島": "たかざきちょうつまぎりしま",
  "高崎町縄瀬": "たかざきちょうなわぜ",
  "高崎町前田": "たかざきちょうまえだ",
  "高城町有水": "たかじょうちょうありみず",
  "高城町石山": "たかじょうちょういしやま",
  "高城町大井手": "たかじょうちょうおおいで",
  "高城町桜木": "たかじょうちょうさくらぎ",
  "高城町四家": "たかじょうちょうしか",
  "高城町高城": "たかじょうちょうたかじょう",
  "高城町穂満坊": "たかじょうちょうほまんぼう",
  "鷹尾": "たかお",
  "太郎坊町": "たろぼうちょう",
  "都北町": "とほくちょう",
  "豊満町": "とよみつちょう",
  "夏尾町": "なつおちょう",
  "野々美谷町": "ののみたにちょう",
  "姫城町": "ひめぎちょう",
  "平江町": "ひらえちょう",
  "平塚町": "ひらつかちょう",
  "広原町": "ひろはらちょう",
  "丸谷町": "まるたにちょう",
  "美川町": "みかわちょう",
  "南鷹尾町": "みなみたかおちょう",
  "南横市町": "みなみよこいちちょう",
  "蓑原町": "みのばるちょう",
  "都島町": "みやこじまちょう",
  "宮丸町": "みやまるちょう",
  "都原町": "みやこばるちょう",
  "安久町": "やすひさちょう",
  "山田町中霧島": "やまだちょうなかぎりしま",
  "山田町山田": "やまだちょうやまだ",
  "山之口町富吉": "やまのくちちょうとみよし",
  "山之口町花木": "やまのくちちょうはなのき",
  "横市町": "よこいちちょう",
  "吉之元町": "よしのもとちょう",
  "若葉町": "わかばちょう",
  "立野町": "たてのちょう",
};

const SCHOOL_COORDS = {
  "明道小学校": [31.719, 131.058],
  "南小学校": [31.713, 131.062],
  "大王小学校": [31.728, 131.052],
  "東小学校": [31.722, 131.079],
  "上長飯小学校": [31.704, 131.092],
  "五十市小学校": [31.696, 131.003],
  "今町小学校": [31.653, 130.994],
  "明和小学校": [31.717, 130.996],
  "西小学校": [31.724, 130.999],
  "祝吉小学校": [31.746, 131.083],
  "川東小学校": [31.748, 131.068],
  "沖水小学校": [31.787, 131.073],
  "志和池小学校": [31.811, 131.088],
  "丸野小学校": [31.823, 131.064],
  "庄内小学校": [31.781, 130.971],
  "菓子野小学校": [31.822, 131.02],
  "乙房小学校": [31.793, 131.014],
  "西岳小学校": [31.757, 130.93],
  "吉之元小学校": [31.902, 130.82],
  "夏尾小学校": [31.865, 130.862],
  "梅北小学校": [31.61, 131.063],
  "安久小学校": [31.65, 131.099],
  "山之口小学校": [31.74, 131.16],
  "富吉小学校": [31.737, 131.205],
  "高城小学校": [31.783, 131.112],
  "石山小学校": [31.808, 131.168],
  "有水小学校": [31.89, 131.16],
  "山田小学校": [31.78, 130.995],
  "中霧島小学校": [31.821, 131.026],
  "高崎小学校": [31.872, 131.062],
  "高崎麓小学校": [31.888, 131.015],
  "江平小学校": [31.942, 131.085],
  "縄瀬小学校": [31.887, 130.985],
  "姫城中学校": [31.713, 131.061],
  "小松原中学校": [31.729, 131.052],
  "妻ケ丘中学校": [31.724, 131.077],
  "五十市中学校": [31.716, 130.998],
  "西中学校": [31.731, 131.002],
  "祝吉中学校": [31.748, 131.08],
  "沖水中学校": [31.775, 131.073],
  "志和池中学校": [31.813, 131.087],
  "庄内中学校": [31.78, 130.972],
  "西岳中学校": [31.757, 130.93],
  "夏尾中学校": [31.866, 130.862],
  "中郷中学校": [31.614, 131.063],
  "山之口中学校": [31.739, 131.161],
  "高城中学校": [31.784, 131.113],
  "有水中学校": [31.89, 131.16],
  "山田中学校": [31.78, 130.995],
  "高崎中学校": [31.872, 131.063],
};

const SCHOOL_ZONES = {
  "一万城町": zone("上長飯小学校", "妻ケ丘中学校"),
  "大王町": zone("大王小学校", "小松原中学校"),
  "宮丸町": zone("大王小学校", "小松原中学校"),
  "前田町": zone("大王小学校", "小松原中学校"),
  "平江町": zone("大王小学校", "小松原中学校"),
  "志比田町": zone("大王小学校", "小松原中学校"),
  "菖蒲原町": zone("東小学校", "妻ケ丘中学校"),
  "若葉町": zone("東小学校", "妻ケ丘中学校"),
  "上長飯町": zone("上長飯小学校", "妻ケ丘中学校"),
  "広原町": zone("上長飯小学校", "妻ケ丘中学校"),
  "南鷹尾町": zone("五十市小学校", "五十市中学校"),
  "平塚町": zone("五十市小学校", "五十市中学校"),
  "五十町": zone("五十市小学校", "五十市中学校"),
  "大岩田町": zone("今町小学校", "五十市中学校"),
  "今町": zone("今町小学校", "五十市中学校"),
  "久保原町": zone("明和小学校", "五十市中学校", true, "中学校は明和小学校区域の一部で西中学校になる場合があります"),
  "横市町": zone("西小学校", "西中学校"),
  "南横市町": zone("西小学校", "西中学校"),
  "都原町": zone("西小学校", "西中学校"),
  "早水町": zone("祝吉小学校", "祝吉中学校"),
  "立野町": zone("祝吉小学校", "祝吉中学校"),
  "郡元町": zone("祝吉小学校", "祝吉中学校"),
  "祝吉": zone("祝吉小学校", "祝吉中学校"),
  "上川東": zone("川東小学校", "祝吉中学校"),
  "下川東": zone("川東小学校", "祝吉中学校"),
  "高木町": zone("沖水小学校", "沖水中学校"),
  "太郎坊町": zone("沖水小学校", "沖水中学校"),
  "都北町": zone("沖水小学校", "沖水中学校"),
  "下水流町": zone("志和池小学校", "志和池中学校"),
  "野々美谷町": zone("丸野小学校", "志和池中学校"),
  "庄内町": zone("庄内小学校", "庄内中学校"),
  "関之尾町": zone("庄内小学校", "庄内中学校"),
  "菓子野町": zone("菓子野小学校", "庄内中学校"),
  "美川町": zone("西岳小学校", "西岳中学校"),
  "吉之元町": zone("吉之元小学校", "西岳中学校"),
  "夏尾町": zone("夏尾小学校", "夏尾中学校"),
  "安久町": zone("安久小学校", "中郷中学校"),
  "豊満町": zone("安久小学校", "中郷中学校"),
  "山之口町花木": zone("山之口小学校", "山之口中学校"),
  "山之口町富吉": zone("富吉小学校", "山之口中学校"),
  "高城町高城": zone("高城小学校", "高城中学校", true, "高城町は自治公民館単位で区域が分かれるため要確認"),
  "高城町桜木": zone("高城小学校", "高城中学校", true, "高城町は自治公民館単位で区域が分かれるため要確認"),
  "高城町大井手": zone("高城小学校", "高城中学校", true, "高城町は自治公民館単位で区域が分かれるため要確認"),
  "高城町穂満坊": zone("高城小学校", "高城中学校", true, "高城町は自治公民館単位で区域が分かれるため要確認"),
  "高城町石山": zone("石山小学校", "高城中学校", true, "高城町は自治公民館単位で区域が分かれるため要確認"),
  "高城町有水": zone("有水小学校", "有水中学校"),
  "高城町四家": zone("高城小学校", "高城中学校", true, "高城町四家は調整区域の可能性があるため要確認"),
  "山田町山田": zone("山田小学校", "山田中学校", true, "山田町山田は地区により小学校が分かれるため要確認"),
  "山田町中霧島": zone("中霧島小学校", "山田中学校"),
  "高崎町大牟田": zone("高崎小学校", "高崎中学校"),
  "高崎町前田": zone("高崎麓小学校", "高崎中学校"),
  "高崎町江平": zone("江平小学校", "高崎中学校"),
  "高崎町縄瀬": zone("縄瀬小学校", "高崎中学校"),
  "高崎町東霧島": zone("高崎小学校", "高崎中学校", true, "高崎町は自治公民館単位で区域が分かれる場合があります"),
  "下長飯町": multiZone(["南小学校", "今町小学校"], ["姫城中学校", "五十市中学校"], "下長飯町は一部地域で学校区が分かれるため要確認"),
  "姫城町": multiZone(["明道小学校", "南小学校"], ["姫城中学校"], "姫城町は一部地域で小学校区が分かれるため要確認"),
  "甲斐元町": multiZone(["明道小学校", "南小学校"], ["姫城中学校"], "甲斐元町は一部地域で小学校区が分かれるため要確認"),
  "都島町": multiZone(["明道小学校", "五十市小学校"], ["姫城中学校", "五十市中学校"], "都島町は一部地域で学校区が分かれるため要確認"),
  "鷹尾": multiZone(["明道小学校", "五十市小学校"], ["姫城中学校", "五十市中学校"], "鷹尾は丁目により学校区が分かれるため要確認"),
  "早鈴町": multiZone(["南小学校", "東小学校"], ["姫城中学校", "妻ケ丘中学校"], "早鈴町は一部地域で学校区が分かれるため要確認"),
  "栄町": multiZone(["大王小学校", "祝吉小学校"], ["小松原中学校", "祝吉中学校"], "栄町は一部地域で学校区が分かれるため要確認"),
  "蓑原町": multiZone(["明和小学校", "西小学校"], ["五十市中学校", "西中学校"], "蓑原町は一部地域で学校区が分かれるため要確認"),
  "乙房町": multiZone(["庄内小学校", "乙房小学校"], ["庄内中学校"], "乙房町は一部地域で小学校区が分かれるため要確認"),
  "梅北町": multiZone(["今町小学校", "梅北小学校"], ["五十市中学校", "中郷中学校"], "梅北町は一部地域で学校区が分かれるため要確認"),
  "丸谷町": multiZone(["志和池小学校", "丸野小学校"], ["志和池中学校"], "丸谷町は一部地域で小学校区が分かれるため要確認"),
};

const state = {
  latest: null,
  history: null,
  collectionHistory: null,
  routeValues: { items: [] },
  hazardZones: { items: [] },
  listings: [],
  filtered: [],
  view: "list",
  listLayout: "cards",
  listPage: 1,
  listPageSize: DEFAULT_LIST_PAGE_SIZE,
  tableScrollSuppressUntil: 0,
  mapLayerType: "standard",
  map: null,
  mapBaseLayers: null,
  markerLayer: null,
  hazardAreaLayer: null,
  fixedAssetCoverageLayer: null,
  markers: [],
  detailMap: null,
  detailBaseLayers: null,
  detailMarker: null,
  favorites: new Set(),
  candidates: new Set(),
  excluded: new Set(),
  hiddenImages: new Set(),
  notes: {},
  currentDetailId: null,
  deviceMode: "mobile",
  showHazardAreas: false,
  showFixedAssetCoverage: false,
  focusFixedAssetCoverage: false,
};

let topbarClockTimer = null;

const els = {
  appShell: document.getElementById("appShell"),
  controls: document.querySelector(".controls"),
  refreshButton: document.getElementById("refreshButton"),
  settingsButton: document.getElementById("settingsButton"),
  currentDateText: document.getElementById("currentDateText"),
  currentTimeText: document.getElementById("currentTimeText"),
  weatherText: document.getElementById("weatherText"),
  deviceModeControl: document.getElementById("deviceModeControl"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  townFilter: document.getElementById("townFilter"),
  schoolFilter: document.getElementById("schoolFilter"),
  priceMin: document.getElementById("priceMin"),
  priceMax: document.getElementById("priceMax"),
  areaMin: document.getElementById("areaMin"),
  areaMax: document.getElementById("areaMax"),
  exportBackupButton: document.getElementById("exportBackupButton"),
  importBackupButton: document.getElementById("importBackupButton"),
  backupFileInput: document.getElementById("backupFileInput"),
  backupSummary: document.getElementById("backupSummary"),
  favoriteOnly: document.getElementById("favoriteOnly"),
  candidateOnly: document.getElementById("candidateOnly"),
  newOnly: document.getElementById("newOnly"),
  cheapOnly: document.getElementById("cheapOnly"),
  priceDropOnly: document.getElementById("priceDropOnly"),
  showExcluded: document.getElementById("showExcluded"),
  hazardAreaToggle: document.getElementById("hazardAreaToggle"),
  hazardAreaStatus: document.getElementById("hazardAreaStatus"),
  hazardLegend: document.getElementById("hazardLegend"),
  fixedAssetCoverageToggle: document.getElementById("fixedAssetCoverageToggle"),
  fixedAssetCoverageStatus: document.getElementById("fixedAssetCoverageStatus"),
  fixedAssetCoverageLegend: document.getElementById("fixedAssetCoverageLegend"),
  statusMessage: document.getElementById("statusMessage"),
  listingCount: document.getElementById("listingCount"),
  currentAverage: document.getElementById("currentAverage"),
  historyAverage: document.getElementById("historyAverage"),
  updatedAt: document.getElementById("updatedAt"),
  fixedAssetRouteCount: document.getElementById("fixedAssetRouteCount"),
  fixedAssetRouteMeta: document.getElementById("fixedAssetRouteMeta"),
  fixedAssetRouteDetail: document.getElementById("fixedAssetRouteDetail"),
  fixedAssetCoverageLink: document.getElementById("fixedAssetCoverageLink"),
  resultCount: document.getElementById("resultCount"),
  mapReadyCount: document.getElementById("mapReadyCount"),
  listLayoutControl: document.getElementById("listLayoutControl"),
  listPageSize: document.getElementById("listPageSize"),
  listPagination: document.getElementById("listPagination"),
  townCount: document.getElementById("townCount"),
  distributionSummary: document.getElementById("distributionSummary"),
  distributionGrid: document.getElementById("distributionGrid"),
  schoolAverageSummary: document.getElementById("schoolAverageSummary"),
  schoolAverageGrid: document.getElementById("schoolAverageGrid"),
  recentMovementGrid: document.getElementById("recentMovementGrid"),
  alertGrid: document.getElementById("alertGrid"),
  notificationSummary: document.getElementById("notificationSummary"),
  notificationGrid: document.getElementById("notificationGrid"),
  dataQualitySummary: document.getElementById("dataQualitySummary"),
  dataQualityGrid: document.getElementById("dataQualityGrid"),
  routeCoverageSummary: document.getElementById("routeCoverageSummary"),
  routeCoverageGrid: document.getElementById("routeCoverageGrid"),
  appReadinessSummary: document.getElementById("appReadinessSummary"),
  appReadinessGrid: document.getElementById("appReadinessGrid"),
  dataSourceGrid: document.getElementById("dataSourceGrid"),
  candidateCount: document.getElementById("candidateCount"),
  exportComparePdfButton: document.getElementById("exportComparePdfButton"),
  compareTable: document.getElementById("compareTable"),
  listingList: document.getElementById("listingList"),
  historyGrid: document.getElementById("historyGrid"),
  detailView: document.getElementById("detailView"),
  detailPageTown: document.getElementById("detailPageTown"),
  detailPageTitle: document.getElementById("detailPageTitle"),
  detailPageBody: document.getElementById("detailPageBody"),
  detailBackLink: document.getElementById("detailBackLink"),
  detailPanel: document.getElementById("detailPanel"),
  detailTown: document.getElementById("detailTown"),
  detailTitle: document.getElementById("detailTitle"),
  detailBody: document.getElementById("detailBody"),
  closeDetail: document.getElementById("closeDetail"),
  settingsPanel: document.getElementById("settingsPanel"),
  closeSettings: document.getElementById("closeSettings"),
  collectionHistoryButton: document.getElementById("collectionHistoryButton"),
  notificationPermissionButton: document.getElementById("notificationPermissionButton"),
  notificationPermissionText: document.getElementById("notificationPermissionText"),
  settingsExportBackupButton: document.getElementById("settingsExportBackupButton"),
  settingsImportBackupButton: document.getElementById("settingsImportBackupButton"),
  collectionHistorySummary: document.getElementById("collectionHistorySummary"),
  collectionHistoryList: document.getElementById("collectionHistoryList"),
};

function init() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  loadSavedState();
  applyDeviceMode();
  bindEvents();
  resetTransientFilters();
  renderBackupSummary();
  startTopbarLiveInfo();
  initializeLandData();
}

function bindEvents() {
  els.refreshButton.addEventListener("click", refreshLandViewer);
  els.settingsButton?.addEventListener("click", openSettings);
  els.closeSettings?.addEventListener("click", closeSettings);
  els.collectionHistoryButton?.addEventListener("click", openCollectionHistoryView);
  els.notificationPermissionButton?.addEventListener("click", requestBrowserNotifications);
  els.settingsExportBackupButton?.addEventListener("click", exportBackup);
  els.settingsImportBackupButton?.addEventListener("click", () => {
    closeSettings();
    els.backupFileInput.value = "";
    els.backupFileInput.click();
  });
  els.settingsPanel?.addEventListener("click", (event) => {
    if (event.target === els.settingsPanel) {
      closeSettings();
    }
  });
  els.searchInput.addEventListener("input", renderFromFirstListPage);
  els.sortSelect.addEventListener("change", renderFromFirstListPage);
  els.townFilter?.addEventListener("change", renderFromFirstListPage);
  els.schoolFilter.addEventListener("change", renderFromFirstListPage);
  els.priceMin.addEventListener("input", renderFromFirstListPage);
  els.priceMax.addEventListener("input", renderFromFirstListPage);
  els.areaMin.addEventListener("input", renderFromFirstListPage);
  els.areaMax.addEventListener("input", renderFromFirstListPage);
  els.exportBackupButton.addEventListener("click", exportBackup);
  els.importBackupButton.addEventListener("click", () => {
    els.backupFileInput.value = "";
    els.backupFileInput.click();
  });
  els.backupFileInput.addEventListener("change", importBackup);
  els.favoriteOnly?.addEventListener("change", renderFromFirstListPage);
  els.candidateOnly?.addEventListener("change", renderFromFirstListPage);
  els.newOnly.addEventListener("change", renderFromFirstListPage);
  els.cheapOnly.addEventListener("change", renderFromFirstListPage);
  els.priceDropOnly?.addEventListener("change", renderFromFirstListPage);
  els.showExcluded?.addEventListener("change", renderFromFirstListPage);
  els.exportComparePdfButton?.addEventListener("click", exportComparePdf);
  els.controls?.addEventListener("change", handleControlChange, true);
  els.controls?.addEventListener("input", handleControlInput, true);
  els.hazardAreaToggle?.addEventListener("change", () => {
    state.showHazardAreas = Boolean(els.hazardAreaToggle.checked);
    localStorage.setItem(STORAGE_KEYS.showHazardAreas, state.showHazardAreas ? "1" : "0");
    renderHazardAreas();
  });
  els.fixedAssetCoverageLink?.addEventListener("click", openFixedAssetCoverageMap);
  els.fixedAssetCoverageToggle?.addEventListener("change", () => {
    state.showFixedAssetCoverage = Boolean(els.fixedAssetCoverageToggle.checked);
    state.focusFixedAssetCoverage = state.showFixedAssetCoverage;
    localStorage.setItem(STORAGE_KEYS.showFixedAssetCoverage, state.showFixedAssetCoverage ? "1" : "0");
    renderFixedAssetCoverage();
    if (state.focusFixedAssetCoverage) {
      fitMapToFixedAssetCoverage();
      state.focusFixedAssetCoverage = false;
    }
  });
  els.closeDetail.addEventListener("click", closeDetail);
  document.addEventListener("pointerup", handleMouseDetailPointer, true);
  document.addEventListener("click", handleDetailLinkClick, true);
  document.addEventListener("click", handleDelegatedActionClick, true);
  document.addEventListener("keydown", handleDelegatedOpenKeydown);
  document.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("hashchange", routeFromHash);
  els.deviceModeControl?.querySelectorAll("[data-device-mode]").forEach((button) => {
    button.addEventListener("click", () => setDeviceMode(button.dataset.deviceMode));
  });
  els.listLayoutControl?.querySelectorAll("[data-list-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      state.listLayout = button.dataset.listLayout || "cards";
      localStorage.setItem(STORAGE_KEYS.listLayout, state.listLayout);
      renderList();
      if (window.lucide) {
        window.lucide.createIcons();
      }
    });
  });
  els.listPageSize?.addEventListener("change", () => {
    state.listPageSize = normalizeListPageSize(els.listPageSize.value);
    localStorage.setItem(STORAGE_KEYS.listPageSize, String(state.listPageSize));
    state.listPage = 1;
    renderList();
  });
  els.listPagination?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest("[data-list-page]");
    if (!button) {
      return;
    }
    setListPage(Number(button.dataset.listPage), true);
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      clearDetailHash();
      activateView(button.dataset.view || "list");
    });
  });
}

function openSettings() {
  if (!els.settingsPanel) {
    return;
  }
  renderNotificationPermissionStatus();
  els.settingsPanel.classList.add("open");
  els.settingsPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-open");
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function openCollectionHistoryView() {
  closeSettings();
  window.location.href = "./history.html";
}

function closeSettings() {
  if (!els.settingsPanel) {
    return;
  }
  els.settingsPanel.classList.remove("open");
  els.settingsPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-open");
}

function renderNotificationPermissionStatus() {
  if (!els.notificationPermissionButton || !els.notificationPermissionText) {
    return;
  }
  const supported = "Notification" in window;
  const enabled = localStorage.getItem(STORAGE_KEYS.notificationsEnabled) === "1";
  const permission = supported ? Notification.permission : "unsupported";
  els.notificationPermissionButton.disabled = !supported || permission === "denied";
  els.notificationPermissionText.textContent = !supported
    ? "通知はこのブラウザ非対応"
    : permission === "granted" && enabled
      ? "通知は有効"
      : permission === "denied"
        ? "通知はブラウザ側で拒否中"
        : "通知を有効にする";
}

async function requestBrowserNotifications() {
  if (!("Notification" in window)) {
    setStatus("このブラウザでは通知に対応していません。");
    renderNotificationPermissionStatus();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    localStorage.setItem(STORAGE_KEYS.notificationsEnabled, permission === "granted" ? "1" : "0");
    renderNotificationPermissionStatus();
    setStatus(permission === "granted" ? "通知を有効にしました。" : "通知は有効化されませんでした。");
    maybeSendDataNotifications(true);
  } catch (error) {
    setStatus("通知設定を変更できませんでした。");
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && els.settingsPanel?.classList.contains("open")) {
    closeSettings();
  }
}

function startTopbarLiveInfo() {
  renderTopbarDateTime();
  if (topbarClockTimer) {
    window.clearInterval(topbarClockTimer);
  }
  topbarClockTimer = window.setInterval(renderTopbarDateTime, 30 * 1000);
  loadCurrentWeather();
}

function renderTopbarDateTime() {
  const now = new Date();
  if (els.currentDateText) {
    els.currentDateText.textContent = now.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  }
  if (els.currentTimeText) {
    els.currentTimeText.textContent = now.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function loadCurrentWeather() {
  if (!els.weatherText) {
    return;
  }
  if (!navigator.geolocation) {
    els.weatherText.textContent = "位置情報非対応";
    return;
  }
  els.weatherText.textContent = "現在地の天気を取得中";
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", latitude.toFixed(4));
        url.searchParams.set("longitude", longitude.toFixed(4));
        url.searchParams.set("current", "temperature_2m,weather_code");
        url.searchParams.set("timezone", "auto");
        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error("weather request failed");
        }
        const data = await response.json();
        const current = data?.current || data?.current_weather || {};
        const temperature = Number(current.temperature_2m ?? current.temperature);
        const weatherCode = Number(current.weather_code ?? current.weathercode);
        const weatherName = weatherCodeLabel(weatherCode);
        const tempText = Number.isFinite(temperature) ? `${Math.round(temperature)}℃` : "";
        els.weatherText.textContent = [tempText, weatherName].filter(Boolean).join(" ");
      } catch (error) {
        els.weatherText.textContent = "天気取得できません";
      }
    },
    () => {
      els.weatherText.textContent = "位置情報を許可で天気表示";
    },
    { enableHighAccuracy: false, maximumAge: 20 * 60 * 1000, timeout: 8000 }
  );
}

function weatherCodeLabel(code) {
  if (!Number.isFinite(code)) return "";
  if (code === 0) return "☀️ 快晴";
  if ([1, 2].includes(code)) return "🌤️ 晴れ";
  if (code === 3) return "☁️ くもり";
  if ([45, 48].includes(code)) return "🌫️ 霧";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️ 霧雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️ 雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️ 雪";
  if ([95, 96, 99].includes(code)) return "⛈️ 雷雨";
  return "🌡️ 天気";
}

function activateView(viewName) {
  state.view = viewName || "list";
  els.appShell?.classList.remove(
    "view-list",
    "view-dashboard",
    "view-map",
    "view-history",
    "view-distribution",
    "view-compare",
    "view-collectionHistory",
    "view-detail"
  );
  els.appShell?.classList.add(`view-${state.view}`);
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  document.querySelectorAll(".content-view").forEach((view) => {
    view.classList.toggle("active", view.id === `${state.view}View`);
  });
  if (state.view === "map") {
    setTimeout(() => {
      initMap();
      renderMap();
      state.map?.invalidateSize();
      document.getElementById("mapView")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }
  if (state.view === "history") {
    renderHistory();
  }
  if (state.view === "distribution") {
    renderDistribution();
  }
  if (state.view === "dashboard") {
    renderDashboard();
  }
  if (state.view === "compare") {
    renderCompare();
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function resetTransientFilters() {
  [
    els.searchInput,
    els.townFilter,
    els.schoolFilter,
    els.priceMin,
    els.priceMax,
    els.areaMin,
    els.areaMax,
  ].forEach((input) => {
    if (input) {
      input.value = "";
    }
  });
  [els.favoriteOnly, els.candidateOnly, els.newOnly, els.cheapOnly, els.priceDropOnly, els.showExcluded].forEach((input) => {
    if (input) {
      input.checked = false;
    }
  });
}

function loadSavedState() {
  state.favorites = loadStoredSet(STORAGE_KEYS.favorites);
  state.candidates = loadStoredSet(STORAGE_KEYS.candidates);
  state.excluded = loadStoredSet(STORAGE_KEYS.excluded);
  state.hiddenImages = loadStoredSet(STORAGE_KEYS.hiddenImages);
  state.notes = loadStoredObject(STORAGE_KEYS.notes);
  state.listLayout = normalizeListLayout(localStorage.getItem(STORAGE_KEYS.listLayout));
  state.listPageSize = normalizeListPageSize(localStorage.getItem(STORAGE_KEYS.listPageSize));
  state.mapLayerType = normalizeMapLayerType(localStorage.getItem(STORAGE_KEYS.mapLayerType));
  state.deviceMode = normalizeDeviceMode(localStorage.getItem(STORAGE_KEYS.deviceMode) || defaultDeviceMode());
  state.showHazardAreas = localStorage.getItem(STORAGE_KEYS.showHazardAreas) === "1";
  state.showFixedAssetCoverage = localStorage.getItem(STORAGE_KEYS.showFixedAssetCoverage) === "1";
}

function openFixedAssetCoverageMap(event) {
  event?.preventDefault();
  state.showFixedAssetCoverage = true;
  state.focusFixedAssetCoverage = true;
  localStorage.setItem(STORAGE_KEYS.showFixedAssetCoverage, "1");
  if (window.location.hash === "#map") {
    activateView("map");
  } else {
    window.location.hash = "map";
  }
}

function handleControlChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.matches?.("select, input")) {
    return;
  }
  renderFromFirstListPage();
}

function handleControlInput(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.matches?.("select, input[type='checkbox']")) {
    return;
  }
  renderFromFirstListPage();
}

function handleMouseDetailPointer(event) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const detailLink = target?.closest("[data-detail-id]");
  if (detailLink) {
    event.preventDefault();
    event.stopPropagation();
    navigateToDetail(detailLink.dataset.detailId);
    return;
  }
  const opener = target?.closest("[data-open-listing]");
  if (!opener || shouldIgnoreCardOpen(target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  navigateToDetail(opener.dataset.openListing);
}

function handleDetailLinkClick(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const detailLink = target?.closest("[data-detail-id]");
  if (!detailLink) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  navigateToDetail(detailLink.dataset.detailId);
}

function handleDelegatedActionClick(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const button = target?.closest(
    "[data-open-listing], [data-toggle-favorite], [data-toggle-candidate], [data-toggle-exclude], [data-hide-image]"
  );
  if (!button) {
    return;
  }
  if (button.dataset.openListing && shouldIgnoreCardOpen(target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.openListing) {
    navigateToDetail(button.dataset.openListing);
    return;
  }
  if (button.dataset.toggleFavorite) {
    toggleSavedSet("favorites", button.dataset.toggleFavorite);
    return;
  }
  if (button.dataset.toggleCandidate) {
    toggleSavedSet("candidates", button.dataset.toggleCandidate);
    return;
  }
  if (button.dataset.toggleExclude) {
    toggleSavedSet("excluded", button.dataset.toggleExclude);
    return;
  }
  if (button.dataset.hideImage) {
    hideImageUrl(button.dataset.hideImage);
  }
}

function openDetailFromButton(button) {
  const id =
    button?.dataset?.detailId ||
    button?.dataset?.openDetail ||
    button?.getAttribute?.("data-detail-id") ||
    button?.getAttribute?.("data-open-detail");
  if (id) {
    navigateToDetail(id);
  }
}

window.openDetailFromButton = openDetailFromButton;

function shouldIgnoreCardOpen(target) {
  return Boolean(target?.closest?.("button, a, input, textarea, select, label, .image-hide-button, .image-thumb"));
}

function handleDelegatedOpenKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const opener = target?.closest("[data-open-listing]");
  if (!opener || shouldIgnoreCardOpen(target)) {
    return;
  }
  event.preventDefault();
  navigateToDetail(opener.dataset.openListing);
}

function detailHash(id) {
  return `#detail=${encodeURIComponent(String(id || ""))}`;
}

function parseDetailHash(hash) {
  const match = String(hash || "").match(/^#detail=(.+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isDetailHash() {
  return Boolean(parseDetailHash(window.location.hash));
}

function clearDetailHash() {
  if (!isDetailHash()) {
    return;
  }
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function navigateToDetail(id) {
  if (!id) {
    return;
  }
  const nextHash = detailHash(id);
  if (window.location.hash === nextHash) {
    routeFromHash();
  } else {
    window.location.hash = nextHash;
  }
}

function routeFromHash() {
  const detailId = parseDetailHash(window.location.hash);
  if (detailId) {
    openDetail(detailId);
    return;
  }
  const hashView = String(window.location.hash || "").replace(/^#/, "");
  if (hashView === "collectionHistory") {
    window.location.replace("./history.html");
    return;
  }
  if (["list", "dashboard", "map", "history", "distribution", "compare"].includes(hashView)) {
    closeDetail(false);
    activateView(hashView);
    return;
  }
  if (state.view === "detail") {
    closeDetail(false);
    activateView("list");
  }
}

function normalizeListLayout(value) {
  return ["cards", "compact", "table"].includes(value) ? value : "cards";
}

function normalizeListPageSize(value) {
  const size = Number(value);
  return LIST_PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_LIST_PAGE_SIZE;
}

function normalizeDeviceMode(value) {
  return ["desktop", "tablet", "mobile"].includes(value) ? value : defaultDeviceMode();
}

function defaultDeviceMode() {
  if (window.matchMedia?.("(min-width: 1100px)").matches) return "desktop";
  if (window.matchMedia?.("(min-width: 760px)").matches) return "tablet";
  return "mobile";
}

function setDeviceMode(mode) {
  state.deviceMode = normalizeDeviceMode(mode);
  localStorage.setItem(STORAGE_KEYS.deviceMode, state.deviceMode);
  applyDeviceMode();
  setTimeout(() => {
    state.map?.invalidateSize();
    state.detailMap?.invalidateSize();
  }, 80);
}

function applyDeviceMode() {
  els.appShell?.classList.remove("device-desktop", "device-tablet", "device-mobile");
  els.appShell?.classList.add(`device-${state.deviceMode}`);
  els.deviceModeControl?.querySelectorAll("[data-device-mode]").forEach((button) => {
    const active = button.dataset.deviceMode === state.deviceMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function normalizeMapLayerType(value) {
  return Object.prototype.hasOwnProperty.call(MAP_LAYER_DEFS, value) ? value : "standard";
}

function loadStoredSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch (error) {
    return new Set();
  }
}

function loadStoredObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    return {};
  }
}

function saveStoredSet(key, value) {
  localStorage.setItem(key, JSON.stringify([...value]));
}

function saveStoredObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveAllUserState() {
  saveStoredSet(STORAGE_KEYS.favorites, state.favorites);
  saveStoredSet(STORAGE_KEYS.candidates, state.candidates);
  saveStoredSet(STORAGE_KEYS.excluded, state.excluded);
  saveStoredSet(STORAGE_KEYS.hiddenImages, state.hiddenImages);
  saveStoredObject(STORAGE_KEYS.notes, state.notes);
}

function buildBackupPayload() {
  return {
    schema_version: 1,
    app: "miyakonojo-land-viewer",
    exported_at: new Date().toISOString(),
    report_generated_at: state.latest?.generated_at || null,
    data: {
      favorites: [...state.favorites],
      candidates: [...state.candidates],
      excluded: [...state.excluded],
      hidden_image_urls: [...state.hiddenImages],
      notes: state.notes,
    },
  };
}

async function exportBackup() {
  const fileName = `miyakonojo-land-viewer-backup-${localDateStamp(new Date())}.json`;
  const json = JSON.stringify(buildBackupPayload(), null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus("バックアップを保存しました。");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
  }
  downloadBlob(blob, fileName);
  setStatus("バックアップファイルを作成しました。OneDriveやGoogle Driveに保存してください。");
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const result = restoreBackupPayload(payload);
    saveAllUserState();
    renderBackupSummary();
    render();
    setStatus(
      `復元しました。お気に入り ${formatInteger(result.favorites)}件 / 買付候補 ${formatInteger(result.candidates)}件 / 除外 ${formatInteger(result.excluded)}件 / 写真非表示 ${formatInteger(result.hiddenImages)}件 / メモ ${formatInteger(result.notes)}件`
    );
  } catch (error) {
    setStatus("復元できませんでした。ビューアで保存したJSONファイルを選んでください。");
  } finally {
    event.target.value = "";
  }
}

function restoreBackupPayload(payload) {
  const data = payload?.data || payload;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup");
  }
  const favorites = normalizeBackupList(data.favorites);
  const candidates = normalizeBackupList(data.candidates);
  const excluded = normalizeBackupList(data.excluded);
  const hiddenImages = normalizeBackupList(data.hidden_image_urls || data.hiddenImages);
  const notes = normalizeBackupNotes(data.notes);
  mergeSet(state.favorites, favorites);
  mergeSet(state.candidates, candidates);
  mergeSet(state.excluded, excluded);
  mergeSet(state.hiddenImages, hiddenImages);
  Object.entries(notes).forEach(([id, note]) => {
    state.notes[id] = note;
  });
  return {
    favorites: favorites.length,
    candidates: candidates.length,
    excluded: excluded.length,
    hiddenImages: hiddenImages.length,
    notes: Object.keys(notes).length,
  };
}

function normalizeBackupList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeBackupNotes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, note]) => [String(id || "").trim(), String(note || "").trim()])
      .filter(([id, note]) => id && note)
  );
}

function mergeSet(target, values) {
  values.forEach((value) => target.add(value));
}

function localDateStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function loadData() {
  const requestId = ++landLoadSequence;
  setStatus("読み込み中");
  let pair; let stale = false;
  try {
    pair = await fetchLandPair();
  } catch (error) {
    pair = lastVerifiedLand; stale = true;
    if (!pair) {
      try {
        const cached = JSON.parse(localStorage.getItem("miyakonojo_land_verified_v2"));
        if (cached && Number.isFinite(Date.parse(cached.verified_at))) {
          pair = await validateLandBundle(cached.pointer, cached.manifestText, cached.texts);
          pair.verified_at = cached.verified_at;
        }
      } catch (cacheError) { pair = null; }
    }
  }
  if (landRequiresVerifiedShell && pair?.manifest?.generation_id !== landWorkerInfo?.generation_id) pair = null;
  if (landRequiresVerifiedShell && pair) {
    pair.data_base = './';
    pair.generation_path = `./viewer-contracts/generations/${pair.manifest.generation_id}/`;
  }
  if (requestId !== landLoadSequence) return;
  if (!pair) {
    state.financialSourcePair = null;
    state.latest = null; state.history = null; state.listings = []; state.filtered = [];
    state.dataStale = true; state.dataMode = null;
    state.routeValues = { items: [] }; state.hazardZones = { items: [] }; state.collectionHistory = null;
    [els.compareTable, els.historyGrid, els.distributionGrid, els.schoolAverageGrid, els.detailPageBody].filter(Boolean).forEach(el => { el.innerHTML = '<div class="empty-state">取得不能（査定保留）</div>'; });
    setStatus("土地データを取得・検証できません。物件数や査定は確認できません。");
    els.listingList.innerHTML = '<div class="empty-state">土地データ取得不能</div>';
    els.resultCount.textContent = "取得不能";
    [els.listingCount, els.currentAverage, els.historyAverage, els.updatedAt].filter(Boolean).forEach((el) => { el.textContent = "未確認"; });
    return;
  }
  // Only a hash explicitly bound to this generation authorizes reference appraisal.
  const optional = async (name) => {
    const expected = pair.manifest?.reference_versions?.[`${name.replace(/\.json$/, "")}_sha256`];
    if (!expected) return null;
    try {
      const base = pair.generation_path ? `${pair.generation_path}references/` : RAW_BASE;
      let result;
      try { result = await fetchLandText(`${base}${name}`); }
      catch (error) {
        if (landRequiresVerifiedShell || error.status !== 404) return null;
        result = await fetchLandText(`${RAW_BASE}${name}`);
      }
      return await sha256Text(result.text) === expected ? result.value : null;
    } catch (error) { return null; }
  };
  const [route, fixed, hazard, collection] = await Promise.all([
    optional("route-values.json"), optional("fixed-asset-route-values.json"),
    fetchOptionalDataFile("hazard-zones.json", null), fetchOptionalDataFile("collection-history.json", null),
  ]);
  if (requestId !== landLoadSequence) return;
  // Commit one complete pair and its references; a slower earlier load cannot overwrite it.
  state.financialSourcePair = pair;
  state.latest = pair.latest; state.history = pair.history; state.dataMode = pair.mode; state.dataStale = stale || Boolean(pair.stale);
  state.routeValues = mergeRouteValuePayloads(route, fixed);
  state.hazardZones = hazard || { items: [] }; state.collectionHistory = collection;
  state.listings = state.latest.listings.filter((row) => row.display_status !== "duplicate").map(normalizeListing);
  if (!stale) {
    lastVerifiedLand = pair;
    if (pair.mode === "v2") {
      try { localStorage.setItem("miyakonojo_land_verified_v2", JSON.stringify({ ...pair.verified_bundle, verified_at: pair.verified_at })); } catch (error) { /* Storage limits must not prevent viewing. */ }
    }
  }
  setStatus((stale || pair.stale) ? `更新を検証できません。最後の検証済みデータ（取得 ${formatDateTime(pair.verified_at)}）を表示しています。` :
    pair.mode === "legacy" ? (pair.latest.listings.length ? "旧形式データ：確認根拠のない価格・面積は未確認として表示しています。" : "旧形式の公開データは0件です。収集対象がないことを意味しません。収集状態は未確認です。") : "");
  if (landRequiresVerifiedShell && !stale) setStatus(`検証済み一式（取得 ${formatDateTime(landWorkerInfo?.verified_at)}）を表示しています。`);
  refreshFinancialFreshness();
  populateTownFilter(); populateSchoolFilter(); render();

  if (!stale && pair.mode === "v2") maybeSendDataNotifications(false);
  routeFromHash();
}

async function fetchDataFile(fileName) {
  if (window.location.protocol === "file:") {
    try {
      return await fetchJson(`./${fileName}`);
    } catch (error) {
      return fetchJson(`${RAW_BASE}${fileName}`);
    }
  }
  try {
    return await fetchJson(`${RAW_BASE}${fileName}`);
  } catch (error) {
    return fetchJson(`./${fileName}`);
  }
}

async function fetchOptionalDataFile(fileName, fallback) {
  try {
    return await fetchDataFile(fileName);
  } catch (error) {
    return fallback;
  }
}

async function fetchJson(url) {
  return (await fetchLandText(`${url}?v=${Date.now()}`)).value;
}

function mergeRouteValuePayloads(routeValues, fixedAssetRouteValues) {
  const baseItems = routeValuePayloadItems(routeValues);
  const fixedItems = routeValuePayloadItems(fixedAssetRouteValues);
  return {
    schema_version: 1,
    updated_at: fixedAssetRouteValues?.updated_at || routeValues?.updated_at || null,
    source: [fixedAssetRouteValues?.source, routeValues?.source].filter(Boolean).join(" / ") || "参照版未確認",
    note: [fixedAssetRouteValues?.note, routeValues?.note].filter(Boolean).join(" / "),
    fixed_asset_summary: fixedAssetRouteValues?.summary || null,
    route_value_summary: routeValues?.summary || null,
    items: [...fixedItems, ...baseItems],
  };
}

function routeValuePayloadItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.route_values)) return payload.route_values;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizeListing(listing, index) {
  listing = safeFinancialRecord(listing);
  const historyEntry = findHistoryEntry(listing.id);
  const position = resolvePosition(listing, index);
  const positionedListing = {
    ...listing,
    map_latitude: position.lat,
    map_longitude: position.lng,
  };
  const routeValue = resolveRouteValue(positionedListing);
  const hazardInfo = resolveHazardInfo(positionedListing);
  const legalNotice = analyzeLegalNotice(listing);
  return {
    ...listing,
    first_seen_date: historyEntry?.first_seen_date || null,
    last_seen_date: historyEntry?.last_seen_date || null,
    observed_count: historyEntry?.observed_count || null,
    price_history: historyEntry?.price_history || [],
    route_value_reference: routeValue,
    hazard_reference: hazardInfo,
    legal_notice: legalNotice,
    map_latitude: position.lat,
    map_longitude: position.lng,
    is_approx_position: position.approx,
  };
}

function findHistoryEntry(id) {
  if (!state.history || !Array.isArray(state.history.listings)) {
    return null;
  }
  return state.history.listings.find((entry) => entry.id === id) || null;
}

function resolvePosition(listing, index) {
  if (Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude)) {
    return { lat: listing.latitude, lng: listing.longitude, approx: false };
  }
  const base = TOWN_COORDS[listing.town] || CITY_CENTER;
  const offset = offsetFor(`${listing.id}-${index}`);
  return {
    lat: base[0] + offset.lat,
    lng: base[1] + offset.lng,
    approx: true,
  };
}

function resolveRouteValue(listing) {
  const embedded = normalizeRouteValueRecord(
    {
      ...listing,
      route_value_yen_per_sqm:
        listing.fixed_asset_tax_route_value_yen_per_sqm || listing.route_value_yen_per_sqm,
    },
    "物件データ",
    "exact",
    null
  );
  if (embedded && isReliableRouteValueReference(embedded)) {
    return embedded;
  }

  const items = Array.isArray(state.routeValues?.items)
    ? state.routeValues.items
    : Array.isArray(state.routeValues?.route_values)
      ? state.routeValues.route_values
      : [];
  const scored = items
    .map((record) => scoreRouteValueRecord(record, listing))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return null;
  }
  const best = scored[0];
  const normalized = normalizeRouteValueRecord(best.record, best.match_note, best.precision, best.distance_km);
  return isReliableRouteValueReference(normalized) ? normalized : null;
}

function scoreRouteValueRecord(record, listing) {
  const value = referenceValueYenPerSqm(record);
  if (!value) return null;
  const fixedAssetRoute = isFixedAssetRouteRecord(record);

  const recordId = String(record.listing_id || record.id || "");
  if (recordId && recordId === listing.id) {
    return { record, score: 100, precision: "exact", match_note: "物件ID一致", distance_km: null };
  }
  if (record.source_url && record.source_url === listing.source_url) {
    return { record, score: 96, precision: "exact", match_note: "掲載URL一致", distance_km: null };
  }

  const listingAddress = normalizeAddress(listing.address);
  const recordAddress = normalizeAddress(record.address);
  if (listingAddress && recordAddress && (listingAddress.includes(recordAddress) || recordAddress.includes(listingAddress))) {
    return { record, score: 84, precision: "address", match_note: "所在地一致", distance_km: null };
  }

  const recordLat = numberValue(record.latitude ?? record.lat ?? record["座標_lat"]);
  const recordLng = numberValue(record.longitude ?? record.lng ?? record.lon ?? record["座標_lon"]);
  if (
    recordLat &&
    recordLng &&
    Number.isFinite(listing.map_latitude) &&
    Number.isFinite(listing.map_longitude)
  ) {
    const distanceKm = haversineKm(listing.map_latitude, listing.map_longitude, recordLat, recordLng);
    if (fixedAssetRoute) {
      if (distanceKm <= 0.12) {
        return { record, score: 112, precision: "nearby", match_note: "最寄り固定資産税路線価", distance_km: distanceKm };
      }
      if (distanceKm <= 0.25) {
        return { record, score: 88, precision: "nearby", match_note: "近接固定資産税路線価", distance_km: distanceKm };
      }
    }
    if (distanceKm <= 0.15) {
      return { record, score: 78, precision: "nearby", match_note: "近接地点一致", distance_km: distanceKm };
    }
    if (distanceKm <= 0.45) {
      return { record, score: 66, precision: "nearby", match_note: "近接地点候補", distance_km: distanceKm };
    }
    if (record.town === listing.town && distanceKm <= 0.7) {
      return { record, score: 48, precision: "town_nearby", match_note: "同町内の近接候補", distance_km: distanceKm };
    }
  }

  return null;
}

function isReliableRouteValueReference(routeValue) {
  if (!routeValue) return false;
  const distance = routeValueReferenceDistanceKm(routeValue);
  if (routeValue.route_value_type === "fixed_asset_tax" && distance !== null && distance > 0.25) return false;
  if (distance !== null && distance > 0.7) return false;
  if (routeValue.precision === "town" || routeValue.precision === "town_nearby") return false;
  if (routeValue.confidence === "低") return false;
  return true;
}

function routeValueReferenceDistanceKm(routeValue) {
  const distance = numberValue(
    routeValue?.appraisal_distance_km ?? routeValue?.public_land_price_point_distance_km ?? routeValue?.distance_km
  );
  return Number.isFinite(distance) ? distance : null;
}

function normalizeRouteValueRecord(record, matchNote, precision, distanceKm) {
  const routeValue = routeValueYenPerSqm(record);
  const publicPrice = publicPriceYenPerSqm(record);
  if (!routeValue && !publicPrice) return null;
  const routeValueType = routeValueRecordType(record);
  const routeMethodUnit = routeValue ? routeValue * TSUBO_SQM / 10000 : null;
  const fixedAssetUnit = routeValueType === "fixed_asset_tax" ? routeMethodUnit : null;
  const publicReference =
    numberValue(record.public_reference_unit_price_man_per_tsubo) ||
    numberValue(record.market_reference_unit_price_man_per_tsubo) ||
    numberValue(record.public_land_price_unit_price_man_per_tsubo) ||
    publicReferenceFromYenPerSqm(record) ||
    (routeValue && routeValueType === "inheritance_tax"
      ? routeMethodUnit / INHERITANCE_TAX_ROUTE_VALUE_RATIO
      : routeValue
        ? routeMethodUnit / FIXED_ASSET_ROUTE_VALUE_RATIO
        : 0);
  return {
    route_value_type: routeValueType,
    route_value_yen_per_sqm: routeValue,
    inheritance_tax_route_value_yen_per_sqm: numberValue(record.inheritance_tax_route_value_yen_per_sqm),
    fixed_asset_tax_route_value_yen_per_sqm: routeValueType === "fixed_asset_tax"
      ? routeValue
      : numberValue(record.fixed_asset_tax_route_value_yen_per_sqm ?? record.fixed_asset_route_value_yen_per_sqm),
    fixed_asset_route_id: record.fixed_asset_route_id || record.route_id || record["路線ID"] || "",
    fixed_asset_use_district: record.fixed_asset_use_district || record.use_district || record["用途地区区分"] || "",
    fixed_asset_price_date: record.fixed_asset_price_date || record.price_date || record["時点"] || "",
    fixed_asset_classification: record.fixed_asset_classification || record.classification || record["分類"] || "",
    fixed_asset_unit_price_man_per_tsubo: fixedAssetUnit,
    route_method_unit_price_man_per_tsubo: routeMethodUnit,
    public_reference_unit_price_man_per_tsubo: publicReference,
    public_price_yen_per_sqm: publicPrice,
    comparable_method_price_yen_per_sqm: numberValue(record.comparable_method_price_yen_per_sqm),
    comparable_method_unit_price_man_per_tsubo: numberValue(record.comparable_method_unit_price_man_per_tsubo),
    income_method_unit_price_man_per_tsubo: numberValue(record.income_method_unit_price_man_per_tsubo),
    cost_method_unit_price_man_per_tsubo: numberValue(record.cost_method_unit_price_man_per_tsubo),
    development_method_unit_price_man_per_tsubo: numberValue(record.development_method_unit_price_man_per_tsubo),
    public_land_price_point_id: record.public_land_price_point_id || "",
    public_land_price_point_address: record.public_land_price_point_address || "",
    public_land_price_point_distance_km: numberValue(record.public_land_price_point_distance_km),
    public_land_price_type: record.public_land_price_type || "",
    public_land_price_use_category: record.public_land_price_use_category || "",
    public_land_price_zoning: record.public_land_price_zoning || "",
    public_land_price_front_road_condition: record.public_land_price_front_road_condition || "",
    public_land_price_station_name: record.public_land_price_station_name || "",
    public_land_price_station_distance_m: numberValue(record.public_land_price_station_distance_m),
    public_land_price_surroundings: record.public_land_price_surroundings || "",
    public_land_price_unit_price_man_per_tsubo: numberValue(record.public_land_price_unit_price_man_per_tsubo),
    frontage_m: numberValue(record.frontage_m),
    estimated_depth_m: numberValue(record.estimated_depth_m || record.depth_m),
    road_width_m: numberValue(record.road_width_m),
    appraisal_point_id: record.appraisal_point_id || "",
    appraisal_address: record.appraisal_address || "",
    appraisal_distance_km: numberValue(record.appraisal_distance_km),
    valuation_method: record.valuation_method || "",
    town: record.town || "",
    address: record.address || "",
    road_name: record.road_name || record.route_name || "",
    year: record.year || record.fiscal_year || "",
    source_url: record.source_url || record["取得元URL"] || "",
    source: record.source || state.routeValues?.source || (routeValueType === "inheritance_tax" ? "相続税路線価" : "固定資産税路線価"),
    note: record.note || "",
    precision,
    confidence: record.confidence || routeValueConfidence(precision),
    match_note: matchNote,
    distance_km: distanceKm,
  };
}

function routeValueYenPerSqm(record) {
  return numberValue(
    record?.route_value_yen_per_sqm ??
      record?.inheritance_tax_route_value_yen_per_sqm ??
      record?.fixed_asset_tax_route_value_yen_per_sqm ??
      record?.fixed_asset_route_value_yen_per_sqm ??
      record?.["路線価（円/㎡）"] ??
      record?.value_yen_per_sqm
  );
}

function publicPriceYenPerSqm(record) {
  return numberValue(record?.public_price_yen_per_sqm ?? record?.public_land_price_yen_per_sqm ?? record?.official_price_yen_per_sqm);
}

function referenceValueYenPerSqm(record) {
  return routeValueYenPerSqm(record) || publicPriceYenPerSqm(record);
}

function routeValueRecordType(record) {
  const raw = String(record?.route_value_type || record?.value_type || record?.classification || record?.["分類"] || "").toLowerCase();
  if (raw.includes("public_land_price") || raw.includes("public")) return "public_land_price";
  if (raw.includes("inheritance") || raw.includes("souzoku") || raw.includes("相続")) return "inheritance_tax";
  if (raw.includes("fixed") || raw.includes("固定資産")) return "fixed_asset_tax";
  if (record?.inheritance_tax_route_value_yen_per_sqm) return "inheritance_tax";
  return "fixed_asset_tax";
}

function isFixedAssetRouteRecord(record) {
  return routeValueRecordType(record) === "fixed_asset_tax";
}

function publicReferenceFromYenPerSqm(record) {
  const publicPrice = numberValue(record?.public_price_yen_per_sqm || record?.official_price_yen_per_sqm);
  return publicPrice ? (publicPrice * TSUBO_SQM) / 10000 : 0;
}

function routeValueConfidence(precision) {
  if (precision === "exact" || precision === "address") return "高";
  if (precision === "nearby") return "中";
  return "低";
}

function normalizeAddress(value) {
  return String(value || "")
    .replace(/^宮崎県/, "")
    .replace(/\s+/g, "")
    .replace(/[－ー‐]/g, "-")
    .trim();
}

function resolveHazardInfo(listing) {
  const embedded = normalizeHazardRecord(listing.hazard_reference || listing.hazard, "物件データ", "exact", null);
  if (embedded) {
    return embedded;
  }

  const items = Array.isArray(state.hazardZones?.items)
    ? state.hazardZones.items
    : Array.isArray(state.hazardZones?.hazards)
      ? state.hazardZones.hazards
      : [];
  const scored = items
    .map((record) => scoreHazardRecord(record, listing))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return null;
  }
  const best = scored[0];
  return normalizeHazardRecord(best.record, best.match_note, best.precision, best.distance_km);
}

function scoreHazardRecord(record, listing) {
  const recordId = String(record.listing_id || record.id || "");
  if (recordId && recordId === listing.id) {
    return { record, score: 100, precision: "exact", match_note: "物件ID一致", distance_km: null };
  }
  if (record.source_url && record.source_url === listing.source_url) {
    return { record, score: 96, precision: "exact", match_note: "掲載URL一致", distance_km: null };
  }

  const listingAddress = normalizeAddress(listing.address);
  const recordAddress = normalizeAddress(record.address);
  if (listingAddress && recordAddress && (listingAddress.includes(recordAddress) || recordAddress.includes(listingAddress))) {
    return { record, score: 82, precision: "address", match_note: "所在地一致", distance_km: null };
  }

  const recordLat = numberValue(record.latitude ?? record.lat);
  const recordLng = numberValue(record.longitude ?? record.lng);
  if (
    recordLat &&
    recordLng &&
    Number.isFinite(listing.map_latitude) &&
    Number.isFinite(listing.map_longitude)
  ) {
    const distanceKm = haversineKm(listing.map_latitude, listing.map_longitude, recordLat, recordLng);
    if (distanceKm <= 0.08) {
      return { record, score: 80, precision: "nearby", match_note: "近接地点一致", distance_km: distanceKm };
    }
    if (distanceKm <= 0.25) {
      return { record, score: 65, precision: "nearby", match_note: "近接地点候補", distance_km: distanceKm };
    }
  }

  if (record.town && record.town === listing.town) {
    return { record, score: 18, precision: "town", match_note: "町名一致", distance_km: null };
  }
  return null;
}

function normalizeHazardRecord(record, matchNote, precision, distanceKm) {
  if (!record || typeof record !== "object") return null;
  const hazards = normalizeHazardItems(record.hazards || record.hazard_types || record.types);
  const status = record.status || (hazards.length ? "affected" : record.checked ? "not_affected" : "unknown");
  const affected = status === "affected" || record.affected === true || (!record.status && hazards.length > 0);
  return {
    affected,
    status,
    hazards,
    town: record.town || "",
    address: record.address || "",
    source: record.source || state.hazardZones?.source || "ハザードマップ",
    checked_at: record.checked_at || record.updated_at || state.hazardZones?.updated_at || "",
    confidence: record.confidence || hazardConfidence(precision),
    precision,
    match_note: matchNote,
    distance_km: distanceKm,
    note: record.note || "",
  };
}

function normalizeHazardItems(value) {
  if (!value) return [];
  const rawItems = Array.isArray(value) ? value : [value];
  return rawItems
    .map((item) => {
      if (typeof item === "string") {
        return { type: item, level: "", note: "", informational: false };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      return {
        type: item.type || item.name || item.hazard_type || "",
        level: item.level || item.rank || item.depth || "",
        note: item.note || item.description || "",
        api_id: item.api_id || "",
        informational: item.informational === true || item.informational === "true",
      };
    })
    .filter((item) => item && item.type);
}

function hazardConfidence(precision) {
  if (precision === "exact" || precision === "address") return "高";
  if (precision === "nearby") return "中";
  return "低";
}

function analyzeLegalNotice(listing) {
  const text = listingText(listing);
  const roadProfile = extractRoadProfile(text);
  const roadWidth = roadProfile.width_m;
  const hasSetbackText = /セットバック|要後退|道路後退|SB/i.test(text);
  const setbackNegative = /セットバック\s*(?:不要|なし|無し|無)|道路後退\s*(?:不要|なし|無し|無)/.test(text);
  const setbackRequired = !setbackNegative && ((roadWidth !== null && roadWidth < 4) || /要セットバック|セットバック(?:有|あり|要)/.test(text));
  const hasDisclosure = hasDisclosureNotice(text);
  const roadNotes = [];

  if (roadWidth !== null) {
    roadNotes.push(`接道幅員 ${formatNumber(roadWidth)}m`);
  }
  if (roadProfile.direction) {
    roadNotes.push(`接道方角 ${roadProfile.direction}`);
  }
  if (roadProfile.frontage_m !== null) {
    roadNotes.push(`接面 ${formatNumber(roadProfile.frontage_m)}m`);
  }
  if (roadProfile.raw_text) {
    roadNotes.push(`掲載記載: ${escapeHtml(roadProfile.raw_text)}`);
  }
  if (setbackRequired) {
    roadNotes.push("4m未満または掲載文にセットバック関連記載あり。要セットバック候補です。");
  } else if (hasSetbackText) {
    roadNotes.push("セットバック関連の記載があります。内容確認が必要です。");
  }
  if (/43条但書|43条ただし書|43条但し書|再建築/.test(text)) {
    roadNotes.push("再建築・43条但書に関する記載があります。");
  }

  return {
    road_width_m: roadWidth,
    road_direction: roadProfile.direction,
    road_frontage_m: roadProfile.frontage_m,
    setback_required: setbackRequired,
    setback_text: setbackRequired ? "要セットバック候補" : hasSetbackText ? "セットバック記載あり" : "未検出",
    road_text: roadNotes.length ? roadNotes.join("<br>") : "接道幅員の明記は未検出",
    disclosure_found: hasDisclosure,
    disclosure_text: hasDisclosure ? "告知事項ありの記載を検出" : "未検出",
  };
}

function listingText(listing) {
  return [listing.title, listing.address, listing.zoning, listing.restrictions, listing.remarks, listing.road_details, listing.search_text]
    .filter(Boolean)
    .join(" ");
}

function extractRoadWidthMeters(text) {
  return extractRoadProfile(text).width_m;
}

function extractRoadProfile(text) {
  const normalized = String(text || "").replace(/ｍ/g, "m").replace(/メートル/g, "m").replace(/[０-９．]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
  const rawText = extractRoadSituationText(normalized);
  const widthPatterns = [
    /(?:道路幅員|幅員|道幅|前面道路)[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)\s*m/gi,
    /接道状況[^。|,、]{0,90}?([0-9]+(?:\.[0-9]+)?)\s*m[^。|,、]{0,24}(?:道路|公道|私道|市道|県道|国道)/gi,
    /([0-9]+(?:\.[0-9]+)?)\s*m\s*(?:道路|公道|私道|市道|県道|国道|幅員)/gi,
  ];
  const widths = [];
  for (const pattern of widthPatterns) {
    let match = pattern.exec(normalized);
    while (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0 && value <= 30) {
        widths.push(value);
      }
      match = pattern.exec(normalized);
    }
  }

  const frontageValues = [];
  const frontagePattern = /(?:接面|間口|接道間口)[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)\s*m/gi;
  let frontageMatch = frontagePattern.exec(normalized);
  while (frontageMatch) {
    const value = Number(frontageMatch[1]);
    if (Number.isFinite(value) && value > 0 && value <= 100) {
      frontageValues.push(value);
    }
    frontageMatch = frontagePattern.exec(normalized);
  }

  return {
    width_m: widths.length ? Math.min(...widths) : null,
    direction: extractRoadDirection(normalized),
    frontage_m: frontageValues.length ? Math.max(...frontageValues) : null,
    raw_text: rawText,
  };
}

function extractRoadSituationText(text) {
  const match = text.match(/(?:接道状況|接道|道路状況)\s*[:：]?\s*([^。]{2,140})/);
  if (!match) {
    return "";
  }
  return match[1]
    .split(/\s(?:価格|土地面積|坪単価|所在地|交通|用途地域|建ぺい|容積|現況|引渡|設備|備考)\s*/)[0]
    .trim();
}

function extractRoadDirection(text) {
  const directions = ["北東", "北西", "南東", "南西", "北", "南", "東", "西"];
  const target = extractRoadSituationText(text) || text;
  for (const direction of directions) {
    const pattern = new RegExp(`${direction}(?:側|向き)?`);
    const match = target.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return "";
}

function hasDisclosureNotice(text) {
  const normalized = String(text || "");
  if (/告知事項\s*(?:なし|無し|無|無[し]?)/.test(normalized)) {
    return false;
  }
  return /告知事項|告知有|告知あり|心理的瑕疵|事故物件|瑕疵物件|事件|事故|自殺|孤独死|火災/.test(normalized);
}

function offsetFor(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  const lat = (((hash % 1000) / 1000) - 0.5) * 0.014;
  const lng = ((((hash >>> 10) % 1000) / 1000) - 0.5) * 0.014;
  return { lat, lng };
}

function render() {
  if (!state.latest) {
    return;
  }
  if (els.townFilter && els.townFilter.options.length <= 1 && state.listings.length) {
    populateTownFilter();
  }
  const previousFinancialSnapshot = financialRenderSnapshot;
  financialRenderSnapshot = currentFinancialSnapshots();
  try {
  state.filtered = sortListings(filterListings(state.listings));
  renderSummary();
  renderBackupSummary();
  updateHazardAreaControl();
  renderList();
  renderDashboard();
  renderHistory();
  renderDistribution();
  renderCompare();
  renderCollectionHistory();
  renderMap();
  if (window.lucide) {
    window.lucide.createIcons();
  }
  } finally { financialRenderSnapshot = previousFinancialSnapshot; }
}

function renderFromFirstListPage() {
  state.listPage = 1;
  render();
}

function filterListings(listings, ignoreFinancialRanges = false) {
  const query = normalizeQuery(els.searchInput.value);
  const townFilter = els.townFilter?.value || "";
  const schoolFilter = els.schoolFilter.value;
  const priceRange = inputRange(els.priceMin.value, els.priceMax.value);
  const areaRange = inputRange(els.areaMin.value, els.areaMax.value);
  return listings.filter((listing) => {
    const excluded = isExcluded(listing);
    if (els.showExcluded?.checked && !excluded) {
      return false;
    }
    if (!els.showExcluded?.checked && excluded) {
      return false;
    }
    if (els.favoriteOnly?.checked && !isFavorite(listing)) {
      return false;
    }
    if (els.candidateOnly?.checked && !isCandidate(listing)) {
      return false;
    }
    if (townFilter && listingTownName(listing) !== townFilter) {
      return false;
    }
    const haystack = normalizeQuery(
      [
        listing.search_text,
        listing.title,
        listing.town,
        listing.address,
        listing.parcel_number,
        listing.source,
        listing.zoning,
        listing.restrictions,
        listing.remarks,
      ]
        .filter(Boolean)
        .join(" ")
    );
    if (query && !haystack.includes(query)) {
      return false;
    }
    if (!ignoreFinancialRanges && !withinRange(hasConfirmedFinancials(listing) ? listing.price_man_yen : null, priceRange)) {
      return false;
    }
    if (!ignoreFinancialRanges && !withinRange(hasConfirmedFinancials(listing) ? listing.land_area_tsubo : null, areaRange)) {
      return false;
    }
    if (schoolFilter && !matchesSchoolFilter(listing, schoolFilter)) {
      return false;
    }
    if (els.newOnly.checked && !listing.is_new) {
      return false;
    }
    if (els.cheapOnly.checked && !listing.is_cheap_new) {
      return false;
    }
    if (els.priceDropOnly?.checked && !priceDropInfo(listing)) {
      return false;
    }
    return true;
  });
}

function sortListings(listings) {
  const value = els.sortSelect.value;
  const fields = { price: "price_man_yen", area: "land_area_sqm", unit: "unit_price_man_per_tsubo" };
  return [...listings].sort((a, b) => {
    for (const [prefix, field] of Object.entries(fields)) {
      if (value === `${prefix}Asc` || value === `${prefix}Desc`) return compareFinancialNumber(a, b, field, value.endsWith("Desc"));
    }
    return newRank(b) - newRank(a) || dateRank(b.first_seen_date) - dateRank(a.first_seen_date) || compareFinancialNumber(a, b, "unit_price_man_per_tsubo");
  });
}

function newRank(listing) {
  return (listing.is_new ? 4 : 0) + (listing.is_cheap_new ? 2 : 0);
}

function dateRank(value) {
  return value ? new Date(value).getTime() : 0;
}

function hasConfirmedFinancials(listing) {
  return !financialCalculationHeld(listing) && financialEvidence(listing) && (listing.financial_state == null || ["confirmed", "listing_observed"].includes(listing.financial_state));
}

function priceDropInfo(listing) {
  if (!hasConfirmedFinancials(listing)) return null;
  const current = numberValue(listing.price_man_yen);
  const history = safePriceHistory({ latest: listing, price_history: listing.price_history });
  if (!current || history.length < 2) {
    return null;
  }
  const normalized = history
    .map((entry) => ({
      date: entry.date || entry.observed_at || "",
      price: numberValue(entry.price_man_yen ?? entry.price ?? entry.value),
    }))
    .filter((entry) => entry.price > 0);
  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const previous = normalized[index];
    if (previous.price > current) {
      const amount = previous.price - current;
      return {
        previous: previous.price,
        current,
        amount,
        rate: amount / previous.price,
        date: previous.date,
      };
    }
  }
  return null;
}

function priceDropSummary(drop) {
  if (!drop) {
    return "-";
  }
  const rateText = Number.isFinite(drop.rate) ? ` / ${formatNumber(drop.rate * 100)}%` : "";
  return `${formatPrice(drop.amount)}値下げ${rateText}`;
}

function priceDropDetailText(drop) {
  if (!drop) {
    return "-";
  }
  const dateText = drop.date ? `（前回 ${escapeHtml(drop.date)}）` : "";
  return `${formatPrice(drop.amount)}値下げ / ${formatPrice(drop.previous)} → ${formatPrice(drop.current)}${dateText}`;
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function inputRange(minValue, maxValue) {
  const min = Number.isFinite(Number(minValue)) && String(minValue).trim() !== "" ? Number(minValue) : null;
  const max = Number.isFinite(Number(maxValue)) && String(maxValue).trim() !== "" ? Number(maxValue) : null;
  if (min !== null && max !== null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

function withinRange(value, range) {
  if (range.min === null && range.max === null) return true;
  if (!Number.isFinite(value) || value <= 0) {
    return false;
  }
  if (range.min !== null && value < range.min) {
    return false;
  }
  if (range.max !== null && value > range.max) {
    return false;
  }
  return true;
}

function renderSummary() {
  const latestSummary = currentFinancialSnapshots().current.summary;
  els.listingCount.textContent = `${formatInteger(latestSummary.listing_count || state.listings.length)}件`;
  const presencePending = state.listings.filter(listingPresencePending).length;
  const countLabel = els.listingCount.parentElement?.querySelector(".summary-label");
  if (countLabel) countLabel.textContent = presencePending ? `表示（要再確認${presencePending}）` : "表示";
  if (els.currentAverage) {
    els.currentAverage.textContent = formatUnit(latestSummary.overall_average_unit_price_man_per_tsubo);
  }
  if (els.historyAverage) {
    const historySummary = currentFinancialSnapshots().history.summary;
    els.historyAverage.textContent = formatUnit(historySummary.historical_average_unit_price_man_per_tsubo);
  }
  els.updatedAt.textContent = formatDateTime(state.latest.generated_at);
  renderFixedAssetRouteStatus();
}

function renderFixedAssetRouteStatus() {
  if (!els.fixedAssetRouteCount || !els.fixedAssetRouteMeta || !els.fixedAssetRouteDetail) {
    return;
  }
  const items = (Array.isArray(state.routeValues?.items) ? state.routeValues.items : []).filter(
    isFixedAssetRouteRecord
  );
  const summary = state.routeValues?.fixed_asset_summary || {};
  const routeCount = numberValue(summary.items || summary.rows) || items.length;
  const townNames = new Set(items.map((item) => String(item.town || "").trim()).filter(Boolean));
  const townCount = numberValue(summary.towns) || townNames.size;
  const matchedCount = state.listings.filter(
    (listing) => listing.route_value_reference?.route_value_type === "fixed_asset_tax"
  ).length;
  const areaMeshRate = numberValue(summary.collection_progress?.area_mesh?.checked_rate) || 0;
  const values = items.map(routeValueYenPerSqm).filter((value) => value > 0);
  const minValue = numberValue(summary.min_yen_per_sqm) || (values.length ? Math.min(...values) : 0);
  const maxValue = numberValue(summary.max_yen_per_sqm) || (values.length ? Math.max(...values) : 0);
  const updatedAt =
    state.routeValues?.updated_at ||
    items
      .map((item) => item.collected_at)
      .filter(Boolean)
      .sort()
      .at(-1) ||
    null;

  els.fixedAssetRouteCount.textContent = routeCount
    ? `${formatInteger(routeCount)}路線・${formatInteger(townCount)}町`
    : "参照版未確認";
  els.fixedAssetRouteMeta.textContent = routeCount
    ? `物件照合 ${formatInteger(matchedCount)}件${areaMeshRate ? `・範囲 ${formatInteger(areaMeshRate)}%` : ""}`
    : "査定には検証済み参照データが必要です";
  if (els.fixedAssetCoverageLink) {
    els.fixedAssetCoverageLink.hidden = !routeCount;
  }
  els.fixedAssetRouteDetail.innerHTML = routeCount
    ? `
        <span><b>収集路線</b>${formatInteger(routeCount)}件</span>
        <span><b>対象町名</b>${formatInteger(townCount)}町</span>
        <span><b>物件照合</b>${formatInteger(matchedCount)}件</span>
        <span><b>路線価範囲</b>${formatYenPerSqm(minValue)}〜${formatYenPerSqm(maxValue)}</span>
        <span class="route-data-updated"><b>最終更新</b>${escapeHtml(formatDateTime(updatedAt))}</span>
      `
    : `<span class="route-data-updated"><b>状況</b>毎朝の自動収集で少しずつ蓄積します</span>`;
}

function renderBackupSummary() {
  const noteCount = Object.values(state.notes).filter((value) => String(value || "").trim()).length;
  els.backupSummary.textContent = `お気に入り ${formatInteger(state.favorites.size)} / 買付候補 ${formatInteger(state.candidates.size)} / 除外 ${formatInteger(state.excluded.size)} / 写真非表示 ${formatInteger(state.hiddenImages.size)} / メモ ${formatInteger(noteCount)}`;
}

function renderList() {
  const pageCount = Math.max(1, Math.ceil(state.filtered.length / state.listPageSize));
  state.listPage = Math.min(Math.max(1, state.listPage), pageCount);
  const start = (state.listPage - 1) * state.listPageSize;
  const pageItems = state.filtered.slice(start, start + state.listPageSize);
  const end = start + pageItems.length;
  els.resultCount.textContent = state.filtered.length
    ? `${formatInteger(start + 1)}〜${formatInteger(end)}件 / 全${formatInteger(state.filtered.length)}件`
    : "0件表示";
  const priceRange = inputRange(els.priceMin.value, els.priceMax.value);
  const areaRange = inputRange(els.areaMin.value, els.areaMax.value);
  if ([priceRange.min, priceRange.max, areaRange.min, areaRange.max].some((value) => value !== null)) {
    const count = filterListings(state.listings, true).filter((row) => !hasConfirmedFinancials(row)).length;
    els.resultCount.textContent += ` / 数値未確認のため条件比較から除外 ${formatInteger(count)}件`;
  }
  els.resultCount.textContent += ` / 確認済み ${state.listings.filter(hasConfirmedFinancials).length}件・保留 ${state.listings.filter(row=>!hasConfirmedFinancials(row)).length}件`;
  els.mapReadyCount.textContent = `地図 ${formatInteger(state.filtered.filter((item) => Number.isFinite(item.map_latitude)).length)}件`;
  if (els.listPageSize) {
    els.listPageSize.value = String(state.listPageSize);
  }
  updateListLayoutButtons();
  els.listingList.className = `listing-list layout-${state.listLayout}`;
  if (!state.filtered.length) {
    els.listingList.innerHTML = `<div class="empty-state">該当する物件がありません</div>`;
    renderListPagination(pageCount);
    return;
  }
  if (state.listLayout === "compact") {
    els.listingList.innerHTML = pageItems.map(renderListingCompact).join("");
  } else if (state.listLayout === "table") {
    els.listingList.innerHTML = renderListingTable(pageItems);
  } else {
    els.listingList.innerHTML = pageItems.map(renderListingCard).join("");
  }
  bindListingActions(els.listingList);
  bindTableScroll(els.listingList);
  renderListPagination(pageCount);
}

function updateListLayoutButtons() {
  els.listLayoutControl?.querySelectorAll("[data-list-layout]").forEach((button) => {
    const active = button.dataset.listLayout === state.listLayout;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setListPage(page, shouldScroll) {
  const pageCount = Math.max(1, Math.ceil(state.filtered.length / state.listPageSize));
  state.listPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  renderList();
  if (shouldScroll) {
    document.getElementById("listView")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderListPagination(pageCount) {
  if (!els.listPagination) {
    return;
  }
  if (!state.filtered.length || pageCount <= 1) {
    els.listPagination.innerHTML = "";
    return;
  }
  const pages = visibleListPages(state.listPage, pageCount);
  els.listPagination.innerHTML = `
    <button class="pagination-button" type="button" data-list-page="${state.listPage - 1}" ${state.listPage <= 1 ? "disabled" : ""}>前へ</button>
    <div class="pagination-pages">
      ${pages
        .map((page) =>
          page === "gap"
            ? `<span class="pagination-gap">…</span>`
            : `<button class="pagination-button ${page === state.listPage ? "active" : ""}" type="button" data-list-page="${page}" aria-current="${page === state.listPage ? "page" : "false"}">${formatInteger(page)}</button>`
        )
        .join("")}
    </div>
    <button class="pagination-button" type="button" data-list-page="${state.listPage + 1}" ${state.listPage >= pageCount ? "disabled" : ""}>次へ</button>
  `;
}

function visibleListPages(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    if (index === 0 || page - sorted[index - 1] === 1) {
      return [page];
    }
    return ["gap", page];
  });
}

function renderListingCard(listing) {
  const color = unitColorClass(listing.unit_price_man_per_tsubo);
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const drop = priceDropInfo(listing);
  return `
    <article class="listing-card ${color}" data-open-listing="${escapeAttr(listing.id)}" tabindex="0" role="button" aria-label="${escapeAttr(`${shortTitle(listing)}の詳細を開く`)}">
      ${renderCardImage(listing)}
      <div class="card-head">
        <div>
          <p class="town-line">${escapeHtml(listing.town)} / ${escapeHtml(listing.source)}</p>
          <h2 class="card-title">${escapeHtml(shortTitle(listing))}</h2>
        </div>
        <div class="badge-row">${renderBadges(listing)}</div>
      </div>
      <div class="price-grid">
        ${metric("価格", formatPrice(listing.price_man_yen))}
        ${metric("面積", `${formatMeasure(listing.land_area_tsubo, "坪")}`)}
        ${metric("坪単価", formatUnit(listing.unit_price_man_per_tsubo))}
        ${metric("割安スコア", `${formatAssessmentScore(score.score)}`)}
        ${drop ? metric("価格改定", priceDropSummary(drop)) : ""}
      </div>
      <div class="card-foot">
        <span class="source">${escapeHtml(listing.address || "-")}</span>
        <div class="card-actions">
          ${actionButton("favorite", listing.id, isFavorite(listing), "star", "お気に入り")}
          ${actionButton("candidate", listing.id, isCandidate(listing), "clipboard-check", "買付候補")}
          ${actionButton("exclude", listing.id, isExcluded(listing), "eye-off", "除外")}
          ${detailButton(listing.id)}
        </div>
      </div>
    </article>
  `;
}

function renderListingCompact(listing) {
  const color = unitColorClass(listing.unit_price_man_per_tsubo);
  const school = resolveSchoolInfo(listing);
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const drop = priceDropInfo(listing);
  return `
    <article class="listing-card listing-compact ${color}" data-open-listing="${escapeAttr(listing.id)}" tabindex="0" role="button" aria-label="${escapeAttr(`${shortTitle(listing)}の詳細を開く`)}">
      ${renderCompactImage(listing)}
      <div class="compact-main">
        <div class="compact-head">
          <div>
            <p class="town-line">${escapeHtml(listing.town)} / ${escapeHtml(listing.source)}</p>
            <h2 class="card-title">${escapeHtml(shortTitle(listing))}</h2>
          </div>
          <div class="badge-row">${renderBadges(listing)}</div>
        </div>
        <div class="compact-metrics">
          <strong>${formatPrice(listing.price_man_yen)}</strong>
          <span>${formatMeasure(listing.land_area_tsubo, "坪")}</span>
          <span>${formatUnit(listing.unit_price_man_per_tsubo)}</span>
          <span>AI ${formatAssessmentScore(score.score)}</span>
          ${drop ? `<span>${escapeHtml(priceDropSummary(drop))}</span>` : ""}
          <span>${escapeHtml(school.elementary_text)} / ${escapeHtml(school.middle_text)}</span>
        </div>
        <div class="compact-foot">
          <span class="source">${escapeHtml(listing.address || "-")}</span>
          <div class="card-actions">
            ${actionButton("favorite", listing.id, isFavorite(listing), "star", "お気に入り")}
            ${actionButton("candidate", listing.id, isCandidate(listing), "clipboard-check", "買付候補")}
            ${actionButton("exclude", listing.id, isExcluded(listing), "eye-off", "除外")}
            ${detailButton(listing.id, "compact")}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderCompactImage(listing) {
  const imageUrls = imageUrlList(listing);
  if (!imageUrls.length) {
    return `
      <figure class="compact-thumb compact-fallback">
        <i data-lucide="map-pin"></i>
        <span>${escapeHtml(listing.town || "都城市")}</span>
      </figure>
    `;
  }
  return `
    <figure class="compact-thumb" data-fallback-town="${escapeAttr(listing.town || "都城市")}">
      <img src="${escapeAttr(imageUrls[0])}" data-images="${escapeAttr(JSON.stringify(imageUrls))}" data-image-index="0" alt="${escapeAttr(`${listing.town}の土地写真`)}" loading="lazy" referrerpolicy="no-referrer" onerror="swapBrokenImage(this);">
      ${imageUrls.length > 1 ? `<span class="image-count compact">${formatInteger(imageUrls.length)}</span>` : ""}
      ${renderHideImageButton(imageUrls[0], true)}
    </figure>
  `;
}

function renderListingTable(listings) {
  return `
    <div class="list-table-wrap" data-table-scroll tabindex="0" aria-label="物件一覧表">
      <div class="list-table-scroll-inner">
      <table class="listing-table">
        <thead>
          <tr>
            <th>物件</th>
            <th>価格</th>
            <th>面積</th>
            <th>坪単価</th>
            <th>学校区</th>
            <th>判定</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${listings.map(renderListingTableRow).join("")}
        </tbody>
      </table>
      </div>
    </div>
  `;
}

function renderListingTableRow(listing) {
  const school = resolveSchoolInfo(listing);
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const drop = priceDropInfo(listing);
  const positionText = Number.isFinite(listing.map_latitude) ? (listing.is_approx_position ? "概算位置" : "地図あり") : "地図なし";
  return `
    <tr>
      <td>
        <strong>${escapeHtml(shortTitle(listing))}</strong>
        <span>${escapeHtml(listing.town)} / ${escapeHtml(listing.source)}</span>
        <small>${escapeHtml(listing.address || "-")}</small>
      </td>
      <td><strong>${formatPrice(listing.price_man_yen)}</strong></td>
      <td><strong>${formatMeasure(listing.land_area_tsubo, "坪")}</strong><span>${formatMeasure(listing.land_area_sqm, "㎡")}</span></td>
      <td><strong>${formatUnit(listing.unit_price_man_per_tsubo)}</strong></td>
      <td><span>${escapeHtml(school.elementary_text)}</span><small>${escapeHtml(school.middle_text)}</small></td>
      <td>
        <strong>${escapeHtml(assessment.label)}</strong>
        <span>AI ${formatAssessmentScore(score.score)}</span>
        ${drop ? `<small>${escapeHtml(priceDropSummary(drop))}</small>` : ""}
        <span>${escapeHtml(positionText)}</span>
        <div class="badge-row table-badges">${renderBadges(listing)}</div>
      </td>
      <td>
        <div class="table-actions">
          ${actionButton("favorite", listing.id, isFavorite(listing), "star", "お気に入り")}
          ${actionButton("candidate", listing.id, isCandidate(listing), "clipboard-check", "買付候補")}
          ${detailButton(listing.id, "compact")}
        </div>
      </td>
    </tr>
  `;
}

function actionButton(action, id, active, icon, label) {
  const activeLabels = {
    favorite: "お気に入り済",
    candidate: "候補済",
    exclude: "除外中",
  };
  const showActiveState = active && label !== "外す";
  const displayLabel = showActiveState ? activeLabels[action] || label : label;
  const displayIcon = showActiveState ? "check" : icon;
  return `
    <button class="action-chip action-${escapeAttr(action)} ${active ? "active" : ""}" type="button" data-toggle-${action}="${escapeAttr(id)}" aria-pressed="${active}">
      <i data-lucide="${displayIcon}"></i><span>${displayLabel}</span>
    </button>
  `;
}

function detailButton(id, extraClass = "") {
  return `
    <a class="detail-link ${escapeAttr(extraClass)}" href="${escapeAttr(detailHash(id))}" data-detail-id="${escapeAttr(id)}">
      詳細
    </a>
  `;
}


function bindTableScroll(root) {
  const wrap = root.querySelector("[data-table-scroll]");
  if (!wrap) {
    return;
  }
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let dragging = false;
  let moved = false;
  const stopOpenAfterDrag = () => {
    state.tableScrollSuppressUntil = Date.now() + 450;
  };
  const endDrag = () => {
    if (moved) {
      stopOpenAfterDrag();
    }
    dragging = false;
    moved = false;
    wrap.classList.remove("is-dragging");
  };
  const beginDrag = (clientX, clientY) => {
    dragging = true;
    moved = false;
    startX = clientX;
    startY = clientY;
    startLeft = wrap.scrollLeft;
    wrap.classList.add("is-dragging");
  };
  const moveDrag = (clientX, clientY, event) => {
    if (!dragging) {
      return;
    }
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (Math.abs(dx) < 4 || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    moved = true;
    wrap.scrollLeft = startLeft - dx;
    stopOpenAfterDrag();
    event.preventDefault();
    event.stopPropagation();
  };
  wrap.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    beginDrag(event.clientX, event.clientY);
    try {
      wrap.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort; native scrolling still works without it.
    }
  });
  wrap.addEventListener("pointermove", (event) => moveDrag(event.clientX, event.clientY, event), { passive: false });
  wrap.addEventListener("pointerup", endDrag);
  wrap.addEventListener("pointercancel", endDrag);
  wrap.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    beginDrag(event.clientX, event.clientY);
    const onMove = (moveEvent) => moveDrag(moveEvent.clientX, moveEvent.clientY, moveEvent);
    const onEnd = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onEnd, true);
      endDrag();
    };
    document.addEventListener("mousemove", onMove, { capture: true, passive: false });
    document.addEventListener("mouseup", onEnd, true);
  });
  wrap.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }
    beginDrag(touch.clientX, touch.clientY);
  }, { passive: true });
  wrap.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }
    moveDrag(touch.clientX, touch.clientY, event);
  }, { passive: false });
  wrap.addEventListener("touchend", endDrag);
  wrap.addEventListener("touchcancel", endDrag);
  wrap.addEventListener("click", (event) => {
    if (Date.now() <= (state.tableScrollSuppressUntil || 0)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}
function bindListingActions(root) {
  void root;
}

function toggleSavedSet(kind, id) {
  const set = state[kind];
  if (!set || !id) {
    return;
  }
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  saveStoredSet(STORAGE_KEYS[kind], set);
  render();
  if (state.view === "detail" && state.currentDetailId) {
    openDetail(state.currentDetailId);
  }
}

function hideImageUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return;
  }
  state.hiddenImages.add(normalized);
  saveStoredSet(STORAGE_KEYS.hiddenImages, state.hiddenImages);
  renderBackupSummary();
  render();
  if (state.view === "detail" && state.currentDetailId) {
    openDetail(state.currentDetailId);
  }
  setStatus("この写真を非表示にしました。区画図や測量図は残せます。");
}

function isFavorite(listing) {
  return state.favorites.has(String(listing.id));
}

function isCandidate(listing) {
  return state.candidates.has(String(listing.id));
}

function isExcluded(listing) {
  return state.excluded.has(String(listing.id));
}

function userNote(listing) {
  return String(state.notes[String(listing.id)] || "").trim();
}

function listingDataQuality(listing) {
  if (!hasConfirmedFinancials(listing)) return { score: 0, level: "low", financial_pending: true, reasons: ["価格・面積未確認（査定保留）"] };
  const reasons = [];
  let score = 100;
  const price = numberValue(listing.price_man_yen);
  const areaTsubo = numberValue(listing.land_area_tsubo);
  const areaSqm = numberValue(listing.land_area_sqm);
  const unit = numberValue(listing.unit_price_man_per_tsubo);
  if (!price) {
    score -= 25;
    reasons.push("価格未取得");
  }
  if (!areaTsubo && !areaSqm) {
    score -= 25;
    reasons.push("面積未取得");
  }
  if (!unit) {
    score -= 22;
    reasons.push("坪単価未取得");
  }
  if (price && areaTsubo && unit) {
    const calculatedUnit = price / areaTsubo;
    const diffRate = Math.abs(calculatedUnit - unit) / Math.max(unit, calculatedUnit, 1);
    if (diffRate > 0.15) {
      score -= 22;
      reasons.push(`価格/面積/坪単価の整合性要確認（計算 ${formatUnit(calculatedUnit)}）`);
    }
  }
  if (!imageUrlList(listing).length) {
    score -= /アットホーム|athome/i.test(`${listing.source || ""} ${listing.source_url || ""}`) ? 12 : 8;
    reasons.push("写真未取得");
  }
  if (!Number.isFinite(listing.map_latitude) || !Number.isFinite(listing.map_longitude)) {
    score -= 16;
    reasons.push("地図位置未取得");
  } else if (listing.is_approx_position) {
    score -= 12;
    reasons.push("地図位置が概算");
  }
  if (!listing.route_value_reference) {
    score -= 12;
    reasons.push("路線価未照合");
  } else {
    const distance = routeValueReferenceDistanceKm(listing.route_value_reference);
    if (distance !== null && distance > 0.25) {
      score -= 10;
      reasons.push(`路線価参照地点が遠い（約${formatNumber(distance)}km）`);
    }
    if (listing.route_value_reference.route_value_type !== "fixed_asset_tax") {
      score -= 4;
      reasons.push("固定資産税路線価以外を参照");
    }
  }
  if (!numberValue(listing.legal_notice?.road_width_m)) {
    score -= 6;
    reasons.push("接道幅員未検出");
  }
  if (listing.legal_notice?.setback_required) {
    score -= 6;
    reasons.push("要セットバック");
  }
  if (listing.legal_notice?.disclosure_found) {
    score -= 10;
    reasons.push("告知事項あり");
  }
  if (listing.hazard_reference?.affected) {
    score -= 8;
    reasons.push("ハザード該当");
  }
  if (numberValue(listing.floor_area_ratio_percent) === 70) {
    score -= 8;
    reasons.push("容積率70%は要確認");
  }
  const normalizedScore = Math.round(clamp(score, 0, 100));
  return {
    score: normalizedScore,
    level: normalizedScore >= 82 ? "high" : normalizedScore >= 62 ? "medium" : "low",
    reasons: reasons.length ? reasons : ["主要データはおおむね取得済み"],
  };
}

function dataQualityLabel(quality) {
  if (!quality) return "未判定";
  if (quality.financial_pending) return "価格・面積未確認";
  if (quality.level === "high") return "高信頼";
  if (quality.level === "medium") return "通常確認";
  return "要確認";
}

function renderCardImage(listing) {
  const imageUrls = imageUrlList(listing);
  if (!imageUrls.length) {
    return `<figure class="listing-photo fallback-photo">${renderPhotoFallback(listing)}</figure>`;
  }
  return `
    <figure class="listing-photo image-frame">
      ${renderPhotoFallback(listing)}
      <img src="${escapeAttr(imageUrls[0])}" data-images="${escapeAttr(JSON.stringify(imageUrls))}" data-image-index="0" alt="${escapeAttr(`${listing.town}の土地写真`)}" loading="lazy" referrerpolicy="no-referrer" onerror="swapBrokenImage(this);">
      ${imageUrls.length > 1 ? `<span class="image-count">${formatInteger(imageUrls.length)}枚</span>` : ""}
      ${renderHideImageButton(imageUrls[0])}
    </figure>
  `;
}

function renderHideImageButton(url, compact = false, extraClass = "") {
  if (!url) {
    return "";
  }
  return `
    <button class="image-hide-button ${compact ? "compact" : ""} ${escapeAttr(extraClass)}" type="button" data-hide-image="${escapeAttr(url)}" aria-label="この写真を非表示">
      <i data-lucide="eye-off"></i><span>非表示</span>
    </button>
  `;
}

function renderPhotoFallback(listing, detail = false) {
  return `
    <div class="fallback-visual ${detail ? "large" : ""}">
      <div class="fallback-lines" aria-hidden="true">
        <span class="road road-a"></span>
        <span class="road road-b"></span>
        <span class="road road-c"></span>
      </div>
      <div class="fallback-pin"><i data-lucide="map-pin"></i></div>
      <div class="fallback-text">
        <span>写真未取得</span>
        <strong>${escapeHtml(listing.town || "都城市")}</strong>
        <small>${formatPrice(listing.price_man_yen)} / ${formatUnit(listing.unit_price_man_per_tsubo)}</small>
      </div>
    </div>
  `;
}

function listingPresencePending(listing) {
  return ["not_observed_coverage_unknown", "end_candidate", "not_in_public_inventory"].includes(listing.listing_status);
}

function listingPresenceLabel(listing) {
  if (listingPresencePending(listing)) return "掲載状況 要再確認（掲載終了ではありません）";
  return listing.listing_status === "listed" || listing.is_currently_listed === true ? "今回の一覧で観測" : "掲載状況 未確認";
}

function renderBadges(listing) {
  const badges = [];
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const quality = listingDataQuality(listing);
  const drop = priceDropInfo(listing);
  if (listingPresencePending(listing)) badges.push(`<span class="badge warning">掲載状況 要再確認</span>`);
  if (isFavorite(listing)) badges.push(`<span class="badge favorite">お気に入り</span>`);
  if (isCandidate(listing)) badges.push(`<span class="badge candidate">買付候補</span>`);
  if (isExcluded(listing)) badges.push(`<span class="badge warning">除外</span>`);
  if (score.score >= 70) badges.push(`<span class="badge score">AI ${formatAssessmentScore(score.score)}</span>`);
  if (drop) badges.push(`<span class="badge cheap">値下げ</span>`);
  if (userNote(listing)) badges.push(`<span class="badge approx">メモ</span>`);
  if (listing.is_new) badges.push(`<span class="badge new">新着</span>`);
  if (!hasConfirmedFinancials(listing)) badges.push(`<span class="badge pending">価格・面積未確認 / 査定保留</span>`);
  if (hasConfirmedFinancials(listing) && listing.is_cheap_new) badges.push(`<span class="badge cheap">割安新着</span>`);
  if (assessment.discount_rate >= 0.1) badges.push(`<span class="badge cheap">査定割安</span>`);
  if (quality.level === "low") badges.push(`<span class="badge warning">要確認</span>`);
  if (listing.legal_notice?.setback_required) badges.push(`<span class="badge warning">要SB</span>`);
  if (listing.legal_notice?.disclosure_found) badges.push(`<span class="badge warning">告知</span>`);
  if (listing.hazard_reference?.affected) badges.push(`<span class="badge warning">ハザード</span>`);
  if (listing.route_value_reference) badges.push(`<span class="badge approx">路線価</span>`);
  if (listing.is_approx_position) badges.push(`<span class="badge approx">概算</span>`);
  return badges.join("");
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function initMap() {
  if (state.map || !window.L) {
    return;
  }
  state.map = L.map("map", { zoomControl: false }).setView(CITY_CENTER, 10);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  state.mapBaseLayers = createMapBaseLayers();
  selectedMapLayer(state.mapBaseLayers).addTo(state.map);
  L.control.layers(state.mapBaseLayers, null, {
    position: "topright",
    collapsed: false,
  }).addTo(state.map);
  state.map.on("baselayerchange", (event) => saveMapLayerType(mapLayerTypeFromLabel(event.name)));
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.hazardAreaLayer = L.layerGroup().addTo(state.map);
  state.fixedAssetCoverageLayer = L.layerGroup().addTo(state.map);
  fitMapToCity(state.map);
}

function cityLatLngBounds() {
  return L.latLngBounds(CITY_BOUNDS);
}

function fitMapToCity(map) {
  map.fitBounds(cityLatLngBounds(), { padding: [16, 16], maxZoom: 10 });
}

function createMapBaseLayers() {
  return Object.entries(MAP_LAYER_DEFS).reduce((layers, [type, definition]) => {
    layers[definition.label] = L.tileLayer(definition.url, definition.options);
    layers[definition.label]._mapLayerType = type;
    return layers;
  }, {});
}

function selectedMapLayer(baseLayers) {
  const type = normalizeMapLayerType(state.mapLayerType);
  const label = MAP_LAYER_DEFS[type].label;
  return baseLayers[label] || baseLayers[MAP_LAYER_DEFS.standard.label];
}

function mapLayerTypeFromLabel(label) {
  const entry = Object.entries(MAP_LAYER_DEFS).find(([, definition]) => definition.label === label);
  return entry ? entry[0] : "standard";
}

function saveMapLayerType(type) {
  state.mapLayerType = normalizeMapLayerType(type);
  localStorage.setItem(STORAGE_KEYS.mapLayerType, state.mapLayerType);
}

function renderMap() {
  initMap();
  if (!state.map || !state.markerLayer) {
    return;
  }
  state.markerLayer.clearLayers();
  state.markers = [];
  renderHazardAreas();
  renderFixedAssetCoverage();
  state.filtered.forEach((listing) => {
    if (!Number.isFinite(listing.map_latitude) || !Number.isFinite(listing.map_longitude)) {
      return;
    }
    const marker = L.marker([listing.map_latitude, listing.map_longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="map-pin ${unitColorClass(listing.unit_price_man_per_tsubo)} ${listing.is_new ? "new" : ""}">${escapeHtml(listing.town.slice(0, 1))}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    });
    marker.bindPopup(renderPopup(listing));
    marker.on("click", () => {
      state.map?.closePopup();
      navigateToDetail(listing.id);
    });
    marker.addTo(state.markerLayer);
    state.markers.push(marker);
  });
  if (state.markers.length) {
    const group = L.featureGroup(state.markers);
    const markerBounds = group.getBounds().pad(0.08);
    const cityBounds = cityLatLngBounds();
    const outsideCity =
      !cityBounds.contains(markerBounds.getSouthWest()) || !cityBounds.contains(markerBounds.getNorthEast());
    const overviewMode = outsideCity;
    state.map.fitBounds(overviewMode ? cityBounds : markerBounds, {
      padding: [16, 16],
      maxZoom: overviewMode ? 10 : 12,
    });
  } else {
    fitMapToCity(state.map);
  }
  if (state.focusFixedAssetCoverage) {
    fitMapToFixedAssetCoverage();
    state.focusFixedAssetCoverage = false;
  }
}

function fixedAssetCoverageItems() {
  const items = Array.isArray(state.routeValues?.items) ? state.routeValues.items : [];
  return items.filter(isFixedAssetRouteRecord).filter((item) => {
    const latitude = Number(item.latitude ?? item.lat);
    const longitude = Number(item.longitude ?? item.lng);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  });
}

function renderFixedAssetCoverage() {
  updateFixedAssetCoverageControl();
  if (!state.map || !window.L) {
    return;
  }
  if (!state.fixedAssetCoverageLayer) {
    state.fixedAssetCoverageLayer = L.layerGroup().addTo(state.map);
  }
  state.fixedAssetCoverageLayer.clearLayers();
  if (!state.showFixedAssetCoverage) {
    return;
  }
  fixedAssetCoverageItems().forEach((item) => {
    const latitude = Number(item.latitude ?? item.lat);
    const longitude = Number(item.longitude ?? item.lng);
    const value = routeValueYenPerSqm(item);
    const town = item.town || item.address || "町名未登録";
    const routeId = item.fixed_asset_route_id || item.route_id || item.id || "";
    const popup = [
      `<strong>固定資産税路線価 取得済み</strong>`,
      `<br>${escapeHtml(town)}`,
      value ? `<br>${escapeHtml(formatYenPerSqm(value))}` : "",
      routeId ? `<br>路線ID ${escapeHtml(routeId)}` : "",
      `<br><small>色付き範囲は取得地点から半径約250mの目安です</small>`,
    ].join("");
    L.circle([latitude, longitude], {
      radius: 250,
      color: "#1769e0",
      weight: 2,
      opacity: 0.9,
      fillColor: "#18a999",
      fillOpacity: 0.2,
    })
      .bindPopup(popup)
      .addTo(state.fixedAssetCoverageLayer);
    L.circleMarker([latitude, longitude], {
      radius: 4,
      color: "#ffffff",
      weight: 2,
      fillColor: "#1769e0",
      fillOpacity: 1,
    })
      .bindPopup(popup)
      .addTo(state.fixedAssetCoverageLayer);
  });
}

function fitMapToFixedAssetCoverage() {
  if (!state.map || !window.L) {
    return;
  }
  const points = fixedAssetCoverageItems().map((item) => [
    Number(item.latitude ?? item.lat),
    Number(item.longitude ?? item.lng),
  ]);
  if (!points.length) {
    fitMapToCity(state.map);
    return;
  }
  state.map.fitBounds(L.latLngBounds(points).pad(0.18), {
    padding: [20, 20],
    maxZoom: points.length === 1 ? 14 : 12,
  });
}

function updateFixedAssetCoverageControl() {
  if (els.fixedAssetCoverageToggle) {
    els.fixedAssetCoverageToggle.checked = state.showFixedAssetCoverage;
  }
  const items = fixedAssetCoverageItems();
  const towns = new Set(items.map((item) => String(item.town || "").trim()).filter(Boolean));
  if (els.fixedAssetCoverageStatus) {
    els.fixedAssetCoverageStatus.textContent = items.length
      ? `${formatInteger(items.length)}路線・${formatInteger(towns.size)}町を取得済み`
      : "固定資産税路線価を収集中";
  }
  if (els.fixedAssetCoverageLegend) {
    els.fixedAssetCoverageLegend.innerHTML = items.length
      ? `
          <span class="coverage-legend-item">
            <span class="coverage-legend-swatch"></span>
            取得済み地点周辺（半径約250m・目安）
          </span>
        `
      : "";
  }
}

function renderHazardAreas() {
  updateHazardAreaControl();
  if (!state.map || !window.L) {
    return;
  }
  if (!state.hazardAreaLayer) {
    state.hazardAreaLayer = L.layerGroup().addTo(state.map);
  }
  state.hazardAreaLayer.clearLayers();
  const features = hazardGeoJsonFeatures();
  if (!state.showHazardAreas || !features.length) {
    if (state.showHazardAreas) {
      renderHazardAffectedPoints();
    }
    return;
  }
  const layer = L.geoJSON({ type: "FeatureCollection", features }, {
    style: (feature) => hazardFeatureStyle(feature),
    onEachFeature: (feature, layerItem) => {
      const properties = feature.properties || {};
      const name = properties.type || properties.name || properties.hazard_type || "ハザードエリア";
      const level = properties.level || properties.rank || "";
      layerItem.bindPopup(`<strong>${escapeHtml(name)}</strong>${level ? `<br>${escapeHtml(level)}` : ""}`);
    },
  });
  layer.addTo(state.hazardAreaLayer);
}

function renderHazardAffectedPoints() {
  if (!state.hazardAreaLayer || !window.L) return;
  hazardAffectedPointItems().forEach((item) => {
    const lat = numberValue(item.latitude ?? item.lat);
    const lng = numberValue(item.longitude ?? item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const text = normalizeQuery((item.hazards || []).map((hazard) => `${hazard.type || ""} ${hazard.level || ""}`).join(" "));
    const color = hazardColorForText(text);
    const title = (item.hazards || []).map((hazard) => hazard.type || hazard.name || "").filter(Boolean).join(" / ") || "ハザード該当地点";
    const level = (item.hazards || []).map((hazard) => hazard.level || "").filter(Boolean).join(" / ");
    L.circle([lat, lng], {
      radius: 130,
      color,
      weight: 2,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: 0.18,
    })
      .bindPopup(`<strong>${escapeHtml(title)}</strong>${level ? `<br>${escapeHtml(level)}` : ""}<br>該当地点の概略表示`)
      .addTo(state.hazardAreaLayer);
  });
}

function updateHazardAreaControl() {
  if (els.hazardAreaToggle) {
    els.hazardAreaToggle.checked = state.showHazardAreas;
  }
  if (!els.hazardAreaStatus) {
    return;
  }
  renderHazardLegend();
  const count = hazardGeoJsonFeatures().length;
  if (count) {
    els.hazardAreaStatus.textContent = `${formatInteger(count)}エリアを表示できます`;
  } else {
    const affectedCount = hazardAffectedPointItems().length;
    if (affectedCount) {
      els.hazardAreaStatus.textContent = `${formatInteger(affectedCount)}件の該当地点を表示できます`;
      return;
    }
    els.hazardAreaStatus.textContent = "API取得後に地図上へ表示できます";
  }
}

function renderHazardLegend() {
  if (!els.hazardLegend) return;
  const legend = hazardLegendItems();
  if (!legend.length) {
    els.hazardLegend.innerHTML = "";
    return;
  }
  els.hazardLegend.innerHTML = legend
    .map(
      (item) => `
        <span class="hazard-legend-item">
          <span class="hazard-legend-swatch" style="--hazard-color:${escapeHtml(item.color)}"></span>
          ${escapeHtml(item.name)}
        </span>
      `
    )
    .join("");
}

function hazardLegendItems() {
  const zones = state.hazardZones || {};
  const configured = Array.isArray(zones.legend) ? zones.legend : [];
  const items = configured
    .map((item) => ({
      name: item.name || item.type || item.api_id || "",
      color: item.color || hazardColorForText(item.name || item.type || item.api_id || ""),
    }))
    .filter((item) => item.name);
  if (items.length) return items;
  const names = new Map();
  hazardGeoJsonFeatures().forEach((feature) => {
    const properties = feature.properties || {};
    const name = properties.type || properties.name || properties.hazard_type || "";
    if (name && !names.has(name)) names.set(name, properties.color || hazardColorForText(name));
  });
  hazardAffectedPointItems().forEach((item) => {
    (item.hazards || []).forEach((hazard) => {
      const name = hazard.type || hazard.name || "";
      if (name && !names.has(name)) names.set(name, hazardColorForText(`${name} ${hazard.level || ""}`));
    });
  });
  return Array.from(names, ([name, color]) => ({ name, color }));
}

function hazardAffectedPointItems() {
  const zones = state.hazardZones || {};
  const items = Array.isArray(zones.items) ? zones.items : Array.isArray(zones.hazards) ? zones.hazards : [];
  return items.filter((item) => {
    const hazards = Array.isArray(item?.hazards) ? item.hazards : [];
    return item?.status === "affected" || item?.affected === true || (!item?.status && hazards.length > 0);
  });
}

function hazardGeoJsonFeatures() {
  const zones = state.hazardZones || {};
  const features = [];
  appendHazardFeatures(features, zones.features);
  appendHazardFeatures(features, zones.geojson?.features);
  appendHazardFeatures(features, zones.feature_collection?.features);
  const items = Array.isArray(zones.items) ? zones.items : Array.isArray(zones.hazards) ? zones.hazards : [];
  items.forEach((item) => {
    appendHazardFeatures(features, item.features);
    appendHazardFeatures(features, item.geojson?.features);
    if (item.geometry) {
      features.push({
        type: "Feature",
        geometry: item.geometry,
        properties: {
          type: item.type || item.name || item.hazard_type || "ハザードエリア",
          level: item.level || "",
          source: item.source || zones.source || "",
        },
      });
    }
  });
  return features.filter((feature) => feature?.type === "Feature" && feature.geometry);
}

function appendHazardFeatures(target, value) {
  if (Array.isArray(value)) {
    value.forEach((feature) => {
      if (feature?.type === "Feature" && feature.geometry) {
        target.push(feature);
      }
    });
  }
}

function hazardFeatureStyle(feature) {
  const text = normalizeQuery([
    feature?.properties?.type,
    feature?.properties?.name,
    feature?.properties?.hazard_type,
    feature?.properties?.level,
  ].filter(Boolean).join(" "));
  const color = feature?.properties?.color || hazardColorForText(text);
  return {
    color,
    weight: 2,
    opacity: 0.86,
    fillColor: color,
    fillOpacity: 0.18,
  };
}

function hazardColorForText(value) {
  const text = normalizeQuery(value || "");
  if (text.includes("洪水") || text.includes("浸水") || text.includes("flood")) return "#1769e0";
  if (text.includes("高潮")) return "#0891b2";
  if (text.includes("津波")) return "#0f766e";
  if (text.includes("液状化")) return "#7c3aed";
  if (text.includes("地すべり")) return "#b45309";
  if (text.includes("急傾斜") || text.includes("土砂")) return "#dc5a2a";
  return "#dc5a2a";
}

function renderPopup(listing) {
  return `
    <p class="popup-title">${escapeHtml(shortTitle(listing))}</p>
    <p class="popup-meta">${escapeHtml(listing.address || listing.town)}</p>
    <strong>${formatPrice(listing.price_man_yen)} / ${formatUnit(listing.unit_price_man_per_tsubo)}</strong>
    ${detailButton(listing.id, "compact popup-detail")}
  `;
}

function renderHistory() {
  const rows = buildTownRows();
  const query = normalizeQuery(els.searchInput.value);
  const visibleRows = rows
    .filter((row) => !query || normalizeQuery(row.town).includes(query))
    .sort((a, b) => compareTownNames(a.town, b.town));

  els.townCount.textContent = `${formatInteger(visibleRows.length)}町表示`;
  if (!visibleRows.length) {
    els.historyGrid.innerHTML = `<div class="empty-state">町別データがありません</div>`;
    return;
  }
  els.historyGrid.innerHTML = visibleRows
    .map((row) => {
      const extremes = townUnitExtremes(row.town);
      return `
        <article class="history-row">
          <h3>${escapeHtml(row.town)}</h3>
          <div class="history-metrics">
            ${metric("現在件数", `${formatInteger(row.listing_count)}件`)}
            ${metric("現在平均", formatUnit(row.average_unit_price_man_per_tsubo))}
            ${metricDetail("最低", row.minimum_unit_price_man_per_tsubo, extremes.min)}
            ${metricDetail("最高", row.maximum_unit_price_man_per_tsubo, extremes.max)}
            ${metric("履歴件数", `${formatInteger(row.historical_unique_listing_count)}件`)}
            ${metric("履歴平均", formatUnit(row.historical_average_unit_price_man_per_tsubo))}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDistribution() {
  const values = state.filtered
    .filter(hasConfirmedFinancials)
    .map((listing) => numberValue(listing.unit_price_man_per_tsubo))
    .filter((value) => value > 0);
  if (!values.length) {
    els.distributionSummary.textContent = "0件";
    els.distributionGrid.innerHTML = `<div class="empty-state">分布を表示できる物件がありません</div>`;
    return;
  }
  const average = averageNumbers(values);
  const bins = buildDistributionBins(values);
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  els.distributionSummary.textContent = `${formatInteger(values.length)}件 / 平均 ${formatUnit(average)}`;
  els.distributionGrid.innerHTML = bins
    .map(
      (bin) => `
        <div class="distribution-row">
          <span class="distribution-label">${escapeHtml(bin.label)}</span>
          <div class="distribution-track">
            <span class="distribution-bar" style="width:${Math.max(6, (bin.count / maxCount) * 100)}%"></span>
          </div>
          <strong>${formatInteger(bin.count)}件</strong>
        </div>
      `
    )
    .join("");
}

function renderDashboard() {
  renderSchoolAverageDashboard();
  renderRecentMovementDashboard();
  renderAlertDashboard();
  renderNotificationDashboard();
  renderDataQualityDashboard();
  renderRouteCoverageDashboard();
  renderAppReadinessDashboard();
  renderDataSourceDashboard();
}

function renderSchoolAverageDashboard() {
  if (!els.schoolAverageGrid) {
    return;
  }
  const rows = buildSchoolAverageRows(state.filtered);
  els.schoolAverageSummary.textContent = `${formatInteger(rows.length)}校区 / ${formatInteger(state.filtered.length)}件`;
  if (!rows.length) {
    els.schoolAverageGrid.innerHTML = `<div class="empty-state">学校区別に集計できる物件がありません</div>`;
    return;
  }
  const maxAverage = Math.max(...rows.map((row) => row.average), 1);
  els.schoolAverageGrid.innerHTML = rows
    .slice(0, 10)
    .map(
      (row) => `
        <article class="school-average-row">
          <div>
            <h3>${escapeHtml(row.label)}</h3>
            <span>${formatInteger(row.count)}件 / 最安 ${formatUnit(row.min)} / 最高 ${formatUnit(row.max)}</span>
          </div>
          <strong>${formatUnit(row.average)}</strong>
          <div class="school-average-track">
            <span style="width:${Math.max(8, (row.average / maxAverage) * 100)}%"></span>
          </div>
        </article>
      `
    )
    .join("");
}

function buildSchoolAverageRows(listings) {
  listings = listings.filter(hasConfirmedFinancials);
  const groups = new Map();
  listings.forEach((listing) => {
    const unit = numberValue(listing.unit_price_man_per_tsubo);
    if (!unit) {
      return;
    }
    const school = resolveSchoolInfo(listing);
    const label = `${school.elementary_text} / ${school.middle_text}`;
    const values = groups.get(label) || [];
    values.push(unit);
    groups.set(label, values);
  });
  return [...groups.entries()]
    .map(([label, values]) => ({
      label,
      count: values.length,
      average: averageNumbers(values),
      min: Math.min(...values),
      max: Math.max(...values),
    }))
    .sort((a, b) => b.count - a.count || a.average - b.average || a.label.localeCompare(b.label, "ja"));
}

function renderRecentMovementDashboard() {
  if (!els.recentMovementGrid) {
    return;
  }
  const priceDrops = state.filtered.filter(priceDropInfo);
  const rows = [
    { label: "新着物件", value: `${formatInteger(state.filtered.filter((listing) => listing.is_new).length)}件`, tone: "new" },
    {
      label: "割安候補",
      value: `${formatInteger(state.filtered.filter((listing) => assessListing(listing).discount_rate >= 0.1).length)}件`,
      tone: "cheap",
    },
    { label: "値下げ検知", value: `${formatInteger(priceDrops.length)}件`, tone: "drop" },
    { label: "買付候補", value: `${formatInteger(state.candidates.size)}件`, tone: "candidate" },
    {
      label: "写真あり",
      value: `${formatInteger(state.filtered.filter((listing) => imageUrlList(listing).length).length)}件`,
      tone: "photo",
    },
  ];
  els.recentMovementGrid.innerHTML = rows.map(renderDashboardStat).join("");
}

function renderDashboardStat(row) {
  return `
    <div class="dashboard-stat ${escapeAttr(row.tone)}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `;
}

function renderAlertDashboard() {
  if (!els.alertGrid) {
    return;
  }
  const alerts = [
    {
      label: "ハザード該当",
      count: state.filtered.filter((listing) => listing.hazard_reference?.affected).length,
      tone: "danger",
    },
    {
      label: "要セットバック",
      count: state.filtered.filter((listing) => listing.legal_notice?.setback_required).length,
      tone: "warning",
    },
    {
      label: "告知事項あり",
      count: state.filtered.filter((listing) => listing.legal_notice?.disclosure_found).length,
      tone: "danger",
    },
    {
      label: "概算位置",
      count: state.filtered.filter((listing) => listing.is_approx_position).length,
      tone: "note",
    },
    {
      label: "写真なし",
      count: state.filtered.filter((listing) => !imageUrlList(listing).length).length,
      tone: "note",
    },
  ];
  els.alertGrid.innerHTML = alerts
    .map(
      (alert) => `
        <div class="dashboard-alert ${escapeAttr(alert.tone)}">
          <span>${escapeHtml(alert.label)}</span>
          <strong>${formatInteger(alert.count)}件</strong>
        </div>
      `
    )
    .join("");
}

function renderNotificationDashboard() {
  if (!els.notificationGrid || !els.notificationSummary) {
    return;
  }
  const candidates = buildNotificationCandidates(state.filtered);
  els.notificationSummary.textContent = candidates.length ? `${formatInteger(candidates.length)}件` : "通知なし";
  if (!candidates.length) {
    els.notificationGrid.innerHTML = `<div class="empty-state">今日優先して見る通知候補はありません</div>`;
    return;
  }
  els.notificationGrid.innerHTML = candidates
    .slice(0, 8)
    .map((item) => {
      const listing = item.listing;
      return `
        <article class="notification-row ${escapeAttr(item.tone)}">
          <div>
            <span class="dashboard-kicker">${escapeHtml(item.type)}</span>
            <h3>${escapeHtml(shortTitle(listing))}</h3>
            <small>${escapeHtml(listing.town)} / ${escapeHtml(listing.source)} / ${formatPrice(listing.price_man_yen)} / ${formatUnit(listing.unit_price_man_per_tsubo)}</small>
          </div>
          <strong>${escapeHtml(item.label)}</strong>
          ${detailButton(listing.id, "compact")}
        </article>
      `;
    })
    .join("");
}

function buildNotificationCandidates(listings = state.listings) {
  const rows = [];
  listings.forEach((listing) => {
    const assessment = assessListing(listing);
    const score = assessmentScore(listing, assessment);
    const drop = priceDropInfo(listing);
    if (listing.is_new && assessment.discount_rate >= 0.1) {
      rows.push({ listing, priority: 95 + score.score, type: "割安新着", label: `AI ${formatAssessmentScore(score.score)}`, tone: "cheap" });
    } else if (listing.is_new) {
      rows.push({ listing, priority: 70 + score.score, type: "新着", label: formatUnit(listing.unit_price_man_per_tsubo), tone: "new" });
    }
    if (drop) {
      rows.push({ listing, priority: 85 + Math.round(drop.rate * 100), type: "価格変更", label: priceDropSummary(drop), tone: "drop" });
    }
    if (!listing.is_new && assessment.discount_rate >= 0.18) {
      rows.push({ listing, priority: 80 + score.score, type: "割安候補", label: `${formatNumber(assessment.discount_rate * 100)}%割安`, tone: "cheap" });
    }
    if (listing.legal_notice?.disclosure_found || listing.hazard_reference?.affected || listing.legal_notice?.setback_required) {
      rows.push({ listing, priority: 65, type: "要確認", label: dataQualityLabel(listingDataQuality(listing)), tone: "warning" });
    }
  });
  const seen = new Set();
  return rows
    .sort((a, b) => b.priority - a.priority)
    .filter((row) => {
      const key = `${row.type}:${row.listing.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function maybeSendDataNotifications(force) {
  if (state.dataStale || state.dataMode !== "v2") return;
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (localStorage.getItem(STORAGE_KEYS.notificationsEnabled) !== "1") {
    return;
  }
  const reportAt = state.latest?.generated_at || state.latest?.report_date || "";
  const lastNotifiedAt = localStorage.getItem(STORAGE_KEYS.lastNotifiedAt) || "";
  if (!force && reportAt && reportAt === lastNotifiedAt) {
    return;
  }
  const candidates = buildNotificationCandidates(state.listings).slice(0, 3);
  if (!candidates.length) {
    if (reportAt) localStorage.setItem(STORAGE_KEYS.lastNotifiedAt, reportAt);
    return;
  }
  const title = "売土地 物件ビューア";
  const body = candidates.map((item) => `${item.type}: ${shortTitle(item.listing)}`).join("\n");
  try {
    new Notification(title, { body, tag: `land-viewer-${reportAt || Date.now()}` });
    if (reportAt) localStorage.setItem(STORAGE_KEYS.lastNotifiedAt, reportAt);
  } catch (error) {
    // Browser notifications are optional; the in-app notification list remains available.
  }
}

function renderDataQualityDashboard() {
  if (!els.dataQualityGrid || !els.dataQualitySummary) {
    return;
  }
  const qualities = state.filtered.map(listingDataQuality);
  const high = qualities.filter((item) => item.level === "high").length;
  const medium = qualities.filter((item) => item.level === "medium").length;
  const low = qualities.filter((item) => item.level === "low").length;
  els.dataQualitySummary.textContent = `高 ${formatInteger(high)} / 要確認 ${formatInteger(low)}`;
  const rows = [
    { label: "高信頼", value: high, sub: "価格・位置・写真・根拠が比較的そろう", tone: "ok" },
    { label: "通常確認", value: medium, sub: "一部データは確認推奨", tone: "note" },
    { label: "要確認", value: low, sub: "価格・位置・根拠の不足あり", tone: "warning" },
    { label: "概算位置", value: state.filtered.filter((listing) => listing.is_approx_position).length, sub: "地図位置の精度注意", tone: "note" },
    { label: "路線価未照合", value: state.filtered.filter((listing) => !listing.route_value_reference).length, sub: "査定根拠が弱め", tone: "warning" },
  ];
  els.dataQualityGrid.innerHTML = rows.map(renderQualityMetric).join("");
}

function renderQualityMetric(row) {
  return `
    <div class="quality-metric ${escapeAttr(row.tone)}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${formatInteger(row.value)}件</strong>
      <small>${escapeHtml(row.sub)}</small>
    </div>
  `;
}

function renderRouteCoverageDashboard() {
  if (!els.routeCoverageGrid || !els.routeCoverageSummary) {
    return;
  }
  const coverage = fixedAssetCoverageStats();
  els.routeCoverageSummary.textContent = `${formatInteger(coverage.coverageRate)}%`;
  const missingText = coverage.missingTowns.slice(0, 10).join("、") || "未取得町なし";
  els.routeCoverageGrid.innerHTML = `
    <div class="coverage-ring" style="--value:${coverage.coverageRate}">
      <strong>${formatInteger(coverage.coverageRate)}%</strong>
      <span>町名カバー</span>
    </div>
    <div class="coverage-progress-list">
      ${renderQualityMetric({ label: "取得済み", value: coverage.townCount, sub: `${formatInteger(coverage.routeCount)}路線`, tone: "ok" })}
      ${renderQualityMetric({ label: "未取得町", value: coverage.missingTowns.length, sub: missingText, tone: coverage.missingTowns.length ? "warning" : "ok" })}
      ${renderQualityMetric({ label: "物件照合", value: coverage.matchedListings, sub: "固定資産税路線価と近接照合", tone: "note" })}
    </div>
  `;
}

function fixedAssetCoverageStats() {
  const items = fixedAssetCoverageItems();
  const coveredTowns = new Set(items.map((item) => String(item.town || "").trim()).filter(Boolean));
  const targetTowns = new Set([
    ...Object.keys(TOWN_COORDS),
    ...state.listings.map((listing) => String(listing.town || "").trim()).filter(Boolean),
  ]);
  const missingTowns = [...targetTowns].filter((town) => !coveredTowns.has(town)).sort(compareTownNames);
  const coverageRate = targetTowns.size ? Math.round((coveredTowns.size / targetTowns.size) * 100) : 0;
  return {
    routeCount: items.length,
    townCount: coveredTowns.size,
    targetTownCount: targetTowns.size,
    missingTowns,
    coverageRate,
    matchedListings: state.listings.filter((listing) => listing.route_value_reference?.route_value_type === "fixed_asset_tax").length,
  };
}

function renderAppReadinessDashboard() {
  if (!els.appReadinessGrid || !els.appReadinessSummary) {
    return;
  }
  const quality = state.filtered.map(listingDataQuality);
  const low = quality.filter((item) => item.level === "low").length;
  const sourceRows = buildDataSourceRows();
  const sourceErrors = sourceRows.reduce((sum, row) => sum + Number(row.errorCount || 0), 0);
  const coverage = fixedAssetCoverageStats();
  const savedCount = state.favorites.size + state.candidates.size + state.excluded.size + Object.keys(state.notes).length;
  const checks = [
    { label: "毎日更新", ok: Boolean(state.latest?.generated_at), detail: formatDateTime(state.latest?.generated_at) },
    { label: "取得履歴", ok: Boolean(state.collectionHistory?.entries?.length), detail: `${formatInteger(state.collectionHistory?.entries?.length || 0)}回分` },
    { label: "路線価進捗", ok: coverage.coverageRate >= 50, detail: `${formatInteger(coverage.coverageRate)}%` },
    { label: "要確認物件", ok: low <= Math.max(8, state.filtered.length * 0.12), detail: `${formatInteger(low)}件` },
    { label: "収集エラー", ok: sourceErrors === 0, detail: `${formatInteger(sourceErrors)}件` },
    { label: "保存データ", ok: true, detail: `${formatInteger(savedCount)}件` },
  ];
  const okCount = checks.filter((check) => check.ok).length;
  els.appReadinessSummary.textContent = `${formatInteger(okCount)}/${formatInteger(checks.length)}`;
  els.appReadinessGrid.innerHTML = checks
    .map((check) => `
      <div class="readiness-row ${check.ok ? "ok" : "warning"}">
        <i data-lucide="${check.ok ? "check-circle-2" : "circle-alert"}"></i>
        <span>${escapeHtml(check.label)}</span>
        <strong>${escapeHtml(check.detail)}</strong>
      </div>
    `)
    .join("");
}

function renderDataSourceDashboard() {
  if (!els.dataSourceGrid) {
    return;
  }
  const rows = buildDataSourceRows();
  if (!rows.length) {
    els.dataSourceGrid.innerHTML = `<div class="empty-state">情報元データがありません</div>`;
    return;
  }
  els.dataSourceGrid.innerHTML = rows
    .map(
      (row) => `
        <article class="source-status-row">
          <div>
            <h3>${escapeHtml(row.source)}</h3>
            <span>${formatInteger(row.count)}件 / 写真 ${formatInteger(row.withImages)}件 / 地図 ${formatInteger(row.withMap)}件${row.errorCount ? ` / 注意 ${formatInteger(row.errorCount)}件` : ""}</span>
          </div>
          <strong>${formatNumber(row.imageRate * 100)}%</strong>
          <div class="source-status-track">
            <span style="width:${Math.max(4, row.imageRate * 100)}%"></span>
          </div>
        </article>
      `
    )
    .join("");
}

function buildDataSourceRows() {
  const groups = new Map();
  const sourceMeta = new Map(
    (Array.isArray(state.latest?.sources) ? state.latest.sources : []).map((source) => [
      source.name || "不明",
      Array.isArray(source.errors) ? source.errors.length : 0,
    ])
  );
  state.listings.forEach((listing) => {
    const source = listing.source || "不明";
    const row = groups.get(source) || { source, count: 0, withImages: 0, withMap: 0, errorCount: 0 };
    row.count += 1;
    row.withImages += imageUrlList(listing).length ? 1 : 0;
    row.withMap += Number.isFinite(listing.map_latitude) ? 1 : 0;
    groups.set(source, row);
  });
  sourceMeta.forEach((errorCount, source) => {
    const row = groups.get(source) || { source, count: 0, withImages: 0, withMap: 0, errorCount: 0 };
    row.errorCount = errorCount;
    groups.set(source, row);
  });
  return [...groups.values()]
    .map((row) => ({ ...row, imageRate: row.count ? row.withImages / row.count : 0 }))
    .sort((a, b) => b.count - a.count || b.imageRate - a.imageRate || a.source.localeCompare(b.source, "ja"));
}

function renderCollectionHistory() {
  if (!els.collectionHistoryList) {
    return;
  }
  const rows = buildCollectionHistoryRows();
  els.collectionHistorySummary.textContent = rows.length ? `${formatInteger(rows.length)}回分` : "履歴なし";
  if (!rows.length) {
    els.collectionHistoryList.innerHTML = `<div class="empty-state">取得データ履歴はまだありません</div>`;
    return;
  }
  els.collectionHistoryList.innerHTML = rows
    .map((row) => {
      const sources = row.sources || [];
      const warningCount = sources.reduce((sum, source) => sum + Number(source.error_count || 0), 0);
      return `
        <details class="collection-history-card">
          <summary class="collection-history-main collection-history-toggle">
            <div>
              <span class="dashboard-kicker">${escapeHtml(row.date || "取得日")}</span>
              <h3>${escapeHtml(formatFullDateTime(row.generated_at || row.date))}</h3>
              <small class="collection-history-quick">
                新着 ${formatInteger(row.new_count)}件 / 写真 ${formatInteger(row.photos?.photo_count)}枚 / 路線価範囲 ${formatInteger(row.fixed_asset_route_values?.area_mesh_rate)}%
              </small>
            </div>
            <span class="collection-history-count">
              <strong>${formatInteger(row.listing_count)}件</strong>
              <i data-lucide="chevron-down"></i>
            </span>
          </summary>
          <div class="collection-history-body">
            <div class="collection-history-metrics">
              ${renderCollectionHistoryMetric("土地情報", `${formatInteger(row.listing_count)}件`, `新着 ${formatInteger(row.new_count)}件`)}
              ${renderCollectionHistoryMetric("写真", `${formatInteger(row.photos?.listings_with_photos)}件`, `${formatInteger(row.photos?.photo_count)}枚`)}
              ${renderCollectionHistoryMetric("アットホーム写真", `${formatInteger(row.athome_photos?.with_photos)}件`, `${formatInteger(row.athome_photos?.photo_count)}枚`)}
              ${renderCollectionHistoryMetric("固定資産税路線価", `${formatInteger(row.fixed_asset_route_values?.count)}路線`, `${formatInteger(row.fixed_asset_route_values?.town_count)}町`)}
              ${renderCollectionHistoryMetric("路線価取得範囲", `${formatInteger(row.fixed_asset_route_values?.area_mesh_rate)}%`, `${formatInteger(row.fixed_asset_route_values?.area_mesh_checked)} / ${formatInteger(row.fixed_asset_route_values?.area_mesh_total)}地点`)}
              ${renderCollectionHistoryMetric("路線価照合", `${formatInteger(row.route_values?.matched_count)}件`, `確認 ${formatInteger(row.route_values?.checked_count)}件`)}
              ${renderCollectionHistoryMetric("注意", `${formatInteger(warningCount)}件`, `除外 ${formatInteger(row.excluded_count)}件`)}
            </div>
            ${renderCollectionHistorySourceDetails(sources)}
          </div>
        </details>
      `;
    })
    .join("");
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderCollectionHistoryMetric(label, value, sub) {
  return `
    <div class="collection-history-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(sub || "")}</small>
    </div>
  `;
}

function renderCollectionHistorySourceDetails(sources) {
  if (!sources.length) {
    return "";
  }
  return `
    <details class="collection-history-source-details">
      <summary>
        <span>収集元別詳細</span>
        <strong>${formatInteger(sources.length)}件</strong>
        <i data-lucide="chevron-down"></i>
      </summary>
      <div class="collection-history-sources" aria-label="収集元別の取得数">
        ${sources.map(renderCollectionHistorySource).join("")}
      </div>
    </details>
  `;
}

function renderCollectionHistorySource(source) {
  const warningText = Number(source.error_count || 0) ? ` / 注意 ${formatInteger(source.error_count)}` : "";
  return `
    <div class="collection-history-source">
      <span>${escapeHtml(source.name || "不明")}</span>
      <strong>収集 ${formatInteger(source.collected_count)}件 / 表示 ${formatInteger(source.displayed_count)}件</strong>
      <small>写真 ${formatInteger(source.with_photos)}件・${formatInteger(source.photo_count)}枚 / 除外 ${formatInteger(source.excluded_count)}件${escapeHtml(warningText)}</small>
    </div>
  `;
}

function buildCollectionHistoryRows() {
  const savedRows = Array.isArray(state.collectionHistory?.entries)
    ? state.collectionHistory.entries.map(normalizeCollectionHistoryEntry).filter(Boolean)
    : [];
  const currentRow = buildCollectionHistoryCurrentRow();
  const rows = [...savedRows];
  if (currentRow && !rows.some((row) => row.generated_at && row.generated_at === currentRow.generated_at)) {
    rows.unshift(currentRow);
  }
  return rows
    .sort((a, b) => new Date(b.generated_at || b.date || 0).getTime() - new Date(a.generated_at || a.date || 0).getTime())
    .slice(0, 45);
}

function normalizeCollectionHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    date: entry.date || entry.report_date || "",
    generated_at: entry.generated_at || entry.collected_at || entry.updated_at || "",
    listing_count: Number(entry.listing_count ?? entry.listings ?? 0),
    new_count: Number(entry.new_count ?? 0),
    duplicate_count: Number(entry.duplicate_count ?? 0),
    excluded_count: Number(entry.excluded_count ?? 0),
    sources: Array.isArray(entry.sources) ? entry.sources.map(normalizeCollectionHistorySource) : [],
    photos: normalizeCollectionHistoryPhotos(entry.photos),
    athome_photos: normalizeCollectionHistoryPhotos(entry.athome_photos),
    fixed_asset_route_values: normalizeCollectionHistoryRoute(entry.fixed_asset_route_values || entry.fixed_asset),
    route_values: normalizeCollectionHistoryRoute(entry.route_values || entry.route_value),
  };
}

function normalizeCollectionHistorySource(source) {
  return {
    name: source?.name || source?.source || "不明",
    collected_count: Number(source?.collected_count ?? source?.count ?? 0),
    displayed_count: Number(source?.displayed_count ?? source?.listing_count ?? 0),
    excluded_count: Number(source?.excluded_count ?? 0),
    error_count: Number(source?.error_count ?? (Array.isArray(source?.errors) ? source.errors.length : 0)),
    with_photos: Number(source?.with_photos ?? source?.listings_with_photos ?? 0),
    photo_count: Number(source?.photo_count ?? source?.photos ?? 0),
  };
}

function normalizeCollectionHistoryPhotos(value) {
  return {
    listings_with_photos: Number(value?.listings_with_photos ?? value?.with_photos ?? 0),
    photo_count: Number(value?.photo_count ?? value?.photos ?? 0),
  };
}

function normalizeCollectionHistoryRoute(value) {
  const progress = value?.collection_progress && typeof value.collection_progress === "object" ? value.collection_progress : {};
  const areaMesh = progress.area_mesh && typeof progress.area_mesh === "object" ? progress.area_mesh : {};
  return {
    count: Number(value?.count ?? value?.items ?? value?.rows ?? value?.matched_count ?? 0),
    town_count: Number(value?.town_count ?? value?.towns ?? 0),
    checked_count: Number(value?.checked_count ?? value?.checked ?? 0),
    matched_count: Number(value?.matched_count ?? value?.matched ?? value?.count ?? 0),
    collection_progress: progress,
    area_mesh_checked: Number(value?.area_mesh_checked ?? areaMesh.checked ?? 0),
    area_mesh_total: Number(value?.area_mesh_total ?? areaMesh.total ?? 0),
    area_mesh_rate: Number(value?.area_mesh_rate ?? areaMesh.checked_rate ?? 0),
    updated_at: value?.updated_at || "",
  };
}

function buildCollectionHistoryCurrentRow() {
  if (!state.latest) {
    return null;
  }
  const photos = buildPhotoStats(state.listings);
  const athomeListings = state.listings.filter((listing) =>
    /アットホーム|athome/i.test(`${listing.source || ""} ${listing.source_url || ""}`)
  );
  const fixedAsset = buildFixedAssetCollectionStats();
  const routeValues = buildRouteValueCollectionStats();
  return {
    date: state.latest.report_date || localDateStamp(new Date()),
    generated_at: state.latest.generated_at || state.history?.updated_at || new Date().toISOString(),
    listing_count: Number(state.latest.summary?.listing_count ?? state.listings.length),
    new_count: state.listings.filter((listing) => listing.is_new).length,
    duplicate_count: Number(state.latest.summary?.duplicate_count ?? 0),
    excluded_count: Number(state.latest.summary?.excluded_count ?? 0),
    sources: buildCollectionHistorySourceRows(),
    photos,
    athome_photos: buildPhotoStats(athomeListings),
    fixed_asset_route_values: fixedAsset,
    route_values: routeValues,
  };
}

function buildCollectionHistorySourceRows() {
  const listingStats = buildSourceListingStats(state.listings);
  const rows = [];
  (Array.isArray(state.latest?.sources) ? state.latest.sources : []).forEach((source) => {
    const key = source.name || "不明";
    const stats = listingStats.get(key) || {};
    rows.push({
      name: key,
      collected_count: Number(source.collected_count || 0),
      displayed_count: Number(stats.displayed_count || 0),
      excluded_count: Number(source.excluded_count || 0),
      error_count: Array.isArray(source.errors) ? source.errors.length : 0,
      with_photos: Number(stats.with_photos || 0),
      photo_count: Number(stats.photo_count || 0),
    });
    listingStats.delete(key);
  });
  listingStats.forEach((stats, name) => {
    rows.push({ name, collected_count: stats.displayed_count, ...stats });
  });
  return rows.sort((a, b) => b.collected_count - a.collected_count || a.name.localeCompare(b.name, "ja"));
}

function buildSourceListingStats(listings) {
  const groups = new Map();
  listings.forEach((listing) => {
    const name = listing.source || "不明";
    const row = groups.get(name) || { displayed_count: 0, with_photos: 0, photo_count: 0, with_map: 0 };
    const images = imageUrlList(listing);
    row.displayed_count += 1;
    row.with_photos += images.length ? 1 : 0;
    row.photo_count += images.length;
    row.with_map += Number.isFinite(listing.map_latitude) ? 1 : 0;
    groups.set(name, row);
  });
  return groups;
}

function buildPhotoStats(listings) {
  return listings.reduce(
    (stats, listing) => {
      const images = imageUrlList(listing);
      stats.listings_with_photos += images.length ? 1 : 0;
      stats.photo_count += images.length;
      return stats;
    },
    { listings_with_photos: 0, photo_count: 0 }
  );
}

function buildFixedAssetCollectionStats() {
  const items = routeValuePayloadItems(state.routeValues).filter(
    (item) => item.route_value_type === "fixed_asset_tax" || Number.isFinite(Number(item.fixed_asset_tax_route_value_yen_per_sqm))
  );
  const summary = state.routeValues?.fixed_asset_summary || {};
  const progress = summary.collection_progress && typeof summary.collection_progress === "object" ? summary.collection_progress : {};
  const areaMesh = progress.area_mesh && typeof progress.area_mesh === "object" ? progress.area_mesh : {};
  const towns = new Set(items.map((item) => item.town).filter(Boolean));
  return {
    count: Number(summary.items ?? summary.rows ?? items.length),
    town_count: Number(summary.towns ?? towns.size),
    collection_progress: progress,
    area_mesh_checked: Number(areaMesh.checked ?? 0),
    area_mesh_total: Number(areaMesh.total ?? 0),
    area_mesh_rate: Number(areaMesh.checked_rate ?? 0),
    updated_at: state.routeValues?.updated_at || "",
  };
}

function buildRouteValueCollectionStats() {
  const summary = state.routeValues?.route_value_summary || {};
  const items = routeValuePayloadItems(state.routeValues).filter((item) => item.route_value_type !== "fixed_asset_tax");
  return {
    count: Number(summary.items ?? items.length),
    checked_count: Number(summary.checked_count ?? summary.checked ?? items.length),
    matched_count: Number(summary.matched_count ?? summary.matched ?? items.length),
    updated_at: state.routeValues?.updated_at || "",
  };
}

function buildDistributionBins(values) {
  const max = Math.max(...values);
  const step = 2.5;
  const upper = Math.ceil(max / step) * step;
  const bins = [];
  for (let start = 0; start < upper; start += step) {
    const end = start + step;
    bins.push({
      start,
      end,
      label: `${formatNumber(start)}〜${formatNumber(end)}万円/坪`,
      count: values.filter((value) => value > start && value <= end).length,
    });
  }
  if (!bins[0].count) {
    bins[0].count = values.filter((value) => value >= 0 && value <= step).length;
  }
  return bins.filter((bin) => bin.count > 0);
}

function renderCompare() {
  const candidates = state.listings.filter((listing) => isCandidate(listing));
  els.candidateCount.textContent = `${formatInteger(candidates.length)}件`;
  if (!candidates.length) {
    els.compareTable.innerHTML = `<div class="empty-state">買付候補に追加した物件がありません</div>`;
    return;
  }
  els.compareTable.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>物件</th>
          <th>価格</th>
          <th>面積</th>
          <th>坪単価</th>
          <th>査定</th>
          <th>スコア</th>
          <th>価格改定</th>
          <th>学校区</th>
          <th>注意</th>
          <th>メモ</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${candidates.map(renderCompareRow).join("")}
      </tbody>
    </table>
  `;
  bindListingActions(els.compareTable);
}

function renderCompareRow(listing) {
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const drop = priceDropInfo(listing);
  const school = resolveSchoolInfo(listing);
  const caution = [
    listing.legal_notice?.setback_required ? "要セットバック" : "",
    listing.legal_notice?.disclosure_found ? "告知事項" : "",
    listing.hazard_reference?.affected ? "ハザード" : "",
    isExcluded(listing) ? "除外中" : "",
  ].filter(Boolean).join(" / ") || "-";
  return `
    <tr>
      <td>
        <strong>${escapeHtml(shortTitle(listing))}</strong>
        <span>${escapeHtml(listing.town)} / ${escapeHtml(listing.source)}</span>
      </td>
      <td>${formatPrice(listing.price_man_yen)}</td>
      <td>${formatMeasure(listing.land_area_tsubo, "坪")}</td>
      <td>${formatUnit(listing.unit_price_man_per_tsubo)}</td>
      <td>${escapeHtml(assessment.label)}<br><small>${formatUnit(assessment.reference_unit_price)}基準</small></td>
      <td><strong>${formatAssessmentScore(score.score)}</strong><small>${score.reasons.slice(0, 2).map(escapeHtml).join(" / ") || "-"}</small></td>
      <td>${escapeHtml(priceDropSummary(drop))}</td>
      <td>${school.elementary_text}<br><small>${school.middle_text}</small></td>
      <td>${escapeHtml(caution)}</td>
      <td>${escapeHtml(userNote(listing) || "-")}</td>
      <td>
        <div class="table-actions">
          ${detailButton(listing.id, "compact")}
          ${actionButton("candidate", listing.id, true, "x", "外す")}
        </div>
      </td>
    </tr>
  `;
}

function exportComparePdf() {
  const candidates = state.listings.filter((listing) => isCandidate(listing));
  if (!candidates.length) {
    setStatus("買付候補がありません。比較したい物件を買付候補に追加してください。");
    return;
  }
  const printWindow = window.open("", "_blank", "width=1180,height=820");
  if (!printWindow) {
    setStatus("PDF出力画面を開けませんでした。ブラウザのポップアップ許可を確認してください。");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildComparePrintHtml(candidates));
  printWindow.document.close();
  setStatus("比較PDF用の印刷画面を開きました。印刷先でPDF保存を選べます。");
}

function buildComparePrintHtml(candidates) {
  const generatedAt = new Date().toLocaleString("ja-JP");
  const reportAt = state.latest?.generated_at ? formatDateTime(state.latest.generated_at) : "-";
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>都城市 売土地 買付候補比較</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #142033; font-family: "Yu Gothic", "Meiryo", sans-serif; font-size: 10.5px; line-height: 1.45; }
      header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #2563eb; }
      h1 { margin: 0; font-size: 21px; letter-spacing: 0; }
      .meta { color: #475569; font-size: 10px; font-weight: 700; text-align: right; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { padding: 6px 7px; border: 1px solid #cbd5e1; vertical-align: top; word-break: break-word; }
      th { background: #eaf3ff; color: #1e3a8a; font-size: 10px; text-align: left; }
      td strong { display: block; margin-bottom: 2px; color: #0f172a; font-size: 11px; }
      a { color: #1d4ed8; text-decoration: none; }
      .score { font-size: 15px; color: #0369a1; }
      .note { color: #475569; }
      .caution { color: #b91c1c; font-weight: 800; }
      .sub { display: block; color: #64748b; font-size: 9.5px; font-weight: 700; }
      @media print { button { display: none; } }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>都城市 売土地 買付候補比較</h1>
        <div class="note">買付候補 ${formatInteger(candidates.length)}件 / レポート更新 ${escapeHtml(reportAt)}</div>
      </div>
      <div class="meta">出力 ${escapeHtml(generatedAt)}<br>都城市 売土地ビューア</div>
    </header>
    <table>
      <thead>
        <tr>
          <th style="width:18%">物件</th>
          <th style="width:8%">価格</th>
          <th style="width:8%">面積</th>
          <th style="width:8%">坪単価</th>
          <th style="width:10%">査定</th>
          <th style="width:8%">スコア</th>
          <th style="width:9%">価格改定</th>
          <th style="width:11%">学校区</th>
          <th style="width:10%">注意</th>
          <th style="width:10%">メモ・補足</th>
        </tr>
      </thead>
      <tbody>
        ${candidates.map(renderComparePrintRow).join("")}
      </tbody>
    </table>
    <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });<\/script>
  </body>
</html>`;
}

function renderComparePrintRow(listing) {
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const drop = priceDropInfo(listing);
  const school = resolveSchoolInfo(listing);
  const caution = [
    listing.legal_notice?.setback_required ? "要セットバック" : "",
    listing.legal_notice?.disclosure_found ? "告知事項あり" : "",
    listing.hazard_reference?.affected ? "ハザード該当" : "",
    isExcluded(listing) ? "除外中" : "",
  ].filter(Boolean).join(" / ") || "-";
  const supplements = [
    userNote(listing),
    listing.remarks,
    listing.restrictions,
    plainText(listing.legal_notice?.road_text),
  ].filter(Boolean).join(" / ");
  return `
    <tr>
      <td>
        <strong>${escapeHtml(shortTitle(listing))}</strong>
        <span class="sub">${escapeHtml(listing.town)} / ${escapeHtml(listing.source)}</span>
        <span class="sub">${escapeHtml(listing.address || "-")}</span>
        ${listing.source_url ? `<a href="${escapeAttr(listing.source_url)}">掲載元</a>` : ""}
      </td>
      <td>${formatPrice(listing.price_man_yen)}</td>
      <td>${formatMeasure(listing.land_area_tsubo, "坪")}<br><span class="sub">${formatMeasure(listing.land_area_sqm, "㎡")}</span></td>
      <td>${formatUnit(listing.unit_price_man_per_tsubo)}</td>
      <td>${escapeHtml(assessment.label)}<br><span class="sub">基準 ${formatUnit(assessment.reference_unit_price)}</span><span class="sub">査定 ${formatPrice(assessment.estimated_price_man_yen)}</span></td>
      <td><strong class="score">${formatAssessmentScore(score.score)}</strong><span class="sub">${score.reasons.slice(0, 3).map(escapeHtml).join(" / ")}</span></td>
      <td>${escapeHtml(priceDropSummary(drop))}</td>
      <td>${school.elementary_text}<br><span class="sub">${school.middle_text}</span></td>
      <td class="${caution === "-" ? "" : "caution"}">${escapeHtml(caution)}</td>
      <td>${escapeHtml(supplements || "-")}</td>
    </tr>
  `;
}

function plainText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTownRows() {
  const historyByTown = new Map(currentFinancialSnapshots().history.towns.map((row) => [row.town, row]));
  const latestRows = buildTownRowsFromListings(state.listings);
  return latestRows.map((row) => {
    const history = historyByTown.get(row.town) || {};
    return {
      town: row.town,
      listing_count: row.listing_count,
      average_unit_price_man_per_tsubo: row.average_unit_price_man_per_tsubo,
      minimum_unit_price_man_per_tsubo: row.minimum_unit_price_man_per_tsubo,
      maximum_unit_price_man_per_tsubo: row.maximum_unit_price_man_per_tsubo,
      historical_unique_listing_count: history.historical_unique_listing_count ?? 0,
      historical_average_unit_price_man_per_tsubo:
        history.historical_average_unit_price_man_per_tsubo ?? null,
    };
  });
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

function townUnitExtremes(town) {
  const townName = String(town || "");
  const listings = state.listings
    .filter((listing) => hasConfirmedFinancials(listing) && listingTownName(listing) === townName)
    .filter((listing) => numberValue(listing.unit_price_man_per_tsubo) > 0);
  return {
    min: listings.slice().sort(compareListingsByUnitPrice("asc"))[0] || null,
    max: listings.slice().sort(compareListingsByUnitPrice("desc"))[0] || null,
  };
}

function compareListingsByUnitPrice(direction) {
  const multiplier = direction === "desc" ? -1 : 1;
  return (a, b) =>
    (numberValue(a.unit_price_man_per_tsubo) - numberValue(b.unit_price_man_per_tsubo)) * multiplier ||
    numberValue(a.price_man_yen) - numberValue(b.price_man_yen) ||
    compareJapaneseText(a.id, b.id);
}

function compareJapaneseText(a, b) {
  return JAPANESE_TEXT_COLLATOR.compare(String(a || ""), String(b || ""));
}

function compareTownNames(a, b) {
  const aText = String(a || "");
  const bText = String(b || "");
  return compareJapaneseText(TOWN_READING_ORDER[aText] || aText, TOWN_READING_ORDER[bText] || bText) || compareJapaneseText(aText, bText);
}

function metricDetail(label, value, listing) {
  const valueText = formatUnit(value);
  if (!listing?.id) {
    return metric(label, valueText);
  }
  const title = `${listing.address || listing.town || "物件"} / ${formatPrice(listing.price_man_yen)}`;
  return `
    <a class="metric metric-link-card" href="${escapeAttr(detailHash(listing.id))}" data-detail-id="${escapeAttr(listing.id)}" title="${escapeAttr(title)}" aria-label="${escapeAttr(`${label} ${valueText} の物件詳細を開く`)}">
      <span>${escapeHtml(label)}</span>
      <strong>${valueText}</strong>
    </a>
  `;
}

function averageNumbers(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populateTownFilter() {
  if (!els.townFilter) {
    return;
  }
  const currentValue = els.townFilter.value;
  const towns = [...new Set(state.listings.map(listingTownName).filter(Boolean))].sort(compareTownNames);
  els.townFilter.innerHTML = [
    `<option value="">すべて</option>`,
    ...towns.map((town) => `<option value="${escapeAttr(town)}">${escapeHtml(town)}</option>`),
  ].join("");
  if (currentValue && towns.includes(currentValue)) {
    els.townFilter.value = currentValue;
  }
}

function listingTownName(listing) {
  const explicit = String(listing?.town || "").trim();
  if (explicit) {
    return explicit;
  }
  const text = [listing?.address, listing?.title, listing?.search_text].filter(Boolean).join(" ");
  return (
    Object.keys(TOWN_COORDS)
      .sort((a, b) => b.length - a.length)
      .find((town) => text.includes(town)) || ""
  );
}

function populateSchoolFilter() {
  const currentValue = els.schoolFilter.value;
  const options = new Map();
  state.listings.forEach((listing) => {
    listingSchoolOptions(listing).forEach((option) => {
      options.set(option.value, option.label);
    });
  });
  const rows = [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  els.schoolFilter.innerHTML = [
    `<option value="">すべて</option>`,
    ...rows.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`),
  ].join("");
  if (currentValue && options.has(currentValue)) {
    els.schoolFilter.value = currentValue;
  }
}

function listingSchoolOptions(listing) {
  const zoneInfo = SCHOOL_ZONES[listing.town];
  if (!zoneInfo) {
    return [];
  }
  return [
    ...zoneInfo.elementary.map((name) => ({ value: `elementary:${name}`, label: `小 ${name}` })),
    ...zoneInfo.middle.map((name) => ({ value: `middle:${name}`, label: `中 ${name}` })),
  ];
}

function matchesSchoolFilter(listing, value) {
  return listingSchoolOptions(listing).some((option) => option.value === value);
}

function openDetail(id) {
  const listing = state.listings.find((item) => String(item.id) === String(id));
  if (!listing) {
    setStatus("詳細を開けませんでした。ページを更新してからもう一度押してください。");
    return;
  }
  const detailRoot = els.detailPageBody || els.detailBody;
  if (!detailRoot) {
    setStatus("詳細欄を表示できませんでした。ページを更新してからもう一度押してください。");
    return;
  }
  state.currentDetailId = id;
  clearDetailMap();
  const townText = `${listing.town} / ${listing.source}`;
  const titleText = shortTitle(listing);
  if (els.detailPageTown) {
    els.detailPageTown.textContent = townText;
  }
  if (els.detailPageTitle) {
    els.detailPageTitle.textContent = titleText;
  }
  if (els.detailTown) {
    els.detailTown.textContent = townText;
  }
  if (els.detailTitle) {
    els.detailTitle.textContent = titleText;
  }
  if (els.detailPanel) {
    els.detailPanel.classList.remove("open");
    els.detailPanel.setAttribute("aria-hidden", "true");
  }
  try {
    detailRoot.innerHTML = renderDetail(listing);
    bindDetailControls(listing, detailRoot);
  } catch (error) {
    detailRoot.innerHTML = renderFallbackDetail(listing);
    setStatus("詳細の一部を表示できませんでした。最低限の情報を表示しています。");
  }
  activateView("detail");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  window.requestAnimationFrame?.(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  setTimeout(() => {
    renderDetailMap(listing);
  }, 80);
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderFallbackDetail(listing) {
  return `
    <section class="detail-section">
      <h3>基本情報</h3>
      <dl class="detail-kv">
        ${kv("価格", formatPrice(listing.price_man_yen))}
        ${kv("土地面積", `${formatMeasure(listing.land_area_sqm, "㎡")} / ${formatMeasure(listing.land_area_tsubo, "坪")}`)}
        ${kv("坪単価", formatUnit(listing.unit_price_man_per_tsubo))}
        ${!hasConfirmedFinancials(listing) && financialEvidence(listing.last_confirmed) ? kv(financialCalculationHeld(listing) ? "過去取得値（要再確認・計算対象外）" : "過去確認値（現在は未確認）", `${formatPrice(listing.last_confirmed.price_man_yen)} / ${formatMeasure(listing.last_confirmed.land_area_sqm, "㎡")} / 確認 ${formatDateTime(listing.last_confirmed.financial_checked_at)}`) : ""}
        ${kv("所在地", escapeHtml(listing.address || listing.town || "-"))}
        ${kv("掲載元", `<a href="${escapeAttr(listing.source_url)}" target="_blank" rel="noopener">開く</a>`)}
      </dl>
    </section>
  `;
}

function closeDetail(updateHash = true) {
  els.detailPanel?.classList.remove("open");
  els.detailPanel?.setAttribute("aria-hidden", "true");
  state.currentDetailId = null;
  clearDetailMap();
  if (updateHash) {
    clearDetailHash();
  }
  if (state.view === "detail") {
    activateView("list");
  }
}

function renderDetail(listing) {
  const mapsQuery = encodeURIComponent(listing.address || `宮崎県都城市${listing.town}`);
  const assessment = assessListing(listing);
  const score = assessmentScore(listing, assessment);
  const school = resolveSchoolInfo(listing);
  const drop = priceDropInfo(listing);
  return `
    ${renderDetailImage(listing)}
    ${renderDetailActions(listing)}
    ${renderMemoSection(listing)}
    <section class="detail-section">
      <h3>金額・面積</h3>
      <dl class="detail-kv">
        ${kv("価格", formatPrice(listing.price_man_yen))}
        ${kv("土地面積", `${formatMeasure(listing.land_area_sqm, "㎡")} / ${formatMeasure(listing.land_area_tsubo, "坪")}`)}
        ${kv("坪単価", formatUnit(listing.unit_price_man_per_tsubo))}
        ${!hasConfirmedFinancials(listing) && financialEvidence(listing.last_confirmed) ? kv(financialCalculationHeld(listing) ? "過去取得値（要再確認・計算対象外）" : "過去確認値（現在は未確認）", `${formatPrice(listing.last_confirmed.price_man_yen)} / ${formatMeasure(listing.last_confirmed.land_area_sqm, "㎡")} / 確認 ${formatDateTime(listing.last_confirmed.financial_checked_at)}`) : ""}
        ${kv("価格改定", priceDropDetailText(drop))}
        ${kv("新着", listing.is_new ? "あり" : "なし")}
        ${kv("割安新着", listing.is_cheap_new ? "あり" : "なし")}
      </dl>
    </section>
    <section class="detail-section">
      <h3>所在地</h3>
      <dl class="detail-kv">
        ${kv("町名", listing.town)}
        ${kv("所在地", listing.address || "-")}
        ${kv("地番", listing.parcel_number || "-")}
        ${kv("地図", listing.is_approx_position ? "町名の概算位置" : "緯度経度")}
      </dl>
    </section>
    ${renderDataQualitySection(listing)}
    ${renderDetailMapSection(listing)}
    ${renderLegalNoticeSection(listing.legal_notice)}
    ${renderHazardSection(listing.hazard_reference)}
    <section class="detail-section">
      <h3>割安査定</h3>
      <dl class="detail-kv">
        ${kv("判定", assessment.label)}
        ${kv("割安スコア", `${formatAssessmentScore(score.score)}`)}
        ${kv("信頼度", assessment.confidence)}
        ${kv("比較基準", formatUnit(assessment.reference_unit_price))}
        ${kv("平均との差", `${formatNumber(assessment.discount_amount)}万円/坪`)}
        ${kv("割安率", assessment.discount_rate !== null ? `${formatNumber(assessment.discount_rate * 100)}%` : "-")}
        ${kv("概算査定", formatPrice(assessment.estimated_price_man_yen))}
        ${kv("根拠", assessment.reasons.join("<br>"))}
        ${kv("スコア理由", score.reasons.map(escapeHtml).join("<br>"))}
      </dl>
    </section>
    ${renderRouteValueSection(listing, assessment.route_value)}
    <section class="detail-section">
      <h3>学校区</h3>
      <dl class="detail-kv">
        ${kv("小学校", school.elementary_text)}
        ${kv("中学校", school.middle_text)}
        ${kv("小学校距離", school.elementary_distance_text)}
        ${kv("中学校距離", school.middle_distance_text)}
        ${kv("確認", school.note)}
      </dl>
    </section>
    <section class="detail-section">
      <h3>用途・制限</h3>
      <dl class="detail-kv">
        ${kv("用途地域", listing.zoning || "-")}
        ${kv("建ぺい率", percent(listing.building_coverage_ratio_percent))}
        ${kv("容積率", percent(listing.floor_area_ratio_percent))}
        ${kv("制限情報", listing.restrictions || "-")}
        ${kv("備考", listing.remarks || "-")}
      </dl>
    </section>
    <section class="detail-section">
      <h3>履歴</h3>
      <dl class="detail-kv">
        ${kv("初回確認", listing.first_seen_date || "-")}
        ${kv("最終確認", listing.last_seen_date || "-")}
        ${kv("確認回数", listing.observed_count ? `${listing.observed_count}回` : "-")}
        ${kv("値下げ", drop ? `${formatPrice(drop.amount)}下落（${formatPrice(drop.previous)} → ${formatPrice(drop.current)}）` : "-")}
      </dl>
    </section>
    <section class="detail-section">
      <h3>リンク</h3>
      <dl class="detail-kv">
        ${kv("掲載元", `<a href="${escapeAttr(listing.source_url)}" target="_blank" rel="noopener">開く</a>`)}
        ${kv("地図検索", `<a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">開く</a>`)}
      </dl>
    </section>
  `;
}

function renderDataQualitySection(listing) {
  const quality = listingDataQuality(listing);
  return `
    <section class="detail-section">
      <h3>データ信頼度</h3>
      <dl class="detail-kv">
        ${kv("判定", `${dataQualityLabel(quality)}（${formatInteger(quality.score)}点）`)}
        ${kv("掲載確認", listingPresenceLabel(listing))}
        ${kv("金融値確認", hasConfirmedFinancials(listing) ? (listing.financial_status === "detail_confirmed" ? "詳細確認済み" : "一覧観測確認") : "価格確認中／査定保留")}
        ${kv("金融値確認時刻", validFinancialTimestamp(listing.financial_checked_at) ? formatDateTime(listing.financial_checked_at) : "未確認")}
        ${kv("土地データ生成時刻", formatDateTime(state.latest?.generated_at))}
        ${listing.detail_pending_reason === "financial_confirmation_expired" ? kv("鮮度", "確認期限切れ：現在価格・査定へ利用しません") : ""}
        ${kv("確認項目", quality.reasons.map(escapeHtml).join("<br>"))}
        ${kv("写真", imageUrlList(listing).length ? `${formatInteger(imageUrlList(listing).length)}枚` : "未取得")}
        ${kv("位置精度", listing.is_approx_position ? "概算位置" : Number.isFinite(listing.map_latitude) ? "緯度経度あり" : "未取得")}
        ${kv("路線価", listing.route_value_reference ? `${escapeHtml(listing.route_value_reference.source || "参照あり")} / ${escapeHtml(listing.route_value_reference.confidence || "-")}` : "未照合")}
      </dl>
    </section>
  `;
}

function renderDetailMapSection(listing) {
  const hasPosition = Number.isFinite(listing.map_latitude) && Number.isFinite(listing.map_longitude);
  if (!hasPosition) {
    return `
      <section class="detail-section">
        <h3>物件マップ</h3>
        <div class="mini-map-placeholder">地図位置を表示できません</div>
      </section>
    `;
  }
  return `
    <section class="detail-section">
      <h3>物件マップ</h3>
      <div id="detailMap" class="detail-map" data-lat="${escapeAttr(listing.map_latitude)}" data-lng="${escapeAttr(listing.map_longitude)}"></div>
      <p class="detail-note">${listing.is_approx_position ? "町名から推定した概算位置です。" : "掲載データの緯度経度を使用しています。"}</p>
    </section>
  `;
}

function renderDetailMap(listing) {
  const container = document.getElementById("detailMap");
  if (!container || !window.L || !Number.isFinite(listing.map_latitude) || !Number.isFinite(listing.map_longitude)) {
    return;
  }
  clearDetailMap();
  state.detailMap = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    tap: true,
  }).setView([listing.map_latitude, listing.map_longitude], listing.is_approx_position ? 13 : 16);
  L.control.zoom({ position: "bottomright" }).addTo(state.detailMap);
  state.detailBaseLayers = createMapBaseLayers();
  selectedMapLayer(state.detailBaseLayers).addTo(state.detailMap);
  L.control.layers(state.detailBaseLayers, null, {
    position: "topright",
    collapsed: true,
  }).addTo(state.detailMap);
  state.detailMap.on("baselayerchange", (event) => saveMapLayerType(mapLayerTypeFromLabel(event.name)));
  state.detailMarker = L.marker([listing.map_latitude, listing.map_longitude], {
    icon: L.divIcon({
      className: "",
      html: `<div class="map-pin ${unitColorClass(listing.unit_price_man_per_tsubo)} ${listing.is_new ? "new" : ""}">${escapeHtml(listing.town.slice(0, 1))}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
  }).addTo(state.detailMap);
  setTimeout(() => state.detailMap?.invalidateSize(), 40);
}

function clearDetailMap() {
  if (state.detailMap) {
    state.detailMap.remove();
    state.detailMap = null;
    state.detailBaseLayers = null;
    state.detailMarker = null;
  }
}

function renderDetailActions(listing) {
  return `
    <section class="detail-section">
      <h3>検討管理</h3>
      <div class="detail-actions">
        ${actionButton("favorite", listing.id, isFavorite(listing), "star", "お気に入り")}
        ${actionButton("candidate", listing.id, isCandidate(listing), "clipboard-check", "買付候補")}
        ${actionButton("exclude", listing.id, isExcluded(listing), "eye-off", "除外")}
      </div>
    </section>
  `;
}

function renderMemoSection(listing) {
  return `
    <section class="detail-section">
      <h3>メモ</h3>
      <textarea id="detailNote" class="memo-input" rows="4" placeholder="現地確認・問い合わせ内容など">${escapeHtml(userNote(listing))}</textarea>
    </section>
  `;
}

function bindDetailControls(listing, root = els.detailPageBody || els.detailBody) {
  if (!root) {
    return;
  }
  bindListingActions(root);
  root.querySelectorAll("[data-preview-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = document.getElementById("detailMainImage");
      if (!image) {
        return;
      }
      image.dataset.imageIndex = button.dataset.previewIndex || "0";
      image.src = button.dataset.previewImage;
      const hideButton = root.querySelector(".detail-main-hide");
      if (hideButton) {
        hideButton.dataset.hideImage = button.dataset.previewImage;
      }
      root.querySelectorAll("[data-preview-image]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  const memo = root.querySelector("#detailNote");
  if (!memo) {
    return;
  }
  memo.addEventListener("input", () => {
    const id = String(listing.id);
    const value = memo.value.trim();
    if (value) {
      state.notes[id] = value;
    } else {
      delete state.notes[id];
    }
    saveStoredObject(STORAGE_KEYS.notes, state.notes);
    render();
  });
}

function renderDetailImage(listing) {
  const imageUrls = imageUrlList(listing);
  if (!imageUrls.length) {
    return `
      <section class="detail-section">
        <figure class="detail-photo fallback-photo">${renderPhotoFallback(listing, true)}</figure>
      </section>
    `;
  }
  return `
    <section class="detail-section">
      <figure class="detail-photo image-frame">
        ${renderPhotoFallback(listing, true)}
        <img id="detailMainImage" src="${escapeAttr(imageUrls[0])}" data-images="${escapeAttr(JSON.stringify(imageUrls))}" data-image-index="0" alt="${escapeAttr(`${listing.town}の土地写真`)}" referrerpolicy="no-referrer" onerror="swapBrokenImage(this);">
        ${renderHideImageButton(imageUrls[0], false, "detail-main-hide")}
      </figure>
      ${renderImageStrip(imageUrls, listing)}
    </section>
  `;
}

function renderImageStrip(imageUrls, listing) {
  if (imageUrls.length <= 1) {
    return "";
  }
  return `
    <div class="image-strip" aria-label="物件写真">
      ${imageUrls
        .map(
          (url, index) => `
            <div class="image-thumb-wrap">
              <button class="image-thumb ${index === 0 ? "active" : ""}" type="button" data-preview-image="${escapeAttr(url)}" data-preview-index="${index}">
                <img src="${escapeAttr(url)}" alt="${escapeAttr(`${listing.town} 写真${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.image-thumb-wrap')?.remove();">
              </button>
              <button class="image-hide-button thumb" type="button" data-hide-image="${escapeAttr(url)}" aria-label="この写真を非表示">
                <i data-lucide="eye-off"></i>
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function primaryImageUrl(listing) {
  return imageUrlList(listing)[0] || "";
}

function imageUrlList(listing) {
  const values = [];
  if (listing.image_url) {
    values.push(listing.image_url);
  }
  if (Array.isArray(listing.image_urls) && listing.image_urls.length) {
    values.push(...listing.image_urls);
  }
  return [...new Set(values.filter(Boolean).filter((url) => !state.hiddenImages.has(String(url))).filter(isDisplayableListingImageUrl))];
}

function normalizeImageText(value) {
  let text = String(value || "").replaceAll("\\/", "/").toLowerCase();
  try {
    text = decodeURIComponent(text);
  } catch (error) {
    // Some source URLs contain partial escaping; keep the readable parts.
  }
  return text;
}

function imageUrlLooksLikeLandDiagram(url) {
  const normalized = normalizeImageText(url);
  return LAND_DIAGRAM_IMAGE_TERMS.some((term) => normalized.includes(term.toLowerCase()));
}

function imageUrlLooksLikePersonOrCharacter(url) {
  if (imageUrlLooksLikeLandDiagram(url)) {
    return false;
  }
  const normalized = normalizeImageText(url);
  return (
    PERSON_CHARACTER_IMAGE_TERMS.some((term) => normalized.includes(term.toLowerCase())) ||
    PERSON_CHARACTER_IMAGE_PATTERN.test(normalized)
  );
}

function isDisplayableListingImageUrl(url) {
  const normalized = normalizeImageText(url);
  if (imageUrlLooksLikePersonOrCharacter(url)) {
    return false;
  }
  const blockedTerms = [
    "logo",
    "icon",
    "sprite",
    "banner",
    "bnr",
    "button",
    "map",
    "pagetop",
    "noimage",
    "no_image",
    "no_photo",
    "nophoto",
    "no-photo",
    "dummy",
    "blank",
    "loading",
    "placeholder",
    "transparent",
    "captcha",
    "common",
    "footer",
    "relation_site",
    "static_app_contents",
    "static_contents",
    "mogecheck",
    "pref_links",
  ];
  return !blockedTerms.some(
    (term) => normalized.includes(term) && !(term === "map" && imageUrlLooksLikeLandDiagram(url))
  );
}

function swapBrokenImage(image) {
  const urls = safeJsonArray(image.dataset.images);
  const currentIndex = Number(image.dataset.imageIndex || 0);
  const nextIndex = currentIndex + 1;
  if (nextIndex < urls.length) {
    image.dataset.imageIndex = String(nextIndex);
    image.src = urls[nextIndex];
    const hideButton = image.parentElement?.querySelector(".image-hide-button:not(.thumb)");
    if (hideButton) {
      hideButton.dataset.hideImage = urls[nextIndex];
    }
    return;
  }
  const parent = image.parentElement;
  if (parent?.classList.contains("compact-thumb")) {
    parent.classList.add("compact-fallback");
    parent.innerHTML = `<i data-lucide="map-pin"></i><span>${escapeHtml(parent.dataset.fallbackTown || "写真未取得")}</span>`;
    if (window.lucide) {
      window.lucide.createIcons();
    }
    return;
  }
  parent?.classList.add("placeholder");
  image.remove();
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function renderLegalNoticeSection(notice) {
  const roadText = notice?.road_text || "接道幅員の明記は未検出";
  return `
    <section class="detail-section">
      <h3>接道・告知</h3>
      <dl class="detail-kv">
        ${kv("接道方角", notice?.road_direction || "-")}
        ${kv("接道幅員", notice?.road_width_m !== null && notice?.road_width_m !== undefined ? `${formatNumber(notice.road_width_m)}m` : "-")}
        ${kv("接面", notice?.road_frontage_m !== null && notice?.road_frontage_m !== undefined ? `${formatNumber(notice.road_frontage_m)}m` : "-")}
        ${kv("セットバック", notice?.setback_text || "未検出")}
        ${kv("告知事項", notice?.disclosure_text || "未検出")}
        ${kv("確認", roadText)}
      </dl>
    </section>
  `;
}

function renderHazardSection(hazard) {
  if (!hazard) {
    return `
      <section class="detail-section">
        <h3>ハザード</h3>
        <dl class="detail-kv">
          ${kv("判定", "未調査")}
          ${kv("確認", "hazard-zones.json に調査結果を追加すると、該当リスクを表示します。")}
        </dl>
      </section>
    `;
  }
  const hazardText = hazard.hazards.length
    ? hazard.hazards
        .map((item) => `${escapeHtml(item.type)}${item.level ? ` ${escapeHtml(item.level)}` : ""}${item.note ? `<br>${escapeHtml(item.note)}` : ""}`)
        .join("<br>")
    : "該当なし";
  const matchText = [
    hazard.match_note,
    hazard.distance_km ? `約${formatNumber(hazard.distance_km)}km` : "",
    `信頼度 ${hazard.confidence}`,
  ].filter(Boolean).join(" / ");
  return `
    <section class="detail-section">
      <h3>ハザード</h3>
      <dl class="detail-kv">
        ${kv("判定", hazard.affected ? "該当あり" : hazard.status === "attention" ? "参考情報あり" : hazard.status === "not_affected" ? "該当なし" : "要確認")}
        ${kv("種類", hazardText)}
        ${kv("照合", escapeHtml(matchText || "-"))}
        ${kv("調査日", escapeHtml(hazard.checked_at || "-"))}
        ${kv("出典", escapeHtml(hazard.source || "-"))}
        ${kv("メモ", escapeHtml(hazard.note || "-"))}
      </dl>
    </section>
  `;
}

function calculateRouteValueAppraisal(listing, routeValue) {
  if (!hasConfirmedFinancials(listing)) return null;
  const routeValueYen = numberValue(routeValue?.route_value_yen_per_sqm);
  const area = numberValue(listing.land_area_sqm);
  if (!routeValueYen || !area) return null;

  const notice = listing.legal_notice || {};
  const frontage = positiveNumber(routeValue.frontage_m) || positiveNumber(notice.road_frontage_m);
  const roadWidth = positiveNumber(routeValue.road_width_m) || positiveNumber(notice.road_width_m);
  const depth = positiveNumber(routeValue.estimated_depth_m) || (frontage ? area / frontage : Math.sqrt(area));
  const depthCorrection = correctionFromRecord(routeValue, "depth_correction_rate") || estimateDepthCorrection(depth);
  const frontageCorrection = correctionFromRecord(routeValue, "frontage_correction_rate") || estimateFrontageCorrection(frontage);
  const depthLongCorrection =
    correctionFromRecord(routeValue, "depth_long_correction_rate") || estimateDepthLongCorrection(depth, frontage);
  const irregularCorrection =
    correctionFromRecord(routeValue, "irregular_correction_rate") || estimateIrregularCorrection(listing, routeValue);
  const sideRoadAddition = positiveNumber(routeValue.side_road_addition_rate);
  const rearRoadAddition = positiveNumber(routeValue.rear_road_addition_rate);
  const correctionRate =
    depthCorrection.rate *
    frontageCorrection.rate *
    depthLongCorrection.rate *
    irregularCorrection.rate *
    (1 + sideRoadAddition + rearRoadAddition);
  const adjustedUnitYenPerSqm = routeValueYen * correctionRate;
  const baseValueYen = adjustedUnitYenPerSqm * area;
  const setback = estimateSetbackDeduction(area, frontage, roadWidth, adjustedUnitYenPerSqm, notice.setback_required);
  const appraisedValueYen = Math.max(0, baseValueYen - setback.deduction_yen);
  const appraisedValueMan = appraisedValueYen / 10000;
  const appraisedUnit = (appraisedValueYen / area) * TSUBO_SQM / 10000;
  const salePrice = numberValue(listing.price_man_yen);

  return {
    appraised_value_man_yen: appraisedValueMan,
    appraised_unit_price_man_per_tsubo: appraisedUnit,
    adjusted_unit_yen_per_sqm: adjustedUnitYenPerSqm,
    correction_rate: correctionRate,
    frontage_m: frontage,
    depth_m: depth,
    road_width_m: roadWidth,
    setback,
    sale_price_diff_man_yen: salePrice ? salePrice - appraisedValueMan : null,
    sale_price_diff_rate: salePrice && appraisedValueMan ? (salePrice - appraisedValueMan) / appraisedValueMan : null,
    reasons: [
      `路線価 ${formatYenPerSqm(routeValueYen)} × 地積 ${formatNumber(area)}㎡`,
      depthCorrection.note,
      frontageCorrection.note,
      depthLongCorrection.note,
      irregularCorrection.note,
      sideRoadAddition ? `側方路線影響加算 ${formatNumber(sideRoadAddition * 100)}%` : "",
      rearRoadAddition ? `二方路線影響加算 ${formatNumber(rearRoadAddition * 100)}%` : "",
      setback.note,
    ].filter(Boolean),
  };
}

function correctionFromRecord(routeValue, key) {
  const value = positiveNumber(routeValue?.[key]);
  if (!value) return null;
  return { rate: value, note: `${correctionLabel(key)} ${formatNumber(value)}` };
}

function correctionLabel(key) {
  return {
    depth_correction_rate: "奥行価格補正率",
    frontage_correction_rate: "間口狭小補正率",
    depth_long_correction_rate: "奥行長大補正率",
    irregular_correction_rate: "不整形地補正率",
  }[key] || "補正率";
}

function estimateDepthCorrection(depth) {
  if (!depth) return { rate: 1, note: "奥行価格補正: 奥行不明のため1.00" };
  const bands = [
    [4, 0.9],
    [6, 0.92],
    [8, 0.95],
    [10, 0.97],
    [24, 1],
    [28, 0.99],
    [32, 0.98],
    [36, 0.96],
    [40, 0.94],
    [44, 0.92],
    [48, 0.9],
    [52, 0.88],
    [56, 0.87],
    [60, 0.86],
    [64, 0.85],
    [68, 0.84],
    [72, 0.83],
    [76, 0.82],
    [80, 0.81],
  ];
  const found = bands.find(([limit]) => depth < limit);
  const rate = found ? found[1] : 0.8;
  return { rate, note: `奥行価格補正: 概算奥行 ${formatNumber(depth)}m / 普通住宅地区の簡易係数 ${formatNumber(rate)}` };
}

function estimateFrontageCorrection(frontage) {
  if (!frontage) return { rate: 1, note: "間口狭小補正: 接面不明のため1.00" };
  const rate = frontage < 4 ? 0.9 : frontage < 6 ? 0.94 : frontage < 8 ? 0.97 : 1;
  return { rate, note: `間口狭小補正: 接面 ${formatNumber(frontage)}m / 普通住宅地区の簡易係数 ${formatNumber(rate)}` };
}

function estimateDepthLongCorrection(depth, frontage) {
  if (!depth || !frontage) return { rate: 1, note: "奥行長大補正: 奥行または接面不明のため1.00" };
  const ratio = depth / frontage;
  const rate = ratio < 2 ? 1 : ratio < 3 ? 0.98 : ratio < 4 ? 0.96 : ratio < 5 ? 0.94 : ratio < 6 ? 0.92 : 0.9;
  return { rate, note: `奥行長大補正: 奥行/間口 ${formatNumber(ratio)} / 簡易係数 ${formatNumber(rate)}` };
}

function estimateIrregularCorrection(listing, routeValue) {
  const text = listingText(listing);
  const hasIrregular = /不整形|三角地|旗竿|路地状|傾斜|高低差/.test(text) || /不整形/.test(routeValue?.note || "");
  if (!hasIrregular) return { rate: 1, note: "不整形地補正: 明確な記載なしのため1.00" };
  return { rate: 0.95, note: "不整形地補正: 不整形・路地状等の記載あり。詳細なかげ地割合は要確認のため概算0.95" };
}

function estimateSetbackDeduction(area, frontage, roadWidth, adjustedUnitYenPerSqm, setbackRequired) {
  if (!frontage || !roadWidth || roadWidth >= 4 || !setbackRequired) {
    return { area_sqm: 0, deduction_yen: 0, note: "セットバック控除: 対象記載なし" };
  }
  const setbackDepth = Math.max(0, (4 - roadWidth) / 2);
  const setbackArea = Math.min(area, setbackDepth * frontage);
  const deductionYen = setbackArea * adjustedUnitYenPerSqm * 0.7;
  return {
    area_sqm: setbackArea,
    deduction_yen: deductionYen,
    note: `セットバック控除: 約${formatNumber(setbackArea)}㎡相当の70%を控除`,
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function renderRouteValueSection(listing, routeValue) {
  if (!routeValue) {
    return `
      <section class="detail-section">
        <h3>国税庁路線価方式</h3>
        <dl class="detail-kv">
          ${kv("参照", "未登録")}
          ${kv("確認", "APIキー設定後に route-values.json が生成されると、相続税路線価を使った参考査定を表示します。")}
        </dl>
      </section>
    `;
  }
  const appraisal = calculateRouteValueAppraisal(listing, routeValue);
  const isInheritanceRoute = routeValue.route_value_type === "inheritance_tax";
  const isPublicLandPrice = routeValue.route_value_type === "public_land_price";
  const sectionTitle = isPublicLandPrice ? "公示地価・地価調査近接点" : isInheritanceRoute ? "国税庁路線価方式" : "固定資産税路線価";
  const routeUnitLabel = isPublicLandPrice ? "公的価格坪単価" : isInheritanceRoute ? "路線価方式坪単価" : "固定資産税評価水準";
  const routeUnitValue = isInheritanceRoute
    ? routeValue.route_method_unit_price_man_per_tsubo
    : isPublicLandPrice
      ? routeValue.public_reference_unit_price_man_per_tsubo
      : routeValue.fixed_asset_unit_price_man_per_tsubo;
  const marketDiff = hasConfirmedFinancials(listing) ? routeValue.public_reference_unit_price_man_per_tsubo - listing.unit_price_man_per_tsubo : null;
  const diffRate = marketDiff !== null && routeValue.public_reference_unit_price_man_per_tsubo
    ? marketDiff / routeValue.public_reference_unit_price_man_per_tsubo
    : null;
  const matchText = [
    routeValue.match_note,
    routeValueReferenceDistanceKm(routeValue) !== null ? `約${formatNumber(routeValueReferenceDistanceKm(routeValue))}km` : "",
    `信頼度 ${routeValue.confidence}`,
  ].filter(Boolean).join(" / ");
  return `
    <section class="detail-section">
      <h3>${sectionTitle}</h3>
      <dl class="detail-kv">
        ${routeValue.route_value_yen_per_sqm ? kv("路線価", formatYenPerSqm(routeValue.route_value_yen_per_sqm)) : ""}
        ${kv(routeUnitLabel, formatUnit(routeUnitValue))}
        ${appraisal ? kv("路線価方式査定", `${formatPrice(appraisal.appraised_value_man_yen)}（${formatUnit(appraisal.appraised_unit_price_man_per_tsubo)}）`) : ""}
        ${appraisal ? kv("補正率", formatNumber(appraisal.correction_rate)) : ""}
        ${appraisal && appraisal.setback.area_sqm ? kv("SB控除", `${formatNumber(appraisal.setback.area_sqm)}㎡ / ${formatPrice(appraisal.setback.deduction_yen / 10000)}`) : ""}
        ${kv("公示価格水準換算", formatUnit(routeValue.public_reference_unit_price_man_per_tsubo))}
        ${routeValue.fixed_asset_route_id ? kv("路線ID", escapeHtml(routeValue.fixed_asset_route_id)) : ""}
        ${routeValue.fixed_asset_use_district ? kv("用途地区区分", escapeHtml(routeValue.fixed_asset_use_district)) : ""}
        ${routeValue.fixed_asset_price_date ? kv("時点", escapeHtml(routeValue.fixed_asset_price_date)) : ""}
        ${routeValue.comparable_method_unit_price_man_per_tsubo ? kv("比準価格", formatUnit(routeValue.comparable_method_unit_price_man_per_tsubo)) : ""}
        ${routeValue.income_method_unit_price_man_per_tsubo ? kv("収益価格", formatUnit(routeValue.income_method_unit_price_man_per_tsubo)) : ""}
        ${routeValue.cost_method_unit_price_man_per_tsubo ? kv("積算価格", formatUnit(routeValue.cost_method_unit_price_man_per_tsubo)) : ""}
        ${routeValue.development_method_unit_price_man_per_tsubo ? kv("開発法価格", formatUnit(routeValue.development_method_unit_price_man_per_tsubo)) : ""}
        ${routeValue.public_land_price_point_address ? kv("近接公示/調査地点", escapeHtml(routeValue.public_land_price_point_address)) : ""}
        ${routeValue.public_land_price_type ? kv("公示/調査区分", escapeHtml([routeValue.public_land_price_type, routeValue.public_land_price_use_category, routeValue.public_land_price_zoning].filter(Boolean).join(" / "))) : ""}
        ${routeValue.public_land_price_front_road_condition ? kv("公示/調査前面道路", escapeHtml(routeValue.public_land_price_front_road_condition)) : ""}
        ${routeValue.public_land_price_station_name ? kv("最寄駅", escapeHtml(`${routeValue.public_land_price_station_name}${routeValue.public_land_price_station_distance_m ? ` 約${formatInteger(routeValue.public_land_price_station_distance_m)}m` : ""}`)) : ""}
        ${kv("掲載坪単価との差", `${formatMeasure(marketDiff, "万円/坪")}${diffRate !== null ? `（${formatNumber(diffRate * 100)}%）` : ""}`)}
        ${kv("前面道路・地点", escapeHtml(routeValue.road_name || routeValue.address || "-"))}
        ${kv("参照標準地", escapeHtml(routeValue.appraisal_address || routeValue.appraisal_point_id || "-"))}
        ${kv("年度", routeValue.year ? `${escapeHtml(routeValue.year)}年度` : "-")}
        ${kv("照合", escapeHtml(matchText))}
        ${kv("出典", escapeHtml(routeValue.source || "-"))}
        ${appraisal ? kv("計算根拠", appraisal.reasons.map(escapeHtml).join("<br>")) : ""}
        ${kv("メモ", escapeHtml(routeValue.note || "-"))}
      </dl>
    </section>
  `;
}

function assessListing(listing) {
  if (!hasConfirmedFinancials(listing)) return {
    reference_unit_price: null, discount_amount: null, discount_rate: null,
    estimated_price_man_yen: null, label: "査定保留", confidence: "未確認",
    route_value: null, reasons: ["現在の価格・面積の確認根拠がありません"],
  };
  const unit = numberValue(listing.unit_price_man_per_tsubo);
  const peers = state.listings.filter((item) => item.town === listing.town && item.id !== listing.id &&
    hasConfirmedFinancials(item) && numberValue(item.unit_price_man_per_tsubo) > 0);
  const peerAvg = averageNumbers(peers.map((item) => numberValue(item.unit_price_man_per_tsubo)).filter(Boolean));
  const historyRow = currentFinancialSnapshots().history.towns.find((row) => row.town === listing.town);
  const historyAvg = numberValue(historyRow?.historical_average_unit_price_man_per_tsubo);
  const historyCount = numberValue(historyRow?.historical_unique_listing_count);
  const overallAvg = numberValue(currentFinancialSnapshots().current.summary.overall_average_unit_price_man_per_tsubo);
  const routeValue = listing.route_value_reference;
  const sources = [];
  const reasons = [];

  if (routeValue?.public_reference_unit_price_man_per_tsubo) {
    const routeWeight =
      routeValue.route_value_type === "fixed_asset_tax"
        ? routeValue.confidence === "高" ? 0.65 : 0.5
        : routeValue.route_value_type === "public_land_price"
          ? 0.35
          : routeValue.confidence === "高" ? 0.5 : 0.3;
    sources.push({ value: routeValue.public_reference_unit_price_man_per_tsubo, weight: routeWeight });
    const routeLabel =
      routeValue.route_value_type === "inheritance_tax"
        ? "相続税路線価"
        : routeValue.route_value_type === "public_land_price"
          ? "公示地価・地価調査"
          : "固定資産税路線価";
    const routeDistance = routeValueReferenceDistanceKm(routeValue);
    const routeValueText = routeValue.route_value_yen_per_sqm ? `${formatYenPerSqm(routeValue.route_value_yen_per_sqm)} を公示価格水準へ換算 ` : "";
    reasons.push(`${routeLabel} ${routeValueText}${formatUnit(routeValue.public_reference_unit_price_man_per_tsubo)}${routeDistance !== null ? `（参照地点 約${formatNumber(routeDistance)}km）` : ""}`);
  }
  if (routeValue?.comparable_method_unit_price_man_per_tsubo) {
    sources.push({ value: routeValue.comparable_method_unit_price_man_per_tsubo, weight: 0.15 });
    reasons.push(`鑑定評価書の取引事例比較法 比準価格 ${formatUnit(routeValue.comparable_method_unit_price_man_per_tsubo)}`);
  }
  if (peerAvg && peers.length >= 2) {
    const weight = Math.min(routeValue ? 0.45 : 0.65, 0.3 + peers.length * 0.05);
    sources.push({ value: peerAvg, weight });
    reasons.push(`同町の現在掲載 ${peers.length}件（対象除く）平均 ${formatUnit(peerAvg)}`);
  }
  if (historyAvg && historyCount >= 3) {
    sources.push({ value: historyAvg, weight: routeValue ? 0.25 : peers.length >= 2 ? 0.25 : 0.55 });
    reasons.push(`同町の履歴 ${formatInteger(historyCount)}件平均 ${formatUnit(historyAvg)}`);
  }
  if (overallAvg) {
    sources.push({ value: overallAvg, weight: sources.length ? 0.1 : 1 });
    reasons.push(`全体平均 ${formatUnit(overallAvg)}`);
  }

  const weightTotal = sources.reduce((sum, source) => sum + source.weight, 0) || 1;
  const reference = sources.reduce((sum, source) => sum + source.value * source.weight, 0) / weightTotal;
  const discountAmount = reference ? reference - unit : null;
  const discountRate = reference ? discountAmount / reference : null;
  const estimatedPrice = reference ? reference * numberValue(listing.land_area_tsubo) : null;

  return {
    reference_unit_price: reference || null,
    discount_amount: discountAmount,
    discount_rate: discountRate,
    estimated_price_man_yen: estimatedPrice,
    label: reference ? discountLabel(discountRate) : "査定保留",
    confidence: assessmentConfidence(peers.length, historyCount, routeValue),
    route_value: routeValue,
    reasons,
  };
}

function assessmentScore(listing, assessment = assessListing(listing)) {
  if (!hasConfirmedFinancials(listing) || assessment.reference_unit_price == null) return { score: null, reasons: ["査定保留：確認済みの金融値・比較根拠が必要です"] };
  const reasons = [];
  let score = 50;
  const rate = Number.isFinite(assessment.discount_rate) ? assessment.discount_rate : null;
  if (rate === null) {
    score -= 12;
    reasons.push("比較基準が少ないため慎重判定");
  } else if (rate >= 0.2) {
    score += 28;
    reasons.push("査定基準より20%以上低い");
  } else if (rate >= 0.1) {
    score += 20;
    reasons.push("査定基準より10%以上低い");
  } else if (rate >= 0.05) {
    score += 10;
    reasons.push("査定基準より5%以上低い");
  } else if (rate < -0.15) {
    score -= 18;
    reasons.push("査定基準より15%以上高い");
  } else if (rate < 0) {
    score -= 8;
    reasons.push("査定基準より高め");
  } else {
    score += 3;
    reasons.push("査定基準と同程度");
  }

  if (assessment.confidence === "高") {
    score += 10;
    reasons.push("根拠データの信頼度が高い");
  } else if (assessment.confidence === "中") {
    score += 5;
    reasons.push("根拠データの信頼度が中程度");
  } else {
    score -= 4;
    reasons.push("根拠データが少ない");
  }

  const routeValue = assessment.route_value || listing.route_value_reference;
  if (routeValue?.public_reference_unit_price_man_per_tsubo) {
    if (routeValue.route_value_type === "fixed_asset_tax") {
      score += 12;
      reasons.push("固定資産税路線価を参照");
    } else if (routeValue.route_value_type === "inheritance_tax") {
      score += 7;
      reasons.push("相続税路線価を参照");
    } else if (routeValue.route_value_type === "public_land_price") {
      score += 5;
      reasons.push("公示地価・地価調査を参照");
    }
    const distanceKm = routeValueReferenceDistanceKm(routeValue);
    if (distanceKm !== null && distanceKm <= 1) {
      score += 4;
      reasons.push("参照地点が1km以内");
    } else if (distanceKm !== null && distanceKm > 3) {
      score -= 10;
      reasons.push("参照地点が離れている");
    }
  }

  if (priceDropInfo(listing)) {
    score += 6;
    reasons.push("値下げ履歴あり");
  }
  if (listing.is_new) {
    score += 2;
    reasons.push("新着物件");
  }
  if (listing.hazard_reference?.affected) {
    score -= 8;
    reasons.push("ハザード該当");
  }
  if (listing.legal_notice?.setback_required) {
    score -= 8;
    reasons.push("セットバック注意");
  }
  if (listing.legal_notice?.disclosure_found) {
    score -= 10;
    reasons.push("告知事項あり");
  }
  if (listing.is_approx_position) {
    score -= 4;
    reasons.push("地図位置が概算");
  }
  const roadWidth = numberValue(listing.legal_notice?.road_width_m);
  if (roadWidth >= 4) {
    score += 3;
    reasons.push("接道幅員4m以上");
  } else if (roadWidth > 0 && roadWidth < 4) {
    score -= 7;
    reasons.push("接道幅員4m未満");
  }

  return {
    score: Math.round(clamp(score, 0, 100)),
    reasons,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function discountLabel(rate) {
  if (rate === null || !Number.isFinite(rate)) return "判定不可";
  if (rate >= 0.2) return "かなり割安候補";
  if (rate >= 0.1) return "割安候補";
  if (rate <= -0.15) return "割高注意";
  return "相場圏";
}

function assessmentConfidence(peerCount, historyCount, routeValue) {
  if ((peerCount >= 5 && historyCount >= 5) || routeValue?.confidence === "高") return "高";
  if (peerCount >= 2 || historyCount >= 5 || routeValue?.confidence === "中") return "中";
  return "低";
}

function resolveSchoolInfo(listing) {
  const zoneInfo = SCHOOL_ZONES[listing.town];
  if (!zoneInfo) {
    return {
      elementary_text: "未設定",
      middle_text: "未設定",
      elementary_distance_text: "-",
      middle_distance_text: "-",
      note: "町名だけでは学校区を判定できません。都城市公式の通学区域で確認してください。",
    };
  }
  const elementaryDistances = schoolDistances(listing, zoneInfo.elementary);
  const middleDistances = schoolDistances(listing, zoneInfo.middle);
  return {
    elementary_text: schoolNames(zoneInfo.elementary, zoneInfo.uncertain),
    middle_text: schoolNames(zoneInfo.middle, zoneInfo.uncertain),
    elementary_distance_text: distanceListText(elementaryDistances),
    middle_distance_text: distanceListText(middleDistances),
    note: zoneInfo.note || (zoneInfo.uncertain ? "町名だけの概算です。番地により要確認です。" : "町名ベースの概算です。"),
  };
}

function schoolDistances(listing, names) {
  if (!Number.isFinite(listing.map_latitude) || !Number.isFinite(listing.map_longitude)) {
    return [];
  }
  return names
    .map((name) => {
      const coords = SCHOOL_COORDS[name];
      if (!coords) return null;
      const directKm = haversineKm(listing.map_latitude, listing.map_longitude, coords[0], coords[1]);
      const walkingKm = directKm * 1.3;
      const minutes = Math.max(1, Math.round(walkingKm / 0.08));
      return { name, walkingKm, minutes };
    })
    .filter(Boolean);
}

function distanceListText(items) {
  if (!items.length) return "-";
  return items
    .map((item) => `${escapeHtml(item.name)} 約${formatNumber(item.walkingKm)}km / 徒歩約${item.minutes}分`)
    .join("<br>");
}

function schoolNames(names, uncertain) {
  const suffix = uncertain ? "（要確認）" : "";
  return `${names.map(escapeHtml).join(" / ")}${suffix}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const radius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function zone(elementary, middle, uncertain = false, note = "") {
  return { elementary: [elementary], middle: [middle], uncertain, note };
}

function multiZone(elementary, middle, note) {
  return { elementary, middle, uncertain: true, note };
}

function kv(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function setStatus(message) {
  els.statusMessage.hidden = !message;
  els.statusMessage.textContent = message || "";
}

function unitColorClass(unitPrice) {
  if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice <= 0) return "unknown";
  const average = currentFinancialSnapshots().current.summary.overall_average_unit_price_man_per_tsubo;
  const unit = numberValue(unitPrice);
  if (average) {
    if (unit <= average * 0.75) return "low";
    if (unit <= average * 1.4) return "mid";
    return "high";
  }
  return "unknown";
}

function shortTitle(listing) {
  // Source advertisement text is not a verified current financial field.
  // Keep it in the original data/search, but never present its figures as a title.
  const original = String(listing.title || listing.address || `${listing.town} 売土地`);
  const title = original.replace(/(?:価格|販売価格|売買価格|総額|坪単価|土地面積|敷地面積|面積)?\s*(?:[0-9０-９.,，]+\s*億\s*)?[0-9０-９.,，]+\s*(?:億円|万円|万|円|㎡|m[²2]|坪)(?:\s*[\/／]\s*(?:㎡|m[²2]|坪))?/gi, " ")
    .replace(/(?:割安率\s*[0-9０-９.,，]+[％%]|[0-9０-９.,，]+[％%]\s*(?:割安|値下げ))/g, " ")
    .replace(/[（(]\s*[）)]/g, "").replace(/\s+/g, " ").trim() || listing.address || `${listing.town} 売土地`;
  return title.length > 62 ? `${title.slice(0, 62)}...` : title;
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function formatPrice(value) {
  if (value == null) return "未確認";
  return `${formatNumber(value)}万円`;
}

function formatUnit(value) {
  if (value == null) return "未確認";
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  return `${formatNumber(value)}万円/坪`;
}

function formatYenPerSqm(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  return `${Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}円/㎡`;
}

function percent(value) {
  return value != null && Number.isFinite(Number(value)) ? `${formatNumber(value)}%` : "未確認";
}

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "未確認";
  }
  const number = Number(value);
  return number % 1 === 0 ? number.toLocaleString("ja-JP") : number.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

function formatInteger(value) {
  if (!Number.isFinite(Number(value))) {
    return "0";
  }
  return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function formatFullDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

document.addEventListener("DOMContentLoaded", init);
