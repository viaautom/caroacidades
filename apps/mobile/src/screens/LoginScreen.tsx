import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import { supabase } from '../lib/supabase'

// Login e criação de conta do cidadão (req 155)
export function LoginScreen() {
  const [modo, setModo] = useState<'login' | 'cadastro'>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar() {
    setErro(null)
    if (!email || !senha) { setErro('Informe e-mail e senha.'); return }
    setLoading(true)
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw error
      } else {
        if (!nome.trim()) { setErro('Informe seu nome.'); return }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        })
        if (error) throw error
      }
    } catch (err: any) {
      setErro(traduzErro(err?.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.titulo}>SIGWEB Tupanciretã</Text>
        <Text style={styles.subtitulo}>App de Solicitações do Cidadão</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, modo === 'login' && styles.tabActive]}
            onPress={() => setModo('login')}
          >
            <Text style={[styles.tabText, modo === 'login' && styles.tabTextActive]}>Entrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, modo === 'cadastro' && styles.tabActive]}
            onPress={() => setModo('cadastro')}
          >
            <Text style={[styles.tabText, modo === 'cadastro' && styles.tabTextActive]}>Criar conta</Text>
          </TouchableOpacity>
        </View>

        {modo === 'cadastro' && (
          <TextInput
            style={styles.input}
            placeholder="Nome completo"
            value={nome}
            onChangeText={setNome}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        {erro && <Text style={styles.erro}>{erro}</Text>}

        <TouchableOpacity style={styles.botao} onPress={entrar} disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={styles.botaoTexto}>{modo === 'login' ? 'Entrar' : 'Criar conta'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function traduzErro(code?: string) {
  switch (code) {
    case 'invalid_credentials': return 'E-mail ou senha incorretos.'
    case 'user_already_exists': return 'Este e-mail já está cadastrado.'
    case 'weak_password': return 'A senha deve ter pelo menos 6 caracteres.'
    default: return 'Não foi possível concluir. Tente novamente.'
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  titulo: { fontSize: 24, fontWeight: '700', color: '#1e3a5f', textAlign: 'center' },
  subtitulo: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 28 },
  tabs: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: 'white' },
  tabText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  tabTextActive: { color: '#1e3a5f' },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
  },
  erro: { color: '#dc2626', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  botao: { backgroundColor: '#1e3a5f', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  botaoTexto: { color: 'white', fontSize: 16, fontWeight: '700' },
})
