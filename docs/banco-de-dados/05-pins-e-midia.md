# Etapa 05: Pins e mídia

**Objetivo:** guardar os pins que o usuário cria (rascunhos, agendados, publicados) e os arquivos de imagem e vídeo.

> Arquivos grandes **não ficam no banco**. Ficam em armazenamento de arquivos (a definir) e o banco guarda só a referência.

## Tabela `media_assets`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `user_id` | id | sim | Dono |
| `kind` | texto (lista) | sim | `image`, `video`, `cover` (capa do vídeo) |
| `storage_key` | texto | sim | Caminho/identificador no armazenamento |
| `public_url` | texto | não | Endereço acessível ao Pinterest, se o tipo de pin usar URL de imagem |
| `mime_type` | texto | sim | Vídeo: `.mp4`, `.mov`, `.m4v` |
| `size_bytes` | número | sim | |
| `width` / `height` | número | não | |
| `duration_seconds` | número | não | Só vídeo |
| `content_hash` | texto | sim | Hash do arquivo, para achar duplicados |
| `status` | texto (lista) | sim | `uploaded`, `ready`, `failed`, `deleted` |
| `created_at` | data/hora | sim | |

## Tabela `pins`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `user_id` | id | sim | Dono |
| `pinterest_account_id` | id | sim | Conta onde vai ser publicado |
| `board_id` | id | sim | → `boards` |
| `board_section_id` | id | não | → `board_sections` |
| `media_type` | texto (lista) | sim | `image` ou `video` |
| `media_asset_id` | id | sim | Imagem ou vídeo |
| `cover_asset_id` | id | cond. | **Obrigatório para vídeo** (o Pinterest rejeita pin de vídeo sem capa) |
| `title` | texto | sim | |
| `description` | texto | não | |
| `destination_link` | texto | não | Link ao clicar no pin |
| `alt_text` | texto | não | |
| `status` | texto (lista) | sim | `draft`, `scheduled`, `publishing`, `published`, `failed`, `canceled` |
| `pinterest_pin_id` | texto | não | Preenchido após publicar |
| `pinterest_pin_url` | texto | não | |
| `batch_id` | id | não | Agrupa pins criados juntos (programação em lote) |
| `created_at` / `updated_at` | data/hora | sim | |
| `published_at` | data/hora | não | |

## Campos do vídeo (processo em 4 passos)

O envio de vídeo registra um `media_id` no Pinterest, envia o arquivo, confere o status e só então cria o pin. Guardar o andamento para poder retomar sem refazer tudo:

| Campo (em `media_assets` ou em tabela própria) | Observação |
|---|---|
| `pinterest_media_id` | ID devolvido ao registrar o upload |
| `pinterest_upload_status` | `registered`, `uploaded`, `succeeded`, `failed` |

## Regras

- **Pin de vídeo sem capa não é aceito.** Validar antes de agendar.
- **Conteúdo duplicado** (mesmo arquivo, mesmo título, mesma descrição e mesmo link) é risco de spam. Ver doc 07 (`content_fingerprints`).
- Após criar um pin de vídeo, o Pinterest pode levar alguns segundos processando e o tipo pode aparecer errado por um tempo: conferir de novo antes de dar como concluído.
- Ao publicar, o Pinterest copia o arquivo para os servidores dele. Depois disso, o arquivo local pode ser removido conforme a política de retenção.
- Apagar pin na plataforma não apaga no Pinterest, a menos que o usuário peça (e exista a permissão). Deixar isso explícito na tela.
- Limite do Pinterest: 200.000 pins por conta pessoal.

## Índices

- `pins.user_id`, `pins.pinterest_account_id`, `pins.status`
- `pins.batch_id`
- `media_assets.content_hash`
