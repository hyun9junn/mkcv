import jsyaml from 'js-yaml';
export { SECTION_DEFS, DEFAULT_ORDER } from './sections/defs.js';
import { SECTION_DEFS, DEFAULT_ORDER } from './sections/defs.js';

const STORAGE_KEY = "mkcv_sections_state";
let _cachedResumeYaml = null;
let _cachedParsedResume = null;
let _cachedResumeError = null;
let _hasCachedResume = false;
let _parseCount = 0;

// Pluggable storage — defaults to globalThis.localStorage. Tests can override
// with _setStorage(vmContextLocalStorage) to match the IIFE test harness.
let _storage = globalThis.localStorage;

export function _setStorage(storage) {
  _storage = storage;
}

function _load() {
  try {
    const raw = _storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function _save(state) {
  try {
    _storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (quota exceeded or private browsing); operate statelessly.
  }
}

function _getState() {
  const saved = _load();
  return {
    hidden: Array.isArray(saved?.hidden) ? saved.hidden : [],
    order: Array.isArray(saved?.order) ? saved.order : [...DEFAULT_ORDER],
  };
}

export function isHidden(key) {
  return _getState().hidden.includes(key);
}

export function toggleHidden(key) {
  const state = _getState();
  const idx = state.hidden.indexOf(key);
  if (idx === -1) {
    state.hidden.push(key);
  } else {
    state.hidden.splice(idx, 1);
  }
  _save(state);
}

export function getOrder() {
  return _getState().order;
}

export function setOrder(newOrder) {
  if (!Array.isArray(newOrder)) return;
  const state = _getState();
  state.order = newOrder;
  _save(state);
}

export function resetAll() {
  _save({ hidden: [], order: [...DEFAULT_ORDER] });
}

export function ensureInOrder(key) {
  const state = _getState();
  if (!state.order.includes(key)) {
    state.order.push(key);
    _save(state);
  }
}

function _cloneValue(value) {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  if (Array.isArray(value)) return value.map(_cloneValue);
  if (value instanceof Date) return new Date(value.getTime());
  const cloned = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    cloned[key] = _cloneValue(nestedValue);
  }
  return cloned;
}

function _getParsedResume(rawYaml) {
  const useCache = typeof rawYaml === "string";
  if (useCache && _hasCachedResume && rawYaml === _cachedResumeYaml) {
    if (_cachedResumeError) throw _cachedResumeError;
    return _cachedParsedResume;
  }

  try {
    _parseCount += 1;
    const parsed = jsyaml.load(rawYaml);
    if (useCache) {
      _cachedResumeYaml = rawYaml;
      _cachedParsedResume = parsed;
      _cachedResumeError = null;
      _hasCachedResume = true;
    }
    return parsed;
  } catch (error) {
    if (useCache) {
      _cachedResumeYaml = rawYaml;
      _cachedParsedResume = null;
      _cachedResumeError = error;
      _hasCachedResume = true;
    }
    throw error;
  }
}

export function parseResumeYaml(rawYaml) {
  return _cloneValue(_getParsedResume(rawYaml));
}

export function getCustomDefs(rawYaml) {
  try {
    const parsed = _getParsedResume(rawYaml);
    if (!parsed || !Array.isArray(parsed.custom_sections)) return {};
    const defs = {};
    for (const cs of parsed.custom_sections) {
      if (cs && cs.key && cs.title) {
        defs[cs.key] = { label: cs.title, yaml: null };
      }
    }
    return defs;
  } catch {
    return {};
  }
}

export function getExpandedPresentKeys(rawYaml) {
  try {
    const parsed = _getParsedResume(rawYaml);
    if (!parsed || typeof parsed !== "object") return [];
    const keys = Object.keys(parsed).filter((k) => k !== "personal" && k !== "custom_sections");
    const customDefs = getCustomDefs(rawYaml);
    return [...keys, ...Object.keys(customDefs)];
  } catch {
    return [];
  }
}

export function getDef(key, rawYaml) {
  if (SECTION_DEFS[key]) return SECTION_DEFS[key];
  const customDefs = getCustomDefs(rawYaml);
  return customDefs[key] || null;
}

export function getFilteredYaml(rawYaml) {
  try {
    const parsed = _getParsedResume(rawYaml);
    if (!parsed || typeof parsed !== "object") return rawYaml;
    const hidden = _getState().hidden;
    const filtered = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!hidden.includes(k)) filtered[k] = v;
    }
    return jsyaml.dump(filtered, { lineWidth: -1 });
  } catch {
    return rawYaml;
  }
}

export function getOrderedFilteredYaml(rawYaml) {
  try {
    const parsed = _getParsedResume(rawYaml);
    if (!parsed || typeof parsed !== "object") return rawYaml;
    const { hidden, order } = _getState();
    const customDefs = getCustomDefs(rawYaml);
    const customKeys = Object.keys(customDefs);

    const anyCustomVisible = customKeys.some((k) => !hidden.includes(k));

    const ordered = {};
    if ("personal" in parsed) ordered.personal = parsed.personal;
    for (const key of order) {
      if (key in parsed && key !== "custom_sections" && !hidden.includes(key)) {
        ordered[key] = parsed[key];
      }
    }
    if (anyCustomVisible && Array.isArray(parsed.custom_sections)) {
      ordered.custom_sections = parsed.custom_sections.filter(
        (cs) => cs && cs.key && !hidden.includes(cs.key)
      );
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in ordered) && !hidden.includes(k) && k !== "custom_sections") {
        ordered[k] = v;
      }
    }
    return jsyaml.dump(ordered, { lineWidth: -1 });
  } catch {
    return rawYaml;
  }
}

export function getVisibleOrder(rawYaml) {
  try {
    const parsed = _getParsedResume(rawYaml);
    if (!parsed || typeof parsed !== "object") return [];
    const { hidden, order } = _getState();
    const expandedKeys = getExpandedPresentKeys(rawYaml);
    const present = new Set(expandedKeys);
    const result = order.filter((k) => present.has(k) && !hidden.includes(k));
    for (const k of expandedKeys) {
      if (!result.includes(k) && !hidden.includes(k)) result.push(k);
    }
    return result;
  } catch {
    return [];
  }
}

export {
  getYamlSectionLayout,
  getYamlSectionState,
  moveToInvisible,
  moveFromInvisible,
  appendToMainArea,
  reorderMainArea,
  syncYamlToSectionState,
  materializeSection,
  clearInvisibleArea,
} from './sections/yaml-ops.js';
import {
  getYamlSectionLayout,
  getYamlSectionState,
  moveToInvisible,
  moveFromInvisible,
  appendToMainArea,
  reorderMainArea,
  syncYamlToSectionState,
  materializeSection,
  clearInvisibleArea,
} from './sections/yaml-ops.js';

export function resetSectionYaml(key, currentYaml) {
  // Returns { newYaml, previousYaml } or null on parse error.
  // previousYaml is a YAML string containing only the single section key.
  try {
    const parsed = jsyaml.load(currentYaml);
    if (!parsed || typeof parsed !== "object") return null;
    if (!SECTION_DEFS[key]) return null;
    const defaultParsed = jsyaml.load(SECTION_DEFS[key].yaml);
    if (!defaultParsed) return null;
    const previousYaml = jsyaml.dump({ [key]: parsed[key] }, { lineWidth: -1 });
    parsed[key] = defaultParsed[key];
    const newYaml = jsyaml.dump(parsed, { lineWidth: -1 });
    return { newYaml, previousYaml };
  } catch {
    return null;
  }
}

export function restoreSectionYaml(key, previousSectionYaml, currentYaml) {
  // Merges a single section's value back into currentYaml.
  try {
    const current = jsyaml.load(currentYaml);
    const previous = jsyaml.load(previousSectionYaml);
    if (!current || !previous) return null;
    current[key] = previous[key];
    return jsyaml.dump(current, { lineWidth: -1 });
  } catch {
    return null;
  }
}

export function _resetParseCache() {
  _cachedResumeYaml = null;
  _cachedParsedResume = null;
  _cachedResumeError = null;
  _hasCachedResume = false;
  _parseCount = 0;
}

export function _getParseCount() {
  return _parseCount;
}

export const sectionsState = {
  SECTION_DEFS,
  DEFAULT_ORDER,
  isHidden,
  toggleHidden,
  getOrder,
  setOrder,
  ensureInOrder,
  parseResumeYaml,
  getFilteredYaml,
  getOrderedFilteredYaml,
  getVisibleOrder,
  getCustomDefs,
  getExpandedPresentKeys,
  getDef,
  resetSectionYaml,
  restoreSectionYaml,
  resetAll,
  moveToInvisible,
  moveFromInvisible,
  appendToMainArea,
  clearInvisibleArea,
  reorderMainArea,
  getYamlSectionLayout,
  getYamlSectionState,
  syncYamlToSectionState,
  materializeSection,
};
