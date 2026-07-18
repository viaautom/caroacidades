import axios from 'axios'
import Constants from 'expo-constants'
import { supabase } from './supabase'

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000'

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30_000,
})

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

export default api
