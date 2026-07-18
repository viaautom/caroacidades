import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? '') + '/api',
  timeout: 30_000,
})

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      supabase.auth.signOut().finally(() => { window.location.href = '/login' })
    }
    return Promise.reject(err)
  }
)

export default api
