import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabase = createClient(
  'https://puyeesjoqujexhuxaiml.supabase.co',
  'sb_publishable_H7EBprT0d0FJqbAdJGnECA_pGCiuguY'
)

const HSK_LEVEL_MAP: Record<string, number> = {
  'old-1': 1,
  'old-2': 2,
  'old-3': 3,
  'old-4': 4,
  'old-5': 5,
  'old-6': 6,
}

async function importVocab() {
  const raw = fs.readFileSync('./complete.json', 'utf-8')
  const words = JSON.parse(raw)

  console.log(`Total words found: ${words.length}`)

  const rows = words
    .map((word: any) => {
      const form = word.forms?.[0]
      if (!form) return null

      // Get ONLY old HSK levels, pick the LOWEST one per word
      const levels = (word.level || [])
        .filter((l: string) => l.startsWith('old-'))
        .map((l: string) => HSK_LEVEL_MAP[l])
        .filter((l: number) => l !== undefined && l <= 4)

      const hsk_level = levels.length > 0 ? Math.min(...levels) : null
      if (!hsk_level) return null // skip words not in old HSK 1-4

      return {
        simplified: word.simplified,
        traditional: form.traditional || null,
        pinyin: form.transcriptions?.pinyin || null,
        english: form.meanings || [],
        hsk_level,
        radical: word.radical || null,
        part_of_speech: word.pos || [],
        frequency: word.frequency || null,
      }
    })
    .filter(Boolean)

  console.log(`Words to insert: ${rows.length}`)

  // Insert in batches of 500
  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('vocabulary').insert(batch)

    if (error) {
      console.error(`Error on batch ${i / batchSize + 1}:`, error.message)
    } else {
      console.log(`✓ Inserted batch ${i / batchSize + 1} (${batch.length} words)`)
    }
  }

  console.log('Done!')
}

importVocab()
