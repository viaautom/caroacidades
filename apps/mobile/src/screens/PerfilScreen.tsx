import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Share,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

type Me = {
  id: string
  nome: string | null
  email: string
  data_nascimento: string | null
  celular: string | null
}

// Alterar cadastro — nome, nascimento, celular, senha (req 164) e compartilhar o app (req 165)
export function PerfilScreen() {
  const queryClient = useQueryClient()
  const { data: me, isLoading } = useQuery<Me>({ queryKey: ['mobile-me'], queryFn: () => api.get('/mobile/me').then((r) => r.data) })

  const [nome, setNome] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [celular, setCelular] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  useEffect(() => {
    if (me) {
      setNome(me.nome ?? '')
      setNascimento(me.data_nascimento ?? '')
      setCelular(me.celular ?? '')
    }
  }, [me])

  const salvar = useMutation({
    mutationFn: () => api.patch('/mobile/me', {
      nome: nome.trim() || undefined,
      dataNascimento: nascimento.trim() || null,
      celular: celular.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-me'] })
      Alert.alert('Cadastro atualizado', 'Seus dados foram salvos com sucesso.')
    },
    onError: () => Alert.alert('Erro', 'Não foi possível salvar seus dados.'),
  })

  async function alterarSenha() {
    if (novaSenha.trim().length < 6) {
      Alert.alert('Senha inválida', 'A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    setSalvandoSenha(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha.trim() })
      if (error) throw error
      setNovaSenha('')
      Alert.alert('Senha alterada', 'Sua senha foi atualizada com sucesso.')
    } catch {
      Alert.alert('Erro', 'Não foi possível alterar a senha.')
    } finally {
      setSalvandoSenha(false)
    }
  }

  function compartilhar() {
    Share.share({
      message: 'Conheça o app SIGWEB Tupanciretã — envie solicitações e acompanhe os atendimentos da prefeitura direto pelo celular.',
    })
  }

  if (isLoading || !me) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.secao}>Meus dados</Text>
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Seu nome completo" autoCapitalize="words" />

      <Text style={styles.label}>E-mail</Text>
      <Text style={styles.somenteLeitura}>{me.email}</Text>

      <Text style={styles.label}>Data de nascimento (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} value={nascimento} onChangeText={setNascimento} placeholder="2000-01-31" keyboardType="numbers-and-punctuation" />

      <Text style={styles.label}>Celular</Text>
      <TextInput style={styles.input} value={celular} onChangeText={setCelular} placeholder="(55) 99999-9999" keyboardType="phone-pad" />

      <TouchableOpacity style={styles.botao} onPress={() => salvar.mutate()} disabled={salvar.isPending}>
        {salvar.isPending ? <ActivityIndicator color="white" /> : <Text style={styles.botaoTexto}>Salvar dados</Text>}
      </TouchableOpacity>

      <Text style={[styles.secao, styles.secaoEspacada]}>Alterar senha</Text>
      <TextInput style={styles.input} value={novaSenha} onChangeText={setNovaSenha} placeholder="Nova senha (mín. 6 caracteres)" secureTextEntry />
      <TouchableOpacity style={styles.botao} onPress={alterarSenha} disabled={salvandoSenha}>
        {salvandoSenha ? <ActivityIndicator color="white" /> : <Text style={styles.botaoTexto}>Alterar senha</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.botaoSecundario} onPress={compartilhar}>
        <Text style={styles.botaoSecundarioTexto}>📤 Compartilhar aplicativo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.botaoSair} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.botaoSairTexto}>Sair da conta</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  secao: { fontSize: 15, fontWeight: '700', color: '#1e3a5f' },
  secaoEspacada: { marginTop: 28 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 14, marginBottom: 6 },
  somenteLeitura: { fontSize: 15, color: '#374151', paddingVertical: 12 },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  botao: { backgroundColor: '#1e3a5f', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  botaoTexto: { color: 'white', fontSize: 15, fontWeight: '700' },
  botaoSecundario: { borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 28 },
  botaoSecundarioTexto: { color: '#1e3a5f', fontSize: 14, fontWeight: '600' },
  botaoSair: { paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  botaoSairTexto: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
})
