import jsyaml from 'js-yaml';
import { SECTION_DEFS, DEFAULT_ORDER } from './defs.js';

const INVISIBLE_MARKER = '### invisible sections';

function _uniqKeys(keys) {
  const out = [];
  for (const key of keys || []) {
    if (!key || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

function _getTopLevelKeys(text) {
  const keys = [];
  for (const line of String(text || '').split('\n')) {
    if (!line || /^\s/.test(line) || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_]+):(?:\s|$)/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

function _splitAtMarker(rawYaml) {
  const lines = rawYaml.split('\n');
  const idx = lines.findIndex(l => l.trim() === INVISIBLE_MARKER);
  if (idx === -1) return { main: rawYaml, invisible: '' };
  return {
    main: lines.slice(0, idx).join('\n'),
    invisible: lines.slice(idx + 1).join('\n').replace(/^\n+/, ''),
  };
}

function _joinParts(main, invisible) {
  const m = main.trimEnd();
  const iv = (invisible || '').trim();
  if (!iv) return m + '\n';
  return m + '\n\n' + INVISIBLE_MARKER + '\n\n' + iv + '\n';
}

function _extractBlock(text, key) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === key + ':' || lines[i].startsWith(key + ': ')) {
      start = i; break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.length > 0 && !/^\s/.test(l) && !l.startsWith('#')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trimEnd();
}

function _removeBlock(text, key) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === key + ':' || lines[i].startsWith(key + ': ')) {
      start = i; break;
    }
  }
  if (start === -1) return text;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.length > 0 && !/^\s/.test(l) && !l.startsWith('#')) { end = i; break; }
  }
  while (start > 0 && lines[start - 1].trim() === '') start--;
  return lines.slice(0, start).concat(lines.slice(end)).join('\n');
}

export function getYamlSectionLayout(rawYaml) {
  const { main, invisible } = _splitAtMarker(rawYaml);
  return {
    mainKeys: _getTopLevelKeys(main).filter((key) => key !== 'personal'),
    invisibleKeys: _getTopLevelKeys(invisible).filter((key) => key !== 'personal'),
  };
}

export function getYamlSectionState(rawYaml, fallbackOrder = DEFAULT_ORDER) {
  const { mainKeys, invisibleKeys } = getYamlSectionLayout(rawYaml);
  const present = _uniqKeys([...mainKeys, ...invisibleKeys]);
  const order = _uniqKeys(Array.isArray(fallbackOrder) ? fallbackOrder : DEFAULT_ORDER);
  for (const key of present) {
    if (!order.includes(key)) order.push(key);
  }
  return {
    order,
    hidden: _uniqKeys(invisibleKeys),
  };
}

export function moveToInvisible(rawYaml, key) {
  const { main, invisible } = _splitAtMarker(rawYaml);
  const block = _extractBlock(main, key);
  if (!block) return rawYaml;
  const newMain = _removeBlock(main, key);
  const newInvisible = invisible.trim() ? invisible.trimEnd() + '\n\n' + block : block;
  return _joinParts(newMain, newInvisible);
}

export function moveFromInvisible(rawYaml, key) {
  const { main, invisible } = _splitAtMarker(rawYaml);
  const block = _extractBlock(invisible, key);
  if (!block) return rawYaml;
  const newInvisible = _removeBlock(invisible, key);
  const newMain = main.trimEnd() + '\n\n' + block;
  return _joinParts(newMain, newInvisible);
}

export function appendToMainArea(rawYaml, yamlToAppend) {
  const { main, invisible } = _splitAtMarker(rawYaml);
  const trimmedMain = main.trimEnd();
  const trimmedAppend = String(yamlToAppend || '').trimStart();
  const newMain = trimmedMain
    ? trimmedMain + '\n\n' + trimmedAppend
    : trimmedAppend;
  return _joinParts(newMain, invisible);
}

export function reorderMainArea(rawYaml, order) {
  const { main, invisible } = _splitAtMarker(rawYaml);
  let remaining = main;
  const blocks = [];

  const personalBlock = _extractBlock(remaining, 'personal');
  if (personalBlock !== null) {
    blocks.push(personalBlock);
    remaining = _removeBlock(remaining, 'personal');
  }

  for (const key of order) {
    if (key === 'personal') continue;
    const block = _extractBlock(remaining, key);
    if (block !== null) {
      blocks.push(block);
      remaining = _removeBlock(remaining, key);
    }
  }

  const leftover = remaining.trim();
  if (leftover) blocks.push(leftover);

  return _joinParts(blocks.join('\n\n'), invisible);
}

export function syncYamlToSectionState(rawYaml, order, hidden, opts = {}) {
  const hiddenSet = new Set(Array.isArray(hidden) ? hidden : []);
  const materializeSet = new Set(Array.isArray(opts.materialize) ? opts.materialize : []);
  const { mainKeys, invisibleKeys } = getYamlSectionLayout(rawYaml);
  const desiredOrder = _uniqKeys([
    ...(Array.isArray(order) ? order : []),
    ...mainKeys,
    ...invisibleKeys,
  ]);

  const { main, invisible } = _splitAtMarker(rawYaml);
  let remainingMain = main;
  let remainingInvisible = invisible;
  const blocksByKey = new Map();

  const personalBlock = _extractBlock(remainingMain, 'personal');
  if (personalBlock !== null) remainingMain = _removeBlock(remainingMain, 'personal');

  for (const key of desiredOrder) {
    const fromMain = _extractBlock(remainingMain, key);
    if (fromMain !== null) {
      blocksByKey.set(key, fromMain);
      remainingMain = _removeBlock(remainingMain, key);
    }

    const fromInvisible = _extractBlock(remainingInvisible, key);
    if (fromInvisible !== null) {
      if (!blocksByKey.has(key)) blocksByKey.set(key, fromInvisible);
      remainingInvisible = _removeBlock(remainingInvisible, key);
    }
  }

  const mainBlocks = [];
  const invisibleBlocks = [];
  for (const key of desiredOrder) {
    let block = blocksByKey.get(key);
    if (block == null && materializeSet.has(key) && SECTION_DEFS[key]?.yaml) {
      block = SECTION_DEFS[key].yaml.trimEnd();
    }
    if (block == null) continue;
    if (hiddenSet.has(key)) invisibleBlocks.push(block);
    else mainBlocks.push(block);
  }

  const mainParts = [];
  const invisibleParts = [];
  if (personalBlock !== null) mainParts.push(personalBlock);
  if (mainBlocks.length) mainParts.push(...mainBlocks);
  if (remainingMain.trim()) mainParts.push(remainingMain.trim());
  if (invisibleBlocks.length) invisibleParts.push(...invisibleBlocks);
  if (remainingInvisible.trim()) invisibleParts.push(remainingInvisible.trim());

  return _joinParts(mainParts.join('\n\n'), invisibleParts.join('\n\n'));
}

export function materializeSection(rawYaml, key, desiredOrder, hidden = []) {
  if (!SECTION_DEFS[key]?.yaml) return rawYaml;

  const { mainKeys, invisibleKeys } = getYamlSectionLayout(rawYaml);
  if (mainKeys.includes(key) || invisibleKeys.includes(key)) return rawYaml;

  const currentOrder = _uniqKeys([...mainKeys, ...invisibleKeys]);
  const preferredOrder = _uniqKeys(
    Array.isArray(desiredOrder) && desiredOrder.length ? desiredOrder : DEFAULT_ORDER
  );
  const nextOrder = currentOrder.slice();
  const desiredIndex = preferredOrder.indexOf(key);

  const nextAnchor = desiredIndex === -1
    ? null
    : preferredOrder
        .slice(desiredIndex + 1)
        .find((candidate) => nextOrder.includes(candidate));

  if (nextAnchor) {
    nextOrder.splice(nextOrder.indexOf(nextAnchor), 0, key);
  } else {
    const previousAnchor = (desiredIndex === -1 ? preferredOrder : preferredOrder.slice(0, desiredIndex))
      .slice()
      .reverse()
      .find((candidate) => nextOrder.includes(candidate));

    if (previousAnchor) nextOrder.splice(nextOrder.indexOf(previousAnchor) + 1, 0, key);
    else nextOrder.push(key);
  }

  return syncYamlToSectionState(rawYaml, _uniqKeys([...nextOrder, ...preferredOrder]), hidden, {
    materialize: [key],
  });
}

export function clearInvisibleArea(rawYaml) {
  const { main, invisible } = _splitAtMarker(rawYaml);
  if (!invisible.trim()) return rawYaml;
  const newMain = main.trimEnd() + '\n\n' + invisible.trim();
  return _joinParts(newMain, '');
}
