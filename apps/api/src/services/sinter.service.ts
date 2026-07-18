import { query } from '../db/pool'
import { uploadFile } from './supabase.service'

const CODIGO_IBGE = '4322301' // Tupanciretã – RS (IBGE)

export interface ParcelaSinterRow {
  id: string
  codigo: string | null
  inscricao_imobiliaria: string | null
  area_m2: number | null
  numero_predial: string | null
  logradouro_nome: string | null
  bairro_nome: string | null
  cep: string | null
  wkt: string | null
  proprietario_cpf: string | null
  proprietario_nome: string | null
}

export async function extrairParcelasSinter(
  tipo: 'teste' | 'incremental' | 'completo'
): Promise<ParcelaSinterRow[]> {
  const whereIncremental = tipo === 'incremental'
    ? `AND (ps.status IS NULL OR ps.status IN ('pendente','rejeitada','erro'))`
    : ''
  const limitSql = tipo === 'teste' ? 'LIMIT 100' : ''

  return query<ParcelaSinterRow>(`
    SELECT
      p.id,
      p.codigo,
      p.inscricao_imobiliaria,
      p.area_m2,
      p.numero_predial,
      l.nome  AS logradouro_nome,
      b.nome  AS bairro_nome,
      l.cep,
      ST_AsText(ST_Transform(p.geometry, 4674)) AS wkt,
      (SELECT pe.cpf_cnpj FROM sigweb.edificacoes e2
         JOIN sigweb.pessoas pe ON pe.id = e2.proprietario_id
        WHERE e2.parcela_id = p.id AND e2.proprietario_id IS NOT NULL
        LIMIT 1) AS proprietario_cpf,
      (SELECT pe.nome FROM sigweb.edificacoes e2
         JOIN sigweb.pessoas pe ON pe.id = e2.proprietario_id
        WHERE e2.parcela_id = p.id AND e2.proprietario_id IS NOT NULL
        LIMIT 1) AS proprietario_nome
    FROM sigweb.parcelas p
    LEFT JOIN sigweb.logradouros l  ON l.id = p.logradouro_id
    LEFT JOIN sigweb.bairros    b   ON b.id = p.bairro_id
    LEFT JOIN sigweb.parcelas_sinter ps ON ps.parcela_id = p.id
    WHERE p.geometry IS NOT NULL
    ${whereIncremental}
    ORDER BY p.codigo
    ${limitSql}
  `)
}

function esc(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function gerarXmlSinter(
  parcelas: ParcelaSinterRow[],
  tipo: 'teste' | 'incremental' | 'completo',
  numeroLote: number
): string {
  const agora = new Date().toISOString().slice(0, 19)
  const tipoChar = tipo === 'completo' ? 'C' : tipo === 'incremental' ? 'I' : 'T'

  const blocos = parcelas.map(p => {
    const geometria = p.wkt
      ? `\n      <Geometria SRID="4674"><WKT>${esc(p.wkt)}</WKT></Geometria>`
      : ''

    const proprietarios = p.proprietario_cpf
      ? `\n      <Proprietarios>\n        <Proprietario>\n          <CPF_CNPJ>${esc(p.proprietario_cpf.replace(/\D/g, ''))}</CPF_CNPJ>\n          <Nome>${esc(p.proprietario_nome)}</Nome>\n          <FracaoIdeal>1.00</FracaoIdeal>\n          <Participacao>PROPRIETARIO</Participacao>\n        </Proprietario>\n      </Proprietarios>`
      : '\n      <Proprietarios/>'

    return `
    <Imovel>
      <CodigoCadastral>${esc(p.codigo)}</CodigoCadastral>
      <InscricaoImobiliaria>${esc(p.inscricao_imobiliaria)}</InscricaoImobiliaria>
      <TipoImovel>U</TipoImovel>
      <Situacao>A</Situacao>
      <AreaTotal>${(p.area_m2 ?? 0).toFixed(2)}</AreaTotal>
      <Logradouro>${esc(p.logradouro_nome)}</Logradouro>
      <Numero>${esc(p.numero_predial)}</Numero>
      <Bairro>${esc(p.bairro_nome)}</Bairro>
      <CEP>${esc(p.cep?.replace(/\D/g, ''))}</CEP>${geometria}${proprietarios}
    </Imovel>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<SINTER xmlns="http://www.receita.fazenda.gov.br/sinter/schema" versao="2.0">
  <Cabecalho>
    <CodigoIBGE>${CODIGO_IBGE}</CodigoIBGE>
    <TipoEnvio>${tipoChar}</TipoEnvio>
    <DataGeracao>${agora}</DataGeracao>
    <NumeroLote>${numeroLote}</NumeroLote>
    <TotalRegistros>${parcelas.length}</TotalRegistros>
  </Cabecalho>
  <Imoveis>${blocos}
  </Imoveis>
</SINTER>`
}

export interface ErroValidacao {
  id: string
  codigo: string | null
  erros: string[]
}

export function validarLote(parcelas: ParcelaSinterRow[]): {
  validas: ParcelaSinterRow[]
  erros: ErroValidacao[]
} {
  const validas: ParcelaSinterRow[] = []
  const erros: ErroValidacao[] = []

  for (const p of parcelas) {
    const problemas: string[] = []
    if (!p.codigo && !p.inscricao_imobiliaria) problemas.push('Sem código cadastral nem inscrição imobiliária')
    if (!p.wkt) problemas.push('Sem geometria cadastrada')
    if (!p.area_m2 || p.area_m2 <= 0) problemas.push('Área inválida ou ausente')

    if (problemas.length === 0) validas.push(p)
    else erros.push({ id: p.id, codigo: p.codigo, erros: problemas })
  }

  return { validas, erros }
}

export async function uploadXmlStorage(xml: string, envioId: string): Promise<string> {
  const path = `sinter/envios/${envioId}/sinter.xml`
  await uploadFile(path, Buffer.from(xml, 'utf-8'), 'application/xml')
  return path
}
