import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { File } from 'expo-file-system'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { supabase, STORAGE_BUCKET } from '../lib/supabase'
import { useAuth, isFiscal } from '../contexts/AuthContext'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'NovaSolicitacao'>

type Categoria = {
  id: string
  nome: string
  descricao: string | null
  privada: boolean
  ativa: boolean
}

// Criação de solicitações (req 157): categoria, fotos (req 159/160), endereço (req 161) e observações (req 162)
export function NovaSolicitacaoScreen({ route, navigation }: Props) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const local = route.params

  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [endereco, setEndereco] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['categorias-chamado'],
    queryFn: () => api.get('/mobile/categorias').then((r) => r.data),
  })
  const categoriasVisiveis = categorias.filter((c) => c.ativa && (!c.privada || isFiscal(perfil)))

  const enviar = useMutation({
    mutationFn: async () => {
      if (!local) throw new Error('Local não definido')
      setEnviando(true)
      const fotoUrls = await Promise.all(fotos.map(enviarFoto))
      return api.post('/mobile/chamados', {
        categoriaId,
        descricao: descricao.trim(),
        latitude: local.latitude,
        longitude: local.longitude,
        endereco: endereco.trim() || undefined,
        fotoUrls,
        respostasBoletim: observacoes.trim() ? { observacoes: observacoes.trim() } : {},
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['minhas-solicitacoes'] })
      Alert.alert('Solicitação enviada', 'Sua solicitação foi registrada com sucesso.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    },
    onError: () => Alert.alert('Erro', 'Não foi possível enviar a solicitação. Tente novamente.'),
    onSettled: () => setEnviando(false),
  })

  async function enviarFoto(uri: string): Promise<string> {
    const arrayBuffer = await new File(uri).arrayBuffer()
    const caminho = `chamados/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(caminho, arrayBuffer, { contentType: 'image/jpeg' })
    if (uploadError) throw uploadError
    const { data: signed, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(caminho, 10 * 365 * 24 * 60 * 60)
    if (signError) throw signError
    return signed.signedUrl
  }

  async function adicionarFoto(origem: 'galeria' | 'camera') {
    const permissao = origem === 'galeria'
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync()
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Conceda acesso para anexar fotos à solicitação.')
      return
    }
    const resultado = origem === 'galeria'
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 })
    if (!resultado.canceled && resultado.assets[0]) {
      setFotos((atual) => [...atual, resultado.assets[0].uri])
    }
  }

  async function buscarEndereco() {
    if (!local) return
    setBuscandoEndereco(true)
    try {
      const [resultado] = await Location.reverseGeocodeAsync({ latitude: local.latitude, longitude: local.longitude })
      if (resultado) {
        const partes = [
          resultado.street, resultado.streetNumber, resultado.district, resultado.city,
        ].filter(Boolean)
        setEndereco(partes.join(', '))
      } else {
        Alert.alert('Endereço não encontrado', 'Não foi possível localizar um endereço para este ponto. Você pode digitá-lo manualmente.')
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível buscar o endereço automaticamente.')
    } finally {
      setBuscandoEndereco(false)
    }
  }

  function validar(): string | null {
    if (!categoriaId) return 'Selecione uma categoria.'
    if (descricao.trim().length < 5) return 'Descreva a solicitação com pelo menos 5 caracteres.'
    return null
  }

  function enviarSolicitacao() {
    const erro = validar()
    if (erro) { Alert.alert('Verifique os dados', erro); return }
    enviar.mutate()
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Categoria</Text>
      <View style={styles.opcoes}>
        {categoriasVisiveis.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, categoriaId === c.id && styles.chipAtivo]}
            onPress={() => setCategoriaId(c.id)}
          >
            <Text style={[styles.chipTexto, categoriaId === c.id && styles.chipTextoAtivo]}>{c.nome}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={[styles.input, styles.textoMultilinha]}
        placeholder="Descreva o problema ou solicitação"
        value={descricao}
        onChangeText={setDescricao}
        multiline
      />

      <Text style={styles.label}>Endereço</Text>
      <View style={styles.linhaEndereco}>
        <TextInput
          style={[styles.input, styles.flex1]}
          placeholder="Endereço do local"
          value={endereco}
          onChangeText={setEndereco}
        />
        <TouchableOpacity style={styles.botaoBuscar} onPress={buscarEndereco} disabled={buscandoEndereco}>
          {buscandoEndereco ? <ActivityIndicator color="#1e3a5f" /> : <Text style={styles.botaoBuscarTexto}>📍 Buscar</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Fotos</Text>
      <View style={styles.opcoes}>
        {fotos.map((uri) => (
          <View key={uri} style={styles.fotoWrapper}>
            <Image source={{ uri }} style={styles.foto} />
            <TouchableOpacity style={styles.removerFoto} onPress={() => setFotos((a) => a.filter((f) => f !== uri))}>
              <Text style={styles.removerFotoTexto}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={styles.opcoes}>
        <TouchableOpacity style={styles.botaoSecundario} onPress={() => adicionarFoto('galeria')}>
          <Text style={styles.botaoSecundarioTexto}>🖼 Galeria</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoSecundario} onPress={() => adicionarFoto('camera')}>
          <Text style={styles.botaoSecundarioTexto}>📷 Câmera</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Observações finais</Text>
      <TextInput
        style={[styles.input, styles.textoMultilinha]}
        placeholder="Informações adicionais (opcional)"
        value={observacoes}
        onChangeText={setObservacoes}
        multiline
      />

      <TouchableOpacity style={styles.botaoEnviar} onPress={enviarSolicitacao} disabled={enviando}>
        {enviando ? <ActivityIndicator color="white" /> : <Text style={styles.botaoEnviarTexto}>Enviar solicitação</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: '#1e3a5f', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textoMultilinha: { minHeight: 80, textAlignVertical: 'top' },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipAtivo: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  chipTexto: { fontSize: 13, color: '#374151' },
  chipTextoAtivo: { color: 'white', fontWeight: '600' },
  linhaEndereco: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  botaoBuscar: { borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  botaoBuscarTexto: { color: '#1e3a5f', fontWeight: '600', fontSize: 13 },
  fotoWrapper: { position: 'relative' },
  foto: { width: 84, height: 84, borderRadius: 10 },
  removerFoto: {
    position: 'absolute', top: -6, right: -6, backgroundColor: '#dc2626', borderRadius: 10,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  removerFotoTexto: { color: 'white', fontSize: 12, fontWeight: '700' },
  botaoSecundario: { borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  botaoSecundarioTexto: { color: '#1e3a5f', fontWeight: '600', fontSize: 13 },
  botaoEnviar: { backgroundColor: '#1e3a5f', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  botaoEnviarTexto: { color: 'white', fontSize: 16, fontWeight: '700' },
})
