# Luuynix — IA para Roblox Studio

## 1. Chaves
- **Anthropic:** crie uma chave em console.anthropic.com (`ANTHROPIC_API_KEY`).
- **Google:** Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth (Aplicativo da Web).
  Em "Origens JavaScript autorizadas" coloque `https://seu-site.com` e `http://localhost:3000`. Copie o ID em `GOOGLE_CLIENT_ID`.

## 2. Rodar local
    cp .env.example .env   # preencha (ou exporte as variáveis)
    npm install
    node --env-file=.env server.js   # Node 20+

## 3. Publicar (Render, Railway, Fly…)
Build `npm install`, start `npm start`, cadastre as variáveis do `.env.example`.
Use um disco/volume persistente e aponte `DATA_DIR` para ele (guarda usuários e pedidos em `data.json`).

## 4. Dono e Pix
Quem entra com `OWNER_EMAIL` é dono (verificado no servidor): vê o **Painel do dono**, aprova pedidos de Pix e usa tudo.
Cliente paga → clica "Já paguei" → pedido aparece no painel → você confere no banco e aprova → Opus liberado pelo prazo do plano.

## 5. Roblox Studio
No site: **Conectar ao Roblox Studio** → baixe `Luuynix.lua` → coloque em Plugins → Pasta de plugins → reinicie o Studio → aceite a permissão HTTP.
Depois use **Enviar ao Studio** em qualquer bloco de código.

## Limite grátis
`FREE_DAILY_LIMIT` mensagens/dia por conta (Estendido conta 2, Max conta 3). Plano Opus e dono não têm limite.
