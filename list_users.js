const url = "https://supabase.viaautom.com.br/rest/v1/usuarios?select=*"
const headers = {
  "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODQzODg4NjIsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.gXwD_cMCmGWJIlkHpwk8dPf5-Bu1stQt4vT4yJXTnNg",
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODQzODg4NjIsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.gXwD_cMCmGWJIlkHpwk8dPf5-Bu1stQt4vT4yJXTnNg"
}

fetch(url, { headers })
  .then(res => res.json())
  .then(data => {
    console.table(data.map(u => ({ nome: u.nome, email: u.email, perfil: u.perfil, cpf: u.cpf, ativo: u.ativo })))
  })
  .catch(console.error)
