import { useCallback, useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'
import { useNetInfo } from '@react-native-community/netinfo'
import { useFocusEffect } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { listarBics, type BicColetado } from '../lib/bics'
import { lerCacheLoteamentos, salvarCacheLoteamentos, type Loteamento } from '../lib/cache'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'Loteamentos'>

// Lista de loteamentos para iniciar a coleta — req 170. Cacheada localmente para uso offline (req 175)
export function LoteamentosScreen({ navigation }: Props) {
  const netInfo = useNetInfo()
  const [loteamentos, setLoteamentos] = useState<Loteamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pendentes, setPendentes] = useState(0)

  const { data, isFetching } = useQuery<Loteamento[]>({
    queryKey: ['loteamentos'],
    queryFn: () => api.get('/mobile/loteamentos').then((r) => r.data),
    enabled: !!netInfo.isConnected,
  })

  useEffect(() => {
    if (data) {
      setLoteamentos(data)
      setCarregando(false)
      salvarCacheLoteamentos(data)
    }
  }, [data])

  useEffect(() => {
    if (!netInfo.isConnected) {
      lerCacheLoteamentos().then((cache) => { setLoteamentos(cache); setCarregando(false) })
    }
  }, [netInfo.isConnected])

  useFocusEffect(useCallback(() => {
    listarBics().then((bics: BicColetado[]) => setPendentes(bics.filter((b) => !b.sincronizado).length))
  }, []))

  function sair() {
    supabase.auth.signOut()
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.faixaStatus, netInfo.isConnected ? styles.faixaOnline : styles.faixaOffline]}>
        <Text style={styles.faixaTexto}>
          {netInfo.isConnected ? '🟢 Online' : '🔴 Offline — exibindo loteamentos salvos no aparelho'}
        </Text>
      </View>

      <View style={styles.acoes}>
        <TouchableOpacity style={styles.botaoAcao} onPress={() => navigation.navigate('MeusBics')}>
          <Text style={styles.botaoAcaoTexto}>📋 Meus BICs{pendentes > 0 ? ` (${pendentes} pendente${pendentes > 1 ? 's' : ''})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoAcao} onPress={sair}>
          <Text style={styles.botaoAcaoTexto}>🚪 Sair</Text>
        </TouchableOpacity>
      </View>

      {carregando || isFetching && loteamentos.length === 0 ? (
        <ActivityIndicator style={styles.flex} size="large" color="#7c3f1d" />
      ) : (
        <FlatList
          data={loteamentos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={<Text style={styles.vazio}>Nenhum loteamento disponível.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => navigation.navigate('Lotes', { loteamentoId: item.id, loteamentoNome: item.nome })}
            >
              <Text style={styles.itemTitulo}>{item.nome}</Text>
              {item.decreto && <Text style={styles.itemSubtitulo}>Decreto {item.decreto}</Text>}
            </TouchableOpacity>
          )}
        />
      )}
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
  item: { backgroundColor: 'white', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  itemTitulo: { fontSize: 15, fontWeight: '700', color: '#7c3f1d' },
  itemSubtitulo: { fontSize: 13, color: '#6b7280', marginTop: 2 },
})
