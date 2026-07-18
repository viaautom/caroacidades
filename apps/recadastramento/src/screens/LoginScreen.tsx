import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { supabase, decodePerfil } from '../lib/supabase'
import { isFiscalRecadastramento } from '../contexts/AuthContext'

// Login do fiscal de recadastramento — credenciais configuradas pelo sistema, sem auto-cadastro (req 169-equiv.)
export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar() {
    setErro(null)
    if (!email || !senha) { setErro('Informe e-mail e senha.'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) throw error
      const perfil = decodePerfil(data.session.access_token)
      if (!isFiscalRecadastramento(perfil)) {
        await supabase.auth.signOut()
        setErro('Este aplicativo é exclusivo para fiscais de recadastramento da prefeitura.')
      }
    } catch (err: any) {
      setErro(traduzErro(err?.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.titulo}>SIGWEB Recadastramento</Text>
        <Text style={styles.subtitulo}>Coleta de campo — Recadastramento Imobiliário</Text>

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
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.botaoTexto}>Entrar</Text>}
        </TouchableOpacity>

        <Text style={styles.aviso}>Suas credenciais de acesso são fornecidas pela prefeitura.</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

function traduzErro(code?: string) {
  switch (code) {
    case 'invalid_credentials': return 'E-mail ou senha incorretos.'
    default: return 'Não foi possível entrar. Tente novamente.'
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fdf3ec' },
  titulo: { fontSize: 24, fontWeight: '700', color: '#7c3f1d', textAlign: 'center' },
  subtitulo: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 28 },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
  },
  erro: { color: '#dc2626', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  botao: { backgroundColor: '#7c3f1d', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  botaoTexto: { color: 'white', fontSize: 16, fontWeight: '700' },
  aviso: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 20 },
})
