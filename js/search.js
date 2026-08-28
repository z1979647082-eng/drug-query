(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChemicalSearch = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const punctuationMap = {
    "，": ",", "；": ";", "：": ":", "（": "(", "）": ")",
    "［": "[", "］": "]", "＞": ">", "＜": "<", "～": "~",
    "－": "-", "—": "-", "–": "-", "、": ";"
  };

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase()
      .replace(/[，；：（）［］＞＜～－—–、]/g, char => punctuationMap[char] || char)
      .replace(/[\s;,·]/g, "");
  }

  function casDigits(value) {
    const text = String(value || "").trim();
    if (!text || !/[0-9]/.test(text) || /[^0-9\s\-/]/.test(text)) return "";
    return text.replace(/\D/g, "");
  }

  function levenshtein(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        rowMin = Math.min(rowMin, current[j]);
      }
      if (rowMin > limit) return limit + 1;
      for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length];
  }

  function makeIndex(record) {
    return {
      record,
      standard: normalizeName(record.standardName),
      aliases: (record.aliases || []).map(normalizeName),
      english: normalizeName(record.englishName),
      cas: casDigits(record.cas),
      displayNames: [record.standardName, ...(record.aliases || []), record.englishName].filter(Boolean)
    };
  }

  function search(records, query, options) {
    const indexes = (options && options.indexes) || records.map(makeIndex);
    const normalized = normalizeName(query);
    const queryCas = casDigits(query);
    if (!normalized && !queryCas) return { type: "blank", records: [] };

    if (queryCas && queryCas.length >= 4) {
      const casMatches = indexes.filter(item => item.cas && item.cas === queryCas).map(item => item.record);
      if (casMatches.length) return { type: "exact", matchedBy: "CAS 号", records: casMatches };
    }

    const standardMatches = indexes.filter(item => item.standard === normalized).map(item => item.record);
    if (standardMatches.length) return { type: "exact", matchedBy: "标准中文名称", records: standardMatches };

    const aliasMatches = indexes.filter(item => item.aliases.includes(normalized)).map(item => item.record);
    if (aliasMatches.length) return { type: "exact", matchedBy: "别名", records: aliasMatches };

    const englishMatches = indexes.filter(item => item.english && item.english === normalized).map(item => item.record);
    if (englishMatches.length) return { type: "exact", matchedBy: "英文名称", records: englishMatches };

    const candidates = [];
    if (normalized.length >= 2 || queryCas.length >= 3) {
      for (const item of indexes) {
        let score = Infinity;
        if (queryCas && item.cas.includes(queryCas)) score = Math.min(score, item.cas.indexOf(queryCas));
        for (const name of [item.standard, ...item.aliases, item.english].filter(Boolean)) {
          const position = name.indexOf(normalized);
          if (position >= 0) score = Math.min(score, position + Math.abs(name.length - normalized.length) * .02);
          if (normalized.length >= 3 && name.length >= 3) {
            const distanceLimit = normalized.length <= 5 ? 1 : 2;
            const distance = levenshtein(normalized, name, distanceLimit);
            if (distance <= distanceLimit) score = Math.min(score, 10 + distance + Math.abs(name.length - normalized.length) * .1);
          }
        }
        if (Number.isFinite(score)) candidates.push({ record: item.record, score });
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.record.standardName.localeCompare(b.record.standardName, "zh-CN"));
    if (candidates.length) return { type: "candidates", records: candidates.slice(0, 30).map(item => item.record) };
    return { type: "unlisted", records: [makeUnlistedRecord(String(query || "").trim())] };
  }

  function makeUnlistedRecord(query) {
    const looksLikeCas = Boolean(casDigits(query));
    return {
      id: "unlisted-query",
      standardName: looksLikeCas ? "未在当前名录中找到该 CAS 号" : query,
      englishName: "",
      aliases: [],
      cas: looksLikeCas ? query : "",
      primaryCategory: "普通药品（当前三份名录中未检出）",
      categoryTags: ["当前名录未检出"],
      hazardTypes: ["三份名录均无准确记录"],
      sourceLists: [],
      sourceReferences: [],
      suggestedStorage: "存放区域待管理员确认",
      actualStorage: "待确认",
      needsManualReview: true,
      reviewReason: "输入内容未与名录形成准确匹配；请核对名称、CAS 号及 SDS"
    };
  }

  function primaryFromTags(tags) {
    const set = new Set(tags || []);
    if (set.has("易制爆")) return "易制爆危化品";
    if (set.has("易制毒")) return "易制毒危化品";
    if (set.has("易燃")) return "易燃危化品";
    if (set.has("危险化学品")) return "其他危险化学品";
    return "普通药品（当前三份名录中未检出）";
  }

  return { normalizeName, casDigits, levenshtein, makeIndex, search, makeUnlistedRecord, primaryFromTags };
});

