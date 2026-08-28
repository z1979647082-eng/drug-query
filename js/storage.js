(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StorageRules = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const allowedAreas = new Set(["冰箱", "毒害品", "腐蚀品", "普通化学品柜", "酸性危化品", "易燃", "易制毒"]);

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase()
      .replace(/[，]/g, ",").replace(/[；、]/g, ";").replace(/[：]/g, ":")
      .replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/[［]/g, "[").replace(/[］]/g, "]")
      .replace(/[＞]/g, ">").replace(/[＜]/g, "<").replace(/[～]/g, "~")
      .replace(/[－—–]/g, "-").replace(/·/g, "").replace(/[\s;,]/g, "");
  }

  function normalizeCas(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeArea(value) {
    const area = String(value || "").trim();
    if (/^普通化学品柜\s*[1-5]$/.test(area)) return "普通化学品柜";
    return allowedAreas.has(area) ? area : "";
  }

  function compileMap(storageMap) {
    const map = storageMap || {};
    const byCas = new Map();
    const byName = new Map();
    const conflicts = new Set();
    for (const [cas, area] of Object.entries(map.byCas || {})) {
      const key = normalizeCas(cas);
      const normalizedArea = normalizeArea(area);
      if (key && normalizedArea) byCas.set(key, normalizedArea);
    }
    for (const [name, area] of Object.entries(map.byName || {})) {
      const key = normalizeName(name);
      const normalizedArea = normalizeArea(area);
      if (key && normalizedArea) byName.set(key, normalizedArea);
    }
    for (const name of Object.keys(map.conflictsByName || {})) {
      const key = normalizeName(name);
      if (key) conflicts.add(key);
    }
    return { byCas, byName, conflicts };
  }

  function resolveActualStorage(record, storageMap) {
    const compiled = storageMap && storageMap.byCas instanceof Map ? storageMap : compileMap(storageMap);
    const casKey = normalizeCas(record && record.cas);
    if (casKey && compiled.byCas.has(casKey)) return compiled.byCas.get(casKey);

    const standardKey = normalizeName(record && record.standardName);
    if (compiled.conflicts.has(standardKey)) return "待确认";
    if (compiled.byName.has(standardKey)) return compiled.byName.get(standardKey);

    const aliasAreas = new Set();
    for (const alias of (record && record.aliases) || []) {
      const key = normalizeName(alias);
      if (compiled.conflicts.has(key)) return "待确认";
      if (compiled.byName.has(key)) aliasAreas.add(compiled.byName.get(key));
    }
    if (aliasAreas.size === 1) return [...aliasAreas][0];
    if (aliasAreas.size > 1) return "待确认";

    const reviewReason = String((record && record.reviewReason) || "");
    if (reviewReason.includes("同名对应多个 CAS") || reviewReason.includes("CAS 校验位不通过")) return "待确认";
    const primary = String((record && record.primaryCategory) || "");
    const tags = new Set((record && record.categoryTags) || []);
    if (primary === "易制爆危化品") return "待确认";
    if (primary === "易制毒危化品") return "易制毒";
    if (primary === "易燃危化品") return "易燃";
    if (tags.has("毒害") || tags.has("剧毒")) return "毒害品";
    if (tags.has("酸性腐蚀品") || tags.has("酸性危化品")) return "酸性危化品";
    if (tags.has("腐蚀") || tags.has("腐蚀性") || tags.has("腐蚀品")) return "腐蚀品";
    if (primary === "普通药品" && tags.has("普通药品已确认")) return "普通化学品柜";
    return "待确认";
  }

  function manualAreaForInput(value, storageMap) {
    const compiled = storageMap && storageMap.byCas instanceof Map ? storageMap : compileMap(storageMap);
    const casKey = normalizeCas(value);
    if (casKey && compiled.byCas.has(casKey)) return compiled.byCas.get(casKey);
    const nameKey = normalizeName(value);
    if (!nameKey || compiled.conflicts.has(nameKey)) return "";
    return compiled.byName.get(nameKey) || "";
  }

  function applyStorage(record, storageMap) {
    record.actualStorage = resolveActualStorage(record, storageMap);
    return record;
  }

  return { normalizeName, normalizeCas, normalizeArea, compileMap, resolveActualStorage, manualAreaForInput, applyStorage };
});
