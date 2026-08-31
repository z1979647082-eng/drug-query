(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StorageRules = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const allowedAreas = new Set(["普1", "普2", "普3", "普4", "普5", "危6", "危7", "危8", "危9", "危10", "冰11"]);
  const legacyAreas = new Map([
    ["易制毒", "危6"], ["易燃", "危7"], ["易燃和普通危化品", "危7"],
    ["腐蚀品", "危8"], ["酸性危化品", "危9"], ["毒害品", "危10"], ["冰箱", "冰11"]
  ]);

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
    const ordinaryMatch = area.match(/^普通化学品柜\s*([1-5])$/);
    if (ordinaryMatch) return `普${ordinaryMatch[1]}`;
    if (legacyAreas.has(area)) return legacyAreas.get(area);
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
    if (primary === "易制毒危化品") return "危6";
    if (primary === "易燃危化品") return "危7";
    if (tags.has("毒害") || tags.has("剧毒")) return "危10";
    if (tags.has("酸性腐蚀品") || tags.has("酸性危化品")) return "危9";
    if (tags.has("腐蚀") || tags.has("腐蚀性") || tags.has("腐蚀品")) return "危8";
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
