const RAW_BASE = "https://raw.githubusercontent.com/mi-hiro/miyakonojo-land-viewer/main/";

const els = {
  status: document.getElementById("historyStatus"),
  updatedAt: document.getElementById("historyUpdatedAt"),
  summaryCards: document.getElementById("historySummaryCards"),
  trendRange: document.getElementById("historyTrendRange"),
  dailyTrendChart: document.getElementById("dailyTrendChart"),
  deltaList: document.getElementById("historyDeltaList"),
  sourceChartSummary: document.getElementById("sourceChartSummary"),
  sourceHistoryChart: document.getElementById("sourceHistoryChart"),
  photoTrendPanel: document.getElementById("photoTrendPanel"),
  athomePhotoSummary: document.getElementById("athomePhotoSummary"),
  athomePhotoTrendChart: document.getElementById("athomePhotoTrendChart"),
  routeCoverageHistorySummary: document.getElementById("routeCoverageHistorySummary"),
  routeCoverageHistoryPanel: document.getElementById("routeCoverageHistoryPanel"),
  rowCount: document.getElementById("historyRowCount"),
  timeline: document.getElementById("historyTimeline"),
};

initHistoryPage();

async function initHistoryPage() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  setStatus("取得データ履歴を読み込み中");
  try {
    const [collectionHistory, latest, routeValues, fixedAssetRouteValues] = await Promise.all([
      fetchOptionalJson("collection-history.json"),
      fetchOptionalJson("latest.json"),
      fetchOptionalJson("route-values.json"),
      fetchOptionalJson("fixed-asset-route-values.json"),
    ]);
    const rows = buildRows(collectionHistory, latest, routeValues, fixedAssetRouteValues);
    if (!rows.length) {
      setStatus("取得データ履歴はまだありません。次回の自動収集後に表示されます。");
      return;
    }
    setStatus("");
    renderHistoryPage(rows, collectionHistory, latest, fixedAssetRouteValues);
  } catch (error) {
    setStatus("取得データ履歴を読み込めませんでした。時間をおいて再読み込みしてください。");
  }
}

async function fetchOptionalJson(fileName) {
  const localUrl = `./${fileName}`;
  const remoteUrl = `${RAW_BASE}${fileName}`;
  try {
    return await fetchJson(window.location.protocol === "file:" ? localUrl : remoteUrl);
  } catch (error) {
    try {
      return await fetchJson(window.location.protocol === "file:" ? remoteUrl : localUrl);
    } catch (fallbackError) {
      return null;
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  return response.json();
}

function buildRows(collectionHistory, latest, routeValues, fixedAssetRouteValues) {
  const savedRows = Array.isArray(collectionHistory?.entries)
    ? collectionHistory.entries.map(normalizeHistoryEntry).filter(Boolean)
    : [];
  const currentRow = latest ? buildCurrentRow(latest, routeValues, fixedAssetRouteValues) : null;
  const rows = [...savedRows];
  if (currentRow && !rows.some((row) => sameMoment(row.generated_at, currentRow.generated_at))) {
    rows.unshift(currentRow);
  }
  return rows
    .filter(Boolean)
    .sort(sortRowsDesc)
    .slice(0, 90);
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    date: entry.date || entry.report_date || "",
    generated_at: entry.generated_at || entry.collected_at || entry.updated_at || "",
    listing_count: toNumber(entry.listing_count ?? entry.listings),
    new_count: toNumber(entry.new_count),
    duplicate_count: toNumber(entry.duplicate_count),
    excluded_count: toNumber(entry.excluded_count),
    sources: Array.isArray(entry.sources) ? entry.sources.map(normalizeSource).filter(Boolean) : [],
    photos: normalizePhotos(entry.photos),
    athome_photos: normalizePhotos(entry.athome_photos),
    athome_photo_fill: normalizeAthomePhotoFill(entry.athome_photo_fill),
    fixed_asset_route_values: normalizeRoute(entry.fixed_asset_route_values || entry.fixed_asset),
    route_values: normalizeRoute(entry.route_values || entry.route_value),
    history: entry.history || null,
  };
}

function buildCurrentRow(latest, routeValues, fixedAssetRouteValues) {
  const listings = Array.isArray(latest.listings) ? latest.listings : [];
  const summary = latest.summary || {};
  const sources = buildSourceRows(listings, Array.isArray(latest.sources) ? latest.sources : []);
  const photos = buildPhotoStats(listings);
  const athomeListings = listings.filter((listing) => String(listing.source || "").includes("アットホーム"));
  const routeItems = Array.isArray(routeValues?.items) ? routeValues.items : [];
  const fixedItems = Array.isArray(fixedAssetRouteValues?.items) ? fixedAssetRouteValues.items : [];
  const fixedSummary = fixedAssetRouteValues?.summary || {};
  const fixedProgress = fixedSummary.collection_progress || {};
  const fixedAreaMesh = normalizeProgressRecord(fixedProgress.area_mesh);
  const fixedAreaMeshByArea = normalizeProgressGroups(fixedProgress.area_mesh_by_area);
  const routeMatched = new Set(routeItems.map((item) => item.listing_id || item.id).filter(Boolean)).size;
  return {
    date: latest.report_date || localDate(new Date()),
    generated_at: latest.generated_at || latest.updated_at || "",
    listing_count: toNumber(summary.listing_count ?? listings.length),
    new_count: listings.filter((listing) => listing.is_new).length,
    duplicate_count: toNumber(summary.duplicate_count),
    excluded_count: toNumber(summary.excluded_count),
    sources,
    photos,
    athome_photos: {
      listings: athomeListings.length,
      listings_with_photos: athomeListings.filter((listing) => imageUrls(listing).length).length,
      with_photos: athomeListings.filter((listing) => imageUrls(listing).length).length,
      photo_count: athomeListings.reduce((sum, listing) => sum + imageUrls(listing).length, 0),
    },
    fixed_asset_route_values: {
      count: toNumber(fixedSummary.items ?? fixedSummary.rows ?? fixedItems.length),
      town_count: toNumber(fixedSummary.towns) || new Set(fixedItems.map((item) => item.town || item.address).filter(Boolean)).size,
      municipalities: fixedSummary.by_municipality || {},
      collection_progress: fixedProgress,
      area_mesh_checked: toNumber(fixedAreaMesh.checked),
      area_mesh_total: toNumber(fixedAreaMesh.total),
      area_mesh_rate: toNumber(fixedAreaMesh.checked_rate),
      area_mesh_by_area: fixedAreaMeshByArea,
      updated_at: fixedAssetRouteValues?.updated_at || "",
    },
    route_values: {
      count: routeItems.length,
      checked_count: listings.length,
      matched_count: routeMatched || routeItems.length,
      updated_at: routeValues?.updated_at || "",
    },
  };
}

function buildSourceRows(listings, sourceMeta) {
  const rows = new Map();
  listings.forEach((listing) => {
    const name = listing.source || "不明";
    const row = rows.get(name) || {
      name,
      collected_count: 0,
      displayed_count: 0,
      excluded_count: 0,
      error_count: 0,
      with_photos: 0,
      photo_count: 0,
    };
    row.displayed_count += 1;
    const photos = imageUrls(listing);
    if (photos.length) row.with_photos += 1;
    row.photo_count += photos.length;
    rows.set(name, row);
  });
  sourceMeta.forEach((source) => {
    const name = source.name || "不明";
    const row = rows.get(name) || {
      name,
      collected_count: 0,
      displayed_count: 0,
      excluded_count: 0,
      error_count: 0,
      with_photos: 0,
      photo_count: 0,
    };
    row.collected_count = toNumber(source.collected_count ?? row.displayed_count);
    row.excluded_count = toNumber(source.excluded_count);
    row.error_count = Array.isArray(source.errors) ? source.errors.length : toNumber(source.error_count);
    rows.set(name, row);
  });
  return [...rows.values()].sort((a, b) => b.displayed_count - a.displayed_count || b.collected_count - a.collected_count);
}

function buildPhotoStats(listings) {
  return {
    listings: listings.length,
    listings_with_photos: listings.filter((listing) => imageUrls(listing).length).length,
    with_photos: listings.filter((listing) => imageUrls(listing).length).length,
    photo_count: listings.reduce((sum, listing) => sum + imageUrls(listing).length, 0),
  };
}

function normalizeSource(source) {
  if (!source || typeof source !== "object") return null;
  return {
    name: source.name || source.source || "不明",
    collected_count: toNumber(source.collected_count ?? source.count),
    displayed_count: toNumber(source.displayed_count ?? source.listing_count),
    excluded_count: toNumber(source.excluded_count),
    error_count: toNumber(source.error_count),
    with_photos: toNumber(source.with_photos),
    photo_count: toNumber(source.photo_count),
  };
}

function normalizePhotos(photos) {
  return {
    listings: toNumber(photos?.listings),
    listings_with_photos: toNumber(photos?.listings_with_photos ?? photos?.with_photos),
    with_photos: toNumber(photos?.with_photos ?? photos?.listings_with_photos),
    photo_count: toNumber(photos?.photo_count),
  };
}

function normalizeAthomePhotoFill(fill) {
  if (!fill || typeof fill !== "object") return null;
  return {
    date: fill.date || "",
    generated_at: fill.generated_at || "",
    run_at: fill.run_at || "",
    checked: toNumber(fill.checked),
    updated: toNumber(fill.updated),
    no_image: toNumber(fill.no_image),
    failed: toNumber(fill.failed),
    remaining_without_images: toNumber(fill.remaining_without_images),
    added_with_photos: toNumber(fill.added_with_photos),
    added_photo_count: toNumber(fill.added_photo_count),
    before: normalizePhotos(fill.before),
    after: normalizePhotos(fill.after),
  };
}

function normalizeRoute(route) {
  const progress = route?.collection_progress && typeof route.collection_progress === "object"
    ? route.collection_progress
    : {};
  const areaMesh = normalizeProgressRecord(progress.area_mesh);
  const areaMeshByArea = normalizeProgressGroups(progress.area_mesh_by_area);
  return {
    count: toNumber(route?.count),
    checked_count: toNumber(route?.checked_count),
    matched_count: toNumber(route?.matched_count),
    town_count: toNumber(route?.town_count),
    municipalities: route?.municipalities || route?.by_municipality || {},
    collection_progress: progress,
    area_mesh_checked: toNumber(route?.area_mesh_checked ?? areaMesh.checked),
    area_mesh_total: toNumber(route?.area_mesh_total ?? areaMesh.total),
    area_mesh_rate: toNumber(route?.area_mesh_rate ?? areaMesh.checked_rate),
    area_mesh_by_area: areaMeshByArea,
    updated_at: route?.updated_at || "",
  };
}

function renderHistoryPage(rows, collectionHistory, latestData, fixedAssetRouteValues) {
  const latest = rows[0];
  const previous = rows[1] || null;
  els.updatedAt.textContent = `更新 ${formatDateTime(collectionHistory?.updated_at || latest.generated_at || latest.date)}`;
  els.rowCount.textContent = `${formatInteger(rows.length)}回分`;
  renderSummaryCards(latest, previous);
  renderDailyTrend(rows);
  renderDeltaList(latest, previous);
  renderSourceChart(latest);
  renderPhotoTrend(rows);
  renderAthomePhotoTrend(rows);
  renderRouteCoverageHistory(rows, latestData, fixedAssetRouteValues);
  renderTimeline(rows);
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderSummaryCards(latest, previous) {
  const cards = [
    {
      label: "最新取得",
      value: formatDateTime(latest.generated_at || latest.date),
      sub: `${formatInteger(latest.new_count)}件 新着`,
      icon: "calendar-clock",
    },
    {
      label: "掲載件数",
      value: `${formatInteger(latest.listing_count)}件`,
      sub: deltaText(latest.listing_count, previous?.listing_count),
      icon: "list-checks",
    },
    {
      label: "写真付き",
      value: `${formatInteger(latest.photos.listings_with_photos)}件`,
      sub: `${formatInteger(latest.photos.photo_count)}枚 ${deltaText(latest.photos.photo_count, previous?.photos?.photo_count)}`,
      icon: "images",
    },
    {
      label: "固定資産税路線価",
      value: `${formatInteger(latest.fixed_asset_route_values.count)}路線`,
      sub: `${formatInteger(latest.fixed_asset_route_values.town_count)}町 / 範囲${formatInteger(latest.fixed_asset_route_values.area_mesh_rate)}% ${deltaText(latest.fixed_asset_route_values.count, previous?.fixed_asset_route_values?.count)}`,
      icon: "database",
    },
    {
      label: "路線価照合",
      value: `${formatInteger(latest.route_values.matched_count)}件`,
      sub: `${matchRate(latest)}% 照合`,
      icon: "scan-search",
    },
  ];
  els.summaryCards.innerHTML = cards.map((card) => `
    <article class="history-summary-card">
      <i data-lucide="${card.icon}"></i>
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small class="${deltaClass(card.sub)}">${escapeHtml(card.sub)}</small>
    </article>
  `).join("");
}

function renderDailyTrend(rows) {
  const ordered = rows.slice().sort(sortRowsDesc);
  const max = {
    listing: Math.max(...ordered.map((row) => row.listing_count), 1),
    photos: Math.max(...ordered.map((row) => row.photos.photo_count), 1),
    route: Math.max(...ordered.map((row) => row.route_values.matched_count), 1),
    fixed: Math.max(...ordered.map((row) => row.fixed_asset_route_values.count), 1),
  };
  els.trendRange.textContent = `${formatShortDate(ordered.at(-1)?.date)} - ${formatShortDate(ordered[0]?.date)}`;
  els.dailyTrendChart.innerHTML = ordered.map((row) => `
    <details class="history-fold-card trend-fold-card">
      <summary class="history-fold-summary">
        <div class="trend-date">
          <strong>${escapeHtml(formatShortDate(row.date || row.generated_at))}</strong>
          <small>${escapeHtml(formatTime(row.generated_at))}</small>
        </div>
        <div class="history-fold-summary-stats">
          <span>掲載 ${formatInteger(row.listing_count)}件</span>
          <span>写真 ${formatInteger(row.photos.photo_count)}枚</span>
          <span>路線価 ${formatInteger(row.route_values.matched_count)}件</span>
          <span>固定 ${formatInteger(row.fixed_asset_route_values.count)}路線</span>
        </div>
        <i data-lucide="chevron-down"></i>
      </summary>
      <div class="trend-bars history-fold-body">
        ${trendBar("掲載", row.listing_count, max.listing, "listing")}
        ${trendBar("写真", row.photos.photo_count, max.photos, "photos")}
        ${trendBar("路線価照合", row.route_values.matched_count, max.route, "route")}
        ${trendBar("固定資産税路線価", row.fixed_asset_route_values.count, max.fixed, "fixed")}
      </div>
    </details>
  `).join("");
}

function trendBar(label, value, max, tone) {
  const width = Math.max(2, Math.min(100, (toNumber(value) / Math.max(max, 1)) * 100));
  return `
    <div class="trend-bar ${tone}">
      <span>${escapeHtml(label)}</span>
      <div class="trend-track"><i style="width:${width}%"></i></div>
      <strong>${formatInteger(value)}</strong>
    </div>
  `;
}

function renderDeltaList(latest, previous) {
  if (!previous) {
    els.deltaList.innerHTML = `<div class="empty-state">比較できる前回データはまだありません</div>`;
    return;
  }
  const rows = [
    ["掲載件数", latest.listing_count, previous.listing_count, "list-checks"],
    ["新着", latest.new_count, previous.new_count, "badge-plus"],
    ["写真枚数", latest.photos.photo_count, previous.photos.photo_count, "images"],
    ["写真付き物件", latest.photos.listings_with_photos, previous.photos.listings_with_photos, "image-check"],
    ["固定資産税路線価", latest.fixed_asset_route_values.count, previous.fixed_asset_route_values.count, "database"],
    ["路線価照合", latest.route_values.matched_count, previous.route_values.matched_count, "scan-search"],
    ["除外", latest.excluded_count, previous.excluded_count, "circle-slash"],
  ];
  els.deltaList.innerHTML = rows.map(([label, current, before, icon]) => {
    const diff = toNumber(current) - toNumber(before);
    return `
      <div class="history-delta-row ${diff > 0 ? "up" : diff < 0 ? "down" : "flat"}">
        <i data-lucide="${icon}"></i>
        <span>${escapeHtml(label)}</span>
        <strong>${formatSigned(diff)}</strong>
        <small>${formatInteger(before)} -> ${formatInteger(current)}</small>
      </div>
    `;
  }).join("");
}

function renderSourceChart(latest) {
  const sources = latest.sources || [];
  const max = Math.max(...sources.map((source) => Math.max(source.collected_count, source.displayed_count, source.photo_count)), 1);
  els.sourceChartSummary.textContent = `${formatInteger(sources.length)}サイト`;
  els.sourceHistoryChart.innerHTML = sources.map((source) => `
    <div class="source-chart-row">
      <div class="source-chart-name">
        <strong>${escapeHtml(source.name)}</strong>
        <small>注意 ${formatInteger(source.error_count)} / 除外 ${formatInteger(source.excluded_count)}</small>
      </div>
      <div class="source-chart-bars">
        ${sourceBar("収集", source.collected_count, max, "collected")}
        ${sourceBar("表示", source.displayed_count, max, "displayed")}
        ${sourceBar("写真", source.photo_count, max, "photos")}
      </div>
    </div>
  `).join("");
}

function sourceBar(label, value, max, tone) {
  const width = Math.max(2, Math.min(100, (toNumber(value) / Math.max(max, 1)) * 100));
  return `
    <div class="source-bar ${tone}">
      <span>${escapeHtml(label)}</span>
      <div class="source-track"><i style="width:${width}%"></i></div>
      <strong>${formatInteger(value)}</strong>
    </div>
  `;
}

function renderPhotoTrend(rows) {
  const latest = rows[0];
  const ratio = latest.listing_count ? Math.round((latest.photos.listings_with_photos / latest.listing_count) * 100) : 0;
  els.photoTrendPanel.innerHTML = `
    <div class="photo-ring" style="--value:${ratio}">
      <strong>${ratio}%</strong>
      <span>写真付き</span>
    </div>
    <div class="photo-trend-stats">
      <div><span>写真付き物件</span><strong>${formatInteger(latest.photos.listings_with_photos)}件</strong></div>
      <div><span>写真枚数</span><strong>${formatInteger(latest.photos.photo_count)}枚</strong></div>
      <div><span>アットホーム写真</span><strong>${formatInteger(latest.athome_photos.photo_count)}枚</strong></div>
      <div><span>アットホーム写真付き</span><strong>${formatInteger(latest.athome_photos.with_photos)}件</strong></div>
    </div>
  `;
}

function renderAthomePhotoTrend(rows) {
  if (!els.athomePhotoTrendChart) return;
  const ordered = rows.slice().sort(sortRowsDesc);
  const latest = rows[0];
  const latestStats = latest.athome_photos || normalizePhotos();
  const latestFill = latest.athome_photo_fill;
  const previousPhotoData = rows.slice(1).find((row) => toNumber(row.athome_photos?.photo_count) > 0);
  const pending = latestStats.listings > 0 && latestStats.photo_count === 0 && previousPhotoData;
  const latestRate = latestStats.listings ? Math.round((latestStats.with_photos / latestStats.listings) * 100) : 0;
  const max = {
    listings: Math.max(...ordered.map((row) => toNumber(row.athome_photos?.listings)), 1),
    withPhotos: Math.max(...ordered.map((row) => toNumber(row.athome_photos?.with_photos)), 1),
    photoCount: Math.max(...ordered.map((row) => toNumber(row.athome_photos?.photo_count)), 1),
  };

  els.athomePhotoSummary.innerHTML = `
    <span class="athome-status-chip ${pending ? "warning" : "ok"}">
      ${pending ? "本日分は写真補完待ちの可能性" : latestFill ? `写真補完 +${formatInteger(latestFill.added_photo_count)}枚` : `最新 ${formatInteger(latestStats.photo_count)}枚`}
    </span>
  `;
  els.athomePhotoTrendChart.innerHTML = ordered.map((row) => {
    const stats = row.athome_photos || normalizePhotos();
    const fill = row.athome_photo_fill;
    const rate = stats.listings ? Math.round((stats.with_photos / stats.listings) * 100) : 0;
    const isLatest = sameMoment(row.generated_at, latest.generated_at) || row.date === latest.date;
    return `
      <details class="history-fold-card athome-photo-fold ${isLatest ? "latest" : ""}">
        <summary class="history-fold-summary athome-photo-summary">
          <div class="athome-photo-date">
            <strong>${escapeHtml(formatShortDate(row.date || row.generated_at))}</strong>
            <small>${escapeHtml(formatTime(row.generated_at))}</small>
          </div>
          <div class="history-fold-summary-stats">
            <span>対象 ${formatInteger(stats.listings)}件</span>
            <span>写真付き ${formatInteger(stats.with_photos)}件</span>
            <span>写真 ${formatInteger(stats.photo_count)}枚</span>
            <span>率 ${formatInteger(rate)}%</span>
          </div>
          <i data-lucide="chevron-down"></i>
        </summary>
        <div class="athome-photo-fold-body">
          <div class="athome-photo-bars">
            ${athomePhotoBar("対象物件", stats.listings, max.listings, "listings", "件")}
            ${athomePhotoBar("写真付き", stats.with_photos, max.withPhotos, "with-photos", "件")}
            ${athomePhotoBar("写真枚数", stats.photo_count, max.photoCount, "photo-count", "枚")}
          </div>
          <div class="athome-photo-rate">
            <span>写真付き率</span>
            <strong>${formatInteger(rate)}%</strong>
          </div>
          ${fill ? renderAthomePhotoFillStats(fill) : `
            <div class="athome-photo-fill missing">
              <span>写真のみ収集</span>
              <strong>記録なし</strong>
            </div>
          `}
        </div>
      </details>
    `;
  }).join("");
  if (!ordered.length) {
    els.athomePhotoTrendChart.innerHTML = `<div class="empty-state">アットホーム写真の履歴はまだありません</div>`;
  }
  if (els.athomePhotoSummary && !pending) {
    const fillText = latestFill ? `、写真補完 ${formatDateTime(latestFill.run_at)} 実行` : "";
    els.athomePhotoSummary.title = `最新: ${formatInteger(latestStats.with_photos)}件 / ${formatInteger(latestStats.listings)}件、${formatInteger(latestStats.photo_count)}枚、写真付き率 ${formatInteger(latestRate)}%${fillText}`;
  }
}

function renderAthomePhotoFillStats(fill) {
  const statusClass = fill.failed > 0 ? "warning" : fill.updated > 0 ? "ok" : "flat";
  return `
    <div class="athome-photo-fill ${statusClass}">
      <span>写真のみ収集 ${escapeHtml(formatDateTime(fill.run_at))}</span>
      <div class="athome-photo-fill-chips">
        <b>確認 ${formatInteger(fill.checked)}件</b>
        <b>追加 ${formatInteger(fill.updated)}件</b>
        <b>+${formatInteger(fill.added_photo_count)}枚</b>
        <b>失敗 ${formatInteger(fill.failed)}件</b>
        <b>残り ${formatInteger(fill.remaining_without_images)}件</b>
      </div>
    </div>
  `;
}

function renderRouteCoverageHistory(rows, latestData, fixedAssetRouteValues) {
  if (!els.routeCoverageHistoryPanel || !els.routeCoverageHistorySummary) return;
  const latestRoute = rows[0]?.fixed_asset_route_values || normalizeRoute();
  const fixedSummary = fixedAssetRouteValues?.summary || {};
  const municipalityRows = fixedAssetMunicipalityRows(latestRoute, fixedSummary);
  const listings = Array.isArray(latestData?.listings) ? latestData.listings : [];
  const targetTowns = new Set(listings.map((listing) => String(listing.town || "").trim()).filter(Boolean));
  const fixedItems = Array.isArray(fixedAssetRouteValues?.items) ? fixedAssetRouteValues.items : [];
  const coveredTowns = new Set(fixedItems.map((item) => String(item.town || "").trim()).filter(Boolean));
  const missingTowns = [...targetTowns].filter((town) => !coveredTowns.has(town)).sort((a, b) => a.localeCompare(b, "ja"));
  const coverageRate = targetTowns.size ? Math.round((coveredTowns.size / targetTowns.size) * 100) : 0;
  const chronological = rows.slice().reverse();
  const deltas = chronological
    .map((row, index) => index ? toNumber(row.fixed_asset_route_values?.town_count) - toNumber(chronological[index - 1].fixed_asset_route_values?.town_count) : 0)
    .filter((value) => value > 0);
  const averageTownGain = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 0;
  const estimatedRuns = averageTownGain ? Math.ceil(missingTowns.length / averageTownGain) : null;
  els.routeCoverageHistorySummary.textContent = `${formatInteger(coverageRate)}%`;
  els.routeCoverageHistoryPanel.innerHTML = `
    <div class="route-coverage-history-main">
      <div class="coverage-ring" style="--value:${coverageRate}">
        <strong>${formatInteger(coverageRate)}%</strong>
        <span>町名カバー</span>
      </div>
      <div class="route-coverage-history-stats">
        ${metricChip("取得済み町", `${formatInteger(coveredTowns.size)}町`)}
        ${metricChip("未取得町", `${formatInteger(missingTowns.length)}町`)}
        ${metricChip("取得路線", `${formatInteger(latestRoute.count || fixedItems.length)}路線`)}
        ${metricChip("範囲取得率", `${formatInteger(latestRoute.area_mesh_rate)}%`)}
        ${metricChip("残り目安", estimatedRuns ? `約${formatInteger(estimatedRuns)}回` : "-")}
      </div>
    </div>
    <div class="route-coverage-history-areas">
      ${municipalityRows.map((area) => `
        <article class="route-coverage-area-card">
          <div>
            <span>${escapeHtml(area.label)}</span>
            <strong>${formatInteger(area.routeCount)}路線</strong>
          </div>
          <div class="route-coverage-area-meter">
            <i style="width:${Math.max(2, Math.min(100, area.rate))}%"></i>
          </div>
          <small>取得率 ${formatInteger(area.rate)}% / 取得範囲 ${formatInteger(area.meshChecked)}地点 / ${formatInteger(area.meshTotal)}地点</small>
        </article>
      `).join("")}
    </div>
    <div class="route-coverage-missing">
      <span>未取得町</span>
      <strong>${escapeHtml(missingTowns.slice(0, 18).join("、") || "なし")}</strong>
    </div>
  `;
}

function athomePhotoBar(label, value, max, tone, unit) {
  const width = Math.max(2, Math.min(100, (toNumber(value) / Math.max(max, 1)) * 100));
  return `
    <div class="athome-photo-bar ${tone}">
      <span>${escapeHtml(label)}</span>
      <div class="athome-photo-track"><i style="width:${width}%"></i></div>
      <strong>${formatInteger(value)}${escapeHtml(unit)}</strong>
    </div>
  `;
}

function renderTimeline(rows) {
  const ordered = rows.slice().sort(sortRowsDesc);
  els.timeline.innerHTML = ordered.map((row) => `
    <details class="history-timeline-card">
      <summary class="history-timeline-summary">
        <div class="history-timeline-main">
          <div>
            <span class="dashboard-kicker">${escapeHtml(row.date || "取得日")}</span>
            <h3>${escapeHtml(formatDateTime(row.generated_at || row.date))}</h3>
          </div>
          <strong>${formatInteger(row.listing_count)}件</strong>
        </div>
        <div class="history-timeline-summary-stats">
          <span>新着 ${formatInteger(row.new_count)}</span>
          <span>写真 ${formatInteger(row.photos.photo_count)}枚</span>
          <span>路線価範囲 ${formatInteger(row.fixed_asset_route_values.area_mesh_rate)}%</span>
        </div>
        <i data-lucide="chevron-down"></i>
      </summary>
      <div class="history-timeline-body">
        <div class="history-timeline-metrics">
          ${metricChip("新着", `${formatInteger(row.new_count)}件`)}
          ${metricChip("写真", `${formatInteger(row.photos.listings_with_photos)}件 / ${formatInteger(row.photos.photo_count)}枚`)}
          ${metricChip("固定資産税路線価", `${formatInteger(row.fixed_asset_route_values.count)}路線 / ${formatInteger(row.fixed_asset_route_values.town_count)}町 / 範囲${formatInteger(row.fixed_asset_route_values.area_mesh_rate)}%`)}
          ${metricChip("路線価照合", `${formatInteger(row.route_values.matched_count)}件`)}
        </div>
        <details class="history-timeline-source-details">
          <summary>
            <span>情報元別</span>
            <strong>${formatInteger((row.sources || []).length)}サイト</strong>
          </summary>
          <div class="history-timeline-sources">
            ${(row.sources || []).map((source) => `<span>${escapeHtml(source.name)} ${formatInteger(source.displayed_count)}件</span>`).join("")}
          </div>
        </details>
      </div>
    </details>
  `).join("");
}

function fixedAssetMunicipalityRows(route, summary) {
  const routeCounts = {
    ...(summary?.by_municipality || {}),
    ...(route?.municipalities || {}),
  };
  const routeProgress = route?.collection_progress || {};
  const progress = Object.keys(routeProgress).length ? routeProgress : summary?.collection_progress || {};
  const byMunicipality = normalizeProgressGroups(progress.by_municipality);
  const routeArea = route?.area_mesh_by_area || {};
  const byArea = Object.keys(routeArea).length ? routeArea : normalizeProgressGroups(progress.area_mesh_by_area);
  return ["都城市", "三股町"].map((label) => {
    const areaKey = label.includes("三股") ? "mimata" : "miyakonojo";
    const municipalityProgress = normalizeProgressRecord(byMunicipality[label]);
    const meshProgress = normalizeProgressRecord(byArea[areaKey]);
    return {
      label,
      routeCount: toNumber(routeCounts[label]),
      rate: toNumber(municipalityProgress.checked_rate || meshProgress.checked_rate),
      checked: toNumber(municipalityProgress.checked),
      total: toNumber(municipalityProgress.total),
      meshChecked: toNumber(meshProgress.checked),
      meshTotal: toNumber(meshProgress.total),
    };
  }).filter((row) => row.routeCount || row.total || row.meshTotal);
}

function normalizeProgressGroups(groups) {
  if (!groups || typeof groups !== "object") return {};
  return Object.fromEntries(
    Object.entries(groups).map(([key, value]) => [key, normalizeProgressRecord(value)])
  );
}

function normalizeProgressRecord(record) {
  if (!record || typeof record !== "object") {
    return { total: 0, checked: 0, remaining: 0, checked_rate: 0 };
  }
  return {
    total: toNumber(record.total),
    checked: toNumber(record.checked),
    remaining: toNumber(record.remaining),
    checked_rate: toNumber(record.checked_rate),
  };
}

function sortRowsDesc(a, b) {
  return dateValue(b.generated_at || b.date) - dateValue(a.generated_at || a.date);
}

function metricChip(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function imageUrls(listing) {
  const urls = [];
  if (Array.isArray(listing?.image_urls)) urls.push(...listing.image_urls);
  if (Array.isArray(listing?.images)) urls.push(...listing.images);
  if (listing?.image_url) urls.push(listing.image_url);
  return [...new Set(urls.map((url) => String(url || "").trim()).filter(Boolean))];
}

function matchRate(row) {
  const checked = toNumber(row.route_values.checked_count || row.listing_count);
  if (!checked) return 0;
  return Math.round((toNumber(row.route_values.matched_count) / checked) * 100);
}

function deltaText(current, previous) {
  if (!Number.isFinite(Number(previous))) return "前回比 -";
  const diff = toNumber(current) - toNumber(previous);
  if (diff === 0) return "前回比 ±0";
  return `前回比 ${formatSigned(diff)}`;
}

function deltaClass(text) {
  return String(text).includes("+") ? "delta-up" : String(text).includes("-") ? "delta-down" : "";
}

function formatSigned(value) {
  const number = toNumber(value);
  if (number === 0) return "±0";
  return `${number > 0 ? "+" : ""}${formatInteger(number)}`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sameMoment(a, b) {
  if (!a || !b) return false;
  return Math.abs(dateValue(a) - dateValue(b)) < 1000;
}

function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function localDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatInteger(value) {
  return toNumber(value).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(5) || String(value);
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message) {
  if (!els.status) return;
  els.status.hidden = !message;
  els.status.textContent = message || "";
}
