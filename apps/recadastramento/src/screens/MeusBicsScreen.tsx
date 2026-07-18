import { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useNetInfo } from '@react-native-community/netinfo'
import { useFocusEffect } from '@react-navigation/native'
import JSZip from 'jszip'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { supabase, STORAGE_BUCKET } from '../lib/supabase'
import { listarBics, salvarBic, removerBic, type BicColetado } from '../lib/bics'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'MeusBics'>

const RECARTULO_SITUACAO: Record<string, string> = {
  visitado: '#f59e0b',
  recadastrado: '#16a34a',
  impedido: '#dc2626',
}

// Lista de BICs coletados (req 178), com manutenção — edição/remoção (req 179),
// sincronização com o SIG WEB (req 177/181) e backup em ZIP com fotos/croquis/documentos (req 176)
export function MeusBicsScreen({ navigation }: Props) {
  const netInfo = useNetInfo()
  const [bics, setBics] = useState<BicColetado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [exportando, setExportando] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true)
    listarBics().then(setBics).finally(() => setCarregando(false))
  }, [])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  async function enviarFoto(uri: string): Promise<string> {
    if (uri.startsWith('http')) return uri
    const arrayBuffer = await new File(uri).arrayBuffer()
    const caminho = `bics/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
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
      const pendentes = (await listarBics()).filter((b) => !b.sincronizado)
      for (const bic of pendentes) {
        const fotoUrls = await Promise.all(bic.fotos.map(enviarFoto))
        const corpo = {
          parcelaId: bic.parcelaId,
          situacaoRecadastramento: bic.situacaoRecadastramento,
          areaTerreno: bic.areaTerreno,
          areaEdificada: bic.areaEdificada,
          numeroPavimentos: bic.numeroPavimentos,
          tipologiaConstrutiva: bic.tipologiaConstrutiva,
          estadoConservacao: bic.estadoConservacao,
          numeroPredial: bic.numeroPredial,
          observacoes: bic.observacoes,
          fotoUrls,
          latitudeColeta: bic.latitudeColeta,
          longitudeColeta: bic.longitudeColeta,
          coletadoEm: bic.criadoEm,
        }
        if (bic.remoteId) {
          await api.patch(`/mobile/bics/${bic.remoteId}`, corpo)
          await salvarBic({ ...bic, fotos: fotoUrls, sincronizado: true })
        } else {
          const { data } = await api.post('/mobile/bics', [corpo])
          await salvarBic({ ...bic, fotos: fotoUrls, remoteId: data.ids[0], sincronizado: true })
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

  async function exportarZip() {
    setExportando(true)
    try {
      const dados = await listarBics()
      const zip = new JSZip()
      zip.file('bics.json', JSON.stringify(dados, null, 2))
      for (const bic of dados) {
        for (let i = 0; i < bic.fotos.length; i++) {
          const uri = bic.fotos[i]
          try {
            const resposta = await fetch(uri)
            const buffer = await resposta.arrayBuffer()
            zip.file(`fotos/${bic.localId}_${i}.jpg`, buffer)
          } catch {
            // ignora arquivo que não pôde ser lido (ex.: já removido do cache local)
          }
        }
      }
      const conteudo = await zip.generateAsync({ type: 'uint8array' })
      const arquivo = new File(Paths.document, `bics_${Date.now()}.zip`)
      arquivo.write(conteudo)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(arquivo.uri, { mimeType: 'application/zip', dialogTitle: 'Exportar BICs (backup)' })
      } else {
        Alert.alert('Exportação concluída', `Arquivo salvo em: ${arquivo.uri}`)
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível gerar o backup em ZIP.')
    } finally {
      setExportando(false)
    }
  }

  function remover(bic: BicColetado) {
    Alert.alert('Remover BIC', `Remover o registro do lote ${bic.parcelaCodigo ?? ''}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          if (bic.remoteId) {
            try { await api.delete(`/mobile/bics/${bic.remoteId}`) } catch { /* remove localmente mesmo sem conexão */ }
          }
          await removerBic(bic.localId)
          carregar()
        },
      },
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
          {sincronizando ? <ActivityIndicator color="#7c3f1d" /> : <Text style={styles.botaoAcaoTexto}>🔄 Sincronizar</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoAcao} onPress={exportarZip} disabled={exportando}>
          {exportando ? <ActivityIndicator color="#7c3f1d" /> : <Text style={styles.botaoAcaoTexto}>📦 Exportar ZIP</Text>}
        </TouchableOpacity>
      </View>

      {carregando ? (
        <ActivityIndicator style={styles.flex} size="large" color="#7c3f1d" />
      ) : (
        <FlatList
          data={bics}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <Text style={styles.vazio}>Nenhum BIC coletado ainda. Selecione um lote para começar.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => navigation.navigate('Bic', { bic: item })}
              onLongPress={() => remover(item)}
            >
              <View style={styles.itemTextos}>
                <Text style={styles.itemTitulo}>
                  Lote {item.parcelaCodigo ?? '—'}{item.loteamentoNome ? ` · ${item.loteamentoNome}` : ''}
                </Text>
                <Text style={styles.itemSubtitulo}>
                  {item.numeroPredial ? `Nº ${item.numeroPredial} · ` : ''}{new Date(item.criadoEm).toLocaleDateString('pt-BR')}
                </Text>
              </View>
              <View style={styles.coluna}>
                <View style={[styles.badge, { backgroundColor: `${RECARTULO_SITUACAO[item.situacaoRecadastramento]}33` }]}>
                  <Text style={[styles.badgeTexto, { color: RECARTULO_SITUACAO[item.situacaoRecadastramento] }]}>
                    {item.situacaoRecadastramento}
                  </Text>
                </View>
                <View style={[styles.badge, item.sincronizado ? styles.badgeSincronizado : styles.badgePendente]}>
                  <Text style={styles.badgeTexto}>{item.sincronizado ? 'Sincronizado' : 'Pendente'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <Text style={styles.dicaToque}>Toque para editar · toque e segure para remover</Text>
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
  botaoAcao: { flex: 1, borderWidth: 1, borderColor: '#7c3f1d', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  botaoAcaoTexto: { color: '#7c3f1d', fontWeight: '600', fontSize: 13 },
  lista: { padding: 16, paddingTop: 0, gap: 10 },
  vazio: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'white', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemTextos: { flex: 1, marginRight: 10 },
  itemTitulo: { fontSize: 15, fontWeight: '700', color: '#7c3f1d' },
  itemSubtitulo: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  coluna: { gap: 6, alignItems: 'flex-end' },
  badge: { borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  badgeSincronizado: { backgroundColor: '#dcfce7' },
  badgePendente: { backgroundColor: '#fef3c7' },
  badgeTexto: { fontSize: 11, fontWeight: '700', color: '#374151', textTransform: 'capitalize' },
  dicaToque: { textAlign: 'center', color: '#9ca3af', fontSize: 12, paddingBottom: 14 },
})
