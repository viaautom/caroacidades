import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useNetInfo } from '@react-native-community/netinfo'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { supabase, STORAGE_BUCKET } from '../lib/supabase'
import { listarColetas, salvarColeta, type ColetaArvore } from '../lib/coletas'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'Lista'>

// Lista de coletas locais com indicador de sincronização (req 188), botões de
// sincronizar com o SIG WEB e exportar dados do BIC para importação (req 184)
export function ListaArvoresScreen({ navigation }: Props) {
  const netInfo = useNetInfo()
  const [coletas, setColetas] = useState<ColetaArvore[]>([])
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [exportando, setExportando] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true)
    listarColetas().then(setColetas).finally(() => setCarregando(false))
  }, [])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  async function enviarFoto(uri: string): Promise<string> {
    if (uri.startsWith('http')) return uri
    const arrayBuffer = await new File(uri).arrayBuffer()
    const caminho = `arvores/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
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

  async function sincronizar() {
    if (!netInfo.isConnected) {
      Alert.alert('Sem conexão', 'Conecte-se à internet para sincronizar com o SIG WEB.')
      return
    }
    setSincronizando(true)
    try {
      const pendentes = (await listarColetas()).filter((c) => !c.sincronizado)
      for (const coleta of pendentes) {
        const fotoUrls = await Promise.all(coleta.fotos.map(enviarFoto))
        const corpo = {
          latitude: coleta.latitude,
          longitude: coleta.longitude,
          especie: coleta.especie,
          nomePopular: coleta.nomePopular,
          alturaM: coleta.alturaM,
          dapCm: coleta.dapCm,
          estadoFitossanitario: coleta.estadoFitossanitario,
          situacaoCalcada: coleta.situacaoCalcada,
          logradouroId: coleta.logradouroId,
          fotoUrls,
        }
        if (coleta.remoteId) {
          await api.patch(`/mobile/arvores/${coleta.remoteId}`, corpo)
          await salvarColeta({ ...coleta, fotos: fotoUrls, sincronizado: true })
        } else {
          const { data } = await api.post('/mobile/arvores', corpo)
          await salvarColeta({ ...coleta, fotos: fotoUrls, remoteId: data.id, codigo: data.codigo, sincronizado: true })
        }
      }
      await carregar()
      Alert.alert('Sincronização concluída', `${pendentes.length} registro(s) enviado(s) ao SIG WEB.`)
    } catch {
      Alert.alert('Erro na sincronização', 'Não foi possível enviar todos os registros. Tente novamente.')
      await carregar()
    } finally {
      setSincronizando(false)
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      const dados = await listarColetas()
      const arquivo = new File(Paths.document, `arvores_${Date.now()}.json`)
      arquivo.write(JSON.stringify(dados, null, 2))
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(arquivo.uri, { mimeType: 'application/json', dialogTitle: 'Exportar dados do BIC' })
      } else {
        Alert.alert('Exportação concluída', `Arquivo salvo em: ${arquivo.uri}`)
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível exportar os dados.')
    } finally {
      setExportando(false)
    }
  }

  function sair() {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.faixaStatus, netInfo.isConnected ? styles.faixaOnline : styles.faixaOffline]}>
        <Text style={styles.faixaTexto}>
          {netInfo.isConnected ? '🟢 Online' : '🔴 Offline — os registros ficam salvos no aparelho'}
        </Text>
      </View>

      <View style={styles.acoes}>
        <TouchableOpacity style={styles.botaoAcao} onPress={sincronizar} disabled={sincronizando || !netInfo.isConnected}>
          {sincronizando ? <ActivityIndicator color="#1f4d2c" /> : <Text style={styles.botaoAcaoTexto}>🔄 Sincronizar</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoAcao} onPress={exportar} disabled={exportando}>
          {exportando ? <ActivityIndicator color="#1f4d2c" /> : <Text style={styles.botaoAcaoTexto}>📤 Exportar</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoAcao} onPress={sair}>
          <Text style={styles.botaoAcaoTexto}>🚪 Sair</Text>
        </TouchableOpacity>
      </View>

      {carregando ? (
        <ActivityIndicator style={styles.flex} size="large" color="#1f4d2c" />
      ) : (
        <FlatList
          data={coletas}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <Text style={styles.vazio}>Nenhuma árvore registrada ainda. Toque em "+" para começar.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Coleta', { coleta: item })}>
              <View style={styles.itemTextos}>
                <Text style={styles.itemTitulo}>
                  {item.especie || item.nomePopular || 'Árvore sem espécie definida'}
                  {item.codigo ? ` · #${item.codigo}` : ''}
                </Text>
                <Text style={styles.itemSubtitulo}>
                  {item.logradouroNome || `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`}
                </Text>
              </View>
              <View style={[styles.badge, item.sincronizado ? styles.badgeSincronizado : styles.badgePendente]}>
                <Text style={styles.badgeTexto}>{item.sincronizado ? 'Sincronizado' : 'Pendente'}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Coleta', undefined)}>
        <Text style={styles.fabTexto}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  faixaStatus: { paddingVertical: 8, alignItems: 'center' },
  faixaOnline: { backgroundColor: '#dcfce7' },
  faixaOffline: { backgroundColor: '#fee2e2' },
  faixaTexto: { fontSize: 13, fontWeight: '600', color: '#374151' },
  acoes: { flexDirection: 'row', gap: 8, padding: 12 },
  botaoAcao: { flex: 1, borderWidth: 1, borderColor: '#1f4d2c', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  botaoAcaoTexto: { color: '#1f4d2c', fontWeight: '600', fontSize: 13 },
  lista: { padding: 16, paddingTop: 0, paddingBottom: 96, gap: 10 },
  vazio: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'white', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemTextos: { flex: 1, marginRight: 10 },
  itemTitulo: { fontSize: 15, fontWeight: '700', color: '#1f4d2c' },
  itemSubtitulo: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10 },
  badgeSincronizado: { backgroundColor: '#dcfce7' },
  badgePendente: { backgroundColor: '#fef3c7' },
  badgeTexto: { fontSize: 11, fontWeight: '700', color: '#374151' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1f4d2c', alignItems: 'center', justifyContent: 'center', elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  fabTexto: { color: 'white', fontSize: 30, fontWeight: '300', marginTop: -2 },
})
