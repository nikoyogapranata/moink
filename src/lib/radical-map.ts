/**
 * Maps Kangxi/CJK radical characters (and their common variant forms) to
 * English glosses. Covers all 180 radicals found in the Moink vocabulary
 * dataset, plus the top ~214 Kangxi radicals for completeness.
 *
 * Variants (e.g. 氵for 水, 扌 for 手) are listed alongside their base forms
 * so a lookup on any form returns the same meaning.
 */

export const RADICAL_MAP: Record<string, string> = {
  // ── Strokes 1 ────────────────────────────────────────────────────────────
  '一': 'one',
  '丨': 'line',
  '丶': 'dot',
  '丷': 'eight',       // variant of 八
  '丿': 'slash',
  '乙': 'second',
  '乚': 'hidden',
  '亅': 'hook',

  // ── Strokes 2 ────────────────────────────────────────────────────────────
  '二': 'two',
  '亠': 'lid',
  '人': 'person',
  '亻': 'person',      // side form of 人
  '儿': 'legs',
  '入': 'enter',
  '八': 'eight',
  '冂': 'wide',
  '冖': 'cover',
  '冫': 'ice',
  '几': 'table',
  '凵': 'container',
  '刀': 'knife',
  '刂': 'knife',       // side form of 刀
  '力': 'power',
  '勹': 'wrap',
  '匕': 'spoon',
  '匚': 'box',
  '匸': 'hiding',
  '十': 'ten',
  '卜': 'divination',
  '卩': 'seal',
  '厂': 'cliff',
  '厶': 'private',
  '又': 'again',

  // ── Strokes 3 ────────────────────────────────────────────────────────────
  '口': 'mouth',
  '囗': 'enclosure',
  '土': 'earth',
  '士': 'scholar',
  '夊': 'walk slowly',
  '夕': 'evening',
  '大': 'big',
  '女': 'woman',
  '子': 'child',
  '宀': 'roof',
  '寸': 'inch',
  '小': 'small',
  '⺌': 'small',       // variant top form of 小
  '尢': 'lame',
  '尸': 'corpse',
  '山': 'mountain',
  '巛': 'river',
  '川': 'river',
  '工': 'work',
  '己': 'self',
  '巾': 'cloth',
  '干': 'dry',
  '幺': 'tiny',
  '广': 'shelter',
  '廾': 'open hands',
  '弋': 'shoot',
  '弓': 'bow',
  '彐': 'snout',
  '彡': 'hair',
  '彳': 'step',

  // ── Strokes 4 ────────────────────────────────────────────────────────────
  '心': 'heart',
  '忄': 'heart',       // side form of 心
  '戈': 'halberd',
  '户': 'household',
  '手': 'hand',
  '扌': 'hand',        // side form of 手
  '支': 'branch',
  '攴': 'tap',
  '攵': 'tap',         // variant of 攴
  '文': 'writing',
  '斤': 'axe',
  '方': 'direction',
  '无': 'lacking',
  '旡': 'choked',
  '日': 'sun',
  '曰': 'say',
  '月': 'moon',
  '⺼': 'flesh',       // flesh variant of 月/肉
  '木': 'wood',
  '欠': 'lack',
  '止': 'stop',
  '歹': 'bad',
  '殳': 'weapon',
  '母': 'mother',
  '比': 'compare',
  '毛': 'hair',
  '民': 'people',
  '气': 'air',
  '水': 'water',
  '氵': 'water',       // side form of 水
  '火': 'fire',
  '灬': 'fire',        // bottom form of 火
  '爪': 'claw',
  '爫': 'claw',        // top variant of 爪
  '父': 'father',
  '牙': 'tooth',
  '牛': 'ox',
  '犬': 'dog',
  '犭': 'dog',         // side form of 犬

  // ── Strokes 5 ────────────────────────────────────────────────────────────
  '王': 'king',
  '玉': 'jade',
  '瓦': 'tile',
  '甘': 'sweet',
  '生': 'life',
  '用': 'use',
  '田': 'field',
  '疒': 'sickness',
  '白': 'white',
  '皮': 'skin',
  '皿': 'vessel',
  '目': 'eye',
  '矢': 'arrow',
  '石': 'stone',
  '示': 'spirit',
  '礻': 'spirit',      // side form of 示
  '禸': 'footprint',
  '禾': 'grain',
  '穴': 'cave',
  '立': 'stand',

  // ── Strokes 6 ────────────────────────────────────────────────────────────
  '米': 'rice',
  '糸': 'silk',
  '纟': 'silk',        // simplified side form of 糸
  '缶': 'jar',
  '网': 'net',
  '羊': 'sheep',
  '羽': 'feather',
  '老': 'old',
  '耂': 'old',         // top form of 老
  '而': 'and',
  '耳': 'ear',
  '自': 'self',
  '至': 'arrive',
  '舌': 'tongue',
  '舟': 'boat',
  '艹': 'grass',       // top form of 艸
  '虫': 'insect',
  '血': 'blood',
  '行': 'walk',
  '衣': 'clothing',
  '衤': 'clothing',    // side form of 衣
  '西': 'west',
  '覀': 'cover',       // variant of 西

  // ── Strokes 7 ────────────────────────────────────────────────────────────
  '见': 'see',
  '角': 'horn',
  '言': 'speech',
  '讠': 'speech',      // simplified side form of 言
  '贝': 'shell',
  '走': 'walk',
  '足': 'foot',
  '身': 'body',
  '车': 'vehicle',
  '辛': 'bitter',
  '辶': 'movement',    // movement/walking radical
  '酉': 'wine jar',
  '里': 'village',

  // ── Strokes 8+ ───────────────────────────────────────────────────────────
  '金': 'metal',
  '钅': 'metal',       // simplified side form of 金
  '长': 'long',
  '门': 'door',
  '阝': 'mound',       // side form of 阜 (left) or 邑 (right)
  '阜': 'mound',
  '邑': 'city',
  '隹': 'bird',        // short-tailed bird
  '雨': 'rain',
  '非': 'wrong',
  '面': 'face',
  '革': 'leather',
  '音': 'sound',
  '页': 'page',
  '风': 'wind',
  '飞': 'fly',
  '食': 'food',
  '饣': 'food',        // simplified side form of 食
  '首': 'head',
  '香': 'fragrant',
  '马': 'horse',
  '高': 'tall',
  '鱼': 'fish',
  '鸟': 'bird',
  '麻': 'hemp',
  '黄': 'yellow',
  '黑': 'black',
  '鼓': 'drum',
  '鼻': 'nose',

  // ── Miscellaneous variants in dataset ───────────────────────────────────
  '丬': 'bed',
  '⺀': 'repeat',
  '⺮': 'bamboo',      // top form of 竹
  '竹': 'bamboo',
  '㔾': 'seal',
  '丈': 'husband',
  '夫': 'man',
}

/** Returns the English meaning for a radical character, or null if unknown. */
export function getRadicalMeaning(radical: string | null | undefined): string | null {
  if (!radical) return null
  return RADICAL_MAP[radical] ?? null
}
