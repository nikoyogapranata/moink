import { createClient } from '@supabase/supabase-js'
import type { User } from 'firebase/auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function generateUsername(displayName: string): string {
  const base = displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
  return base || 'user'
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('username')
    .eq('username', username)
    .maybeSingle()
  return data === null
}

export async function findAvailableUsername(base: string): Promise<string> {
  const { data } = await supabase
    .from('users')
    .select('username')
    .like('username', `${base}%`)

  const taken = new Set((data ?? []).map(r => r.username as string))
  if (!taken.has(base)) return base

  let i = 1
  while (taken.has(`${base}${i}`)) i++
  return `${base}${i}`
}

export async function upsertUser(
  firebaseUser: User,
  extraData?: { full_name?: string; username?: string }
) {
  const record: Record<string, unknown> = {
    firebase_uid: firebaseUser.uid,
    email: firebaseUser.email,
    photo_url: firebaseUser.photoURL,
    updated_at: new Date().toISOString(),
  }
  if (extraData?.full_name) record.full_name = extraData.full_name
  if (extraData?.username) record.username = extraData.username

  return supabase.from('users').upsert(record, { onConflict: 'firebase_uid' })
}
