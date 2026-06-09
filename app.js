const RAW_BASE =
  "https://raw.githubusercontent.com/mi-hiro/miyakonojo-land-viewer/main/";

const CITY_CENTER = [31.7196, 131.0616];
const CITY_BOUNDS = [
  [31.55, 130.75],
  [31.98, 131.25],
];
const TSUBO_SQM = 3.305785;
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
  mapLayerType: "miyakonojo_land_map_layer_type_v1",
  hiddenImages: "miyakonojo_land_hidden_images_v1",
  deviceMode: "miyakonojo_land_device_mode_v1",
  showHazardAreas: "miyakonojo_land_show_hazard_areas_v1",
};

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

const SAMPLE_LATEST = {
  area: "宮崎県都城市",
  generated_at: "2026-06-07T12:24:35+09:00",
  summary: {
    listing_count: 3,
    overall_average_unit_price_man_per_tsubo: 4.03,
  },
  towns: [],
  listings: [
    {
      id: "sample-1",
      title: "都城市下長飯町 売土地",
      town: "下長飯町",
      address: "宮崎県都城市下長飯町",
      price_man_yen: 548,
      land_area_sqm: 1136.1,
      land_area_tsubo: 343.65,
      unit_price_man_per_tsubo: 1.6,
      source: "SUUMO",
      source_url: "https://suumo.jp/tochi/miyazaki/sc_miyakonojo/",
      image_url: null,
      image_urls: [],
      is_new: true,
      new_reason: "掲載ブロック内に新着表示あり",
      is_cheap_new: true,
      zoning: null,
      building_coverage_ratio_percent: null,
      floor_area_ratio_percent: null,
      restrictions: null,
      remarks: null,
      latitude: null,
      longitude: null,
      search_text: "下長飯町 宮崎県都城市下長飯町 SUUMO",
    },
    {
      id: "sample-2",
      title: "都城市一万城町 住宅用地",
      town: "一万城町",
      address: "都城市一万城町",
      price_man_yen: 708,
      land_area_sqm: 292.65,
      land_area_tsubo: 88.53,
      unit_price_man_per_tsubo: 8,
      source: "アットホーム",
      source_url: "https://www.athome.co.jp/",
      image_url: null,
      image_urls: [],
      is_new: false,
      new_reason: "",
      is_cheap_new: false,
      zoning: null,
      building_coverage_ratio_percent: 60,
      floor_area_ratio_percent: 200,
      restrictions: null,
      remarks: null,
      latitude: null,
      longitude: null,
      search_text: "一万城町 都城市一万城町 アットホーム",
    },
    {
      id: "sample-3",
      title: "都城市安久町 売地",
      town: "安久町",
      address: "宮崎県都城市安久町",
      price_man_yen: 443,
      land_area_sqm: 488,
      land_area_tsubo: 147.62,
      unit_price_man_per_tsubo: 3,
      source: "LIFULL HOME'S",
      source_url: "https://www.homes.co.jp/",
      image_url: null,
      image_urls: [],
      is_new: false,
      new_reason: "",
      is_cheap_new: false,
      zoning: null,
      building_coverage_ratio_percent: 70,
      floor_area_ratio_percent: 200,
      restrictions: null,
      remarks: null,
      latitude: null,
      longitude: null,
      search_text: "安久町 宮崎県都城市安久町 LIFULL",
    },
  ],
};

const SAMPLE_HISTORY = {
  area: "宮崎県都城市",
  updated_at: "2026-06-07T12:24:35+09:00",
  summary: {
    unique_listing_count: 3,
    current_listing_count: 3,
    historical_average_unit_price_man_per_tsubo: 4.2,
    current_average_unit_price_man_per_tsubo: 4.03,
  },
  towns: [
    {
      town: "下長飯町",
      historical_unique_listing_count: 1,
      current_listing_count: 1,
      historical_average_unit_price_man_per_tsubo: 1.6,
      current_average_unit_price_man_per_tsubo: 1.6,
    },
    {
      town: "一万城町",
      historical_unique_listing_count: 1,
      current_listing_count: 1,
      historical_average_unit_price_man_per_tsubo: 8,
      current_average_unit_price_man_per_tsubo: 8,
    },
    {
      town: "安久町",
      historical_unique_listing_count: 1,
      current_listing_count: 1,
      historical_average_unit_price_man_per_tsubo: 3,
      current_average_unit_price_man_per_tsubo: 3,
    },
  ],
  listings: [],
};

const SAMPLE_ROUTE_VALUES = {
  schema_version: 1,
  updated_at: null,
  source: "固定資産税路線価データ未登録",
  items: [],
};

const SAMPLE_HAZARD_ZONES = {
  schema_version: 1,
  updated_at: null,
  source: "ハザード判定データ未登録",
  items: [],
};

const state = {
  latest: null,
  history: null,
  routeValues: SAMPLE_ROUTE_VALUES,
  hazardZones: SAMPLE_HAZARD_ZONES,
  listings: [],
  filtered: [],
  view: "list",
  listLayout: "cards",
  mapLayerType: "standard",
  map: null,
  mapBaseLayers: null,
  markerLayer: null,
  hazardAreaLayer: null,
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
};

const els = {
  appShell: document.getElementById("appShell"),
  refreshButton: document.getElementById("refreshButton"),
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
  mappedOnly: document.getElementById("mappedOnly"),
  showExcluded: document.getElementById("showExcluded"),
  hazardAreaToggle: document.getElementById("hazardAreaToggle"),
  hazardAreaStatus: document.getElementById("hazardAreaStatus"),
  statusMessage: document.getElementById("statusMessage"),
  listingCount: document.getElementById("listingCount"),
  currentAverage: document.getElementById("currentAverage"),
  historyAverage: document.getElementById("historyAverage"),
  updatedAt: document.getElementById("updatedAt"),
  resultCount: document.getElementById("resultCount"),
  mapReadyCount: document.getElementById("mapReadyCount"),
  listLayoutControl: document.getElementById("listLayoutControl"),
  townCount: document.getElementById("townCount"),
  distributionSummary: document.getElementById("distributionSummary"),
  distributionGrid: document.getElementById("distributionGrid"),
  schoolAverageSummary: document.getElementById("schoolAverageSummary"),
  schoolAverageGrid: document.getElementById("schoolAverageGrid"),
  recentMovementGrid: document.getElementById("recentMovementGrid"),
  alertGrid: document.getElementById("alertGrid"),
  dataSourceGrid: document.getElementById("dataSourceGrid"),
  candidateCount: document.getElementById("candidateCount"),
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
};

function init() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  loadSavedState();
  applyDeviceMode();
  bindEvents();
  renderBackupSummary();
  loadData();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function bindEvents() {
  els.refreshButton.addEventListener("click", loadData);
  els.searchInput.addEventListener("input", render);
  els.sortSelect.addEventListener("change", render);
  els.townFilter.addEventListener("change", render);
  els.schoolFilter.addEventListener("change", render);
  els.priceMin.addEventListener("input", render);
  els.priceMax.addEventListener("input", render);
  els.areaMin.addEventListener("input", render);
  els.areaMax.addEventListener("input", render);
  els.exportBackupButton.addEventListener("click", exportBackup);
  els.importBackupButton.addEventListener("click", () => {
    els.backupFileInput.value = "";
    els.backupFileInput.click();
  });
  els.backupFileInput.addEventListener("change", importBackup);
  els.favoriteOnly.addEventListener("change", render);
  els.candidateOnly.addEventListener("change", render);
  els.newOnly.addEventListener("change", render);
  els.cheapOnly.addEventListener("change", render);
  els.mappedOnly.addEventListener("change", render);
  els.showExcluded.addEventListener("change", render);
  els.hazardAreaToggle?.addEventListener("change", () => {
    state.showHazardAreas = Boolean(els.hazardAreaToggle.checked);
    localStorage.setItem(STORAGE_KEYS.showHazardAreas, state.showHazardAreas ? "1" : "0");
    renderHazardAreas();
  });
  els.closeDetail.addEventListener("click", closeDetail);
  document.addEventListener("pointerup", handleMouseDetailPointer, true);
  document.addEventListener("click", handleDetailLinkClick, true);
  document.addEventListener("click", handleDelegatedActionClick, true);
  document.addEventListener("keydown", handleDelegatedOpenKeydown);
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

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      clearDetailHash();
      activateView(button.dataset.view || "list");
    });
  });
}

function activateView(viewName) {
  state.view = viewName || "list";
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

function loadSavedState() {
  state.favorites = loadStoredSet(STORAGE_KEYS.favorites);
  state.candidates = loadStoredSet(STORAGE_KEYS.candidates);
  state.excluded = loadStoredSet(STORAGE_KEYS.excluded);
  state.hiddenImages = loadStoredSet(STORAGE_KEYS.hiddenImages);
  state.notes = loadStoredObject(STORAGE_KEYS.notes);
  state.listLayout = normalizeListLayout(localStorage.getItem(STORAGE_KEYS.listLayout));
  state.mapLayerType = normalizeMapLayerType(localStorage.getItem(STORAGE_KEYS.mapLayerType));
  state.deviceMode = normalizeDeviceMode(localStorage.getItem(STORAGE_KEYS.deviceMode) || defaultDeviceMode());
  state.showHazardAreas = localStorage.getItem(STORAGE_KEYS.showHazardAreas) === "1";
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
  setStatus("読み込み中");
  try {
    const [latest, history, routeValues, hazardZones] = await Promise.all([
      fetchDataFile("latest.json"),
      fetchDataFile("history.json"),
      fetchOptionalDataFile("route-values.json", SAMPLE_ROUTE_VALUES),
      fetchOptionalDataFile("hazard-zones.json", SAMPLE_HAZARD_ZONES),
    ]);
    state.latest = latest;
    state.history = history;
    state.routeValues = routeValues || SAMPLE_ROUTE_VALUES;
    state.hazardZones = hazardZones || SAMPLE_HAZARD_ZONES;
    setStatus("");
  } catch (error) {
    state.latest = SAMPLE_LATEST;
    state.history = SAMPLE_HISTORY;
    state.routeValues = SAMPLE_ROUTE_VALUES;
    state.hazardZones = SAMPLE_HAZARD_ZONES;
    setStatus("最新データを取得できないため、サンプルを表示しています。");
  }

  state.listings = state.latest.listings.map((listing, index) => normalizeListing(listing, index));
  populateTownFilter();
  populateSchoolFilter();
  render();
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
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  return response.json();
}

function normalizeListing(listing, index) {
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
  if (embedded) {
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
  return normalizeRouteValueRecord(best.record, best.match_note, best.precision, best.distance_km);
}

function scoreRouteValueRecord(record, listing) {
  const value = routeValueYenPerSqm(record);
  if (!value) return null;

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

  const recordLat = numberValue(record.latitude ?? record.lat);
  const recordLng = numberValue(record.longitude ?? record.lng);
  if (
    recordLat &&
    recordLng &&
    Number.isFinite(listing.map_latitude) &&
    Number.isFinite(listing.map_longitude)
  ) {
    const distanceKm = haversineKm(listing.map_latitude, listing.map_longitude, recordLat, recordLng);
    if (distanceKm <= 0.15) {
      return { record, score: 78, precision: "nearby", match_note: "近接地点一致", distance_km: distanceKm };
    }
    if (distanceKm <= 0.45) {
      return { record, score: 66, precision: "nearby", match_note: "近接地点候補", distance_km: distanceKm };
    }
    if (record.town === listing.town && distanceKm <= 1.2) {
      return { record, score: 48, precision: "town_nearby", match_note: "同町内の近接候補", distance_km: distanceKm };
    }
  }

  if (record.town && record.town === listing.town) {
    return { record, score: 24, precision: "town", match_note: "町名一致", distance_km: null };
  }
  return null;
}

function normalizeRouteValueRecord(record, matchNote, precision, distanceKm) {
  const routeValue = routeValueYenPerSqm(record);
  if (!routeValue) return null;
  const routeValueType = routeValueRecordType(record);
  const routeMethodUnit = routeValue * TSUBO_SQM / 10000;
  const fixedAssetUnit = routeValueType === "fixed_asset_tax" ? routeMethodUnit : null;
  const publicReference =
    numberValue(record.public_reference_unit_price_man_per_tsubo) ||
    numberValue(record.market_reference_unit_price_man_per_tsubo) ||
    publicReferenceFromYenPerSqm(record) ||
    (routeValueType === "inheritance_tax"
      ? routeMethodUnit / INHERITANCE_TAX_ROUTE_VALUE_RATIO
      : routeMethodUnit / FIXED_ASSET_ROUTE_VALUE_RATIO);
  return {
    route_value_type: routeValueType,
    route_value_yen_per_sqm: routeValue,
    inheritance_tax_route_value_yen_per_sqm: numberValue(record.inheritance_tax_route_value_yen_per_sqm),
    fixed_asset_unit_price_man_per_tsubo: fixedAssetUnit,
    route_method_unit_price_man_per_tsubo: routeMethodUnit,
    public_reference_unit_price_man_per_tsubo: publicReference,
    public_price_yen_per_sqm: numberValue(record.public_price_yen_per_sqm),
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
      record?.value_yen_per_sqm
  );
}

function routeValueRecordType(record) {
  const raw = String(record?.route_value_type || record?.value_type || "").toLowerCase();
  if (raw.includes("inheritance") || raw.includes("souzoku") || raw.includes("相続")) return "inheritance_tax";
  if (record?.inheritance_tax_route_value_yen_per_sqm) return "inheritance_tax";
  return "fixed_asset_tax";
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
  const affected = status === "affected" || hazards.length > 0 || record.affected === true;
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
        return { type: item, level: "", note: "" };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      return {
        type: item.type || item.name || item.hazard_type || "",
        level: item.level || item.rank || item.depth || "",
        note: item.note || item.description || "",
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
  state.filtered = sortListings(filterListings(state.listings));
  renderSummary();
  renderBackupSummary();
  updateHazardAreaControl();
  renderList();
  renderDashboard();
  renderHistory();
  renderDistribution();
  renderCompare();
  if (state.view === "map") {
    renderMap();
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function filterListings(listings) {
  const query = normalizeQuery(els.searchInput.value);
  const townFilter = els.townFilter.value;
  const schoolFilter = els.schoolFilter.value;
  const priceRange = inputRange(els.priceMin.value, els.priceMax.value);
  const areaRange = inputRange(els.areaMin.value, els.areaMax.value);
  return listings.filter((listing) => {
    if (!els.showExcluded.checked && isExcluded(listing)) {
      return false;
    }
    if (els.favoriteOnly.checked && !isFavorite(listing)) {
      return false;
    }
    if (els.candidateOnly.checked && !isCandidate(listing)) {
      return false;
    }
    if (townFilter && listing.town !== townFilter) {
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
    if (!withinRange(numberValue(listing.price_man_yen), priceRange)) {
      return false;
    }
    if (!withinRange(numberValue(listing.land_area_tsubo), areaRange)) {
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
    if (els.mappedOnly.checked && !Number.isFinite(listing.map_latitude)) {
      return false;
    }
    return true;
  });
}

function sortListings(listings) {
  const value = els.sortSelect.value;
  return [...listings].sort((a, b) => {
    if (value === "priceAsc") return numberValue(a.price_man_yen) - numberValue(b.price_man_yen);
    if (value === "priceDesc") return numberValue(b.price_man_yen) - numberValue(a.price_man_yen);
    if (value === "areaAsc") return numberValue(a.land_area_sqm) - numberValue(b.land_area_sqm);
    if (value === "areaDesc") return numberValue(b.land_area_sqm) - numberValue(a.land_area_sqm);
    if (value === "unitAsc") return numberValue(a.unit_price_man_per_tsubo) - numberValue(b.unit_price_man_per_tsubo);
    if (value === "unitDesc") return numberValue(b.unit_price_man_per_tsubo) - numberValue(a.unit_price_man_per_tsubo);
    return newRank(b) - newRank(a) || dateRank(b.first_seen_date) - dateRank(a.first_seen_date) || numberValue(a.unit_price_man_per_tsubo) - numberValue(b.unit_price_man_per_tsubo);
  });
}

function newRank(listing) {
  return (listing.is_new ? 4 : 0) + (listing.is_cheap_new ? 2 : 0);
}

function dateRank(value) {
  return value ? new Date(value).getTime() : 0;
}

function priceDropInfo(listing) {
  const current = numberValue(listing.price_man_yen);
  const history = Array.isArray(listing.price_history) ? listing.price_history : [];
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
  const latestSummary = state.latest.summary || {};
  const historySummary = state.history?.summary || {};
  els.listingCount.textContent = `${formatInteger(latestSummary.listing_count || state.listings.length)}件`;
  els.currentAverage.textContent = formatUnit(latestSummary.overall_average_unit_price_man_per_tsubo);
  els.historyAverage.textContent = formatUnit(historySummary.historical_average_unit_price_man_per_tsubo);
  els.updatedAt.textContent = formatDateTime(state.latest.generated_at);
}

function renderBackupSummary() {
  const noteCount = Object.values(state.notes).filter((value) => String(value || "").trim()).length;
  els.backupSummary.textContent = `お気に入り ${formatInteger(state.favorites.size)} / 買付候補 ${formatInteger(state.candidates.size)} / 除外 ${formatInteger(state.excluded.size)} / 写真非表示 ${formatInteger(state.hiddenImages.size)} / メモ ${formatInteger(noteCount)}`;
}

function renderList() {
  els.resultCount.textContent = `${formatInteger(state.filtered.length)}件表示`;
  els.mapReadyCount.textContent = `地図 ${formatInteger(state.filtered.filter((item) => Number.isFinite(item.map_latitude)).length)}件`;
  updateListLayoutButtons();
  els.listingList.className = `listing-list layout-${state.listLayout}`;
  if (!state.filtered.length) {
    els.listingList.innerHTML = `<div class="empty-state">該当する物件がありません</div>`;
    return;
  }
  if (state.listLayout === "compact") {
    els.listingList.innerHTML = state.filtered.map(renderListingCompact).join("");
  } else if (state.listLayout === "table") {
    els.listingList.innerHTML = renderListingTable(state.filtered);
  } else {
    els.listingList.innerHTML = state.filtered.map(renderListingCard).join("");
  }
  bindListingActions(els.listingList);
}

function updateListLayoutButtons() {
  els.listLayoutControl?.querySelectorAll("[data-list-layout]").forEach((button) => {
    const active = button.dataset.listLayout === state.listLayout;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderListingCard(listing) {
  const color = unitColorClass(listing.unit_price_man_per_tsubo);
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
        ${metric("面積", `${formatNumber(listing.land_area_tsubo)}坪`)}
        ${metric("坪単価", formatUnit(listing.unit_price_man_per_tsubo))}
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
          <span>${formatNumber(listing.land_area_tsubo)}坪</span>
          <span>${formatUnit(listing.unit_price_man_per_tsubo)}</span>
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
    <div class="list-table-wrap">
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
  `;
}

function renderListingTableRow(listing) {
  const school = resolveSchoolInfo(listing);
  const assessment = assessListing(listing);
  const positionText = Number.isFinite(listing.map_latitude) ? (listing.is_approx_position ? "概算位置" : "地図あり") : "地図なし";
  return `
    <tr data-open-listing="${escapeAttr(listing.id)}" tabindex="0" role="button" aria-label="${escapeAttr(`${shortTitle(listing)}の詳細を開く`)}">
      <td>
        <strong>${escapeHtml(shortTitle(listing))}</strong>
        <span>${escapeHtml(listing.town)} / ${escapeHtml(listing.source)}</span>
        <small>${escapeHtml(listing.address || "-")}</small>
      </td>
      <td><strong>${formatPrice(listing.price_man_yen)}</strong></td>
      <td><strong>${formatNumber(listing.land_area_tsubo)}坪</strong><span>${formatNumber(listing.land_area_sqm)}㎡</span></td>
      <td><strong>${formatUnit(listing.unit_price_man_per_tsubo)}</strong></td>
      <td><span>${escapeHtml(school.elementary_text)}</span><small>${escapeHtml(school.middle_text)}</small></td>
      <td>
        <strong>${escapeHtml(assessment.label)}</strong>
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

function renderBadges(listing) {
  const badges = [];
  const assessment = assessListing(listing);
  const drop = priceDropInfo(listing);
  if (isFavorite(listing)) badges.push(`<span class="badge favorite">お気に入り</span>`);
  if (isCandidate(listing)) badges.push(`<span class="badge candidate">買付候補</span>`);
  if (isExcluded(listing)) badges.push(`<span class="badge warning">除外</span>`);
  if (drop) badges.push(`<span class="badge cheap">値下げ</span>`);
  if (userNote(listing)) badges.push(`<span class="badge approx">メモ</span>`);
  if (listing.is_new) badges.push(`<span class="badge new">新着</span>`);
  if (listing.is_cheap_new) badges.push(`<span class="badge cheap">割安新着</span>`);
  if (assessment.discount_rate >= 0.1) badges.push(`<span class="badge cheap">査定割安</span>`);
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
    const overviewMode = state.filtered.length > 30 || outsideCity;
    state.map.fitBounds(overviewMode ? cityBounds : markerBounds, {
      padding: [16, 16],
      maxZoom: overviewMode ? 10 : 12,
    });
  } else {
    fitMapToCity(state.map);
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

function updateHazardAreaControl() {
  if (els.hazardAreaToggle) {
    els.hazardAreaToggle.checked = state.showHazardAreas;
  }
  if (!els.hazardAreaStatus) {
    return;
  }
  const count = hazardGeoJsonFeatures().length;
  if (count) {
    els.hazardAreaStatus.textContent = `${formatInteger(count)}エリアを表示できます`;
  } else {
    els.hazardAreaStatus.textContent = "API取得後に地図上へ表示できます";
  }
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
  const isFlood = text.includes("浸水") || text.includes("洪水") || text.includes("flood");
  const color = isFlood ? "#1769e0" : "#dc5a2a";
  return {
    color,
    weight: 2,
    opacity: 0.86,
    fillColor: color,
    fillOpacity: 0.18,
  };
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
    .sort((a, b) => numberValue(b.listing_count) - numberValue(a.listing_count) || a.town.localeCompare(b.town, "ja"));

  els.townCount.textContent = `${formatInteger(visibleRows.length)}町表示`;
  if (!visibleRows.length) {
    els.historyGrid.innerHTML = `<div class="empty-state">町別データがありません</div>`;
    return;
  }
  els.historyGrid.innerHTML = visibleRows
    .map(
      (row) => `
        <article class="history-row">
          <h3>${escapeHtml(row.town)}</h3>
          <div class="history-metrics">
            ${metric("現在件数", `${formatInteger(row.listing_count)}件`)}
            ${metric("現在平均", formatUnit(row.average_unit_price_man_per_tsubo))}
            ${metric("最低", formatUnit(row.minimum_unit_price_man_per_tsubo))}
            ${metric("最高", formatUnit(row.maximum_unit_price_man_per_tsubo))}
            ${metric("履歴件数", `${formatInteger(row.historical_unique_listing_count)}件`)}
            ${metric("履歴平均", formatUnit(row.historical_average_unit_price_man_per_tsubo))}
          </div>
        </article>
      `
    )
    .join("");
}

function renderDistribution() {
  const values = state.filtered
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

function buildDistributionBins(values) {
  const max = Math.max(...values);
  const step = max <= 12 ? 2 : max <= 30 ? 5 : 10;
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
      <td>${formatNumber(listing.land_area_tsubo)}坪</td>
      <td>${formatUnit(listing.unit_price_man_per_tsubo)}</td>
      <td>${escapeHtml(assessment.label)}<br><small>${formatUnit(assessment.reference_unit_price)}基準</small></td>
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

function buildTownRows() {
  const historyByTown = new Map((state.history?.towns || []).map((row) => [row.town, row]));
  const latestRows = state.latest?.towns?.length ? state.latest.towns : buildTownRowsFromListings(state.listings);
  return latestRows.map((row) => {
    const history = historyByTown.get(row.town) || {};
    return {
      town: row.town,
      listing_count: row.listing_count,
      average_unit_price_man_per_tsubo: row.average_unit_price_man_per_tsubo,
      minimum_unit_price_man_per_tsubo: row.minimum_unit_price_man_per_tsubo,
      maximum_unit_price_man_per_tsubo: row.maximum_unit_price_man_per_tsubo,
      historical_unique_listing_count: history.historical_unique_listing_count ?? row.listing_count,
      historical_average_unit_price_man_per_tsubo:
        history.historical_average_unit_price_man_per_tsubo ?? row.average_unit_price_man_per_tsubo,
    };
  });
}

function buildTownRowsFromListings(listings) {
  const groups = new Map();
  listings.forEach((listing) => {
    const values = groups.get(listing.town) || [];
    values.push(numberValue(listing.unit_price_man_per_tsubo));
    groups.set(listing.town, values);
  });
  return [...groups.entries()].map(([town, values]) => ({
    town,
    listing_count: values.length,
    average_unit_price_man_per_tsubo: averageNumbers(values),
    minimum_unit_price_man_per_tsubo: Math.min(...values),
    maximum_unit_price_man_per_tsubo: Math.max(...values),
  }));
}

function averageNumbers(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populateTownFilter() {
  const currentValue = els.townFilter.value;
  const towns = [...new Set(state.listings.map((listing) => listing.town).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
  els.townFilter.innerHTML = [
    `<option value="">すべて</option>`,
    ...towns.map((town) => `<option value="${escapeAttr(town)}">${escapeHtml(town)}</option>`),
  ].join("");
  if (currentValue && towns.includes(currentValue)) {
    els.townFilter.value = currentValue;
  }
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
  window.scrollTo({ top: 0, behavior: "smooth" });
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
        ${kv("土地面積", `${formatNumber(listing.land_area_sqm)}㎡ / ${formatNumber(listing.land_area_tsubo)}坪`)}
        ${kv("坪単価", formatUnit(listing.unit_price_man_per_tsubo))}
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
        ${kv("土地面積", `${formatNumber(listing.land_area_sqm)}㎡ / ${formatNumber(listing.land_area_tsubo)}坪`)}
        ${kv("坪単価", formatUnit(listing.unit_price_man_per_tsubo))}
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
    ${renderDetailMapSection(listing)}
    ${renderLegalNoticeSection(listing.legal_notice)}
    ${renderHazardSection(listing.hazard_reference)}
    <section class="detail-section">
      <h3>割安査定</h3>
      <dl class="detail-kv">
        ${kv("判定", assessment.label)}
        ${kv("信頼度", assessment.confidence)}
        ${kv("比較基準", formatUnit(assessment.reference_unit_price))}
        ${kv("平均との差", `${formatNumber(assessment.discount_amount)}万円/坪`)}
        ${kv("割安率", assessment.discount_rate !== null ? `${formatNumber(assessment.discount_rate * 100)}%` : "-")}
        ${kv("概算査定", formatPrice(assessment.estimated_price_man_yen))}
        ${kv("根拠", assessment.reasons.join("<br>"))}
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
        ${kv("判定", hazard.affected ? "該当あり" : hazard.status === "not_affected" ? "該当なし" : "要確認")}
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
  const sectionTitle = isInheritanceRoute ? "国税庁路線価方式" : "固定資産税路線価";
  const routeUnitLabel = isInheritanceRoute ? "路線価方式坪単価" : "固定資産税評価水準";
  const routeUnitValue = isInheritanceRoute
    ? routeValue.route_method_unit_price_man_per_tsubo
    : routeValue.fixed_asset_unit_price_man_per_tsubo;
  const marketDiff = routeValue.public_reference_unit_price_man_per_tsubo - numberValue(listing.unit_price_man_per_tsubo);
  const diffRate = routeValue.public_reference_unit_price_man_per_tsubo
    ? marketDiff / routeValue.public_reference_unit_price_man_per_tsubo
    : null;
  const matchText = [
    routeValue.match_note,
    routeValue.distance_km ? `約${formatNumber(routeValue.distance_km)}km` : "",
    `信頼度 ${routeValue.confidence}`,
  ].filter(Boolean).join(" / ");
  return `
    <section class="detail-section">
      <h3>${sectionTitle}</h3>
      <dl class="detail-kv">
        ${kv("路線価", formatYenPerSqm(routeValue.route_value_yen_per_sqm))}
        ${kv(routeUnitLabel, formatUnit(routeUnitValue))}
        ${appraisal ? kv("路線価方式査定", `${formatPrice(appraisal.appraised_value_man_yen)}（${formatUnit(appraisal.appraised_unit_price_man_per_tsubo)}）`) : ""}
        ${appraisal ? kv("補正率", formatNumber(appraisal.correction_rate)) : ""}
        ${appraisal && appraisal.setback.area_sqm ? kv("SB控除", `${formatNumber(appraisal.setback.area_sqm)}㎡ / ${formatPrice(appraisal.setback.deduction_yen / 10000)}`) : ""}
        ${kv("公示価格水準換算", formatUnit(routeValue.public_reference_unit_price_man_per_tsubo))}
        ${kv("掲載坪単価との差", `${formatNumber(marketDiff)}万円/坪${diffRate !== null ? `（${formatNumber(diffRate * 100)}%）` : ""}`)}
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
  const unit = numberValue(listing.unit_price_man_per_tsubo);
  const peers = state.listings.filter((item) => item.town === listing.town && item.id !== listing.id);
  const peerAvg = averageNumbers(peers.map((item) => numberValue(item.unit_price_man_per_tsubo)).filter(Boolean));
  const historyRow = (state.history?.towns || []).find((row) => row.town === listing.town);
  const historyAvg = numberValue(historyRow?.historical_average_unit_price_man_per_tsubo);
  const historyCount = numberValue(historyRow?.historical_unique_listing_count);
  const overallAvg = numberValue(state.latest?.summary?.overall_average_unit_price_man_per_tsubo);
  const routeValue = listing.route_value_reference;
  const sources = [];
  const reasons = [];

  if (routeValue?.public_reference_unit_price_man_per_tsubo) {
    const routeWeight = routeValue.precision === "exact" || routeValue.precision === "address" ? 0.65 : routeValue.precision === "nearby" ? 0.45 : 0.25;
    sources.push({ value: routeValue.public_reference_unit_price_man_per_tsubo, weight: routeWeight });
    const routeLabel = routeValue.route_value_type === "inheritance_tax" ? "相続税路線価" : "固定資産税路線価";
    reasons.push(`${routeLabel} ${formatYenPerSqm(routeValue.route_value_yen_per_sqm)} を公示価格水準へ換算 ${formatUnit(routeValue.public_reference_unit_price_man_per_tsubo)}`);
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
    reference_unit_price: reference,
    discount_amount: discountAmount,
    discount_rate: discountRate,
    estimated_price_man_yen: estimatedPrice,
    label: discountLabel(discountRate),
    confidence: assessmentConfidence(peers.length, historyCount, routeValue),
    route_value: routeValue,
    reasons,
  };
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
  const average = state.latest?.summary?.overall_average_unit_price_man_per_tsubo;
  const unit = numberValue(unitPrice);
  if (average) {
    if (unit <= average * 0.75) return "low";
    if (unit <= average * 1.4) return "mid";
    return "high";
  }
  if (unit <= 3) return "low";
  if (unit <= 7) return "mid";
  return "high";
}

function shortTitle(listing) {
  const title = listing.title || listing.address || `${listing.town} 売土地`;
  return title.length > 62 ? `${title.slice(0, 62)}...` : title;
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function formatPrice(value) {
  return `${formatNumber(value)}万円`;
}

function formatUnit(value) {
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
  return Number.isFinite(Number(value)) ? `${formatNumber(value)}%` : "-";
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
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
