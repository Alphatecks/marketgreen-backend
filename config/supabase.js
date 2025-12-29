import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// #region agent log
fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'config/supabase.js:10',message:'Supabase config - env vars check',data:{hasSupabaseUrl:!!supabaseUrl,hasSupabaseAnonKey:!!supabaseAnonKey,hasServiceRoleKey:!!supabaseServiceRoleKey,urlLength:supabaseUrl?.length||0,keyLength:supabaseAnonKey?.length||0,urlPrefix:supabaseUrl?.substring(0,30)||'undefined',keyPrefix:supabaseAnonKey?.substring(0,10)||'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion

if (!supabaseUrl || !supabaseAnonKey) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'config/supabase.js:13',message:'ERROR: Missing Supabase env vars - throwing error',data:{hasSupabaseUrl:!!supabaseUrl,hasSupabaseAnonKey:!!supabaseAnonKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  throw new Error('Missing Supabase environment variables')
}

// Client for user operations (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client for server-side operations (uses service role key)
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

export default supabase

