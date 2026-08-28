(function () {
  "use strict";

  const payload = window.CHEMICAL_DATA;
  const engine = window.ChemicalSearch;
  const storageRules = window.StorageRules;
  const storageMap = window.STORAGE_MAP;
  const records = payload && Array.isArray(payload.records) ? payload.records : [];
  if (storageRules && storageMap) records.forEach(record => storageRules.applyStorage(record, storageMap));
  const indexes = records.map(engine.makeIndex);
  const pageSize = 60;
  let selectedFilter = "全部";
  let selectedSort = "name";
  let visibleLimit = pageSize;
  let currentQuery = "";
  let selectedCandidate = null;
  let browseRequested = false;

  const elements = {
    input: document.getElementById("search-input"),
    clear: document.getElementById("clear-button"),
    filters: document.getElementById("category-filters"),
    sort: document.getElementById("sort-select"),
    dataCount: document.getElementById("data-count"),
    results: document.getElementById("results"),
    resultCount: document.getElementById("result-count"),
    resultGrid: document.getElementById("result-grid"),
    candidates: document.getElementById("candidate-list"),
    banner: document.getElementById("status-banner"),
    loadMore: document.getElementById("load-more")
  };

  function text(value, fallback) {
    if (Array.isArray(value)) return value.length ? value.join("；") : (fallback || "—");
    return value || fallback || "—";
  }

  function cardClass(record) {
    const category = record.primaryCategory || "";
    if (category.includes("易制爆")) return "explosive";
    if (category.includes("易制毒")) return "precursor";
    if (category.includes("易燃")) return "flammable";
    if (category.includes("普通")) return "ordinary";
    return "hazard";
  }

  function createDefinition(label, value, extraClass) {
    const fragment = document.createDocumentFragment();
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    if (extraClass) dd.className = extraClass;
    fragment.append(dt, dd);
    return fragment;
  }

  function makeCard(record) {
    const article = document.createElement("article");
    article.className = `record-card ${cardClass(record)}${record.needsManualReview ? " review" : ""}`;
    article.dataset.id = record.id;

    const header = document.createElement("div");
    header.className = "card-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = record.standardName;
    const cas = document.createElement("p");
    cas.className = "cas";
    cas.textContent = `CAS：${record.cas || "未提供"}`;
    titleWrap.append(title, cas);
    const primary = document.createElement("span");
    primary.className = "primary-badge";
    primary.textContent = record.primaryCategory;
    header.append(titleWrap, primary);

    const body = document.createElement("div");
    body.className = "card-body";
    const tags = document.createElement("div");
    tags.className = "tag-list";
    for (const tagText of record.categoryTags || []) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = tagText;
      tags.appendChild(tag);
    }
    if (record.needsManualReview) {
      const tag = document.createElement("span");
      tag.className = "tag tag-review";
      tag.textContent = "需要人工确认";
      tags.appendChild(tag);
    }

    const details = document.createElement("dl");
    details.className = "details";
    const detailItems = [
      createDefinition("英文名称", text(record.englishName, "名录未提供")),
      createDefinition("常用别名", text(record.aliases, "名录未提供")),
      createDefinition("危险性类型", text(record.hazardTypes, "名录未提供")),
      createDefinition("命中的名录", text(record.sourceLists, "当前名录未检出")),
      createDefinition("建议存放区域", record.suggestedStorage, "storage-value")
    ];
    const actualStorage = record.actualStorage || "待确认";
    if (actualStorage !== "待确认") {
      detailItems.push(createDefinition(
        "实际存放区域",
        actualStorage,
        "storage-value actual-confirmed"
      ));
    }
    detailItems.push(
      createDefinition("是否需要人工确认", record.needsManualReview ? `是：${record.reviewReason || "需复核"}` : "否", record.needsManualReview ? "manual-value" : "")
    );
    details.append(...detailItems);
    body.append(tags, details);
    article.append(header, body);
    return article;
  }

  function filterRecord(record) {
    const tags = new Set(record.categoryTags || []);
    if (selectedFilter === "全部") return true;
    if (selectedFilter === "易制爆" || selectedFilter === "易制毒" || selectedFilter === "易燃") return tags.has(selectedFilter);
    if (selectedFilter === "其他危险化学品") return record.primaryCategory === "其他危险化学品";
    if (selectedFilter === "普通药品") return (record.primaryCategory || "").includes("普通药品");
    return true;
  }

  function sortRecords(list) {
    return [...list].sort((a, b) => {
      if (selectedSort === "cas") return (a.cas || "zzzz").localeCompare(b.cas || "zzzz", undefined, { numeric: true }) || a.standardName.localeCompare(b.standardName, "zh-CN");
      return a.standardName.localeCompare(b.standardName, "zh-CN") || (a.cas || "").localeCompare(b.cas || "");
    });
  }

  function setBanner(message, type) {
    elements.banner.hidden = !message;
    elements.banner.className = `status-banner${type ? ` ${type}` : ""}`;
    elements.banner.textContent = message || "";
  }

  function renderCandidates(list) {
    elements.candidates.replaceChildren();
    elements.candidates.hidden = false;
    for (const record of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "candidate-card";
      button.dataset.id = record.id;
      const info = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = record.standardName;
      const small = document.createElement("small");
      small.textContent = `CAS：${record.cas || "未提供"} · ${record.primaryCategory}`;
      info.append(strong, small);
      const action = document.createElement("span");
      action.className = "candidate-action";
      action.textContent = "选择查看";
      button.append(info, action);
      button.addEventListener("click", () => {
        selectedCandidate = record;
        elements.input.value = record.standardName;
        currentQuery = record.standardName;
        render();
        document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      elements.candidates.appendChild(button);
    }
  }

  function renderEmpty(title, message) {
    const box = document.createElement("div");
    box.className = "empty-state";
    const heading = document.createElement("h3");
    const paragraph = document.createElement("p");
    heading.textContent = title;
    paragraph.textContent = message;
    box.append(heading, paragraph);
    elements.resultGrid.appendChild(box);
  }

  function render() {
    elements.resultGrid.replaceChildren();
    elements.candidates.replaceChildren();
    elements.candidates.hidden = true;
    elements.loadMore.hidden = true;
    const query = currentQuery.trim();
    let list = [];

    if (!query && !selectedCandidate && !browseRequested) {
      elements.results.hidden = true;
      setBanner("", "");
      elements.resultCount.textContent = "";
      return;
    }
    elements.results.hidden = false;

    if (selectedCandidate) {
      list = [selectedCandidate];
      setBanner("已从候选项中选择准确记录。分类仅依据所选记录判定。", "");
      elements.resultCount.textContent = "1 条准确记录";
    } else if (query) {
      const outcome = engine.search(records, query, { indexes });
      if (outcome.type === "exact") {
        list = outcome.records;
        const duplicateMessage = list.length > 1 ? "；同名对应多条记录，请根据 CAS 号选择" : "";
        setBanner(`已按${outcome.matchedBy}准确匹配${duplicateMessage}。`, "");
        elements.resultCount.textContent = `${list.length} 条准确记录`;
      } else if (outcome.type === "candidates") {
        const manualArea = storageRules && storageMap ? storageRules.manualAreaForInput(query, storageMap) : "";
        if (manualArea) {
          const laboratoryRecord = engine.makeUnlistedRecord(query);
          storageRules.applyStorage(laboratoryRecord, storageMap);
          list = [laboratoryRecord];
          setBanner("当前三份名录中未检出准确记录，但已按308实验室位置表确认实际存放区域；法规分类仍需结合 SDS 核对。", "ordinary");
          elements.resultCount.textContent = "1 条实验室位置记录";
        } else {
        renderCandidates(outcome.records);
        setBanner("未找到准确记录，请从候选项中选择或使用 CAS 号确认。", "warning");
        elements.resultCount.textContent = `${outcome.records.length} 个候选项`;
        renderEmpty("等待选择候选药品", "候选结果不会自动用于分类。请选择一项或输入完整 CAS 号。 ");
        return;
        }
      } else {
        list = outcome.records;
        if (storageRules && storageMap) list.forEach(record => storageRules.applyStorage(record, storageMap));
        setBanner("当前三份名录中未检出准确记录。该状态不等于绝对安全，且输入内容需再次核对。", "ordinary");
        elements.resultCount.textContent = "当前名录未检出";
      }
    } else {
      list = sortRecords(records.filter(filterRecord));
      setBanner("", "");
      elements.resultCount.textContent = `${list.length.toLocaleString("zh-CN")} 条记录`;
    }

    if (!query && !selectedCandidate) list = list.slice(0, visibleLimit);
    if (!list.length) {
      renderEmpty("当前筛选下没有记录", "可切换分类筛选，或输入药品名称、别名及 CAS 号查询。 ");
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const record of list) fragment.appendChild(makeCard(record));
    elements.resultGrid.appendChild(fragment);

    if (!query && !selectedCandidate) {
      const total = records.filter(filterRecord).length;
      if (visibleLimit < total) {
        elements.loadMore.hidden = false;
        elements.loadMore.textContent = `显示更多（已显示 ${Math.min(visibleLimit, total)} / ${total}）`;
      }
    }
  }

  let timer;
  elements.input.addEventListener("input", event => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      currentQuery = event.target.value;
      selectedCandidate = null;
      visibleLimit = pageSize;
      render();
    }, 90);
  });
  elements.input.addEventListener("search", () => {
    currentQuery = elements.input.value;
    selectedCandidate = null;
    render();
  });
  elements.clear.addEventListener("click", () => {
    elements.input.value = "";
    currentQuery = "";
    selectedCandidate = null;
    browseRequested = false;
    visibleLimit = pageSize;
    render();
    elements.input.focus();
  });
  elements.filters.addEventListener("click", event => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    selectedFilter = button.dataset.filter;
    browseRequested = true;
    visibleLimit = pageSize;
    for (const chip of elements.filters.querySelectorAll("button")) {
      const active = chip === button;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    }
    if (!currentQuery) render();
  });
  elements.sort.addEventListener("change", event => {
    selectedSort = event.target.value;
    browseRequested = true;
    visibleLimit = pageSize;
    render();
  });
  elements.loadMore.addEventListener("click", () => {
    visibleLimit += pageSize;
    render();
  });

  if (!payload || !records.length || !engine) {
    elements.dataCount.textContent = "本地数据载入失败";
    setBanner("未能载入药品数据文件，请确认 data/chemicals.js 与 index.html 位于同一网站文件夹。", "warning");
    elements.results.hidden = false;
    renderEmpty("数据未载入", "请保持网站文件夹结构完整后重新打开 index.html。 ");
    return;
  }
  elements.dataCount.textContent = `已载入 ${records.length.toLocaleString("zh-CN")} 条合并记录`;
  render();
})();
